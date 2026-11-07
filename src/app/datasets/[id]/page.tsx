import { Suspense } from "react";
import { DatasetDetail } from "@/components/axis/datasets";
import { Loading } from "@/components/axis/shared";
async function Content({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DatasetDetail entityKey={id} />; }
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<Loading label="Opening dataset…" />}><Content params={params} /></Suspense>; }
