import { describe, expect, it, vi } from "vitest";
const { pages, writes } = vi.hoisted(() => ({ pages: vi.fn(), writes: vi.fn(async () => ({ txHash: "0x" + "ab".repeat(32) })) }));
vi.mock("./runtime", () => ({ arkivReader: () => ({ getBlockTiming: async () => ({ currentBlock: 1000n }) }), writerAddress: () => "0x" + "34".repeat(20) }));
vi.mock("./signing", () => ({ serialWorkerWriter: () => ({ executeBatch: writes }) }));
vi.mock("./store", () => ({ baseQuery: (schema: string) => schema, pageEntities: pages }));
import { renewWorkerEntities } from "./renew";
describe("Bulk record retention", () => {
  it("renews paginated bulk records and import manifests in bounded transactions", async () => {
    pages.mockImplementation(async (query: string) => {
      if (query.startsWith("axis.bulk.import.v1")) return { entities: [{ key: "0x" + "01".repeat(32) }] };
      if (!query.startsWith("axis.bulk.record.v1")) return { entities: [] };
      const offset = query.includes("$key >") ? 100 : 0, length = offset ? 5 : 100;
      return { entities: Array.from({ length }, (_, i) => ({ key: "0x" + (i + offset + 1).toString(16).padStart(64, "0") })) };
    });
    const result = await renewWorkerEntities(); expect(result.renewed).toBe(106); expect(writes).toHaveBeenCalledTimes(7);
    expect(writes.mock.calls.every(call => (call as unknown as [{ extensions: unknown[] }])[0].extensions.length <= 20)).toBe(true);
  });
});
