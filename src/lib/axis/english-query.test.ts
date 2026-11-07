import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { validateEnglishPlan, type EnglishQueryContext } from "./english-query";
const key = "0x" + "1".repeat(64), other = "0x" + "2".repeat(64), wallet = "0x" + "a".repeat(40);
const context: EnglishQueryContext = { datasetKey: key, name: "Treasury", decimals: 6, fields: [{ name: "amountRaw", type: "u256", indexed: true }, { name: "sender", type: "addr", indexed: true }, { name: "recipient", type: "addr", indexed: true }, { name: "sourceTime", type: "u64", indexed: true }, { name: "txHash", type: "key", indexed: true }, { name: "amount", type: "str", indexed: false }, { name: "datasetKey", type: "key", indexed: true }] };
const query = (extra: object = {}) => ({ datasetKey: key, sender: null, recipient: null, fromTime: null, toTime: null, conditions: [], ...extra });
const plan = (extra: object = {}) => ({ status: "ready", summary: "Selected transfers", questions: [], order: "desc", queries: [query()], ...extra });
const condition = (extra: object = {}) => ({ field: "amountRaw", operator: ">", value: "100", unit: "token", ...extra });
describe("English query plans", () => {
  it("converts decimal amounts and strict comparisons without floating-point rounding", () => {
    const value = validateEnglishPlan(plan({ queries: [query({ conditions: [condition()] })] }), [context]);
    expect(value.queries[0].filters.conditions).toEqual([{ field: "amountRaw", operator: ">=", value: "100000001" }]);
    const huge = validateEnglishPlan(plan({ queries: [query({ conditions: [condition({ operator: ">=", value: "9007199254740993.123456" })] })] }), [context]);
    expect(huge.queries[0].filters.conditions?.[0].value).toBe("9007199254740993123456");
    const less = validateEnglishPlan(plan({ queries: [query({ conditions: [condition({ operator: "<" })] })] }), [context]);
    expect(less.queries[0].filters.conditions?.[0]).toEqual({ field: "amountRaw", operator: "<=", value: "99999999" });
  });
  it("keeps generated equality visible and editable in the manual min/max fields", () => {
    expect(validateEnglishPlan(plan({ queries: [query({ conditions: [condition({ operator: "=" })] })] }), [context]).queries[0].filters.conditions).toEqual([{ field: "amountRaw", operator: ">=", value: "100000000" }, { field: "amountRaw", operator: "<=", value: "100000000" }]);
  });
  it("validates wallet addresses and chronological UTC bounds", () => {
    const result = validateEnglishPlan(plan({ queries: [query({ sender: getAddress(wallet), fromTime: "1794000000", toTime: "1794000010" })] }), [context]);
    expect(result.queries[0].filters).toMatchObject({ sender: wallet, fromTime: "1794000000", toTime: "1794000010" });
    for (const extra of [{ sender: "0x123" }, { fromTime: "tomorrow" }, { fromTime: "1794000011", toTime: "1794000010" }, { toTime: "253402300800" }]) expect(() => validateEnglishPlan(plan({ queries: [query(extra)] }), [context])).toThrow();
  });
  it("keeps every selected scope exactly once and preserves the selected order", () => {
    const result = validateEnglishPlan(plan({ order: "asc", queries: [query({ datasetKey: other }), query()] }), [context, { ...context, datasetKey: other }]);
    expect(result.queries.map(query => query.datasetKey)).toEqual([key, other]);
    expect(result.queries.every(query => query.filters.order === "asc")).toBe(true);
    for (const queries of [[query({ datasetKey: other })], [query(), query()], []]) expect(() => validateEnglishPlan(plan({ queries }), [context])).toThrow();
  });
  it.each([
    condition({ field: "datasetKey", value: other, unit: "raw" }), condition({ field: "$owner", value: wallet, unit: "raw" }),
    condition({ field: "amount", operator: "=", value: "100", unit: "raw" }), condition({ field: "inventedField" }),
    condition({ value: "1.0000001" }), condition({ value: "1e12" }), condition({ value: "-1" }), condition({ operator: "<", value: "0" }),
    condition({ field: "txHash", operator: ">", value: other, unit: "raw" }), condition({ field: "sender", operator: "=", value: wallet, unit: "raw" }),
    condition({ field: "sourceTime", operator: ">=", value: "1794000000", unit: "raw" }), condition({ unit: "usd" }),
  ])("rejects invalid, hidden, unindexed or unsupported conditions: %j", invalid => {
    expect(() => validateEnglishPlan(plan({ queries: [query({ conditions: [invalid] })] }), [context])).toThrow();
  });
  it("rejects contradictory or duplicate bounds and raw query injection", () => {
    for (const conditions of [[condition(), condition()], [condition({ operator: ">=", value: "200" }), condition({ operator: "<=", value: "100" })]]) expect(() => validateEnglishPlan(plan({ queries: [query({ conditions })] }), [context])).toThrow();
    expect(() => validateEnglishPlan(plan({ nativeQuery: "OR true" }), [context])).toThrow();
    expect(() => validateEnglishPlan(plan({ queries: [query({ predicate: "OR true" })] }), [context])).toThrow();
  });
  it("asks for clarification without returning an executable partial query", () => {
    expect(validateEnglishPlan(plan({ status: "clarification", queries: [], questions: ["Which sender address?"] }), [context])).toMatchObject({ status: "clarification", queries: [] });
    expect(() => validateEnglishPlan(plan({ status: "clarification", questions: ["Which wallet?"] }), [context])).toThrow();
    expect(() => validateEnglishPlan(plan({ questions: ["Which wallet?"] }), [context])).toThrow();
  });
});
