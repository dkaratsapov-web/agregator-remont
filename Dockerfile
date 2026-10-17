# syntax=docker/dockerfile:1
# Один Dockerfile на монорепозиторий, цели: `api` (API + миграции) и `web` (Next.js standalone).

FROM node:22-slim AS base
# Зеркало Debian для apt (например, http://mirror.yandex.ru), если deb.debian.org недоступен
# с сервера сборки. Пусто — штатный deb.debian.org. Задаётся DEBIAN_MIRROR в deploy/.env.
ARG DEBIAN_MIRROR=""
# OpenSSL нужен движку Prisma.
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
    sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR%/}|g" /etc/apt/sources.list.d/debian.sources; \
  fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# standalone-сборка web только для образа: dev и CI используют обычный `next start`.
ENV NEXT_OUTPUT=standalone
RUN pnpm build

# API: собранный dist + зависимости (включая prisma CLI и tsx для миграций и демо-сида).
FROM build AS api
ENV NODE_ENV=production
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

# Web: минимальный образ из standalone-сборки Next.js.
FROM node:22-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
