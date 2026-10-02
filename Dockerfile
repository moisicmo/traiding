# ─────────────────────────────────────────────
# Dockerfile — Trading (Next.js standalone)
# ─────────────────────────────────────────────

# ── 1. DEPS ──────────────────────────────────
FROM node:24.21.0-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# ── 2. BUILD ─────────────────────────────────
FROM node:24.21.0-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN yarn build

# ── 3. RUNNER (producción, imagen mínima) ────
FROM node:24.21.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4300
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && mkdir -p /app/data && chown nextjs:nodejs /app/data

# Base de datos SQLite: va en un volumen para que no se borre al recompilar
VOLUME /app/data

# standalone output + archivos estáticos
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

USER nextjs

EXPOSE 4300

CMD ["node", "server.js"]
