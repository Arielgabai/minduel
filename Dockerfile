# syntax=docker/dockerfile:1
# ------------------------------------------------------------------
# MINDUEL — image de production multi-stage.
# La même image sert le web (npm run start), le worker (npm run worker) et les
# migrations (npm run db:migrate:deploy). Le démarrage ne modifie JAMAIS le schéma.
# ------------------------------------------------------------------

FROM node:20-alpine AS base
# CA d'entreprise éventuelle (proxy avec inspection TLS/MITM) : ajoutée AVANT tout
# accès réseau pour que apk et npm ci fonctionnent. Le dossier docker/ca/ ne
# contient que README/.gitkeep par défaut (no-op) ; déposez-y un *.pem pour un
# build derrière un proxy. Voir docker/ca/README.md.
COPY docker/ca/ /usr/local/share/ca-extra/
RUN cat /usr/local/share/ca-extra/*.pem >> /etc/ssl/certs/ca-certificates.crt 2>/dev/null || true
# Node fait confiance à ces CA (en plus des CA Mozilla intégrées).
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
# OpenSSL requis par les moteurs Prisma sur Alpine.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dépendances complètes (dev incluses) pour le build ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build (client Prisma + build Next.js) ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Image finale (dépendances de production uniquement) ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# Dépendances de production (inclut prisma CLI, tsx, @aws-sdk, next).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Schéma Prisma (+ migrations), puis génération du client dans l'image finale.
COPY prisma ./prisma
RUN npx prisma generate

# Artefacts applicatifs nécessaires au runtime.
COPY --from=build /app/.next ./.next
COPY public ./public
COPY src ./src
COPY next.config.ts tsconfig.json ./

# Utilisateur non-root.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Healthcheck fiable (dépend uniquement du process web + DB).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null 2>&1 || exit 1

# Par défaut : serveur web. Surcharger la commande pour le worker :
#   docker run ... minduel:local npm run worker
CMD ["npm", "run", "start"]
