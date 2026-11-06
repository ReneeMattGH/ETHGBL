import { Suspense } from "react";
import { DashboardBuilder } from "@/components/axis/dashboards";
export default function NewDashboardPage() { return <Suspense fallback={<p>Opening dashboard builder...</p>}><DashboardBuilder /></Suspense>; }
