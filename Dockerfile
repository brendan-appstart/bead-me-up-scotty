# ── Builder: install deps and build the Next.js app ──────────────────────────
ARG NODE_VERSION=26
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

# ── Runner: minimal image with only the standalone output ────────────────────
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone server, static assets, and public files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
