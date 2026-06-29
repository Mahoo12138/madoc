# madoc — selfhosted build

## Prerequisites

- Go 1.25+
- Node.js 20+ with corepack enabled (for frontend)
- Yarn 4.13+ (`corepack enable && yarn set version 4.13.0`)

## Build locally

```sh
# frontend
cd frontend
yarn install --immutable
yarn affine build
cd ..

# backend
CGO_ENABLED=0 go build -ldflags="-s -w" -o madoc .

# run
MADOC_DB=madoc.db MADOC_ADDR=:3000 ./madoc
```

## Docker

```sh
docker build -t madoc .
docker run -d -p 3000:3000 -v madoc-data:/data madoc
```

## Configuration

| Variable      | Default      | Description              |
|---------------|-------------|--------------------------|
| `MADOC_DB`    | `madoc.db`  | SQLite database path     |
| `MADOC_ADDR`  | `:3000`     | Listen address           |

## Development

```sh
go run .               # backend on :3000
cd frontend && yarn dev # frontend dev server
```

Data is stored in a SQLite file. No external database required.
