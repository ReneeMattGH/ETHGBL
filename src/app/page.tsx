import type { Metadata } from "next";
import { LandingPage } from "@/components/axis/landing";

export const metadata: Metadata = {
  title: "AXIS — Arkiv eXploration and Intelligence System",
  description: "Your Dune Analytics alternative, built on Arkiv. Explore onchain activity, run native queries, and publish wallet-owned dashboards with AXIS.",
};

export default function HomePage() { return <LandingPage />; }
