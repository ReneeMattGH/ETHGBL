import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/explore-view";
import { ConnectionBadge, RealDataIndicator } from "@/components/network/connection-badge";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Explore",
  description: "Explore live Arkiv entities with verified query patterns.",
};

export default function ExplorePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Explore"
        title="Explore the keyspace"
        description="Start from a verified query pattern, inspect real entities, then take the query into the builder."
        actions={
          <>
            <RealDataIndicator />
            <ConnectionBadge />
          </>
        }
      />
      <ExploreView />
    </div>
  );
}
