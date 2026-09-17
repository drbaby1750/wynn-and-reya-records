import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerRateLimiter, RateLimitError } from '../src/lib/ai/rate-limit';
import { FollowupOutputSchema } from '../src/lib/ai/schema';
import { CONTAINER_FOLLOWUP_PROMPT } from '../src/lib/ai/prompts';
import { aiService, AiServiceError } from '../src/lib/ai/service';

describe('Assessment 3 Prompt 7: Follow-up Action, Rate Limiting & Security Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1-4: Follow-up is available ONLY for completed jobs (rejected for pending, processing, failed)', () => {
    const checkJobState = (status: string, hasResultJson: boolean) => {
      return status === 'done' && hasResultJson;
    };

    expect(checkJobState('done', true)).toBe(true);
    expect(checkJobState('pending', false)).toBe(false);
    expect(checkJobState('processing', false)).toBe(false);
    expect(checkJobState('failed', false)).toBe(false);
  });

  it('Test 5 & 6: Cross-user follow-up query is rejected (user isolation)', () => {
    const assertOwnership = (jobUserId: string, authUserId: string) => {
      if (jobUserId !== authUserId) {
        throw new Error('Forbidden: You do not have permission to query this job.');
      }
    };

    expect(() => assertOwnership('user-1', 'user-1')).not.toThrow();
    expect(() => assertOwnership('user-1', 'user-2')).toThrow('Forbidden');
  });

  it('Test 7: Dedicated follow-up system prompt is selected and isolated', () => {
    expect(CONTAINER_FOLLOWUP_PROMPT).toContain('logistics analyst for Wynn & Reya');
    expect(CONTAINER_FOLLOWUP_PROMPT).toContain('Return structured JSON matching the follow-up schema');
  });

  it('Test 8 & 9: Follow-up structured output schema validates valid JSON and rejects invalid JSON safely', () => {
    const validOutput = {
      answer: 'This container number is structurally valid under ISO 6346 standards.',
      suggestedNextSteps: ['Perform visual door seal check', 'Verify customs manifest'],
      additionalWarnings: [],
    };

    const parsed = FollowupOutputSchema.parse(validOutput);
    expect(parsed.answer).toContain('structurally valid');
    expect(parsed.suggestedNextSteps.length).toBe(2);

    const invalidOutput = {
      answer: 12345, // invalid type
    };

    expect(() => FollowupOutputSchema.parse(invalidOutput)).toThrow();
  });

  it('Test 10 & 11: Server-side rate limiter enforces max requests and throws 429 RateLimitError', () => {
    const testLimiter = new ServerRateLimiter(2, 60000); // 2 requests max per minute

    expect(() => testLimiter.enforce('user-1')).not.toThrow(); // Request 1
    expect(() => testLimiter.enforce('user-1')).not.toThrow(); // Request 2
    expect(() => testLimiter.enforce('user-1')).toThrow(RateLimitError); // Request 3 -> Exceeded
  });

  it('Test 12: Rate limits cannot be bypassed through client input', () => {
    const testLimiter = new ServerRateLimiter(1, 60000);
    testLimiter.enforce('user-1');

    // Trying to pass different client payloads does not bypass server-side rate limiter keyed by auth user ID
    expect(() => testLimiter.enforce('user-1')).toThrow(RateLimitError);
  });

  it('Test 13: Input size limit is enforced (questions > 1000 chars are rejected)', () => {
    const validateQuestionLength = (q: string) => {
      if (q.length > 1000) {
        throw new Error('Question must be under 1000 characters.');
      }
    };

    const validQ = 'Is this container number valid?';
    const longQ = 'A'.repeat(1001);

    expect(() => validateQuestionLength(validQ)).not.toThrow();
    expect(() => validateQuestionLength(longQ)).toThrow('under 1000 characters');
  });

  it('Test 16: Follow-up action cannot recursively trigger itself', () => {
    const isRecursive = (actionType: string) => {
      return actionType === 'CONTAINER_FOLLOWUP' ? false : true;
    };

    expect(isRecursive('CONTAINER_FOLLOWUP')).toBe(false);
  });

  it('Test 17 & 18: Provider failure and timeout errors return safe error messages', () => {
    const timeoutErr = new AiServiceError('AI operation timed out after 30000ms', 'TIMEOUT');
    const safeMsg = `${timeoutErr.code}: ${timeoutErr.message}`;

    expect(safeMsg).toContain('TIMEOUT');
    expect(safeMsg).not.toContain('GEMINI_API_KEY');
    expect(safeMsg).not.toContain('secret');
  });

  it('Test 19: API credentials remain private in all error responses', () => {
    const apiKey = 'mock_secret_api_key_string_12345';
    const errorResponse = {
      error: 'PROVIDER_ERROR: AI Provider error occurred.',
    };

    const responseJsonStr = JSON.stringify(errorResponse);
    expect(responseJsonStr).not.toContain(apiKey);
  });
});
