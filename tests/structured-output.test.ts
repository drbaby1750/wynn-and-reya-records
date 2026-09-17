import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiService, AiServiceError } from '../src/lib/ai/service';
import { db } from '../src/db';
import { aiJobs } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { getAiConfig } from '../src/lib/ai/config';
import { storageService } from '../src/lib/storage/service';

const mocks = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const findFirst = vi.fn();
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  });
  return { generateContentMock, findFirst, update };
});

// Mock dependencies
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: mocks.generateContentMock,
      }),
    })),
  };
});

vi.mock('../src/lib/storage/service', () => ({
  storageService: {
    getFile: vi.fn().mockResolvedValue(Buffer.from('dummy image data')),
  },
}));

// We'll test with a mock DB state
const mockJob = {
  id: 'test-job-id',
  userId: 'user-1',
  status: 'pending',
  attemptCount: 0,
  storageKey: 'test.jpg',
};

vi.mock('../src/db', () => {
  return {
    db: {
      query: { aiJobs: { findFirst: mocks.findFirst } },
      update: mocks.update,
    },
  };
});

vi.mock('../src/lib/auth/session', () => ({
  assertUserOwnership: vi.fn(),
}));

describe('Prompt 5: Structured Output, Validation, and Retry Logic', () => {
  const config = getAiConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ ...mockJob });
  });

  it('Test 1: Valid structured output succeeds on first attempt', async () => {
    // Both extraction and verification return valid JSON
    mocks.generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ extractedContainerNumber: 'CSQU3054383', confidence: 0.9, rawTextFound: 'CSQU3054383' }) },
      })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ extractedContainerNumber: 'CSQU3054383', verificationStatus: 'valid_format', explanation: 'Looks good', confidence: 0.9, detectedIssues: [], formatValid: true, requiresManualVerification: false }) },
      });

    const result = await aiService.processJobWithAi('test-job-id', 'user-1');
    
    expect(result.extraction.extractedContainerNumber).toBe('CSQU3054383');
    // Application-layer overrides model's formatValid because checksum (3 vs 0) doesn't match
    expect(result.verification.formatValid).toBe(false);
    
    // Attempt count incremented twice (once for extraction, once for verification)
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it('Test 2: Invalid output triggers validation failure and retries successfully', async () => {
    // Extraction fails validation (confidence > 1) on attempt 1, succeeds on attempt 2
    mocks.generateContentMock
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ extractedContainerNumber: 'CSQU3054383', confidence: 999 }) }, // Fails max(1) validation
      })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ extractedContainerNumber: 'CSQU3054383', confidence: 0.99, rawTextFound: 'CSQU3054383' }) },
      })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ extractedContainerNumber: 'CSQU3054383', verificationStatus: 'valid_format', explanation: 'Ok', confidence: 0.9, detectedIssues: [], formatValid: true, requiresManualVerification: false }) },
      });

    const result = await aiService.processJobWithAi('test-job-id', 'user-1');
    
    expect(result.extraction.confidence).toBe(0.99);
    
    // The model was called 3 times total (2 for extraction, 1 for verification)
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(3);
    
    // DB was updated 3 times to increment attempt counts accurately
    expect(mocks.update).toHaveBeenCalledTimes(3);
    
    // Verify that the 2nd extraction prompt included validation feedback
    const secondCallArg = mocks.generateContentMock.mock.calls[1][0][0]; // the text prompt
    expect(secondCallArg).toContain('SYSTEM FEEDBACK: PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION');
  });

  it('Test 3: Exhausting retries causes graceful failure without returning fake result', async () => {
    // Model returns malformed JSON repeatedly
    mocks.generateContentMock.mockResolvedValue({
      response: { text: () => '{ bad_json: "missing quotes }' },
    });

    await expect(aiService.processJobWithAi('test-job-id', 'user-1')).rejects.toThrowError(AiServiceError);
    
    // Should have tried exactly maxAiAttempts times for extraction before giving up
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(config.maxAiAttempts);
    expect(mocks.update).toHaveBeenCalledTimes(config.maxAiAttempts);
  });

  it('Test 4: Non-retryable error fails immediately without retrying', async () => {
    // Simulating a job not found (non-retryable)
    mocks.findFirst.mockResolvedValue(null);

    await expect(aiService.processJobWithAi('missing-job', 'user-1')).rejects.toThrowError(/not found/);
    
    // The provider was NEVER called
    expect(mocks.generateContentMock).toHaveBeenCalledTimes(0);
    // DB attempt count was NEVER incremented
    expect(mocks.update).toHaveBeenCalledTimes(0);
  });
});
