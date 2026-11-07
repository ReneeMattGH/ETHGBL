import { describe, expect, it, vi } from "vitest";
import { ExpirationTime } from "@arkiv-network/sdk";
import { defineSchema, str } from "@arkiv-network/sdk/schema";
const { lock, create, nonces } = vi.hoisted(() => ({ lock: vi.fn(async (_name: string, action: () => Promise<unknown>) => action()), create: vi.fn(async () => ({ entityKey: "test" })), nonces: vi.fn(async () => 1) }));
vi.mock("./runtime", () => ({ workerWriter: () => ({ account: { address: "0x" + "34".repeat(20) }, createEntity: create }), arkivReader: () => ({ getTransactionCount: nonces }) }));
vi.mock("./queue", () => ({ withLock: lock }));
import { serialWorkerWriter } from "./signing";
describe("Shared signer serialization", () => {
  it("takes the signer lock for each write and rejects pending nonces before a send", async () => {
    const writer = serialWorkerWriter();
    const schema = defineSchema("test.signer.v1", { value: str() }), options = { expiration: ExpirationTime.fromDays(1) };
    await writer.createEntity(schema, { value: "test" }, options); expect(lock).toHaveBeenCalledWith("signer", expect.any(Function), 600); expect(create).toHaveBeenCalledTimes(1);
    nonces.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await expect(writer.createEntity(schema, { value: "test" }, options)).rejects.toThrow("pending transaction"); expect(create).toHaveBeenCalledTimes(1);
  });
});
