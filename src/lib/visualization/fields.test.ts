import { describe, expect, it } from "vitest";
import type { EntityDto } from "@/lib/arkiv/types";
import {
  getNumericValue,
  hasFieldValue,
  inferFields,
  parseNumericValue,
} from "@/lib/visualization/fields";

let keySeed = 0;

function entity(
  attributes: EntityDto["attributes"] = {},
  attributeSchema: EntityDto["attributeSchema"] = {},
  overrides: Partial<EntityDto> = {},
): EntityDto {
  keySeed += 1;
  return {
    key: `0x${keySeed.toString(16).padStart(64, "0")}`,
    owner: `0x${"11".repeat(20)}`,
    creator: `0x${"22".repeat(20)}`,
    createdAt: "10",
    updatedAt: "10",
    expiresAt: "1000",
    creationFlags: null,
    attributes,
    attributeSchema,
    ...overrides,
  };
}

function fieldByName(entities: EntityDto[], name: string) {
  const field = inferFields(entities).find((entry) => entry.name === name);
  if (!field) throw new Error(`Field ${name} was not inferred`);
  return field;
}

describe("parseNumericValue", () => {
  it("parses the Arkiv numeric type representations", () => {
    expect(parseNumericValue("u64", "42")).toBe(42);
    expect(parseNumericValue("i32", -7)).toBe(-7);
    expect(parseNumericValue("u256", "1234567890123")).toBe(1234567890123);
    expect(parseNumericValue("dec", "4.50")).toBe(4.5);
  });

  it("rejects integers that cannot be represented exactly", () => {
    expect(parseNumericValue("u64", "9007199254740993")).toBeNull();
    expect(parseNumericValue("u256", "115792089237316195423570985008687907853269984665640564039457584007913129639935")).toBeNull();
  });

  it("rejects values that do not match the declared type", () => {
    expect(parseNumericValue("i32", "4.5")).toBeNull();
    expect(parseNumericValue("u64", "-1")).toBeNull();
    expect(parseNumericValue("str", "12")).toBeNull();
    expect(parseNumericValue("dec", "abc")).toBeNull();
    expect(parseNumericValue("u64", true)).toBeNull();
    expect(parseNumericValue("u64", null)).toBeNull();
    expect(parseNumericValue("u64", Number.NaN)).toBeNull();
  });
});

describe("inferFields", () => {
  it("combines attribute schema and observed values without assuming a uniform schema", () => {
    const entities = [
      entity(
        {
          score: { type: "u64", value: "10" },
          tag: { type: "str", value: "a" },
        },
        { score: { type: "u64", indexed: true }, tag: { type: "str", indexed: false } },
      ),
      entity(
        { score: { type: "u64", value: "20" } },
        { score: { type: "u64", indexed: false }, tag: { type: "str", indexed: true } },
      ),
    ];

    const score = fieldByName(entities, "score");
    expect(score.type).toBe("u64");
    expect(score.types).toEqual(["u64"]);
    expect(score.numeric).toBe(true);
    expect(score.categorical).toBe(false);
    expect(score.indexed).toBe(true);
    expect(score.presentCount).toBe(2);
    expect(score.presence).toBe(1);

    const tag = fieldByName(entities, "tag");
    expect(tag.presentCount).toBe(1);
    expect(tag.presence).toBe(0.5);
    expect(tag.indexed).toBe(true);
    expect(tag.categorical).toBe(true);
  });

  it("marks conflicting attribute types as mixed instead of chartable", () => {
    const entities = [
      entity({ value: { type: "str", value: "high" } }),
      entity({ value: { type: "u64", value: "1" } }),
    ];
    const value = fieldByName(entities, "value");
    expect(value.type).toBe("mixed");
    expect(value.types).toEqual(["str", "u64"]);
    expect(value.numeric).toBe(false);
    expect(value.categorical).toBe(false);
    expect(value.chartable).toBe(false);
  });

  it("keeps schema-only fields with an unknown indexed flag when the node did not report it", () => {
    const entities = [
      entity(
        {},
        { flag: { type: "bool", indexed: false }, hidden: { type: "str", indexed: null } },
      ),
    ];
    const flag = fieldByName(entities, "flag");
    expect(flag.presentCount).toBe(0);
    expect(flag.type).toBe("bool");
    expect(flag.indexed).toBe(false);
    const hidden = fieldByName(entities, "hidden");
    expect(hidden.indexed).toBeNull();
  });

  it("exposes system metadata fields backed by entity properties", () => {
    const entities = [entity({}, {}, { owner: null, createdAt: null })];
    const key = fieldByName(entities, "$key");
    expect(key.presentCount).toBe(1);
    expect(key.type).toBe("key");
    const owner = fieldByName(entities, "$owner");
    expect(owner.presentCount).toBe(0);
    const createdAt = fieldByName(entities, "$createdAt");
    expect(createdAt.numeric).toBe(true);
    expect(createdAt.presentCount).toBe(0);
  });
});

describe("entity value access", () => {
  it("reads numeric attribute values only through their declared type", () => {
    const entities = [
      entity({ amount: { type: "u64", value: "9007199254740993" } }),
      entity({ amount: { type: "u64", value: "5" } }),
    ];
    const amount = fieldByName(entities, "amount");
    expect(getNumericValue(entities[0], amount)).toBeNull();
    expect(getNumericValue(entities[1], amount)).toBe(5);
  });

  it("checks attribute presence on the entity itself", () => {
    const entities = [
      entity({ present: { type: "str", value: "yes" } }),
      entity({}),
    ];
    const present = fieldByName(entities, "present");
    expect(hasFieldValue(entities[0], present)).toBe(true);
    expect(hasFieldValue(entities[1], present)).toBe(false);
  });
});
