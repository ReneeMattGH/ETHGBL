import { Suspense } from "react";
import { QueryStudio } from "@/components/axis/query-studio";
import { Loading } from "@/components/axis/shared";
export default function QueryPage() { return <Suspense fallback={<Loading label="Opening Query Studio…" />}><QueryStudio /></Suspense>; }
