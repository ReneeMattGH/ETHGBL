import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config, fixture, fixtureSource } from "./fixtures.test-helper";
import { extractStage } from "./staging";
import { crossCheckSource } from "./source-check";
import type { RpcSource } from "./rpc";

describe("Receipt logs versus separate source log queries", () => {
  it("cross-checks exact raw logs and token amounts, and fails on a separately observed mismatch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "axis-source-check-test-"));
    try {
      const base = fixtureSource(); await extractStage(dir, config, base.source);
      let corrupt = false;
      const source: RpcSource = { ...base.source, read: async <T>(method: string, params: unknown[]) => {
        if (method !== "eth_getLogs") return base.source.read<T>(method, params);
        const filter = params[0] as { fromBlock: string }, logs = fixture(Number(BigInt(filter.fromBlock))).logs;
        if (corrupt) logs[0].data = "0x" + "00".repeat(32);
        return logs as T;
      } };
      await expect(crossCheckSource(dir, source)).resolves.toMatchObject({ passed: true, blocks: 2, logsChecked: 4, transfersChecked: 4 });
      corrupt = true; await expect(crossCheckSource(dir, source)).rejects.toThrow("content differs");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
