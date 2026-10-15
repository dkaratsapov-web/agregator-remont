import type { Prisma } from '@prisma/client';

type DemoJob = Omit<Prisma.JobCreateInput, 'createdAt'> & { id: string; daysAgo: number };

/** Вымышленные демонстрационные заказы. Не содержат персональных данных. */
export const DEMO_JOBS: DemoJob[] = [
  {
    id: 'demo-job-01',
    title: 'Ремонт однокомнатной квартиры под ключ',
    description:
      'Квартира 38 м² в новостройке, бетон без отделки. Нужны черновые и чистовые работы: стяжка, штукатурка, электрика, сантехника, укладка ламината и плитки в санузле. Дизайн-проект есть. Материалы закупаем совместно с подрядчиком.',
    category: 'REPAIR_TURNKEY',
    city: 'Москва',
    budgetMin: 900_000,
    budgetMax: 1_200_000,
    status: 'OPEN',
    daysAgo: 0,
  },
  {
    id: 'demo-job-02',
    title: 'Замена смесителя и сифона на кухне',
    description:
      'Подтекает смеситель, нужно заменить его и сифон под мойкой. Новый смеситель уже куплен. Желательно выполнить в выходные.',
    category: 'PLUMBING',
    city: 'Санкт-Петербург',
    budgetMin: 2_500,
    budgetMax: 4_000,
    status: 'OPEN',
    daysAgo: 1,
  },
  {
    id: 'demo-job-03',
    title: 'Полная замена электропроводки в двушке',
    description:
      'Дом 1975 года, алюминиевая проводка. Требуется демонтаж старой проводки, новая разводка медным кабелем, сборка щита с УЗО и автоматами, 24 розетки и 10 выключателей. Нужен акт выполненных работ.',
    category: 'ELECTRICAL',
    city: 'Казань',
    budgetMin: 120_000,
    budgetMax: 160_000,
    status: 'OPEN',
    daysAgo: 1,
  },
  {
    id: 'demo-job-04',
    title: 'Укладка керамогранита в ванной',
    description:
      'Площадь стен 22 м², пола 4 м². Формат плитки 60×120. Требуется гидроизоляция пола и запил под 45° на внешних углах.',
    category: 'TILING',
    city: 'Екатеринбург',
    budgetMin: 60_000,
    budgetMax: 85_000,
    status: 'OPEN',
    daysAgo: 2,
  },
  {
    id: 'demo-job-05',
    title: 'Покраска стен в трёх комнатах',
    description:
      'Стены уже выровнены. Нужна шлифовка, грунтовка и покраска в два слоя, общая площадь около 140 м². Краска заказчика.',
    category: 'FINISHING',
    city: 'Новосибирск',
    budgetMin: 45_000,
    budgetMax: 60_000,
    status: 'OPEN',
    daysAgo: 3,
  },
  {
    id: 'demo-job-06',
    title: 'Укладка инженерной доски',
    description:
      'Гостиная 32 м², основание: стяжка. Нужна проверка влажности, укладка на клей, монтаж плинтуса.',
    category: 'FLOORING',
    city: 'Москва',
    budgetMin: 40_000,
    budgetMax: 55_000,
    status: 'IN_PROGRESS',
    daysAgo: 4,
  },
  {
    id: 'demo-job-07',
    title: 'Ремонт кровли частного дома',
    description:
      'Металлочерепица, площадь кровли около 160 м². Протечка в районе ендовы и дымохода, нужен осмотр и локальный ремонт, при необходимости замена примыканий.',
    category: 'ROOFING',
    city: 'Краснодар',
    budgetMin: null,
    budgetMax: null,
    status: 'OPEN',
    daysAgo: 5,
  },
  {
    id: 'demo-job-08',
    title: 'Установка пяти пластиковых окон',
    description:
      'Панельный дом, 5 окон стандартного размера, нужны замер, демонтаж старых деревянных рам, монтаж по ГОСТ, откосы и отливы.',
    category: 'WINDOWS_DOORS',
    city: 'Нижний Новгород',
    budgetMin: 150_000,
    budgetMax: 190_000,
    status: 'OPEN',
    daysAgo: 6,
  },
  {
    id: 'demo-job-09',
    title: 'Дизайн-проект квартиры 75 м²',
    description:
      'Нужны обмерный план, планировочное решение, 3D-визуализации кухни-гостиной и спальни, рабочие чертежи для строителей.',
    category: 'DESIGN',
    city: 'Санкт-Петербург',
    budgetMin: 150_000,
    budgetMax: 250_000,
    status: 'OPEN',
    daysAgo: 7,
  },
  {
    id: 'demo-job-10',
    title: 'Сборка и навес кухонных шкафов',
    description:
      'Кухня из 9 модулей, фурнитура в комплекте. Нужна сборка, навес верхних шкафов, врезка мойки и варочной панели.',
    category: 'OTHER',
    city: 'Самара',
    budgetMin: 15_000,
    budgetMax: 22_000,
    status: 'OPEN',
    daysAgo: 8,
  },
  {
    id: 'demo-job-11',
    title: 'Монтаж тёплого пола в санузле',
    description:
      'Электрический тёплый пол под плитку, площадь 5 м², терморегулятор с датчиком пола. Плитка будет укладываться после.',
    category: 'ELECTRICAL',
    city: 'Ростов-на-Дону',
    budgetMin: 12_000,
    budgetMax: 18_000,
    status: 'OPEN',
    daysAgo: 9,
  },
  {
    id: 'demo-job-12',
    title: 'Разводка труб водоснабжения и канализации',
    description:
      'Санузел в новостройке: разводка полипропиленом от коллектора, установка инсталляции, подключение ванны и раковины.',
    category: 'PLUMBING',
    city: 'Уфа',
    budgetMin: 35_000,
    budgetMax: 50_000,
    status: 'OPEN',
    daysAgo: 10,
  },
  {
    id: 'demo-job-13',
    title: 'Косметический ремонт комнаты',
    description:
      'Комната 18 м²: поклейка обоев, замена плинтуса, покраска потолка. Мебель вынесем заранее.',
    category: 'FINISHING',
    city: 'Воронеж',
    budgetMin: 25_000,
    budgetMax: 35_000,
    status: 'CLOSED',
    daysAgo: 12,
  },
  {
    id: 'demo-job-14',
    title: 'Ремонт студии под сдачу',
    description:
      'Студия 26 м². Бюджетный ремонт под ключ: выравнивание стен, покраска, ламинат, санузел с душевым поддоном. Срок до 6 недель.',
    category: 'REPAIR_TURNKEY',
    city: 'Пермь',
    budgetMin: 450_000,
    budgetMax: 600_000,
    status: 'OPEN',
    daysAgo: 13,
  },
  {
    id: 'demo-job-15',
    title: 'Установка межкомнатных дверей',
    description:
      'Четыре двери с коробками и наличниками, проёмы стандартные. Требуется врезка петель и замков.',
    category: 'WINDOWS_DOORS',
    city: 'Челябинск',
    budgetMin: 16_000,
    budgetMax: 24_000,
    status: 'OPEN',
    daysAgo: 15,
  },
  {
    id: 'demo-job-16',
    title: 'Наливной пол в коттедже',
    description:
      'Первый этаж 90 м². Нужна подготовка основания и самовыравнивающаяся смесь под последующую укладку плитки.',
    category: 'FLOORING',
    city: 'Тюмень',
    budgetMin: null,
    budgetMax: 110_000,
    status: 'OPEN',
    daysAgo: 18,
  },
];
