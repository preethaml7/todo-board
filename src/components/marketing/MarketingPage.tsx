/**
 * MarketingPage — the public landing page at `/`.
 *
 * Server component (no client interactivity beyond the theme toggle in the
 * shared site header). Renders:
 *   1. A slim top bar with the brand wordmark, theme toggle, and a "Sign in"
 *      link (only when no user is logged in AND the account slot is taken —
 *      i.e. the "Welcome back" state).
 *   2. A hero split: left = value proposition + primary CTA, right = the
 *      landing-hero.svg illustration with a glow halo.
 *   3. A 3-up FeatureCard grid mirroring the OnboardingHero style.
 *   4. A second CTA band — the "Get started" / "Sign in to your board"
 *      call-to-action, repeated with more breathing room.
 *   5. A compact footer with brand mark + trust line.
 *
 * The component is theme-aware purely via the project's CSS variables
 * (`--text`, `--surface`, `--accent`, etc.) defined in globals.css — no
 * inline styles, no external assets, no network calls.
 */
import * as React from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "./MarketingPage.module.css";

export type MarketingVariant = "fresh" | "returning";

type Props = {
  variant: MarketingVariant;
};

type Feature = {
  title: string;
  body: string;
  Icon: React.ComponentType;
};

const FEATURES: readonly Feature[] = [
  {
    title: "Single-user, password-locked",
    body: "Argon2id-hashed credentials, lockout protection, and a session secret that's never persisted in plaintext.",
    Icon: LockIcon,
  },
  {
    title: "Local SQLite, zero telemetry",
    body: "Every byte stays on this device. No cloud sync. No analytics. Just a single SQLite file you can back up in one command.",
    Icon: DatabaseIcon,
  },
  {
    title: "Five columns, drag and drop",
    body: "Backlog, To-do, In Progress, On Hold, and Done. Move cards with the keyboard or the mouse — your board stays in sync.",
    Icon: ColumnsIcon,
  },
  {
    title: "Calendar-aware due dates",
    body: "See the next two weeks in a single monthly view. Tasks roll forward automatically; nothing slips silently past a deadline.",
    Icon: CalendarIcon,
  },
  {
    title: "Markdown notes & attachments",
    body: "Write specs, brain-dumps, or checklists on each card. Drop in PDFs, screenshots, and reference files — all stored locally.",
    Icon: NoteIcon,
  },
  {
    title: "Zero config, runs anywhere",
    body: "Pull the image, run docker compose up, and you're done. No env vars, no database setup, no API keys to leak.",
    Icon: BoltIcon,
  },
];

export function MarketingPage({ variant }: Props) {
  const headline = (
    <>
      A kanban board that <em>respects your time</em> and your data.
    </>
  );

  const lede =
    "Five columns, drag-and-drop, calendar-aware tasks, and markdown notes — without a single byte leaving your machine. Set it up once; close the door behind you.";

  const primaryCta = variant === "fresh" ? "Get started" : "Sign in to your board";
  const primaryHref = variant === "fresh" ? "/onboarding" : "/login";

  return (
    <div className={styles.page}>
      {/* ============ Top bar ============ */}
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Boardspace — home">
          <span className={styles.brandMark} aria-hidden>
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient
                  id="mpGoldMark"
                  x1="0"
                  y1="0"
                  x2="64"
                  y2="64"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="#007AFF" />
                  <stop offset="0.5" stopColor="#4DA3FF" />
                  <stop offset="1" stopColor="#006FE6" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="14" fill="currentColor" opacity="0.10" stroke="currentColor" strokeOpacity="0.25" />
              <rect x="13" y="18" width="9" height="28" rx="3" fill="currentColor" opacity="0.20" />
              <rect x="27.5" y="14" width="9" height="32" rx="3" fill="url(#mpGoldMark)" />
              <rect x="42" y="22" width="9" height="24" rx="3" fill="currentColor" opacity="0.20" />
              <rect x="29" y="18" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.55" />
              <rect x="29" y="24" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.30" />
            </svg>
          </span>
          <span className={styles.brandWord}>
            <span className={styles.brandPrefix}>Board</span>
            <span className={styles.brandSuffix}>space</span>
          </span>
        </Link>

        <nav className={styles.topnav} aria-label="Primary">
          <a href="#features" className={styles.navLink}>
            Features
          </a>
          <a href="#trust" className={styles.navLink}>
            Trust
          </a>
          {variant === "returning" ? (
            <Link href="/login" className={styles.navCta}>
              Sign in
            </Link>
          ) : (
            <Link href="/login" className={styles.navLink}>
              Sign in
            </Link>
          )}
          <ThemeToggle className={styles.themeToggle} />
        </nav>
      </header>

      {/* ============ Hero ============ */}
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-headline">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.dot} aria-hidden />
              <span>Self-hosted kanban · single user</span>
            </span>

            <h1 id="hero-headline" className={styles.headline}>
              {headline}
            </h1>

            <p className={styles.lede}>{lede}</p>

            <div className={styles.heroCtas}>
              <Link href={primaryHref} className={styles.btnPrimary}>
                {primaryCta}
                <ArrowRightIcon />
              </Link>
              {variant === "fresh" && (
                <a href="#features" className={styles.btnText}>
                  See what&apos;s inside →
                </a>
              )}
            </div>

            <ul className={styles.heroBullets} aria-label="At a glance">
              <li>
                <CheckIcon />
                <span>One Docker command to install</span>
              </li>
              <li>
                <CheckIcon />
                <span>No accounts, no telemetry, no cloud</span>
              </li>
              <li>
                <CheckIcon />
                <span>Backup the whole thing in one file</span>
              </li>
            </ul>
          </div>

          <div className={styles.heroArt} aria-hidden>
            <div className={styles.heroArtGlow} />
            <div className={styles.heroArtFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing-hero.svg"
                alt=""
                width={480}
                height={360}
                className={styles.heroArtImg}
              />
            </div>
          </div>
        </section>

        {/* ============ Features grid ============ */}
        <section
          id="features"
          className={styles.features}
          aria-labelledby="features-heading"
        >
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>What&apos;s inside</span>
            <h2 id="features-heading" className={styles.sectionHeading}>
              Everything you need. <em>Nothing you don&apos;t.</em>
            </h2>
            <p className={styles.sectionLede}>
              A focused kanban with the workflows you&apos;d actually use on a
              Saturday morning — not a SaaS dashboard.
            </p>
          </header>

          <ul className={styles.featureGrid}>
            {FEATURES.map(({ title, body, Icon }) => (
              <li key={title} className={styles.featureCard}>
                <span className={styles.featureIcon} aria-hidden>
                  <Icon />
                </span>
                <div className={styles.featureText}>
                  <h3 className={styles.featureTitle}>{title}</h3>
                  <p className={styles.featureBody}>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ============ Bottom CTA band ============ */}
        <section className={styles.ctaBand} aria-labelledby="cta-heading">
          <div className={styles.ctaInner}>
            <div>
              <h2 id="cta-heading" className={styles.ctaHeading}>
                {variant === "fresh" ? (
                  <>
                    Ready to <em>own</em> your board?
                  </>
                ) : (
                  <>
                    Welcome back. <em>Your board is waiting.</em>
                  </>
                )}
              </h2>
              <p className={styles.ctaLede}>
                {variant === "fresh"
                  ? "Spin up your Boardspace in under a minute. One account, one password, one file to back up."
                  : "Sign in to pick up exactly where you left off — same columns, same cards, same shortcuts."}
              </p>
            </div>

            <div className={styles.ctaActions}>
              <Link href={primaryHref} className={styles.btnPrimary}>
                {primaryCta}
                <ArrowRightIcon />
              </Link>
              {variant === "fresh" && (
                <a href="#features" className={styles.btnText}>
                  Learn more
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ============ Footer ============ */}
      <footer id="trust" className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerBrand} aria-label="Boardspace">
            <span className={styles.footerMark} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
                <defs>
                  <linearGradient
                    id="mpFooterGold"
                    x1="0"
                    y1="0"
                    x2="64"
                    y2="64"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0" stopColor="#007AFF" />
                    <stop offset="0.5" stopColor="#4DA3FF" />
                    <stop offset="1" stopColor="#006FE6" />
                  </linearGradient>
                </defs>
                <rect x="4" y="4" width="56" height="56" rx="14" fill="currentColor" opacity="0.10" stroke="currentColor" strokeOpacity="0.25" />
                <rect x="13" y="18" width="9" height="28" rx="3" fill="currentColor" opacity="0.20" />
                <rect x="27.5" y="14" width="9" height="32" rx="3" fill="url(#mpFooterGold)" />
                <rect x="42" y="22" width="9" height="24" rx="3" fill="currentColor" opacity="0.20" />
                <rect x="29" y="18" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.55" />
                <rect x="29" y="24" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.30" />
              </svg>
            </span>
            <span className={styles.footerWord}>
              <span className={styles.brandPrefix}>Board</span>
              <span className={styles.brandSuffix}>space</span>
            </span>
          </Link>

          <div className={styles.trustline} aria-label="Security posture">
            <span className={styles.trustBadge}>
              <LockIcon />
              Trust
            </span>
            <span className={styles.trustDivider} aria-hidden />
            <span className={styles.trustText}>
              Argon2id · local-only · zero outbound network
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============== icons ============== */

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="16" y="4" width="5" height="16" rx="1.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 5 7 7-7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}