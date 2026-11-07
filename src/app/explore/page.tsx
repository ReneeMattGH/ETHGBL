import { Suspense } from "react";
import { DataCatalog } from "@/components/axis/catalog";
import { Loading } from "@/components/axis/shared";
export default function ExplorePage() { return <Suspense fallback={<Loading label="Opening data catalog…" />}><DataCatalog /></Suspense>; }
