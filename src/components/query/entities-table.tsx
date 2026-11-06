"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/ui/type-badge";
import { useCopy } from "@/hooks/use-copy";
import type { EntityDto } from "@/lib/arkiv/types";
import { formatBlock } from "@/lib/format";
import {
  displayAttributeValue,
  parseNumericValue,
  type DatasetField,
} from "@/lib/visualization/fields";

type SortDirection = "asc" | "desc";
type SortState = { column: string; direction: SortDirection } | null;

type SortToken = { kind: "text" | "number" | "block"; value: string | number };

function compareTokens(a: SortToken | null, b: SortToken | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.kind === "block" && b.kind === "block") {
    try {
      const diff = BigInt(String(a.value)) - BigInt(String(b.value));
      return diff === 0n ? 0 : diff > 0n ? 1 : -1;
    } catch {
      return String(a.value).localeCompare(String(b.value));
    }
  }
  if (a.kind === "number" && b.kind === "number") {
    return Number(a.value) - Number(b.value);
  }
  return String(a.value).localeCompare(String(b.value));
}

function sortToken(
  entity: EntityDto,
  column: string,
  fieldMap: Map<string, DatasetField>,
): SortToken | null {
  switch (column) {
    case "key":
      return entity.key ? { kind: "text", value: entity.key } : null;
    case "owner":
      return entity.owner ? { kind: "text", value: entity.owner } : null;
    case "creator":
      return entity.creator ? { kind: "text", value: entity.creator } : null;
    case "createdAt":
      return entity.createdAt ? { kind: "block", value: entity.createdAt } : null;
    case "updatedAt":
      return entity.updatedAt ? { kind: "block", value: entity.updatedAt } : null;
    case "expiresAt":
      return entity.expiresAt ? { kind: "block", value: entity.expiresAt } : null;
    default:
      break;
  }

  const field = fieldMap.get(column);
  const entry = entity.attributes[column];
  if (!field || !entry) return null;
  if (field.numeric) {
    const numeric = parseNumericValue(entry.type, entry.value);
    return numeric === null ? null : { kind: "number", value: numeric };
  }
  return { kind: "text", value: displayAttributeValue(entry.type, entry.value, false) };
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: React.ReactNode;
  column: string;
  sort: SortState;
  onSort: (column: string) => void;
}) {
  const active = sort?.column === column;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`-ml-1 flex items-center gap-1 rounded px-1 py-0.5 text-left hover:text-foreground ${
        active ? "text-foreground" : "text-muted-foreground"
      }`}
      title={`Sort by ${typeof label === "string" ? label : column}`}
    >
      {label}
      <Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}

export function EntitiesTable({
  entities,
  fields,
  blockNumber,
  onSelect,
  showCreator = true,
  showUpdated = false,
  enableSearch = true,
  enablePagination = false,
  pageSize = 10,
  resetKey,
}: {
  entities: EntityDto[];
  fields: DatasetField[];
  blockNumber: string | null;
  onSelect: (entity: EntityDto) => void;
  showCreator?: boolean;
  showUpdated?: boolean;
  enableSearch?: boolean;
  enablePagination?: boolean;
  pageSize?: number;
  resetKey?: string;
}) {
  const { copy, copiedKey } = useCopy();
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortState>(null);
  const [page, setPage] = React.useState(0);

  const previousResetKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setSearch("");
    setSort(null);
    setPage(0);
  }, [resetKey]);

  const attributeColumns = React.useMemo(
    () =>
      fields
        .filter((field) => field.kind === "attribute" && field.presentCount > 0)
        .sort((a, b) => b.presence - a.presence)
        .slice(0, 6),
    [fields],
  );

  const fieldMap = React.useMemo(
    () => new Map(fields.map((field) => [field.name, field])),
    [fields],
  );

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return entities;
    return entities.filter((entity) => {
      const values: string[] = [entity.key];
      if (entity.owner) values.push(entity.owner);
      if (entity.creator) values.push(entity.creator);
      for (const entry of Object.values(entity.attributes)) {
        values.push(displayAttributeValue(entry.type, entry.value, false));
      }
      return values.some((value) => value.toLowerCase().includes(needle));
    });
  }, [entities, search]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        compareTokens(
          sortToken(a, sort.column, fieldMap),
          sortToken(b, sort.column, fieldMap),
        ) * direction,
    );
  }, [filtered, sort, fieldMap]);

  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = enablePagination ? Math.min(page, pageCount - 1) : 0;
  const start = enablePagination ? currentPage * size : 0;
  const visible = enablePagination ? sorted.slice(start, start + size) : sorted;

  const handleSort = (column: string) => {
    setPage(0);
    setSort((current) => {
      if (current?.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const columnCount =
    3 + (showCreator ? 1 : 0) + (showUpdated ? 1 : 0) + attributeColumns.length;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      {enableSearch && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search keys, owners, creators and attribute values"
              aria-label="Search returned entities"
              className="h-7 pl-7 text-[11.5px]"
            />
          </div>
          <span className="text-[10.5px] text-muted-foreground">
            {filtered.length === entities.length
              ? `${entities.length} rows`
              : `${filtered.length} of ${entities.length} rows`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-3" aria-sort={sort?.column === "key" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader label="Entity key" column="key" sort={sort} onSort={handleSort} />
              </TableHead>
              <TableHead aria-sort={sort?.column === "owner" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader label="Owner" column="owner" sort={sort} onSort={handleSort} />
              </TableHead>
              {showCreator && (
                <TableHead aria-sort={sort?.column === "creator" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Creator" column="creator" sort={sort} onSort={handleSort} />
                </TableHead>
              )}
              <TableHead aria-sort={sort?.column === "createdAt" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader label="Created" column="createdAt" sort={sort} onSort={handleSort} />
              </TableHead>
              {showUpdated && (
                <TableHead aria-sort={sort?.column === "updatedAt" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                  <SortHeader label="Updated" column="updatedAt" sort={sort} onSort={handleSort} />
                </TableHead>
              )}
              <TableHead aria-sort={sort?.column === "expiresAt" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                <SortHeader label="Expires" column="expiresAt" sort={sort} onSort={handleSort} />
              </TableHead>
              {attributeColumns.map((field) => (
                <TableHead key={field.name}>
                  <SortHeader
                    label={
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-foreground/90">{field.name}</span>
                        <TypeBadge type={field.type} />
                      </span>
                    }
                    column={field.name}
                    sort={sort}
                    onSort={handleSort}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-8 text-center text-[11.5px] text-muted-foreground"
                >
                  No returned entities match “{search.trim()}”.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((entity) => {
                const expired =
                  entity.expiresAt && blockNumber
                    ? Number(entity.expiresAt) <= Number(blockNumber)
                    : false;
                return (
                  <TableRow
                    key={entity.key}
                    tabIndex={0}
                    onClick={() => onSelect(entity)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(entity);
                      }
                    }}
                    className="group cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <TableCell className="pl-3">
                      <span className="flex items-center gap-1">
                        <span className="font-mono text-[11.5px] text-foreground">
                          {entity.key.slice(0, 10)}…{entity.key.slice(-6)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copy(entity.key, "Entity key copied");
                          }}
                          aria-label={`Copy key ${entity.key}`}
                        >
                          {copiedKey === entity.key ? <Check className="size-3" /> : <Copy className="size-3" />}
                        </Button>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                      {entity.owner ? `${entity.owner.slice(0, 6)}…${entity.owner.slice(-4)}` : "—"}
                    </TableCell>
                    {showCreator && (
                      <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                        {entity.creator
                          ? `${entity.creator.slice(0, 6)}…${entity.creator.slice(-4)}`
                          : "—"}
                      </TableCell>
                    )}
                    <TableCell className="tabular text-[11.5px] text-muted-foreground">
                      {formatBlock(entity.createdAt)}
                    </TableCell>
                    {showUpdated && (
                      <TableCell className="tabular text-[11.5px] text-muted-foreground">
                        {formatBlock(entity.updatedAt)}
                      </TableCell>
                    )}
                    <TableCell className="tabular text-[11.5px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {formatBlock(entity.expiresAt)}
                        {expired && (
                          <Badge
                            variant="outline"
                            className="h-4 border-red-500/30 px-1 text-[9px] text-red-600 dark:text-red-300"
                          >
                            expired
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    {attributeColumns.map((field) => {
                      const entry = entity.attributes[field.name];
                      return (
                        <TableCell
                          key={field.name}
                          className="max-w-[15rem] truncate font-mono text-[11.5px] text-foreground/85"
                          title={entry ? displayAttributeValue(entry.type, entry.value, false) : undefined}
                        >
                          {entry ? displayAttributeValue(entry.type, entry.value) : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {enablePagination && sorted.length > size && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <span className="text-[10.5px] text-muted-foreground">
            Rows {start + 1}–{Math.min(start + size, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Previous page"
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="text-[10.5px] text-muted-foreground">
              Page {currentPage + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Next page"
              onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
