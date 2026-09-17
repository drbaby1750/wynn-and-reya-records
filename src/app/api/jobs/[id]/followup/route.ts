import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, assertUserOwnership } from '@/lib/auth/session';
import { db } from '@/db';
import { aiJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { aiService, AiServiceError } from '@/lib/ai/service';
import { followupRateLimiter, RateLimitError } from '@/lib/ai/rate-limit';
import { ContainerVerificationResult } from '@/lib/ai/types';

/**
 * POST /api/jobs/[id]/followup
 * Sends a follow-up question about a completed container verification job.
 * - Enforces session authentication & ownership
 * - Applies follow-up rate limiting
 * - Only works on 'done' jobs that have a result
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Session Authentication
    const sessionId = request.cookies.get('session')?.value || request.headers.get('x-session-id') || undefined;
    let user;
    try {
      user = await getAuthenticatedUser(sessionId);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    // 2. Parse Request Body
    let body: { question?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON body.' }, { status: 400 });
    }

    const question = body.question?.trim();
    if (!question || question.length === 0) {
      return NextResponse.json({ error: 'Bad Request: A follow-up question is required.' }, { status: 400 });
    }

    if (question.length > 1000) {
      return NextResponse.json({ error: 'Bad Request: Question must be under 1000 characters.' }, { status: 400 });
    }

    // 3. Fetch Job Record
    const jobId = params.id;
    const job = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });

    if (!job) {
      return NextResponse.json({ error: 'Not Found: Job record does not exist.' }, { status: 404 });
    }

    // 4. Ownership Check
    try {
      assertUserOwnership(job.userId, user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to query this job.' }, { status: 403 });
    }

    // 5. State Guard — only completed jobs can receive follow-ups
    if (job.status !== 'done' || !job.resultJson) {
      return NextResponse.json({
        error: `Follow-up queries are only available for completed jobs. Current status: '${job.status}'.`,
      }, { status: 409 });
    }

    // 6. Rate Limit Check
    try {
      followupRateLimiter.enforce(user.id);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: err.message, retryAfterSeconds: err.retryAfterSeconds },
          { status: 429 }
        );
      }
      throw err;
    }

    // 7. Extract Verification Result from Stored JSON
    let verificationResult: ContainerVerificationResult;
    try {
      const parsed = JSON.parse(job.resultJson);
      verificationResult = parsed.stage2_verification;
      if (!verificationResult) {
        throw new Error('Missing stage2_verification in stored result');
      }
    } catch (parseErr) {
      return NextResponse.json(
        { error: 'Internal Error: Could not parse stored verification result.' },
        { status: 500 }
      );
    }

    // 8. Execute AI Follow-up
    try {
      const followupResult = await aiService.processFollowup(verificationResult, question);

      return NextResponse.json({
        success: true,
        followup: {
          jobId,
          question,
          answer: followupResult.answer,
          suggestedNextSteps: followupResult.suggestedNextSteps,
          additionalWarnings: followupResult.additionalWarnings,
        },
      });
    } catch (aiErr: any) {
      const safeMessage = aiErr instanceof AiServiceError
        ? `${aiErr.code}: ${aiErr.message}`
        : 'An unexpected error occurred during follow-up processing.';

      console.error(`AI follow-up failed for job ${jobId}:`, aiErr);

      return NextResponse.json({
        success: false,
        error: safeMessage,
      }, { status: 502 });
    }
  } catch (err: any) {
    console.error('Unhandled error in follow-up route:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to process follow-up.' },
      { status: 500 }
    );
  }
}
