import { Suspense } from "react";
import { DashboardBuilder } from "@/components/axis/dashboards";
import { Loading } from "@/components/axis/shared";
export default function NewDashboardPage() { return <Suspense fallback={<Loading label="Opening dashboard builder…" />}><DashboardBuilder /></Suspense>; }
