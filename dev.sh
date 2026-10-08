#!/usr/bin/env bash
# madoc development environment launcher
# Starts both Go backend (with hot reload) and frontend dev server
#
# Usage:
#   ./dev.sh          # start both backend + frontend
#   ./dev.sh backend   # start only backend (air hot reload)
#   ./dev.sh frontend  # start only frontend (vite dev server)

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Where the backend listens.
BACKEND_ADDR="${MADOC_ADDR:-:3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8000}"

# The dev data directory is pinned to the project, on purpose. Production runs
# from ~/AppData/madoc via MADOC_DATA; if that variable were inherited here, a
# dev server would read and write the real workspace. Never inherit it.
DATA_DIR="$ROOT_DIR/data"
if [ -n "${MADOC_DATA:-}" ] && [ "$MADOC_DATA" != "$DATA_DIR" ]; then
    echo -e "${YELLOW}[dev] Ignoring MADOC_DATA=${MADOC_DATA} — dev stays in ${DATA_DIR}${NC}"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Track child PIDs for cleanup
PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down dev services...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

start_backend() {
    echo -e "${CYAN}[backend] Data directory: ${DATA_DIR}${NC}"
    echo -e "${CYAN}[backend] Database:       ${DATA_DIR}/madoc.db${NC}"
    if ! command -v go >/dev/null 2>&1; then
        echo -e "${RED}[backend] go is not on PATH; install Go 1.21+ first.${NC}"
        exit 1
    fi
    # Hot reload is a convenience, not a requirement. air is an external tool
    # the project does not vendor, so never let its absence stop the backend.
    if command -v air >/dev/null 2>&1; then
        echo -e "${CYAN}[backend] Starting with air (hot reload)...${NC}"
        echo -e "${CYAN}[backend] MADOC_DEV=true, MADOC_ADDR=${BACKEND_ADDR}${NC}"
        MADOC_DEV=true MADOC_ADDR="$BACKEND_ADDR" MADOC_DATA="$DATA_DIR" air &
    else
        echo -e "${CYAN}[backend] air not installed, starting with go run . (no hot reload)${NC}"
        echo -e "${CYAN}[backend] for hot reload: go install github.com/air-verse/air@latest${NC}"
        echo -e "${CYAN}[backend] MADOC_DEV=true, MADOC_ADDR=${BACKEND_ADDR}${NC}"
        MADOC_DEV=true MADOC_ADDR="$BACKEND_ADDR" MADOC_DATA="$DATA_DIR" go run . &
    fi
    PIDS+=($!)
    local pid=$!
    # Surface an immediate crash here; otherwise `wait` just returns and the
    # script exits with no explanation of why nothing is listening.
    sleep 3
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}[backend] exited immediately — see the error above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}[backend] PID=${pid}${NC}"
}

start_frontend() {
    echo -e "${CYAN}[frontend] Starting vite dev server...${NC}"
    echo -e "${CYAN}[frontend] port ${FRONTEND_PORT}${NC}"
    (
        cd "$ROOT_DIR/web"
        # Install dependencies if vite is not found
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}[frontend] Dependencies not found, running pnpm install...${NC}"
            pnpm install
        fi
        pnpm dev --port "$FRONTEND_PORT"
    ) &
    PIDS+=($!)
    echo -e "${GREEN}[frontend] PID=$!${NC}"
}

# Parse arguments
TARGET="${1:-both}"

case "$TARGET" in
    backend)
        start_backend
        wait
        ;;
    frontend)
        start_frontend
        wait
        ;;
    both|"")
        start_backend
        sleep 2  # give backend a moment to start
        start_frontend

        echo ""
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}  madoc dev environment is running${NC}"
        echo -e "${YELLOW}  Frontend:  http://localhost:${FRONTEND_PORT}${NC}"
        echo -e "${YELLOW}  Backend:   http://localhost:${BACKEND_ADDR#:}${NC}"
        echo -e "${YELLOW}  Data dir:  ${DATA_DIR}${NC}"
        echo -e "${YELLOW}  Press Ctrl+C to stop${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""
        wait
        ;;
    *)
        echo "Usage: $0 [backend|frontend|both]"
        exit 1
        ;;
esac
