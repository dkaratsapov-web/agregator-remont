import { ALLOW_NON_TTY, linkOutputAllowed, positional } from './reset-link-output';

describe('password reset link output', () => {
  it('prints only to a terminal unless explicitly allowed', () => {
    expect(linkOutputAllowed(true, ['a@b.ru'])).toBe(true);
    expect(linkOutputAllowed(false, ['a@b.ru'])).toBe(false);
    expect(linkOutputAllowed(undefined, ['a@b.ru'])).toBe(false);
    expect(linkOutputAllowed(false, ['a@b.ru', ALLOW_NON_TTY])).toBe(true);
  });

  it('flags are not taken for the email or the site', () => {
    expect(positional(['--allow-non-tty', 'a@b.ru', 'https://site'])).toEqual([
      'a@b.ru',
      'https://site',
    ]);
  });
});
