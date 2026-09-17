import { db } from '../../db';
import { sessions, users, User } from '../../db/schema';
import { eq, gt, and } from 'drizzle-orm';

export class AuthenticationError extends Error {
  constructor(message = 'Unauthorized: Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Forbidden: You do not have permission to access this resource') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Server-side Session Authenticator
 * Resolves user from active session cookie/token ONLY.
 * NEVER accepts userId from client parameters.
 */
export async function getAuthenticatedUser(sessionId?: string): Promise<User> {
  if (!sessionId) {
    throw new AuthenticationError('Unauthorized: Session token missing.');
  }

  const now = new Date();
  
  // Perform direct inner join between sessions and users table
  const result = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);

  if (result.length === 0) {
    throw new AuthenticationError('Invalid or expired session');
  }

  return result[0].user;
}

/**
 * Verify resource ownership
 */
export function assertUserOwnership(resourceUserId: string, authenticatedUserId: string): void {
  if (resourceUserId !== authenticatedUserId) {
    throw new AuthorizationError('Forbidden: You do not own this resource.');
  }
}
