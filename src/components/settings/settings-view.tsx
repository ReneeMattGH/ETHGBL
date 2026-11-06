"use client";

import * as React from "react";
import {
  Check,
  Download,
  HardDrive,
  LayoutDashboard,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Sun,
  User,
  UserRound,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnectionPanel } from "@/components/network/connection-panel";
import { useSettings } from "@/components/providers/settings-provider";
import { useDashboards, DASHBOARDS_KEY } from "@/lib/dashboard/store";
import { formatInteger } from "@/lib/format";
import { REFRESH_INTERVALS, formatRefreshInterval } from "@/lib/settings";

const THEMES = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

const PROFILE_NAME_MAX = 48;

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel space-y-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/40 text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {description && (
            <p className="section-subtitle mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className="mb-1.5 block text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsView() {
  const { settings, hydrated, updateSettings } = useSettings();
  const { dashboards } = useDashboards();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [profileName, setProfileName] = React.useState("");
  const [profileError, setProfileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (hydrated) setProfileName((current) => current || settings.profileName);
  }, [hydrated, settings.profileName]);

  const widgetCount = dashboards.reduce((total, dashboard) => total + dashboard.widgets.length, 0);
  const autoRefreshCount = dashboards.filter((dashboard) => dashboard.refreshIntervalMs > 0).length;
  const activeTheme = mounted ? (theme ?? "dark") : "dark";
  const profileDirty = profileName.trim() !== settings.profileName;

  const saveProfile = () => {
    const trimmed = profileName.trim();
    if (trimmed.length > PROFILE_NAME_MAX) {
      setProfileError(`Use ${PROFILE_NAME_MAX} characters or fewer.`);
      return;
    }
    setProfileError(null);
    updateSettings({ profileName: trimmed });
    toast.success(trimmed ? "Profile name saved locally" : "Profile name cleared");
  };

  const exportDashboards = () => {
    if (dashboards.length === 0) return;
    try {
      const blob = new Blob([JSON.stringify(dashboards, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "arkiv-viz-dashboards.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Dashboard configuration exported");
    } catch (error) {
      toast.error("Could not export dashboards", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
      <div className="space-y-4">
        <ConnectionPanel showSettingsLink={false} />

        <Section
          icon={Wifi}
          title="Network"
          description="Only networks exposed by the official SDK and reachable from the server are selectable."
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-foreground">Rabdi Testnet</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                chain 7794095 · tGLM · public testnet
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[9px]">
              SDK-supported
            </Badge>
          </div>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            The SDK also exports a localhost chain, but a local node is not reachable from the
            deployed server, so it is deliberately not offered here. The RPC endpoint and access key
            are configured server-side through environment variables and never sent to the browser.
          </p>
        </Section>

        <Section
          icon={RefreshCw}
          title="Refresh preferences"
          description="Defaults for newly created dashboards. Existing dashboards keep their own saved interval."
        >
          <Field
            label="Default refresh interval"
            htmlFor="default-refresh"
            hint={`Currently ${formatRefreshInterval(settings.defaultRefreshIntervalMs)}. Dashboard queries poll; there is no streaming. Every dashboard fetches once on open, then follows its interval.`}
          >
            <Select
              value={String(settings.defaultRefreshIntervalMs)}
              onValueChange={(value) =>
                updateSettings({ defaultRefreshIntervalMs: Number(value) })
              }
            >
              <SelectTrigger
                id="default-refresh"
                className="w-full text-[12px]"
                aria-label="Default refresh interval"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVALS.map((interval) => (
                  <SelectItem key={interval.value} value={String(interval.value)}>
                    {interval.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Section>
      </div>

      <div className="space-y-4">
        <Section
          icon={Palette}
          title="Appearance"
          description="Dark is the default. The choice is stored in this browser."
        >
          <div className="grid grid-cols-3 gap-1.5">
            {THEMES.map((option) => {
              const Icon = option.icon;
              const active = activeTheme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setTheme(option.value);
                    toast.success(`Theme set to ${option.label.toLowerCase()}`);
                  }}
                  aria-pressed={active}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-[11px] transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background/25 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {active && (
                    <Check className="absolute right-1.5 top-1.5 size-3 text-primary" />
                  )}
                  <Icon className="size-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          icon={LayoutDashboard}
          title="Dashboard preferences"
          description="Applied to tables and panels across every dashboard."
        >
          <Field
            label="Interface density"
            htmlFor="density"
            hint="Compact reduces row height and panel padding. Changes apply immediately."
          >
            <Select
              value={settings.density}
              onValueChange={(value) =>
                updateSettings({ density: value === "compact" ? "compact" : "comfortable" })
              }
            >
              <SelectTrigger id="density" className="w-full text-[12px]" aria-label="Interface density">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section
          icon={UserRound}
          title="Workspace profile"
          description="A display name for this browser only. ARKIV VIZ has no accounts or sessions."
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Display name" htmlFor="profile-name">
                <div className="relative">
                  <User className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="profile-name"
                    value={profileName}
                    onChange={(event) => {
                      const next = event.target.value;
                      setProfileName(next);
                      setProfileError(
                        next.trim().length > PROFILE_NAME_MAX
                          ? `Use ${PROFILE_NAME_MAX} characters or fewer.`
                          : null,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveProfile();
                      }
                    }}
                    placeholder="Your name"
                    aria-invalid={Boolean(profileError)}
                    aria-describedby={profileError ? "profile-error" : undefined}
                    className="h-8 pl-8 text-[12.5px]"
                  />
                </div>
              </Field>
              {profileError ? (
                <p id="profile-error" role="alert" className="mt-1.5 text-[10.5px] text-destructive">
                  {profileError}
                </p>
              ) : (
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  {profileName.trim().length}/{PROFILE_NAME_MAX} characters · stored under{" "}
                  <code className="font-mono">arkiv-viz:settings:v1</code>
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-[1.375rem] shrink-0 gap-1.5"
              onClick={saveProfile}
              disabled={!profileDirty || Boolean(profileError)}
            >
              <Save className="size-3.5" />
              Save
            </Button>
          </div>
        </Section>

        <Section
          icon={HardDrive}
          title="Local storage"
          description="Dashboards live in this browser so the app needs no backend or credentials."
        >
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Dashboards", value: formatInteger(dashboards.length) },
              { label: "Widgets", value: formatInteger(widgetCount) },
              { label: "Auto-refresh", value: formatInteger(autoRefreshCount) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
              >
                <dt className="stat-label">{item.label}</dt>
                <dd className="stat-value mt-1 text-[13px]">{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={exportDashboards}
              disabled={dashboards.length === 0}
            >
              <Download className="size-3.5" />
              Export configuration
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {dashboards.length === 0 ? "No dashboards to export yet." : "JSON only — no entity data is stored."}
            </span>
          </div>
          <p className="break-all rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
            {DASHBOARDS_KEY}
          </p>
        </Section>
      </div>
    </div>
  );
}
