/** Best-effort client IP for rate limiting on anonymous routes (trust headers only when placed behind a proxy). */
export function clientIpKeyFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xReal = req.headers.get("x-real-ip")?.trim();
  if (xReal) return xReal;
  return "unknown";
}
