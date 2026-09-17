# Wynn & Reya Shipping Container Verification System

A high-performance container document verification system built with **Next.js 14, Drizzle ORM, SQLite, and Google Gemini 3.6 Flash**. 

Automates multimodal container code extraction from shipping document photos and PDFs, performs deterministic ISO 6346 check-digit verification, and manages background processing via a database-backed worker queue.

---

## Quick Start Guide

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
Ensure your `.env` contains a valid `GEMINI_API_KEY`:
```env
DATABASE_URL="file:./sqlite.db"
AUTH_SECRET="dev-secret-wynn-reya-containers-verification-key-123456789"
GEMINI_API_KEY="your_google_gemini_api_key_here"
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

### 4. Database Initialization
```bash
npx drizzle-kit push
```

### 5. Running the Application & Background Worker
Start the Next.js server (which hosts the application and background worker queue):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Click **"Sign In"** to authenticate an inspector demo session and upload a container document image or PDF.

### 6. Running Automated Tests
Execute all 55 unit, integration, worker, and rate-limiting tests:
```bash
npm test
```

---

## Technical Architecture Overview

- **Multimodal AI Pipeline**: Stage 1 Container Number Extraction + Stage 2 ISO 6346 Verification.
- **Asynchronous Background Processing**: Database-backed job queue with atomic job claiming (`claimNextJob`) to prevent race conditions.
- **Concurrency & Rate Limiting**: Configurable worker concurrency cap (`MAX_AI_CONCURRENCY`) and server-side rate limiters (`processingRateLimiter`, `followupRateLimiter`).
- **Domain-Focused Follow-up Action**: Operational logistics compliance query on completed results.

Detailed engineering documentation is available in [DOCUMENTATION.md](./DOCUMENTATION.md).
