import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, assertUserOwnership } from '@/lib/auth/session';
import { db } from '@/db';
import { uploadedFiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { storageService } from '@/lib/storage/service';

export async function GET(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Query File Record
    const fileId = params.id;
    const fileRecord = await db.query.uploadedFiles.findFirst({
      where: eq(uploadedFiles.id, fileId),
    });

    if (!fileRecord) {
      return NextResponse.json({ error: 'File record not found' }, { status: 404 });
    }

    // 3. Strict Server-Side User Ownership Enforcement
    try {
      assertUserOwnership(fileRecord.userId, user.id);
    } catch (authzErr) {
      return NextResponse.json({ error: 'Forbidden: You do not own this file.' }, { status: 403 });
    }

    // 4. Retrieve File Binary from Storage Abstraction
    const buffer = await storageService.getFile(fileRecord.storageKey);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': fileRecord.mimeType,
        'Content-Disposition': `inline; filename="${fileRecord.originalName}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 });
  }
}
