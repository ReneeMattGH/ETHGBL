// Only in-flight work is shared: a completed read never substitutes for a fresh check.
export function createReadCoordinator(concurrency = 8, maxQueued = 512) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid read concurrency.");
  const pending = new Map<string, Promise<unknown>>();
  const queue: (() => void)[] = [];
  let active = 0;
  const release = () => { active--; queue.shift()?.(); };
  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing as Promise<T>;
      if (active >= concurrency && queue.length >= maxQueued) return Promise.reject(new Error("Arkiv read capacity reached. Retry shortly."));
      const request = new Promise<T>((resolve, reject) => {
        const start = () => {
          active++;
          void Promise.resolve().then(operation).then(resolve, reject).finally(release);
        };
        if (active < concurrency) start(); else queue.push(start);
      });
      pending.set(key, request);
      const clear = () => { if (pending.get(key) === request) pending.delete(key); };
      void request.then(clear, clear);
      return request;
    },
  };
}
