#!/usr/bin/env bash
# Секреты в собранных образах: bash scripts/image-secrets-check.sh <образ> [<образ> ...]
# Проверяет содержимое образа, а не только .dockerignore (ТЗ #40, DEV-5): файловую систему
# образа (каталоги приложения repo/ и app/, без node_modules) и историю слоёв (docker history).
# Ищет .env (кроме .env.example), deploy/secrets, дампы базы, ключи и сертификаты; в истории —
# ARG/ENV с паролями, токенами и ключами. Печатает только пути и имена переменных, без
# содержимого. Код выхода: 0 — чисто, 1 — найдено.
set -euo pipefail

[ $# -gt 0 ] || { echo 'укажите образы' >&2; exit 2; }
files='(^|/)\.env(\.[^/]*)?$|(^|/)deploy/secrets(/|$)|\.dump(\.age)?$|\.(p12|pfx|pem|key|crt)$|(^|/)id_(rsa|ecdsa|ed25519)$'
history_vars='[A-Z0-9_]*(PASSWORD|PASSWD|TOKEN|SECRET|HASH|PRIVATE|API_?KEY|ACCESS_?KEY)[A-Z0-9_]*=[^[:space:]]+'
found=0

for image in "$@"; do
  id=$(docker create "$image" true)
  hits=$(docker export "$id" | tar -t |
    grep -E '^(repo|app)/' | grep -v '/node_modules/' |
    grep -E "$files" | grep -Ev '(^|/)\.env\.example$' || true)
  docker rm "$id" > /dev/null
  if [ -n "$hits" ]; then
    found=1
    echo "НАЙДЕНО в файлах $image:"
    while IFS= read -r path; do echo "  /$path"; done <<< "$hits"
  fi
  names=$(docker history --no-trunc --format '{{.CreatedBy}}' "$image" |
    grep -Eo "$history_vars" | cut -d= -f1 | sort -u || true)
  if [ -n "$names" ]; then
    found=1
    echo "НАЙДЕНО в истории слоёв $image (значения не печатаются): $(paste -sd' ' <<< "$names")"
  fi
  [ -n "$hits$names" ] || echo "чисто: $image"
done
exit "$found"
