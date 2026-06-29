# ── bd: download prebuilt beads CLI from GitHub releases ───────────────────
# bd uses embedded Dolt (CGO), so the prebuilt Linux binary is glibc-linked.
# That's why the runner stage uses Debian slim instead of Alpine (musl).
ARG BD_VERSION=1.0.4
ARG NODE_VERSION=26.4.0
FROM alpine:latest AS bd
ARG BD_VERSION
ARG TARGETARCH
RUN apk add --no-cache curl tar \
 && case "$TARGETARCH" in \
      amd64) ARCH=amd64 ;; \
      arm64) ARCH=arm64 ;; \
      *) echo "Unsupported arch: $TARGETARCH"; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/bd.tar.gz \
      "https://github.com/gastownhall/beads/releases/download/v${BD_VERSION}/beads_${BD_VERSION}_linux_${ARCH}.tar.gz" \
 && tar -xzf /tmp/bd.tar.gz -C /tmp \
 && mv /tmp/bd /usr/local/bin/bd \
 && chmod +x /usr/local/bin/bd \
 && rm -rf /tmp/*

# ── Builder: install deps and build the Next.js app ──────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# next.config.ts reads git for build metadata; git is unavailable in the
# container, but it falls back gracefully (badge hides). Override via build args
# if you want the badge to show a specific build/sha.
ARG BUILD_NUMBER=""
ARG BUILD_SHA=""
ENV BUILD_NUMBER=${BUILD_NUMBER} BUILD_SHA=${BUILD_SHA}

RUN npm run build

# ── Runner: minimal image with standalone output + bd ───────────────────────
# Debian slim (not Alpine) because the prebuilt bd binary is glibc-linked.
FROM node:${NODE_VERSION}-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HOME=/home/nextjs
ENV XDG_CONFIG_HOME=/home/nextjs/.config

# Run as a non-root user for security and give bd a real home/config dir
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs \
 && mkdir -p /home/nextjs/.config \
 && chown -R nextjs:nodejs /home/nextjs

# Copy the standalone server, static assets, and public files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the prebuilt bd CLI into the image
COPY --from=bd --chown=nextjs:nodejs /usr/local/bin/bd /usr/local/bin/bd

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
