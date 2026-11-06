import { describe, expect, it } from "vitest";
import {
  appendPredicate,
  buildPredicate,
  renderLiteral,
  roughQueryError,
  tokenizeQuery,
} from "@/lib/arkiv/query-language";

describe("roughQueryError", () => {
  it("accepts a balanced query", () => {
    expect(roughQueryError("$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC")).toBeNull();
  });

  it("rejects empty input, unbalanced quotes and unbalanced parentheses", () => {
    expect(roughQueryError("   ")).toBeTruthy();
    expect(roughQueryError("name = str('unterminated)")).toContain("Unbalanced quotes");
    expect(roughQueryError("(name = str('a')")).toContain("Unbalanced parentheses");
    expect(roughQueryError("name = str('a'))")).toContain("Unbalanced parentheses");
  });
});

describe("renderLiteral", () => {
  it("escapes embedded string quotes with the Arkiv syntax", () => {
    expect(renderLiteral("str", "it's").literal).toBe("str('it''s')");
  });

  it("enforces integer ranges", () => {
    expect(renderLiteral("i32", "2147483648").error).toBeTruthy();
    expect(renderLiteral("i32", "-2147483648").literal).toBe("i32(-2147483648)");
    expect(renderLiteral("u64", "18446744073709551616").error).toBeTruthy();
    expect(renderLiteral("u64", "18446744073709551615").literal).toBe("u64(18446744073709551615)");
  });

  it("validates decimal, address, key and bool literals", () => {
    expect(renderLiteral("dec", "4.5").literal).toBe("dec(4.5)");
    expect(renderLiteral("dec", "4.1234567890123456789").error).toBeTruthy();
    expect(renderLiteral("addr", "0x1234").error).toBeTruthy();
    expect(renderLiteral("key", `0x${"ab".repeat(32)}`).literal).toBe(`key(0x${"ab".repeat(32)})`);
    expect(renderLiteral("bool", "true").literal).toBe("true");
    expect(renderLiteral("bool", "TRUE").error).toBeTruthy();
  });
});

describe("buildPredicate", () => {
  it("forces the node-defined literal type for system attributes", () => {
    const result = buildPredicate({
      field: "$expiresAt",
      operator: "gt",
      type: "str",
      value: "100",
    });
    expect(result.predicate).toBe("$expiresAt > u64(100)");
  });

  it("builds BETWEEN and EXISTS predicates", () => {
    expect(
      buildPredicate({
        field: "score",
        operator: "between",
        type: "u64",
        value: "1",
        value2: "10",
      }).predicate,
    ).toBe("score BETWEEN u64(1) AND u64(10)");
    expect(
      buildPredicate({ field: "score", operator: "exists", type: "u64", value: "" }).predicate,
    ).toBe("EXISTS(score)");
  });

  it("refuses system attributes that are not filterable", () => {
    const result = buildPredicate({
      field: "$createdAt",
      operator: "gt",
      type: "u64",
      value: "1",
    });
    expect(result.predicate).toBeNull();
    expect(result.error).toContain("$key, $owner, $creator and $expiresAt");
  });
});

describe("appendPredicate", () => {
  it("inserts the predicate before ORDER BY", () => {
    expect(appendPredicate("name = str('a') ORDER BY $key:key ASC", "score > u64(1)")).toBe(
      "name = str('a') AND score > u64(1) ORDER BY $key:key ASC",
    );
  });

  it("returns the predicate alone for an empty query", () => {
    expect(appendPredicate("", "score > u64(1)")).toBe("score > u64(1)");
  });
});

describe("tokenizeQuery", () => {
  it("classifies literals, types, system attributes and keywords", () => {
    const tokens = tokenizeQuery("$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC");
    expect(tokens.find((token) => token.text === "$expiresAt" && token.className === "q-token-system")).toBeDefined();
    expect(tokens.some((token) => token.text === "u64" && token.className === "q-token-type")).toBe(true);
    expect(tokens.some((token) => token.text === "u64" && token.className === "q-token-attribute")).toBe(true);
    expect(tokens.some((token) => token.text === "ORDER" && token.className === "q-token-keyword")).toBe(true);
    expect(tokens.map((token) => token.text).join("")).toBe(
      "$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC",
    );
  });
});
