'use client';

import { PHOTO_LIMITS } from '@agregator/shared';
import { useId, useState } from 'react';
import { PHOTO_ACCEPT } from '@/lib/photo-files';

/** Сторона, до которой браузер уменьшает фото перед отправкой (сервер всё равно перекодирует). */
const CLIENT_MAX_SIDE = PHOTO_LIMITS.FULL_MAX_SIDE;

/**
 * Уменьшает фото в браузере: снимок телефона 4–8 МБ становится JPEG около 0,5 МБ, и отправка
 * по мобильной сети идёт в разы быстрее. Поворот по EXIF применяет сам браузер при декодировании.
 * Если браузер не умеет (нет createImageBitmap) или фото и так маленькое — файл остаётся как есть.
 */
async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function' || file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CLIENT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Поле «Фото» (до 5 штук, JPG, PNG, WebP). Без JS — обычный выбор файлов; с JS фото
 * уменьшаются сразу после выбора и показано, сколько выбрано.
 */
export function PhotoInput({ label = 'Фото' }: { label?: string }) {
  const id = useId();
  const [status, setStatus] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      setStatus(null);
      return;
    }
    if (files.length > PHOTO_LIMITS.PER_UPLOAD) {
      setStatus(`Выбрано ${files.length}: можно не больше ${PHOTO_LIMITS.PER_UPLOAD} фото.`);
      return;
    }
    setStatus('Готовим фото…');
    const shrunk = await Promise.all(files.map(shrink));
    // Подменить файлы в поле можно не во всех браузерах; тогда уйдут исходные.
    try {
      const transfer = new DataTransfer();
      for (const file of shrunk) transfer.items.add(file);
      input.files = transfer.files;
    } catch {
      /* исходные файлы */
    }
    setStatus(`Выбрано фото: ${files.length}`);
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}{' '}
        <span className="font-normal text-ink-soft">
          (необязательно, до {PHOTO_LIMITS.PER_UPLOAD} шт., JPG, PNG, WebP)
        </span>
      </label>
      <input
        id={id}
        type="file"
        name="photos"
        multiple
        accept={PHOTO_ACCEPT}
        onChange={onChange}
        aria-describedby={status ? `${id}-status` : undefined}
        className="mt-1.5 block w-full text-sm text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[10px] file:border file:border-line file:bg-surface file:px-4 file:font-semibold file:text-ink hover:file:border-ink/30"
      />
      {status ? (
        <p id={`${id}-status`} aria-live="polite" className="mt-1.5 text-xs text-ink-soft">
          {status}
        </p>
      ) : null}
    </div>
  );
}
