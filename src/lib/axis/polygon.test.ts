import { afterEach, describe, expect, it, vi } from "vitest";
const { client } = vi.hoisted(() => ({ client: { getChainId: vi.fn(async () => 137), getBlock: vi.fn(), readContract: vi.fn(async () => 6), getLogs: vi.fn(async () => []) } }));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(), createPublicClient: () => client }));
vi.mock("./runtime", () => ({ retryRead: (action: () => Promise<unknown>) => action() }));
import { extractRange } from "./polygon";
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Incremental finalized source ancestry", () => {
  it("accepts a new interval linked to the prior verified boundary", async () => {
    vi.stubEnv("POLYGON_RPC_URL", "https://fixture.invalid");
    client.getBlock.mockImplementation(async ({ blockTag, blockNumber }: { blockTag?: string; blockNumber?: bigint }) => { const n = blockTag ? 99 : Number(blockNumber); return { number: BigInt(n), hash: hash(n), parentHash: hash(n - 1), timestamp: 1000n }; });
    const result = await extractRange("10", "11", hash(9)); expect(result.blocks).toHaveLength(2);
    await expect(extractRange("10", "11", hash(8))).rejects.toThrow("continuity");
  });
});
