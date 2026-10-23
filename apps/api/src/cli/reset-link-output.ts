/**
 * Куда можно печатать ссылку для нового пароля. Ссылка — секрет на сутки: кто её знает, тот
 * задаст пароль без старого. Поэтому только в живой терминал человека, а не в файл, журнал
 * systemd (journald), CI или конвейер, где она сохранится. Осознанный обход — --allow-non-tty.
 */
export const ALLOW_NON_TTY = '--allow-non-tty';

export function linkOutputAllowed(isTTY: boolean | undefined, args: readonly string[]): boolean {
  return isTTY === true || args.includes(ALLOW_NON_TTY);
}

/** Аргументы без флагов: email и адрес сайта. */
export const positional = (args: readonly string[]): string[] =>
  args.filter((arg) => !arg.startsWith('--'));
