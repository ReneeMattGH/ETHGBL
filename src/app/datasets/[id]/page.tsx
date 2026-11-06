import { Suspense } from "react";
import { DatasetDetail } from "@/components/axis/datasets";
async function Content({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DatasetDetail entityKey={id} />; }
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<p>Opening AXIS...</p>}><Content params={params} /></Suspense>; }
