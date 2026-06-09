/** Public absolute origin for QR codes and share links. */
export function resolveAppBaseUrl(req?: Request): string {
  const fromEnv = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (req) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function residentPublicProfileUrl(
  publicToken: string,
  req?: Request,
): string {
  return `${resolveAppBaseUrl(req)}/r/${publicToken}`;
}
