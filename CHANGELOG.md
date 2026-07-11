# Changelog

All notable changes to Boardspace are documented here. Dates are US Central (America/Chicago).

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
- **Apple-grade design system** — Inter type ramp, Liquid Glass toolbar, hairline borders, spring motion, gold accent, full accessibility (`prefers-reduced-motion`, `prefers-reduced-transparency`, 44px touch targets).
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