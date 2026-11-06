"use client";

import * as React from "react";

export function useNow(active = true, intervalMs = 10_000): number {
  // Starts at 0 so prerendering never reads wall-clock time; the browser
  // updates it on mount and on every interval tick.
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
