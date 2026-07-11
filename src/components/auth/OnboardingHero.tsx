/**
 * OnboardingHero — the welcome/landing page.
 *
 * A two-column hero:
 *   LEFT  : brand statement, value props, SVG wordmark, trust footer
 *   RIGHT : the actual form (passed as children)
 *
 * The left column hides on mobile (stacks above the form). The right column
 * is the form panel.
 */
import * as React from "react";
import styles from "./OnboardingHero.module.css";

type Props = {
  children?: React.ReactNode;
  variant?: "register" | "login";
};

const FEATURES = [
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
    title: "Zero config, runs anywhere",
    body: "Pull the image, run docker compose up, and you're done. No env vars. No database setup. No API keys to leak.",
    Icon: BoltIcon,
  },
] as const;

export function OnboardingHero({ children, variant = "register" }: Props) {
  return (
    <div className={styles.shell}>
      <section className={styles.left} aria-label="Boardspace overview">
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden>
            <svg width="44" height="44" viewBox="0 0 64 64" fill="none">
              <defs>
                <linearGradient id="heroGold" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#007AFF" />
                  <stop offset="0.5" stopColor="#4DA3FF" />
                  <stop offset="1" stopColor="#006FE6" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="14" fill="currentColor" opacity="0.10" stroke="currentColor" strokeOpacity="0.25" />
              <rect x="13" y="18" width="9" height="28" rx="3" fill="currentColor" opacity="0.20" />
              <rect x="27.5" y="14" width="9" height="32" rx="3" fill="url(#heroGold)" />
              <rect x="42" y="22" width="9" height="24" rx="3" fill="currentColor" opacity="0.20" />
              <rect x="29" y="18" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.55" />
              <rect x="29" y="24" width="6" height="3" rx="1" fill="#FFFFFF" opacity="0.30" />
            </svg>
          </div>
          <div className={styles.brandName}>
            <span className={styles.brandPrefix}>Board</span>
            <span className={styles.brandSuffix}>space</span>
          </div>
        </div>

        <div className={styles.eyebrow}>
          <span className={styles.dot} />
          <span>{variant === "login" ? "Welcome back" : "Welcome to boardspace"}</span>
        </div>

        <h1 className={styles.headline}>
          {variant === "login" ? (
            <>Your board, <em>right where you left it.</em></>
          ) : (
            <>A kanban board that <em>respects your time</em> and your data.</>
          )}
        </h1>

        <p className={styles.lede}>
          {variant === "login"
            ? "Sign in to continue. Your tasks, categories, and life areas are exactly where you left them."
            : "Five columns, drag-and-drop, file attachments. Set it up once; close the door behind you."}
        </p>

        <ul className={styles.features}>
          {FEATURES.map(({ title, body, Icon }) => (
            <li key={title} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden>
                <Icon />
              </span>
              <div className={styles.featureText}>
                <div className={styles.featureTitle}>{title}</div>
                <div className={styles.featureBody}>{body}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.trustline}>
          <span className={styles.trustBadge}>
            <LockIcon />
            Trust
          </span>
          <span className={styles.trustDivider} aria-hidden />
          <span className={styles.trustText}>
            Argon2id · local-only · zero outbound network
          </span>
        </div>
      </section>

      <aside className={styles.right} data-testid="form-panel" aria-label="Onboarding form">
        {children ?? (
          <div className={styles.fallback}>
            <div className={styles.fallbackHint}>
              <ShieldIcon />
              <p>Your onboarding form goes here.</p>
            </div>
            <small className={styles.fallbackNote}>
              Use a 10+ character password. Strength meter updates as you type.
            </small>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ============== icons ============== */

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
