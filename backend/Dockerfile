# Multi-stage build → tiny static image. Portable to any container host.
FROM golang:1.25-alpine AS build
WORKDIR /src

# Cache deps first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -tags netgo -ldflags '-s -w' -o /out/app ./cmd/api

# Minimal runtime image (no shell, no OS packages).
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/app /app
EXPOSE 8080
ENTRYPOINT ["/app"]
