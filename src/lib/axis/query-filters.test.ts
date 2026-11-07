import { describe, expect, it } from "vitest";
import { compileAttributeConditions, filtersForSchema, queryableAttributes, validateAttributeConditions, type DatasetAttribute } from "./query-filters";
import { validateFilters } from "./core";
import { transferAttributeFields } from "./schemas";

const fields: DatasetAttribute[] = [
  { name: "amountRaw", type: "u256", indexed: true },
  { name: "sender", type: "addr", indexed: true },
  { name: "txHash", type: "key", indexed: true },
  { name: "category", type: "str", indexed: true },
  { name: "active", type: "bool", indexed: true },
  { name: "count", type: "u64", indexed: true },
];
describe("Schema-based dataset filters", () => {
  it("exposes queryable data fields without block limits or internal scope attributes", () => {
    const available = queryableAttributes(transferAttributeFields).map(field => field.name);
    expect(available).toEqual(expect.arrayContaining(["sender", "recipient", "sourceTime", "amountRaw", "txHash"]));
    for (const name of ["datasetKey", "blockNumber", "chainId", "contract", "amount", "rpcHost"]) expect(available).not.toContain(name);
  });
  it("preserves exact large integers through validation and predicate compilation", () => {
    const value = "9007199254740993123456789";
    const conditions = [{ field: "amountRaw", operator: ">=" as const, value }];
    expect(validateFilters({ conditions }).conditions).toEqual(conditions);
    expect(compileAttributeConditions(conditions, fields)).toEqual([`amountRaw >= u256(${value})`]);
  });
  it("validates numeric bounds, range direction, duplicates, hash length and operators", () => {
    for (const conditions of [
      [{ field: "amountRaw", operator: "=", value: "-1" }],
      [{ field: "count", operator: "=", value: (2n ** 64n).toString() }],
      [{ field: "amountRaw", operator: "=", value: (2n ** 256n).toString() }],
      [{ field: "amountRaw", operator: ">=", value: "10" }, { field: "amountRaw", operator: "<=", value: "9" }],
      [{ field: "count", operator: "=", value: "1" }, { field: "count", operator: "=", value: "2" }],
      [{ field: "txHash", operator: "=", value: "0x12" }],
      [{ field: "sender", operator: ">=", value: "0x" + "a".repeat(40) }],
      [{ field: "active", operator: "=", value: "yes" }],
      [{ field: "datasetKey", operator: "=", value: "0x" + "a".repeat(64) }],
      [{ field: "amountRaw", operator: "=", value: "0) OR true (" }],
    ]) expect(() => validateAttributeConditions(conditions, fields)).toThrow();
  });
  it("escapes string literals and emits typed addresses, keys and booleans", () => {
    const address = "0x" + "a".repeat(40), hash = "0x" + "b".repeat(64);
    expect(compileAttributeConditions([
      { field: "category", operator: "=", value: "Bob's records" },
      { field: "sender", operator: "=", value: address },
      { field: "txHash", operator: "=", value: hash },
      { field: "active", operator: "=", value: "false" },
    ], fields)).toEqual(["category = str('Bob''s records')", `sender = addr(${address})`, `txHash = key(${hash})`, "active = false"]);
  });
  it("removes saved filters that are unavailable in the selected schema", () => {
    expect(filtersForSchema({ sender: "0x" + "a".repeat(40), recipient: "0x" + "b".repeat(40), fromTime: "1", conditions: [{ field: "amountRaw", operator: "=", value: "1" }] }, [{ name: "recipient", type: "addr", indexed: true }])).toEqual({ recipient: "0x" + "b".repeat(40), order: "desc" });
  });
});
