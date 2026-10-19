'use client';

import { ACCOUNT_LIMITS, AVATAR_MIME_TYPES } from '@agregator/shared';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { UserAvatar } from './user-avatar';

type Status = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'error'; text: string };

/**
 * Фото профиля: выбор файла или перетаскивание, предпросмотр, загрузка и удаление. Проверка
 * размера и типа здесь только для быстрого ответа; окончательно файл проверяет и перекодирует API.
 */
export function AvatarUploader({
  name,
  avatarVersion,
}: {
  name: string;
  avatarVersion: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const busy = status.kind === 'busy';

  async function upload(file: File) {
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setStatus({ kind: 'error', text: 'Подойдёт фото в формате JPG, PNG или WebP' });
      return;
    }
    if (file.size > ACCOUNT_LIMITS.AVATAR_MAX_BYTES) {
      setStatus({ kind: 'error', text: 'Файл больше 5 МБ. Выберите фото поменьше.' });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStatus({ kind: 'busy', text: 'Загружаем фото…' });
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch('/account/avatar', { method: 'POST', body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Не удалось загрузить фото');
      }
      setStatus({ kind: 'idle' });
      router.refresh();
    } catch (error) {
      setPreview(null);
      setStatus({
        kind: 'error',
        text: error instanceof TypeError ? 'Нет связи с сервером' : (error as Error).message,
      });
    } finally {
      URL.revokeObjectURL(url);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setStatus({ kind: 'busy', text: 'Удаляем фото…' });
    try {
      const res = await fetch('/account/avatar', { method: 'DELETE' });
      if (!res.ok) throw new Error('Не удалось удалить фото');
      setPreview(null);
      setStatus({ kind: 'idle' });
      router.refresh();
    } catch (error) {
      setStatus({ kind: 'error', text: (error as Error).message });
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && !busy) void upload(file);
      }}
      className={`flex flex-col items-start gap-5 rounded-[12px] border border-dashed p-5 transition-colors duration-150 sm:flex-row sm:items-center ${
        dragging ? 'border-accent bg-accent-tint' : 'border-line bg-canvas'
      }`}
    >
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-24 rounded-full object-cover" />
        ) : (
          <UserAvatar name={name} avatarVersion={avatarVersion} className="size-24 text-3xl" />
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/40">
            <span className="size-6 animate-spin rounded-full border-2 border-canvas border-t-transparent motion-reduce:animate-none" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="font-semibold">Фото профиля</p>
        <p className="mt-1 text-sm text-ink-soft">
          JPG, PNG или WebP до 5 МБ. Можно перетащить файл сюда. Данные о месте съёмки удаляются.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={AVATAR_MIME_TYPES.join(',')}
            className="peer sr-only"
            id="avatar-file"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <label
            htmlFor="avatar-file"
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.97] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            {avatarVersion ? 'Заменить фото' : 'Загрузить фото'}
          </label>
          {avatarVersion ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink-soft/50 disabled:opacity-60"
            >
              Удалить
            </button>
          ) : null}
        </div>
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 min-h-5 text-sm ${status.kind === 'error' ? 'text-accent' : 'text-ink-soft'}`}
        >
          {status.kind === 'idle' ? '' : status.text}
        </p>
      </div>
    </div>
  );
}
