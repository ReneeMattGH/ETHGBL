"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NetworkStatusProvider } from "./network-status-provider";
import { SettingsProvider } from "./settings-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="arkiv-viz-theme"
    >
      <SettingsProvider>
        <NetworkStatusProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" closeButton />
        </NetworkStatusProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
