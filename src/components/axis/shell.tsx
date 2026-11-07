"use client";

// @refresh reset

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Archive, ArrowLeft, Database, FolderClosed, LayoutDashboard, Layers2, LoaderCircle, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Terminal, Wallet, X } from "lucide-react";
import { AxisWalletProvider, useAxisWallet } from "./wallet";
import { short } from "./shared";

const links = [
  { href: "/overview", label: "Overview", icon: Activity },
  { href: "/explore", label: "Data Explorer", icon: Database },
  { href: "/query", label: "Query Studio", icon: Terminal },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { href: "/datasets", label: "My datasets", icon: FolderClosed },
  { href: "/snapshots", label: "Swarm snapshots", icon: Archive },
  { href: "/ingestion", label: "Ingestion Monitor", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(), wallet = useAxisWallet();
  const editingDashboard = pathname.match(/^\/dashboards\/([^/]+)\/edit\/?$/)?.[1];
  const builder = pathname === "/dashboards/new" || Boolean(editingDashboard);
  const backHref = editingDashboard ? "/dashboards" : "/query";
  const backDestination = editingDashboard ? "Dashboards" : "Query Studio";
  const [open, setOpen] = React.useState(false), [collapsed, setCollapsed] = React.useState(false);
  const mobileNavigationActive = open && !builder;
  const sidebar = React.useRef<HTMLElement>(null), menu = React.useRef<HTMLButtonElement>(null);
  const current = links.find(item => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? (pathname.startsWith("/datasets") ? "Dataset" : "Workspace");
  React.useEffect(() => {
    if (!mobileNavigationActive) return;
    const viewport = window.matchMedia("(max-width: 900px)");
    if (!viewport.matches) return;
    const onViewportChange = () => { if (!viewport.matches) setOpen(false); };
    viewport.addEventListener("change", onViewportChange);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menu.current?.focus(); }
      if (event.key === "Tab") {
        const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); viewport.removeEventListener("change", onViewportChange); document.body.style.overflow = previousOverflow; };
  }, [mobileNavigationActive]);

  return <div className="axis-layout" data-collapsed={collapsed} data-builder={builder}>
    <a className="axis-skip" href="#main">Skip to content</a>
    {!builder && <aside id="axis-workspace-sidebar" ref={sidebar} className={open ? "axis-sidebar open" : "axis-sidebar"} aria-label="Workspace sidebar">
      <Link className="axis-brand" href="/" aria-label="AXIS Arkiv analytics" onClick={() => setOpen(false)}><svg className="axis-brand-symbol" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 28 16 4l11 24M10 19h12M5 4l22 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /></svg><span className="axis-brand-label">axis<span className="axis-brand-period">.</span></span></Link>
      <nav aria-label="Primary">{links.map(item => <Link key={item.href} href={item.href} aria-label={item.label} title={collapsed ? item.label : undefined} className={item.href === "/ingestion" ? "axis-nav-separated" : undefined} onClick={() => setOpen(false)} aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}><item.icon size={18} strokeWidth={1.75} /><span className="axis-nav-label">{item.label}</span></Link>)}</nav>
      <div className="axis-sidebar-footer"><span className="axis-sidebar-footer-mark"><Layers2 size={17} /></span><div><b>Powered by Arkiv</b><span>Onchain analytics</span></div></div>
    </aside>}
    <div className="axis-main">
      <header className="axis-topbar"><div className="axis-topbar-start">
        {builder ? <Link className="axis-builder-back" href={backHref} aria-label={"Back to " + backDestination} title={"Back to " + backDestination} onClick={() => setOpen(false)}><ArrowLeft size={17} /><span>Back<span className="axis-builder-back-destination"> to {backDestination}</span></span></Link> : <>
        <button className="axis-icon-button axis-collapse-button" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        <button ref={menu} className="axis-icon-button axis-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} aria-controls="axis-workspace-sidebar" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
        <div className="axis-topbar-label">Workspace<span>/</span><b>{current}</b></div></>}
      </div><div className="axis-header-actions">
        <span className="axis-network-chip" aria-label="Network: Rabdi Testnet" title="Arkiv Rabdi · Chain 7794095"><Layers2 size={16} strokeWidth={1.8} /><span>Rabdi Testnet</span></span>
        <div className={`axis-wallet-control ${wallet.address ? "connected" : ""}`}>
          <button className="axis-wallet-button" aria-label={wallet.address ? `Switch wallet ${wallet.address}` : "Connect wallet"} title={wallet.address ?? "Connect your wallet"} onClick={() => void wallet.connect().catch(() => {})} disabled={wallet.busy}>
            <span className="axis-wallet-symbol">{wallet.busy ? <LoaderCircle size={17} className="animate-spin" /> : <Wallet size={17} strokeWidth={1.8} />}</span>
            <span>{wallet.busy ? "Connecting…" : wallet.address ? short(wallet.address) : "Connect wallet"}</span>
          </button>
          {wallet.address && <button className="axis-wallet-disconnect" aria-label="Disconnect" title="Disconnect wallet" onClick={wallet.disconnect}><LogOut size={17} strokeWidth={1.8} /></button>}
        </div>
      </div></header>
      {wallet.error && <div className="axis-global-error" role="alert">{wallet.error}</div>}
      <main id="main" className="axis-content">{children}</main>
    </div>
    {open && !builder && <button className="axis-mobile-shade" aria-label="Dismiss navigation" onClick={() => { setOpen(false); menu.current?.focus(); }} />}
  </div>;
}

function RouteContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname === "/" ? children : <ShellContent>{children}</ShellContent>;
}
export function AxisShell({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<div className="axis-empty">Opening AXIS…</div>}><AxisWalletProvider><RouteContent>{children}</RouteContent></AxisWalletProvider></React.Suspense>;
}
