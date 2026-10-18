import { deviceLabel } from './device';

describe('deviceLabel', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'Chrome, Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari, iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 YaBrowser/25.8 Safari/537.36',
      'Яндекс Браузер, Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36',
      'Chrome, Android',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Gecko/20100101 Firefox/131.0',
      'Firefox, macOS',
    ],
    ['curl/8.0', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (ua, expected) => {
    expect(deviceLabel(ua)).toBe(expected);
  });
});
