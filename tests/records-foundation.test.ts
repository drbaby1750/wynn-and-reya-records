import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db, sqlite } from '../src/db';
import { users, sessions, records, deletionAudits } from '../src/db/schema';
import { getAuthenticatedUser, AuthenticationError } from '../src/lib/auth/session';
import {
  createRecordForUser,
  listRecordsForUser,
  getRecordForUser,
  deleteRecordTransaction,
  createDeletionAudit,
  RecordNotFoundError,
} from '../src/lib/records/service';
import { startQueryCounter, stopQueryCounter, resetQueryCount } from '../src/lib/db/query-counter';
import { createRecordSchema } from '../src/lib/validation/record';

describe('Assessment 4 Prompt 2: Record Data Model, Migration & Access Foundation Test Suite', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const sessionAId = crypto.randomUUID();
  const invalidSessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 3600000);

  let recordAPublicId: string;
  let recordBPublicId: string;

  beforeAll(async () => {
    // Seed test users & active session for User A
    await db.insert(users).values([
      { id: userAId, email: `usera_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashA', isVerified: true, createdAt: now },
      { id: userBId, email: `userb_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashB', isVerified: true, createdAt: now },
    ]);

    await db.insert(sessions).values([
      { id: sessionAId, userId: userAId, expiresAt },
    ]);

    // Create initial test records for User A & User B
    const recA = await createRecordForUser(userAId, {
      title: 'Wynn Record File #A1',
      description: 'Primary record for User A',
    });
    recordAPublicId = recA.publicId;

    const recB = await createRecordForUser(userBId, {
      title: 'Reya Record File #B1',
      description: 'Secondary record for User B',
    });
    recordBPublicId = recB.publicId;
  });

  it('1. Record can belong to an authenticated user', async () => {
    const user = await getAuthenticatedUser(sessionAId);
    expect(user.id).toBe(userAId);

    const record = await getRecordForUser(userAId, recordAPublicId);
    expect(record.userId).toBe(userAId);
  });

  it('2. Record cannot be created without an owner (foreign key requirement)', async () => {
    await expect(
      db.insert(records).values({
        publicId: crypto.randomUUID(),
        userId: 'invalid_non_existent_owner_id',
        title: 'Orphan Record Attempt',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toThrow();
  });

  it('3. Public identifier is generated server-side', async () => {
    const newRecord = await createRecordForUser(userAId, {
      title: 'Server Generated Public ID Record',
    });
    expect(newRecord.publicId).toBeDefined();
    expect(typeof newRecord.publicId).toBe('string');
  });

  it('4. Public identifier is unique across records', async () => {
    const rec1 = await createRecordForUser(userAId, { title: 'Record Unique 1' });
    const rec2 = await createRecordForUser(userAId, { title: 'Record Unique 2' });

    expect(rec1.publicId).not.toBe(rec2.publicId);
  });

  it('5. Raw database ID is not the public identifier', async () => {
    const record = await getRecordForUser(userAId, recordAPublicId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(record.publicId).toMatch(uuidRegex);
    expect(typeof (record as any).id).toBe('number');
    expect(record.publicId).not.toBe(String((record as any).id));
  });

  it('6. User A can query their own record', async () => {
    const record = await getRecordForUser(userAId, recordAPublicId);
    expect(record).toBeDefined();
    expect(record.title).toBe('Wynn Record File #A1');
  });

  it('7. SECURITY / IDOR TEST: User A cannot query User B record', async () => {
    // User A attempts to request User B's publicId
    await expect(getRecordForUser(userAId, recordBPublicId)).rejects.toThrow(RecordNotFoundError);
  });

  it('8. Ownership is enforced directly in database queries', async () => {
    const userARecords = await listRecordsForUser(userAId);
    const userBRecords = await listRecordsForUser(userBId);

    expect(userARecords.every((r) => r.userId === userAId)).toBe(true);
    expect(userBRecords.every((r) => r.userId === userBId)).toBe(true);
    expect(userARecords.some((r) => r.publicId === recordBPublicId)).toBe(false);
  });

  it('9. Client-supplied user ID cannot override authenticated session identity', async () => {
    // Service function requires resolved authenticated userId from server session
    const record = await createRecordForUser(userAId, {
      title: 'Session Identity Ownership Test',
    });

    expect(record.userId).toBe(userAId);
    expect(record.userId).not.toBe(userBId);
  });

  it('10. Required fields are validated (title length, trimming, non-empty)', () => {
    const valid = createRecordSchema.safeParse({
      title: '  Valid Trimmed Record Title  ',
      description: 'Valid description text',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.title).toBe('Valid Trimmed Record Title');
    }

    const invalidEmpty = createRecordSchema.safeParse({ title: '   ' });
    expect(invalidEmpty.success).toBe(false);

    const invalidOverlong = createRecordSchema.safeParse({ title: 'x'.repeat(201) });
    expect(invalidOverlong.success).toBe(false);
  });

  it('11. Audit-log model records an actor (deleted_by_user_id)', async () => {
    const audit = await createDeletionAudit(recordAPublicId, 'Test Title', userAId);
    expect(audit.deletedByUserId).toBe(userAId);
  });

  it('12. Audit-log model records an action (RECORD_DELETED)', async () => {
    const audit = await createDeletionAudit(recordAPublicId, 'Test Title', userAId);
    expect(audit.action).toBe('RECORD_DELETED');
  });

  it('13. Audit-log model can reference affected record safely (recordPublicId, recordTitle)', async () => {
    const audit = await createDeletionAudit(recordAPublicId, 'Snapshot Title', userAId);
    expect(audit.recordPublicId).toBe(recordAPublicId);
    expect(audit.recordTitle).toBe('Snapshot Title');
  });

  it('14. Audit records are not accidentally removed when the target record is deleted', async () => {
    // Create a disposable record for User A
    const disposable = await createRecordForUser(userAId, { title: 'Disposable Record' });
    
    // Execute atomic delete transaction
    const { audit } = await deleteRecordTransaction(userAId, disposable.publicId);

    // Verify record is removed from `records` table
    await expect(getRecordForUser(userAId, disposable.publicId)).rejects.toThrow(RecordNotFoundError);

    // Verify audit entry remains intact in `deletion_audits` table
    const auditRow = await db.query.deletionAudits.findFirst({
      where: (table, { eq }) => eq(table.publicId, audit.publicId),
    });
    expect(auditRow).toBeDefined();
    expect(auditRow?.recordPublicId).toBe(disposable.publicId);
  });

  it('15. Query-count instrumentation works and captures baseline measurements', async () => {
    // Baseline 1: Create Record
    startQueryCounter();
    await createRecordForUser(userAId, { title: 'Baseline Create Record' });
    const createCount = stopQueryCounter();
    expect(createCount).toBe(1);

    // Baseline 2: View / List Records
    startQueryCounter();
    await listRecordsForUser(userAId);
    const listCount = stopQueryCounter();
    expect(listCount).toBe(1);

    // Baseline 3: Get Single Record
    startQueryCounter();
    await getRecordForUser(userAId, recordAPublicId);
    const getCount = stopQueryCounter();
    expect(getCount).toBe(1);

    // Baseline 4: Atomic Delete Transaction (DELETE RETURNING + Insert Audit = 2 queries)
    const disposable = await createRecordForUser(userAId, { title: 'Baseline Delete Record' });
    startQueryCounter();
    await deleteRecordTransaction(userAId, disposable.publicId);
    const deleteCount = stopQueryCounter();
    expect(deleteCount).toBeGreaterThanOrEqual(2);
  });
});
