import { db } from '../../db';
import { records, deletionAudits, RecordItem, DeletionAudit } from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createRecordSchema, CreateRecordInput } from '../validation/record';

export class RecordNotFoundError extends Error {
  constructor(message = 'Record not found.') {
    super(message);
    this.name = 'RecordNotFoundError';
  }
}

/**
 * 1. Create a new record scoped to authenticated user
 * Ignores any client-supplied userId; uses server session userId exclusively.
 */
export async function createRecordForUser(
  userId: string,
  input: CreateRecordInput
): Promise<RecordItem> {
  const validated = createRecordSchema.parse(input);
  const now = new Date();
  const publicId = randomUUID();

  const [newRecord] = await db
    .insert(records)
    .values({
      publicId,
      userId, // Derived exclusively from authenticated session
      title: validated.title,
      description: validated.description || null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return newRecord;
}

export const createRecord = createRecordForUser;

/**
 * 2. List records belonging strictly to authenticated user
 * Query enforces ownership at database query level (`WHERE user_id = ?`).
 */
export async function listRecordsForUser(userId: string): Promise<RecordItem[]> {
  return db
    .select()
    .from(records)
    .where(eq(records.userId, userId))
    .orderBy(desc(records.createdAt));
}

export const getUserRecords = listRecordsForUser;

/**
 * 3. Fetch single record by publicId with mandatory owner filter.
 * ENFORCES IDOR PREVENTION:
 * Query condition is `WHERE user_id = authenticatedUserId AND public_id = targetPublicId`.
 * Does NOT fetch by publicId first and check ownership in application code later.
 */
export async function getRecordForUser(
  userId: string,
  publicId: string
): Promise<RecordItem> {
  const result = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.userId, userId),
        eq(records.publicId, publicId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new RecordNotFoundError('Record not found.');
  }

  return result[0];
}

export const getRecordByPublicId = getRecordForUser;

/**
 * 4. Audit log foundation: Create deletion audit record
 */
export async function createDeletionAudit(
  recordPublicId: string,
  recordTitle: string,
  deletedByUserId: string
): Promise<DeletionAudit> {
  const now = new Date();
  const publicId = randomUUID();

  const [audit] = await db
    .insert(deletionAudits)
    .values({
      publicId,
      recordPublicId,
      recordTitle,
      deletedByUserId,
      action: 'RECORD_DELETED',
      deletedAt: now,
    })
    .returning();

  return audit;
}

/**
 * 5. Delete record transaction foundation: Atomic deletion & deletion audit entry.
 * Synchronous atomic transaction for better-sqlite3:
 * BEGIN TRANSACTION -> Create deletion audit record -> Delete record -> COMMIT / ROLLBACK on failure.
 */
export async function deleteRecordTransaction(
  userId: string,
  publicId: string
): Promise<{ success: boolean; audit: DeletionAudit }> {
  return db.transaction((tx) => {
    // 1. Delete record directly using owner-scoped query with RETURNING clause (1 query)
    const deletedRecord = tx
      .delete(records)
      .where(
        and(
          eq(records.userId, userId),
          eq(records.publicId, publicId)
        )
      )
      .returning()
      .get();

    if (!deletedRecord) {
      throw new RecordNotFoundError('Record not found or already deleted.');
    }

    // 2. Insert audit log entry using snapshot details from deleted record (1 query)
    const now = new Date();
    const auditPublicId = randomUUID();
    const audit = tx
      .insert(deletionAudits)
      .values({
        publicId: auditPublicId,
        recordPublicId: deletedRecord.publicId,
        recordTitle: deletedRecord.title,
        deletedByUserId: userId,
        action: 'RECORD_DELETED',
        deletedAt: now,
      })
      .returning()
      .get();

    return { success: true, audit };
  });
}

export const deleteRecordWithAudit = deleteRecordTransaction;
