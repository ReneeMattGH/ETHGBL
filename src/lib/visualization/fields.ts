import type { EntityDto } from "@/lib/arkiv/types";
import { shortenHex, titleFromField } from "@/lib/format";

export type DatasetField = {
  name: string;
  label: string;
  kind: "system" | "attribute";
  /** A single Arkiv type tag, or `mixed` when entities disagree and `unknown` when absent. */
  type: string;
  /** Every type tag observed for the field, sorted. */
  types: string[];
  indexed: boolean | null;
  presence: number;
  presentCount: number;
  sampleValues: string[];
  numeric: boolean;
  categorical: boolean;
  chartable: boolean;
};

const NUMERIC_TYPES = new Set(["i32", "u64", "u256", "dec"]);
const INTEGER_TYPES = new Set(["i32", "u64", "u256"]);
const UNSIGNED_TYPES = new Set(["u64", "u256"]);
const CATEGORICAL_TYPES = new Set(["str", "bool", "addr", "key"]);

const SYSTEM_FIELDS: {
  name: string;
  label: string;
  type: string;
  numeric: boolean;
  indexed: boolean | null;
}[] = [
  { name: "$key", label: "Entity key", type: "key", numeric: false, indexed: null },
  { name: "$owner", label: "Owner", type: "addr", numeric: false, indexed: null },
  { name: "$creator", label: "Creator", type: "addr", numeric: false, indexed: null },
  { name: "$createdAt", label: "Created at (block)", type: "u64", numeric: true, indexed: null },
  { name: "$updatedAt", label: "Updated at (block)", type: "u64", numeric: true, indexed: null },
  { name: "$expiresAt", label: "Expires at (block)", type: "u64", numeric: true, indexed: null },
];

export function isNumericType(type: string): boolean {
  return NUMERIC_TYPES.has(type);
}

export function isCategoricalType(type: string): boolean {
  return CATEGORICAL_TYPES.has(type);
}

function systemRaw(entity: EntityDto, name: string): string | null {
  switch (name) {
    case "$key":
      return entity.key || null;
    case "$owner":
      return entity.owner;
    case "$creator":
      return entity.creator;
    case "$createdAt":
      return entity.createdAt;
    case "$updatedAt":
      return entity.updatedAt;
    case "$expiresAt":
      return entity.expiresAt;
    default:
      return null;
  }
}

export function displayAttributeValue(type: string, value: unknown, short = true): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && (type === "addr" || type === "key")) {
    return short ? shortenHex(value, 6, 4) : value;
  }
  if (typeof value === "string" && type === "bytes") {
    return short ? shortenHex(value, 10, 6) : value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  }
  return String(value);
}

/**
 * Converts an Arkiv typed value to a chart-safe number.
 *
 * Integers above `Number.MAX_SAFE_INTEGER` are rejected instead of being silently rounded, and
 * values whose declared type does not match their runtime shape are never coerced.
 */
export function parseNumericValue(type: string, value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (INTEGER_TYPES.has(type) && !Number.isSafeInteger(value)) return null;
    if (UNSIGNED_TYPES.has(type) && value < 0) return null;
    return value;
  }

  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  if (INTEGER_TYPES.has(type)) {
    if (!/^-?\d+$/.test(text)) return null;
    if (UNSIGNED_TYPES.has(type) && text.startsWith("-")) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  if (type === "dec") {
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function inferFields(entities: EntityDto[]): DatasetField[] {
  const total = entities.length;
  const fields: DatasetField[] = [];

  for (const system of SYSTEM_FIELDS) {
    let presentCount = 0;
    const samples: string[] = [];
    for (const entity of entities) {
      const raw = systemRaw(entity, system.name);
      if (raw === null) continue;
      presentCount += 1;
      if (samples.length < 3) {
        samples.push(
          system.type === "key" || system.type === "addr" ? shortenHex(raw, 8, 6) : raw,
        );
      }
    }
    fields.push({
      name: system.name,
      label: system.label,
      kind: "system",
      type: system.type,
      types: [system.type],
      indexed: system.indexed,
      presence: total === 0 ? 0 : presentCount / total,
      presentCount,
      sampleValues: samples,
      numeric: system.numeric,
      categorical: CATEGORICAL_TYPES.has(system.type),
      chartable: system.numeric || CATEGORICAL_TYPES.has(system.type),
    });
  }

  const attributeMap = new Map<
    string,
    {
      types: Set<string>;
      indexedKnown: boolean;
      indexedAny: boolean;
      presentCount: number;
      samples: string[];
    }
  >();

  const ensureEntry = (name: string) => {
    let entry = attributeMap.get(name);
    if (!entry) {
      entry = {
        types: new Set<string>(),
        indexedKnown: false,
        indexedAny: false,
        presentCount: 0,
        samples: [],
      };
      attributeMap.set(name, entry);
    }
    return entry;
  };

  for (const entity of entities) {
    for (const [name, entry] of Object.entries(entity.attributeSchema)) {
      if (entry.type && entry.type !== "unknown") ensureEntry(name).types.add(entry.type);
      if (entry.indexed !== null) {
        const target = ensureEntry(name);
        target.indexedKnown = true;
        target.indexedAny = target.indexedAny || entry.indexed;
      }
    }

    for (const [name, value] of Object.entries(entity.attributes)) {
      const entry = ensureEntry(name);
      if (value.type && value.type !== "unknown") entry.types.add(value.type);
      entry.presentCount += 1;
      if (entry.samples.length < 3) {
        entry.samples.push(displayAttributeValue(value.type, value.value));
      }
    }
  }

  for (const [name, entry] of [...attributeMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const types = [...entry.types].sort();
    const type = types.length === 0 ? "unknown" : types.length === 1 ? types[0] : "mixed";
    const numeric = types.length === 1 && NUMERIC_TYPES.has(type);
    const categorical = types.length === 1 && CATEGORICAL_TYPES.has(type);
    fields.push({
      name,
      label: titleFromField(name),
      kind: "attribute",
      type,
      types,
      indexed: entry.indexedKnown ? entry.indexedAny : null,
      presence: total === 0 ? 0 : entry.presentCount / total,
      presentCount: entry.presentCount,
      sampleValues: entry.samples,
      numeric,
      categorical,
      chartable: numeric || categorical,
    });
  }

  return fields;
}

export function getField(fields: DatasetField[], name: string | undefined): DatasetField | null {
  if (!name) return null;
  return fields.find((field) => field.name === name) ?? null;
}

export function getNumericValue(entity: EntityDto, field: DatasetField | null): number | null {
  if (!field || !field.numeric) return null;

  if (field.kind === "system") {
    return parseNumericValue(field.type, systemRaw(entity, field.name));
  }

  const entry = entity.attributes[field.name];
  if (!entry) return null;
  return parseNumericValue(field.type, entry.value);
}

export function getRawValue(
  entity: EntityDto,
  field: DatasetField,
): { type: string; value: string | number | boolean | null } | null {
  if (field.kind === "system") {
    const raw = systemRaw(entity, field.name);
    if (raw === null) return null;
    return { type: field.type, value: raw };
  }
  return entity.attributes[field.name] ?? null;
}

export function getCategoryValue(
  entity: EntityDto,
  field: DatasetField,
): { key: string; label: string } | null {
  const entry = getRawValue(entity, field);
  if (!entry || entry.value === null || entry.value === undefined) return null;
  const raw = String(entry.value);
  const label =
    field.type === "addr" || field.type === "key"
      ? shortenHex(raw, 6, 4)
      : field.type === "bytes"
        ? shortenHex(raw, 8, 6)
        : raw.length > 28
          ? `${raw.slice(0, 25)}…`
          : raw;
  return { key: `${field.type}:${raw}`, label };
}

export function hasFieldValue(entity: EntityDto, field: DatasetField): boolean {
  if (field.kind === "system") return systemRaw(entity, field.name) !== null;
  return Object.hasOwn(entity.attributes, field.name);
}

export function numericFields(fields: DatasetField[]): DatasetField[] {
  return fields.filter((field) => field.numeric);
}

export function categoricalFields(fields: DatasetField[]): DatasetField[] {
  return fields.filter((field) => field.categorical);
}

export function tableFields(fields: DatasetField[], maxAttributes = 12): DatasetField[] {
  const system = fields.filter((field) => field.kind === "system");
  const attributes = fields
    .filter((field) => field.kind === "attribute" && field.presentCount > 0)
    .slice(0, maxAttributes);
  return [...system, ...attributes];
}
