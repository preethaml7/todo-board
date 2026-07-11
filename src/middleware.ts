import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/session-constants";

/**
 * Responsibilities:
 *  1. Optional trusted-proxy gate — when TRUSTED_PROXY_SECRET is set, only
 *     requests carrying the matching header are served (defence-in-depth so a
 *     direct hit on the origin, bypassing Cloudflare, is rejected).
 *  2. A per-request CSP nonce (production) so no 'unsafe-inline' scripts are
 *     needed — a strong XSS mitigation.
 *  3. Security headers on every response.
 *  4. A coarse auth gate: unauthenticated requests to protected routes are
 *     bounced to /login. Definitive validation happens server-side in the page
 *     (middleware runs on the edge without DB access, so it only checks that a
 *     session cookie is present).
 */

const PUBLIC_PATHS = ["/", "/login", "/onboarding"];
const HEALTH_PATH = "/api/health";
const isProd = process.env.NODE_ENV === "production";

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buildCsp(nonce: string): string {
  // Scripts: nonce + strict-dynamic in production removes 'unsafe-inline'.
  // Dev needs 'unsafe-eval'/'unsafe-inline' for HMR / React Refresh.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    scriptSrc,
    // Inline style *attributes* are used throughout; low XSS value.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function setSecurityHeaders(res: NextResponse, csp: string): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()",
  );
  if (isProd) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = makeNonce();
  const csp = buildCsp(nonce);

  // 1. Trusted-proxy gate (health check is always exempt so container/uptime
  //    probes work without the secret).
  const proxySecret = process.env.TRUSTED_PROXY_SECRET;
  if (proxySecret && pathname !== HEALTH_PATH) {
    const provided = req.headers.get("x-proxy-secret") ?? "";
    if (!constantTimeEqual(provided, proxySecret)) {
      return setSecurityHeaders(new NextResponse("Forbidden", { status: 403 }), csp);
    }
  }

  // Health endpoint: no auth, minimal.
  if (pathname === HEALTH_PATH) {
    return setSecurityHeaders(NextResponse.next(), csp);
  }

  // 2. Auth gate.
  const hasSession = Boolean(req.cookies.get(sessionCookieName())?.value);
  if (!isPublic(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return setSecurityHeaders(NextResponse.redirect(url), csp);
  }

  // 3. Forward nonce + CSP on the request headers so Next tags its own inline
  //    bootstrap scripts with the nonce, and the layout can tag its script too.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return setSecurityHeaders(res, csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
