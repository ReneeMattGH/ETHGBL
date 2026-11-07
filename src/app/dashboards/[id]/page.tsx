import { Suspense } from "react";
import { DashboardView } from "@/components/axis/dashboards";
import { Loading } from "@/components/axis/shared";
async function Content({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DashboardView entityKey={id} />; }
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<Loading label="Opening dashboard…" />}><Content params={params} /></Suspense>; }
