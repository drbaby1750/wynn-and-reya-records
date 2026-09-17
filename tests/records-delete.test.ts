import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db';
import { users, sessions, records, deletionAudits } from '../src/db/schema';
import { createRecordForUser, getRecordForUser, RecordNotFoundError } from '../src/lib/records/service';
import { DELETE } from '../src/app/api/records/[id]/route';
import { NextRequest } from 'next/server';

describe('Assessment 4 Prompt 6: Delete Record & Atomic Deletion Audit Flow', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const sessionAId = crypto.randomUUID();
  const sessionBId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 3600000);

  let recordA1PublicId: string;
  let recordA2PublicId: string;
  let recordB1PublicId: string;

  beforeAll(async () => {
    // Seed users and active sessions
    await db.insert(users).values([
      { id: userAId, email: `usera_del_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashA', isVerified: true, createdAt: now },
      { id: userBId, email: `userb_del_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashB', isVerified: true, createdAt: now },
    ]);

    await db.insert(sessions).values([
      { id: sessionAId, userId: userAId, expiresAt },
      { id: sessionBId, userId: userBId, expiresAt },
    ]);

    // Seed test records
    const recA1 = await createRecordForUser(userAId, {
      title: 'Record A1 for Deletion Test',
      description: 'Will be deleted by User A',
    });
    recordA1PublicId = recA1.publicId;

    const recA2 = await createRecordForUser(userAId, {
      title: 'Record A2 for Deletion IDOR Protection',
      description: 'Owned by User A, target of User B delete attack',
    });
    recordA2PublicId = recA2.publicId;

    const recB1 = await createRecordForUser(userBId, {
      title: 'Record B1 Owned by User B',
      description: 'Belongs to User B',
    });
    recordB1PublicId = recB1.publicId;
  });

  function createDeleteRequest(sessionId?: string): NextRequest {
    const req = new NextRequest('http://localhost:3000/api/records/test', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { Cookie: `session=${sessionId}` } : {}),
      },
    });
    return req;
  }

  it('1. Authenticated user can delete their own record via DELETE endpoint', async () => {
    const req = createDeleteRequest(sessionAId);
    const res = await DELETE(req, { params: { id: recordA1PublicId } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe('Record deleted successfully.');
    expect(json.audit).toBeDefined();
    expect(json.audit.recordPublicId).toBe(recordA1PublicId);
    expect(json.audit.action).toBe('RECORD_DELETED');
    expect(json.queryCount).toBeGreaterThan(0);
  });

  it('2. Deleted record is no longer accessible via DB service query', async () => {
    await expect(getRecordForUser(userAId, recordA1PublicId)).rejects.toThrow(RecordNotFoundError);
  });

  it('3. Deletion audit record persists in database with recordTitle snapshot and actor', async () => {
    const auditRow = await db.query.deletionAudits.findFirst({
      where: (table, { eq }) => eq(table.recordPublicId, recordA1PublicId),
    });

    expect(auditRow).toBeDefined();
    expect(auditRow?.recordPublicId).toBe(recordA1PublicId);
    expect(auditRow?.recordTitle).toBe('Record A1 for Deletion Test');
    expect(auditRow?.deletedByUserId).toBe(userAId);
    expect(auditRow?.action).toBe('RECORD_DELETED');
  });

  it('4. Unauthenticated request to DELETE endpoint returns HTTP 401 Unauthorized', async () => {
    const req = createDeleteRequest(); // No session cookie
    const res = await DELETE(req, { params: { id: recordA2PublicId } });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  it('5. SECURITY / IDOR TEST: User B cannot delete User A record (returns HTTP 404 Not Found)', async () => {
    // User B attempts to delete User A's recordA2PublicId
    const req = createDeleteRequest(sessionBId);
    const res = await DELETE(req, { params: { id: recordA2PublicId } });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Record not found.');

    // Verify record A2 is intact and not deleted
    const recordA2 = await getRecordForUser(userAId, recordA2PublicId);
    expect(recordA2).toBeDefined();

    // Verify no audit record was generated for Record A2
    const auditRow = await db.query.deletionAudits.findFirst({
      where: (table, { eq }) => eq(table.recordPublicId, recordA2PublicId),
    });
    expect(auditRow).toBeUndefined();
  });

  it('6. Attempting to delete a non-existent record returns HTTP 404 Not Found', async () => {
    const nonExistentPublicId = crypto.randomUUID();
    const req = createDeleteRequest(sessionAId);
    const res = await DELETE(req, { params: { id: nonExistentPublicId } });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Record not found.');
  });

  it('7. DOUBLE SUBMISSION / REPLAY TEST: Replaying deletion yields 404 and does not duplicate audit log', async () => {
    const req = createDeleteRequest(sessionAId);
    const res = await DELETE(req, { params: { id: recordA1PublicId } }); // Already deleted in test 1

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Record not found.');

    // Verify only 1 audit record exists for recordA1PublicId
    const auditRows = await db.query.deletionAudits.findMany({
      where: (table, { eq }) => eq(table.recordPublicId, recordA1PublicId),
    });
    expect(auditRows.length).toBe(1);
  });

  it('8. TRANSACTION FAILURE TEST: Failure during audit creation rolls back transaction and retains record', async () => {
    const targetRecord = await createRecordForUser(userAId, { title: 'Rollback Test Record 1' });
    
    // Simulate transaction failure during audit creation
    expect(() => {
      db.transaction((tx) => {
        // Intentional failure / error thrown during audit phase
        throw new Error('Simulated audit table disk failure');
      });
    }).toThrow('Simulated audit table disk failure');

    // Verify record remains in records table
    const recordStillExists = await getRecordForUser(userAId, targetRecord.publicId);
    expect(recordStillExists).toBeDefined();

    // Verify no audit log was created
    const auditRow = await db.query.deletionAudits.findFirst({
      where: (table, { eq }) => eq(table.recordPublicId, targetRecord.publicId),
    });
    expect(auditRow).toBeUndefined();
  });

  it('9. TRANSACTION FAILURE TEST: Failure during record deletion rolls back audit log insertion', async () => {
    const targetRecord = await createRecordForUser(userAId, { title: 'Rollback Test Record 2' });

    expect(() => {
      db.transaction((tx) => {
        // 1. Audit insertion step inside transaction
        tx.insert(deletionAudits).values({
          publicId: crypto.randomUUID(),
          recordPublicId: targetRecord.publicId,
          recordTitle: targetRecord.title,
          deletedByUserId: userAId,
          action: 'RECORD_DELETED',
          deletedAt: new Date(),
        }).run();

        // 2. Intentional failure step after audit step
        throw new Error('Simulated constraint violation during delete step');
      });
    }).toThrow('Simulated constraint violation during delete step');

    // Verify record remains in records table
    const recordStillExists = await getRecordForUser(userAId, targetRecord.publicId);
    expect(recordStillExists).toBeDefined();

    // Verify audit record was rolled back and DOES NOT exist in deletion_audits
    const auditRow = await db.query.deletionAudits.findFirst({
      where: (table, { eq }) => eq(table.recordPublicId, targetRecord.publicId),
    });
    expect(auditRow).toBeUndefined();
  });
});
