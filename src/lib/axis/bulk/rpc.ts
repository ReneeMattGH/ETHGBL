import { safeError } from "../runtime";

export class RpcFailure extends Error {
  constructor(message: string, public readonly code?: number) { super(message); this.name = "RpcFailure"; }
}
export const unsupportedMethod = (error: unknown) => error instanceof RpcFailure && (error.code === -32601 || /method.*(?:not supported|not available|not found|does not exist|unsupported)/i.test(error.message));
export type RpcRead = <T>(method: string, params: unknown[]) => Promise<T>;
export type RpcSource = { read: RpcRead; host: string; calls: () => number };
export function rpcSource(endpoint: string | undefined, options: { timeoutMs?: number; attempts?: number; maxBytes?: number; minIntervalMs?: number } = {}): RpcSource {
  if (!endpoint?.trim()) throw new Error("POLYGON_RPC_URL is not configured.");
  const url = new URL(endpoint.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) RPC endpoint without embedded user credentials.");
  let calls = 0;
  const interval = options.minIntervalMs ?? 0;
  if (!Number.isInteger(interval) || interval < 0 || interval > 30_000) throw new Error("Invalid RPC pacing interval.");
  let nextSlot = 0, slots = Promise.resolve();
  const read: RpcRead = async <T>(method: string, params: unknown[]): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      let retryable = false;
      try {
        const slot = slots.then(async () => { const delay = nextSlot - Date.now(); if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay)); nextSlot = Date.now() + interval; });
        slots = slot.catch(() => {}); await slot;
        const requestId = ++calls;
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) });
        retryable = response.status === 429 || response.status >= 500;
        const reader = response.body?.getReader();
        if (!reader) throw new RpcFailure("RPC returned no body.");
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break;
            size += next.value.byteLength;
            if (size > (options.maxBytes ?? 32 * 1024 * 1024)) { await reader.cancel(); throw new RpcFailure("RPC response exceeds the configured byte budget."); }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        const body = Buffer.concat(chunks).toString("utf8");
        let envelope;
        try { envelope = JSON.parse(body); } catch { throw new RpcFailure(`RPC HTTP ${response.status}: ${safeError(body).slice(0, 180) || "invalid JSON response"}`); }
        if (!envelope || typeof envelope !== "object" || envelope.jsonrpc !== "2.0" || envelope.id !== requestId) throw new RpcFailure("RPC response envelope or request identity mismatch.");
        if (envelope.error) {
          retryable ||= envelope.error.code === -32005 || /rate limit|too many requests|temporarily unavailable/i.test(String(envelope.error.message));
          throw new RpcFailure(safeError(new Error(String(envelope.error.message))), envelope.error.code);
        }
        if (!response.ok) throw new RpcFailure(`RPC HTTP ${response.status}.`);
        if (!("result" in envelope)) throw new RpcFailure("RPC response has no result.");
        return envelope.result as T;
      } catch (error) {
        if (!(error instanceof RpcFailure) && (error instanceof TypeError || (error instanceof Error && /timeout|abort|fetch failed/i.test(error.message)))) retryable = true;
        if (!retryable || attempt + 1 >= (options.attempts ?? 3)) {
          if (error instanceof RpcFailure) throw error;
          throw new RpcFailure(safeError(error));
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * 2 ** attempt, 20_000)));
      }
    }
  };
  return { read, host: url.hostname, calls: () => calls };
}
