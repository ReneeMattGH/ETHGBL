import { createServer } from "node:http";
import { Bee } from "@ethersphere/bee-js";
import { expect, it } from "vitest";

it("uses the installed Bee SDK to send Node File collections with public/direct upload headers", async () => {
  // A local HTTP protocol check, not evidence of Swarm network storage.
  const reference = "b".repeat(64), batch = "c".repeat(64);
  const requests: { path: string; headers: Record<string, unknown>; body: Buffer }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ path: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ reference }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const bee = new Bee(`http://127.0.0.1:${port}`, { timeout: 3000, headers: { Authorization: "Bearer test-token" } });
    const uploaded = await bee.collection.uploadFromFileList(batch, [new File(["hello"], "results.json", { type: "application/json" }), new File(["report"], "index.html", { type: "text/html" })], { encrypt: false, deferred: false, indexDocument: "index.html" });
    expect(uploaded.reference.toHex()).toBe(reference);
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/bzz");
    expect(requests[0].headers).toMatchObject({ "swarm-postage-batch-id": batch, "swarm-deferred-upload": "false", "swarm-encrypt": "false", "swarm-index-document": "index.html", "swarm-collection": "true", authorization: "Bearer test-token" });
    expect(requests[0].body.toString()).toContain("results.json");
    expect(requests[0].body.toString()).toContain("hello");
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
