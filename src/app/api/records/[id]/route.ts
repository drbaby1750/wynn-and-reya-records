import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { getRecordForUser, deleteRecordTransaction, RecordNotFoundError } from '@/lib/records/service';
import { startQueryCounter, stopQueryCounter, resetQueryCount } from '@/lib/db/query-counter';

type RouteParams = {
  params: {
    id: string; // Safe public UUID identifier
  };
};

/**
 * GET /api/records/[id]
 * Fetch single record details scoped strictly to the authenticated owner.
 * 
 * CONCEPTUAL QUERY:
 * SELECT * FROM records WHERE user_id = authenticatedUserId AND public_id = requestedPublicId
 * 
 * IDOR SECURITY PROTECTION:
 * The SQL query embeds `user_id = authenticatedUserId`. If User B attempts to access User A's record,
 * the query yields 0 rows, throwing RecordNotFoundError, returning HTTP 404 ("Record not found.").
 * Does NOT leak whether the record exists or belongs to another user.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const publicId = params.id;

    // 1. Session Authentication Enforcement
    const sessionId =
      request.cookies.get('session')?.value ||
      request.cookies.get('session_id')?.value ||
      request.headers.get('x-session-id') ||
      undefined;

    let user;
    try {
      user = await getAuthenticatedUser(sessionId);
    } catch (authErr) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to view record details.' },
        { status: 401 }
      );
    }

    // 2. Measure Database Query Count
    startQueryCounter();
    resetQueryCount();

    // 3. Database Query: Scoped strictly to authenticated user + public ID
    let record;
    try {
      record = await getRecordForUser(user.id, publicId);
    } catch (err) {
      if (err instanceof RecordNotFoundError) {
        // Uniform 404 response regardless of whether publicId is non-existent or belongs to another user
        return NextResponse.json(
          { error: 'Record not found.' },
          { status: 404 }
        );
      }
      throw err;
    }
    const queryCount = stopQueryCounter();

    // 4. Return safe sanitized record detail (Omit raw DB internal auto-increment ID & userId)
    return NextResponse.json(
      {
        success: true,
        record: {
          publicId: record.publicId, // Opaque UUID public identifier
          title: record.title,
          description: record.description,
          status: record.status,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
        queryCount, // Baseline = 1 query
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Unhandled record detail retrieval error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to retrieve record details.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/records/[id]
 * Atomically delete a record and record a deletion audit entry scoped strictly to owner.
 * 
 * CONCEPTUAL TRANSACTION:
 * BEGIN TRANSACTION;
 * SELECT * FROM records WHERE user_id = authenticatedUserId AND public_id = targetPublicId;
 * INSERT INTO deletion_audits (public_id, record_public_id, record_title, deleted_by_user_id, action, deleted_at) VALUES (...);
 * DELETE FROM records WHERE user_id = authenticatedUserId AND public_id = targetPublicId;
 * COMMIT;
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const publicId = params.id;

    // 1. Session Authentication Enforcement
    const sessionId =
      request.cookies.get('session')?.value ||
      request.cookies.get('session_id')?.value ||
      request.headers.get('x-session-id') ||
      undefined;

    let user;
    try {
      user = await getAuthenticatedUser(sessionId);
    } catch (authErr) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to delete record.' },
        { status: 401 }
      );
    }

    // 2. Measure Database Query Count
    startQueryCounter();
    resetQueryCount();

    // 3. Execute Atomic Deletion Transaction
    let result;
    try {
      result = await deleteRecordTransaction(user.id, publicId);
    } catch (err) {
      if (err instanceof RecordNotFoundError) {
        return NextResponse.json(
          { error: 'Record not found.' },
          { status: 404 }
        );
      }
      throw err;
    }
    const queryCount = stopQueryCounter();

    // 4. Return success with audit trail summary
    return NextResponse.json(
      {
        success: true,
        message: 'Record deleted successfully.',
        audit: {
          publicId: result.audit.publicId,
          recordPublicId: result.audit.recordPublicId,
          recordTitle: result.audit.recordTitle,
          action: result.audit.action,
          deletedAt: result.audit.deletedAt,
        },
        queryCount,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Unhandled record deletion error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to delete record.' },
      { status: 500 }
    );
  }
}

