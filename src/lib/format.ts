export function shortenHex(value: string | null | undefined, head = 6, tail = 4): string {
  if (!value) return "—";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatCompact(value: number | bigint | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function formatInteger(value: number | bigint | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const numeric = typeof value === "bigint" ? Number(value) : Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric);
  } catch {
    return String(value);
  }
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  return `${(ms / 1_000).toFixed(1)} s`;
}

export function formatBlock(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `#${formatInteger(value)}`;
}

export function formatDateTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return "—";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatClock(iso: string | number | Date | null | undefined): string {
  if (!iso) return "—";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(
  timestamp: number | string | Date | null | undefined,
  now = Date.now(),
): string {
  if (timestamp === null || timestamp === undefined || timestamp === "") return "—";
  const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return "—";
  const diff = Math.max(0, now - time);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function titleFromField(name: string): string {
  const stripped = name.replace(/^\$/, "");
  const spaced = stripped
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
    } catch {
      return "[object]";
    }
  }
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
