import { getAiConfig } from './config';

export class RateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface RateRecord {
  timestamps: number[];
}

export class ServerRateLimiter {
  private records = new Map<string, RateRecord>();

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  public checkRateLimit(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const resetMs = oldestInWindow + this.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, resetMs),
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - record.timestamps.length,
      resetMs: this.windowMs,
    };
  }

  public enforce(key: string): void {
    const result = this.checkRateLimit(key);
    if (!result.allowed) {
      const retrySec = Math.ceil(result.resetMs / 1000);
      throw new RateLimitError(
        `Rate limit exceeded. Maximum ${this.maxRequests} requests per ${this.windowMs / 1000}s window allowed. Please try again in ${retrySec}s.`,
        retrySec
      );
    }
  }
}

const config = getAiConfig();

export const processingRateLimiter = new ServerRateLimiter(
  config.processingRateLimitMax,
  config.processingRateLimitWindowMs
);

export const followupRateLimiter = new ServerRateLimiter(
  config.followupRateLimitMax,
  config.followupRateLimitWindowMs
);
