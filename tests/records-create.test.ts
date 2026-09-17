import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db';
import { users, sessions } from '../src/db/schema';
import { POST as createRecordApi } from '../src/app/api/records/route';
import { getRecordForUser, RecordNotFoundError } from '../src/lib/records/service';
import { NextRequest } from 'next/server';

describe('Assessment 4 Prompt 3: Create Record Flow Test Suite', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const sessionAId = crypto.randomUUID();
  const invalidSessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 3600000);

  beforeAll(async () => {
    // Seed test users & active session
    await db.insert(users).values([
      { id: userAId, email: `create_usera_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashA', isVerified: true, createdAt: now },
      { id: userBId, email: `create_userb_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashB', isVerified: true, createdAt: now },
    ]);

    await db.insert(sessions).values([
      { id: sessionAId, userId: userAId, expiresAt },
    ]);
  });

  function createMockRequest(sessionToken?: string, body?: any): NextRequest {
    const headers = new Headers({
      'content-type': 'application/json',
    });
    if (sessionToken) {
      headers.set('x-session-id', sessionToken);
    }

    return new NextRequest('http://localhost:3000/api/records', {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('1. Authenticated user can create a record', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'Valid Record Document #101',
      description: 'Valid record description',
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.record).toBeDefined();
    expect(json.record.publicId).toBeDefined();
    expect(json.record.title).toBe('Valid Record Document #101');
    expect(json.record.description).toBe('Valid record description');
  });

  it('2. Unauthenticated user cannot create a record (returns 401)', async () => {
    const req = createMockRequest(invalidSessionId, {
      title: 'Unauthenticated Record Attempt',
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('3. Created record belongs to the authenticated user (userAId)', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'Ownership Test Record',
    });

    const res = await createRecordApi(req);
    const json = await res.json();

    const fetchedRecord = await getRecordForUser(userAId, json.record.publicId);
    expect(fetchedRecord.userId).toBe(userAId);
  });

  it('4. SECURITY / IDOR TEST: Client-supplied user ID cannot override session identity', async () => {
    // Client attempts to pass User B's ID in request body payload
    const req = createMockRequest(sessionAId, {
      title: 'IDOR Payload Manipulation Attempt',
      userId: userBId, // Malicious override attempt
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(201);

    const json = await res.json();

    // Verify record was assigned to User A (from session), NOT User B
    const recordUserA = await getRecordForUser(userAId, json.record.publicId);
    expect(recordUserA.userId).toBe(userAId);

    // User B querying this public ID must fail with 404 RecordNotFoundError
    await expect(getRecordForUser(userBId, json.record.publicId)).rejects.toThrow(RecordNotFoundError);
  });

  it('5. Invalid input is rejected server-side (returns 400)', async () => {
    const req = createMockRequest(sessionAId, {
      // Missing title
      description: 'Description without required title',
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toMatch(/validation failed/i);
  });

  it('6. Empty / whitespace-only required fields are rejected (400)', async () => {
    const req = createMockRequest(sessionAId, {
      title: '   ',
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(400);
  });

  it('7. Oversized input is rejected server-side (400)', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'x'.repeat(201),
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(400);
  });

  it('8. Public identifier is generated server-side as opaque UUID', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'UUID Public Identifier Test',
    });

    const res = await createRecordApi(req);
    const json = await res.json();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(json.record.publicId).toMatch(uuidRegex);
  });

  it('9. Raw database ID is not exposed in API response', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'Raw DB ID Security Test',
    });

    const res = await createRecordApi(req);
    const json = await res.json();

    expect(json.record.id).toBeUndefined();
    expect(json.record.userId).toBeUndefined(); // Internal foreign key hidden from public response
  });

  it('10. Created record can subsequently be located using the public identifier', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'Locate via Public ID Test',
    });

    const res = await createRecordApi(req);
    const json = await res.json();

    const record = await getRecordForUser(userAId, json.record.publicId);
    expect(record).toBeDefined();
    expect(record.title).toBe('Locate via Public ID Test');
  });

  it('11. Database failure / unexpected payload handled safely without data leakage', async () => {
    const req = new NextRequest('http://localhost:3000/api/records', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-session-id': sessionAId,
      },
      body: 'INVALID_JSON_BODY{{{',
    });

    const res = await createRecordApi(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error).not.toMatch(/SQLITE|syntax error|stack trace/i);
  });

  it('12. Repeated submission generates separate safe records', async () => {
    const payload = { title: 'Repeated Form Submission Test' };

    const res1 = await createRecordApi(createMockRequest(sessionAId, payload));
    const res2 = await createRecordApi(createMockRequest(sessionAId, payload));

    const json1 = await res1.json();
    const json2 = await res2.json();

    expect(json1.record.publicId).not.toBe(json2.record.publicId);
  });

  it('13. Query-count instrumentation records the create operation (Baseline = 1 query)', async () => {
    const req = createMockRequest(sessionAId, {
      title: 'Query Count Measurement Test',
    });

    const res = await createRecordApi(req);
    const json = await res.json();

    expect(json.queryCount).toBe(1);
  });
});
