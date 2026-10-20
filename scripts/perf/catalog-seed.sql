-- 100 000 заказов: 30 % открытых, 50 городов, названия и описания из словаря работ.
WITH words AS (
  SELECT ARRAY['плитка','ламинат','электрика','сантехника','штукатурка','обои','потолок',
    'кровля','окна','двери','покраска','стяжка','утепление','демонтаж','дизайн','кухня',
    'ванная','балкон','фасад','паркет'] AS w,
    ARRAY['Москва','Казань','Самара','Тула','Пермь','Омск','Уфа','Тверь','Сочи','Курск'] AS c,
    ARRAY['TILING','FLOORING','ELECTRICAL','PLUMBING','FINISHING','ROOFING','WINDOWS_DOORS',
      'DESIGN','OTHER'] AS k
)
INSERT INTO jobs (id, title, description, category, city, status, created_at, updated_at)
SELECT 'perf' || g,
  initcap(w[1 + g % 20]) || ' и ' || w[1 + (g / 7) % 20] || ', заказ ' || g,
  'Нужно сделать: ' || w[1 + (g / 3) % 20] || ', ' || w[1 + (g / 11) % 20] ||
    '. Площадь около ' || (10 + g % 90) || ' м², материалы ' ||
    CASE WHEN g % 2 = 0 THEN 'есть' ELSE 'нужно купить' END || '.',
  k[1 + g % 9]::"JobCategory",
  c[1 + g % 10] || CASE WHEN g % 5 = 0 THEN '' ELSE ' ' || (g % 5) END,
  CASE WHEN g % 10 < 3 THEN 'OPEN' WHEN g % 10 < 5 THEN 'IN_PROGRESS' ELSE 'CLOSED' END::"JobStatus",
  now() - (g || ' minutes')::interval, now()
FROM generate_series(1, 100000) g, words;
ANALYZE jobs;
