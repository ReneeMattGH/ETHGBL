import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runtimeDirectory, withLock } from "./queue";
describe("Local writer locking", () => {
  it("serializes concurrent writers and releases the lock after an error", async () => {
    let inside = 0, maximum = 0;
    await Promise.all([1, 2, 3].map(() => withLock("unittest", async () => { inside++; maximum = Math.max(maximum, inside); await new Promise(resolve => setTimeout(resolve, 20)); inside--; })));
    expect(maximum).toBe(1);
    await expect(withLock("unittest", async () => { throw new Error("write failed"); })).rejects.toThrow("write failed");
    await expect(withLock("unittest", async () => "released")).resolves.toBe("released");
  });
  it("recovers a lock only when its recorded process is confirmed dead", async () => {
    const child = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    expect(child.status).toBe(0);
    const path = join(runtimeDirectory(), "deadtest.lock"); await mkdir(path, { recursive: true });
    await writeFile(join(path, "owner.json"), JSON.stringify({ pid: child.pid, nonce: "dead-test" }));
    await expect(withLock("deadtest", async () => "recovered", 1)).resolves.toBe("recovered");
  });
  it("rejects paths outside the runtime directory", async () => { await expect(withLock("../elsewhere", async () => true)).rejects.toThrow("Invalid lock name"); });
});
