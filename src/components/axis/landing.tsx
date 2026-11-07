"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Database, Fingerprint, Layers3, LayoutDashboard, Menu, Terminal, X } from "lucide-react";
import { LandingPreview } from "./landing-preview";

function AxisLogo() {
  return <span className="landing-wordmark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 28 16 4l11 24M10 19h12M5 4l22 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" /></svg>axis<span className="landing-logo-period">.</span></span>;
}

function Spark({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true"><path d="m50 0 7 31 25-21-15 29 33 3-31 12 25 22-32-9-5 33-11-31-24 24 12-31-34-5 32-10L9 21l30 13Z" fill="currentColor" /></svg>;
}

function HeroTitle() {
  return <div className="landing-hero-title landing-statement-title">
    <h1 aria-label="AXIS — Arkiv eXploration and Intelligence System. Your Dune Analytics alternative. Built on Arkiv.">
      <span className="landing-reveal-line"><span>Your Dune</span></span>
      <span className="landing-reveal-line"><span>Analytics</span></span>
      <span className="landing-reveal-line landing-statement-accent"><span>alternative.</span></span>
    </h1>
    <div className="landing-built-signature"><p>Built on Arkiv.</p><p>AXIS — Arkiv eXploration and Intelligence System</p></div>
  </div>;
}

const steps = [
  { name: "Bring the data", action: "01 / INGEST", title: "Start where the activity happens.", copy: "The multichain vision starts with a shared data pipeline: bring onchain activity into datasets with an explicit source and verifiable coverage.", icon: Database, link: "/datasets/new", cta: "Create a dataset", fields: ["Onchain activity", "Source-aware datasets", "Verifiable coverage"] },
  { name: "Put it in Arkiv", action: "02 / STORE", title: "Give every record a place to live.", copy: "Onchain records become typed, indexed Arkiv entities. Keep the source, block and transaction context alongside the data you explore.", icon: Layers3, link: "/explore", cta: "Explore the datasets", fields: ["Typed attributes", "Source + transaction", "Queryable entities"] },
  { name: "Ask a question", action: "03 / QUERY", title: "Follow your curiosity, precisely.", copy: "Filter by wallet, time, or a native Arkiv predicate. Calculate totals and distributions across the complete matching result.", icon: Terminal, link: "/query", cta: "Open Query Studio", fields: ["Wallet + time filters", "Native typed predicates", "Exact token arithmetic"] },
  { name: "Share the answer", action: "04 / VISUALIZE", title: "Make the insight everyone's.", copy: "Give each widget its own query. Publish the dashboard definition with your wallet so anyone can open it and explore the results.", icon: LayoutDashboard, link: "/dashboards/new", cta: "Build a dashboard", fields: ["Independent widget queries", "User-wallet publishing", "Public dashboards"] },
];

function Pipeline() {
  const [active, setActive] = React.useState(0);
  const step = steps[active], Icon = step.icon;
  return <section id="how-it-works" className="landing-section landing-pipeline">
    <div className="landing-section-heading"><h2>Follow the data.<br />Find your answer.</h2><p>An open analytics workspace for a multichain world. Bring data together, explore the activity, and share what you discover.</p></div>
    <div className="landing-step-tabs" role="tablist" aria-label="How AXIS works">{steps.map((item, index) => <button type="button" role="tab" id={`pipeline-tab-${index}`} aria-controls="pipeline-panel" aria-selected={active === index} tabIndex={active === index ? 0 : -1} key={item.action} onClick={() => setActive(index)} onKeyDown={event => { if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 3 : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4; setActive(next); document.getElementById(`pipeline-tab-${next}`)?.focus(); } }}><span>0{index + 1}</span>{item.name}<ArrowRight size={20} aria-hidden="true" /></button>)}</div>
    <div className={`landing-step-panel step-${active}`} id="pipeline-panel" role="tabpanel" aria-labelledby={`pipeline-tab-${active}`}>
      <div className="landing-step-copy"><h3>{step.title}</h3><p>{step.copy}</p><Link href={step.link} className="landing-text-link">{step.cta}<ArrowUpRight size={21} /></Link></div>
      <div className="landing-step-art"><div className="landing-step-symbol"><Icon size={72} strokeWidth={1.25} aria-hidden="true" /></div><div className="landing-step-fields">{step.fields.map(field => <div key={field}><Check size={20} aria-hidden="true" />{field}</div>)}</div></div>
    </div>
  </section>;
}

const faqs = [
  ["What is AXIS?", "AXIS stands for Arkiv eXploration and Intelligence System. It is being built as an open, multichain alternative to Dune, with Arkiv at the center of data storage, native queries and public analytics dashboards."],
  ["What does multichain mean for AXIS?", "The product vision covers onchain activity across multiple chains, beyond any single token or network. The current local implementation demonstrates the pipeline with Polygon USDC transfers; additional chain adapters and broader datasets are still to be implemented. Each dataset shows its actual source and verified coverage."],
  ["Do I need a wallet to use it?", "You can browse public datasets, run queries and view dashboards without connecting a wallet. Creating dataset definitions and publishing dashboards requires a browser wallet connected to Arkiv Rabdi with test tokens for transactions."],
  ["How fresh is the data?", "Freshness depends on the dataset's verified ingestion checkpoint. The example dashboard refreshes its Arkiv queries every 30 seconds and shows both imported coverage and source lag, so you can see which activity has actually been verified."],
  ["Is Query Studio SQL?", "Query Studio uses Arkiv's native typed filters, with an AXIS analytics layer for aggregations and visualizations. It supports wallet, block and timestamp filters, additional native predicates and complete-result exports; it does not execute arbitrary SQL."],
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return <div className="landing-page">
    <a className="landing-skip" href="#landing-main">Skip to content</a>
    <header className="landing-header"><Link href="/" aria-label="AXIS home"><AxisLogo /></Link><nav className={menuOpen ? "landing-nav is-open" : "landing-nav"} aria-label="Landing navigation"><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><Link href="/dashboards" onClick={() => setMenuOpen(false)}>Explore a dashboard</Link><a href="#questions" onClick={() => setMenuOpen(false)}>Questions?</a></nav><div className="landing-header-actions"><Link className="landing-button small" href="/overview">Open workspace<ArrowUpRight size={18} /></Link><button type="button" className="landing-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="landing-mobile-nav" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X /> : <Menu />}</button></div></header>
    <nav id="landing-mobile-nav" className="landing-mobile-nav" aria-label="Mobile landing navigation" hidden={!menuOpen} onKeyDown={event => { if (event.key === "Escape") { setMenuOpen(false); document.querySelector<HTMLButtonElement>(".landing-menu")?.focus(); } }}><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><Link href="/dashboards" onClick={() => setMenuOpen(false)}>Explore a dashboard</Link><a href="#questions" onClick={() => setMenuOpen(false)}>Questions?</a></nav>
    <main id="landing-main">
      <section className="landing-hero">
        <div className="landing-hero-copy"><HeroTitle /><p>Explore onchain activity, run native queries, and publish dashboards. One connected workspace, powered by Arkiv.</p><div className="landing-hero-actions"><Link href="/dashboards" className="landing-button">Explore live analytics<ArrowUpRight size={24} /></Link><a className="landing-hero-how" href="#how-it-works">See how it works<ArrowDown size={22} /></a></div></div>
        <div className="landing-hero-canvas"><Spark className="landing-hero-spark" /><div className="landing-canvas-orbit" aria-hidden="true" /><LandingPreview /><div className="landing-query-sticker"><Terminal size={24} /><strong>Onchain questions.<br />Arkiv answers.</strong></div><span className="landing-canvas-corner" aria-hidden="true">↗</span></div>
      </section>
      <div className="landing-signal-strip"><span>MULTICHAIN VISION</span><span aria-hidden="true">↗</span><span>ARKIV AT THE CORE</span><span aria-hidden="true">↗</span><span>OPEN ANALYTICS</span></div>
      <Pipeline />
      <section className="landing-proof landing-section" id="why-axis"><div className="landing-proof-visual"><div className="landing-proof-paper"><div className="landing-proof-paper-header"><Fingerprint size={27} /><span>BUILT TO BE INSPECTED</span></div><div className="landing-proof-row"><span>Context</span><b>Source-aware datasets</b></div><div className="landing-proof-row"><span>Storage</span><b>Arkiv</b></div><div className="landing-proof-row"><span>Traceability</span><b>Block → transaction → log</b></div><div className="landing-proof-row"><span>Dashboards</span><b>Owned by your wallet</b></div><div className="landing-proof-stamp"><Check size={23} />Follow every answer<br />back to its source.</div></div><Spark className="landing-proof-spark" /></div><div className="landing-proof-copy"><h2>Good charts.<br />Even better<br /><span>receipts.</span></h2><p>Every insight starts somewhere. See the source blocks, inspect the transfer records, and check the coverage behind your query.</p><p>AXIS shows what has been verified, what is still being imported, and when the results were fetched.</p><Link href="/explore" className="landing-text-link">Look under the hood<ArrowUpRight size={22} /></Link></div></section>
      <section className="landing-questions landing-section" id="questions"><div><h2>A few things<br />worth knowing.</h2><p>You can get a feel for AXIS before connecting a wallet.</p><Link href="/overview" className="landing-text-link">Take a look around<ArrowUpRight size={21} /></Link></div><div className="landing-faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></section>
      <section className="landing-final"><h2>Less staring at data.<br />More seeing <span>possibility.</span></h2><div className="landing-final-actions"><Link href="/overview" className="landing-button">Start exploring<ArrowUpRight size={23} /></Link><Link href="/dashboards" className="landing-text-link">Explore a dashboard<ArrowRight size={22} /></Link></div><Spark className="landing-final-spark" /></section>
    </main>
    <footer className="landing-footer"><div><Link href="/" aria-label="AXIS home"><AxisLogo /></Link></div><nav aria-label="Footer navigation"><Link href="/explore">Datasets</Link><Link href="/query">Query Studio</Link><a href="https://github.com/ReneeMattGH/ETHGBL" target="_blank" rel="noreferrer">GitHub<ArrowUpRight size={15} /></a></nav></footer>
  </div>;
}
