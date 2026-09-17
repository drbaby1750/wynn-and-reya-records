import { describe, it, expect } from 'vitest';
import { ServerRateLimiter, RateLimitError } from '../src/lib/ai/rate-limit';

describe('Assessment 3 Prompt 7: Server-Side Rate Limiting Demonstration', () => {
  it('Demonstrates AI Processing Rate Limiter (Request 1 & 2 allowed, Excess Request rejected with 429)', () => {
    // Configured for 2 max processing requests per window
    const processingLimiter = new ServerRateLimiter(2, 60000);
    const userId = 'user-test-123';

    // Request 1: Allowed
    const req1 = processingLimiter.checkRateLimit(userId);
    expect(req1.allowed).toBe(true);
    expect(req1.remaining).toBe(1);

    // Request 2: Allowed
    const req2 = processingLimiter.checkRateLimit(userId);
    expect(req2.allowed).toBe(true);
    expect(req2.remaining).toBe(0);

    // Excess Request 3: Rejected with RateLimitError (HTTP 429)
    const req3 = processingLimiter.checkRateLimit(userId);
    expect(req3.allowed).toBe(false);
    expect(req3.remaining).toBe(0);
    expect(req3.resetMs).toBeGreaterThan(0);

    // Enforce throws RateLimitError
    expect(() => processingLimiter.enforce(userId)).toThrow(RateLimitError);
  });

  it('Demonstrates Follow-up Action Rate Limiter (Request 1 & 2 allowed, Excess Request rejected with 429)', () => {
    // Configured for 2 max follow-up requests per window
    const followupLimiter = new ServerRateLimiter(2, 60000);
    const userId = 'user-test-456';

    // Request 1: Allowed
    expect(followupLimiter.checkRateLimit(userId).allowed).toBe(true);

    // Request 2: Allowed
    expect(followupLimiter.checkRateLimit(userId).allowed).toBe(true);

    // Excess Request 3: Rejected
    expect(followupLimiter.checkRateLimit(userId).allowed).toBe(false);
    expect(() => followupLimiter.enforce(userId)).toThrow(RateLimitError);
  });
});
