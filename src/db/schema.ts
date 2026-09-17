import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * 1. Existing Assessment 1 Auth Tables (Preserved strictly)
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
 * 2. Assessment 3 File Storage Metadata Model
 */
export const uploadedFiles = sqliteTable('uploaded_files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: text('storage_key').notNull(), // Storage key reference (NOT binary file content)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * 3. Assessment 3 AI Job Processing Data Model
 */
export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobType: text('job_type').notNull(), // 'container_verification' | 'container_followup'
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'done' | 'failed'
  attemptCount: integer('attempt_count').notNull().default(0),
  storageKey: text('storage_key'), // File reference key in storage (NOT file binary blob)
  aiRole: text('ai_role').notNull(), // 'CONTAINER_EXTRACTION' | 'CONTAINER_VERIFICATION'
  extractedNumber: text('extracted_number'),
  resultJson: text('result_json'), // Serialized validated ContainerVerificationResult
  errorMessage: text('error_message'), // Safe internal error log
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type NewUploadedFile = typeof uploadedFiles.$inferInsert;
export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;
