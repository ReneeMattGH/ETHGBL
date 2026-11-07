import { isAddress } from "viem";
import type { Filters } from "./model";

export type DatasetAttribute = { name: string; type: string; indexed: boolean };
export type DatasetQuerySchema = { datasetKey: string; observed: boolean; fields: DatasetAttribute[]; filterFields?: DatasetAttribute[] };
export type AttributeCondition = { field: string; operator: "=" | ">=" | "<="; value: string };
const numericTypes = new Set(["u64", "u256", "i32"]);
const filterTypes = new Set(["addr", "key", "str", "bool", ...numericTypes]);
// Source identity and block coverage are fixed by the dataset, not user filters.
const scopeFields = new Set(["arkiv.schema", "datasetKey", "chainId", "contract", "blockNumber", "sourceId"]);

export const isNumericAttribute = (field: DatasetAttribute) => numericTypes.has(field.type);
export function queryableAttributes(fields: DatasetAttribute[]) {
  return fields.filter(field => field.indexed && filterTypes.has(field.type) && !scopeFields.has(field.name) && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name));
}
export function attributeLabel(name: string) {
  const labels: Record<string, string> = { sender: "Sender address", recipient: "Recipient address", sourceTime: "Timestamp (Unix seconds)", amountRaw: "Transfer amount (base units)", txHash: "Transaction hash" };
  return labels[name] ?? name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, char => char.toUpperCase());
}
export function filtersForSchema(filters: Filters, fields: DatasetAttribute[]): Filters {
  const available = queryableAttributes(fields);
  const result: Filters = { order: filters.order ?? "desc" };
  for (const name of ["sender", "recipient"] as const) if (available.some(field => field.name === name && field.type === "addr") && filters[name]) result[name] = filters[name];
  if (available.some(field => field.name === "sourceTime" && field.type === "u64")) {
    if (filters.fromTime) result.fromTime = filters.fromTime;
    if (filters.toTime) result.toTime = filters.toTime;
  }
  const conditions = filters.conditions?.filter(condition => available.some(field => field.name === condition.field));
  if (conditions?.length) result.conditions = conditions;
  if (available.length && filters.predicate) result.predicate = filters.predicate;
  return result;
}
export function validateAttributeConditions(input: unknown, fields: DatasetAttribute[]): AttributeCondition[] {
  if (!Array.isArray(input) || input.length > 24) throw new Error("Use at most 24 field filters.");
  const available = queryableAttributes(fields), seen = new Set<string>();
  const conditions = input.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid field filter.");
    const condition = item as AttributeCondition;
    const field = available.find(field => field.name === condition.field);
    if (!field) throw new Error("The selected field cannot be filtered in this dataset.");
    if (!["=", ">=", "<="].includes(condition.operator) || !isNumericAttribute(field) && condition.operator !== "=") throw new Error(`Invalid operator for ${field.name}.`);
    if (typeof condition.value !== "string" || !condition.value || condition.value.length > 1000) throw new Error(`Invalid ${field.name} filter.`);
    const key = `${field.name}:${condition.operator}`;
    if (seen.has(key)) throw new Error(`Duplicate ${field.name} filter.`);
    seen.add(key);
    let value = condition.value;
    if (isNumericAttribute(field)) {
      if (!/^-?\d{1,78}$/.test(value)) throw new Error(`${attributeLabel(field.name)} must be an integer.`);
      const number = BigInt(value), min = field.type === "i32" ? -(2n ** 31n) : 0n;
      const max = field.type === "i32" ? 2n ** 31n - 1n : 2n ** (field.type === "u64" ? 64n : 256n) - 1n;
      if (number < min || number > max) throw new Error(`${attributeLabel(field.name)} is outside its supported range.`);
      value = number.toString();
    } else if (field.type === "addr") {
      if (!isAddress(value)) throw new Error(`Invalid ${attributeLabel(field.name).toLowerCase()}.`);
      value = value.toLowerCase();
    } else if (field.type === "key") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${attributeLabel(field.name).toLowerCase()}.`);
      value = value.toLowerCase();
    } else if (field.type === "bool" && value !== "true" && value !== "false") throw new Error(`Invalid ${field.name} boolean.`);
    return { field: field.name, operator: condition.operator, value };
  });
  for (const field of available.filter(isNumericAttribute)) {
    const min = conditions.find(item => item.field === field.name && item.operator === ">=");
    const max = conditions.find(item => item.field === field.name && item.operator === "<=");
    if (min && max && BigInt(min.value) > BigInt(max.value)) throw new Error(`${attributeLabel(field.name)} minimum exceeds its maximum.`);
  }
  return conditions;
}
export function compileAttributeConditions(input: unknown, fields: DatasetAttribute[]) {
  return validateAttributeConditions(input, fields).map(condition => {
    const field = fields.find(field => field.name === condition.field)!;
    const literal = field.type === "str" ? `str('${condition.value.replace(/'/g, "''")}')` : field.type === "bool" ? condition.value : `${field.type}(${condition.value})`;
    return `${field.name} ${condition.operator} ${literal}`;
  });
}
