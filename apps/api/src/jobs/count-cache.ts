/**
 * Число «всего найдено» для каталога. На 100 000 заказов `count(*)` — полный проход таблицы
 * (~39 мс), и он, а не выдача страницы, загружал Postgres в нагрузочном замере
 * (docs/audit/LOAD_TEST_REPORT.md, вывод 3).
 *
 * Небольшое число (меньше `min`) считается заново на каждый запрос: только что опубликованный
 * заказ сразу виден в числе, а на объёмах закрытой беты поведение не меняется. Большое число
 * хранится `ttlMs` — расхождение на несколько заказов в «12 480 найдено» незаметно. Одновременные
 * запросы с теми же фильтрами ждут один подсчёт. Ключ — фильтры запроса без страницы и порядка.
 */
export interface CountCacheOptions {
  /** С какого числа кэшировать. */
  min: number;
  /** Сколько хранить; 0 — кэш выключен. */
  ttlMs: number;
  /** Сколько разных наборов фильтров держать в памяти. */
  maxKeys: number;
}

interface Entry {
  value: Promise<number>;
  /** До какого времени число годно; Infinity — подсчёт ещё идёт. */
  until: number;
}

export class CountCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly options: CountCacheOptions,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string, count: () => Promise<number>): Promise<number> {
    if (this.options.ttlMs <= 0) return count();
    const hit = this.entries.get(key);
    if (hit && hit.until > this.now()) return hit.value;

    const entry: Entry = { value: count(), until: Infinity };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.options.maxKeys) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
    entry.value.then(
      (total) => {
        if (this.entries.get(key) !== entry) return;
        if (total < this.options.min) this.entries.delete(key);
        else entry.until = this.now() + this.options.ttlMs;
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return entry.value;
  }
}
