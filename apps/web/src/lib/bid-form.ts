import {
  BID_LIMITS,
  isJobCategory,
  PROFILE_LIMITS,
  type BidInput,
  type ContractorProfileInput,
  type JobCategory,
} from '@agregator/shared';
import { parseBudget } from './job-form';

const text = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

export type BidFormValues = Record<'price' | 'durationDays' | 'comment', string>;

/** Ошибки по полям формы: показываются под полем, первое поле с ошибкой получает фокус. */
export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

export type ParsedBidForm =
  | { ok: true; input: BidInput; values: BidFormValues }
  | {
      ok: false;
      error: string;
      fields: FieldErrors<keyof BidFormValues>;
      values: BidFormValues;
    };

/** Итог проверки: первая ошибка — общий текст над формой, все — у своих полей. */
function failed<K extends string>(fields: FieldErrors<K>): string | null {
  return Object.values<string | undefined>(fields).find(Boolean) ?? null;
}

/** Разбор формы отклика; окончательные правила проверяет API. */
export function parseBidForm(form: FormData): ParsedBidForm {
  const values: BidFormValues = {
    price: text(form, 'price', 20),
    durationDays: text(form, 'durationDays', 10),
    comment: text(form, 'comment', BID_LIMITS.COMMENT_MAX + 1),
  };
  const fields: FieldErrors<keyof BidFormValues> = {};
  const price = parseBudget(values.price);
  if (price === null || price === 'invalid') {
    fields.price = 'Укажите цену целым числом рублей, например 38 000.';
  }
  const durationRaw = values.durationDays.trim();
  if (
    durationRaw !== '' &&
    (!/^\d{1,3}$/.test(durationRaw) ||
      Number(durationRaw) < 1 ||
      Number(durationRaw) > BID_LIMITS.DURATION_MAX_DAYS)
  ) {
    fields.durationDays = `Срок укажите в днях: от 1 до ${BID_LIMITS.DURATION_MAX_DAYS}.`;
  }
  const commentLength = values.comment.trim().length;
  if (commentLength < BID_LIMITS.COMMENT_MIN || commentLength > BID_LIMITS.COMMENT_MAX) {
    fields.comment = `Комментарий: от ${BID_LIMITS.COMMENT_MIN} до ${BID_LIMITS.COMMENT_MAX} символов.`;
  }
  const error = failed(fields);
  if (error || price === null || price === 'invalid') {
    return { ok: false, error: error ?? '', fields, values };
  }
  const durationDays = durationRaw === '' ? null : Number(durationRaw);
  return { ok: true, values, input: { price, durationDays, comment: values.comment } };
}

export interface ProfileFormValues {
  about: string;
  categories: string[];
  cities: string;
  experienceYears: string;
}

export type ParsedProfileForm =
  | { ok: true; input: ContractorProfileInput; values: ProfileFormValues }
  | {
      ok: false;
      error: string;
      fields: FieldErrors<keyof ProfileFormValues>;
      values: ProfileFormValues;
    };

/** Города вводятся через запятую или с новой строки. */
export function splitCities(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((city) => city.trim())
    .filter(Boolean);
}

export function parseProfileForm(form: FormData): ParsedProfileForm {
  const categories = form
    .getAll('categories')
    .filter((v): v is string => typeof v === 'string')
    .slice(0, PROFILE_LIMITS.CATEGORIES_MAX + 1);
  const values: ProfileFormValues = {
    about: text(form, 'about', PROFILE_LIMITS.ABOUT_MAX + 1),
    categories,
    cities: text(form, 'cities', (PROFILE_LIMITS.CITY_MAX + 2) * PROFILE_LIMITS.CITIES_MAX),
    experienceYears: text(form, 'experienceYears', 5),
  };
  const fields: FieldErrors<keyof ProfileFormValues> = {};
  if (!categories.every(isJobCategory)) fields.categories = 'Выберите категории из списка.';
  const cities = splitCities(values.cities);
  if (
    cities.length > PROFILE_LIMITS.CITIES_MAX ||
    cities.some((c) => c.length < PROFILE_LIMITS.CITY_MIN || c.length > PROFILE_LIMITS.CITY_MAX)
  ) {
    fields.cities = `До ${PROFILE_LIMITS.CITIES_MAX} городов, каждый от ${PROFILE_LIMITS.CITY_MIN} до ${PROFILE_LIMITS.CITY_MAX} символов.`;
  }
  const experienceRaw = values.experienceYears.trim();
  if (
    experienceRaw !== '' &&
    (!/^\d{1,2}$/.test(experienceRaw) ||
      Number(experienceRaw) > PROFILE_LIMITS.EXPERIENCE_MAX_YEARS)
  ) {
    fields.experienceYears = 'Опыт укажите целым числом лет.';
  }
  const error = failed(fields);
  if (error) return { ok: false, error, fields, values };
  const experienceYears = experienceRaw === '' ? null : Number(experienceRaw);
  return {
    ok: true,
    values,
    input: {
      about: values.about,
      categories: [...new Set(categories as JobCategory[])],
      cities,
      experienceYears,
    },
  };
}
