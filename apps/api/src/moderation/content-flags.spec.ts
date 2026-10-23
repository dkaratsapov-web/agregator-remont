import { contactsWarning, detectContacts } from '@agregator/shared';

describe('detectContacts', () => {
  it.each([
    ['+7 999 123-45-67', ['PHONE']],
    ['8(912)3456789', ['PHONE']],
    ['звоните 89123456789', ['PHONE']],
    ['9123456789', ['PHONE']],
    ['почта ivan.petrov@yandex.ru', ['EMAIL']],
    ['смотрите www.example.com', ['LINK']],
    ['мой сайт master-remont.ru', ['LINK']],
    ['https://t.me/master', ['LINK', 'MESSENGER']],
    ['пишите в WhatsApp', ['MESSENGER']],
    ['в телегу @master_remont', ['MESSENGER']],
    ['вотсап по номеру', ['MESSENGER']],
  ])('%s → %j', (text, kinds) => {
    expect(detectContacts(text)).toEqual(kinds);
  });

  it.each([
    'Цена 180 000 ₽, срок 10 дней',
    'Площадь 54 м², высота 2,7 м',
    'Бюджет 1 500 000 рублей',
    'Начнём 15.11.2026 в 9:00',
    'Плитка 60x120, затирка Litokol',
    'Смеситель Grohe, артикул 32 168 000',
    'Договор № 2026-118',
    'Работы по ГОСТ 31357-2007',
    'Подложка 3 мм, ламинат 33 класса',
    'макс. нагрузка 150 кг',
  ])('no contacts: %s', (text) => {
    expect(detectContacts(text)).toEqual([]);
  });

  it('the warning names what was found', () => {
    expect(contactsWarning([])).toBeNull();
    expect(contactsWarning(['PHONE', 'LINK'])).toContain('телефон, ссылка');
  });
});
