"""Нарезка пролёта по комнате на кадры для главной (docs/landing-video-brief.md, раздел 7).

    python3 scripts/landing-flight-frames.py flight-master.mp4 K-final.png apps/web/public/landing/flight-v2

flight-master.mp4 — склейка роликов 1928×1072, 24 кадр/с; K-final.png — опорный кадр готовой
комнаты (для reduced motion). Нужны ffmpeg и Pillow с поддержкой WebP.
Число кадров в наборах должно совпадать с FLIGHT_SETS в apps/web/src/lib/flight.ts.
"""

import os
import subprocess
import sys

from PIL import Image

SETS = {'desktop': 211, 'mobile': 211}
QUALITY = {'desktop': 62, 'mobile': 60}
W, H = 1928, 1072
MOBILE_WIDTH = 602
MOBILE_X = 0.55  # вертикальная обрезка чуть правее центра: окно и диван в кадре


def cut(src: str, out: str) -> None:
    total = int(
        subprocess.check_output(
            ['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
             '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', src]
        ).strip()
    )
    want = {
        name: {round(i * (total - 1) / (count - 1)): i for i in range(count)}
        for name, count in SETS.items()
    }
    for name in SETS:
        os.makedirs(f'{out}/{name}', exist_ok=True)
    proc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        stdout=subprocess.PIPE,
    )
    n = 0
    while len(buf := proc.stdout.read(W * H * 3)) == W * H * 3:
        frame = Image.frombytes('RGB', (W, H), buf)
        if n in want['desktop']:
            frame.save(
                f"{out}/desktop/{want['desktop'][n]:03d}.avif",
                'AVIF',
                quality=QUALITY['desktop'],
                speed=4,
            )
        if n in want['mobile']:
            x = round((W - MOBILE_WIDTH) * MOBILE_X)
            frame.crop((x, 0, x + MOBILE_WIDTH, H)).save(
                f"{out}/mobile/{want['mobile'][n]:03d}.avif",
                'AVIF',
                quality=QUALITY['mobile'],
                speed=4,
            )
        n += 1
    proc.wait()


def final(src: str, out: str) -> None:
    Image.open(src).convert('RGB').resize((1920, 1072), Image.LANCZOS).save(
        f'{out}/final.webp', 'WEBP', quality=80, method=6
    )


if __name__ == '__main__':
    video, still, target = sys.argv[1:4]
    cut(video, target)
    final(still, target)
