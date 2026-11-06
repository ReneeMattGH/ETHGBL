#!/usr/bin/env node
/**
 * Real-network verification for ARKIV VIZ.
 *
 * Runs against a live Next.js server (default http://localhost:3000) and exercises the same
 * server-only API routes the browser uses. It never fabricates a result: every assertion below
 * is derived from the node's HTTP response.
 *
 * Usage:
 *   npm run dev            # in another terminal
 *   npm run test:live
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ACCESS_KEY = process.env.ARKIV_ACCESS_KEY?.trim() ?? "";

const results = [];
let failed = false;
let rateLimited = false;

function markRateLimited(response) {
  if (response?.status !== 429) return false;
  rateLimited = true;
  return true;
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  const icon = ok ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  record(name, false, detail);
}

async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

function assertNoSecret(text, name) {
  if (!ACCESS_KEY) {
    record(`${name}: access key redaction`, true, "no key configured, nothing to leak");
    return;
  }
  record(
    `${name}: access key redaction`,
    !text.includes(ACCESS_KEY),
    text.includes(ACCESS_KEY) ? "response echoed the access key" : "key not present in response",
  );
}

async function checkStatus() {
  console.log("\n1. Connection status");
  let payload;
  try {
    const { response, text, json } = await request("/api/arkiv/status");
    if (response.status !== 200 || !json) {
      fail("status endpoint", `HTTP ${response.status}: ${text.slice(0, 200)}`);
      return null;
    }
    assertNoSecret(text, "status");
    payload = json;
  } catch (error) {
    fail("status endpoint", error instanceof Error ? error.message : String(error));
    return null;
  }

  record("status endpoint", true, `HTTP 200 via ${payload.rpcHost}`);
  record("network is Rabdi Testnet", payload.network?.label === "Rabdi Testnet", payload.network?.label);
  record("chain id is 7794095", String(payload.network?.chainId) === "7794095", String(payload.network?.chainId));
  record("RPC is connected", payload.connected === true, payload.connected ? "connected" : payload.error?.message);
  record(
    "latest block reported",
    typeof payload.blockNumber === "string" && /^\d+$/.test(payload.blockNumber),
    `block ${payload.blockNumber}`,
  );
  record(
    "block duration reported",
    Number.isFinite(payload.blockDurationMs) && payload.blockDurationMs > 0,
    `${payload.blockDurationMs} ms`,
  );
  return payload;
}

async function query(body) {
  return request("/api/arkiv/query", { method: "POST", body: JSON.stringify(body) });
}

async function checkQuery(status) {
  console.log("\n2. Real query + entity parsing");
  const first = await query({
    network: "rabdi",
    query: "$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC",
    limit: 5,
    offset: 0,
    count: true,
  });

  if (first.response.status === 429) {
    markRateLimited(first.response);
    fail("live query", `HTTP 429 rate limited: ${first.json?.error?.message ?? first.text.slice(0, 200)}`);
    console.log(
      "  The node rejected the request because of rate limits. Add ARKIV_ACCESS_KEY to .env.local and restart the server, then re-run.",
    );
    return;
  }
  if (first.response.status !== 200 || !first.json) {
    fail("live query", `HTTP ${first.response.status}: ${first.text.slice(0, 300)}`);
    return;
  }

  assertNoSecret(first.text, "query");
  const result = first.json;
  record("live query succeeded", true, `${result.durationMs} ms at block ${result.blockNumber}`);
  record("result carries the RPC host", typeof result.rpcHost === "string" && result.rpcHost.length > 0, result.rpcHost);
  record("result carries a block number", /^\d+$/.test(String(result.blockNumber)), `block ${result.blockNumber}`);
  record("entities is an array", Array.isArray(result.entities), `${result.entities?.length ?? "?"} rows`);
  record(
    "node-reported count present",
    typeof result.count === "string",
    `count ${result.count}`,
  );

  const entities = Array.isArray(result.entities) ? result.entities : [];
  record("real entities retrieved", entities.length > 0, `${entities.length} entities`);
  if (entities.length === 0) {
    console.log("  The query returned a real zero-row result; skipping entity shape checks.");
    return;
  }

  const sample = entities[0];
  record("entity keys are 32-byte hex", /^0x[0-9a-fA-F]{64}$/.test(sample.key), sample.key);
  record("entity carries block metadata", Boolean(sample.createdAt && sample.expiresAt), `created ${sample.createdAt}, expires ${sample.expiresAt}`);
  record("entity exposes attributes", sample.attributes && typeof sample.attributes === "object", `${Object.keys(sample.attributes ?? {}).length} attributes`);
  record("entity exposes attribute schema", sample.attributeSchema && typeof sample.attributeSchema === "object", `${Object.keys(sample.attributeSchema ?? {}).length} schema entries`);
  record("owner metadata is present", Boolean(sample.owner), sample.owner ?? "absent");

  const typed = entities
    .flatMap((entity) => Object.values(entity.attributes ?? {}))
    .filter((entry) => entry && entry.value !== null && entry.value !== undefined);
  record(
    "typed attribute values parsed",
    typed.length > 0,
    typed.length > 0 ? typed.slice(0, 4).map((entry) => `${entry.type}=${String(entry.value).slice(0, 18)}`).join(", ") : "no attributes on this page",
  );

  if (status?.blockNumber && entities[0].expiresAt) {
    const expired = BigInt(entities[0].expiresAt) <= BigInt(status.blockNumber);
    record("entity is live at the observed block", !expired, expired ? "oldest row already expired" : "expires after current block");
  }
}

async function checkStablePagination() {
  if (rateLimited) return;
  console.log("\n3. Stable key pagination");
  const sweep = "$key > key(0x0000000000000000000000000000000000000000000000000000000000000000) ORDER BY $key:key ASC";
  const page1 = await query({ network: "rabdi", query: sweep, limit: 5, offset: 0, count: false });
  const page2 = await query({ network: "rabdi", query: sweep, limit: 5, offset: 5, count: false });

  if (page1.response.status !== 200 || page2.response.status !== 200) {
    markRateLimited(page1.response);
    markRateLimited(page2.response);
    fail("pagination", `HTTP ${page1.response.status}/${page2.response.status}`);
    return;
  }

  const a = page1.json.entities ?? [];
  const b = page2.json.entities ?? [];
  record("page 1 returned rows", a.length > 0, `${a.length} rows`);
  record("page 2 returned rows", b.length > 0, `${b.length} rows`);
  if (a.length === 0 || b.length === 0) return;

  const overlap = a.some((entity) => b.some((other) => other.key === entity.key));
  record("pages do not overlap", !overlap, overlap ? "same key appeared on both pages" : "disjoint keys");

  const ordered = [...a, ...b].every((entity, index, list) => index === 0 || BigInt(list[index - 1].key) < BigInt(entity.key));
  record("keys ascend across pages", ordered, `${a[0].key.slice(0, 10)}… → ${b[b.length - 1].key.slice(0, 10)}…`);
}

async function checkZeroResult() {
  if (rateLimited) return;
  console.log("\n4. Zero-result success");
  const { response, text, json } = await query({
    network: "rabdi",
    query: "arkiv.schema = str('__arkiv_viz_no_such_schema__')",
    limit: 5,
    offset: 0,
    count: true,
  });
  if (response.status !== 200 || !json) {
    markRateLimited(response);
    fail("zero-result query", `HTTP ${response.status}: ${text.slice(0, 200)}`);
    return;
  }
  record("zero-result query succeeds", true, "HTTP 200");
  record("zero-result returns no entities", Array.isArray(json.entities) && json.entities.length === 0, `${json.entities?.length} rows`);
  record("zero-result count is zero", json.count === "0", `count ${json.count}`);
}

async function checkInvalidQuery() {
  if (rateLimited) return;
  console.log("\n5. Invalid query handling");
  const { response, text, json } = await query({
    network: "rabdi",
    query: "not a valid arkiv predicate",
    limit: 5,
    offset: 0,
    count: true,
  });
  if (response.status === 429) {
    markRateLimited(response);
    fail("invalid query handling", `HTTP 429 rate limited: ${json?.error?.message ?? text.slice(0, 200)}`);
    return;
  }
  record("invalid query is rejected", response.status === 422, `HTTP ${response.status}`);
  record(
    "rejection includes a structured error",
    json?.error?.code === "QUERY_REJECTED",
    json?.error?.code ?? text.slice(0, 120),
  );
  assertNoSecret(text, "invalid query");
}

async function checkRefresh() {
  if (rateLimited) return;
  console.log("\n6. Manual re-execution (refresh)");
  const body = {
    network: "rabdi",
    query: "EXISTS(arkiv.schema) ORDER BY $key:key ASC",
    limit: 3,
    offset: 0,
    count: true,
  };
  const first = await query(body);
  const second = await query(body);

  if (first.response.status !== 200 || second.response.status !== 200) {
    markRateLimited(first.response);
    markRateLimited(second.response);
    fail("refresh", `HTTP ${first.response.status}/${second.response.status}`);
    return;
  }

  record("second execution succeeded", true, `block ${second.json.blockNumber}`);
  record(
    "fetchedAt changes between executions",
    first.json.fetchedAt !== second.json.fetchedAt,
    `${first.json.fetchedAt} → ${second.json.fetchedAt}`,
  );
  record(
    "each execution reports its own block",
    typeof second.json.blockNumber === "string",
    `block ${second.json.blockNumber}`,
  );
}

async function checkValidation() {
  console.log("\n7. Request validation");
  const { response, json } = await request("/api/arkiv/query", {
    method: "POST",
    body: JSON.stringify({ network: "rabdi", query: "EXISTS(arkiv.schema)", limit: 500, offset: 0, count: true }),
  });
  record("limit above 100 is rejected", response.status === 400, `HTTP ${response.status}`);
  record("validation error is structured", json?.error?.code === "INVALID_REQUEST", json?.error?.code ?? "missing");
}

async function main() {
  console.log(`ARKIV VIZ live verification against ${BASE_URL}`);
  console.log(`Access key configured: ${ACCESS_KEY ? "yes" : "no (public RPC)"}`);

  const status = await checkStatus();
  if (!status?.connected) {
    console.log("\nThe node is not reachable, so live query checks cannot run.");
    process.exit(1);
  }

  await checkQuery(status);
  await checkStablePagination();
  await checkZeroResult();
  await checkInvalidQuery();
  await checkRefresh();
  await checkValidation();

  const passed = results.filter((entry) => entry.ok).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (failed) {
    const rateLimited = results.some(
      (entry) => !entry.ok && /429|rate limit/i.test(entry.detail ?? ""),
    );
    if (rateLimited) {
      console.log(
        "Some checks failed because the public Rabdi RPC rate-limited this run. Add ARKIV_ACCESS_KEY to .env.local and restart the server for a dedicated quota, then re-run.",
      );
    }
    console.log("Live verification FAILED. Review the failures above; no result was fabricated.");
    process.exit(1);
  }
  console.log("Live verification passed against the real Rabdi network.");
}

main().catch((error) => {
  console.error(`Live verification crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
