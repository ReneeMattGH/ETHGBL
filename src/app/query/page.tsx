import { Suspense } from "react";
import { QueryStudio } from "@/components/axis/query-studio";
export default function QueryPage() { return <Suspense fallback={<p>Opening Query Studio...</p>}><QueryStudio /></Suspense>; }
