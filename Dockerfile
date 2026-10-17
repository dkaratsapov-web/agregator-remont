# syntax=docker/dockerfile:1
# Один Dockerfile на монорепозиторий, цели: `api` (API + миграции) и `web` (Next.js standalone).

FROM node:22-slim AS base
# Зеркало Debian для apt (например, http://mirror.yandex.ru), если deb.debian.org недоступен
# с сервера сборки. Пусто — штатный deb.debian.org. Задаётся DEBIAN_MIRROR в deploy/.env.
# Только http:// (как у штатных источников образа: ca-certificates для https ещё не
# установлены); подлинность пакетов apt проверяет по подписям Debian. Значение строго
# проверяется до подстановки в sed: только [A-Za-z0-9.:/_~-], без `|`, `&`, `\`, `@`,
# пробелов и переводов строк.
ARG DEBIAN_MIRROR=""
# OpenSSL нужен движку Prisma.
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
    case "$DEBIAN_MIRROR" in \
      http://?*) ;; \
      *) echo "DEBIAN_MIRROR: нужен адрес вида http://host[:port][/path]" >&2; exit 1 ;; \
    esac; \
    case "$DEBIAN_MIRROR" in \
      *[!A-Za-z0-9.:/_~-]*) echo "DEBIAN_MIRROR: недопустимые символы" >&2; exit 1 ;; \
    esac; \
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
