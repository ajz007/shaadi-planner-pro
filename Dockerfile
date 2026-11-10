FROM node:22-bookworm-slim AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/index.html web/tsconfig.json ./
COPY web/src/ ./src/
RUN npm run build:hosted

FROM golang:1.24-bookworm AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY migrations/ ./migrations/
COPY web/src/workbook-demo.json ./web/src/workbook-demo.json
RUN CGO_ENABLED=0 go build -trimpath -o /shaadi-planner .

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=backend /shaadi-planner /usr/local/bin/shaadi-planner
COPY --from=frontend /app/web/dist ./web/dist
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/shaadi-planner"]
