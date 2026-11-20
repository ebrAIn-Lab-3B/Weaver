/** Serialize asynchronous handlers without letting one failure poison the queue. */
export class SerialMessageQueue {
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  run(work: () => void | Promise<void>): Promise<void> {
    const result = this.tail.then(async () => {
      if (!this.disposed) await work();
    });
    this.tail = result.catch(() => {});
    return result;
  }

  dispose(): void { this.disposed = true; }
}
