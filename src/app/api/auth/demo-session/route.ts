import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const demoEmail = 'inspector@wynnreya.com';
    let user = await db.query.users.findFirst({
      where: eq(users.email, demoEmail),
    });

    if (!user) {
      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: demoEmail,
        hashedPassword: 'demo_hashed_password_123',
        isVerified: true,
        createdAt: new Date(),
      });
      user = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
      sessionId,
    });

    response.cookies.set('session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create demo session' }, { status: 500 });
  }
}
