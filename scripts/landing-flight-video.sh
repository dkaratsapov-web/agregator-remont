#!/usr/bin/env bash
# Ролики пролёта по комнате для главной (docs/landing-video-brief.md, раздел 7).
#
#   scripts/landing-flight-video.sh flight-master.mp4 K-final.png apps/web/public/landing/flight-v3
#
# flight-master.mp4 — склейка роликов 1928×1072, 24 кадр/с, 35 с; K-final.png — опорный кадр
# готовой комнаты (для reduced motion и браузеров без AVIF). Нужны ffmpeg (libx264, libvpx-vp9,
# libaom или libsvtav1 для AVIF) и cwebp.
#
# На выходе для широкого экрана (desktop) и вертикальной обрезки (mobile): прямой и обратный ролик
# в H.264 и VP9, первый кадр AVIF. Ключевой кадр каждую секунду (-g 24): остановки пролёта стоят на
# целых секундах (FLIGHT_KEYS в apps/web/src/lib/flight.ts) и показываются точно, перемотка
# при ручной прокрутке быстрая. Звука нет.
set -euo pipefail

src=$1
still=$2
out=$3
mkdir -p "$out"

W=1928
MOBILE_WIDTH=602
# Вертикальная обрезка чуть правее центра: окно и диван в кадре.
MOBILE_X=$(((W - MOBILE_WIDTH) * 55 / 100))
crop="crop=$MOBILE_WIDTH:1072:$MOBILE_X:0"
gop=(-g 24 -keyint_min 24 -sc_threshold 0)
h264=(-an -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -profile:v high "${gop[@]}" -movflags +faststart)
vp9=(-an -c:v libvpx-vp9 -b:v 0 -crf 25 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p "${gop[@]}")

encode() { # layout direction filter
  local name="$out/$1-$2" filter=$3
  ffmpeg -v error -y -i "$src" ${filter:+-vf "$filter"} "${h264[@]}" "$name.mp4"
  ffmpeg -v error -y -i "$src" ${filter:+-vf "$filter"} "${vp9[@]}" "$name.webm"
}

encode desktop forward ''
encode desktop reverse reverse
encode mobile forward "$crop"
encode mobile reverse "$crop,reverse"

ffmpeg -v error -y -i "$src" -frames:v 1 -c:v libaom-av1 -still-picture 1 -crf 20 "$out/desktop-poster.avif"
ffmpeg -v error -y -i "$src" -frames:v 1 -vf "$crop" -c:v libaom-av1 -still-picture 1 -crf 20 "$out/mobile-poster.avif"
ffmpeg -v error -y -i "$still" -vf scale=1920:1072:flags=lanczos -c:v libwebp -quality 80 "$out/final.webp"
ls -la "$out"
