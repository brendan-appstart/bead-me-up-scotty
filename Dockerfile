# ── bd: download prebuilt beads CLI from GitHub releases ───────────────────
# bd uses embedded Dolt (CGO), so the prebuilt Linux binary is glibc-linked.
# That's why the runner stage uses Debian slim instead of Alpine (musl).
# Release filenames use Docker's TARGETARCH values (amd64/arm64) verbatim.
ARG BD_VERSION=1.1.0
ARG NODE_VERSION=26.4.0
FROM alpine:3.22 AS bd
ARG BD_VERSION
ARG TARGETARCH
ADD https://github.com/gastownhall/beads/releases/download/v${BD_VERSION}/beads_${BD_VERSION}_linux_${TARGETARCH}.tar.gz /tmp/bd.tar.gz
RUN tar -xzf /tmp/bd.tar.gz -C /tmp && mv /tmp/bd /usr/local/bin/bd

# ── Eleventy: self-contained tree for the showcase publisher ─────────────────
# The app locates node_modules/@11ty/eleventy/cmd.cjs by scanning the
# filesystem (lib/showcase/generate.ts) — it is deliberately never imported, so
# Next's standalone output tracing does not include it. Install it with its
# full dependency tree here and copy it into the runner below.
# Keep the version in sync with package.json.
FROM node:${NODE_VERSION}-alpine AS eleventy
WORKDIR /eleventy
RUN npm install --no-save @11ty/eleventy@3.1.6

# ── Builder: install deps and build the Next.js app ──────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# next.config.ts reads git for build metadata; git is unavailable in the
# container, but it falls back gracefully (badge hides). Override via build args
# if you want the badge to show a specific build/sha.
ARG BUILD_NUMBER=""
ARG BUILD_SHA=""

# Standalone output is opt-in (see next.config.ts) so local `next start` flows
# keep the default output.
ENV NEXT_STANDALONE=1

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

# Run as a non-root user for security and give bd a real home/config dir.
# The home/config dirs are world-writable so `docker run --user <uid>:<gid>`
# (the README's fix for mounted-volume permission errors) can still write app
# settings and bd state — Debian's HOME_MODE 0700 would otherwise block any
# uid other than 1001 from even traversing /home/nextjs.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs \
 && mkdir -p /home/nextjs/.config \
 && chown -R nextjs:nodejs /home/nextjs \
 && chmod 0777 /home/nextjs /home/nextjs/.config

# Copy the standalone server, static assets, and public files.
# Next's file tracing puts a PARTIAL @11ty/eleventy (cmd.cjs without its deps)
# into the standalone node_modules; it would shadow the complete /node_modules
# tree below (eleventyBin() checks cwd first), so drop it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
RUN rm -rf ./node_modules/@11ty
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the prebuilt bd CLI into the image
COPY --from=bd --chown=nextjs:nodejs /usr/local/bin/bd /usr/local/bin/bd

# Eleventy for the showcase publisher. /node_modules sits on eleventyBin()'s
# upward search path and never collides with the standalone node_modules.
COPY --from=eleventy --chown=nextjs:nodejs /eleventy/node_modules /node_modules

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
