# ── Stage 1: Build ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Prune dev dependencies after build.
RUN npm prune --production

# ── Stage 2: Runtime ────────────────────────────────────────────────────────────
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install scanners.
RUN apt-get update && \
  apt-get install -y --no-install-recommends masscan nmap ca-certificates && \
  rm -rf /var/lib/apt/lists/*

# Create a non-root user for the bot.
RUN groupadd -r scanbot && useradd -r -g scanbot -m scanbot

# Allow masscan/nmap to use raw sockets as non-root.
RUN apt-get update && \
  apt-get install -y --no-install-recommends libcap2-bin && \
  setcap cap_net_raw+ep /usr/bin/masscan && \
  setcap cap_net_raw+ep /usr/bin/nmap && \
  apt-get purge -y libcap2-bin && apt-get autoremove -y && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the production artefacts from the builder stage.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create work directory with correct permissions.
RUN mkdir -p /tmp/scan-bot && chown scanbot:scanbot /tmp/scan-bot

USER scanbot

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "dist/index.js"]
