import { SnapshotViewer } from "@/components/axis/swarm-snapshot";
import { Suspense } from "react";
import { Loading } from "@/components/axis/shared";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SnapshotViewer entityKey={id} />;
}
export default function SnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Loading label="Opening snapshot…" />}><Content params={params} /></Suspense>;
}
