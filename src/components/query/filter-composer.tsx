"use client";

import * as React from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildPredicate,
  FILTER_OPERATORS,
  LITERAL_TYPES,
  SYSTEM_FILTER_FIELDS,
  type FilterOperator,
  type LiteralType,
} from "@/lib/arkiv/query-language";
import type { DatasetField } from "@/lib/visualization/fields";

const VALUE_PLACEHOLDER: Record<LiteralType, string> = {
  str: "docs",
  i32: "42",
  u64: "0",
  u256: "1000000000000000000",
  dec: "4.5",
  addr: "0x…",
  key: "0x…",
  bool: "true",
};

export function FilterComposer({
  fields,
  onAdd,
  disabled,
}: {
  fields: DatasetField[];
  onAdd: (predicate: string) => void;
  disabled?: boolean;
}) {
  const [field, setField] = React.useState("");
  const [operator, setOperator] = React.useState<FilterOperator>("eq");
  const [type, setType] = React.useState<LiteralType>("str");
  const [value, setValue] = React.useState("");
  const [secondValue, setSecondValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const system = SYSTEM_FILTER_FIELDS[field.trim()];
  const effectiveType = system?.type ?? type;
  const definition = FILTER_OPERATORS.find((entry) => entry.value === operator);

  const availableOperators = React.useMemo(
    () => FILTER_OPERATORS.filter((entry) => (system ? entry.value !== "startswith" : true)),
    [system],
  );

  React.useEffect(() => {
    if (system) setType(system.type);
  }, [system]);

  const handleFieldChange = (next: string) => {
    setField(next);
    setError(null);
    const match = fields.find((entry) => entry.name === next.trim());
    if (match && match.type !== "bytes") {
      const nextType = match.type as LiteralType;
      if (LITERAL_TYPES.some((entry) => entry.value === nextType)) setType(nextType);
    }
  };

  const handleOperatorChange = (next: FilterOperator) => {
    setOperator(next);
    setError(null);
    if (next === "startswith" && !system) setType("str");
  };

  const handleAdd = () => {
    const result = buildPredicate({
      field,
      operator,
      type: effectiveType,
      value: effectiveType === "bool" ? value || "true" : value,
      value2: secondValue,
    });
    if (result.error || !result.predicate) {
      setError(result.error ?? "Enter a valid filter.");
      return;
    }
    onAdd(result.predicate);
    setError(null);
    setValue("");
    setSecondValue("");
    toast.success("Filter appended to the query", { description: result.predicate });
  };

  return (
    <div className="rounded-lg border border-border/70 bg-background/25 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <SlidersHorizontal className="size-3" />
          Compose a filter
        </span>
        <span className="text-[10px] text-muted-foreground/70">Appends with AND</span>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]">
        <div>
          <label className="sr-only" htmlFor="filter-field">
            Attribute
          </label>
          <Input
            id="filter-field"
            value={field}
            onChange={(event) => handleFieldChange(event.target.value)}
            placeholder="Attribute or $owner"
            list="arkiv-field-suggestions"
            className="h-8 font-mono text-[12px]"
            disabled={disabled}
          />
          <datalist id="arkiv-field-suggestions">
            {fields.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.type}
              </option>
            ))}
          </datalist>
        </div>

        <Select value={operator} onValueChange={(next) => handleOperatorChange(next as FilterOperator)} disabled={disabled}>
          <SelectTrigger size="sm" className="w-full text-[12px]" aria-label="Filter operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableOperators.map((entry) => (
              <SelectItem key={entry.value} value={entry.value} className="text-[12px]">
                {entry.token}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={effectiveType}
          onValueChange={(next) => setType(next as LiteralType)}
          disabled={disabled || Boolean(system)}
        >
          <SelectTrigger size="sm" className="w-full font-mono text-[12px]" aria-label="Literal type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LITERAL_TYPES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value} className="text-[12px]">
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-0 gap-2">
          {definition?.needsValue === false ? (
            <Input
              value=""
              placeholder="Not required"
              disabled
              className="h-8 text-[12px]"
              aria-label="No value required"
            />
          ) : effectiveType === "bool" ? (
            <Select value={value || "true"} onValueChange={setValue} disabled={disabled}>
              <SelectTrigger size="sm" className="w-full text-[12px]" aria-label="Filter value">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">true</SelectItem>
                <SelectItem value="false">false</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={VALUE_PLACEHOLDER[effectiveType]}
              className="h-8 min-w-0 font-mono text-[12px]"
              aria-label="Filter value"
              disabled={disabled}
            />
          )}

          {definition?.needsSecondValue && (
            <Input
              value={secondValue}
              onChange={(event) => setSecondValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="upper bound"
              className="h-8 min-w-0 font-mono text-[12px]"
              aria-label="Upper bound"
              disabled={disabled}
            />
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={disabled || !field.trim()}
          className="h-8 gap-1.5 text-[12px]"
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-[11.5px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
