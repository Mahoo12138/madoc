# madoc — selfhosted build

## Prerequisites

- Go 1.25+
- Node.js 20+ with corepack enabled (for frontend)
- pnpm 9+ (`corepack enable && corepack install pnpm@latest`)
- [air](https://github.com/air-verse/air) for Go hot reload: `go install github.com/air-verse/air@latest`

## Build locally

```sh
# frontend
cd frontend
pnpm install --frozen-lockfile
pnpm affine build
cd ..

# backend
CGO_ENABLED=0 go build -ldflags="-s -w" -o madoc .
```

## Docker

```sh
docker build -t madoc .
docker run -d -p 3000:3000 -v madoc-data:/data madoc
```

## Configuration

| Variable      | Default      | Description                            |
|---------------|-------------|----------------------------------------|
| `MADOC_DB`    | `madoc.db`  | SQLite database path                   |
| `MADOC_ADDR`  | `:3000`     | Listen address                         |
| `MADOC_DEV`   | (unset)     | Set to `true` to enable CORS for dev   |

## Development

### Development prerequisites

- Frontend dependencies installed (see First-time frontend install below)

### Quick start (recommended)

```sh
# Start both backend (hot reload) and frontend (dev server) together
./dev.sh
```

This starts:
- **Backend**: `http://localhost:3000` (Go, with air hot reload, CORS enabled)
- **Frontend**: `http://localhost:8080` (rspack dev server, proxies API calls to :3000)

Open `http://localhost:8080` in your browser. The dev server serves `selfhost.html`
and proxies `/api`, `/graphql`, `/socket.io`, `/info` requests to the Go backend.

### Start services individually

```sh
# Backend only (with hot reload via air)
./dev.sh backend

# Or manually:
MADOC_DEV=true MADOC_ADDR=:3000 air

# Frontend only (rspack dev server)
./dev.sh frontend

# Or manually:
cd frontend && SELF_HOSTED=true pnpm affine bundle @madoc/web --dev
```

### How dev mode works

```
Browser (localhost:8080)
  │
  ├── HTML/JS/CSS  ← rspack dev server (port 8080)
  │
  └── /api/*          ─┐
      /graphql          ├──→ proxy → Go backend (port 3000)
      /socket.io        │
      /info            ─┘
```

- `MADOC_DEV=true` enables CORS headers on the Go backend
- `SELF_HOSTED=true` makes the rspack dev server use `selfhost.html` as the SPA entry
- The rspack dev server proxy forwards API/WebSocket traffic to `localhost:3000`
- Air watches `.go`, `.sql` files and rebuilds on change

### First-time frontend install

```sh
cd frontend
corepack enable
corepack install pnpm@latest
pnpm install
```

Data is stored in a SQLite file. No external database required.
