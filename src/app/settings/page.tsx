import type { Metadata } from "next";
import { RealDataIndicator } from "@/components/network/connection-badge";
import { SettingsView } from "@/components/settings/settings-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Settings",
  description: "Connection, refresh and appearance settings for ARKIV VIZ.",
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Arkiv connection, network, refresh and appearance preferences. Connection details are read from the server-side SDK; preferences stay in this browser."
        actions={<RealDataIndicator />}
      />
      <SettingsView />
    </div>
  );
}
