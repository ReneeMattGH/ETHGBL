import { beforeEach, describe, expect, it, vi } from "vitest";
const { pageEntities, getDataset, coverageSummary } = vi.hoisted(() => ({ pageEntities: vi.fn(), getDataset: vi.fn(), coverageSummary: vi.fn() }));
vi.mock("./store", async importOriginal => ({ ...await importOriginal<typeof import("./store")>(), pageEntities, getDataset, coverageSummary }));
vi.mock("./runtime", () => ({ writerAddress: () => "0x" + "34".repeat(20), arkivReader: vi.fn(), retryRead: vi.fn() }));
import { catalogPreview } from "./catalog-store";
const key = "0x" + "12".repeat(32);
beforeEach(() => {
  vi.clearAllMocks();
  getDataset.mockResolvedValue({ key, name: "Published scope" });
  coverageSummary.mockResolvedValue({ fromBlock: "10", throughBlock: "12", actualRows: 3, gaps: [] });
  pageEntities.mockResolvedValue({ entities: [], count: 0n, blockNumber: 100n });
});
describe("Catalog read boundaries", () => {
  it("rejects planned tables and arbitrary schema requests before querying Arkiv", async () => {
    for (const table of ["quickswap-swaps", "axis.dashboard.v1", "unknown"]) await expect(catalogPreview(table, key)).rejects.toThrow("not indexed");
    expect(pageEntities).not.toHaveBeenCalled();
  });
  it("limits dataset previews to the verified range and trusted record owner", async () => {
    const result = await catalogPreview("polygon-blocks", key, 10);
    expect(getDataset).toHaveBeenCalledWith(key);
    expect(pageEntities).toHaveBeenCalledWith(expect.stringContaining(`datasetKey = key(${key}) AND blockNumber >= u64(10) AND blockNumber <= u64(12)`), 10, 10, "blockNumber:u64 DESC");
    expect(result.executedQuery).toContain("$owner = addr(0x" + "34".repeat(20) + ")");
    expect(result.total).toBe("0");
  });
  it("blocks missing scopes, missing coverage and consistency gaps", async () => {
    await expect(catalogPreview("token-transfers", null)).rejects.toThrow("Select");
    coverageSummary.mockResolvedValueOnce({ throughBlock: null });
    await expect(catalogPreview("token-transfers", key)).rejects.toThrow("no verified");
    coverageSummary.mockResolvedValueOnce({ throughBlock: "12", gaps: ["Coverage mismatch"] });
    await expect(catalogPreview("token-transfers", key)).rejects.toThrow("Coverage mismatch");
    expect(pageEntities).not.toHaveBeenCalled();
  });
  it("rejects invalid offsets and missing count metadata rather than inventing a count", async () => {
    for (const offset of [-1, 1.5, 1000001, NaN]) await expect(catalogPreview("token-metadata", null, offset)).rejects.toThrow("offset");
    pageEntities.mockResolvedValueOnce({ entities: [], blockNumber: 100n });
    await expect(catalogPreview("token-metadata", null)).rejects.toThrow("record count");
  });
});
