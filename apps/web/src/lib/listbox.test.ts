import {
  findServiceCity,
  isServiceCity,
  normalizeCityName,
  SERVICE_CITIES,
  SERVICE_CITY_NAMES,
} from '@agregator/shared';
import { describe, expect, it } from 'vitest';
import {
  buildRows,
  filterOptions,
  findOptionByLabel,
  foldText,
  groupItems,
  isBrowsing,
  moveActiveIndex,
  normalizeQuery,
  rowStates,
  splitHighlight,
  typeaheadIndex,
  type ListOption,
} from './listbox';

const cities: ListOption[] = [
  { value: 'Москва', label: 'Москва', group: 'MOW' },
  { value: 'Королёв', label: 'Королёв', group: 'MOW' },
  { value: 'Ногинск', label: 'Ногинск', group: 'MOW' },
  { value: 'Сергиев Посад', label: 'Сергиев Посад', group: 'MOW' },
  { value: 'Павловский Посад', label: 'Павловский Посад', group: 'MOW' },
  { value: 'Санкт-Петербург', label: 'Санкт-Петербург', group: 'SPE' },
  { value: 'Новое Девяткино', label: 'Новое Девяткино', group: 'SPE' },
  { value: 'Янино-1', label: 'Янино-1', group: 'SPE' },
];

describe('text folding', () => {
  it('ignores case and ё/е without changing length', () => {
    expect(foldText('Королёв')).toBe('королев');
    expect(foldText('ЁЛКА').length).toBe(4);
    expect(normalizeQuery('  санкт - петербург  ')).toBe('санкт-петербург');
    expect(normalizeQuery('новое   девяткино')).toBe('новое девяткино');
  });
});

describe('filterOptions', () => {
  it('returns everything for an empty query', () => {
    expect(filterOptions(cities, '   ')).toHaveLength(cities.length);
    expect(filterOptions(cities, '', 3).map((item) => item.option.value)).toEqual([
      'Москва',
      'Королёв',
      'Ногинск',
    ]);
  });

  it('matches regardless of case and ё/е and reports the match range', () => {
    const [match] = filterOptions(cities, 'КОРОЛЕВ');
    expect(match.option.value).toBe('Королёв');
    expect(match.match).toEqual([0, 7]);
    expect(filterOptions(cities, 'королёв')[0].option.value).toBe('Королёв');
  });

  it('ranks prefix, then word start, then substring matches', () => {
    expect(filterOptions(cities, 'по').map((item) => item.option.value)).toEqual([
      'Сергиев Посад',
      'Павловский Посад',
    ]);
    expect(filterOptions(cities, 'ин').map((item) => item.option.value)).toEqual([
      'Ногинск',
      'Новое Девяткино',
      'Янино-1',
    ]);
    expect(filterOptions(cities, 'се').map((item) => item.option.value)).toEqual(['Сергиев Посад']);
  });

  it('matches after hyphens and respects the limit', () => {
    expect(filterOptions(cities, 'петер').map((item) => item.option.value)).toEqual([
      'Санкт-Петербург',
    ]);
    expect(filterOptions(cities, 'а', 2)).toHaveLength(2);
    expect(filterOptions(cities, 'казань')).toEqual([]);
  });
});

describe('findOptionByLabel', () => {
  it('finds the canonical option for loosely typed text', () => {
    expect(findOptionByLabel(cities, ' королев ')?.value).toBe('Королёв');
    expect(findOptionByLabel(cities, 'санкт - петербург')?.value).toBe('Санкт-Петербург');
    expect(findOptionByLabel(cities, 'Королё')).toBeNull();
    expect(findOptionByLabel(cities, '')).toBeNull();
  });
});

describe('splitHighlight', () => {
  it('splits the label around the match', () => {
    expect(splitHighlight('Сергиев Посад', [8, 10])).toEqual([
      { text: 'Сергиев ', hit: false },
      { text: 'По', hit: true },
      { text: 'сад', hit: false },
    ]);
    expect(splitHighlight('Москва', [0, 6])).toEqual([{ text: 'Москва', hit: true }]);
    expect(splitHighlight('Москва', null)).toEqual([{ text: 'Москва', hit: false }]);
  });
});

describe('moveActiveIndex', () => {
  const options = [{}, { disabled: true }, {}, {}, { disabled: true }];

  it('skips disabled options and stops at the edges', () => {
    expect(moveActiveIndex(options, 0, 'next')).toBe(2);
    expect(moveActiveIndex(options, 3, 'next')).toBe(3);
    expect(moveActiveIndex(options, 2, 'prev')).toBe(0);
    expect(moveActiveIndex(options, 0, 'prev')).toBe(0);
    expect(moveActiveIndex(options, 2, 'first')).toBe(0);
    expect(moveActiveIndex(options, 0, 'last')).toBe(3);
  });

  it('starts from an edge when nothing is active', () => {
    expect(moveActiveIndex(options, -1, 'next')).toBe(0);
    expect(moveActiveIndex(options, -1, 'prev')).toBe(3);
  });

  it('pages by pageSize', () => {
    const many = Array.from({ length: 20 }, () => ({}));
    expect(moveActiveIndex(many, 0, 'pageDown', 8)).toBe(8);
    expect(moveActiveIndex(many, 15, 'pageDown', 8)).toBe(19);
    expect(moveActiveIndex(many, 5, 'pageUp', 8)).toBe(0);
  });

  it('returns -1 when every option is disabled', () => {
    expect(moveActiveIndex([{ disabled: true }], 0, 'next')).toBe(-1);
  });
});

describe('typeaheadIndex', () => {
  const options: ListOption[] = [
    { value: 'a', label: 'Квартира' },
    { value: 'b', label: 'Дом' },
    { value: 'c', label: 'Коммерция' },
    { value: 'd', label: 'Дача', disabled: true },
    { value: 'e', label: 'Ёлка' },
  ];

  it('jumps to the next option starting with a letter and cycles on repeats', () => {
    expect(typeaheadIndex(options, 'к', -1)).toBe(0);
    expect(typeaheadIndex(options, 'к', 0)).toBe(2);
    expect(typeaheadIndex(options, 'кк', 2)).toBe(0);
    expect(typeaheadIndex(options, 'д', 1)).toBe(1);
  });

  it('matches whole prefixes, ignores disabled options and ё/е', () => {
    expect(typeaheadIndex(options, 'ком', 0)).toBe(2);
    expect(typeaheadIndex(options, 'да', 0)).toBe(-1);
    expect(typeaheadIndex(options, 'е', 0)).toBe(4);
    expect(typeaheadIndex(options, '', 0)).toBe(-1);
  });
});

describe('groupItems', () => {
  it('keeps group order and puts ungrouped items first', () => {
    const items = filterOptions([...cities, { value: 'x', label: 'Без группы' }], '');
    const grouped = groupItems(items, [
      { id: 'SPE', label: 'Петербург' },
      { id: 'MOW', label: 'Москва' },
    ]);
    expect(grouped.map((g) => [g.group?.id ?? null, g.items.length])).toEqual([
      [null, 1],
      ['SPE', 3],
      ['MOW', 5],
    ]);
  });
});

describe('service areas', () => {
  it('has unique names and starts each region with its main city', () => {
    expect(new Set(SERVICE_CITY_NAMES).size).toBe(SERVICE_CITY_NAMES.length);
    const keys = SERVICE_CITIES.map((city) => normalizeCityName(city.name));
    expect(new Set(keys).size).toBe(keys.length);
    expect(SERVICE_CITIES[0]).toEqual({ name: 'Москва', region: 'MOW' });
    const spb = SERVICE_CITIES.findIndex((city) => city.region === 'SPE');
    expect(SERVICE_CITIES[spb].name).toBe('Санкт-Петербург');
    expect(SERVICE_CITIES.slice(spb).every((city) => city.region === 'SPE')).toBe(true);
  });

  it('covers Moscow Oblast and Leningrad Oblast towns', () => {
    for (const name of ['Химки', 'Подольск', 'Сергиев Посад', 'Коммунарка', 'Нахабино']) {
      expect(findServiceCity(name)?.region).toBe('MOW');
    }
    for (const name of ['Гатчина', 'Мурино', 'Кудрово', 'Пушкин', 'Янино-1', 'Отрадное']) {
      expect(findServiceCity(name)?.region).toBe('SPE');
    }
    expect(SERVICE_CITIES.filter((city) => city.region === 'MOW').length).toBeGreaterThan(90);
    expect(SERVICE_CITIES.filter((city) => city.region === 'SPE').length).toBeGreaterThan(60);
  });

  it('finds cities regardless of case and ё/е, and rejects others', () => {
    expect(findServiceCity('  щелково ')?.name).toBe('Щёлково');
    expect(findServiceCity('САНКТ-ПЕТЕРБУРГ')?.name).toBe('Санкт-Петербург');
    expect(findServiceCity('Казань')).toBeNull();
    expect(isServiceCity('Химки')).toBe(true);
    expect(isServiceCity('химки')).toBe(false);
    expect(isServiceCity(42)).toBe(false);
  });

  it('has no em dashes in names', () => {
    expect(SERVICE_CITY_NAMES.join(' ')).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('buildRows', () => {
  const groups = [
    { id: 'MOW', label: 'Москва и Московская область' },
    { id: 'SPE', label: 'Санкт-Петербург и Ленинградская область' },
  ];
  const labels = (rows: ReturnType<typeof buildRows>) =>
    rows.map((row) => (row.kind === 'group' ? `[${row.group.id}]` : row.option.label));

  it('without a query shows only collapsed group headers with their sizes', () => {
    const rows = buildRows(cities, groups, '  ', new Set());
    expect(rows).toEqual([
      { kind: 'group', group: groups[0], expanded: false, size: 5 },
      { kind: 'group', group: groups[1], expanded: false, size: 3 },
    ]);
    expect(isBrowsing(groups, '')).toBe(true);
  });

  it('an expanded group shows its options right after its header', () => {
    expect(labels(buildRows(cities, groups, '', new Set(['SPE'])))).toEqual([
      '[MOW]',
      '[SPE]',
      'Санкт-Петербург',
      'Новое Девяткино',
      'Янино-1',
    ]);
  });

  it('with a query lists all matches across groups, no header rows', () => {
    expect(labels(buildRows(cities, groups, 'посад', new Set()))).toEqual([
      'Сергиев Посад',
      'Павловский Посад',
    ]);
    expect(isBrowsing(groups, 'посад')).toBe(false);
  });

  it('options without a group stay visible; no groups means a plain list', () => {
    const loose = [{ value: 'Другой', label: 'Другой' }, ...cities];
    expect(labels(buildRows(loose, groups, '', new Set()))).toEqual(['Другой', '[MOW]', '[SPE]']);
    expect(labels(buildRows(cities.slice(0, 2), undefined, '', new Set()))).toEqual([
      'Москва',
      'Королёв',
    ]);
  });

  it('headers are always navigable, disabled options are skipped', () => {
    const rows = buildRows(
      [{ value: 'x', label: 'X', group: 'MOW', disabled: true }, ...cities],
      groups,
      '',
      new Set(['MOW']),
    );
    const states = rowStates(rows);
    expect(states[0]).toEqual({ disabled: false });
    expect(states[1]).toEqual({ disabled: true });
    expect(moveActiveIndex(states, 0, 'next')).toBe(2);
  });
});
