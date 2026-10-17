#!/usr/bin/env bash
# Автообновление сервера из ветки main (запускается таймером systemd, см. install.sh).
#
# Каждый запуск: если в origin/main появился новый коммит и все проверки GitHub (CI) по нему
# зелёные, сервер переходит на этот коммит (только fast-forward) и пересобирает стек. Пока CI
# идёт — ждём следующего запуска. Если CI красный или сборка упала — коммит помечается и больше
# не пробуется (следующий коммит в main пробуется заново). Старые контейнеры работают, пока
# новые образы не собраны, поэтому неудачная сборка сайт не роняет.
#
# Ручной запуск: sudo systemctl start agregator-deploy.service; журнал: journalctl -u agregator-deploy
set -euo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
BRANCH=${BRANCH:-main}
GITHUB_API=${GITHUB_API:-https://api.github.com/repos/dkaratsapov-web/agregator-remont}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
LOCK_FILE=${LOCK_FILE:-/run/agregator-deploy.lock}

log() { echo "[agregator-deploy] $*"; }

mkdir -p "$STATE_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'предыдущий запуск ещё идёт, пропускаю'
  exit 0
fi

cd "$REPO_DIR"
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)

git fetch --quiet origin "$BRANCH"
current=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")
if [ "$current" = "$target" ]; then
  exit 0
fi
if [ -f "$STATE_DIR/failed" ] && [ "$(cat "$STATE_DIR/failed")" = "$target" ]; then
  exit 0
fi

# Статус CI по коммиту: все check runs завершены и успешны. Репозиторий публичный, токен не нужен.
checks=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
  "$GITHUB_API/commits/$target/check-runs?per_page=100") || {
  log "не удалось получить статус CI для $target, попробую позже"
  exit 0
}
ci=$(printf '%s' "$checks" | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs:
    print("pending")
elif any(r["status"] != "completed" for r in runs):
    print("pending")
elif all(r["conclusion"] in ("success", "skipped", "neutral") for r in runs):
    print("success")
else:
    print("failure")
')
case "$ci" in
  pending)
    log "CI для $target ещё идёт, жду"
    exit 0
    ;;
  failure)
    log "CI для $target красный, этот коммит не разворачиваю"
    echo "$target" > "$STATE_DIR/failed"
    exit 0
    ;;
esac

log "обновление $current -> $target"
if ! git merge --ff-only --quiet "origin/$BRANCH"; then
  log 'fast-forward невозможен (локальные изменения на сервере?), остановлено'
  echo "$target" > "$STATE_DIR/failed"
  exit 1
fi

if ! "${compose[@]}" up -d --build --remove-orphans; then
  log "сборка или запуск $target не удались; работают прежние контейнеры, где это возможно"
  echo "$target" > "$STATE_DIR/failed"
  exit 1
fi

# Caddyfile смонтирован файлом: после git pull контейнер видит новую версию только после рестарта.
if ! git diff --quiet "$current" "$target" -- deploy/Caddyfile; then
  "${compose[@]}" restart caddy
fi

# Проверка, что сайт отвечает через Caddy (главная открыта без пароля). Только в журнал:
# откатывать некуда, прежние контейнеры уже заменены.
domain=$(sed -n 's/^DOMAIN=//p' deploy/.env 2>/dev/null | tr -d "\"'" | tail -n 1)
if [ -n "$domain" ]; then
  code=000
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      --resolve "$domain:443:127.0.0.1" "https://$domain/") || true
    [ "$code" = 200 ] && break
    sleep 5
  done
  if [ "$code" != 200 ]; then
    log "ВНИМАНИЕ: после обновления главная отвечает $code"
  fi
fi

# Висячие образы от прошлых сборок занимают диск (на сервере 30 ГБ).
docker image prune -f > /dev/null || true

echo "$target" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/failed"
log "готово: $target"
