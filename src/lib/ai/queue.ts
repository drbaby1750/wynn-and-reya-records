import { getAiConfig, AiConfig } from './config';
import { backgroundWorker, BackgroundWorker } from './worker';

export interface QueueJobTask {
  jobId: string;
  userId: string;
  storageKey: string;
  mimeType: string;
}

export class AiQueueManager {
  private worker: BackgroundWorker;

  constructor(customWorker?: BackgroundWorker) {
    this.worker = customWorker || backgroundWorker;
  }

  public getActiveJobsCount(): number {
    return this.worker.getActiveJobsCount();
  }

  public getMaxConcurrency(): number {
    return this.worker.getConfig().maxAiConcurrency;
  }

  /**
   * Enqueues a job trigger and immediately schedules worker consumption.
   * Does not wait for job completion.
   */
  public enqueue(task: QueueJobTask): void {
    // Trigger worker tick asynchronously in background
    setTimeout(() => {
      this.worker.tick().catch((err) => {
        console.error('[AI Queue Worker Error]:', err);
      });
    }, 0);
  }

  /**
   * Manually triggers worker tick (useful for polling / worker schedule)
   */
  public async processNext(): Promise<void> {
    await this.worker.tick();
  }
}

export const aiQueue = new AiQueueManager();
