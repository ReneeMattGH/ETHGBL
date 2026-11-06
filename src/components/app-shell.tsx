"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  LayoutDashboard,
  Menu,
  PanelsTopLeft,
  Plus,
  RefreshCw,
  Settings,
  Terminal,
} from "lucide-react";
import { ArkivLogo, ArkivMark } from "@/components/brand/logo";
import { ConnectionDot } from "@/components/network/connection-badge";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBlock } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/query", label: "Query Builder", icon: Terminal, exact: false },
  { href: "/dashboards", label: "My Dashboards", icon: PanelsTopLeft, exact: false },
  { href: "/explore", label: "Explore", icon: Compass, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

const SIDEBAR_KEY = "arkiv-viz:sidebar:v1";

function pageTitle(pathname: string | null): string {
  if (!pathname) return "Overview";
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/query")) return "Query Builder";
  if (pathname === "/dashboards/new") return "New dashboard";
  if (pathname.startsWith("/dashboards/") && pathname.endsWith("/edit")) return "Edit dashboard";
  if (pathname.startsWith("/dashboards/")) return "Dashboard";
  if (pathname.startsWith("/dashboards")) return "My Dashboards";
  if (pathname.startsWith("/explore")) return "Explore";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Workspace";
}

function breadcrumb(pathname: string | null): string[] {
  const title = pageTitle(pathname);
  if (pathname === "/") return ["Workspace", title];
  if (pathname?.startsWith("/dashboards/") && pathname !== "/dashboards/new") {
    return ["Workspace", "Dashboards", title];
  }
  return ["Workspace", title];
}

function NavList({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname !== null &&
          (item.exact ? pathname === item.href : pathname.startsWith(item.href));
        const Icon = item.icon;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center rounded-md text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              collapsed ? "mx-auto size-9 justify-center" : "h-8 gap-2.5 px-2.5",
              active
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 h-4 w-0.5 rounded-full bg-primary"
              />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );

        if (!collapsed) return link;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function ActiveNavLinks({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <NavList pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />;
}

function SidebarNetwork({ collapsed }: { collapsed: boolean }) {
  const { status, connected, isLoading } = useNetworkStatus();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings"
            aria-label="Arkiv network status"
            className="mx-auto flex size-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/40 transition-colors hover:bg-sidebar-accent"
          >
            <ConnectionDot className="size-2" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          {status?.network.label ?? "Rabdi Testnet"} ·{" "}
          {connected ? `block ${formatBlock(status?.blockNumber)}` : isLoading ? "checking…" : "unreachable"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href="/settings"
      className="block rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/60"
    >
      <div className="flex items-center gap-2">
        <ConnectionDot />
        <span className="truncate text-[12px] font-medium text-foreground">
          {status?.network.label ?? "Rabdi Testnet"}
        </span>
        <span className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
          testnet
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span className="font-mono">chain {status?.network.chainId ?? 7794095}</span>
        <span className="tabular font-mono">
          {connected ? formatBlock(status?.blockNumber) : isLoading ? "checking…" : "offline"}
        </span>
      </div>
    </Link>
  );
}

function SidebarBody({
  collapsed = false,
  onNavigate,
  onToggle,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border/70",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link href="/" onClick={onNavigate} aria-label="ARKIV VIZ home" className="outline-none">
          {collapsed ? <ArkivMark className="size-7" /> : <ArkivLogo />}
        </Link>
        {!collapsed && onToggle && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="-mr-1 text-muted-foreground"
          >
            <ChevronsLeft className="size-4" />
          </Button>
        )}
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", collapsed ? "gap-4 px-2 py-3" : "gap-4 px-3 py-4")}>
        <React.Suspense fallback={<NavList pathname={null} collapsed={collapsed} onNavigate={onNavigate} />}>
          <ActiveNavLinks collapsed={collapsed} onNavigate={onNavigate} />
        </React.Suspense>

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="icon" className="mx-auto">
                <Link href="/dashboards/new" onClick={onNavigate} aria-label="New dashboard">
                  <Plus className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New dashboard</TooltipContent>
          </Tooltip>
        ) : (
          <Button asChild size="default" className="w-full justify-start gap-2">
            <Link href="/dashboards/new" onClick={onNavigate}>
              <Plus className="size-4" />
              New dashboard
            </Link>
          </Button>
        )}

        <div className="mt-auto space-y-2">
          <SidebarNetwork collapsed={collapsed} />
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggle}
                  aria-label="Expand sidebar"
                  className="mx-auto text-muted-foreground"
                >
                  <ChevronsRight className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <div className="px-1 text-[10px] leading-relaxed text-muted-foreground/70">
              <div className="flex items-center gap-1.5">
                <span>ARKIV VIZ</span>
                <span className="text-border">/</span>
                <span>v0.1</span>
              </div>
              <div>Built for ETHGlobal Mumbai</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeaderConnection() {
  const { status, connected, isLoading, error, refresh } = useNetworkStatus();
  const block = connected ? formatBlock(status?.blockNumber) : null;
  const label = connected
    ? status?.accessKeyConfigured
      ? "Live"
      : "Public RPC"
    : isLoading && !status
      ? "Connecting"
      : "Offline";

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/settings"
        className="hidden items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5 transition-colors hover:bg-muted/60 sm:flex"
      >
        <ConnectionDot />
        <span className="text-[11.5px] font-medium text-foreground">
          {status?.network.label ?? "Rabdi Testnet"}
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="font-mono text-[10.5px] text-muted-foreground">{label}</span>
        {block && (
          <>
            <span className="h-3 w-px bg-border" />
            <span className="tabular font-mono text-[10.5px] text-muted-foreground">{block}</span>
          </>
        )}
      </Link>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refresh()}
            disabled={isLoading}
            aria-label="Re-check Arkiv connection"
            className="text-muted-foreground"
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {error ? "Last connection check failed — retry" : "Re-check the Arkiv RPC connection"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function HeaderProfile() {
  const { settings } = useSettings();
  const initials =
    settings.profileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AV";

  return (
    <Link
      href="/settings"
      aria-label="Workspace settings"
      className="flex size-7 items-center justify-center rounded-full border border-border bg-muted/50 text-[10px] font-semibold tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {initials}
    </Link>
  );
}

function HeaderBreadcrumb() {
  const pathname = usePathname();
  const crumbs = breadcrumb(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb}-${index}`}>
            {index > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />}
            <span
              className={cn(
                "truncate",
                last ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              aria-current={last ? "page" : undefined}
            >
              {crumb}
            </span>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function DesktopHeader() {
  return (
    <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-border/70 bg-background/80 px-6 backdrop-blur-xl lg:flex xl:px-8">
      <React.Suspense
        fallback={<div className="h-3 w-32 rounded bg-muted/40" aria-hidden="true" />}
      >
        <HeaderBreadcrumb />
      </React.Suspense>
      <div className="ml-auto flex items-center gap-2">
        <HeaderConnection />
        <span className="h-4 w-px bg-border" />
        <HeaderProfile />
      </div>
    </header>
  );
}

function MobilePageTitle() {
  const pathname = usePathname();
  return <>{pageTitle(pathname)}</>;
}

function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
      <Button variant="ghost" size="icon" onClick={onMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <Link href="/" aria-label="ARKIV VIZ home" className="min-w-0">
        <ArkivLogo compact />
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings"
              aria-label="Arkiv connection"
              className="flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1.5"
            >
              <ConnectionDot />
              <span className="hidden text-[11px] font-medium text-foreground sm:inline">
                <React.Suspense fallback={null}>
                  <MobilePageTitle />
                </React.Suspense>
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Network and connection settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      // Storage may be unavailable; keep the expanded default.
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);

  return (
    <div className="app-canvas min-h-svh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[4.25rem]" : "w-60",
        )}
      >
        <SidebarBody collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      <div
        className={cn(
          "flex min-h-svh flex-col transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-[4.25rem]" : "lg:pl-60",
        )}
      >
        <MobileHeader onMenu={() => setMobileOpen(true)} />
        <DesktopHeader />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[17.5rem] border-sidebar-border bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <main
          id="main"
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
