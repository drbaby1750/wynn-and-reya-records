import { describe, it, expect, vi } from 'vitest';
import { BackgroundWorker } from '../src/lib/ai/worker';

describe('Assessment 3 Prompt 6: Concurrency Demonstration (MAX_CONCURRENT_AI_JOBS = 2)', () => {
  it('Demonstrates that 2 jobs process concurrently while 3rd job waits in queue until capacity opens', async () => {
    // 1. Create a worker with MAX_CONCURRENT_AI_JOBS = 2
    const worker = new BackgroundWorker({ maxAiConcurrency: 2 });

    const jobA = { id: 'job-A', userId: 'user-1', status: 'pending', attemptCount: 0, createdAt: new Date(1000) } as any;
    const jobB = { id: 'job-B', userId: 'user-1', status: 'pending', attemptCount: 0, createdAt: new Date(2000) } as any;
    const jobC = { id: 'job-C', userId: 'user-1', status: 'pending', attemptCount: 0, createdAt: new Date(3000) } as any;

    const pendingJobsQueue = [jobA, jobB, jobC];
    const activeJobs: string[] = [];
    const completedJobs: string[] = [];

    // Mock claimNextJob to simulate DB queue popping
    vi.spyOn(worker, 'claimNextJob').mockImplementation(async () => {
      if (pendingJobsQueue.length === 0) return null;
      const job = pendingJobsQueue.shift()!;
      job.status = 'processing';
      return job;
    });

    // Mock processClaimedJob with artificial delay to observe active concurrency
    vi.spyOn(worker, 'processClaimedJob').mockImplementation(async (job) => {
      (worker as any).activeJobsCount++;
      activeJobs.push(job.id);
      
      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 50));

      activeJobs.splice(activeJobs.indexOf(job.id), 1);
      (worker as any).activeJobsCount--;
      completedJobs.push(job.id);
      return true;
    });

    // 2. Trigger worker tick with 3 pending jobs
    worker.tick();

    // Give microtask tick time to process first batch up to max concurrency (2)
    await new Promise((r) => setTimeout(r, 10));

    // DEMONSTRATION POINT 1: Max 2 jobs are processing simultaneously
    expect(activeJobs).toContain('job-A');
    expect(activeJobs).toContain('job-B');
    expect(activeJobs).not.toContain('job-C');

    // DEMONSTRATION POINT 2: Job C is waiting in queue because concurrency limit (2) is full
    expect(completedJobs.length).toBe(0);

    // Wait for batch 1 to complete and trigger tick for job-C
    await new Promise((r) => setTimeout(r, 80));
    await worker.tick();
    await new Promise((r) => setTimeout(r, 80));

    // DEMONSTRATION POINT 3: Job C begins and completes after capacity opens up
    expect(completedJobs).toEqual(['job-A', 'job-B', 'job-C']);
    expect(worker.getActiveJobsCount()).toBe(0);
  });
});
