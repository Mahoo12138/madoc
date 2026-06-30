FROM node:20-alpine AS frontend-builder
WORKDIR /src/frontend
COPY frontend/ ./
RUN corepack enable && pnpm --version
RUN pnpm install --frozen-lockfile
RUN pnpm affine build

FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY --from=frontend-builder /src/frontend/dist ./frontend/dist
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /usr/local/bin/madoc .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /usr/local/bin/madoc /usr/local/bin/madoc
EXPOSE 3000
ENV MADOC_DB=/data/madoc.db MADOC_ADDR=:3000
VOLUME /data
ENTRYPOINT ["madoc"]
