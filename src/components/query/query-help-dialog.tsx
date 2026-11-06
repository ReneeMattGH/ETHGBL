"use client";

import { ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueryCodeBlock } from "./query-editor";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <div className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[11.5px] text-foreground">
      {children}
    </code>
  );
}

export function QueryHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookOpen className="size-3.5" />
          Query syntax
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>Arkiv query language</DialogTitle>
          <DialogDescription>
            The SDK sends this predicate string to the node as <Code>arkiv_query</Code>. Only
            syntax listed here is supported.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-5 px-5 py-4">
            <Section title="Filters">
              <p>
                Filter on indexed attributes and on the system attributes <Code>$key</Code>,{" "}
                <Code>$owner</Code>, <Code>$creator</Code> and <Code>$expiresAt</Code>. Combine
                predicates with <Code>AND</Code> and <Code>OR</Code>; group with parentheses.
              </p>
              <QueryCodeBlock
                code={`category = str('docs') AND (score > dec(4.0) OR EXISTS(featured))\nname STARTSWITH str('Ark')\nscore BETWEEN i32(1) AND i32(10)\n$expiresAt > u64(0)`}
                className="mt-2"
              />
            </Section>

            <Section title="Literals">
              <p>
                Every literal carries its type. Strings escape a quote by doubling it; addresses
                and keys are bare hex inside their constructor.
              </p>
              <QueryCodeBlock
                code={`str('O''Brien')  i32(-5)  u64(42)  u256(1000000000000000000)\ndec(4.5)  addr(0x61b2…7209)  key(0x0000…0000)  true  false`}
                className="mt-2"
              />
            </Section>

            <Section title="Sorting">
              <p>
                Append an optional <Code>ORDER BY</Code> with the field&apos;s type and a
                direction. Block-ordered paging stays stable when filtered by a key.
              </p>
              <QueryCodeBlock
                code={`$expiresAt > u64(0) ORDER BY $expiresAt:u64 DESC\n$key > key(0x00…00) ORDER BY $key:key ASC`}
                className="mt-2"
              />
            </Section>

            <Section title="Paging and limits">
              <p>
                The SDK pages with <Code>limit</Code> and <Code>offset</Code>; the node caps a page
                at 100 rows. ARKIV VIZ runs one page per request and reports the node&apos;s total
                match count alongside the returned rows.
              </p>
            </Section>

            <Section title="What the node rejects">
              <p>
                Unparseable predicates, ill-typed comparisons (for example <Code>STARTSWITH</Code>{" "}
                on a number), out-of-range literals and queries past the node&apos;s budget all
                return structured errors. ARKIV VIZ surfaces the node&apos;s error kind and detail
                instead of substituting sample data.
              </p>
            </Section>

            <div className="flex flex-wrap gap-3 border-t border-border/70 pt-4">
              <a
                href="https://github.com/Arkiv-Network/arkiv-sdk-js"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                Official Arkiv JS SDK
                <ArrowUpRight className="size-3" />
              </a>
              <a
                href="https://hub.arkiv.network/access-keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                Get an access key
                <ArrowUpRight className="size-3" />
              </a>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
