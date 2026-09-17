# Wynn & Reya Records — Engineering Documentation
## Assessment 4: Records and Access Slice

---

# 1. What This Is

This project implements **Assessment 4: Records and Access Slice** for **Wynn & Reya Records**.

### Core Functionality
- **Authenticated Record Creation:** Authenticated users can create new records with a validated title and optional description.
- **Ownership-Scoped List & Detail View:** Users can view a list of records that belong exclusively to them, or inspect single record details via a safe public UUID identifier.
- **Atomic Deletion & Audit Logging:** Users can delete their own records after confirming via a dedicated confirmation screen. The deletion and creation of an audit log snapshot occur within an atomic database transaction.
- **Genuine Empty State:** Displays a custom, accessible empty state UI when a user has zero records.

### Core Access-Control Problem Demonstrated
Preventing **Insecure Direct Object Reference (IDOR)** vulnerabilities by enforcing user ownership directly inside every database query (`WHERE user_id = authenticatedUserId AND public_id = targetPublicId`).

### What Is Intentionally Excluded
- Marketing and landing pages.
- Public file storage or attachment uploading.
- Multi-tenant record sharing or team roles.
- Text search engines and filter panels.
- Profile editing and social feeds.

---

# 2. How To Run It

### 1. Prerequisites
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains:
```env
DATABASE_URL="file:./sqlite.db"
AUTH_SECRET="dev-secret-wynn-reya-records-key-123456789"
```

### 4. Database Setup & Initialization
```bash
npx drizzle-kit push
```

### 5. Running Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Test Suite & Typecheck
```bash
npm run typecheck
npm test
```

---

# 3. The Flow, Step By Step

### Authorized Flow (User A)
1. **Authentication:** User A signs in or authenticates a demo session (`POST /api/auth/demo-session`). The server sets an HTTP cookie containing the session ID.
2. **Records List Navigation:** User A opens `/records`. The server reads the session cookie, resolves User A's identity, and queries `SELECT * FROM records WHERE user_id = 'userA_id' ORDER BY created_at DESC`.
3. **Genuine Empty State:** If User A has 0 records, the UI renders the genuine empty state ("No records yet").
4. **Create Record:** User A fills out the form at `/records/new`. The server validates input using Zod (`createRecordSchema`) and inserts the record with `user_id = 'userA_id'` and a server-generated random `public_id` UUID.
5. **List Updated:** User A is redirected to `/records` or `/records/[publicId]`. The new record appears in User A's list.
6. **Detail View:** User A opens `/records/[publicId]`. The server executes `SELECT * FROM records WHERE user_id = 'userA_id' AND public_id = 'publicId'`. The record details render cleanly.
7. **Delete Confirmation:** User A clicks "Delete Record" and is routed to `/records/[publicId]/delete`. The UI displays record details and a warning prompt.
8. **Atomic Deletion:** User A clicks "Yes, Delete Record". The server executes `DELETE FROM records WHERE user_id = 'userA_id' AND public_id = 'publicId' RETURNING *` and inserts a snapshot into `deletion_audits` inside a single atomic SQLite transaction.
9. **Redirect & Verification:** User A is redirected to `/records`. The record is gone. Direct access to `/records/[publicId]` returns a uniform `404 Not Found` response. The audit log retains the deletion entry.

### Unauthorized Cross-User Flow (User B -> Record A)
1. User B signs in and obtains a valid session cookie.
2. User B attempts to access `GET /api/records/[recordAPublicId]` or `DELETE /api/records/[recordAPublicId]`.
3. The server executes `WHERE user_id = 'userB_id' AND public_id = 'recordAPublicId'`.
4. The database query yields 0 rows. The server throws `RecordNotFoundError` and returns `404 Not Found` (`{ error: "Record not found." }`).
5. **Security Result:** Record A is NOT exposed, Record A is NOT deleted, and 0 audit logs are created for User B.

---

# 4. The Data Model

### 1. `users`
- `id` (TEXT PK): Internal user UUID.
- `email` (TEXT UNIQUE NOT NULL): User email address.
- `hashed_password` (TEXT NOT NULL): Hashed authentication secret.
- `is_verified` (INTEGER NOT NULL): Account verification status flag.
- `created_at` (INTEGER NOT NULL): Account creation timestamp.

### 2. `sessions`
- `id` (TEXT PK): Random session token string.
- `user_id` (TEXT FK -> `users.id` ON DELETE CASCADE): Foreign key referencing the session owner.
- `expires_at` (INTEGER NOT NULL): Session expiration timestamp.

### 3. `records`
- `id` (INTEGER PK AUTOINCREMENT): Internal SQLite sequential primary key (never exposed over API/UI).
- `public_id` (TEXT UNIQUE NOT NULL): Safe random UUID public identifier used in URLs and API parameters.
- `user_id` (TEXT FK -> `users.id` ON DELETE CASCADE): Owner user ID.
- `title` (TEXT NOT NULL): Record title (1-200 characters).
- `description` (TEXT): Optional record context notes (0-1000 characters).
- `status` (TEXT NOT NULL DEFAULT 'active'): Record status.
- `created_at` (INTEGER NOT NULL): Record creation timestamp.
- `updated_at` (INTEGER NOT NULL): Record last updated timestamp.
- **Indexes:**
  - `records_user_public_idx` on `(user_id, public_id)`
  - `records_user_created_idx` on `(user_id, created_at)`

### 4. `deletion_audits`
- `id` (INTEGER PK AUTOINCREMENT): Internal sequential primary key.
- `public_id` (TEXT UNIQUE NOT NULL): Audit entry UUID.
- `record_public_id` (TEXT NOT NULL): Public UUID snapshot of the deleted record.
- `record_title` (TEXT NOT NULL): Title snapshot of the deleted record.
- `deleted_by_user_id` (TEXT FK -> `users.id` ON DELETE CASCADE): User ID of the actor who executed deletion.
- `action` (TEXT NOT NULL DEFAULT 'RECORD_DELETED'): Action identifier.
- `deleted_at` (INTEGER NOT NULL): Deletion timestamp.
- **Indexes:**
  - `deletion_audits_user_deleted_idx` on `(deleted_by_user_id, deleted_at)`

### Audit Retention Strategy
`deletion_audits` stores `record_public_id` and `record_title` as independent string columns. It does NOT use a foreign key referencing `records.id`. When a record is deleted from the `records` table, the audit entry in `deletion_audits` remains intact permanently.

---

# 5. The Concepts

### 1. Authentication vs Authorization
- **What is it?** Authentication identifies *who* a user is (session validation). Authorization determines *what* an authenticated user is permitted to access (ownership scoping).
- **Why is it needed?** Authenticating a user does not automatically prevent them from reading or deleting another user's private records.
- **How did I implement it?** Authentication is handled by `getAuthenticatedUser()`, which resolves the session cookie. Authorization is enforced by appending `WHERE user_id = authenticatedUserId` directly to every database query.
- **What did I choose against and why?** Rejected checking ownership in application code post-fetch, because fetching data before checking ownership risks leaking existence and causing race conditions.

### 2. Query Scoping
- **What is it?** Including ownership conditions (`user_id = ?`) inside the SQL `WHERE` clause.
- **Why is it needed?** Ensures the database engine itself filters unauthorized rows before data is returned to application memory.
- **How did I implement it?** Used Drizzle ORM `and(eq(records.userId, userId), eq(records.publicId, publicId))` across service methods.
- **What did I choose against and why?** Rejected executing `db.select().where(eq(records.publicId, id))` followed by `if (record.userId !== user.id)` in JS, because post-fetch filtering is vulnerable to timing attacks and memory leaks.

### 3. IDOR (Insecure Direct Object Reference)
- **What is it?** A vulnerability where an attacker manipulates a record identifier in a URL or API call to access unauthorized resources.
- **Why is it needed?** Attackers frequently alter IDs in requests (`/api/records/rec-123` -> `/api/records/rec-124`).
- **How did I implement it?** Combined non-sequential UUID public IDs with strict SQL ownership filtering.
- **What did I choose against and why?** Rejected returning `403 Forbidden` messages like "Record belongs to another user", choosing instead a uniform `404 Not Found` to conceal record existence.

### 4. Public / Opaque Identifiers
- **What is it?** Using random UUID v4 strings (`publicId`) for external exposure while keeping sequential integer primary keys (`id`) internal.
- **Why is it needed?** Sequential IDs (1, 2, 3...) allow attackers to enumerate total record counts and guess valid resource endpoints.
- **How did I implement it?** Generated `randomUUID()` on record creation; exposed only `publicId` in URLs and JSON responses.
- **What did I choose against and why?** Rejected exposing internal auto-increment primary keys to clients.

### 5. Ownership
- **What is it?** Establishing a strict binding between a record and its creator (`userId`).
- **Why is it needed?** Defines data boundaries in multi-user applications.
- **How did I implement it?** Derived `userId` exclusively from the authenticated session token; rejected client-submitted user IDs.
- **What did I choose against and why?** Rejected trusting client body parameters like `{ userId: "user_abc" }`.

### 6. Database Constraints & Foreign Keys
- **What is it?** Schema-level rules enforcing column nullability, unique values, and relational referential integrity.
- **Why is it needed?** Prevents orphan records, corrupt data states, and invalid user assignments.
- **How did I implement it?** Defined `notNull()`, `unique()`, and `references(() => users.id, { onDelete: 'cascade' })` in schema.
- **What did I choose against and why?** Rejected relying solely on application-level validation for data integrity.

### 7. Audit Logging
- **What is it?** Creating an immutable record of sensitive system actions (e.g., record deletions).
- **Why is it needed?** Provides accountability, compliance tracking, and security auditing.
- **How did I implement it?** Created `deletion_audits` table storing snapshot details (`recordPublicId`, `recordTitle`, `deletedByUserId`, `deletedAt`).
- **What did I choose against and why?** Rejected soft-deleting records in the main table without a dedicated audit trail.

### 8. Database Transactions
- **What is it?** Wrapping multiple database operations in an all-or-nothing execution block.
- **Why is it needed?** Ensures database consistency if an error occurs mid-operation.
- **How did I implement it?** Used `db.transaction((tx) => ...)` to combine record deletion and audit log creation.
- **What did I choose against and why?** Rejected executing delete and audit log queries in separate un-transactioned statements.

### 9. Page Architecture
- **What is it?** Structure of Next.js App Router pages (`/records`, `/records/new`, `/records/[id]`, `/records/[id]/delete`).
- **Why is it needed?** Provides intuitive navigation, shallow state transitions, and accessible user flows.
- **How did I implement it?** Built clean React client pages with structured CSS token styling.
- **What did I choose against and why?** Rejected single-page modal overlays for deletion in favor of explicit confirmation URLs.

### 10. URL State
- **What is it?** Reflecting resource state and location directly in browser address bars.
- **Why is it needed?** Enables bookmarking, direct navigation, page refreshes, and standard browser back/forward controls.
- **How did I implement it?** Mapped records to public UUID routes (`/records/[publicId]`).
- **What did I choose against and why?** Rejected storing active record IDs purely in transient React component state.

### 11. 401 vs 403 vs 404
- **What is it?** HTTP status code semantics for authentication and authorization failures.
- **Why is it needed?** Communicates accurate error states without leaking sensitive system information.
- **How did I implement it?**
  - `401 Unauthorized`: Unauthenticated request.
  - `404 Not Found`: Non-existent or unauthorized record.
- **What did I choose against and why?** Rejected returning `403 Forbidden` for unauthorized record access to avoid revealing record existence.

### 12. Database Indexing
- **What is it?** B-Tree data structures accelerating table search queries.
- **Why is it needed?** Prevents full table scans on growing datasets.
- **How did I implement it?** Added composite indexes on `(user_id, public_id)` and `(user_id, created_at)`.
- **What did I choose against and why?** Rejected adding unnecessary single-column indexes on low-cardinality fields like `status`.

### 13. Query-Count Measurement
- **What is it?** Instrumenting the database adapter to count SQL statements executed per request.
- **Why is it needed?** Provides empirical data to identify N+1 queries and unnecessary database round-trips.
- **How did I implement it?** Built `startQueryCounter()` and `stopQueryCounter()` utilities in `src/lib/db/query-counter.ts`.
- **What did I choose against and why?** Rejected guessing database performance based on subjective perception.

### 14. Query-Count Optimization
- **What is it?** Refactoring database interaction code to reduce SQL statements per request.
- **Why is it needed?** Reduces database CPU load, latency, and connection pool utilization.
- **How did I implement it?** Replaced a 3-query delete transaction (select + insert audit + delete) with a 2-query transaction using `DELETE ... RETURNING *`.
- **What did I choose against and why?** Rejected combining queries at the expense of authorization security or atomic transactions.

### 15. Genuine Empty States
- **What is it?** A dedicated UI state rendered when a user owns 0 records.
- **Why is it needed?** Distinguishes between zero data and loading/error states, guiding new users to create their first record.
- **How did I implement it?** Evaluated `records.length === 0` after fetch completion, displaying an icon, explanation, and CTA button.
- **What did I choose against and why?** Rejected displaying empty white screens or fake demo placeholder items.

---

# 6. What Went Wrong

### Problem 1: Unnecessary Database Query in Delete Transaction
- **Symptom:** The delete endpoint required 4 total database queries (1 auth lookup + 1 record select + 1 audit insert + 1 record delete).
- **Investigation:** Inspected query counter output during `DELETE /api/records/[id]` execution.
- **Cause:** `deleteRecordTransaction` performed a `tx.select()` lookup before executing `tx.delete()`.
- **Fix:** Replaced the initial select query with `tx.delete(records).where(...).returning().get()`, capturing record snapshot data and executing deletion in a single query. Reduced query count from 4 to 3 (25% reduction).

### Problem 2: Vitest Baseline Assertion Failure After Optimization
- **Symptom:** `npm test` failed on `tests/records-foundation.test.ts` with `AssertionError: expected 2 to be greater than or equal to 3`.
- **Investigation:** Checked Vitest log output.
- **Cause:** The foundation test suite included an assertion expecting the unoptimized 3-query transaction baseline.
- **Fix:** Updated the test assertion to `expect(deleteCount).toBeGreaterThanOrEqual(2)` to match the optimized 2-query transaction baseline.

### Problem 3: `better-sqlite3` Synchronous Transaction Constraint
- **Symptom:** Runtime crash when attempting `await tx.transaction(async () => ...)` inside service layer.
- **Investigation:** Reviewed `better-sqlite3` driver documentation and error stack trace.
- **Cause:** `better-sqlite3` executes SQLite transactions synchronously and throws an exception if async promises are returned inside `db.transaction()`.
- **Fix:** Refactored `deleteRecordTransaction` to use synchronous Drizzle methods (`.get()`, `.run()`) inside the transaction callback while returning a Promise from the outer wrapper function.

---

# 7. What This Slice Does Not Handle

- **Record Field Editing:** Updating existing record titles or descriptions.
- **Permissions Delegation / Team Sharing:** Granting read or delete access to other users.
- **Full-Text Search & Filtering:** Searching records by keyword or filtering by date ranges.
- **Pagination & Infinite Scroll:** Chunking large record lists (>1000 items).
- **Multimodal File Attachments:** Uploading PNG, JPEG, or PDF files to records.

---

# 8. If I Built This Again

- **Session Caching:** Implement an in-memory Redis or LRU cache for `getAuthenticatedUser()` to reduce the 1-query session lookup overhead across all protected endpoints.
- **Soft Deletion Option:** Add a configurable `deleted_at` timestamp column to `records` alongside hard deletion for recoverable record retention policies.
- **Event Bus for Audit Logs:** Implement an asynchronous event bus or queue for audit log dispatch in high-throughput environments.
