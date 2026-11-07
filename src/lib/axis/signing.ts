import { arkivReader, workerWriter } from "./runtime";
import { withLock } from "./queue";

// Hold the shared signer only for a transaction, not while fetching source history or checking coverage.
export function serialWorkerWriter() {
  const writer = workerWriter(), methods = new Set(["createEntity", "patchEntity", "executeBatch", "extendEntity", "deleteEntity", "changeOwnership"]);
  return new Proxy(writer, { get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof property !== "string" || !methods.has(property) || typeof value !== "function") return value;
    return (...args: unknown[]) => withLock("signer", async () => {
      const reader = arkivReader();
      const [latest, pending] = await Promise.all([reader.getTransactionCount({ address: writer.account.address, blockTag: "latest" }), reader.getTransactionCount({ address: writer.account.address, blockTag: "pending" })]);
      if (latest !== pending) throw new Error("Writer has a pending transaction; reconcile before sending another write.");
      return Reflect.apply(value, target, args);
    }, 600);
  } });
}
