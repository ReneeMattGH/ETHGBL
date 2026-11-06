import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  i32: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  u64: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  u256: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  dec: "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  str: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  bool: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  addr: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  key: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  bytes: "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  unknown: "border-border bg-muted/50 text-muted-foreground",
};

export function TypeBadge({
  type,
  indexed,
  className,
}: {
  type: string;
  indexed?: boolean | null;
  className?: string;
}) {
  const tone = TONES[type] ?? TONES.unknown;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className={cn(
          "inline-flex h-[18px] items-center rounded border px-1.5 font-mono text-[10px] leading-none",
          tone,
        )}
      >
        {type}
      </span>
      {indexed && (
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">idx</span>
      )}
    </span>
  );
}
