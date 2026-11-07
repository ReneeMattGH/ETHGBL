"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Globe2, Rocket, X } from "lucide-react";
import type { DashboardDeployment, ViewerConfiguration } from "@/lib/axis/dashboard-deployment";
import { api } from "./shared";
import { walletError } from "./wallet";

export function DashboardDeployButton({ disabled, prepare, onBusyChange, onError }: {
  disabled: boolean; prepare: () => Promise<{ entityKey: string; documentHash: string }>;
  onBusyChange: (busy: boolean) => void; onError: (error: string | null) => void;
}) {
  const [stage, setStage] = React.useState(""), [deployment, setDeployment] = React.useState<DashboardDeployment | null>(null);
  const [open, setOpen] = React.useState(false), [copied, setCopied] = React.useState(false), [copyError, setCopyError] = React.useState("");
  const dialog = React.useRef<HTMLDialogElement>(null), trigger = React.useRef<HTMLButtonElement>(null), running = React.useRef(false);
  React.useEffect(() => { if (open && deployment) dialog.current?.showModal(); }, [open, deployment]);
  const deploy = async () => {
    if (disabled || running.current) return;
    running.current = true; onBusyChange(true); onError(null); setCopied(false); setCopyError("");
    try {
      setStage("Checking hosting...");
      const config = await api<ViewerConfiguration>("dashboard-deploy");
      if (!config.configured) throw new Error("Public dashboard hosting is not connected yet. Connect the separate dashboard viewer before deploying a website.");
      setStage("Saving dashboard...");
      const saved = await prepare();
      setStage("Verifying website...");
      const result = await api<DashboardDeployment>("dashboard-deploy", saved);
      setDeployment(result); setOpen(true);
    } catch (caught) { onError(walletError(caught)); }
    finally { running.current = false; setStage(""); onBusyChange(false); }
  };
  return <>
    <button ref={trigger} type="button" className="axis-button" disabled={disabled || Boolean(stage)} onClick={() => void deploy()}><Rocket size={15} />{stage || "Deploy"}</button>
    {deployment && <dialog ref={dialog} className="axis-deploy-dialog" aria-labelledby="deployment-title" onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className="axis-deploy-dialog-heading"><span className="axis-deploy-icon"><Globe2 size={24} /></span><button type="button" className="axis-icon-button" aria-label="Close deployment details" onClick={() => dialog.current?.close()}><X size={19} /></button></div>
      <h2 id="deployment-title">Your dashboard website is ready</h2><p>{deployment.title} is available at its own public link. Anyone with the link can view the dashboard and use its filters.</p>
      <label className="axis-field"><span>Website link</span><input aria-label="Dashboard website link" readOnly value={deployment.url} onFocus={event => event.target.select()} /></label>
      <div className="axis-actions"><a className="axis-button" href={deployment.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Open website</a><button type="button" className="axis-button secondary" onClick={() => void navigator.clipboard.writeText(deployment.url).then(() => { setCopied(true); setCopyError(""); }).catch(() => setCopyError("Select and copy the website link above."))}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</button></div>
      {copyError && <p role="status">{copyError}</p>}
      <p className="axis-deploy-help">Changes published to this dashboard appear at the same link. Its Arkiv definition and source datasets need to remain active.</p>
    </dialog>}
  </>;
}
