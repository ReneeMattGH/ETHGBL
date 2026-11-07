import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
const { rename } = vi.hoisted(() => ({ rename: vi.fn() }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  rename.mockImplementation(actual.rename);
  return { ...actual, rename };
});
import { runtimeDirectory, writeState } from "./queue";
const name = "state-regression-" + process.pid;
afterEach(async () => { await rm(join(runtimeDirectory(), name + ".json"), { force: true }); rename.mockClear(); });
describe("Atomic local state", () => {
  it("retries a transient Windows sharing error while keeping valid JSON", async () => {
    await writeState(name, { version: 1 });
    rename.mockRejectedValueOnce(Object.assign(new Error("file held by a reader"), { code: "EPERM" }));
    await writeState(name, { version: 2 });
    expect(JSON.parse(await readFile(join(runtimeDirectory(), name + ".json"), "utf8"))).toEqual({ version: 2 });
    expect(rename).toHaveBeenCalledTimes(3);
    expect((await readdir(runtimeDirectory())).filter(file => file.startsWith(name + ".json."))).toEqual([]);
  });
  it("serializes overlapping heartbeat updates without losing the latest update", async () => {
    await Promise.all(Array.from({ length: 30 }, (_, version) => writeState(name, { version, payload: "x".repeat(1024) })));
    expect(JSON.parse(await readFile(join(runtimeDirectory(), name + ".json"), "utf8"))).toMatchObject({ version: 29 });
  });
  it("keeps the previous state and remains usable after a permanent failure", async () => {
    await writeState(name, { version: 1 });
    rename.mockRejectedValueOnce(Object.assign(new Error("disk failure"), { code: "EIO" }));
    await expect(writeState(name, { version: 2 })).rejects.toThrow("disk failure");
    expect(JSON.parse(await readFile(join(runtimeDirectory(), name + ".json"), "utf8"))).toEqual({ version: 1 });
    await expect(writeState(name, { version: 3 })).resolves.toBeUndefined();
  });
});
