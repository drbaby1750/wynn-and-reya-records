# Wynn & Reya Records

A secure, high-performance records management system built with **Next.js 14, Drizzle ORM, and SQLite**.

**Assessment 4 — Records and Access Slice**: Demonstrates authenticated record creation, ownership-scoped listing, authorized detail viewing, and atomic soft/hard deletion with audit logging.

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
Ensure your `.env` contains:
```env
DATABASE_URL="file:./sqlite.db"
AUTH_SECRET="dev-secret-wynn-reya-records-key-123456789"
```

### 4. Database Setup
```bash
npx drizzle-kit push
```

### 5. Running the Application
Start the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Running Automated Tests
Execute all records foundation, create, list, and detail tests:
```bash
npm test
```

---

## Architecture Overview

- **Authentication & Ownership Scoping**: Every record belongs to an authenticated user (`user_id`). Database queries strictly filter by `WHERE user_id = authenticatedUserId`.
- **Public ID Security**: Records use random UUID public identifiers (`publicId`) in URLs and API contracts. Internal integer primary keys (`id`) are never leaked to clients.
- **Data Access & Service Layer**: Encapsulated service methods in `src/lib/records/service.ts` for record creation, listing, detail lookup, and deletion transactions.
- **Audit Logging**: Deletions atomically write an audit record to `deletion_audits`.
