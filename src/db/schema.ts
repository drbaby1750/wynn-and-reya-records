import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * 1. Assessment 1 Auth Tables (Preserved strictly)
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password').notNull(),
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

/**
 * 2. Assessment 4 Records Domain Model (Wynn & Reya Records)
 */
export const records = sqliteTable('records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id').notNull().unique(), // Opaque random UUID/public identifier
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  userPublicIdx: index('records_user_public_idx').on(table.userId, table.publicId),
  userCreatedIdx: index('records_user_created_idx').on(table.userId, table.createdAt),
}));

/**
 * 3. Assessment 4 Deletion Audit Log Model
 */
export const deletionAudits = sqliteTable('deletion_audits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicId: text('public_id').notNull().unique(),
  recordPublicId: text('record_public_id').notNull(),
  recordTitle: text('record_title').notNull(),
  deletedByUserId: text('deleted_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull().default('RECORD_DELETED'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  userDeletedIdx: index('deletion_audits_user_deleted_idx').on(table.deletedByUserId, table.deletedAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type RecordItem = typeof records.$inferSelect;
export type NewRecordItem = typeof records.$inferInsert;
export type DeletionAudit = typeof deletionAudits.$inferSelect;
export type NewDeletionAudit = typeof deletionAudits.$inferInsert;
