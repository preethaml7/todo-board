import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/session-constants";

/**
 * Responsibilities:
 *  1. Optional trusted-proxy gate — when TRUSTED_PROXY_SECRET is set, only
 *     requests carrying the matching header are served (defence-in-depth so a
 *     direct hit on the origin, bypassing a configured reverse proxy, is rejected).
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

function buildCsp(req: NextRequest | null, nonce: string): string {
  // Scripts: nonce + strict-dynamic in production removes 'unsafe-inline'.
  // Dev needs 'unsafe-eval'/'unsafe-inline' for HMR / React Refresh.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  // upgrade-insecure-requests only makes sense over HTTPS — sending it on
  // plain HTTP causes browsers to upgrade asset URLs to https://, which
  // breaks LAN deployments without TLS. Skip it for plain HTTP requests.
  const upgradeInsecure =
    req !== null && isTlsSecuredFn(req) ? "upgrade-insecure-requests" : "";

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
    upgradeInsecure,
  ]
    .filter(Boolean)
    .join("; ");
}

// TLS detection — duplicated as a non-method helper so buildCsp can use it
// without taking a full NextRequest object (useful in tests).
function isTlsSecuredFn(req: NextRequest): boolean {
  if (req.nextUrl.protocol === "https:") return true;
  const xfp = req.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0]!.trim().toLowerCase() === "https";
  return false;
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
  // HSTS is only meaningful over HTTPS. The header is set in `setStrictTransport`
  // when the request is detected as TLS-secured (either directly, or via a
  // trusted proxy that set x-forwarded-proto=https).
  return res;
}

/**
 * Set HSTS only when the request is actually TLS-secured. Sending HSTS over
 * HTTP causes browsers to remember the host as HTTPS-only and block future
 * HTTP access — which breaks local/LAN HTTP deployments. Only opt in via
 * `STRICT_TRANSPORT_SECURITY=on` if you also want the header when the
 * request is plain HTTP (rare; mainly for testing).
 */
function setStrictTransport(
  res: NextResponse,
  req: NextRequest
): NextResponse {
  const forceOn =
    process.env.STRICT_TRANSPORT_SECURITY === "on" ||
    process.env.STRICT_TRANSPORT_SECURITY === "1";
  if (!forceOn && !isTlsSecuredFn(req)) return res;
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = makeNonce();
  const csp = buildCsp(req, nonce);

  // 1. Trusted-proxy gate (health check is always exempt so container/uptime
  //    probes work without the secret).
  const proxySecret = process.env.TRUSTED_PROXY_SECRET;
  if (proxySecret && pathname !== HEALTH_PATH) {
    const provided = req.headers.get("x-proxy-secret") ?? "";
    if (!constantTimeEqual(provided, proxySecret)) {
      return setStrictTransport(
        setSecurityHeaders(new NextResponse("Forbidden", { status: 403 }), csp),
        req
      );
    }
  }

  // Health endpoint: no auth, minimal.
  if (pathname === HEALTH_PATH) {
    return setStrictTransport(setSecurityHeaders(NextResponse.next(), csp), req);
  }

  // 2. Auth gate.
  const hasSession = Boolean(req.cookies.get(sessionCookieName())?.value);
  if (!isPublic(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return setStrictTransport(
      setSecurityHeaders(NextResponse.redirect(url), csp),
      req
    );
  }

  // 3. Forward nonce + CSP on the request headers so Next tags its own inline
  //    bootstrap scripts with the nonce, and the layout can tag its script too.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  return setStrictTransport(setSecurityHeaders(res, csp), req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
