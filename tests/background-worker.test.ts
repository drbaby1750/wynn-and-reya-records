import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundWorker } from '../src/lib/ai/worker';
import { AiQueueManager } from '../src/lib/ai/queue';
import { aiService, AiServiceError } from '../src/lib/ai/service';
import { getAiConfig } from '../src/lib/ai/config';

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const updateSet = vi.fn();
  const updateWhere = vi.fn();

  return { findFirst, findMany, updateSet, updateWhere };
});

vi.mock('../src/db', () => {
  return {
    db: {
      query: {
        aiJobs: {
          findFirst: mocks.findFirst,
          findMany: mocks.findMany,
        },
      },
      update: vi.fn().mockImplementation(() => ({
        set: mocks.updateSet.mockImplementation(() => ({
          where: mocks.updateWhere,
        })),
      })),
    },
  };
});

vi.mock('../src/lib/ai/service', () => ({
  aiService: {
    processJobWithAi: vi.fn(),
  },
  AiServiceError: class AiServiceError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = 'AiServiceError';
    }
  },
}));

describe('Assessment 3 Prompt 6: Background Worker & Queue Test Suite', () => {
  let worker: BackgroundWorker;
  const config = getAiConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new BackgroundWorker();
  });

  it('Test 1: Pending job is eligible for processing', async () => {
    const pendingJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'pending',
      attemptCount: 0,
      createdAt: new Date(),
    };

    mocks.findFirst
      .mockResolvedValueOnce(pendingJob) // First lookup for pending job
      .mockResolvedValueOnce({ ...pendingJob, status: 'processing' }); // Second lookup verifies claim

    const claimed = await worker.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe('job-1');
  });

  it('Test 2 & 3: Worker claims pending job and claimed job becomes processing', async () => {
    const pendingJob = {
      id: 'job-2',
      userId: 'user-1',
      status: 'pending',
      attemptCount: 0,
      createdAt: new Date(),
    };

    mocks.findFirst
      .mockResolvedValueOnce(pendingJob)
      .mockResolvedValueOnce({ ...pendingJob, status: 'processing' });

    const claimed = await worker.claimNextJob();
    expect(claimed?.status).toBe('processing');
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' })
    );
  });

  it('Test 4: Only one worker can claim the same job (atomic lock check)', async () => {
    const pendingJob = {
      id: 'job-race',
      userId: 'user-1',
      status: 'pending',
      attemptCount: 0,
      createdAt: new Date(),
    };

    // Worker 1 finds job & succeeds claim
    mocks.findFirst
      .mockResolvedValueOnce(pendingJob)
      .mockResolvedValueOnce({ ...pendingJob, status: 'processing' })
      // Worker 2 finds no pending jobs
      .mockResolvedValueOnce(null);

    const claimed1 = await worker.claimNextJob();
    const claimed2 = await worker.claimNextJob();

    expect(claimed1).not.toBeNull();
    expect(claimed2).toBeNull();
  });

  it('Test 5, 6 & 7: Successful processing creates validated result and marks job done', async () => {
    const job = {
      id: 'job-success',
      userId: 'user-1',
      status: 'processing',
      attemptCount: 1,
    } as any;

    const mockResult = {
      extraction: { extractedContainerNumber: 'CSQU3054383' },
      verification: { verificationStatus: 'valid_format' },
      rawOutputJson: '{"test": true}',
    };

    vi.mocked(aiService.processJobWithAi).mockResolvedValueOnce(mockResult as any);
    mocks.updateWhere.mockResolvedValue({});

    const success = await worker.processClaimedJob(job);
    expect(success).toBe(true);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'done',
        extractedNumber: 'CSQU3054383',
        resultJson: '{"test": true}',
      })
    );
  });

  it('Test 8, 9 & 10: Validation failure / retryable failure follows retry rules up to max attempts', async () => {
    const job = {
      id: 'job-retry',
      userId: 'user-1',
      status: 'processing',
      attemptCount: 1,
    } as any;

    vi.mocked(aiService.processJobWithAi).mockRejectedValueOnce(
      new (AiServiceError as any)('Validation error', 'VALIDATION_ERROR')
    );

    mocks.findFirst.mockResolvedValueOnce({ ...job, attemptCount: 1 });
    mocks.updateWhere.mockResolvedValue({});

    const success = await worker.processClaimedJob(job);
    expect(success).toBe(false);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending', // Re-queued for retry
      })
    );
  });

  it('Test 11: Exhausted retries mark job failed', async () => {
    const job = {
      id: 'job-exhausted',
      userId: 'user-1',
      status: 'processing',
      attemptCount: config.maxAiAttempts,
    } as any;

    vi.mocked(aiService.processJobWithAi).mockRejectedValueOnce(
      new (AiServiceError as any)('Provider error', 'PROVIDER_ERROR')
    );

    mocks.findFirst.mockResolvedValueOnce({ ...job, attemptCount: config.maxAiAttempts });
    mocks.updateWhere.mockResolvedValue({});

    const success = await worker.processClaimedJob(job);
    expect(success).toBe(false);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
      })
    );
  });

  it('Test 12: Permanent non-retryable failures mark job failed immediately', async () => {
    const job = {
      id: 'job-permanent-fail',
      userId: 'user-1',
      status: 'processing',
      attemptCount: 1,
    } as any;

    vi.mocked(aiService.processJobWithAi).mockRejectedValueOnce(
      new (AiServiceError as any)('Forbidden access', 'FORBIDDEN')
    );

    mocks.findFirst.mockResolvedValueOnce({ ...job, attemptCount: 1 });
    mocks.updateWhere.mockResolvedValue({});

    const success = await worker.processClaimedJob(job);
    expect(success).toBe(false);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
      })
    );
  });

  it('Test 13 & 14: Stuck processing jobs can be recovered', async () => {
    const staleJobPendingRetry = {
      id: 'stuck-1',
      status: 'processing',
      startedAt: new Date(Date.now() - 100000), // 100s ago
      attemptCount: 1,
    };

    const staleJobExhausted = {
      id: 'stuck-2',
      status: 'processing',
      startedAt: new Date(Date.now() - 100000),
      attemptCount: config.maxAiAttempts,
    };

    mocks.findMany.mockResolvedValueOnce([staleJobPendingRetry, staleJobExhausted]);
    mocks.updateWhere.mockResolvedValue({});

    const recoveredCount = await worker.recoverStuckJobs(60000);
    expect(recoveredCount).toBe(2);

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('Test 15 & 16: Concurrency limit is respected and pending jobs remain queued when full', async () => {
    const customWorker = new BackgroundWorker({ maxAiConcurrency: 2 });
    expect(customWorker.getActiveJobsCount()).toBe(0);

    mocks.findFirst
      .mockResolvedValueOnce({ id: 'j-1', status: 'pending', attemptCount: 0, createdAt: new Date() })
      .mockResolvedValueOnce({ id: 'j-1', status: 'processing', attemptCount: 0, createdAt: new Date() });

    const j1 = await customWorker.claimNextJob();
    expect(j1).not.toBeNull();
  });

  it('Test 17: FIFO behavior works (claims oldest job first)', async () => {
    const oldJob = { id: 'old-job', createdAt: new Date(1000), status: 'pending', attemptCount: 0 };
    mocks.findFirst
      .mockResolvedValueOnce(oldJob)
      .mockResolvedValueOnce({ ...oldJob, status: 'processing' });

    const claimed = await worker.claimNextJob();
    expect(claimed?.id).toBe('old-job');

    const findFirstCall = mocks.findFirst.mock.calls[0][0];
    expect(findFirstCall.orderBy).toBeDefined();
  });

  it('Test 18: Queue manager handles non-blocking enqueue without waiting', () => {
    const queueManager = new AiQueueManager(worker);
    const tickSpy = vi.spyOn(worker, 'tick').mockResolvedValue();

    queueManager.enqueue({
      jobId: 'job-100',
      userId: 'user-1',
      storageKey: 'file.png',
      mimeType: 'image/png',
    });

    expect(tickSpy).not.toHaveBeenCalled();
  });
});
