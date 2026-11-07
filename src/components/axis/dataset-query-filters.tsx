"use client";

import type { Filters } from "@/lib/axis/model";
import { attributeLabel, isNumericAttribute, queryableAttributes, type AttributeCondition, type DatasetAttribute } from "@/lib/axis/query-filters";
import { Field } from "./shared";

export function DatasetQueryFilters({ fields, filters, onChange }: { fields: DatasetAttribute[]; filters: Filters; onChange: (filters: Filters) => void }) {
  const available = queryableAttributes(fields);
  const conditionValue = (field: string, operator: AttributeCondition["operator"]) => filters.conditions?.find(item => item.field === field && item.operator === operator)?.value ?? "";
  const updateCondition = (field: string, operator: AttributeCondition["operator"], value: string) => {
    const conditions = (filters.conditions ?? []).filter(item => item.field !== field || item.operator !== operator);
    if (value) conditions.push({ field, operator, value });
    onChange({ ...filters, conditions });
  };
  return <>
    <div className="axis-form-grid">{available.flatMap(field => {
      if ((field.name === "sender" || field.name === "recipient") && field.type === "addr") {
        const name = field.name;
        return [<Field key={name} label={attributeLabel(name)}><input value={filters[name] ?? ""} onChange={event => onChange({ ...filters, [name]: event.target.value })} placeholder="0x..." autoComplete="off" /></Field>];
      }
      if (field.name === "sourceTime" && field.type === "u64") return ([ ["fromTime", "From timestamp (Unix seconds)"], ["toTime", "To timestamp (Unix seconds)"] ] as const).map(([name, label]) => <Field key={name} label={label}><input inputMode="numeric" value={filters[name] ?? ""} onChange={event => onChange({ ...filters, [name]: event.target.value })} placeholder="Any time" /></Field>);
      if (isNumericAttribute(field)) return ([ [">=", "Minimum"], ["<=", "Maximum"] ] as const).map(([operator, label]) => <Field key={`${field.name}:${operator}`} label={`${label} ${attributeLabel(field.name).toLowerCase()}`}><input inputMode="numeric" value={conditionValue(field.name, operator)} onChange={event => updateCondition(field.name, operator, event.target.value)} placeholder="Any value" /></Field>);
      if (field.type === "bool") return [<Field key={field.name} label={attributeLabel(field.name)}><select value={conditionValue(field.name, "=")} onChange={event => updateCondition(field.name, "=", event.target.value)}><option value="">Any value</option><option value="true">True</option><option value="false">False</option></select></Field>];
      return [<Field key={field.name} label={attributeLabel(field.name)}><input value={conditionValue(field.name, "=")} onChange={event => updateCondition(field.name, "=", event.target.value)} placeholder={field.type === "addr" || field.type === "key" ? "0x..." : "Any value"} autoComplete="off" /></Field>];
    })}</div>
    {!!available.length && <details><summary>Advanced predicate</summary><Field label="Additional Arkiv predicate"><textarea rows={2} value={filters.predicate ?? ""} onChange={event => onChange({ ...filters, predicate: event.target.value })} /></Field></details>}
  </>;
}
