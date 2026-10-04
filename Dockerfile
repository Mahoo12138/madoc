FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend-builder
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN corepack enable && pnpm --version
RUN pnpm install --frozen-lockfile
COPY web/ ./web/
RUN pnpm --dir web build

FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS builder
ARG TARGETOS
ARG TARGETARCH
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /src/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /usr/local/bin/madoc .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /usr/local/bin/madoc /usr/local/bin/madoc
EXPOSE 3000
ENV MADOC_DATA=/data MADOC_ADDR=:3000
VOLUME /data
ENTRYPOINT ["madoc"]
