import { describe, it, expect, vi, afterEach } from "vitest";
import { retryRead, safeError } from "./runtime";
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("Read transport recovery", () => {
  it("backs off and recovers from a temporary RPC failure", async () => {
    vi.useFakeTimers(); let calls = 0;
    const pending = retryRead(async () => { if (++calls < 3) throw new Error("429 temporarily unavailable"); return "source record"; });
    await vi.runAllTimersAsync(); expect(await pending).toBe("source record"); expect(calls).toBe(3);
  });
  it("returns a persistent failure instead of manufacturing a response", async () => {
    vi.useFakeTimers(); const action = vi.fn(async () => { throw new Error("RPC unreachable"); });
    const pending = retryRead(action, 2); const rejection = expect(pending).rejects.toThrow("RPC unreachable");
    await vi.runAllTimersAsync(); await rejection; expect(action).toHaveBeenCalledTimes(2);
  });
  it("redacts configured credentials, embedded URL tokens and signer keys", () => {
    vi.stubEnv("ARKIV_ACCESS_KEY", "example-access-secret"); vi.stubEnv("POLYGON_RPC_URL", "https://provider.test/v2/example-provider-secret"); vi.stubEnv("AXIS_INDEXER_PRIVATE_KEY", "test-signer-secret");
    const result = safeError(new Error("example-access-secret example-provider-secret test-signer-secret https://provider.test/v2/example-provider-secret"));
    expect(result).not.toContain("example-access-secret"); expect(result).not.toContain("example-provider-secret"); expect(result).not.toContain("test-signer-secret");
  });
});
