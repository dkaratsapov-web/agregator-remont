import { SERVICE_CITIES, SERVICE_REGIONS, SERVICE_REGION_LABELS } from '@agregator/shared';

/** Города зоны обслуживания для выпадающего поля: Москва и МО, Петербург и ЛО. */
export const CITY_OPTIONS = SERVICE_CITIES.map((city) => ({
  value: city.name,
  label: city.name,
  group: city.region,
}));

export const CITY_GROUPS = SERVICE_REGIONS.map((region) => ({
  id: region,
  label: SERVICE_REGION_LABELS[region],
}));
