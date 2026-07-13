# Security Model & Threat Model

This document describes the security posture of the Personal Boardspace — a
**single-user**, self-hosted app. You can run it directly on a LAN address
(e.g. `http://192.168.1.124:3000`), on loopback, or behind a reverse proxy
(nginx, Caddy, Traefik, Tailscale, VPN) of your choice. Security was a
primary design goal.

## Assets & trust boundaries

- **Assets:** the single user's credentials, session tokens, and task data (in
  SQLite).
- **Trusted:** the host running Docker, the Docker volume (`board-data`), the
  `SESSION_SECRET`, and any reverse proxy in front.
- **Untrusted:** the public internet (if exposed), request bodies, headers,
  cookies, and any uploaded import files.

## Controls in place

### Authentication & accounts
- **argon2id** password hashing (memory-hard; 19 MiB / t=2 / p=1, per-hash salt).
- **Single-user lock:** onboarding creates exactly one account; account creation
  hard-refuses once a user exists (`src/lib/user.ts`). There is **no public
  registration** and **no in-app password reset**.
- Password minimum length enforced; live strength meter at onboarding.

### Sessions
- 256-bit opaque random tokens; the DB stores **only a SHA-256 hash** peppered
  with `SESSION_SECRET` — a DB leak does not reveal usable tokens.
- Cookie: `httpOnly`, `SameSite=Lax`, `Secure`, and **`__Host-` prefixed** in
  production (no domain, path `/`, HTTPS-only).
- **Sliding** 30-day expiry with a hard **90-day absolute cap**; expired rows are
  purged on access. `reset-password` invalidates **all** sessions.

### Abuse resistance
- **Per-account lockout** with escalating backoff (1 min → 1 h) after 5 failures.
- **Per-IP throttle** on auth endpoints (30 / 5 min) using the real client IP
  from `X-Forwarded-For`, `X-Real-IP`, or the connection's remote address as
  a final fallback.
- **Constant-time** password/token comparison; **timing-equalized** login so a
  wrong username and wrong password cost the same (anti-enumeration); generic
  error messages.

### Web hardening
- **Nonce-based CSP** in production with `strict-dynamic` — no `unsafe-inline`
  scripts, no `unsafe-eval`. Framing denied (`frame-ancestors 'none'` +
  `X-Frame-Options: DENY`).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `Permissions-Policy` (camera/mic/geo/usb/payment off), and **HSTS** (preload).
- **CSRF:** state changes go through same-origin Next.js Server Actions; the
  `SameSite` cookie plus a configurable `ALLOWED_ORIGINS` allowlist block
  cross-origin invocation. Server Action body size is capped (4 MB).
- All input is validated with **zod**; all SQL is **parameterized** (no string
  interpolation).

### Deployment / infrastructure
- **Optional trusted-proxy gate:** with `TRUSTED_PROXY_SECRET` set, any request
  lacking the matching `X-Proxy-Secret` header is rejected (health check
  exempt) — so hitting the origin directly, bypassing a configured reverse
  proxy, fails.
- Container runs as a **non-root** user, **read-only root filesystem**, **all
  capabilities dropped**, `no-new-privileges`, published to **all interfaces**
  by default (set `HOSTNAME=127.0.0.1` to restrict to loopback).
- **Fail-fast startup validation** refuses to boot in production without a
  sufficiently long `SESSION_SECRET`.
- Structured, **secret-free security logging** to stdout (login success/failure,
  lockouts, throttling, account creation) for auditing via `docker logs`.

## Threats & mitigations

| Threat | Mitigation |
| --- | --- |
| Credential stuffing / brute force | argon2id + per-account lockout + per-IP throttle; add a reverse proxy with rate-limiting if you expose to the internet |
| Session theft via DB leak | Only peppered token *hashes* stored; `Secure`/`httpOnly`/`__Host-` cookies |
| XSS | Strict nonce CSP; React auto-escaping; no `dangerouslySetInnerHTML` on user data |
| CSRF | SameSite cookies + same-origin Server Actions + `ALLOWED_ORIGINS` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| SQL injection | Parameterized statements only |
| Direct-origin access (bypassing reverse proxy) | `TRUSTED_PROXY_SECRET` gate; bind to loopback if no proxy is in front |
| User enumeration | Single account; timing-equalized, generic auth errors |
| Container escape / privilege escalation | Non-root, read-only FS, dropped caps, `no-new-privileges` |
| Secret compromise | Secret only in env/`.env` (git- & docker-ignored), never baked into the image |

## Residual risks & recommendations

- **Data at rest is not encrypted.** The SQLite volume is plaintext; rely on
  host disk encryption (e.g. FileVault/LUKS) if that matters to you.
- **If you expose this to the public internet,** put a reverse proxy in front
  with rate-limiting, IP allow-listing, and TLS termination. The app supports
  `TRUSTED_PROXY_SECRET` as defense-in-depth so the origin refuses requests
  that don't pass through the proxy.
- **The session secret is auto-generated and persisted** in the data volume
  (`<data>/.session_secret`, 0600) unless you set `SESSION_SECRET` explicitly.
  Backing up the volume backs it up too; deleting it (or the volume) invalidates
  all sessions. It shares the volume's trust boundary with the database.
- **Keep dependencies patched** (`npm audit`, rebuild the image). One known
  advisory affects Next.js's *build-time* bundled `postcss` and is not reachable
  by untrusted input at runtime.
- **In-memory throttle** resets on restart and is per-instance — fine for a
  single-container single-user app; a reverse proxy handles volumetric abuse.

## Reporting

This is a personal project. If you find an issue, open a private note to the
maintainer rather than a public issue.
