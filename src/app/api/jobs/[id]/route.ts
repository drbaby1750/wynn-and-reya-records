import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, assertUserOwnership } from '@/lib/auth/session';
import { db } from '@/db';
import { aiJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Session Authentication Enforcement
    const sessionId = request.cookies.get('session')?.value || request.headers.get('x-session-id') || undefined;
    let user;
    try {
      user = await getAuthenticatedUser(sessionId);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 });
    }

    // 2. Query Job Record
    const jobId = params.id;
    const job = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });

    if (!job) {
      return NextResponse.json({ error: 'Not Found: Job record does not exist.' }, { status: 404 });
    }

    // 3. Strict Server-Side User Ownership Enforcement
    try {
      assertUserOwnership(job.userId, user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden: You do not have permission to view this job.' }, { status: 403 });
    }

    // 4. Return Safe Public Job Status Data
    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        attemptCount: job.attemptCount,
        aiRole: job.aiRole,
        extractedNumber: job.extractedNumber,
        result: job.resultJson ? JSON.parse(job.resultJson) : null,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (err: any) {
    console.error('Error retrieving job status:', err);
    return NextResponse.json({ error: 'Internal Server Error: Failed to retrieve job status.' }, { status: 500 });
  }
}
