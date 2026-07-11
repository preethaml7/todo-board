/**
 * Runs once when the server process starts (not during build). Kept free of
 * Node-only imports so it bundles cleanly for every runtime — the session
 * secret itself is provisioned lazily in src/lib/secret.ts (Node only) with
 * zero configuration required.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  // Fail fast only on a clear misconfiguration: an explicit but too-short
  // secret. If unset, one is auto-generated & persisted on first use.
  const env = process.env.SESSION_SECRET;
  if (env && env.length > 0 && env.length < 32) {
    console.error(
      "[startup] SESSION_SECRET is set but too short (<32 chars). Unset it to auto-generate, or use `openssl rand -base64 48`.",
    );
    throw new Error("Refusing to start: invalid SESSION_SECRET.");
  }

  if (process.env.ALLOW_INSECURE_COOKIES === "true") {
    console.warn(
      JSON.stringify({
        scope: "security",
        level: "warn",
        event: "insecure_cookies_enabled",
        msg: "ALLOW_INSECURE_COOKIES=true — cookies are NOT Secure. Local testing only; never expose the app like this.",
      }),
    );
  }

  console.log(
    JSON.stringify({
      scope: "startup",
      level: "info",
      event: "ready",
      secretConfigured: Boolean(env),
      trustedProxyGate: Boolean(process.env.TRUSTED_PROXY_SECRET),
    }),
  );
}
