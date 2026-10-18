#!/usr/bin/env bash
# Проверки сервера раз в час (таймер из install.sh): место на диске, срок сертификата HTTPS,
# синхронизация времени, ответ сайта. О проблеме — уведомление (notify.sh), не чаще раза в сутки
# на каждую проблему. Внешний монитор доступности (UptimeRobot, healthchecks.io) нужен отдельно:
# этот скрипт не сообщит, если лёг сам сервер.
set -uo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

DISK_ALERT_PERCENT=${DISK_ALERT_PERCENT:-80}
CERT_ALERT_DAYS=${CERT_ALERT_DAYS:-14}
mkdir -p "$STATE_DIR/alerts"
problems=0

log() { echo "[agregator-monitor] $*"; }
# Проблема: в журнал всегда, уведомление — раз в сутки на ключ.
alert() {
  local mark="$STATE_DIR/alerts/$1"
  problems=$((problems + 1))
  log "ПРОБЛЕМА: $2"
  if [ ! -f "$mark" ] || [ -n "$(find "$mark" -mmin +1440 2> /dev/null)" ]; then
    notify "$2"
    touch "$mark"
  fi
}

for path in / "$(docker info --format '{{.DockerRootDir}}' 2> /dev/null || echo /)" /var/backups; do
  [ -d "$path" ] || continue
  used=$(df -P "$path" | awk 'NR==2 {gsub("%", "", $5); print $5}')
  [ "${used:-0}" -lt "$DISK_ALERT_PERCENT" ] ||
    alert "disk-$(echo "$path" | tr '/' '_')" "диск $path заполнен на $used% (порог $DISK_ALERT_PERCENT%): docker system df, deploy/README.md"
done

domain=$(env_value DOMAIN)
if [ -n "$domain" ]; then
  end=$(echo | timeout 15 openssl s_client -servername "$domain" -connect 127.0.0.1:443 2> /dev/null |
    openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2)
  if [ -z "$end" ]; then
    alert cert-read "не удалось прочитать сертификат HTTPS $domain (Caddy не отвечает на 443?)"
  else
    days=$((($(date -d "$end" +%s) - $(date +%s)) / 86400))
    [ "$days" -ge "$CERT_ALERT_DAYS" ] ||
      alert cert-expiry "сертификат $domain истекает через $days дн. ($end): логи Caddy, deploy/README.md"
    log "сертификат $domain: осталось $days дн."
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$domain:443:127.0.0.1" "https://$domain/" || true)
  [ "$code" = 200 ] || alert site "главная https://$domain/ отвечает $code"
fi

if command -v timedatectl > /dev/null; then
  [ "$(timedatectl show -p NTPSynchronized --value 2> /dev/null)" = yes ] ||
    alert ntp 'время сервера не синхронизировано (timedatectl): сертификаты и сессии зависят от часов'
fi

log "проверок с проблемами: $problems"
