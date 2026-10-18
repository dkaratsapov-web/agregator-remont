#!/usr/bin/env bash
# Автообновление сервера из ветки main (запускается таймером systemd, см. install.sh).
#
# Каждый запуск:
# 1. Есть новый коммит в origin/main, который ещё не развёрнут и не помечен неудачным.
# 2. CI по этому точному SHA зелёный строго: workflow .github/workflows/ci.yml завершён успешно и
#    каждая обязательная задача (REQUIRED_JOBS) — success (ci_gate.py). Пока CI идёт или GitHub
#    не ответил (403/429/таймаут) — ждём следующего запуска, ничего не трогая.
# 3. Сервер переходит на коммит (только fast-forward), собирает образы (старые контейнеры в это
#    время работают), затем переключает контейнеры и при изменённом Caddyfile перезапускает Caddy.
# 4. Проверка здоровья: контейнеры запущены и healthy, через Caddy по HTTPS главная 200, закрытая
#    страница без пропуска 401, статика /_next/static и кадры /landing 200. Только после этого
#    коммит записывается как развёрнутый.
# Красный CI, неудачная сборка, сбой переключения или проверки — коммит помечается неудачным
# ($STATE_DIR/failed), скрипт завершается с ошибкой (systemd показывает unit как failed), в журнале
# причина и команды восстановления (deploy/README.md, «Если обновление не прошло»). Помеченный
# коммит не повторяется; следующий коммит в main пробуется заново. Повторить тот же после
# исправления: sudo rm /var/lib/agregator-deploy/failed && sudo systemctl start agregator-deploy.
# Миграции БД назад автоматически не откатываются.
#
# Ручной запуск: sudo systemctl start agregator-deploy.service; журнал: journalctl -u agregator-deploy
set -euo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
BRANCH=${BRANCH:-main}
GITHUB_API=${GITHUB_API:-https://api.github.com/repos/dkaratsapov-web/agregator-remont}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
LOCK_FILE=${LOCK_FILE:-/run/agregator-deploy.lock}
REQUIRED_WORKFLOW=${REQUIRED_WORKFLOW:-.github/workflows/ci.yml}
REQUIRED_JOBS=${REQUIRED_JOBS:-Lint, typecheck, test, build|Docker stack (compose)|Docker stack behind Caddy (proxy)}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-30}
HEALTH_DELAY=${HEALTH_DELAY:-5}
GATE="$(cd "$(dirname "$0")" && pwd)/ci_gate.py"

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
target=$(git rev-parse "origin/$BRANCH")
deployed=$(cat "$STATE_DIR/deployed" 2> /dev/null || true)
[ "$deployed" = "$target" ] && exit 0
if [ -f "$STATE_DIR/failed" ] && [ "$(cat "$STATE_DIR/failed")" = "$target" ]; then
  exit 0
fi

# Неудача: коммит помечается, причина и команды восстановления — в журнал, выход с ошибкой.
fail() {
  log "ОШИБКА: $1"
  log "коммит $target помечен неудачным, сайт может работать на прежних или частично обновлённых контейнерах"
  log "диагностика: ${compose[*]} ps; ${compose[*]} logs --tail 100 web api caddy"
  log "восстановление: deploy/README.md, раздел «Если обновление не прошло»"
  echo "$target" > "$STATE_DIR/failed"
  exit 1
}

# --- CI gate ---------------------------------------------------------------------------------
api() { curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$GITHUB_API/$1"; }
wait_ci() {
  log "CI для $target: $1, жду"
  exit 0
}

runs=$(api "actions/runs?head_sha=$target&event=push&branch=$BRANCH&per_page=100") ||
  wait_ci 'GitHub не ответил (сеть, 403/429 или таймаут)'
verdict=$(printf '%s' "$runs" | python3 "$GATE" run "$target" "$REQUIRED_WORKFLOW")
case "$verdict" in
  run:*) run_id=${verdict#run:} ;;
  failure:*)
    log "CI для $target красный (${verdict#failure:}), этот коммит не разворачиваю"
    echo "$target" > "$STATE_DIR/failed"
    exit 0
    ;;
  *) wait_ci 'ещё идёт или не найден' ;;
esac

pages=''
page=1
while :; do
  body=$(api "actions/runs/$run_id/jobs?filter=latest&per_page=100&page=$page") ||
    wait_ci 'список задач недоступен (сеть, 403/429 или таймаут)'
  pages+="$(printf '%s' "$body" | tr -d '\n')"$'\n'
  read -r count total < <(printf '%s' "$body" | python3 "$GATE" pages)
  seen=$(((page - 1) * 100 + count))
  if [ "$count" -eq 0 ] || [ "$seen" -ge "$total" ] || [ "$page" -ge 10 ]; then break; fi
  page=$((page + 1))
done
verdict=$(printf '%s' "$pages" | python3 "$GATE" jobs "$REQUIRED_JOBS")
case "$verdict" in
  success) ;;
  failure:*)
    log "CI для $target не зелёный (${verdict#failure:}), этот коммит не разворачиваю"
    echo "$target" > "$STATE_DIR/failed"
    exit 0
    ;;
  *) wait_ci 'задачи ещё идут' ;;
esac

# --- Обновление ------------------------------------------------------------------------------
current=$(git rev-parse HEAD)
log "обновление $current -> $target"
if ! git merge --ff-only --quiet "origin/$BRANCH"; then
  log 'fast-forward невозможен (локальные изменения на сервере?), остановлено'
  echo "$target" > "$STATE_DIR/failed"
  exit 1
fi

# Сначала только сборка: пока она идёт или если она упала, работают прежние контейнеры.
"${compose[@]}" build || fail 'сборка образов не удалась, контейнеры не переключались'
# Переключение. Может закончиться частично (часть контейнеров новая) — это видно в проверке ниже.
"${compose[@]}" up -d --remove-orphans || fail 'переключение контейнеров не удалось'
# Caddyfile смонтирован файлом: после git pull контейнер видит новую версию только после рестарта.
# Сравнение с последним развёрнутым коммитом, а не с HEAD: при повторе после неудачи HEAD уже
# на target, а Caddy ещё со старым файлом.
base=$current
if [ -n "$deployed" ] && git cat-file -e "$deployed^{commit}" 2> /dev/null; then base=$deployed; fi
if ! git diff --quiet "$base" "$target" -- deploy/Caddyfile; then
  "${compose[@]}" restart caddy || fail 'перезапуск Caddy не удался'
fi

# --- Проверка здоровья -----------------------------------------------------------------------
domain=$(sed -n 's/^DOMAIN=//p' deploy/.env 2> /dev/null | tr -d "\"'" | tail -n 1)
[ -n "$domain" ] || fail 'в deploy/.env нет DOMAIN, проверить сайт через Caddy нельзя'
site="https://$domain"
fetch() { curl -s -o "${2:-/dev/null}" -w '%{http_code}' --max-time 10 --resolve "$domain:443:127.0.0.1" "$site$1" || true; }

# Контейнеры: запущены, а у кого есть healthcheck — healthy (migrate завершается сам и не нужен).
containers_ok() {
  local states
  states=$("${compose[@]}" ps --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null) || return 1
  for service in db api web caddy; do
    printf '%s\n' "$states" | grep -Eq "^$service running( healthy)?\$" || return 1
  done
}

problem='контейнеры не поднялись'
for _ in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if containers_ok; then
    home=$(mktemp)
    code=$(fetch / "$home")
    if [ "$code" != 200 ]; then
      problem="главная через Caddy отвечает $code"
    elif [ "$(fetch /jobs)" != 401 ]; then
      problem='закрытая страница /jobs без пропуска отвечает не 401'
    else
      asset=$(grep -o '/_next/static/[^"]*\.js' "$home" | head -n 1 || true)
      frame=$(grep -o '/landing/[^",]*\.\(avif\|webp\)' "$home" | head -n 1 || true)
      if [ -z "$asset" ] || [ "$(fetch "$asset")" != 200 ]; then
        problem="статика /_next/static недоступна (${asset:-нет ссылки на главной})"
      elif [ -n "$frame" ] && [ "$(fetch "$frame")" != 200 ]; then
        problem="кадр $frame недоступен"
      else
        problem=''
      fi
    fi
    rm -f "$home"
    [ -z "$problem" ] && break
  fi
  sleep "$HEALTH_DELAY"
done
[ -z "$problem" ] || fail "проверка после обновления: $problem"

# Висячие образы от прошлых сборок занимают диск (на сервере 30 ГБ).
docker image prune -f > /dev/null || true

echo "$target" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/failed"
log "готово: $target, проверка пройдена"
