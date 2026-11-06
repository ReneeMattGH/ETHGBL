"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ArkivMark({ className }: { className?: string }) {
  const gradientId = `arkiv-mark-${React.useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="oklch(0.72 0.17 283)" />
          <stop offset="1" stopColor="oklch(0.6 0.2 303)" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.25" fill="var(--card)" />
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="8.25"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path
        d="M16 6.6 24.4 11.3v9.4L16 25.4 7.6 20.7v-9.4L16 6.6Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M16 11.1 20.3 13.5v4.9L16 20.8l-4.3-2.4v-4.9L16 11.1Z"
        fill={`url(#${gradientId})`}
        opacity="0.95"
      />
      <path
        d="M8.1 11.4 16 15.7l7.9-4.3M16 15.7v8.8"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function ArkivLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <ArkivMark className={compact ? "size-7" : undefined} />
      <span className="flex flex-col leading-none">
        <span className="text-[0.874rem] font-semibold tracking-[0.14em] text-foreground">
          ARKIV<span className="text-primary"> VIZ</span>
        </span>
        {!compact && (
          <span className="mt-1 text-[0.525rem] font-medium tracking-[0.2em] text-muted-foreground">
            QUERY STUDIO
          </span>
        )}
      </span>
    </span>
  );
}
