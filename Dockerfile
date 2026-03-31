# ─── Builder stage ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

# C++ toolchain for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config first (better layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/providers/package.json packages/providers/
COPY packages/observability/package.json packages/observability/
COPY packages/memory/package.json packages/memory/
COPY packages/knowledge-base/package.json packages/knowledge-base/
COPY packages/skills-core/package.json packages/skills-core/
COPY packages/agent/package.json packages/agent/
COPY packages/gateway/package.json packages/gateway/
COPY packages/cli/package.json packages/cli/
COPY packages/skills-osai/package.json packages/skills-osai/
COPY packages/os-integration/package.json packages/os-integration/
COPY packages/voice/package.json packages/voice/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json tsconfig.base.json ./
COPY packages/ ./packages/

RUN pnpm build

# ─── Runtime stage ────────────────────────────────────────────
FROM node:22-bookworm-slim

LABEL maintainer="osaI"
LABEL description="osaI v3 -- AI Operating System (Gateway)"

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist/ /app/packages/shared/dist/
COPY --from=builder /app/packages/providers/dist/ /app/packages/providers/dist/
COPY --from=builder /app/packages/observability/dist/ /app/packages/observability/dist/
COPY --from=builder /app/packages/memory/dist/ /app/packages/memory/dist/
COPY --from=builder /app/packages/knowledge-base/dist/ /app/packages/knowledge-base/dist/
COPY --from=builder /app/packages/skills-core/dist/ /app/packages/skills-core/dist/
COPY --from=builder /app/packages/agent/dist/ /app/packages/agent/dist/
COPY --from=builder /app/packages/gateway/dist/ /app/packages/gateway/dist/
COPY --from=builder /app/packages/cli/dist/ /app/packages/cli/dist/
COPY --from=builder /app/packages/skills-osai/dist/ /app/packages/skills-osai/dist/
COPY --from=builder /app/packages/os-integration/dist/ /app/packages/os-integration/dist/
COPY --from=builder /app/packages/voice/dist/ /app/packages/voice/dist/

# Copy package.json files for workspace resolution
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder /app/packages/providers/package.json /app/packages/providers/package.json
COPY --from=builder /app/packages/observability/package.json /app/packages/observability/package.json
COPY --from=builder /app/packages/memory/package.json /app/packages/memory/package.json
COPY --from=builder /app/packages/knowledge-base/package.json /app/packages/knowledge-base/package.json
COPY --from=builder /app/packages/skills-core/package.json /app/packages/skills-core/package.json
COPY --from=builder /app/packages/agent/package.json /app/packages/agent/package.json
COPY --from=builder /app/packages/gateway/package.json /app/packages/gateway/package.json
COPY --from=builder /app/packages/cli/package.json /app/packages/cli/package.json
COPY --from=builder /app/packages/skills-osai/package.json /app/packages/skills-osai/package.json
COPY --from=builder /app/packages/os-integration/package.json /app/packages/os-integration/package.json
COPY --from=builder /app/packages/voice/package.json /app/packages/voice/package.json

# Install production dependencies only
RUN corepack enable && corepack prepare pnpm@9 --activate \
    && pnpm install --frozen-lockfile --prod

EXPOSE 18789

# Default: start gateway
CMD ["node", "packages/gateway/dist/start.js"]
