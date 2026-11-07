import type { NextConfig } from "next";

const apiOrigin = process.env.AXIS_API_ORIGIN?.trim();
if (apiOrigin) {
  const url = new URL(apiOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("AXIS_API_ORIGIN must be an HTTPS origin without credentials, a path, query or fragment.");
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async rewrites() {
    return { beforeFiles: apiOrigin ? [{ source: "/api/axis/:path*", destination: `${new URL(apiOrigin).origin}/api/axis/:path*` }] : [], afterFiles: [], fallback: [] };
  },
  outputFileTracingExcludes: {
    "/*": [".axis/**/*", ".env*"],
  },
  experimental: {
    // Work around missing client-reference factories in the dev validation worker.
    // https://github.com/vercel/next.js/issues/98393
    devValidationWorker: false,
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
