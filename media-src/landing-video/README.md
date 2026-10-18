# Исходники пролёта по комнате на главной

Всё, из чего собран первый экран главной (`apps/web/src/components/landing/story.tsx`,
кадры в `apps/web/public/landing/flight-v1`). Сценарий и история решений —
`docs/landing-video-brief.md`, раздел 7.

Картинки и видео лежат в **Git LFS** и при обычном клонировании не скачиваются (`.lfsconfig`),
чтобы сервер и CI не тянули ~360 МБ при каждой выкладке. Скачать:

```bash
git lfs pull --include="media-src/**" --exclude=""
```

Промпты, модели, параметры и ID заданий Higgsfield для каждого файла — в `prompts.json`.
По ID задания файл можно взять как опорный кадр для новой генерации (`--image <id>`,
`--start-image <id>`), не загружая его заново.

## Состав

| Папка        | Что внутри                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyframes/` | Опорные кадры 4K (Nano Banana Pro, 5504×3072). `K-final-day` — исходная готовая комната (вариант A), от неё `K-final` (вечер) и через черновые — все остальные |
| `clips/`     | 7 роликов пролёта (Kling 3.0 Omni Frames, pro, 5 с, 1928×1072, 24 кадр/с, без звука). `C3-last.png` — последний кадр C3, начальный кадр C4                     |
| `flight/`    | `flight-master.mp4` — склейка C1–C7, 35 с, 841 кадр, из неё режутся кадры сайта; `flight-preview.mp4` — облегчённая копия для просмотра                        |
| `drafts/`    | Отклонённые варианты: первый K-final с окном слева, вариант B первого экрана (GPT Image 2.5), «до ремонта» с другими ракурсами, пробный пролёт                 |

## Цепочка кадров

```
K-final-day ─(вечерний свет)→ K-final
K-final ─→ K-demo, K-rough ─→ K-before, K-rough2
K-before ─→ K-wall, K-tools
```

| Ролик | Начальный кадр → конечный |
| ----- | ------------------------- |
| C1    | K-before → K-wall         |
| C2    | K-wall → K-tools          |
| C3    | K-tools → (без конечного) |
| C4    | C3-last → K-demo          |
| C5    | K-demo → K-rough2         |
| C6    | K-rough2 → K-final        |
| C7    | K-final → (без конечного) |

## Пересборка кадров сайта

```bash
python3 scripts/landing-flight-frames.py media-src/landing-video/flight/flight-master.mp4 \
  media-src/landing-video/keyframes/K-final.png apps/web/public/landing/flight-v2
```

После замены роликов кадры кладутся в новую папку (`flight-v2`) и меняется `FLIGHT_BASE`
в `apps/web/src/lib/flight.ts` (у старой папки кеш на год).
