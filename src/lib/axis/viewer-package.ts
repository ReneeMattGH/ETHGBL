import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Only the report renderer and its read dependencies are shipped. Never recurse
// through the workspace, copy .env files, or include editor/worker API routes.
export const VIEWER_SOURCE_FILES = [
  ...["report-website", "dashboard-report", "dashboard-filters", "dataset-query-filters", "shared", "charts", "advanced-plots", "relationship-plots"].map(name => `src/components/axis/${name}.tsx`),
  ...["model", "core", "query-filters", "query-scope", "schemas", "store", "runtime", "queue", "dataset-schema", "public-report", "catalog-sources", "chart-data", "chart-config", "analytical-layout", "catalog-insight-model", "bulk/publication-model"].map(name => `src/lib/axis/${name}.ts`),
  ...["axis", "analytics", "dashboard-builder"].map(name => `src/app/${name}.css`),
];

const route = `import { publicReport, readReportData, reportDatasets, reportSchema } from "@/lib/axis/public-report";
import { safeError } from "@/lib/axis/runtime";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string; path: string[] }> };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(_request: Request, context: Context) {
  try {
    const { id, path } = await context.params;
    const dashboard = await publicReport(id);
    if (path.length === 1 && path[0] === "definition") return json({ service: "axis-dashboard-viewer", dashboard });
    if (path.length === 1 && path[0] === "datasets") return json({ datasets: await reportDatasets(dashboard) });
    if (path.length === 2 && path[0] === "schema") return json(await reportSchema(dashboard, path[1]));
    return json({ error: "Unknown report endpoint." }, 404);
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id, path } = await context.params;
    if (path.length !== 1 || path[0] !== "query") return json({ error: "Only report data reads are available." }, 404);
    const text = await request.text();
    if (text.length > 200000) return json({ error: "Request too large." }, 413);
    return json(await readReportData(await publicReport(id), JSON.parse(text)));
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
`;

export async function dashboardViewerFiles(root = process.cwd()): Promise<Record<string, string>> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const dependencyNames = ["next", "react", "react-dom", "@arkiv-network/sdk", "viem", "lucide-react", "recharts"];
  const devNames = ["typescript", "@types/node", "@types/react", "@types/react-dom"];
  const files = Object.fromEntries(await Promise.all(VIEWER_SOURCE_FILES.map(async file => [file, await readFile(join(root, file), "utf8")])));
  Object.assign(files, {
    "package.json": JSON.stringify({ name: "axis-dashboard-viewer", version: "1.0.0", private: true, scripts: { dev: "next dev", build: "next build", start: "next start", typecheck: "tsc --noEmit" }, dependencies: Object.fromEntries(dependencyNames.map(name => [name, pkg.dependencies[name]])), devDependencies: Object.fromEntries(devNames.map(name => [name, pkg.devDependencies[name]])) }, null, 2),
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] } }, include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"], exclude: ["node_modules"] }, null, 2),
    "next.config.ts": `import type { NextConfig } from "next";\nconst config: NextConfig = { poweredByHeader: false, experimental: { devValidationWorker: false }, turbopack: { root: process.cwd() } };\nexport default config;\n`,
    ".gitignore": "node_modules\n.next\n.vercel\n.env*\n*.tsbuildinfo\nnext-env.d.ts\n",
    ".vercelignore": "node_modules\n.next\n.env*\n*.tsbuildinfo\nnext-env.d.ts\n",
    "src/app/layout.tsx": `import type { Metadata } from "next";\nimport "./website.css";\nimport "./axis.css";\nimport "./analytics.css";\nimport "./dashboard-builder.css";\nexport const metadata: Metadata = { title: "Public dashboard", description: "Interactive analytics from verified Arkiv data." };\nexport default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><div className="axis-layout axis-website"><main className="axis-content">{children}</main></div></body></html>; }\n`,
    "src/app/website.css": `* { box-sizing:border-box; } body { margin:0; } button,input,textarea,select { font:inherit; } button { cursor:pointer; } h1,h2,h3,p { margin:0; } a { color:inherit; } .axis-website { --font-geist-sans:Arial,Helvetica,sans-serif; --font-geist-mono:monospace; } .axis-website > .axis-content { max-width:none; padding:28px; } .axis-website .axis-report-pane { top:20px; max-height:calc(100svh - 40px); } .axis-website .axis-report-studio-header h1 { margin-top:8px; } @media(max-width:850px) { .axis-website > .axis-content { padding:18px 14px; } .axis-website .axis-report-pane { max-height:470px; } }\n`,
    "src/app/page.tsx": `export default function Home() { return <div className="axis-empty"><h1>Dashboard websites</h1><p>Open a shared dashboard link to explore its charts and filters.</p></div>; }\n`,
    "src/app/d/[id]/page.tsx": `import { cache } from "react";\nimport { notFound } from "next/navigation";\nimport { publicReport } from "@/lib/axis/public-report";\nimport { ReportWebsite } from "@/components/axis/report-website";\nexport const dynamic = "force-dynamic";\nconst load = cache(publicReport);\ntype Props = { params: Promise<{ id: string }> };\nexport async function generateMetadata({ params }: Props) { try { const report = await load((await params).id); return { title: report.title, description: report.document.description }; } catch { return { title: "Dashboard unavailable" }; } }\nexport default async function Page({ params }: Props) { const { id } = await params; if (!/^0x[0-9a-fA-F]{64}$/.test(id)) notFound(); const dashboard = await load(id).catch(() => null); if (!dashboard) notFound(); return <ReportWebsite key={id} dashboard={dashboard} />; }\n`,
    "src/app/d/[id]/loading.tsx": `export default function Loading() { return <div className="axis-empty" role="status">Loading dashboard...</div>; }\n`,
    "src/app/not-found.tsx": `export default function NotFound() { return <div className="axis-empty"><h1>Dashboard unavailable</h1><p>This dashboard may have expired, been deleted, or be temporarily unavailable.</p></div>; }\n`,
    "src/app/api/health/route.ts": `export function GET() { return Response.json({ service: "axis-dashboard-viewer", version: 1 }); }\n`,
    "src/app/api/reports/[id]/[...path]/route.ts": route,
    "README.md": "# AXIS dashboard viewer\n\nThis is the separate public report website. It serves every published dashboard at /d/<Arkiv-entity-key>. It contains no AXIS workspace pages or mutation endpoints.\n\nInstall with npm install. Build with npm run build. Set ARKIV_ACCESS_KEY and AXIS_INDEXER_ADDRESS in Vercel; optionally set ARKIV_RPC_URL. Never add an indexer private key. Deploy this directory once as a Next.js project. Make its production domain publicly accessible.\n\nSet AXIS_DASHBOARD_VIEWER_URL to that production origin in the local AXIS platform. The builder's Deploy button then publishes each dashboard to Arkiv and verifies its own public link.\n",
  });
  return files;
}

export async function prepareDashboardViewer(root = process.cwd()) {
  const output = resolve(root, ".axis", "dashboard-viewer"), files = await dashboardViewerFiles(root);
  for (const [file, data] of Object.entries(files)) {
    const target = resolve(output, file);
    if (!target.startsWith(output + sep)) throw new Error("Viewer file is outside its output directory.");
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, data);
  }
  return { directory: output, files: Object.keys(files).length };
}
