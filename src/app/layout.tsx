import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import "./tokens.css";

// Boardspace type system: Geist (Vercel's SF-Pro successor, MIT-licensed,
// designed as a non-Apple-platform drop-in for the SF Pro aesthetic).
// Self-hosted as woff2 via next/font/local — zero runtime network.
// Variable font: a single file spans the entire weight axis 100-900.
const geist = localFont({
  src: "../fonts/Geist-Sans.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
});

const geistMono = localFont({
  // Geist Sans used for mono as well — clean tabular numerals, renders well in code.
  // Geist Mono (when available) can be swapped back via src: "../fonts/Geist-Mono.woff2".
  src: "../fonts/Geist-Sans.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Boardspace — A kanban board that respects your time and your data",
  description:
    "Boardspace is a single-user, password-locked kanban board with five-column workflow, calendar-aware tasks, markdown notes, and local-only SQLite storage. No cloud. No telemetry. One Docker command to install.",
  applicationName: "Boardspace",
  authors: [{ name: "Boardspace" }],
  keywords: [
    "kanban",
    "self-hosted",
    "single-user",
    "local-first",
    "sqlite",
    "privacy",
    "docker",
  ],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF9",
  width: "device-width",
  initialScale: 1,
};

// Set the theme class before paint to avoid a flash of the wrong theme.
//
// Order of precedence (highest to lowest):
//   1. localStorage.theme  (user explicitly toggled)
//   2. URL param ?theme=  (preview / shareable)
//   3. <meta name="theme" content="..."> injected by the server (per-request default)
//   4. prefers-color-scheme  (OS default)
//   5. 'dark' fallback (Boardspace's recommended default)
const themeInitScript = `
(function () {
  try {
    var t = null;
    // URL param takes precedence (one-off share/preview)
    try {
      var u = new URL(window.location.href);
      var q = u.searchParams.get('theme');
      if (q === 'dark' || q === 'light') t = q;
    } catch (e) {}
    // Server-injected default (from <meta name="theme" content="...">)
    if (!t) {
      var m = document.querySelector('meta[name="theme"]');
      if (m) {
        var c = m.getAttribute('content');
        if (c === 'dark' || c === 'light') t = c;
      }
    }
    // User override (highest priority after URL param)
    try {
      var saved = localStorage.getItem('theme');
      if (!t && (saved === 'dark' || saved === 'light')) t = saved;
    } catch (e) {}
    // OS preference
    if (!t) {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // Default to dark for the enterprise feel (can be flipped via ?theme=light)
    if (!t) t = 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <meta name="theme" content="dark" />
        <meta name="theme-color" content="#1C1C1E" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/svg+xml" href="/boardspace-logo.svg" />
        <script
          suppressHydrationWarning
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
