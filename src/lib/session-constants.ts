// Edge-safe cookie helpers (no Node imports) — safe to import from middleware.
//
// In production the session cookie uses the `__Host-` prefix, which browsers
// only accept when the cookie is Secure, Path=/, and has no Domain — a strong
// anti-fixation / anti-subdomain-injection measure. Over plain HTTP (local
// dev, or an explicit local prod test) we fall back to a normal name because
// browsers reject Secure/`__Host-` cookies on non-HTTPS origins.

export function cookieSecure(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  // Escape hatch for testing a production build locally over http://localhost.
  // NEVER set this when actually exposing the app.
  if (process.env.ALLOW_INSECURE_COOKIES === "true") return false;
  return true;
}

export function sessionCookieName(): string {
  return cookieSecure() ? "__Host-ptb_session" : "ptb_session";
}
