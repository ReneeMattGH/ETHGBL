export const MAX_QUERY_LENGTH = 2_000;

export const DEFAULT_QUERY = "$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC";

export type FilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "startswith"
  | "exists";

export const FILTER_OPERATORS: {
  value: FilterOperator;
  label: string;
  token: string;
  needsValue: boolean;
  needsSecondValue: boolean;
}[] = [
  { value: "eq", label: "equals", token: "=", needsValue: true, needsSecondValue: false },
  { value: "gt", label: "greater than", token: ">", needsValue: true, needsSecondValue: false },
  { value: "gte", label: "greater or equal", token: ">=", needsValue: true, needsSecondValue: false },
  { value: "lt", label: "less than", token: "<", needsValue: true, needsSecondValue: false },
  { value: "lte", label: "less or equal", token: "<=", needsValue: true, needsSecondValue: false },
  { value: "between", label: "between", token: "BETWEEN", needsValue: true, needsSecondValue: true },
  { value: "startswith", label: "starts with", token: "STARTSWITH", needsValue: true, needsSecondValue: false },
  { value: "exists", label: "exists", token: "EXISTS", needsValue: false, needsSecondValue: false },
];

export const LITERAL_TYPES = [
  { value: "str", label: "str — text" },
  { value: "i32", label: "i32 — 32-bit integer" },
  { value: "u64", label: "u64 — unsigned 64-bit" },
  { value: "u256", label: "u256 — unsigned 256-bit" },
  { value: "dec", label: "dec — decimal" },
  { value: "addr", label: "addr — 20-byte address" },
  { value: "key", label: "key — 32-byte entity key" },
  { value: "bool", label: "bool — true / false" },
] as const;

export type LiteralType = (typeof LITERAL_TYPES)[number]["value"];

export const SYSTEM_FILTER_FIELDS: Record<string, { type: LiteralType; label: string }> = {
  $key: { type: "key", label: "Entity key" },
  $owner: { type: "addr", label: "Owner" },
  $creator: { type: "addr", label: "Creator" },
  $expiresAt: { type: "u64", label: "Expires at block" },
};

export const QUERY_EXAMPLES: { label: string; description: string; query: string }[] = [
  {
    label: "All live entities",
    description: "Every entity that has not expired, newest expiry first.",
    query: "$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC",
  },
  {
    label: "Schema-tagged entities",
    description: "Entities written through any named Arkiv schema.",
    query: "EXISTS(arkiv.schema) ORDER BY $key:key ASC",
  },
  {
    label: "Entities in one schema",
    description: "Filter by the schema tag written by defineSchema().",
    query: "arkiv.schema = str('posts')",
  },
  {
    label: "Keyspace sweep",
    description: "Stable, key-ordered pagination across the live keyspace.",
    query:
      "$key > key(0x0000000000000000000000000000000000000000000000000000000000000000) ORDER BY $key:key ASC",
  },
];

const ATTRIBUTE_NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;
const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_RE = /^-?\d+(?:\.\d{1,18})?$/;

export function validateFilterField(field: string): string | null {
  const trimmed = field.trim();
  if (!trimmed) return "Choose an attribute to filter on.";
  if (trimmed.startsWith("$")) {
    if (trimmed in SYSTEM_FILTER_FIELDS) return null;
    return `${trimmed} cannot be filtered on. Arkiv exposes $key, $owner, $creator and $expiresAt as filterable system attributes.`;
  }
  if (!ATTRIBUTE_NAME_RE.test(trimmed)) {
    return "Attribute names must start with a letter and may contain letters, digits, dots, underscores and hyphens.";
  }
  return null;
}

function parseUnsigned(raw: string, bits: number, label: string): string {
  if (!/^\d+$/.test(raw.trim())) return `${label} needs a non-negative integer.`;
  try {
    const value = BigInt(raw.trim());
    const max = (BigInt(1) << BigInt(bits)) - BigInt(1);
    if (value > max) return `${label} must be at most ${max.toString()}.`;
    return "";
  } catch {
    return `${label} is not a valid integer.`;
  }
}

export function renderLiteral(type: LiteralType, raw: string): { literal: string | null; error: string | null } {
  const value = raw.trim();
  switch (type) {
    case "str":
      return { literal: `str('${value.replace(/'/g, "''")}')`, error: null };
    case "i32": {
      if (!/^-?\d+$/.test(value)) return { literal: null, error: "i32 needs a whole number." };
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < -2147483648 || n > 2147483647) {
        return { literal: null, error: "i32 must be between -2,147,483,648 and 2,147,483,647." };
      }
      return { literal: `i32(${value})`, error: null };
    }
    case "u64": {
      const error = parseUnsigned(value, 64, "u64");
      return { literal: error ? null : `u64(${value})`, error: error || null };
    }
    case "u256": {
      const error = parseUnsigned(value, 256, "u256");
      return { literal: error ? null : `u256(${value})`, error: error || null };
    }
    case "dec": {
      if (!DECIMAL_RE.test(value)) {
        return { literal: null, error: "dec needs a decimal number with at most 18 decimal places." };
      }
      return { literal: `dec(${value})`, error: null };
    }
    case "addr":
      if (!HEX_ADDRESS_RE.test(value)) {
        return { literal: null, error: "addr needs a 0x-prefixed, 20-byte hex address." };
      }
      return { literal: `addr(${value})`, error: null };
    case "key":
      if (!HEX_KEY_RE.test(value)) {
        return { literal: null, error: "key needs a 0x-prefixed, 32-byte hex key." };
      }
      return { literal: `key(${value})`, error: null };
    case "bool":
      if (value !== "true" && value !== "false") {
        return { literal: null, error: "bool must be true or false." };
      }
      return { literal: value, error: null };
    default:
      return { literal: null, error: "Unsupported literal type." };
  }
}

export type FilterDraft = {
  field: string;
  operator: FilterOperator;
  type: LiteralType;
  value: string;
  value2?: string;
};

export function buildPredicate(draft: FilterDraft): { predicate: string | null; error: string | null } {
  const field = draft.field.trim();
  const fieldError = validateFilterField(field);
  if (fieldError) return { predicate: null, error: fieldError };

  const system = SYSTEM_FILTER_FIELDS[field];
  const type = system ? system.type : draft.type;
  const operator = FILTER_OPERATORS.find((op) => op.value === draft.operator);
  if (!operator) return { predicate: null, error: "Choose a supported operator." };

  if (operator.value === "exists") {
    return { predicate: `EXISTS(${field})`, error: null };
  }

  const first = renderLiteral(type, draft.value);
  if (first.error || !first.literal) {
    return { predicate: null, error: first.error ?? "Enter a valid value." };
  }

  if (operator.value === "between") {
    const second = renderLiteral(type, draft.value2 ?? "");
    if (second.error || !second.literal) {
      return { predicate: null, error: second.error ?? "Enter a valid upper bound." };
    }
    return { predicate: `${field} BETWEEN ${first.literal} AND ${second.literal}`, error: null };
  }

  return { predicate: `${field} ${operator.token} ${first.literal}`, error: null };
}

export function appendPredicate(query: string, predicate: string): string {
  const trimmed = query.trim();
  if (!trimmed) return predicate;
  const orderByIndex = trimmed.toUpperCase().lastIndexOf("ORDER BY");
  if (orderByIndex === -1) {
    return `${trimmed} AND ${predicate}`;
  }
  const body = trimmed.slice(0, orderByIndex).trim();
  const order = trimmed.slice(orderByIndex).trim();
  const combined = body ? `${body} AND ${predicate}` : predicate;
  return `${combined} ${order}`;
}

export type QueryToken = { text: string; className: string };

const TOKEN_RE =
  /('(?:[^']|'')*')|(0x[0-9a-fA-F]+)|(\b\d+(?:\.\d+)?\b)|(\$[A-Za-z][A-Za-z0-9._-]*)|(\b(?:str|i32|u64|u256|dec|addr|key|bool|bytes)(?=\s*\())|(\b(?:AND|OR|NOT|EXISTS|BETWEEN|STARTSWITH|ORDER|BY|ASC|DESC|TRUE|FALSE)\b)|([A-Za-z][A-Za-z0-9._-]*)|(>=|<=|!=|<>|=|>|<)|([(),:])/gi;

export function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(query)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: query.slice(lastIndex, match.index), className: "q-token-plain" });
    }

    let className = "q-token-plain";
    if (match[1]) className = "q-token-string";
    else if (match[2] || match[3]) className = "q-token-number";
    else if (match[4]) className = "q-token-system";
    else if (match[5]) className = "q-token-type";
    else if (match[6]) className = "q-token-keyword";
    else if (match[7]) className = "q-token-attribute";
    else if (match[8]) className = "q-token-operator";
    else if (match[9]) className = "q-token-punct";

    tokens.push({ text: match[0], className });
    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < query.length) {
    tokens.push({ text: query.slice(lastIndex), className: "q-token-plain" });
  }

  return tokens;
}

export function roughQueryError(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return "Enter an Arkiv query before running it.";
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return `Query exceeds the ${MAX_QUERY_LENGTH.toLocaleString()} character limit.`;
  }
  const singleQuotes = (trimmed.match(/'/g) ?? []).length;
  if (singleQuotes % 2 !== 0) {
    return "Unbalanced quotes: every string literal must close its quote. Escape one with ''.";
  }
  let depth = 0;
  for (const char of trimmed) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return "Unbalanced parentheses: found a closing parenthesis without an opening one.";
  }
  if (depth !== 0) return "Unbalanced parentheses: close every opening parenthesis.";
  return null;
}
