#!/usr/bin/env bash
# Проверки сервера раз в час (таймер из install.sh): место на диске, срок сертификата HTTPS,
# синхронизация времени, ответ сайта, свежесть и место резервных копий (local-only или вне
# сервера), проверка восстановления, зависшее автообновление, работа канала уведомлений. О проблеме — уведомление
# (notify.sh), не чаще раза в сутки на каждую проблему.
# Внешний монитор: MONITOR_HEARTBEAT_URL (healthchecks.io и т. п., период 1 ч). Без проблем
# скрипт отправляет на него «жив», с проблемами — «<адрес>/fail». Если сервер лёг целиком или
# уведомления не доходят, внешний монитор не получит «жив» и сообщит владельцу сам.
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

# Резервные копии: свежая копия есть и где она лежит.
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-26}
now=$(date +%s)
backup_at=$(status_value backup-status at)
if [ -z "$backup_at" ]; then
  alert backup-none 'резервных копий ещё не было (deploy/backup/backup.sh, таймер agregator-backup)'
elif [ $((now - backup_at)) -gt $((BACKUP_MAX_AGE_HOURS * 3600)) ]; then
  alert backup-stale "последняя копия базы старше $BACKUP_MAX_AGE_HOURS ч: journalctl -u agregator-backup"
elif [[ "$(status_value backup-status mode)" != offsite-* ]]; then
  alert backup-local-only "копии базы только на сервере ($(status_value backup-status offsite)): при потере сервера они потеряются. Настройте BACKUP_RCLONE_REMOTE и BACKUP_AGE_RECIPIENT"
else
  log "копия базы: вне сервера ($(status_value backup-status mode)), $(((now - backup_at) / 3600)) ч назад"
fi
restore_at=$(status_value restore-status at)
if [ -z "$restore_at" ] || [ $((now - restore_at)) -gt $((8 * 86400)) ]; then
  alert restore-stale 'проверки восстановления из копии не было больше 8 дней (agregator-restore-check)'
elif [ "$(status_value restore-status result)" != ok ]; then
  alert restore-failed "последняя проверка восстановления не прошла: $(status_value restore-status reason)"
fi

# Автообновление ждёт (CI не закончился, GitHub не отвечает) дольше порога: сервер отстаёт от main.
DEPLOY_WAIT_ALERT_HOURS=${DEPLOY_WAIT_ALERT_HOURS:-6}
waiting_since=$(status_value waiting since)
if [ -n "$waiting_since" ] && [ $((now - waiting_since)) -gt $((DEPLOY_WAIT_ALERT_HOURS * 3600)) ]; then
  alert deploy-waiting "обновление ждёт CI или ответа GitHub $(((now - waiting_since) / 3600)) ч: journalctl -u agregator-deploy"
fi

if command -v timedatectl > /dev/null; then
  [ "$(timedatectl show -p NTPSynchronized --value 2> /dev/null)" = yes ] ||
    alert ntp 'время сервера не синхронизировано (timedatectl): сертификаты и сессии зависят от часов'
fi

# Канал уведомлений: без него о проблемах никто не узнает — это тоже проблема (сообщить можно
# только внешнему монитору, через heartbeat /fail).
if [ -z "$(env_value NOTIFY_WEBHOOK_URL)" ] &&
  { [ -z "$(env_value NOTIFY_TELEGRAM_TOKEN)" ] || [ -z "$(env_value NOTIFY_TELEGRAM_CHAT)" ]; }; then
  problems=$((problems + 1))
  log 'ПРОБЛЕМА: каналы уведомлений не настроены (NOTIFY_* в deploy/.env)'
elif [ "$(status_value notify-status result)" = failed ] &&
  [ $((now - $(status_value notify-status at))) -lt 86400 ]; then
  problems=$((problems + 1))
  log 'ПРОБЛЕМА: последнее уведомление не доставлено (Telegram или вебхук не принял)'
fi

log "проверок с проблемами: $problems"

# Итог — в STATE_DIR/monitor-status (readiness.sh требует свежий принятый «жив» без проблем).
heartbeat=$(env_value MONITOR_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
  [ "$problems" -eq 0 ] || heartbeat="${heartbeat%/}/fail"
  if printf 'url = "%s"\n' "$heartbeat" | curl -fsS --max-time 10 -K - > /dev/null; then
    write_status monitor-status heartbeat=accepted "problems=$problems"
  else
    log 'внешний монитор не ответил (MONITOR_HEARTBEAT_URL)'
    write_status monitor-status heartbeat=failed "problems=$problems"
  fi
else
  log 'внешний монитор не настроен (MONITOR_HEARTBEAT_URL): о падении всего сервера никто не узнает'
  write_status monitor-status heartbeat=unconfigured "problems=$problems"
fi
