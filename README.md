# Boardspace

A single-user, password-locked task board — Jira-inspired but lighter — for managing everything across **personal** and **work** life. Five-column Kanban workflow with deadlines, categories, subtasks, markdown notes, file attachments, and a polished Apple-style dark theme. Stored in **SQLite**, deployed via **Docker**, security-first.

**Zero configuration.** Clone, build, run. No env vars, no database setup, no API keys.

## Features

- **Five-column workflow** — `Backlog → To Do → In Progress → On Hold → Done`. Drag-and-drop between columns. WIP nudge on In Progress past 3 items. Confetti on task completion.
- **Jira-style task cards** — priority icon, serial key (TASK-1, TASK-2…), due dates with overdue/due-soon highlighting, category chips, subtask progress, life area badge.
- **Rich task editor** — title, priority, status, due date, revisit date (On Hold), customizable categories (colored chips), subtasks, **markdown notes** with live preview, **file attachments** (10 MB each, raster inline preview), and per-task activity log.
- **Three views** — Board (drag & drop), List (sortable table), Overview (Overdue / Today / This week / Later buckets).
- **Natural-language quick-add** — type `Deploy API friday !high #Review @Work` and it parses the date, priority, category, and life area into chips automatically.
- **Customizable life areas** — start with Personal & Work, add your own.
- **Customizable categories** — add, rename, recolor chips (9 color palette).
- **Command palette & shortcuts** — `⌘K` search, `N` new task, `1–5` jump columns, `?` help overlay.
- **Reminders bell** — overdue and due-today tasks with optional desktop notifications.
- **Trash & restore** — soft-delete with undo toast and a trash bin to restore or permanently purge.
- **Import / Export** — JSON import/export for full board backup; CSV export for spreadsheets.
- **Mobile responsive** — full-width stacked columns, icon-only header, touch-friendly card menus.
- **Light + Dark themes** — toggle or auto-detect from OS. Dark theme uses Apple's HIG color system (pure black base, luminance elevation, system accent colors).

## Quick start — Docker (recommended)

Requires **Docker** and **Docker Compose**.

```bash
git clone <repo-url> boardspace
cd boardspace
docker compose up -d --build
```

Open **http://localhost:3000**. Complete onboarding (create your single account). Done.

```bash
# Verify it's healthy
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok"}
```

That's the entire setup. No `.env` file needed, no database to provision, no secrets to generate. The app auto-generates a strong session secret on first boot and persists it in the Docker volume.

### What happens on first run

1. Docker builds the image (~2 min, multi-stage, Node 22 on Debian slim).
2. Container starts, auto-generates `SESSION_SECRET`, writes it to the data volume.
3. You open the app and create your account on the onboarding screen.
4. Registration permanently closes — nobody else can create an account.

### Updating

```bash
git pull
docker compose up -d --build
```

Your data persists in the `todo-data` Docker volume across rebuilds.

## Quick start — local dev

Requires **Node.js 20+**.

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

## Security model

Security was a primary design goal. This is a **single-user app** — once you create your account, registration is permanently closed.

| Concern | Approach |
| --- | --- |
| Password storage | **argon2id** (memory-hard), per-hash random salt, OWASP-tuned parameters |
| Sessions | 256-bit opaque tokens; only a **SHA-256 hash** (peppered) stored in DB. Cookie: `httpOnly`, `SameSite=Lax`, `Secure`, `__Host-` prefix. Sliding 30-day expiry, 90-day hard cap |
| Single-user lock | Onboarding creates the one account. Creation hard-refuses once a user exists — no public registration |
| Brute force | Per-account lockout (1 min → 1 hour) + per-IP throttle; constant-time verification; generic error messages |
| XSS | **Nonce-based CSP** with `strict-dynamic` — no `unsafe-inline`. Plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy`, HSTS |
| CSRF | Same-origin Server Actions + `SameSite` cookies + configurable origin allowlist |
| Input | All input validated with **zod**; parameterized queries only; body-size capped (12 MB) |
| Attachments | Force-download except raster images; filename sanitization; path traversal guard; 10 MB/file, 10 files/task |
| Secrets | Auto-generated on first boot, persisted in data volume (chmod 600). Never committed or baked into image |
| Container | Non-root user, read-only rootfs, all capabilities dropped, `no-new-privileges`, health check, log rotation |

There is **no in-app "forgot password"** — recovery is backend-only (see below). Full threat model in [SECURITY.md](SECURITY.md).

## Backend recovery

Run from the host machine (or inside the container). These talk to SQLite directly — nothing is exposed through the web UI.

**Local dev:**

```bash
npm run reset-password    # Prompts for new password, signs out all sessions
npm run whoami            # Shows username, creation date, session count
```

**Inside Docker:**

```bash
docker compose exec -it boardspace node scripts/recovery/reset-password.mjs
docker compose exec    boardspace node scripts/recovery/whoami.mjs
```

## Management script

An interactive helper for Docker **and** local dev operations. Run `./manage.sh` for the interactive menu, or pass a command directly:

```bash
./manage.sh                  # interactive menu
./manage.sh help             # list all commands

# Docker
./manage.sh build            # build image & start container
./manage.sh rebuild          # full rebuild (no cache)
./manage.sh stop             # stop container
./manage.sh restart          # restart container
./manage.sh docker-status    # container + volume info
./manage.sh logs             # tail container logs
./manage.sh health           # curl health endpoint
./manage.sh docker-backup    # snapshot Docker volume to .tgz
./manage.sh docker-reset-pw  # change password inside container
./manage.sh docker-whoami    # show account info from container
./manage.sh docker-purge     # destroy container + image + volume
./manage.sh clean-cache      # prune Docker build cache
./manage.sh clean-images     # remove dangling images

# Registry
./manage.sh push             # build image & push to registry

# Local dev
./manage.sh dev              # npm run dev
./manage.sh test             # run tests
./manage.sh lint             # run linter
./manage.sh prod-build       # next build
./manage.sh reset-password   # change password (local database)
./manage.sh whoami           # show account info (local database)
./manage.sh local-backup     # snapshot ./data to .tgz
./manage.sh local-status     # database + port info
./manage.sh sign-out-all     # clear all sessions (force re-login)
./manage.sh local-purge      # delete all local data (re-register)
```

## Where your data lives

| What | Location |
| --- | --- |
| Database | `./data/board.db` (SQLite, WAL mode) — gitignored |
| Attachments | `./data/attachments/` — gitignored |
| Session secret | Auto-generated in data volume — gitignored |

Under Docker, everything lives in the `todo-data` volume. Back up with:

```bash
# Snapshot the volume
docker run --rm -v boardspace_board-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/todo-backup-$(date +%F).tgz -C /data .
```

Or use **Export** in the app header for a portable JSON snapshot (restorable via **Import** on any install).

## Environment variables (all optional)

You only need a `.env` if you want to override a default:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | auto-generated | Pin a fixed secret (≥ 32 chars). Useful for multi-host setups |
| `ALLOWED_ORIGINS` | same-origin | Comma-separated origins if behind a host-rewriting proxy, e.g. `https://todo.example.com` |
| `TRUSTED_PROXY_SECRET` | off | Defence in depth: every request must carry `X-Proxy-Secret: <value>` or get 403'd. Have Cloudflare inject it |
| `ALLOW_INSECURE_COOKIES` | off | **Never in prod.** Local-only escape hatch to test production builds over `http://localhost` |

## Exposing with Cloudflare Tunnel

The container binds to `127.0.0.1:3000` only — never exposed on your LAN/WAN directly. Use a **Cloudflare Tunnel** to reach it:

1. Run `cloudflared` on the same host, pointing `todo.example.com` → `http://127.0.0.1:3000`.
2. Set `ALLOWED_ORIGINS=https://todo.example.com` in `.env`.
3. **Recommended hardening:**
   - Put **Cloudflare Access** (Zero Trust) in front — a second auth layer before the app's own login.
   - Set `TRUSTED_PROXY_SECRET` and add a Cloudflare Transform Rule to inject the matching header.
   - Keep your IP-allowlist / WAF rules.

## Tests

```bash
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run lint          # ESLint (next/core-web-vitals + next/typescript)
```

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — standalone output
- **better-sqlite3** — synchronous, single-file DB
- **argon2** — password hashing
- **Tailwind CSS v4** — CSS-variable design system
- **@dnd-kit** — drag & drop
- **lucide-react** — icons
- **zod** — validation
- **vitest** — unit tests

## License

MIT
