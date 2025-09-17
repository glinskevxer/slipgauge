# Built from the repository root, because the service and the tests it is
# verified by live in different trees.
#
#   docker build -f registry-service/Dockerfile .

FROM node:20.18.1-bookworm-slim AS build
WORKDIR /build

COPY registry-service/package.json registry-service/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY registry-service/tsconfig.json registry-service/tsconfig.spec.json registry-service/nest-cli.json ./
COPY registry-service/src ./src
RUN npm run build

# A second install with the development dependencies dropped. Copying the
# first node_modules across would carry the Angular toolchain and the embedded
# PostgreSQL binaries into an image that has no use for either.
FROM node:20.18.1-bookworm-slim AS deps
WORKDIR /deps

COPY registry-service/package.json registry-service/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20.18.1-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY --from=deps  /deps/node_modules ./node_modules
COPY --from=build /build/dist        ./dist
COPY registry-service/package.json   ./package.json

# Never root. The service writes nothing to its own filesystem, so it does not
# even need a writable home.
USER node
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=3s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
