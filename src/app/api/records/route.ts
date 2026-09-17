import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { createRecordForUser, listRecordsForUser } from '@/lib/records/service';
import { createRecordSchema } from '@/lib/validation/record';
import { startQueryCounter, stopQueryCounter, resetQueryCount } from '@/lib/db/query-counter';

/**
 * GET /api/records
 * Retrieve list of records owned strictly by the authenticated user.
 * 
 * CONCEPTUAL QUERY:
 * SELECT * FROM records WHERE user_id = authenticatedUserId ORDER BY created_at DESC
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Session Authentication Enforcement (Server-side identity derivation)
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
        { error: 'Unauthorized: Authentication required to view records.' },
        { status: 401 }
      );
    }

    // 2. Measure Database Query Count for Record Listing
    startQueryCounter();
    resetQueryCount();

    // 3. Query Database: Scoped strictly to authenticated user's ID
    const userRecords = await listRecordsForUser(user.id);
    const queryCount = stopQueryCounter();

    // 4. Sanitize response objects (Hide internal auto-increment ID and internal FKs)
    const sanitizedRecords = userRecords.map((r) => ({
      publicId: r.publicId, // Opaque UUID public identifier
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json(
      {
        success: true,
        records: sanitizedRecords,
        queryCount, // Baseline = 1 query
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Unhandled list records error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to retrieve records list.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/records
 * Create a new record scoped exclusively to the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Session Authentication Enforcement (Server-side identity derivation)
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
        { error: 'Unauthorized: Authentication required to create records.' },
        { status: 401 }
      );
    }

    // 2. Parse payload safely
    let body: any = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Bad Request: Malformed or invalid JSON payload.' },
          { status: 400 }
        );
      }
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = {
        title: formData.get('title'),
        description: formData.get('description'),
      };
    } else {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Bad Request: Malformed payload.' },
          { status: 400 }
        );
      }
    }

    // 3. Server-side Validation
    const validationResult = createRecordSchema.safeParse(body);
    if (!validationResult.success) {
      const formattedErrors = validationResult.error.flatten().fieldErrors;
      return NextResponse.json(
        {
          error: 'Validation failed: Invalid record input.',
          details: formattedErrors,
        },
        { status: 400 }
      );
    }

    // 4. Measure Database Query Count for Creation
    startQueryCounter();
    resetQueryCount();

    // 5. Create record belonging to authenticated user
    const newRecord = await createRecordForUser(user.id, validationResult.data);
    const queryCount = stopQueryCounter();

    // 6. Return 201 Created Response with safe public identifier
    return NextResponse.json(
      {
        success: true,
        record: {
          publicId: newRecord.publicId, // Safe opaque UUID identifier
          title: newRecord.title,
          description: newRecord.description,
          status: newRecord.status,
          createdAt: newRecord.createdAt,
          updatedAt: newRecord.updatedAt,
        },
        queryCount, // Measured query count (Baseline = 1)
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Unhandled record creation error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to create record.' },
      { status: 500 }
    );
  }
}
