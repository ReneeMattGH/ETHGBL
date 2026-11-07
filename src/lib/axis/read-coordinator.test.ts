import { describe, expect, it } from "vitest";
import { createReadCoordinator } from "./read-coordinator";

describe("Arkiv read coordination", () => {
  it("shares only simultaneous reads, then performs a fresh read after completion", async () => {
    const reads = createReadCoordinator();
    let calls = 0, release = () => {};
    const first = reads.run("same-scope", () => new Promise<number>(resolve => { calls++; release = () => resolve(calls); }));
    const second = reads.run("same-scope", async () => ++calls);
    expect(first).toBe(second);
    await Promise.resolve(); release();
    expect(await first).toBe(1);
    expect(await reads.run("same-scope", async () => ++calls)).toBe(2);
  });
  it("bounds parallel node work and releases capacity after a failure", async () => {
    const reads = createReadCoordinator(2);
    let active = 0, peak = 0;
    const tasks = Array.from({ length: 10 }, (_, index) => reads.run(String(index), async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      if (index === 3) throw new Error("node read failed");
      return index;
    }));
    const results = await Promise.allSettled(tasks);
    expect(peak).toBe(2);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(9);
    expect(await reads.run("3", async () => "recovered")).toBe("recovered");
  });
  it("rejects excess queued work while allowing an existing request to be shared", async () => {
    const reads = createReadCoordinator(1, 1);
    let release = () => {};
    const first = reads.run("a", () => new Promise<void>(resolve => { release = resolve; }));
    const queued = reads.run("b", async () => "b");
    await expect(reads.run("c", async () => "c")).rejects.toThrow("capacity");
    expect(reads.run("a", async () => {})).toBe(first);
    release(); await first; expect(await queued).toBe("b");
  });
});
