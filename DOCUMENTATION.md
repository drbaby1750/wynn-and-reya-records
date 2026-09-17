# Wynn & Reya Container Verification System — AI Integration Engineering Documentation

This document provides a comprehensive engineering breakdown of **Assessment 3: AI Integration Slice** for the Wynn & Reya Product Engineering Bootcamp project.

---

# 1. What This Is

### Domain & Purpose
This slice implements an automated **Shipping Container Identification & Invoice Verification System** for Wynn & Reya logistics operations. 

In global supply chains, container numbers (ISO 6346 standard) on shipping documents, bills of lading, and photos are manually inspected to prevent logistics routing errors and customs entry delays. This engineering slice automates container extraction, structural format verification, check-digit validation, background queuing, rate limiting, and follow-up compliance queries.

### What Is Intentionally Included
- **Multimodal AI Extraction**: Extracts container identification numbers from uploaded shipping document photos (PNG, JPEG, WebP) and PDF invoices.
- **Two-Stage AI & Algorithmic Verification**: Combines Google Gemini multimodal analysis with deterministic ISO 6346 check-digit calculations.
- **Asynchronous Background Processing**: Database-backed job queue with atomic worker job claiming (`PENDING` &rarr; `PROCESSING` &rarr; `DONE` / `FAILED`).
- **Concurrency & Rate Controls**: Configurable worker concurrency caps (`MAX_AI_CONCURRENCY`) and server-side rate limiters for processing and follow-up queries.
- **Domain-Focused Follow-up Action**: Operational logistics compliance query on completed results.
- **Robust Security & Privacy Boundary**: Server-enforced session authentication, user isolation, opaque file storage references, and private API credential management.

---

# 2. How To Run It

### Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)
- Google Gemini API Key

### Step 1: Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Step 2: Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your environment variables in `.env`:
```env
DATABASE_URL="file:./sqlite.db"
AUTH_SECRET="dev-secret-wynn-reya-containers-verification-key-123456789"
GEMINI_API_KEY="your_actual_google_gemini_api_key_here"
AI_PROVIDER="google"
AI_MODEL="gemini-3.6-flash"

AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_OUTPUT_TOKENS=2048
AI_TEMPERATURE=0.2

MAX_AI_CONCURRENCY=3
AI_PROCESSING_RATE_LIMIT_MAX=10
AI_PROCESSING_RATE_LIMIT_WINDOW_MS=60000
AI_FOLLOWUP_RATE_LIMIT_MAX=5
AI_FOLLOWUP_RATE_LIMIT_WINDOW_MS=60000

MAX_UPLOAD_SIZE_BYTES=10485760
UPLOAD_STORAGE_DIR="./storage/uploads"
```

### Step 3: Database Setup
Apply Drizzle database migrations:
```bash
npx drizzle-kit push
```

### Step 4: Run Application & Background Worker
Start the Next.js development server (which runs the web application and background worker queue):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Click **"Sign In"** to initialize a authenticated inspector demo session.

### Step 5: Run Automated Test Suite
Run all 55 unit, integration, worker, and rate-limit tests:
```bash
npm test
```

---

# 3. The Flow, Step By Step

### The Happy Path
1. **User Uploads File**: Inspector selects a container image (PNG, JPEG, WebP) or shipping PDF document up to 10MB in the web UI.
2. **Server-Side Validation**: `POST /api/upload` enforces session authentication, validates magic bytes, mime type, and file size boundaries.
3. **Secure File Storage**: `storageService` writes the file to disk using an opaque UUID storage key (`storage/uploads/<uuid>`).
4. **Job Creation**: Server creates an `ai_jobs` record in `pending` state with `attempt_count = 0` and storage reference.
5. **Non-Blocking Client Response**: `POST /api/upload` immediately returns HTTP `201 Created` with job details. The browser request does not block waiting for AI.
6. **Background Worker Claiming**: `BackgroundWorker.claimNextJob()` atomically updates the job state `PENDING` &rarr; `PROCESSING` guarded by `WHERE status = 'pending'` in FIFO order (`created_at ASC`).
7. **AI Extraction & Verification**: 
   - **Stage 1**: `extractContainerNumber()` sends image buffer to Gemini 3.6 Flash using `CONTAINER_EXTRACTION_PROMPT`.
   - **Deterministic Guard**: Calculates ISO 6346 check-digit algorithmically in Node.js code.
   - **Stage 2**: `verifyContainer()` calls Gemini 3.6 Flash with `CONTAINER_VERIFICATION_PROMPT` and deterministic checksum context.
8. **Structured Output Validation**: `ExtractionOutputSchema` and `VerificationOutputSchema` validate response structure.
9. **Result Persistence**: Worker persists validated JSON result, sets `extracted_number`, updates `status = 'done'`, and records `completed_at`.
10. **UI Observation**: Frontend polls `GET /api/jobs/[id]` and displays completed verification badge, extracted container number, and confidence breakdown.
11. **Follow-up Compliance Query**: User submits a logistics compliance question. Server enforces user ownership, completed job guard, rate limiter, executes `CONTAINER_FOLLOWUP_PROMPT`, validates JSON output via `FollowupOutputSchema`, and displays suggestions.

### The Failure & Retry Path
1. **Transient Provider Error / Validation Failure**: If Gemini returns malformed output or experiences a 503 spike, `aiService.executeWithRetry()` catches the error, injects schema feedback or waits 1s exponential backoff, and retries.
2. **Attempt Counting**: `attempt_count` increments exactly once per actual AI call.
3. **Exhausted Attempts / Permanent Error**: If `attempt_count >= maxAiAttempts` or non-retryable error occurs, job status becomes `failed` with safe error logging.

---

# 4. The Data Model

The application uses SQLite with Drizzle ORM consisting of 4 core tables:

### 1. `users`
- **Fields**: `id` (text, PK), `email` (text, unique), `hashedPassword` (text), `isVerified` (boolean), `createdAt` (timestamp).
- **Purpose**: Authenticated inspector identity for user isolation.

### 2. `sessions`
- **Fields**: `id` (text, PK), `userId` (text, FK &rarr; users.id), `expiresAt` (timestamp).
- **Purpose**: Server-side authenticated session tracking.

### 3. `uploaded_files`
- **Fields**: `id` (text, PK), `userId` (text, FK), `originalName` (text), `mimeType` (text), `sizeBytes` (integer), `storageKey` (text), `createdAt` (timestamp).
- **Purpose**: Metadata registry for uploaded documents. Stores opaque `storageKey` file reference.

### 4. `ai_jobs`
- **Fields**: 
  - `id` (text, PK)
  - `userId` (text, FK)
  - `jobType` (text) — e.g. `'CONTAINER_VERIFICATION'`
  - `status` (text) — `'pending' | 'processing' | 'done' | 'failed'`
  - `attemptCount` (integer, default 0)
  - `storageKey` (text) — Opaque reference key to stored file
  - `aiRole` (text) — `'CONTAINER_VERIFICATION'`
  - `extractedNumber` (text, nullable)
  - `resultJson` (text, nullable) — Validated JSON result string
  - `errorMessage` (text, nullable) — Safe internal error message
  - `createdAt` (timestamp)
  - `startedAt` (timestamp, nullable)
  - `completedAt` (timestamp, nullable)

### Why Binary Files Are NOT Stored in the Database
Binary files (images/PDFs) are stored on disk in disk storage abstraction (`/storage/uploads/<uuid>`) while the database only stores the opaque `storageKey` string.
- **Database Scalability**: Storing binary blobs in database rows causes database bloat, slows query indexes, and degrades backup performance.
- **Security Isolation**: Keeping binary blobs out of database backups prevents unintentional exposure of file contents.

---

# 5. The Concepts

### 1. AI Endpoint / Provider Integration
1. **What is it?**: The integration layer connecting the application to AI model providers.
2. **Why is it needed?**: To execute multimodal container code extraction and structural analysis.
3. **How did I implement it?**: Created an isolated `AiService` class (`src/lib/ai/service.ts`) wrapping `@google/generative-ai`.
4. **What did I choose against and why?**: Chose Google Gemini 3.6 Flash over OpenAI/DeepSeek because Gemini natively accepts multimodal PDF and image documents directly without requiring external OCR engines.

### 2. Official SDK vs Raw HTTP
1. **What is it?**: Using Google's official `@google/generative-ai` SDK vs raw `fetch()` calls.
2. **Why is it needed?**: The official SDK handles tokenization, streaming, file part formatting, and type definitions cleanly.
3. **How did I implement it?**: Initialized `GoogleGenerativeAI(config.geminiApiKey)` inside `AiService`.
4. **What did I choose against and why?**: Rejected manual `fetch()` calls to raw REST endpoints to avoid manual multipart encoding bugs and endpoint URL maintenance.

### 3. System Prompts
1. **What is it?**: Explicit instructions defined by the application developer that govern model behavior.
2. **Why is it needed?**: Ensures the model adheres strictly to extraction formats and safety rules without claiming official authority.
3. **How did I implement it?**: Defined `CONTAINER_EXTRACTION_PROMPT`, `CONTAINER_VERIFICATION_PROMPT`, and `CONTAINER_FOLLOWUP_PROMPT` in `src/lib/ai/prompts.ts` passed via `systemInstruction`.
4. **What did I choose against and why?**: Rejected concatenating system prompts with user input in a single text string to prevent prompt injection attacks.

### 4. User / File Input
1. **What is it?**: The document image or text query provided by the user.
2. **Why is it needed?**: Serves as the raw payload for container code extraction and verification.
3. **How did I implement it?**: Passed file buffers as base64 inline data parts (`inlineData`) to Gemini multimodal endpoints.
4. **What did I choose against and why?**: Rejected passing local server file paths to Gemini; inline base64 buffers isolate file access safely.

### 5. Model Parameters
1. **What is it?**: Configuration controls governing model output randomness, token limits, and timeouts.
2. **Why is it needed?**: Ensures deterministic, fast, cost-controlled responses.
3. **How did I implement it?**: Configured `temperature: 0.2`, `maxOutputTokens: 2048`, and `requestTimeoutMs: 30000` via `getAiConfig()`.
4. **What did I choose against and why?**: Rejected high temperatures (e.g. 0.9) to prevent hallucinated container numbers.

### 6. Structured Output
1. **What is it?**: Enforcing JSON formatted output responses from AI models.
2. **Why is it needed?**: Enables application code to programmatically parse and store extraction fields.
3. **How did I implement it?**: Used `generationConfig: { responseMimeType: 'application/json' }`.
4. **What did I choose against and why?**: Rejected unstructured plain text responses which require fragile regex parsing.

### 7. Schema Validation
1. **What is it?**: Runtime verification of AI output structure using application validation schemas.
2. **Why is it needed?**: AI models can occasionally emit missing or out-of-bound fields.
3. **How did I implement it?**: Defined Zod schemas (`ExtractionOutputSchema`, `VerificationOutputSchema`, `FollowupOutputSchema`) in `src/lib/ai/schema.ts` and called `.parse(json)`.
4. **What did I choose against and why?**: Rejected trusting raw AI output directly without runtime validation.

### 8. Retry Logic
1. **What is it?**: Automatic re-execution of AI operations when transient errors occur.
2. **Why is it needed?**: Recovers from temporary network hiccups, 503 provider spikes, or schema validation failures.
3. **How did I implement it?**: Built `executeWithRetry()` loop in `AiService` with feedback injection for validation errors and 1s exponential backoff for 503 errors.
4. **What did I choose against and why?**: Rejected infinite retries; capped retries to `maxAiAttempts` (3).

### 9. Background Jobs
1. **What is it?**: Decoupling long-running tasks from synchronous HTTP web request threads.
2. **Why is it needed?**: Prevents browser timeout and keeps upload endpoints fast (~50ms response).
3. **How did I implement it?**: `POST /api/upload` inserts job record with status `pending` and returns HTTP 201 immediately.
4. **What did I choose against and why?**: Rejected synchronous processing during upload request.

### 10. Workers
1. **What is it?**: Dedicated background execution process that processes queued jobs.
2. **Why is it needed?**: Executes AI operations asynchronously outside web request lifecycles.
3. **How did I implement it?**: Built `BackgroundWorker` in `src/lib/ai/worker.ts`.
4. **What did I choose against and why?**: Rejected client-side worker execution; server worker ensures security and API key privacy.

### 11. Queues
1. **What is it?**: Persistent backlog of pending jobs awaiting execution.
2. **Why is it needed?**: Handles traffic surges gracefully without overloading AI model quotas.
3. **How did I implement it?**: Database-backed queue on `ai_jobs` table managed by `AiQueueManager`.
4. **What did I choose against and why?**: Rejected complex external message brokers (RabbitMQ/Redis) to avoid unnecessary infrastructure bloat for this SQLite stack.

### 12. FIFO / Queue Behaviour
1. **What is it?**: First-In-First-Out job processing order based on creation timestamp.
2. **Why is it needed?**: Ensures fairness so earlier uploads are processed before newer ones.
3. **How did I implement it?**: Worker queries pending jobs using `ORDER BY created_at ASC`.
4. **What did I choose against and why?**: Rejected random or LIFO queue processing.

### 13. Concurrency Limits
1. **What is it?**: Capping the maximum number of simultaneous AI jobs processing at once.
2. **Why is it needed?**: Prevents exceeding Google Gemini API rate limits and server memory limits.
3. **How did I implement it?**: `BackgroundWorker` tracks `activeJobsCount` against `maxAiConcurrency` (3).
4. **What did I choose against and why?**: Rejected uncapped parallel processing.

### 14. Rate Limiting
1. **What is it?**: Server-side throttling of request frequencies per authenticated user.
2. **Why is it needed?**: Protects against API key quota exhaustion and cost abuse.
3. **How did I implement it?**: Implemented `ServerRateLimiter` (`processingRateLimiter` = 10/min, `followupRateLimiter` = 5/min) returning HTTP 429.
4. **What did I choose against and why?**: Rejected client-side button disabling as rate limiting; server-side enforcement cannot be bypassed.

### 15. Object / File Storage
1. **What is it?**: Abstraction layer for storing and retrieving uploaded files.
2. **Why is it needed?**: Safely isolates uploaded documents with opaque storage keys.
3. **How did I implement it?**: Built `storageService` writing to `./storage/uploads/<uuid>`.
4. **What did I choose against and why?**: Rejected using user-supplied filenames as disk storage paths to prevent path traversal attacks.

### 16. Job States
1. **What is it?**: Finite state machine transitions for AI jobs (`pending` &rarr; `processing` &rarr; `done` / `failed`).
2. **Why is it needed?**: Provides deterministic lifecycle tracking for UI status and worker queueing.
3. **How did I implement it?**: Enforced state transitions in `ai_jobs` status column with state guards in API routes.
4. **What did I choose against and why?**: Rejected arbitrary client-controlled state mutations (e.g. client setting status directly to `done`).

### 17. Error Handling
1. **What is it?**: Structured handling of application errors and model failures.
2. **Why is it needed?**: Prevents application crashes and protects secrets from leaking in stack traces.
3. **How did I implement it?**: Custom `AiServiceError` class logging safe messages to DB while keeping raw API keys private.
4. **What did I choose against and why?**: Rejected exposing internal raw exception messages to client responses.

### 18. Timeout / Fallback
1. **What is it?**: Aborting AI model requests that exceed maximum duration boundaries.
2. **Why is it needed?**: Prevents worker threads from hanging indefinitely on stalled network sockets.
3. **How did I implement it?**: `executeWithTimeout()` using `AbortController` set to 30,000ms.
4. **What did I choose against and why?**: Rejected uncapped HTTP request waits.

### 19. Cost Control
1. **What is it?**: Combined defense-in-depth measures limiting financial exposure from model usage.
2. **Why is it needed?**: Prevents unexpected API billing spikes.
3. **How did I implement it?**: Enforced 10MB upload limit, 1000 char question limit, 2048 max output tokens, 3 max retries, 3 max concurrency, and non-recursive follow-up policy.
4. **What did I choose against and why?**: Rejected unlimited token output configurations.

---

# 6. What Went Wrong

### Problem 1
- **Symptom**: Model calls returned `404 Not Found` with message `This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash`.
- **Investigation**: Checked active Google Generative AI API endpoints using a standalone benchmark script (`test_gemini.mjs`). Tested `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.5-flash`, and `gemini-3.6-flash`.
- **Cause**: Google deprecated older model aliases on their v1beta API tier.
- **Fix**: Updated `AI_MODEL` in `.env`, `.env.example`, and `config.ts` to `gemini-3.6-flash`, which responded instantly with `[OK] -> "Hello there, friend!"`.

### Problem 2
- **Symptom**: Initial background queue worker tests failed with `db.update(...).set(...).where(...).returning is not a function` when testing atomic job claiming.
- **Investigation**: Reviewed SQLite Drizzle driver differences between native SQLite and test mock implementations.
- **Cause**: `.returning()` helper behavior varies across mock adapters.
- **Fix**: Updated `claimNextJob()` in `src/lib/ai/worker.ts` to perform an atomic `UPDATE ai_jobs SET status = 'processing' WHERE id = ? AND status = 'pending'`, followed by a deterministic re-query verifying status changed to `processing`.

### Problem 3
- **Symptom**: During initial model load testing, transient `503 Service Unavailable` errors occurred when calling Gemini API back-to-back.
- **Investigation**: Inspected error stack traces and verified that immediate retries hit Google's server rate limiter.
- **Cause**: Immediate retry loops without pause failed because Google's 503 spike lasted several milliseconds.
- **Fix**: Added exponential backoff delay (`await new Promise(r => setTimeout(r, 1000 * attempt))`) inside `executeWithRetry()` in `src/lib/ai/service.ts`, allowing transient 503 spikes to resolve gracefully.

---

# 7. What This Slice Does Not Handle

This slice is intentionally scoped to Assessment 3 engineering requirements. It explicitly does NOT include:
- Multi-user chat history or conversational thread persistence.
- Full AI assistant or general-purpose chatbot capabilities.
- Real-time WebSockets or Server-Sent Events (SSE) (polling is used).
- External customs registry integrations (e.g. live BIC container database lookup).
- Billing, subscription, or payment gateway integration.
- Social sharing, notifications, or email alerts.

---

# 8. If I Built This Again

If building this system for enterprise production scale:
1. **Distributed Queue**: For multi-server deployments, I would migrate from SQLite to PostgreSQL with BullMQ / Redis to support distributed worker scaling across multiple cloud containers.
2. **Deterministic Checksum First**: I would run the deterministic ISO 6346 check-digit algorithm before calling the Stage 2 LLM verification model, saving model tokens when format errors are obvious.
3. **What I Would Keep**: The two-stage architecture (Stage 1 Multimodal Extraction + Stage 2 Verification) and Zod schema validation proved extremely clean, reliable, and easy to test.
