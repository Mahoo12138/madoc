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
    echo -e "${CYAN}[backend] Starting Go backend with air (hot reload)...${NC}"
    echo -e "${CYAN}[backend] MADOC_DEV=true, MADOC_ADDR=:3000${NC}"
    MADOC_DEV=true MADOC_ADDR=:3000 MADOC_DB=madoc.db air &
    PIDS+=($!)
    echo -e "${GREEN}[backend] PID=$!${NC}"
}

start_frontend() {
    echo -e "${CYAN}[frontend] Starting vite dev server...${NC}"
    echo -e "${CYAN}[frontend] port 8080${NC}"
    (
        cd "$ROOT_DIR/web"
        # Install dependencies if vite is not found
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}[frontend] Dependencies not found, running pnpm install...${NC}"
            pnpm install
        fi
        pnpm dev
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
        echo -e "${YELLOW}  Frontend:  http://localhost:8080${NC}"
        echo -e "${YELLOW}  Backend:   http://localhost:3000${NC}"
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
