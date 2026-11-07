import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./axis.css";
import "./dashboard-catalog.css";
import "./dataset-library.css";
import "./catalog.css";
import "./analytics.css";
import "./dashboard-builder.css";
import "./workspace-theme.css";
import "./landing.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AXIS — Arkiv eXploration and Intelligence System",
    template: "%s · AXIS",
  },
  description:
    "Turn live Arkiv queries into interactive dashboards. Real entities, real fields, real refresh cycles.",
  applicationName: "AXIS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-svh">
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
