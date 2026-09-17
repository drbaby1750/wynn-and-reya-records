import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, assertUserOwnership } from '@/lib/auth/session';
import { db } from '@/db';
import { aiJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { aiQueue } from '@/lib/ai/processor';
import { processingRateLimiter, RateLimitError } from '@/lib/ai/rate-limit';

/**
 * POST /api/jobs/[id]/process
 * Re-enqueues a pending or failed AI job to the background worker.
 * - Enforces session authentication & ownership
 * - Applies server-side rate limiting
 * - Non-blocking: returns job in 'pending' or 'processing' state to client immediately
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

    // 2. Fetch Job Record
    const jobId = params.id;
    const job = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });

    if (!job) {
      return NextResponse.json({ error: 'Not Found: Job record does not exist.' }, { status: 404 });
    }

    // 3. Ownership Check
    try {
      assertUserOwnership(job.userId, user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to process this job.' }, { status: 403 });
    }

    // 4. State Guard — allow pending or failed jobs to be enqueued
    if (job.status !== 'pending' && job.status !== 'failed') {
      return NextResponse.json({
        error: `Job is already '${job.status}'. Only pending or failed jobs can be processed.`,
        job: { id: job.id, status: job.status },
      }, { status: 409 });
    }

    // 5. Rate Limit Check
    try {
      processingRateLimiter.enforce(user.id);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: err.message, retryAfterSeconds: err.retryAfterSeconds },
          { status: 429 }
        );
      }
      throw err;
    }

    // 6. Reset job to 'pending' state on DB if retrying from failed
    await db.update(aiJobs)
      .set({
        status: 'pending',
        errorMessage: null,
      })
      .where(eq(aiJobs.id, jobId));

    // 7. Enqueue to background worker (non-blocking)
    if (job.storageKey) {
      aiQueue.enqueue({
        jobId: job.id,
        userId: user.id,
        storageKey: job.storageKey,
        mimeType: job.storageKey.endsWith('.pdf') ? 'application/pdf' : 'image/png',
      });
    }

    return NextResponse.json({
      success: true,
      job: {
        id: jobId,
        status: 'pending',
      },
      message: 'Job enqueued for background AI processing.',
    });
  } catch (err: any) {
    console.error('Unhandled error in job processing route:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to process job.' },
      { status: 500 }
    );
  }
}
