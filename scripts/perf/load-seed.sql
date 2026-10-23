-- Данные для нагрузочного замера (scripts/perf/load-test.mjs, docs/audit/LOAD_TEST_REPORT.md).
-- Только для отдельной пустой базы после prisma migrate deploy:
--   psql "$LOAD_DATABASE_URL" -v jobs=100000 -f scripts/perf/load-seed.sql
-- 300 заказчиков с сеансами (токен виртуального пользователя i: 'L' и номер, дополненный нулями
-- до 43 символов), 3000 мастеров, :jobs заказов (30 % открытых, 50 вариантов города, у полов —
-- площадь в анкете), в среднем 1,5 отклика на заказ, по 20 уведомлений на заказчика.
-- Пароли недостижимые: войти ими нельзя, только сеансом из этого файла.
\set ON_ERROR_STOP on

INSERT INTO users (id, email, password_hash, name, role, updated_at)
SELECT 'loadc' || g, 'load-customer-' || g || '@example.invalid', 'x', 'Заказчик ' || g,
  'CUSTOMER', now()
FROM generate_series(1, 300) g;

INSERT INTO users (id, email, password_hash, name, role, updated_at)
SELECT 'loadm' || g, 'load-master-' || g || '@example.invalid', 'x', 'Мастер ' || g,
  'CONTRACTOR', now()
FROM generate_series(1, 3000) g;

INSERT INTO sessions (id, token_hash, user_id, expires_at, device)
SELECT 'loads' || g,
  encode(sha256(convert_to('L' || lpad(g::text, 42, '0'), 'UTF8')), 'hex'),
  'loadc' || g, now() + interval '30 days', 'load test'
FROM generate_series(1, 300) g;

WITH words AS (
  SELECT ARRAY['плитка','ламинат','электрика','сантехника','штукатурка','обои','потолок',
    'кровля','окна','двери','покраска','стяжка','утепление','демонтаж','дизайн','кухня',
    'ванная','балкон','фасад','паркет'] AS w,
    ARRAY['Москва','Казань','Самара','Тула','Пермь','Омск','Уфа','Тверь','Сочи','Курск'] AS c,
    ARRAY['TILING','FLOORING','ELECTRICAL','PLUMBING','FINISHING','ROOFING','WINDOWS_DOORS',
      'DESIGN','OTHER'] AS k
)
INSERT INTO jobs (id, title, description, category, city, status, owner_id, details,
  budget_min, budget_max, created_at, updated_at)
SELECT 'loadj' || g,
  initcap(w[1 + g % 20]) || ' и ' || w[1 + (g / 7) % 20] || ', заказ ' || g,
  'Нужно сделать: ' || w[1 + (g / 3) % 20] || ', ' || w[1 + (g / 11) % 20] ||
    '. Площадь около ' || (10 + g % 90) || ' м², материалы ' ||
    CASE WHEN g % 2 = 0 THEN 'есть' ELSE 'нужно купить' END || '.',
  k[1 + g % 9]::"JobCategory",
  c[1 + g % 10] || CASE WHEN g % 5 = 0 THEN '' ELSE ' ' || (g % 5) END,
  CASE WHEN g % 10 < 3 THEN 'OPEN' WHEN g % 10 < 5 THEN 'IN_PROGRESS' ELSE 'CLOSED' END::"JobStatus",
  'loadc' || (1 + g % 300),
  CASE WHEN k[1 + g % 9] = 'FLOORING'
    THEN jsonb_build_object('covering', 'laminate', 'area', 10 + g % 90) ELSE '{}'::jsonb END,
  CASE WHEN g % 3 = 0 THEN NULL ELSE 10000 + (g % 50) * 1000 END,
  CASE WHEN g % 3 = 0 THEN NULL ELSE 30000 + (g % 50) * 2000 END,
  now() - ((g % 525600) || ' minutes')::interval, now()
FROM generate_series(1, :jobs) g, words;

-- 0–3 отклика на заказ от разных мастеров.
INSERT INTO bids (id, job_id, contractor_id, price, duration_days, comment, updated_at, created_at)
SELECT 'loadb' || g || '_' || n, 'loadj' || g, 'loadm' || (1 + (g * 7 + n * 1009) % 3000),
  5000 + ((g * 37 + n * 101) % 200) * 500, 1 + (g + n) % 30, 'Сделаю аккуратно и в срок.',
  now(), now() - ((g % 525600) || ' minutes')::interval
FROM generate_series(1, :jobs) g, generate_series(1, 3) n
WHERE n <= g % 4;

INSERT INTO notifications (id, user_id, job_id, kind, data, created_at)
SELECT 'loadn' || u || '_' || i, 'loadc' || u, 'loadj' || (u + 300 * i), 'BID_RECEIVED', '{}',
  now() - (i || ' hours')::interval
FROM generate_series(1, 300) u, generate_series(1, 20) i
WHERE u + 300 * i <= :jobs;

ANALYZE users, sessions, jobs, bids, notifications;
