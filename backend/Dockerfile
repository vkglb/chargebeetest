# Multi-stage build → tiny static image. Portable to any container host.
FROM golang:1.25-alpine AS build
WORKDIR /src

# Cache deps first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# Build both the API server and the standalone migration runner.
RUN CGO_ENABLED=0 go build -tags netgo -ldflags '-s -w' -o /out/app ./cmd/api
RUN CGO_ENABLED=0 go build -tags netgo -ldflags '-s -w' -o /out/migrate ./cmd/migrate

# Minimal runtime image (no shell, no OS packages).
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/app /app
COPY --from=build /out/migrate /migrate
EXPOSE 8080
# Default to the API; override entrypoint to /migrate to run migrations.
ENTRYPOINT ["/app"]
