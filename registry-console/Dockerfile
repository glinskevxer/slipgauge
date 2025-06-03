# Built from the repository root so the nginx config under ops/ is reachable.
#
#   docker build -f registry-console/Dockerfile .

FROM node:20.18.1-bookworm-slim AS build
WORKDIR /build

COPY registry-console/package.json registry-console/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY registry-console/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=build /build/dist/registry-console/browser /usr/share/nginx/html
COPY ops/nginx/console.conf /etc/nginx/conf.d/default.conf

USER 101
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=3s --retries=3 \
  CMD wget -q --spider http://localhost:8080/index.html || exit 1
