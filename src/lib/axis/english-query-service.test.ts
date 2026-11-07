import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USDC } from "./model";
const { getDataset, coverageSummary, filteredQuery, datasetQuerySchema } = vi.hoisted(() => ({ getDataset: vi.fn(), coverageSummary: vi.fn(), filteredQuery: vi.fn(), datasetQuerySchema: vi.fn() }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), getDataset, coverageSummary, filteredQuery }));
vi.mock("./dataset-schema", () => ({ datasetQuerySchema }));
import { englishQueryConfiguration, generateEnglishQuery } from "./english-query-service";
const key = "0x" + "1".repeat(64);
const draft = { status: "ready", summary: "Transfers above 100 USDC", questions: [], order: "desc", queries: [{ datasetKey: key, sender: null, recipient: null, fromTime: null, toTime: null, conditions: [{ field: "amountRaw", operator: ">", value: "100", unit: "token" }] }] };
const completed = (content: unknown = draft, finish_reason = "stop") => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: JSON.stringify(content) } }] }), { status: 200 });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("OPENROUTER_API_KEY", "test-only-provider-token"); vi.stubEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash");
  getDataset.mockResolvedValue({ key, name: "Treasury", contract: USDC, description: "private payload must not be sent" });
  coverageSummary.mockResolvedValue({ fromBlock: "100", throughBlock: "200", gaps: [] });
  datasetQuerySchema.mockResolvedValue({ fields: [{ name: "amountRaw", type: "u256", indexed: true }] });
  filteredQuery.mockImplementation((_dataset, _coverage, filters) => `trusted_owner AND verified_coverage${filters.conditions?.length ? " AND amountRaw >= u256(100000001)" : ""}`);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("OpenRouter English query translation", () => {
  it("uses strict structured output, sends schema metadata only, and compiles the validated preview locally", async () => {
    const fetcher = vi.fn().mockResolvedValue(completed()); vi.stubGlobal("fetch", fetcher);
    const result = await generateEnglishQuery({ prompt: "Show transfers above 100 USDC", datasetKeys: [key] });
    expect(result.nativeQuery).toBe("trusted_owner AND verified_coverage AND amountRaw >= u256(100000001) ORDER BY blockNumber:u64 DESC");
    expect(result.queries[0].filters.conditions?.[0].value).toBe("100000001");
    const [url, input] = fetcher.mock.calls[0], body = JSON.parse(input.body);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.provider.require_parameters).toBe(true); expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content).toContain("Treasury"); expect(body.messages[1].content).not.toContain("private payload");
    expect(body.messages[1].content).not.toContain("test-only-provider-token");
    expect(JSON.stringify(englishQueryConfiguration())).not.toContain("test-only-provider-token");
  });
  it("returns missing configuration and bad inputs before contacting any provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(englishQueryConfiguration().configured).toBe(false);
    await expect(generateEnglishQuery({ prompt: "Show transfers", datasetKeys: [key] })).rejects.toMatchObject({ status: 503 });
    for (const input of [{ prompt: "short", datasetKeys: [] }, { prompt: "x".repeat(2001), datasetKeys: [key] }, { prompt: "Show transfers", datasetKeys: [key, key] }]) await expect(generateEnglishQuery(input)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled(); expect(getDataset).not.toHaveBeenCalled();
  });
  it("does not turn partial or malformed provider output into an executable query", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(completed(draft, "length")).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] })));
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 2; i++) await expect(generateEnglishQuery({ prompt: "Show transfers above 100", datasetKeys: [key] })).rejects.toMatchObject({ status: 502 });
  });
  it("returns clarification with no native query or filters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completed({ ...draft, status: "clarification", queries: [], questions: ["Which wallet address should be used?"] })));
    const result = await generateEnglishQuery({ prompt: "Show my transfers", datasetKeys: [key] });
    expect(result.status).toBe("clarification"); expect(result.queries).toEqual([]); expect(result.nativeQuery).toBeUndefined();
  });
  it("does not expose provider error bodies or keys", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("test-only-provider-token upstream internals", { status: 401 })));
    await expect(generateEnglishQuery({ prompt: "Show all transfers", datasetKeys: [key] })).rejects.toThrow("OpenRouter authentication failed");
  });
  it("does not pay for generation when trusted coverage is unavailable", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); filteredQuery.mockImplementation(() => { throw new Error("No verified coverage yet"); });
    await expect(generateEnglishQuery({ prompt: "Show all transfers", datasetKeys: [key] })).rejects.toThrow("No verified coverage yet");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
