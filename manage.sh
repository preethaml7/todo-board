#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------ #
#  Boardspace — management script
#  Usage:  ./manage.sh          (interactive menu)
#          ./manage.sh <cmd>    (run a command directly)
#          ./manage.sh help     (list all commands)
# ------------------------------------------------------------------ #

COMPOSE="docker compose"
SERVICE="boardspace"
IMAGE="boardspace:latest"
VOLUME="boardspace_board-data"
DATA_DIR="./data"
DB_FILE="$DATA_DIR/board.db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

header() {
  echo ""
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}${BOLD}  To-Do Board — Management${NC}"
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

check_docker() {
  if ! docker info &>/dev/null; then
    echo -e "${RED}Docker is not running.${NC} Start Docker Desktop first."
    return 1
  fi
}

check_node() {
  if ! command -v node &>/dev/null; then
    echo -e "${RED}Node.js not found.${NC} Install Node 20+ first."
    return 1
  fi
}

check_local_db() {
  if [ ! -f "$DB_FILE" ]; then
    echo -e "${YELLOW}No local database found.${NC} Run the app first to create one."
    return 1
  fi
}

# ------------------------------------------------------------------ #
#  Docker commands
# ------------------------------------------------------------------ #

docker_build() {
  check_docker
  echo -e "${GREEN}Building image and starting container...${NC}"
  $COMPOSE up -d --build
  echo ""
  echo -e "${GREEN}Done.${NC} Waiting for health check..."
  sleep 3
  local health
  health=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo "not ready yet")
  echo -e "  Health: ${health}"
  echo -e "  Open ${BOLD}http://localhost:3000${NC}"
}

docker_rebuild() {
  check_docker
  echo -e "${YELLOW}Rebuilding from scratch (no cache)...${NC}"
  $COMPOSE build --no-cache
  $COMPOSE up -d --force-recreate
  echo ""
  echo -e "${GREEN}Done.${NC} Container recreated with fresh image."
  sleep 3
  local health
  health=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo "not ready yet")
  echo -e "  Health: ${health}"
}

docker_stop() {
  check_docker
  echo -e "${YELLOW}Stopping container...${NC}"
  $COMPOSE down
  echo -e "${GREEN}Stopped.${NC}"
}

docker_restart() {
  check_docker
  echo -e "${YELLOW}Restarting container...${NC}"
  $COMPOSE restart
  echo -e "${GREEN}Restarted.${NC}"
}

docker_status() {
  check_docker
  echo -e "${CYAN}Container status:${NC}"
  $COMPOSE ps 2>/dev/null || echo -e "  ${DIM}No containers found${NC}"
  echo ""

  if docker volume inspect "$VOLUME" &>/dev/null; then
    local size
    size=$(docker system df -v 2>/dev/null | grep "$VOLUME" | awk '{print $3}' || echo "unknown")
    echo -e "${CYAN}Data volume:${NC} ${VOLUME} (${size})"
  else
    echo -e "${CYAN}Data volume:${NC} ${DIM}not created yet${NC}"
  fi
  echo ""

  if $COMPOSE ps --status running 2>/dev/null | grep -q "$SERVICE"; then
    echo -e "${CYAN}Health check:${NC}"
    local health
    health=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null || echo '{"status":"unreachable"}')
    echo "  $health"
  fi
}

docker_logs() {
  check_docker
  echo -e "${CYAN}Showing last 80 lines (Ctrl+C to exit):${NC}"
  $COMPOSE logs --tail 80 -f
}

docker_health() {
  local resp
  resp=$(curl -sf http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}Healthy:${NC} ${resp}"
  else
    echo -e "${RED}Unreachable.${NC} Is the container running?"
  fi
}

docker_backup() {
  check_docker
  if ! docker volume inspect "$VOLUME" &>/dev/null; then
    echo -e "${RED}No Docker data volume found.${NC} Nothing to back up."
    return
  fi
  local filename="boardspace-backup-docker-$(date +%Y-%m-%d-%H%M%S).tgz"
  echo -e "${CYAN}Backing up Docker data volume to ${BOLD}${filename}${NC}..."
  docker run --rm -v "${VOLUME}:/data" -v "$PWD:/backup" alpine \
    tar czf "/backup/${filename}" -C /data .
  echo -e "${GREEN}Backup saved:${NC} ${filename} ($(du -h "$filename" | cut -f1))"
}

docker_reset_password() {
  check_docker
  echo -e "${CYAN}Launching password reset inside container...${NC}"
  $COMPOSE exec -it "$SERVICE" node scripts/recovery/reset-password.mjs
}

docker_whoami() {
  check_docker
  echo -e "${CYAN}Account info (Docker):${NC}"
  $COMPOSE exec "$SERVICE" node scripts/recovery/whoami.mjs
}

docker_purge() {
  check_docker
  echo ""
  echo -e "${RED}${BOLD}WARNING: This will destroy EVERYTHING in Docker:${NC}"
  echo -e "  - Stop and remove the container"
  echo -e "  - Delete the Docker image"
  echo -e "  - ${RED}Delete the data volume (database, attachments, session secret)${NC}"
  echo -e "  - Prune build cache"
  echo ""
  read -rp "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${DIM}Aborted.${NC}"
    return
  fi
  echo ""
  echo -e "${RED}Stopping container...${NC}"
  $COMPOSE down -v 2>/dev/null || true
  echo -e "${RED}Removing image...${NC}"
  docker rmi "$IMAGE" 2>/dev/null || true
  echo -e "${RED}Pruning build cache...${NC}"
  docker builder prune -f 2>/dev/null || true
  echo ""
  echo -e "${GREEN}Purged.${NC} Run ${BOLD}./manage.sh build${NC} to start fresh."
}

docker_clean_cache() {
  check_docker
  echo -e "${YELLOW}Cleaning Docker build cache...${NC}"
  docker builder prune -f
  echo -e "${GREEN}Build cache cleared.${NC}"
}

docker_clean_images() {
  check_docker
  echo -e "${YELLOW}Removing dangling images...${NC}"
  docker image prune -f
  echo -e "${GREEN}Dangling images removed.${NC}"
}

# ------------------------------------------------------------------ #
#  Registry / Deploy commands
# ------------------------------------------------------------------ #

REGISTRY_FILE=".registry"
REGISTRY=""

resolve_registry() {
  # 1. Environment variable
  if [ -n "${REGISTRY_URL:-}" ]; then
    REGISTRY="$REGISTRY_URL"
    return
  fi
  # 2. Saved .registry file
  if [ -f "$REGISTRY_FILE" ]; then
    REGISTRY=$(head -1 "$REGISTRY_FILE" | tr -d '[:space:]')
    if [ -n "$REGISTRY" ]; then
      echo -e "${DIM}Using saved registry: ${REGISTRY}${NC}"
      return
    fi
  fi
  # 3. Interactive prompt
  read -rp "Registry URL (e.g. registry.example.com:5000): " REGISTRY
  if [ -z "$REGISTRY" ]; then
    echo -e "${RED}No registry URL provided.${NC}"
    return 1
  fi
  # Strip trailing slash
  REGISTRY="${REGISTRY%/}"
  # Save for future use
  echo "$REGISTRY" > "$REGISTRY_FILE"
  echo -e "${GREEN}Saved registry URL to ${REGISTRY_FILE}${NC}"
}

get_version() {
  local version
  version=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "latest")
  echo "$version"
}

registry_login() {
  echo -e "${CYAN}Logging in to registry ${BOLD}${REGISTRY}${NC}..."
  read -rp "Username: " reg_user
  read -rsp "Password: " reg_pass
  echo ""
  echo "$reg_pass" | docker login "$REGISTRY" -u "$reg_user" --password-stdin
  echo -e "${GREEN}Logged in.${NC}"
}

registry_build_push() {
  check_docker
  resolve_registry

  local version
  version=$(get_version)
  local full_image="${REGISTRY}/boardspace:${version}"
  local latest_image="${REGISTRY}/boardspace:latest"

  echo ""
  echo -e "${CYAN}Building image...${NC}"
  echo -e "  Version:  ${BOLD}${version}${NC}"
  echo -e "  Image:    ${BOLD}${full_image}${NC}"
  echo -e "  Latest:   ${BOLD}${latest_image}${NC}"
  echo ""

  docker build -t "$full_image" -t "$latest_image" .

  echo ""
  echo -e "${GREEN}Build complete.${NC}"
  echo ""

  registry_login

  echo ""
  echo -e "${CYAN}Pushing to ${BOLD}${REGISTRY}${NC}..."
  docker push "$full_image"
  docker push "$latest_image"

  echo ""
  echo -e "${GREEN}${BOLD}Done!${NC} Images pushed to registry."
  echo ""
  echo -e "  ${CYAN}Pull on target host:${NC}"
  echo -e "    docker pull ${full_image}"
  echo -e "    docker pull ${latest_image}"
}

# ------------------------------------------------------------------ #
#  Local dev commands
# ------------------------------------------------------------------ #

local_dev() {
  check_node
  echo -e "${CYAN}Starting local dev server...${NC}"
  npm run dev
}

local_test() {
  check_node
  echo -e "${CYAN}Running tests...${NC}"
  npm test
}

local_lint() {
  check_node
  echo -e "${CYAN}Running linter...${NC}"
  npm run lint
}

local_build() {
  check_node
  echo -e "${CYAN}Running production build...${NC}"
  npm run build
}

local_reset_password() {
  check_node
  check_local_db
  echo -e "${CYAN}Resetting password (local database)...${NC}"
  node scripts/recovery/reset-password.mjs
}

local_whoami() {
  check_node
  check_local_db
  echo -e "${CYAN}Account info (local database):${NC}"
  node scripts/recovery/whoami.mjs
}

local_backup() {
  check_local_db
  local filename="boardspace-backup-local-$(date +%Y-%m-%d-%H%M%S).tgz"
  echo -e "${CYAN}Backing up local data to ${BOLD}${filename}${NC}..."
  tar czf "$filename" -C "$DATA_DIR" .
  echo -e "${GREEN}Backup saved:${NC} ${filename} ($(du -h "$filename" | cut -f1))"
}

local_status() {
  echo -e "${CYAN}Local data directory:${NC} ${DATA_DIR}"
  if [ -d "$DATA_DIR" ]; then
    echo -e "  Database:    $([ -f "$DB_FILE" ] && echo -e "${GREEN}exists${NC} ($(du -h "$DB_FILE" | cut -f1))" || echo -e "${DIM}not created${NC}")"
    local attach_dir="$DATA_DIR/attachments"
    if [ -d "$attach_dir" ]; then
      local count
      count=$(find "$attach_dir" -type f 2>/dev/null | wc -l | tr -d ' ')
      echo -e "  Attachments: ${GREEN}${count} files${NC}"
    else
      echo -e "  Attachments: ${DIM}none${NC}"
    fi
    local has_secret=false
    if [ -f ".env.local" ] && grep -q "SESSION_SECRET" .env.local 2>/dev/null; then
      has_secret=true
    elif [ -f "$DATA_DIR/.session_secret" ]; then
      has_secret=true
    fi
    echo -e "  Secret:      $($has_secret && echo -e "${GREEN}exists${NC}" || echo -e "${DIM}not generated${NC}")"
  else
    echo -e "  ${DIM}No data directory. Run the app first.${NC}"
  fi
  echo ""

  if check_node 2>/dev/null; then
    echo -e "${CYAN}Node.js:${NC} $(node --version)"
  fi

  if lsof -iTCP:3000 -sTCP:LISTEN &>/dev/null 2>&1; then
    echo -e "${CYAN}Port 3000:${NC} ${GREEN}in use${NC} (dev server or container running)"
  else
    echo -e "${CYAN}Port 3000:${NC} ${DIM}available${NC}"
  fi
}

local_purge() {
  if [ ! -d "$DATA_DIR" ]; then
    echo -e "${YELLOW}No local data directory found.${NC} Nothing to purge."
    return
  fi
  echo ""
  echo -e "${RED}${BOLD}WARNING: This will destroy ALL local data:${NC}"
  echo -e "  - ${RED}Database (all tasks, account, settings)${NC}"
  echo -e "  - ${RED}Attachments${NC}"
  echo -e "  - ${RED}Session secret${NC}"
  echo ""
  echo -e "  You will need to re-register on next launch."
  echo ""
  read -rp "Type 'yes' to confirm: " confirm
  if [ "$confirm" != "yes" ]; then
    echo -e "${DIM}Aborted.${NC}"
    return
  fi
  echo ""
  rm -rf "${DATA_DIR:?}/"*
  rm -f "$DATA_DIR/.session_secret"
  echo -e "${GREEN}Local data purged.${NC} Re-register on next launch."
}

local_nuke_sessions() {
  check_node
  check_local_db
  echo -e "${CYAN}Signing out all sessions (local database)...${NC}"
  node -e "
    const Database = require('better-sqlite3');
    const db = new Database('$DB_FILE');
    const count = db.prepare('DELETE FROM sessions').run().changes;
    console.log('  Cleared ' + count + ' session(s). You will need to log in again.');
    db.close();
  "
  echo -e "${GREEN}Done.${NC}"
}

# ------------------------------------------------------------------ #
#  Help
# ------------------------------------------------------------------ #

show_help() {
  echo -e "${BOLD}Usage:${NC} ./manage.sh [command]"
  echo ""
  echo -e "${BOLD}Docker commands:${NC}"
  echo -e "  build              Build image & start container"
  echo -e "  rebuild            Full rebuild (no cache)"
  echo -e "  stop               Stop container"
  echo -e "  restart            Restart container"
  echo -e "  docker-status      Container + volume info"
  echo -e "  logs               Tail container logs"
  echo -e "  health             Curl /api/health"
  echo -e "  docker-backup      Snapshot Docker volume to .tgz"
  echo -e "  docker-reset-pw    Reset password inside container"
  echo -e "  docker-whoami      Show account info from container"
  echo -e "  docker-purge       Destroy container + image + volume"
  echo -e "  clean-cache        Prune Docker build cache"
  echo -e "  clean-images       Remove dangling Docker images"
  echo ""
  echo -e "${BOLD}Registry:${NC}"
  echo -e "  push               Build image & push to registry"
  echo ""
  echo -e "${BOLD}Local dev commands:${NC}"
  echo -e "  dev                Start local dev server (npm run dev)"
  echo -e "  test               Run test suite"
  echo -e "  lint               Run linter"
  echo -e "  prod-build         Run production build (next build)"
  echo -e "  reset-password     Reset password (local database)"
  echo -e "  whoami             Show account info (local database)"
  echo -e "  local-backup       Snapshot local data to .tgz"
  echo -e "  local-status       Show local data + port info"
  echo -e "  sign-out-all       Clear all sessions (local database)"
  echo -e "  local-purge        Delete all local data (re-register)"
  echo ""
  echo -e "Run without arguments for interactive menu."
}

# ------------------------------------------------------------------ #
#  Interactive menu
# ------------------------------------------------------------------ #

menu() {
  header

  echo -e "  ${BOLD}${BLUE}Docker${NC}"
  echo -e "    ${GREEN} 1)${NC}  Build & start            ${DIM}docker compose up -d --build${NC}"
  echo -e "    ${GREEN} 2)${NC}  Rebuild (no cache)        ${DIM}full clean rebuild${NC}"
  echo -e "    ${GREEN} 3)${NC}  Stop                      ${DIM}docker compose down${NC}"
  echo -e "    ${GREEN} 4)${NC}  Restart                   ${DIM}docker compose restart${NC}"
  echo -e "    ${GREEN} 5)${NC}  Status                    ${DIM}container + volume info${NC}"
  echo -e "    ${GREEN} 6)${NC}  Logs                      ${DIM}tail container logs${NC}"
  echo -e "    ${GREEN} 7)${NC}  Health check              ${DIM}curl /api/health${NC}"
  echo -e "    ${GREEN} 8)${NC}  Backup (Docker)           ${DIM}snapshot volume to .tgz${NC}"
  echo -e "    ${GREEN} 9)${NC}  Reset password (Docker)   ${DIM}inside container${NC}"
  echo -e "    ${GREEN}10)${NC}  Who am I (Docker)         ${DIM}account info from container${NC}"
  echo -e "    ${GREEN}11)${NC}  Clean build cache         ${DIM}docker builder prune${NC}"
  echo -e "    ${GREEN}12)${NC}  Clean dangling images     ${DIM}docker image prune${NC}"
  echo -e "    ${RED}13)${NC}  Purge Docker              ${DIM}container + image + volume${NC}"
  echo ""
  echo -e "  ${BOLD}${CYAN}Local Dev${NC}"
  echo -e "    ${GREEN}14)${NC}  Dev server                ${DIM}npm run dev${NC}"
  echo -e "    ${GREEN}15)${NC}  Run tests                 ${DIM}vitest${NC}"
  echo -e "    ${GREEN}16)${NC}  Lint                      ${DIM}eslint${NC}"
  echo -e "    ${GREEN}17)${NC}  Production build          ${DIM}next build${NC}"
  echo -e "    ${GREEN}18)${NC}  Reset password (local)    ${DIM}change password, sign out${NC}"
  echo -e "    ${GREEN}19)${NC}  Who am I (local)          ${DIM}account info from local DB${NC}"
  echo -e "    ${GREEN}20)${NC}  Backup (local)            ${DIM}snapshot ./data to .tgz${NC}"
  echo -e "    ${GREEN}21)${NC}  Status (local)            ${DIM}database + port info${NC}"
  echo -e "    ${GREEN}22)${NC}  Sign out all sessions     ${DIM}clear sessions, force re-login${NC}"
  echo -e "    ${RED}23)${NC}  Purge local data          ${DIM}delete DB + attachments (re-register)${NC}"
  echo ""
  echo -e "  ${BOLD}${YELLOW}Registry${NC}"
  echo -e "    ${GREEN}24)${NC}  Build & push to registry  ${DIM}build, tag, login, push${NC}"
  echo ""
  echo -e "    ${DIM} 0)  Exit${NC}"
  echo ""

  read -rp "Choose [0-24]: " choice
  echo ""
  case "$choice" in
    1)  docker_build ;;
    2)  docker_rebuild ;;
    3)  docker_stop ;;
    4)  docker_restart ;;
    5)  docker_status ;;
    6)  docker_logs ;;
    7)  docker_health ;;
    8)  docker_backup ;;
    9)  docker_reset_password ;;
    10) docker_whoami ;;
    11) docker_clean_cache ;;
    12) docker_clean_images ;;
    13) docker_purge ;;
    14) local_dev ;;
    15) local_test ;;
    16) local_lint ;;
    17) local_build ;;
    18) local_reset_password ;;
    19) local_whoami ;;
    20) local_backup ;;
    21) local_status ;;
    22) local_nuke_sessions ;;
    23) local_purge ;;
    24) registry_build_push ;;
    0)  echo -e "${DIM}Bye.${NC}"; exit 0 ;;
    *)  echo -e "${RED}Invalid choice.${NC}" ;;
  esac
}

# ------------------------------------------------------------------ #
#  Direct command mode: ./manage.sh <command>
# ------------------------------------------------------------------ #

if [ $# -gt 0 ]; then
  case "$1" in
    # Docker
    build)            docker_build ;;
    rebuild)          docker_rebuild ;;
    stop)             docker_stop ;;
    restart)          docker_restart ;;
    docker-status)    docker_status ;;
    logs)             docker_logs ;;
    health)           docker_health ;;
    docker-backup)    docker_backup ;;
    docker-reset-pw)  docker_reset_password ;;
    docker-whoami)    docker_whoami ;;
    docker-purge)     docker_purge ;;
    clean-cache)      docker_clean_cache ;;
    clean-images)     docker_clean_images ;;
    # Local
    dev)              local_dev ;;
    test)             local_test ;;
    lint)             local_lint ;;
    prod-build)       local_build ;;
    reset-password)   local_reset_password ;;
    whoami)           local_whoami ;;
    local-backup)     local_backup ;;
    local-status)     local_status ;;
    sign-out-all)     local_nuke_sessions ;;
    local-purge)      local_purge ;;
    # Registry
    push)             registry_build_push ;;
    # Help
    help|--help|-h)   show_help ;;
    *)
      echo -e "${RED}Unknown command:${NC} $1"
      echo ""
      show_help
      exit 1
      ;;
  esac
  exit 0
fi

# Interactive mode
while true; do
  menu
  echo ""
  read -rp "Press Enter to return to menu..." _
done
