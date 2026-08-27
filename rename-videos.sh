#!/bin/bash
# Переименовывает 16 видео из Telegram в имена для Cloudflare R2.
# Использование: положите файлы в одну папку и запустите там:  bash rename-videos.sh
# Файлы находятся по номеру в начале имени (01–16), остальная часть не важна.

set -e

declare -a MAP=(
  "01:dopamine-gaba-kk.mp4"
  "02:dopamine-gaba-ru.mp4"
  "03:dopamine-serotonin-kk.mp4"
  "04:dopamine-serotonin-ru.mp4"
  "05:acetylcholine-gaba-kk.mp4"
  "06:acetylcholine-gaba-ru.mp4"
  "07:acetylcholine-serotonin-kk.mp4"
  "08:acetylcholine-serotonin-ru.mp4"
  "09:gaba-dopamine-kk.mp4"
  "10:gaba-dopamine-ru.mp4"
  "11:gaba-acetylcholine-kk.mp4"
  "12:gaba-acetylcholine-ru.mp4"
  "13:serotonin-dopamine-kk.mp4"
  "14:serotonin-dopamine-ru.mp4"
  "15:serotonin-acetylcholine-kk.mp4"
  "16:serotonin-acetylcholine-ru.mp4"
)

renamed=0
for pair in "${MAP[@]}"; do
  num="${pair%%:*}"
  target="${pair##*:}"
  # ищем файл, начинающийся с номера (напр. "07-қазақша-Холин-Серотонин.mp4" или "07 қазақша ....mp4")
  src=$(find . -maxdepth 1 -name "${num}[ -_]*.mp4" -o -maxdepth 1 -name "${num}.mp4" | head -1)
  if [ -z "$src" ]; then
    echo "⚠️  не найден файл с номером ${num} — пропускаю"
    continue
  fi
  mv -v "$src" "$target"
  renamed=$((renamed+1))
done

echo
echo "Готово: переименовано $renamed из 16."
echo "Теперь перетащите все .mp4 в бакет R2 (Objects → Upload)."
