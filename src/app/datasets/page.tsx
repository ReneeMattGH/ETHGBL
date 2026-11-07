import type { Metadata } from "next";
import { MyDatasets } from "@/components/axis/my-datasets";

export const metadata: Metadata = { title: "My datasets" };

export default function DatasetsPage() {
  return <MyDatasets />;
}
