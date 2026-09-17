import { db } from '@/db';
import { aiJobs, AiJob } from '@/db/schema';
import { eq, and, lt, asc, sql } from 'drizzle-orm';
import { getAiConfig, AiConfig } from './config';
import { aiService, AiServiceError } from './service';

export class BackgroundWorker {
  private activeJobsCount = 0;
  private config: AiConfig;
  private isRunning = false;

  constructor(customConfig?: Partial<AiConfig>) {
    this.config = { ...getAiConfig(), ...customConfig };
  }

  public getActiveJobsCount(): number {
    return this.activeJobsCount;
  }

  public getConfig(): AiConfig {
    return this.config;
  }

  /**
   * Atomically claims the next eligible pending job in FIFO order (createdAt ASC).
   * Uses an atomic UPDATE with status='pending' condition to prevent race conditions.
   */
  public async claimNextJob(): Promise<AiJob | null> {
    const maxAttempts = this.config.maxAiAttempts;

    // 1. Find oldest eligible pending job (FIFO order)
    const pendingJob = await db.query.aiJobs.findFirst({
      where: and(
        eq(aiJobs.status, 'pending'),
        lt(aiJobs.attemptCount, maxAttempts)
      ),
      orderBy: [asc(aiJobs.createdAt)],
    });

    if (!pendingJob) {
      return null;
    }

    // 2. Perform atomic state update PENDING -> PROCESSING
    const now = new Date();
    await db.update(aiJobs)
      .set({
        status: 'processing',
        startedAt: now,
        errorMessage: null,
      })
      .where(and(
        eq(aiJobs.id, pendingJob.id),
        eq(aiJobs.status, 'pending') // Guarantees atomic lock — only one worker can claim
      ));

    // Verify atomic claim succeeded by fetching updated job
    const claimedJob = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, pendingJob.id),
    });

    if (!claimedJob || claimedJob.status !== 'processing') {
      return null; // Lost race to another worker
    }

    return claimedJob;
  }

  /**
   * Executes AI processing for a claimed job
   */
  public async processClaimedJob(job: AiJob): Promise<boolean> {
    this.activeJobsCount++;
    try {
      // Execute two-stage AI pipeline
      const result = await aiService.processJobWithAi(job.id, job.userId);

      // Persist successful result and transition to 'done'
      await db.update(aiJobs)
        .set({
          status: 'done',
          extractedNumber: result.extraction.extractedContainerNumber,
          resultJson: result.rawOutputJson,
          completedAt: new Date(),
        })
        .where(eq(aiJobs.id, job.id));

      return true;
    } catch (err: any) {
      // Fetch latest job state to check attempt count
      const updatedJob = await db.query.aiJobs.findFirst({
        where: eq(aiJobs.id, job.id),
      });

      const currentAttempts = updatedJob?.attemptCount ?? (job.attemptCount + 1);
      const isRetryable = err instanceof AiServiceError &&
        ['TIMEOUT', 'PROVIDER_ERROR', 'VALIDATION_ERROR'].includes(err.code);

      const safeMessage = err instanceof AiServiceError
        ? `${err.code}: ${err.message}`
        : 'An unexpected error occurred during background AI processing.';

      if (isRetryable && currentAttempts < this.config.maxAiAttempts) {
        // Return job to pending state for retry
        await db.update(aiJobs)
          .set({
            status: 'pending',
            errorMessage: `Retryable failure (${safeMessage}). Scheduled for retry.`,
          })
          .where(eq(aiJobs.id, job.id));
      } else {
        // Mark job permanently failed
        await db.update(aiJobs)
          .set({
            status: 'failed',
            errorMessage: safeMessage,
            completedAt: new Date(),
          })
          .where(eq(aiJobs.id, job.id));
      }

      return false;
    } finally {
      this.activeJobsCount--;
    }
  }

  /**
   * Scans for stuck jobs in 'processing' state beyond the timeout threshold
   * and recovers them (resets to pending or marks failed if attempts exhausted).
   */
  public async recoverStuckJobs(staleTimeoutMs = 60000): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleTimeoutMs);

    const staleJobs = await db.query.aiJobs.findMany({
      where: and(
        eq(aiJobs.status, 'processing'),
        lt(aiJobs.startedAt, staleThreshold)
      ),
    });

    let recoveredCount = 0;
    for (const job of staleJobs) {
      if (job.attemptCount >= this.config.maxAiAttempts) {
        await db.update(aiJobs)
          .set({
            status: 'failed',
            errorMessage: 'WORKER_TIMEOUT: Job processing exceeded maximum time limit or worker crashed.',
            completedAt: new Date(),
          })
          .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, 'processing')));
      } else {
        await db.update(aiJobs)
          .set({
            status: 'pending',
            errorMessage: 'WORKER_TIMEOUT: Job was stuck in processing state and has been recovered.',
          })
          .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, 'processing')));
      }
      recoveredCount++;
    }

    return recoveredCount;
  }

  /**
   * Main worker loop tick — processes eligible pending jobs up to max concurrency limit
   */
  public async tick(): Promise<void> {
    const maxConcurrency = this.config.maxAiConcurrency;

    // First recover any stuck/crashed jobs
    await this.recoverStuckJobs();

    while (this.activeJobsCount < maxConcurrency) {
      const job = await this.claimNextJob();
      if (!job) break;

      // Asynchronously process claimed job
      this.processClaimedJob(job).then(() => {
        // Trigger another tick when capacity opens up
        this.tick().catch(() => {});
      });
    }
  }
}

export const backgroundWorker = new BackgroundWorker();
