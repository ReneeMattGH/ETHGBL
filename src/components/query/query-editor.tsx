"use client";

import * as React from "react";
import { tokenizeQuery } from "@/lib/arkiv/query-language";
import { cn } from "@/lib/utils";

export function QueryEditor({
  value,
  onChange,
  onSubmit,
  placeholder = "$expiresAt > u64(0)",
  className,
  ariaLabel = "Arkiv query",
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const tokens = React.useMemo(() => tokenizeQuery(value), [value]);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      window.requestAnimationFrame(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = start + 2;
      });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div
      className={cn(
        "query-editor-wrap console overflow-hidden rounded-lg border border-border/80 transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15",
        className,
      )}
    >
      <pre className="query-editor-highlight" aria-hidden="true">
        {tokens.map((token, index) => (
          <span key={index} className={token.className}>
            {token.text}
          </span>
        ))}
        {"\n"}
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="query-editor-input resize-none"
      />
    </div>
  );
}

export function QueryCodeBlock({
  code,
  className,
  maxHeight = "16rem",
}: {
  code: string;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <pre
      className={cn(
        "console w-full max-w-full min-w-0 overflow-auto rounded-lg border border-border/80 p-3.5 font-mono text-[12.5px] leading-relaxed",
        className,
      )}
      style={{ maxHeight }}
    >
      <code>{code}</code>
    </pre>
  );
}
