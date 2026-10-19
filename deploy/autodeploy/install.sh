#!/usr/bin/env bash
# Включает автообновление и обслуживание сервера (один раз, повтор безопасен):
#   sudo bash deploy/autodeploy/install.sh
# Таймеры systemd:
#   agregator-deploy        каждые 2 минуты: новый коммит main с зелёным CI → обновление сайта;
#   agregator-backup        каждый день в 03:17: резервная копия базы (deploy/backup/backup.sh);
#   agregator-restore-check по воскресеньям в 04:17: проверка восстановления из копии;
#   agregator-monitor       каждый час: диск, сертификат, время, ответ сайта (monitor.sh).
# Сбой любой из этих служб → уведомление владельцу (OnFailure, notify.sh; каналы в deploy/.env).
# Выключить автообновление: sudo systemctl disable --now agregator-deploy.timer
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Запустите от root: sudo bash deploy/autodeploy/install.sh' >&2
  exit 1
fi

REPO_DIR=$(cd "$(dirname "$0")/../.." && pwd)
for tool in git docker curl python3 flock; do
  command -v "$tool" > /dev/null || { echo "Не найдено: $tool" >&2; exit 1; }
done
[ -f "$REPO_DIR/deploy/.env" ] || { echo "Нет $REPO_DIR/deploy/.env" >&2; exit 1; }
# В deploy/.env пароли и токены: читать может только root.
chown root:root "$REPO_DIR/deploy/.env"
chmod 600 "$REPO_DIR/deploy/.env"
if [ -d "$REPO_DIR/deploy/secrets" ]; then
  chown -R root:root "$REPO_DIR/deploy/secrets"
  chmod 700 "$REPO_DIR/deploy/secrets"
fi

# Уведомление о сбое любой службы: agregator-notify@<служба>.service.
cat > /etc/systemd/system/agregator-notify@.service <<UNIT
[Unit]
Description=Agregator: notify the owner that %i failed

[Service]
Type=oneshot
Environment=REPO_DIR=$REPO_DIR
ExecStart=/usr/bin/env bash $REPO_DIR/deploy/autodeploy/notify.sh "служба %i завершилась с ошибкой: journalctl -u %i"
UNIT

# Служба и таймер: unit NAME DESCRIPTION COMMAND TIMEOUT ONCALENDAR
unit() {
  cat > "/etc/systemd/system/$1.service" <<UNIT
[Unit]
Description=$2
Wants=network-online.target docker.service
After=network-online.target docker.service
OnFailure=agregator-notify@%n.service

[Service]
Type=oneshot
Environment=REPO_DIR=$REPO_DIR
ExecStart=$3
TimeoutStartSec=$4
UNIT
  cat > "/etc/systemd/system/$1.timer" <<UNIT
[Unit]
Description=$2 (timer)

[Timer]
OnCalendar=$5
Persistent=true
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
UNIT
}
unit agregator-backup 'Agregator: daily database backup' "/usr/bin/env bash $REPO_DIR/deploy/backup/backup.sh daily" 30min '*-*-* 03:17'
unit agregator-restore-check 'Agregator: weekly restore check' "/usr/bin/env bash $REPO_DIR/deploy/backup/restore-check.sh" 30min 'Sun *-*-* 04:17'
unit agregator-monitor 'Agregator: hourly server checks' "/usr/bin/env bash $REPO_DIR/deploy/autodeploy/monitor.sh" 5min 'hourly'

cat > /etc/systemd/system/agregator-deploy.service <<UNIT
[Unit]
Description=Agregator: update from GitHub main when CI is green
Wants=network-online.target docker.service
After=network-online.target docker.service
OnFailure=agregator-notify@%n.service

[Service]
Type=oneshot
Environment=REPO_DIR=$REPO_DIR
ExecStart=$REPO_DIR/deploy/autodeploy/deploy.sh
TimeoutStartSec=45min
UNIT

cat > /etc/systemd/system/agregator-deploy.timer <<'UNIT'
[Unit]
Description=Agregator: check GitHub main every 2 minutes

[Timer]
OnBootSec=2min
OnUnitInactiveSec=2min

[Install]
WantedBy=timers.target
UNIT

chmod +x "$REPO_DIR/deploy/autodeploy/"*.sh "$REPO_DIR/deploy/backup/"*.sh
systemctl daemon-reload
systemctl enable --now agregator-deploy.timer agregator-backup.timer agregator-restore-check.timer agregator-monitor.timer
# Без них сбои видны только в журнале сервера (deploy/README.md, «Уведомления и обслуживание»).
. "$REPO_DIR/deploy/autodeploy/lib.sh"
for setting in MONITOR_HEARTBEAT_URL BACKUP_RCLONE_REMOTE; do
  [ -n "$(cd "$REPO_DIR" && env_value "$setting")" ] || echo "ВНИМАНИЕ: не задан $setting в deploy/.env — до публичного запуска обязателен"
done
if [ -z "$(cd "$REPO_DIR" && env_value NOTIFY_WEBHOOK_URL)$(cd "$REPO_DIR" && env_value NOTIFY_TELEGRAM_TOKEN)" ]; then
  echo 'ВНИМАНИЕ: не задан канал уведомлений (NOTIFY_*) в deploy/.env'
fi
echo 'Автообновление включено. Первая проверка запущена, это может занять несколько минут...'
systemctl start agregator-deploy.service || true
journalctl -u agregator-deploy.service -n 20 --no-pager
