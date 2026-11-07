// The browser stays on the Vercel origin while its API is hosted on AWS.
// Only the explicitly configured production frontend can make cross-origin
// mutations. Forwarded headers and arbitrary preview domains grant no trust.
export function mutationOrigin(request: Request, frontend = process.env.AXIS_FRONTEND_ORIGIN): string | null {
  const ownOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin === ownOrigin) return ownOrigin;
  if (!frontend?.trim()) return null;
  try {
    const allowed = new URL(frontend.trim());
    if (allowed.protocol !== "https:" || allowed.username || allowed.password || allowed.pathname !== "/" || allowed.search || allowed.hash) return null;
    return origin === allowed.origin ? origin : null;
  } catch { return null; }
}
