import { parseUnits } from "viem";
import { validateFilters } from "./core";
import type { QuerySourceDefinition } from "./model";
import { isNumericAttribute, queryableAttributes, validateAttributeConditions, type DatasetAttribute } from "./query-filters";

export type EnglishQueryContext = { datasetKey: string; name: string; fields: DatasetAttribute[]; decimals: number };
export type EnglishQueryPlan = { status: "ready" | "clarification"; summary: string; questions: string[]; queries: QuerySourceDefinition[] };
export type EnglishQueryPreview = EnglishQueryPlan & { nativeQuery?: string; generatedAt: string };

const record = (value: unknown, allowed: string[]) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error("The generated query has an invalid structure. Try describing it more precisely.");
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("The generated query is incomplete. Try again.");
  return value.trim();
};

// The model proposes typed filters. Source identity, coverage and native syntax stay in application code.
export function validateEnglishPlan(input: unknown, contexts: EnglishQueryContext[]): EnglishQueryPlan {
  const plan = record(input, ["status", "summary", "questions", "order", "queries"]);
  if (!["ready", "clarification"].includes(String(plan.status)) || !["asc", "desc"].includes(String(plan.order)) || !Array.isArray(plan.questions) || plan.questions.length > 3 || !Array.isArray(plan.queries)) throw new Error("The generated query is incomplete. Try again.");
  const summary = text(plan.summary, 1200), questions = plan.questions.map(question => text(question, 500));
  if (plan.status === "clarification") {
    if (!questions.length || plan.queries.length) throw new Error("The request needs clarification before a query can be generated.");
    return { status: "clarification", summary, questions, queries: [] };
  }
  if (questions.length || plan.queries.length !== contexts.length) throw new Error("The generated query must include every selected dataset.");
  const seen = new Set<string>();
  const queries = plan.queries.map(value => {
    const query = record(value, ["datasetKey", "sender", "recipient", "fromTime", "toTime", "conditions"]);
    const datasetKey = text(query.datasetKey, 66).toLowerCase(), context = contexts.find(item => item.datasetKey === datasetKey);
    if (!context || seen.has(datasetKey)) throw new Error("The generated query changed the selected datasets. Generate it again.");
    seen.add(datasetKey);
    const fields = queryableAttributes(context.fields);
    const filters: Record<string, unknown> = { order: plan.order };
    for (const name of ["sender", "recipient", "fromTime", "toTime"] as const) {
      if (query[name] === null || query[name] === undefined) continue;
      const field = fields.find(field => field.name === (name.endsWith("Time") ? "sourceTime" : name));
      if (!field || (name.endsWith("Time") ? field.type !== "u64" : field.type !== "addr")) throw new Error(`${context.name} does not support the generated ${name} filter.`);
      filters[name] = text(query[name], 100);
      if (name.endsWith("Time") && (!/^\d{1,12}$/.test(String(filters[name])) || BigInt(String(filters[name])) > 253402300799n)) throw new Error("The generated time range is invalid.");
    }
    if (!Array.isArray(query.conditions) || query.conditions.length > 24) throw new Error("The generated field filters are invalid.");
    const conditions = query.conditions.map(value => {
      const item = record(value, ["field", "operator", "value", "unit"]), name = text(item.field, 100);
      const field = fields.find(field => field.name === name);
      if (!field || !["=", ">=", "<=", ">", "<"].includes(String(item.operator)) || !["raw", "token"].includes(String(item.unit))) throw new Error("The generated query uses an unsupported field or operator.");
      if (["sender", "recipient", "sourceTime"].includes(name)) throw new Error("Use the dedicated wallet and time filters for this request.");
      let valueText = text(item.value, 1000), operator = String(item.operator);
      if (item.unit === "token") {
        if (name !== "amountRaw" || field.type !== "u256" || !/^\d+(?:\.\d+)?$/.test(valueText) || (valueText.split(".")[1]?.length ?? 0) > context.decimals) throw new Error("The generated token amount has unsupported precision.");
        valueText = parseUnits(valueText, context.decimals).toString();
      }
      if (operator === ">" || operator === "<") {
        if (!isNumericAttribute(field) || !/^-?\d{1,78}$/.test(valueText)) throw new Error("Strict comparisons require an integer field.");
        valueText = (BigInt(valueText) + (operator === ">" ? 1n : -1n)).toString();
        operator = operator === ">" ? ">=" : "<=";
      }
      return { field: name, operator, value: valueText };
    });
    filters.conditions = validateAttributeConditions(conditions.flatMap(condition => {
      const field = fields.find(field => field.name === condition.field)!;
      return condition.operator === "=" && isNumericAttribute(field) ? [{ ...condition, operator: ">=" }, { ...condition, operator: "<=" }] : [condition];
    }), context.fields);
    return { datasetKey, filters: validateFilters(filters) };
  });
  return { status: "ready", summary, questions, queries: contexts.map(context => queries.find(query => query.datasetKey === context.datasetKey)!) };
}

export const englishQueryOutputSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "summary", "questions", "order", "queries"],
  properties: {
    status: { type: "string", enum: ["ready", "clarification"] }, summary: { type: "string" },
    questions: { type: "array", items: { type: "string" } }, order: { type: "string", enum: ["asc", "desc"] },
    queries: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["datasetKey", "sender", "recipient", "fromTime", "toTime", "conditions"],
      properties: {
        datasetKey: { type: "string" }, sender: { type: ["string", "null"] }, recipient: { type: ["string", "null"] },
        fromTime: { type: ["string", "null"] }, toTime: { type: ["string", "null"] },
        conditions: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["field", "operator", "value", "unit"],
          properties: { field: { type: "string" }, operator: { type: "string", enum: ["=", ">=", "<=", ">", "<"] }, value: { type: "string" }, unit: { type: "string", enum: ["raw", "token"] } },
        } },
      },
    } },
  },
};
