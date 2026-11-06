import { Suspense } from "react";
import { DashboardView } from "@/components/axis/dashboards";
async function Content({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DashboardView entityKey={id} edit />; }
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p>Opening AXIS...</p>}><Content params={params} /></Suspense>; }
