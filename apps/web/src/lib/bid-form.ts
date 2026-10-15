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

export type ParsedBidForm =
  | { ok: true; input: BidInput; values: BidFormValues }
  | { ok: false; error: string; values: BidFormValues };

/** Разбор формы отклика; окончательные правила проверяет API. */
export function parseBidForm(form: FormData): ParsedBidForm {
  const values: BidFormValues = {
    price: text(form, 'price', 20),
    durationDays: text(form, 'durationDays', 10),
    comment: text(form, 'comment', BID_LIMITS.COMMENT_MAX + 1),
  };
  const price = parseBudget(values.price);
  if (price === null || price === 'invalid') {
    return { ok: false, error: 'Укажите цену целым числом рублей, например 38 000.', values };
  }
  const durationRaw = values.durationDays.trim();
  let durationDays: number | null = null;
  if (durationRaw !== '') {
    if (
      !/^\d{1,3}$/.test(durationRaw) ||
      Number(durationRaw) < 1 ||
      Number(durationRaw) > BID_LIMITS.DURATION_MAX_DAYS
    ) {
      return {
        ok: false,
        error: `Срок укажите в днях: от 1 до ${BID_LIMITS.DURATION_MAX_DAYS}.`,
        values,
      };
    }
    durationDays = Number(durationRaw);
  }
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
  | { ok: false; error: string; values: ProfileFormValues };

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
  if (!categories.every(isJobCategory)) {
    return { ok: false, error: 'Выберите категории из списка.', values };
  }
  const experienceRaw = values.experienceYears.trim();
  let experienceYears: number | null = null;
  if (experienceRaw !== '') {
    if (
      !/^\d{1,2}$/.test(experienceRaw) ||
      Number(experienceRaw) > PROFILE_LIMITS.EXPERIENCE_MAX_YEARS
    ) {
      return { ok: false, error: 'Опыт укажите целым числом лет.', values };
    }
    experienceYears = Number(experienceRaw);
  }
  return {
    ok: true,
    values,
    input: {
      about: values.about,
      categories: [...new Set(categories as JobCategory[])],
      cities: splitCities(values.cities),
      experienceYears,
    },
  };
}
