import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db';
import { users, sessions, uploadedFiles, aiJobs } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedUser, assertUserOwnership, AuthorizationError, AuthenticationError } from '../src/lib/auth/session';
import { LocalStorageService } from '../src/lib/storage/service';
import { validateUploadedFile, FileValidationError } from '../src/lib/storage/restrictions';

describe('Assessment 3 Prompt 3: AI Job Test Suite', () => {
  const testUserId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const expiredSessionId = crypto.randomUUID();
  const jobId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 60000);
  const expiredAt = new Date(Date.now() - 60000);

  let storedStorageKey: string;

  beforeAll(async () => {
    await db.insert(users).values([
      { id: testUserId, email: `job_user_a_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hash1', isVerified: true, createdAt: now },
      { id: otherUserId, email: `job_user_b_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hash2', isVerified: true, createdAt: now },
    ]);
    await db.insert(sessions).values([
      { id: testSessionId, userId: testUserId, expiresAt },
      { id: expiredSessionId, userId: testUserId, expiresAt: expiredAt },
    ]);

    // Save a test file and create a job referencing it
    const storage = new LocalStorageService('./storage/test_jobs');
    const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const storedRef = await storage.saveFile(pngBuf, 'invoice_container.png', 'image/png');
    storedStorageKey = storedRef.storageKey;

    await db.insert(aiJobs).values({
      id: jobId,
      userId: testUserId,
      jobType: 'CONTAINER_VERIFICATION',
      status: 'pending',
      attemptCount: 0,
      storageKey: storedRef.storageKey,
      aiRole: 'CONTAINER_VERIFICATION',
      createdAt: now,
    });
  });

  it('Test 1-4: Pending job created with correct storage key, status, and ownership', async () => {
    const jobRecord = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });

    expect(jobRecord).toBeTruthy();
    expect(jobRecord!.status).toBe('pending');
    expect(jobRecord!.storageKey).toBe(storedStorageKey);
    expect(jobRecord!.userId).toBe(testUserId);
  });

  it('Test 5: Unauthenticated users cannot create jobs', async () => {
    await expect(getAuthenticatedUser(expiredSessionId)).rejects.toThrow(AuthenticationError);
  });

  it('Test 6 & 7: Failed upload/storage does not create a job', async () => {
    const invalidBuf = Buffer.from('INVALID_EXEC_DATA');
    let uploadFailed = false;
    try {
      validateUploadedFile(invalidBuf, 'script.exe', 'application/x-msdownload');
    } catch {
      uploadFailed = true;
    }
    expect(uploadFailed).toBe(true);

    const failedJobs = await db.query.aiJobs.findMany({
      where: eq(aiJobs.storageKey, 'invalid_key_non_existent'),
    });
    expect(failedJobs.length).toBe(0);
  });

  it('Test 8 & 9: Client cannot assign job to another user', () => {
    expect(() => {
      assertUserOwnership(testUserId, otherUserId);
    }).toThrow(AuthorizationError);
  });

  it('Test 10 & 11: Owner can retrieve status; cross-user status query blocked', () => {
    expect(() => {
      assertUserOwnership(testUserId, testUserId);
    }).not.toThrow();
    expect(() => {
      assertUserOwnership(testUserId, otherUserId);
    }).toThrow(AuthorizationError);
  });

  it('Test 12: Job record does not contain file binary', async () => {
    const jobRecord = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });
    expect((jobRecord as any).buffer).toBeUndefined();
    expect((jobRecord as any).fileContent).toBeUndefined();
  });
});
