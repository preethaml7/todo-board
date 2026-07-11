# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ #
#  Personal Boardspace — production image
#  Multi-stage, non-root, Next.js standalone output. Pinned to Node 22
#  LTS on Debian slim for reliable native-module (better-sqlite3, argon2)
#  compilation and a matching runtime ABI.
# ------------------------------------------------------------------ #

# 1) Install dependencies (with build toolchain for native modules) --------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# 2) Build the app ---------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/app/data/board.db

# Run as the built-in non-root `node` user. Create the data dir it owns.
RUN mkdir -p /app/data && chown -R node:node /app

# Standalone server + assets (traced node_modules incl. native .node files).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Self-contained backend recovery CLIs (run via `docker compose exec`).
COPY --from=builder --chown=node:node /app/scripts/recovery ./scripts/recovery

USER node
EXPOSE 3000
VOLUME ["/app/data"]

# Liveness probe (no extra packages needed — uses Node's http client).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
