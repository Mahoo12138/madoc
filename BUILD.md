# Building madoc

## One-time setup

```pwsh
# Enable Corepack-managed yarn 4
corepack enable

# Install AFFiNE monorepo deps (this is large — several GB, ~10 minutes)
cd AFFiNE-canary
yarn install
cd ..
```

The frontend lives as a yarn workspace at
`AFFiNE-canary/blocksuite/madoc-frontend/`. It is picked up automatically by
the `blocksuite/**/*` glob in `AFFiNE-canary/package.json`.

> Node version: AFFiNE pins `node >=22.12 <23`. If your `node --version` is
> outside that range, install Node 22 via fnm/nvm/volta first.

## Build (production single binary)

```pwsh
# 1. Build the frontend bundle into frontend/dist (consumed by go:embed)
cd AFFiNE-canary
yarn workspace @madoc/frontend build
cd ..

# 2. Build the Go binary (embeds frontend/dist)
go build -o madoc.exe .
```

Run:

```pwsh
./madoc.exe
# default listen :3000, db file madoc.db in cwd
# override: $env:MADOC_ADDR = "127.0.0.1:8080"; $env:MADOC_DB = "data/madoc.db"
```

## Dev loop

Backend hot-reload is not wired; rebuild Go on demand. Frontend can run in
Vite dev server if you want HMR:

```pwsh
# Terminal 1 — Go backend (serves /api + /ws + stub static)
go run .

# Terminal 2 — Vite dev server (serves /src on localhost:5173)
cd AFFiNE-canary
yarn workspace @madoc/frontend dev
```

Note: in dev, the Vite-served page must still hit Go for `/api` and `/ws`.
Either point `WebSocket` URL hardcoded at `ws://localhost:3000/ws/...` in
`src/main.ts` for the dev session, or add a Vite proxy block.

## Tests

```pwsh
go test ./... -count=1
```

DB tests use temp dirs; WS tests spin up `httptest.NewServer`. No external
services required.

## Verification checklist (end-to-end)

1. Open `http://localhost:3000` in two browser windows — typing in one shows
   up in the other within ~500 ms.
2. Kill `madoc.exe`, relaunch, reopen the page — content persists.
3. Make >100 edits — inspect `madoc.db`:
   ```pwsh
   sqlite3 madoc.db "SELECT COUNT(*) FROM doc_updates; SELECT length(snapshot) FROM docs WHERE id='default';"
   ```
   `doc_updates` should be near 0; `snapshot` length > 0.
4. After ~3 s of inactivity, the FTS index updates. Test:
   `curl "http://localhost:3000/api/search?q=hello"` should match docs
   containing "hello".
