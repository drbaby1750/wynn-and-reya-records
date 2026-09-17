import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db';
import { users, sessions, uploadedFiles } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { validateUploadedFile, FileValidationError } from '../src/lib/storage/restrictions';
import { LocalStorageService, StorageServiceError } from '../src/lib/storage/service';
import { getAuthenticatedUser, assertUserOwnership, AuthorizationError, AuthenticationError } from '../src/lib/auth/session';

describe('Assessment 3 Prompt 2: Upload Test Suite', () => {
  const testUserId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const expiredSessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 60000);
  const expiredAt = new Date(Date.now() - 60000);

  beforeAll(async () => {
    await db.insert(users).values([
      { id: testUserId, email: `user_a_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hash1', isVerified: true, createdAt: now },
      { id: otherUserId, email: `user_b_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hash2', isVerified: true, createdAt: now },
    ]);
    await db.insert(sessions).values([
      { id: testSessionId, userId: testUserId, expiresAt },
      { id: expiredSessionId, userId: testUserId, expiresAt: expiredAt },
    ]);
  });

  it('Test 1: Authenticated user session resolves valid user', async () => {
    const authenticatedUser = await getAuthenticatedUser(testSessionId);
    expect(authenticatedUser.id).toBe(testUserId);
  });

  it('Test 2: Expired and missing sessions are rejected', async () => {
    await expect(getAuthenticatedUser(expiredSessionId)).rejects.toThrow(AuthenticationError);
    await expect(getAuthenticatedUser(undefined)).rejects.toThrow(AuthenticationError);
  });

  it('Test 3: Unsupported file type is rejected', () => {
    const fakeExeBuf = Buffer.from('MZ_WINDOWS_EXEC_HEADER');
    expect(() => {
      validateUploadedFile(fakeExeBuf, 'malicious.exe', 'application/x-msdownload');
    }).toThrow(FileValidationError);
  });

  it('Test 4: Oversized file is rejected', () => {
    const oversizedBuf = Buffer.alloc(11 * 1024 * 1024); // 11MB (Limit is 10MB)
    expect(() => {
      validateUploadedFile(oversizedBuf, 'large.pdf', 'application/pdf');
    }).toThrow(FileValidationError);
  });

  it('Test 5: Valid PNG with correct magic bytes is accepted', () => {
    const validPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(() => {
      validateUploadedFile(validPngHeader, 'valid_invoice.png', 'image/png');
    }).not.toThrow();
  });

  it('Test 6 & 7: Safe storage key generation and path traversal prevention', async () => {
    const storage = new LocalStorageService('./storage/test_uploads');
    const validPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const storedRef = await storage.saveFile(validPngHeader, '../../etc/secret_invoice.png', 'image/png');

    expect(storedRef.storageKey).not.toBe('../../etc/secret_invoice.png');
    expect(storedRef.storageKey).not.toContain('..');
    expect(storedRef.storageKey).toMatch(/\.png$/);

    // Cleanup
    await storage.deleteFile(storedRef.storageKey);
  });

  it('Test 8: Database stores only storage key, NOT file binary', async () => {
    const storage = new LocalStorageService('./storage/test_uploads');
    const validPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const storedRef = await storage.saveFile(validPngHeader, 'db_test_invoice.png', 'image/png');
    const fileId = crypto.randomUUID();

    await db.insert(uploadedFiles).values({
      id: fileId,
      userId: testUserId,
      originalName: storedRef.originalName,
      mimeType: storedRef.mimeType,
      sizeBytes: storedRef.sizeBytes,
      storageKey: storedRef.storageKey,
      createdAt: new Date(),
    });

    const record = await db.query.uploadedFiles.findFirst({
      where: eq(uploadedFiles.id, fileId),
    });

    expect(record).toBeTruthy();
    expect(record!.storageKey).toBe(storedRef.storageKey);
    expect((record as any).buffer).toBeUndefined();

    // Cleanup
    await storage.deleteFile(storedRef.storageKey);
  });

  it('Test 9: Cross-user file access is blocked', async () => {
    expect(() => {
      assertUserOwnership(testUserId, testUserId);
    }).not.toThrow();
    expect(() => {
      assertUserOwnership(testUserId, otherUserId);
    }).toThrow(AuthorizationError);
  });

  it('Test 10: Storage failure handled safely', async () => {
    const storage = new LocalStorageService('./storage/test_uploads');
    await expect(storage.getFile('non_existent_key_12345.png')).rejects.toThrow(StorageServiceError);
  });
});
