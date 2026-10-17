#!/usr/bin/env bash
# Включает автообновление сервера (один раз): sudo bash deploy/autodeploy/install.sh
# Ставит таймер systemd: каждые 2 минуты deploy.sh проверяет ветку main и при новом коммите
# с зелёным CI обновляет сайт. Сразу выполняет первую проверку.
# Выключить: sudo systemctl disable --now agregator-deploy.timer
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

cat > /etc/systemd/system/agregator-deploy.service <<UNIT
[Unit]
Description=Agregator: update from GitHub main when CI is green
Wants=network-online.target docker.service
After=network-online.target docker.service

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

chmod +x "$REPO_DIR/deploy/autodeploy/deploy.sh"
systemctl daemon-reload
systemctl enable --now agregator-deploy.timer
echo 'Автообновление включено. Первая проверка запущена, это может занять несколько минут...'
systemctl start agregator-deploy.service || true
journalctl -u agregator-deploy.service -n 20 --no-pager
