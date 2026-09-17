import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { db } from '../src/db';
import { users, sessions } from '../src/db/schema';
import { GET as getRecordsListApi } from '../src/app/api/records/route';
import { createRecordForUser, listRecordsForUser } from '../src/lib/records/service';
import { NextRequest } from 'next/server';

describe('Assessment 4 Prompt 4: Records List & Genuine Empty State Test Suite', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userCId = crypto.randomUUID(); // Zero records user
  const sessionAId = crypto.randomUUID();
  const sessionBId = crypto.randomUUID();
  const sessionCId = crypto.randomUUID();
  const invalidSessionId = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(Date.now() + 3600000);

  let recordAPublicId: string;
  let recordBPublicId: string;

  beforeAll(async () => {
    // 1. Seed test users
    await db.insert(users).values([
      { id: userAId, email: `list_usera_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashA', isVerified: true, createdAt: now },
      { id: userBId, email: `list_userb_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashB', isVerified: true, createdAt: now },
      { id: userCId, email: `list_userc_${crypto.randomUUID()}@wynnreya.com`, hashedPassword: 'hashC', isVerified: true, createdAt: now },
    ]);

    // 2. Seed active sessions
    await db.insert(sessions).values([
      { id: sessionAId, userId: userAId, expiresAt },
      { id: sessionBId, userId: userBId, expiresAt },
      { id: sessionCId, userId: userCId, expiresAt },
    ]);

    // Seed records for User A & User B
    const recA = await createRecordForUser(userAId, {
      title: 'Record Document A - User A Only',
      description: 'Private data for User A',
    });
    recordAPublicId = recA.publicId;

    const recB = await createRecordForUser(userBId, {
      title: 'Record Document B - User B Only',
      description: 'Private data for User B',
    });
    recordBPublicId = recB.publicId;
  });

  function createMockGetRequest(sessionToken?: string, extraParams?: Record<string, string>): NextRequest {
    const url = new URL('http://localhost:3000/api/records');
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers = new Headers();
    if (sessionToken) {
      headers.set('x-session-id', sessionToken);
    }

    return new NextRequest(url.toString(), {
      method: 'GET',
      headers,
    });
  }

  it('1. Authenticated user can load their records', async () => {
    const req = createMockGetRequest(sessionAId);
    const res = await getRecordsListApi(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.records)).toBe(true);
    expect(json.records.length).toBeGreaterThanOrEqual(1);
  });

  it('2. Unauthenticated user cannot load the records list (returns 401)', async () => {
    const req = createMockGetRequest(invalidSessionId);
    const res = await getRecordsListApi(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('3. User A sees ONLY User A records', async () => {
    const req = createMockGetRequest(sessionAId);
    const res = await getRecordsListApi(req);

    const json = await res.json();
    const publicIds = json.records.map((r: any) => r.publicId);

    expect(publicIds).toContain(recordAPublicId);
    expect(publicIds).not.toContain(recordBPublicId);
  });

  it('4. User B sees ONLY User B records', async () => {
    const req = createMockGetRequest(sessionBId);
    const res = await getRecordsListApi(req);

    const json = await res.json();
    const publicIds = json.records.map((r: any) => r.publicId);

    expect(publicIds).toContain(recordBPublicId);
    expect(publicIds).not.toContain(recordAPublicId);
  });

  it('5. User with zero records receives an empty result array', async () => {
    const req = createMockGetRequest(sessionCId);
    const res = await getRecordsListApi(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.records).toEqual([]);
  });

  it('6. Genuine empty state: Direct database call for User C yields exactly 0 rows', async () => {
    const userCRecords = await listRecordsForUser(userCId);
    expect(userCRecords.length).toBe(0);
  });

  it('7. SECURITY / IDOR TEST: User A cannot cause User B records to appear through query parameters', async () => {
    // User A attempts to send URL parameters attempting to filter by User B's ID
    const req = createMockGetRequest(sessionAId, { targetUserId: userBId, userId: userBId });
    const res = await getRecordsListApi(req);

    const json = await res.json();
    const publicIds = json.records.map((r: any) => r.publicId);

    // User B's record MUST NOT appear in User A's response
    expect(publicIds).not.toContain(recordBPublicId);
  });

  it('8. Database query enforces ownership filtering at database level', async () => {
    const userARecords = await listRecordsForUser(userAId);
    expect(userARecords.every((r) => r.userId === userAId)).toBe(true);
    expect(userARecords.some((r) => r.userId === userBId)).toBe(false);
  });

  it('9. Record response objects use safe UUID public identifiers', async () => {
    const req = createMockGetRequest(sessionAId);
    const res = await getRecordsListApi(req);
    const json = await res.json();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    json.records.forEach((r: any) => {
      expect(r.publicId).toMatch(uuidRegex);
    });
  });

  it('10. Raw database primary key ID is NOT exposed in API response', async () => {
    const req = createMockGetRequest(sessionAId);
    const res = await getRecordsListApi(req);
    const json = await res.json();

    json.records.forEach((r: any) => {
      expect(r.id).toBeUndefined();
      expect(r.userId).toBeUndefined();
    });
  });

  it('11. Measured query count for list records operation equals baseline (1 query)', async () => {
    const req = createMockGetRequest(sessionAId);
    const res = await getRecordsListApi(req);
    const json = await res.json();

    expect(json.queryCount).toBe(1);
  });
});
