import { emailSha256, isAdminEmail } from './admins';

describe('admin emails', () => {
  it('hashes a normalized email', () => {
    expect(emailSha256(' Owner@Example.RU ')).toBe(emailSha256('owner@example.ru'));
    expect(emailSha256('owner@example.ru')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts emails from ADMIN_EMAILS, case-insensitively', () => {
    const env = { ADMIN_EMAILS: ' boss@example.ru , other@example.ru' };
    expect(isAdminEmail('Boss@Example.ru', env)).toBe(true);
    expect(isAdminEmail('other@example.ru', env)).toBe(true);
    expect(isAdminEmail('user@example.ru', env)).toBe(false);
  });

  it('nobody is an admin by default', () => {
    expect(isAdminEmail('user@example.ru', {})).toBe(false);
    expect(isAdminEmail('', { ADMIN_EMAILS: '' })).toBe(false);
  });
});
