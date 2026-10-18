/**
 * Короткое название устройства для списка входов: «Chrome, Windows». Только для показа самому
 * пользователю; User-Agent целиком не хранится. null, если браузер не распознан.
 */
const BROWSERS: [RegExp, string][] = [
  [/YaBrowser\//, 'Яндекс Браузер'],
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function deviceLabel(userAgent: string | undefined | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (!browser && !system) return null;
  return [browser, system].filter(Boolean).join(', ');
}
