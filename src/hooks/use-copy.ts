"use client";

import * as React from "react";
import { toast } from "sonner";

export function useCopy() {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = React.useCallback(async (text: string, label = "Copied to clipboard") => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedKey(text);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopiedKey(null), 1_500);
      toast.success(label);
      return true;
    } catch {
      toast.error("Clipboard access was blocked by the browser.");
      return false;
    }
  }, []);

  return { copy, copiedKey };
}
