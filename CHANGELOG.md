# Changelog

All notable changes to Boardspace are documented here. Dates are US Central (America/Chicago).

## v1.1.1 — 2026-07-12

### Housekeeping

- **Lint gate honest again.** v1.1.0 shipped with 27 ESLint errors hidden behind a passing `next build`. v1.1.1 fixes all of them: production `any` types replaced with `unknown` + narrow, unescaped apostrophes replaced with `&rsquo;`, real a11y defect (`role="treeitem"` without `aria-selected`) corrected in FilesView, dead exports removed (`BoardExportV2`, `copyFile`, `unlink`), unused imports cleaned up across server actions. The `*.test.tsx` ignore pattern was added to the ESLint config (matching the existing `*.test.ts` ignore) — tests are intentionally lenient with `any`, production code is not.
- **`.gitignore` hygiene.** `tsconfig.tsbuildinfo` (a TypeScript incremental build cache auto-regenerated on every build) was previously tracked in git at 187KB. Now ignored; the existing tracked copy has been removed.
- **FilesView a11y.** `FilesView.tsx` had two `role="treeitem"` elements without `aria-selected`. Added. This was a real defect for screen-reader users — they could navigate the tree but not tell which item was selected.
- **Security note.** Added an explicit warning comment to `src/lib/security.ts` about the in-memory IP throttle: it's per-process, and would silently degrade to N×the attempts if anyone ever ran multiple replicas. The note points to the upgrade path (shared store) before adding a second replica.
- **Backup automation documented.** README now documents how to schedule `./manage.sh docker-backup` from a host-level cron entry, with a 30-day retention example. The container is `read_only: true` and runs no cron daemon by design — the operator surface is `manage.sh`, not the container.
- **Local-vs-Docker build note.** README explains that `.next/standalone/server.js` is only emitted by the Docker multi-stage build, not by local `npm run build` — saves the next contributor from a `MODULE_NOT_FOUND` surprise.

### Notes on v1.1.0 design polish

v1.1.1 also acknowledges that the v1.1.0 design polish migration left a few cosmetic class-name remnants in `FilesView.module.css` (the `gold` class identifier for what is in fact a systemBlue accent, plus the `.annotationLineTag` class in dark mode which uses `#FCD34D` for the marker text). These are deliberate stylistic choices — a yellow accent on annotation markers in dark mode — but they do mean the v1.1.0 claim "everything is systemBlue" is not strictly true. Future work may rename `.gold` → `.accent` and either migrate `.annotationLineTag` to systemBlue or document the deliberate exception.

## v1.1.0 — 2026-07-11

### Design polish

- **Typography:** switched to **Geist Sans** (Vercel's SF-Pro successor, MIT-licensed). Self-hosted as a variable woff2 (`src/fonts/Geist-Sans.woff2`) via `next/font/local` — zero runtime network. Geist is a metric-compatible drop-in for SF Pro with a tighter x-height and cleaner single-storey `a` — closer to Apple's actual type than Inter.
- **Brand color:** replaced gold accent with **Apple systemBlue** (`#007AFF` light / `#0A84FF` dark). systemBlue is the only saturated color in the system; everything else is grayscale + Apple's semantic colors (systemRed for danger, systemOrange for warn, systemGreen for success). The previous gold gradient on the wordmark, board title, FAB, primary buttons, pinned-task borders, and due-date badges is gone.
- **Logo & wordmark:** rebuilt as monochrome stroke-only outlines. The mark is three kanban columns + a checkmark in the "done" column, drawn with `currentColor` so it inherits black on light, white on dark. The wordmark is a single-weight Geist Sans lockup, no gradient, no decoration.
- **Toolbar:** Liquid Glass surface (translucent, hairline bottom border, `backdrop-filter: blur(20px) saturate(180%)`).
- **Buttons:** primary buttons use systemBlue solid fill with an inset highlight (the "lit edge") — no gradient. Hover lifts 1px, active scales to 0.985.
- **Cards:** 16px radius, hairline border, `sh-2` resting → `sh-3` hover, spring transition `cubic-bezier(0.28, 0.11, 0.32, 1)`.

### Accessibility

- All touch targets ≥ 44×44 (Apple HIG).
- `prefers-reduced-motion` and `prefers-reduced-transparency` honored across the system.

## v1.0.0 — 2026-07-11

Initial public release.

### Highlights

- **Single-user, password-locked kanban** with five-column workflow (`Backlog → To Do → In Progress → On Hold → Done`), drag-and-drop, and Jira-style task cards.
- **Three views** — Board (drag & drop), List (sortable table), Overview (Overdue / Today / This week / Later buckets).
- **Natural-language quick-add** — `Deploy API friday !high #Review @Work` parses date, priority, category, and life area into chips automatically.
- **Calendar picker** for due dates and revisit dates — fully themed, keyboard-navigable (arrow keys, Enter, Escape).
- **File manager** — drag-and-drop upload, tree view, markdown viewer with syntax highlighting, line-anchored annotations, search, and soft-delete trash.
- **Rich task editor** — title, priority, status, due date, revisit date, customizable categories (9 color palette), subtasks, markdown notes with live preview, file attachments, per-task activity log.
- **Customizable life areas** — start with Personal & Work, add your own.
- **Command palette & shortcuts** — `⌘K` search, `N` new task, `1–6` jump to view, `?` help overlay.
- **Reminders bell** with overdue / due-today notifications.
- **Trash & restore** with soft-delete and 30-day purge.
- **Import / Export** — JSON for full board backup, CSV for spreadsheets.
- **Light + dark themes** with system-preference detection and no-FOUC theme init.
- **Apple-grade design system** — Geist Sans typography, Liquid Glass toolbar, hairline borders, spring motion, systemBlue accent, full accessibility (`prefers-reduced-motion`, `prefers-reduced-transparency`, 44px touch targets).
- **Mobile responsive** — full-width stacked columns, touch-friendly card menus.

### Security

- argon2id password hashing (memory-hard; 19 MiB / t=2 / p=1, per-hash salt).
- Single-user lock — onboarding hard-refuses once a user exists.
- 256-bit opaque session tokens; DB stores only a SHA-256 hash peppered with `SESSION_SECRET`.
- Cookie: `httpOnly`, `SameSite=Lax`, `Secure`, `__Host-` prefixed in production.
- See [SECURITY.md](./SECURITY.md) for the full threat model.

### Storage

- Single SQLite file in the `data/` volume. Zero outbound network — all logic, fonts, and dependencies are bundled.

### Deployment

- **One Docker command.** `docker compose up -d --build`. No env vars, no database setup, no API keys. `SESSION_SECRET` is auto-generated and persisted on first boot.