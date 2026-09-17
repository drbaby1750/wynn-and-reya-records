import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { validateUploadedFile, FileValidationError } from '@/lib/storage/restrictions';
import { storageService } from '@/lib/storage/service';
import { db } from '@/db';
import { uploadedFiles, aiJobs } from '@/db/schema';
import { aiQueue } from '@/lib/ai/processor';

export async function POST(request: NextRequest) {
  try {
    // 1. Session Authentication Enforcement (Server-side)
    const sessionId = request.cookies.get('session')?.value || request.headers.get('x-session-id') || undefined;
    let user;
    try {
      user = await getAuthenticatedUser(sessionId);
    } catch (authErr) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to upload files.' },
        { status: 401 }
      );
    }

    // 2. Parse Multipart Form Data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'Bad Request: Missing upload file.' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'unnamed_upload.bin';
    const mimeType = file.type || 'application/octet-stream';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Server-side Security & Restriction Validation (Max size, MIME, Magic Bytes, Filename)
    try {
      validateUploadedFile(buffer, originalName, mimeType);
    } catch (valErr) {
      if (valErr instanceof FileValidationError) {
        return NextResponse.json(
          { error: valErr.message, code: valErr.code },
          { status: 400 }
        );
      }
      throw valErr;
    }

    // 4. Save File to Storage Abstraction (Generates safe opaque UUID key)
    const storedRef = await storageService.saveFile(buffer, originalName, mimeType);

    // 5. Save Metadata Record to Database (Stores storageKey reference only, NOT binary file)
    const fileId = crypto.randomUUID();
    const now = new Date();

    try {
      await db.insert(uploadedFiles).values({
        id: fileId,
        userId: user.id, // Strictly derived from authenticated session
        originalName: storedRef.originalName,
        mimeType: storedRef.mimeType,
        sizeBytes: storedRef.sizeBytes,
        storageKey: storedRef.storageKey,
        createdAt: now,
      });

      // 6. Create Pending AI Job Record
      const jobId = crypto.randomUUID();
      await db.insert(aiJobs).values({
        id: jobId,
        userId: user.id, // Strictly derived from authenticated session
        jobType: 'CONTAINER_VERIFICATION',
        status: 'pending',
        attemptCount: 0,
        storageKey: storedRef.storageKey, // Reference to stored file (NOT binary blob)
        aiRole: 'CONTAINER_VERIFICATION',
        createdAt: now,
      });

      // 7. Enqueue Job for Background AI Processing
      aiQueue.enqueue({
        jobId,
        userId: user.id,
        storageKey: storedRef.storageKey,
        mimeType: storedRef.mimeType,
      });

      // 8. Return Safe Response with Pending Job Details
      return NextResponse.json(
        {
          success: true,
          file: {
            id: fileId,
            originalName: storedRef.originalName,
            mimeType: storedRef.mimeType,
            sizeBytes: storedRef.sizeBytes,
          },
          job: {
            id: jobId,
            jobType: 'CONTAINER_VERIFICATION',
            status: 'pending',
            createdAt: now,
          },
          message: 'File uploaded successfully. AI processing job created in pending state.',
        },
        { status: 201 }
      );
    } catch (dbErr) {
      // Cleanup stored file if database job creation fails
      await storageService.deleteFile(storedRef.storageKey);
      throw dbErr;
    }
  } catch (err: any) {
    console.error('Unhandled server upload & job creation error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: Failed to process upload and create job.' },
      { status: 500 }
    );
  }
}
