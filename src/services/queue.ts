type Job<T> = {
  id: string;
  payload: T;
  run: (payload: T) => Promise<void>;
};

export class InMemoryQueue<T> {
  private queue: Job<T>[] = [];
  private running = false;

  enqueue(job: Job<T>) {
    this.queue.push(job);
    this.process();
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      try {
        await job.run(job.payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Job failed", job.id, err);
      }
    }

    this.running = false;
  }
}
