export type Density = "comfortable" | "compact";

export type AppSettings = {
  profileName: string;
  defaultRefreshIntervalMs: number;
  density: Density;
};

export const SETTINGS_KEY = "arkiv-viz:settings:v1";

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: "",
  defaultRefreshIntervalMs: 30_000,
  density: "comfortable",
};

export const REFRESH_INTERVALS: { value: number; label: string }[] = [
  { value: 0, label: "Off — manual only" },
  { value: 5_000, label: "Every 5 seconds" },
  { value: 10_000, label: "Every 10 seconds" },
  { value: 30_000, label: "Every 30 seconds" },
  { value: 60_000, label: "Every minute" },
  { value: 300_000, label: "Every 5 minutes" },
];

export function formatRefreshInterval(ms: number): string {
  if (ms <= 0) return "Manual";
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      profileName: typeof parsed.profileName === "string" ? parsed.profileName : DEFAULT_SETTINGS.profileName,
      defaultRefreshIntervalMs:
        typeof parsed.defaultRefreshIntervalMs === "number" && Number.isFinite(parsed.defaultRefreshIntervalMs)
          ? Math.max(0, parsed.defaultRefreshIntervalMs)
          : DEFAULT_SETTINGS.defaultRefreshIntervalMs,
      density: parsed.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("arkiv-viz:settings-changed"));
  } catch {
    // Storage may be unavailable (private mode, quota); settings remain in memory.
  }
}
