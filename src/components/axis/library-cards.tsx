"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, Clock3, Database, Globe2, LayoutDashboard, Wallet } from "lucide-react";
import type { Dataset, SavedDocument } from "@/lib/axis/model";
import { short } from "./shared";

function CardFooter({ owner, date }: { owner: string; date: string }) {
  return <div className="axis-library-card-footer"><span title={owner} className="axis-library-owner"><span className="axis-library-avatar"><Wallet size={12} /></span>{short(owner)}</span><span title={new Date(date).toLocaleString()}><Clock3 size={13} /><time dateTime={date}>{new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></span></div>;
}

export function DashboardCard({ dashboard, heading = "h2" }: { dashboard: SavedDocument; heading?: "h2" | "h3" }) {
  const widgets = dashboard.document.widgets, Heading = heading;
  return <Link href={`/dashboards/${dashboard.key}/edit`} className="axis-dataset-card axis-library-card">
    <div className="axis-library-card-heading"><span className="axis-library-card-icon"><LayoutDashboard size={20} strokeWidth={1.6} /></span><ArrowUpRight size={18} className="axis-library-card-arrow" aria-hidden="true" /></div>
    <div className="axis-library-card-copy"><Heading>{dashboard.title}</Heading>{dashboard.document.description && <p>{dashboard.document.description}</p>}</div>
    <div className="axis-library-card-widgets"><BarChart3 size={15} /><span>{widgets.length} {widgets.length === 1 ? "widget" : "widgets"}</span><span className="axis-library-card-public"><Globe2 size={14} />Public</span></div>
    <CardFooter owner={dashboard.owner} date={dashboard.updatedAt} />
  </Link>;
}

export function DatasetCard({ dataset, heading = "h2" }: { dataset: Dataset; heading?: "h2" | "h3" }) {
  const Heading = heading;
  return <article className="axis-dataset-card axis-library-card axis-library-dataset" aria-label={dataset.name}>
    <Link className="axis-library-dataset-open" href={`/datasets/${dataset.key}`} aria-label={`Open ${dataset.name}`}>
      <div className="axis-library-card-heading"><span className="axis-library-card-icon"><Database size={20} strokeWidth={1.6} /></span><ArrowUpRight size={18} className="axis-library-card-arrow" aria-hidden="true" /></div>
      <div className="axis-library-card-copy"><Heading>{dataset.name}</Heading>{dataset.description && <p>{dataset.description}</p>}</div>
      <div className="axis-library-card-widgets"><Database size={15} /><span title={dataset.contract}>{dataset.chainId === 137 ? "Polygon USDC" : `Chain ${dataset.chainId}`}</span><span className="axis-library-card-public"><Globe2 size={14} />Public</span></div>
      <CardFooter owner={dataset.owner} date={dataset.createdAt} />
    </Link>
    <div className="axis-library-dataset-actions"><span className={`axis-library-definition ${dataset.enabled ? "is-enabled" : "is-paused"}`}><i aria-hidden="true" />{dataset.enabled ? "Enabled" : "Paused"}</span><Link className="axis-button secondary" aria-label={`Query ${dataset.name}`} href={`/query?dataset=${dataset.key}`}>Query dataset<ArrowUpRight size={14} /></Link></div>
  </article>;
}
