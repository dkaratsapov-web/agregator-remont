import type { JobCategory } from './jobs';

/**
 * Анкета заказа: для каждой категории свой набор уточняющих вопросов. Вопросы описаны
 * декларативно; вложенные ветки (`followUps`) раскрываются в зависимости от ответов.
 *
 * Ответы хранятся в JobDto.details как { [id вопроса]: значение }:
 * - single: значение варианта (строка);
 * - multi: массив значений вариантов в порядке анкеты;
 * - number: число;
 * - boolean: true / false;
 * - text: строка в одну строку.
 *
 * Анкета может меняться: ответы, которых больше нет в анкете, отбрасываются при чтении
 * (validateJobDetails в режиме lenient), поэтому старые заказы остаются корректными.
 */

export type JobAnswer = string | number | boolean | string[];
export type JobDetails = Record<string, JobAnswer>;

export interface JobQuestionOption {
  value: string;
  label: string;
  /** Короткая подпись для карточки в каталоге. */
  short?: string;
}

/**
 * Условие показа. `q`: id вопроса, на который смотрим (по умолчанию родительский вопрос).
 * Вопрос показывается, только если вопрос `q` сам показан и на него есть ответ, подходящий
 * под все заданные поля: `in` (single: ответ из списка; multi: выбран хотя бы один из списка),
 * `is` (boolean), `min` / `max` (number).
 */
export interface JobQuestionCondition {
  q?: string;
  in?: readonly string[];
  is?: boolean;
  min?: number;
  max?: number;
}

interface QuestionBase {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  showIf?: JobQuestionCondition;
  followUps?: readonly JobQuestion[];
  /** Ответ показывается на карточке в каталоге; меньшее число раньше. */
  card?: number;
  /** Подпись перед числом на карточке: «Окон: 3», «Стены 22 м²». */
  cardPrefix?: string;
}

export interface SingleQuestion extends QuestionBase {
  type: 'single';
  options: readonly JobQuestionOption[];
  /** chips (по умолчанию) или выпадающий список для длинных перечней. */
  display?: 'chips' | 'select';
}

export interface MultiQuestion extends QuestionBase {
  type: 'multi';
  options: readonly JobQuestionOption[];
  /** Сколько вариантов можно выбрать; по умолчанию все. */
  maxSelected?: number;
}

export interface NumberQuestion extends QuestionBase {
  type: 'number';
  unit: string;
  min: number;
  max: number;
  /** Шаг; по умолчанию 1 (только целые). */
  step?: number;
  placeholder?: string;
}

export interface BooleanQuestion extends QuestionBase {
  type: 'boolean';
  yesLabel?: string;
  noLabel?: string;
  /** Подпись для карточки, если ответ «да». */
  cardLabel?: string;
}

export interface TextQuestion extends QuestionBase {
  type: 'text';
  maxLength?: number;
  placeholder?: string;
}

export type JobQuestion =
  SingleQuestion | MultiQuestion | NumberQuestion | BooleanQuestion | TextQuestion;

export interface JobQuestionSection {
  id: string;
  title: string;
  questions: readonly JobQuestion[];
}

export interface JobQuestionnaire {
  category: JobCategory;
  sections: readonly JobQuestionSection[];
}

export const JOB_DETAILS_LIMITS = {
  /** Максимальная длина текстового ответа по умолчанию. */
  TEXT_MAX: 200,
  /** Предел размера сериализованных ответов (JSON, байты UTF-8). */
  MAX_BYTES: 8_000,
  /** Сколько ключей вообще может прийти во входных данных. */
  MAX_KEYS: 150,
} as const;

// ---------------------------------------------------------------------------------------------
// Общие вопросы

const o = (value: string, label: string, short?: string): JobQuestionOption =>
  short ? { value, label, short } : { value, label };

const ROOMS_OPTIONS = [
  o('studio', 'Студия'),
  o('1', '1 комната', '1-комнатная'),
  o('2', '2 комнаты', '2-комнатная'),
  o('3', '3 комнаты', '3-комнатная'),
  o('4', '4 комнаты', '4-комнатная'),
  o('5plus', '5 и больше', '5+ комнат'),
];

const start = (): SingleQuestion => ({
  id: 'start',
  type: 'single',
  label: 'Когда планируете начать',
  options: [
    o('asap', 'Как можно скорее', 'Срочно'),
    o('week', 'В течение недели', 'Старт в течение недели'),
    o('month', 'В течение месяца', 'Старт в течение месяца'),
    o('later', 'Через 1-3 месяца', 'Старт через 1-3 месяца'),
    o('flexible', 'Сроки гибкие'),
  ],
});

const materials = (): SingleQuestion => ({
  id: 'materials',
  type: 'single',
  label: 'Кто закупает материалы',
  options: [
    o('customer', 'Я сам', 'Материалы заказчика'),
    o('contractor', 'Подрядчик', 'Материалы подрядчика'),
    o('together', 'Вместе: подрядчик составит список'),
  ],
  followUps: [
    {
      id: 'materialsReady',
      type: 'single',
      label: 'Материалы уже есть',
      showIf: { in: ['customer'] },
      options: [o('all', 'Да, всё куплено'), o('partly', 'Частично'), o('no', 'Ещё нет')],
    },
  ],
});

const contract = (): BooleanQuestion => ({
  id: 'contract',
  type: 'boolean',
  label: 'Нужен договор и закрывающие документы',
  hint: 'Акт выполненных работ, чек или счёт для юрлица',
  cardLabel: 'По договору',
});

// ---------------------------------------------------------------------------------------------
// Анкеты по категориям

const REPAIR_TURNKEY: JobQuestionnaire = {
  category: 'REPAIR_TURNKEY',
  sections: [
    {
      id: 'object',
      title: 'Объект',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Тип объекта',
          required: true,
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Дом или коттедж', 'Дом'),
            o('apartments', 'Апартаменты'),
            o('commercial', 'Коммерческое помещение', 'Коммерция'),
          ],
          followUps: [
            {
              id: 'houseMaterial',
              type: 'single',
              label: 'Из чего построен дом',
              showIf: { in: ['house'] },
              options: [
                o('brick', 'Кирпич'),
                o('aerated', 'Газобетон или блоки'),
                o('timber', 'Брус или каркас'),
                o('monolith', 'Монолит'),
              ],
            },
            {
              id: 'houseFloors',
              type: 'number',
              label: 'Сколько этажей',
              unit: 'эт.',
              min: 1,
              max: 5,
              showIf: { in: ['house'] },
            },
            {
              id: 'commercialPurpose',
              type: 'single',
              label: 'Назначение помещения',
              display: 'select',
              showIf: { in: ['commercial'] },
              options: [
                o('office', 'Офис'),
                o('shop', 'Магазин'),
                o('cafe', 'Кафе или ресторан'),
                o('salon', 'Салон или студия'),
                o('clinic', 'Медицинский кабинет'),
                o('warehouse', 'Склад или производство'),
              ],
            },
          ],
        },
        {
          id: 'housing',
          type: 'single',
          label: 'Рынок жилья',
          required: true,
          showIf: { q: 'objectType', in: ['apartment', 'apartments'] },
          card: 2,
          options: [o('new', 'Новостройка'), o('secondary', 'Вторичное жильё', 'Вторичка')],
          followUps: [
            {
              id: 'newState',
              type: 'single',
              label: 'В каком состоянии сдана квартира',
              required: true,
              showIf: { in: ['new'] },
              card: 3,
              options: [
                o('concrete', 'Бетон без отделки', 'Бетон'),
                o('whitebox', 'Предчистовая (white box)', 'White box'),
                o('developer', 'С отделкой от застройщика', 'Отделка застройщика'),
              ],
              followUps: [
                {
                  id: 'developerFinishPlan',
                  type: 'single',
                  label: 'Что сделать с отделкой застройщика',
                  showIf: { in: ['developer'] },
                  options: [o('full', 'Переделать полностью'), o('partial', 'Обновить частично')],
                },
              ],
            },
            {
              id: 'oldState',
              type: 'single',
              label: 'Текущее состояние',
              required: true,
              showIf: { in: ['secondary'] },
              card: 3,
              options: [
                o('old', 'Старый ремонт, нужен демонтаж', 'Старый ремонт'),
                o('liveable', 'Жилое состояние, освежить', 'Освежить'),
                o('damaged', 'После пожара или затопления'),
              ],
              followUps: [
                {
                  id: 'demolition',
                  type: 'multi',
                  label: 'Что демонтировать',
                  showIf: { in: ['old', 'damaged'] },
                  options: [
                    o('walls', 'Перегородки'),
                    o('plaster', 'Штукатурку до основания'),
                    o('floors', 'Полы и стяжку'),
                    o('tiles', 'Плитку'),
                    o('plumbing', 'Сантехнику'),
                    o('wiring', 'Проводку'),
                  ],
                },
                {
                  id: 'debrisRemoval',
                  type: 'boolean',
                  label: 'Нужен вывоз строительного мусора',
                  showIf: { in: ['old', 'damaged'] },
                },
              ],
            },
            {
              id: 'buildingType',
              type: 'single',
              label: 'Тип дома',
              display: 'select',
              showIf: { in: ['secondary'] },
              options: [
                o('stalin', 'Сталинка'),
                o('khrushchev', 'Хрущёвка'),
                o('panel', 'Панельный дом 70-80-х'),
                o('brick', 'Кирпичный дом'),
                o('modern', 'Современный монолит'),
              ],
            },
          ],
        },
        {
          id: 'area',
          type: 'number',
          label: 'Площадь',
          unit: 'м²',
          min: 5,
          max: 2000,
          required: true,
          placeholder: '54',
          card: 1,
        },
        {
          id: 'rooms',
          type: 'single',
          label: 'Количество комнат',
          showIf: { q: 'objectType', in: ['apartment', 'apartments', 'house'] },
          card: 4,
          options: ROOMS_OPTIONS,
        },
        {
          id: 'bathrooms',
          type: 'single',
          label: 'Санузлы',
          options: [o('1', 'Один'), o('2', 'Два'), o('3plus', 'Три и больше')],
          followUps: [
            {
              id: 'bathroomLayout',
              type: 'single',
              label: 'Какой санузел',
              showIf: { in: ['1'] },
              options: [o('combined', 'Совмещённый'), o('separate', 'Раздельный')],
            },
          ],
        },
      ],
    },
    {
      id: 'scope',
      title: 'Объём работ',
      questions: [
        {
          id: 'repairLevel',
          type: 'single',
          label: 'Какой ремонт нужен',
          required: true,
          card: 5,
          options: [
            o('cosmetic', 'Косметический', 'Косметический ремонт'),
            o('capital', 'Капитальный', 'Капитальный ремонт'),
            o('premium', 'Премиум по дизайн-проекту', 'Премиум-ремонт'),
          ],
        },
        {
          id: 'works',
          type: 'multi',
          label: 'Что входит в работы',
          hint: 'Отметьте всё, что точно понадобится',
          options: [
            o('replanning', 'Перепланировка'),
            o('electrics', 'Замена электрики'),
            o('plumbing', 'Замена труб и сантехники'),
            o('walls', 'Выравнивание стен'),
            o('screed', 'Стяжка или наливной пол'),
            o('warmFloor', 'Тёплый пол'),
            o('ceilings', 'Натяжные потолки'),
            o('ac', 'Кондиционеры'),
            o('soundproof', 'Шумоизоляция'),
          ],
          followUps: [
            {
              id: 'replanningApproval',
              type: 'boolean',
              label: 'Нужна помощь с согласованием перепланировки',
              showIf: { in: ['replanning'] },
            },
            {
              id: 'warmFloorType',
              type: 'single',
              label: 'Тёплый пол',
              showIf: { in: ['warmFloor'] },
              options: [o('electric', 'Электрический'), o('water', 'Водяной')],
            },
            {
              id: 'acUnits',
              type: 'number',
              label: 'Сколько кондиционеров',
              unit: 'шт.',
              min: 1,
              max: 30,
              showIf: { in: ['ac'] },
            },
          ],
        },
        {
          id: 'designProject',
          type: 'single',
          label: 'Дизайн-проект',
          card: 6,
          options: [
            o('ready', 'Есть готовый', 'Есть дизайн-проект'),
            o('need', 'Нужно разработать', 'Нужен дизайн-проект'),
            o('none', 'Не нужен'),
          ],
          followUps: [
            {
              id: 'designScope',
              type: 'single',
              label: 'Какой проект нужен',
              showIf: { in: ['need'] },
              options: [
                o('plan', 'Планировка и чертежи'),
                o('full', 'Полный проект с визуализацией'),
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [
        materials(),
        start(),
        {
          id: 'living',
          type: 'boolean',
          label: 'Будете жить в квартире во время ремонта',
          hint: 'Тогда работы придётся вести поэтапно, по комнатам',
        },
        contract(),
      ],
    },
  ],
};

const PLUMBING: JobQuestionnaire = {
  category: 'PLUMBING',
  sections: [
    {
      id: 'task',
      title: 'Задача',
      questions: [
        {
          id: 'task',
          type: 'single',
          label: 'Что нужно сделать',
          required: true,
          card: 1,
          options: [
            o('fixtures', 'Установить или заменить приборы', 'Установка приборов'),
            o('leak', 'Устранить протечку или засор', 'Протечка или засор'),
            o('pipes', 'Заменить трубы и разводку', 'Замена труб'),
            o('turnkey', 'Санузел или кухня под ключ', 'Сантехника под ключ'),
          ],
          followUps: [
            {
              id: 'fixtures',
              type: 'multi',
              label: 'Какие приборы',
              required: true,
              showIf: { in: ['fixtures', 'turnkey'] },
              card: 2,
              options: [
                o('toilet', 'Унитаз'),
                o('installation', 'Инсталляция с подвесным унитазом', 'Инсталляция'),
                o('sink', 'Раковина или мойка', 'Раковина'),
                o('mixer', 'Смеситель'),
                o('bath', 'Ванна'),
                o('shower', 'Душевая кабина или поддон', 'Душевая'),
                o('drain', 'Душевой трап'),
                o('towelRail', 'Полотенцесушитель'),
                o('heater', 'Водонагреватель', 'Бойлер'),
                o('appliances', 'Посудомоечная или стиральная машина', 'Подключение техники'),
                o('filter', 'Фильтр для воды'),
              ],
              followUps: [
                {
                  id: 'installationBought',
                  type: 'boolean',
                  label: 'Инсталляция уже куплена',
                  showIf: { in: ['installation'] },
                },
                {
                  id: 'bathType',
                  type: 'single',
                  label: 'Какая ванна',
                  showIf: { in: ['bath'] },
                  options: [
                    o('acrylic', 'Акриловая'),
                    o('steel', 'Стальная'),
                    o('castIron', 'Чугунная'),
                    o('stone', 'Из литьевого камня'),
                  ],
                },
                {
                  id: 'towelRailType',
                  type: 'single',
                  label: 'Полотенцесушитель',
                  showIf: { in: ['towelRail'] },
                  options: [o('water', 'Водяной'), o('electric', 'Электрический')],
                  followUps: [
                    {
                      id: 'riserWork',
                      type: 'boolean',
                      label: 'Нужна врезка в стояк',
                      hint: 'Потребуется согласовать отключение стояка с управляющей компанией',
                      showIf: { in: ['water'] },
                    },
                  ],
                },
                {
                  id: 'heaterVolume',
                  type: 'number',
                  label: 'Объём водонагревателя',
                  unit: 'л',
                  min: 5,
                  max: 500,
                  placeholder: '80',
                  showIf: { in: ['heater'] },
                },
                {
                  id: 'fixturesBought',
                  type: 'single',
                  label: 'Приборы куплены',
                  options: [
                    o('all', 'Да, всё куплено'),
                    o('partly', 'Частично'),
                    o('help', 'Нужно подобрать и купить'),
                  ],
                },
              ],
            },
            {
              id: 'leakPlace',
              type: 'single',
              label: 'Где проблема',
              required: true,
              showIf: { in: ['leak'] },
              options: [
                o('sink', 'Под раковиной или мойкой'),
                o('toilet', 'Унитаз или бачок'),
                o('hidden', 'Трубы в стене или полу'),
                o('riser', 'Стояк'),
                o('clog', 'Засор канализации'),
              ],
              followUps: [
                {
                  id: 'canOpenFinish',
                  type: 'boolean',
                  label: 'Можно вскрывать отделку',
                  showIf: { in: ['hidden'] },
                },
              ],
            },
            {
              id: 'urgent',
              type: 'boolean',
              label: 'Протечка активная, нужен срочный выезд',
              showIf: { in: ['leak'] },
              cardLabel: 'Срочный выезд',
              card: 0,
            },
            {
              id: 'pipesScope',
              type: 'multi',
              label: 'Какие системы',
              required: true,
              showIf: { in: ['pipes', 'turnkey'] },
              options: [
                o('water', 'Водоснабжение'),
                o('sewer', 'Канализация'),
                o('heating', 'Отопление'),
              ],
              followUps: [
                {
                  id: 'pipesMaterial',
                  type: 'single',
                  label: 'Материал новых труб',
                  options: [
                    o('pp', 'Полипропилен'),
                    o('pex', 'Сшитый полиэтилен (PEX)'),
                    o('copper', 'Медь'),
                    o('any', 'На усмотрение мастера'),
                  ],
                },
                {
                  id: 'risers',
                  type: 'boolean',
                  label: 'Менять стояки',
                  showIf: { in: ['water', 'sewer'] },
                },
                {
                  id: 'collector',
                  type: 'boolean',
                  label: 'Нужна коллекторная разводка',
                  hint: 'Отдельный кран на каждый прибор, удобно при ремонте',
                  showIf: { in: ['water'] },
                },
              ],
            },
            {
              id: 'turnkeyRoom',
              type: 'single',
              label: 'Какое помещение',
              showIf: { in: ['turnkey'] },
              options: [
                o('bathroom', 'Ванная'),
                o('wc', 'Туалет'),
                o('combined', 'Совмещённый санузел'),
                o('kitchen', 'Кухня'),
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'object',
      title: 'Объект',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Где работы',
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Частный дом', 'Дом'),
            o('commercial', 'Коммерческое помещение', 'Коммерция'),
          ],
          followUps: [
            {
              id: 'waterSource',
              type: 'single',
              label: 'Водоснабжение дома',
              showIf: { in: ['house'] },
              options: [o('central', 'Центральный водопровод'), o('well', 'Скважина или колодец')],
            },
            {
              id: 'sewage',
              type: 'single',
              label: 'Канализация',
              showIf: { in: ['house'] },
              options: [
                o('central', 'Центральная'),
                o('septic', 'Септик или станция очистки'),
                o('none', 'Пока нет'),
              ],
            },
          ],
        },
        {
          id: 'points',
          type: 'number',
          label: 'Сколько точек подключения',
          hint: 'Каждый прибор или кран считается отдельной точкой',
          unit: 'шт.',
          min: 1,
          max: 60,
          card: 3,
          cardPrefix: 'Точек:',
        },
        {
          id: 'pipesCondition',
          type: 'single',
          label: 'Состояние труб',
          options: [
            o('new', 'Новые, пластик'),
            o('old', 'Старые металлические'),
            o('unknown', 'Не знаю'),
          ],
        },
        {
          id: 'hiddenPipes',
          type: 'boolean',
          label: 'Трубы спрятаны в короб или стену',
        },
        {
          id: 'removeOld',
          type: 'boolean',
          label: 'Нужен демонтаж и вывоз старых приборов',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [materials(), start()],
    },
  ],
};

const ELECTRICAL: JobQuestionnaire = {
  category: 'ELECTRICAL',
  sections: [
    {
      id: 'task',
      title: 'Задача',
      questions: [
        {
          id: 'task',
          type: 'single',
          label: 'Тип работ',
          required: true,
          card: 1,
          options: [
            o('full', 'Полная замена проводки', 'Замена проводки'),
            o('fromScratch', 'Электрика с нуля в новостройке', 'Электрика с нуля'),
            o('partial', 'Перенос или добавление точек', 'Перенос точек'),
            o('devices', 'Розетки, выключатели, светильники', 'Установка приборов'),
            o('panel', 'Сборка или замена щитка', 'Электрощит'),
            o('fault', 'Найти и устранить неисправность', 'Неисправность'),
          ],
          followUps: [
            {
              id: 'area',
              type: 'number',
              label: 'Площадь помещения',
              unit: 'м²',
              min: 5,
              max: 2000,
              required: true,
              placeholder: '50',
              showIf: { in: ['full', 'fromScratch'] },
              card: 2,
            },
            {
              id: 'oldWiring',
              type: 'single',
              label: 'Какая проводка сейчас',
              showIf: { in: ['full'] },
              options: [
                o('aluminum', 'Алюминиевая', 'Алюминий'),
                o('copper', 'Медная'),
                o('unknown', 'Не знаю'),
              ],
              followUps: [
                {
                  id: 'dismantleOld',
                  type: 'boolean',
                  label: 'Демонтировать старую проводку',
                },
              ],
            },
            {
              id: 'wallMaterial',
              type: 'single',
              label: 'Материал стен',
              showIf: { in: ['full', 'fromScratch', 'partial'] },
              options: [
                o('concrete', 'Бетон или монолит'),
                o('brick', 'Кирпич'),
                o('aerated', 'Газобетон'),
                o('drywall', 'Гипсокартон'),
                o('wood', 'Дерево'),
              ],
              followUps: [
                {
                  id: 'woodCable',
                  type: 'single',
                  label: 'Как прокладывать кабель по дереву',
                  showIf: { in: ['wood'] },
                  options: [
                    o('hidden', 'Скрыто, в металлорукаве'),
                    o('retro', 'Открыто, ретро-проводка'),
                  ],
                },
              ],
            },
            {
              id: 'points',
              type: 'number',
              label: 'Сколько точек',
              hint: 'Розетки, выключатели и выводы под светильники',
              unit: 'шт.',
              min: 1,
              max: 500,
              placeholder: '30',
              showIf: { in: ['full', 'fromScratch', 'partial', 'devices'] },
              card: 3,
              cardPrefix: 'Точек:',
            },
            {
              id: 'devices',
              type: 'multi',
              label: 'Что установить',
              showIf: { in: ['devices', 'partial', 'fromScratch'] },
              options: [
                o('sockets', 'Розетки'),
                o('switches', 'Выключатели'),
                o('chandeliers', 'Люстры и светильники'),
                o('spots', 'Точечные светильники'),
                o('ledStrip', 'Светодиодная подсветка'),
                o('warmFloor', 'Терморегулятор тёплого пола'),
                o('stove', 'Варочная панель или духовка'),
                o('ac', 'Линия под кондиционер'),
              ],
              followUps: [
                {
                  id: 'spotsCount',
                  type: 'number',
                  label: 'Сколько точечных светильников',
                  unit: 'шт.',
                  min: 1,
                  max: 200,
                  showIf: { in: ['spots'] },
                },
                {
                  id: 'stovePower',
                  type: 'boolean',
                  label: 'Нужна отдельная силовая линия под плиту',
                  showIf: { in: ['stove'] },
                },
              ],
            },
            {
              id: 'panelPlace',
              type: 'single',
              label: 'Где щиток',
              showIf: { in: ['panel', 'full', 'fromScratch'] },
              options: [o('inside', 'В квартире или доме'), o('stairwell', 'На лестничной клетке')],
            },
            {
              id: 'panelDevices',
              type: 'multi',
              label: 'Что поставить в щиток',
              showIf: { in: ['panel', 'full', 'fromScratch'] },
              options: [
                o('breakers', 'Автоматы'),
                o('rcd', 'УЗО или дифавтоматы'),
                o('relay', 'Реле напряжения'),
                o('meter', 'Счётчик'),
                o('surge', 'Защита от импульсных перенапряжений'),
              ],
            },
            {
              id: 'faultSymptom',
              type: 'single',
              label: 'Что происходит',
              required: true,
              showIf: { in: ['fault'] },
              options: [
                o('noPower', 'Нет света в части помещений'),
                o('trips', 'Выбивает автомат или УЗО'),
                o('sparks', 'Искрит или греется розетка'),
                o('flicker', 'Мигает свет'),
              ],
              followUps: [
                {
                  id: 'faultUrgent',
                  type: 'boolean',
                  label: 'Нужен срочный выезд',
                  cardLabel: 'Срочно',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'object',
      title: 'Объект',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Тип объекта',
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Частный дом', 'Дом'),
            o('office', 'Офис или магазин'),
            o('garage', 'Гараж или хозпостройка', 'Гараж'),
          ],
          followUps: [
            {
              id: 'houseInput',
              type: 'single',
              label: 'Ввод электричества в дом',
              showIf: { in: ['house', 'garage'] },
              options: [o('exists', 'Уже есть'), o('need', 'Нужно подключение к сети')],
            },
            {
              id: 'phases',
              type: 'single',
              label: 'Сеть',
              showIf: { in: ['house', 'garage', 'office'] },
              options: [
                o('single', 'Однофазная 220 В'),
                o('three', 'Трёхфазная 380 В'),
                o('unknown', 'Не знаю'),
              ],
            },
          ],
        },
        {
          id: 'rooms',
          type: 'single',
          label: 'Количество комнат',
          showIf: { q: 'objectType', in: ['apartment', 'house'] },
          card: 4,
          options: ROOMS_OPTIONS,
        },
        {
          id: 'buildingAge',
          type: 'single',
          label: 'Год постройки дома',
          options: [
            o('before1970', 'До 1970'),
            o('1970to2000', 'С 1970 по 2000'),
            o('after2000', 'После 2000'),
            o('new', 'Новостройка'),
          ],
        },
        {
          id: 'finishState',
          type: 'single',
          label: 'Состояние отделки',
          options: [
            o('rough', 'Без отделки, черновые работы'),
            o('renovation', 'Идёт ремонт'),
            o('finished', 'Чистовая отделка, нужно аккуратно'),
          ],
        },
        {
          id: 'smartHome',
          type: 'boolean',
          label: 'Интересует умный дом или управление светом с телефона',
          cardLabel: 'Умный дом',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [
        {
          id: 'documents',
          type: 'boolean',
          label: 'Нужны акт, схема и протоколы замеров',
          cardLabel: 'С документами',
        },
        materials(),
        start(),
      ],
    },
  ],
};

const TILING: JobQuestionnaire = {
  category: 'TILING',
  sections: [
    {
      id: 'where',
      title: 'Где и сколько',
      questions: [
        {
          id: 'rooms',
          type: 'multi',
          label: 'Где укладывать',
          required: true,
          card: 1,
          options: [
            o('bathroom', 'Ванная'),
            o('wc', 'Туалет'),
            o('apron', 'Кухонный фартук', 'Фартук'),
            o('kitchenFloor', 'Пол на кухне', 'Кухня'),
            o('hall', 'Прихожая'),
            o('balcony', 'Балкон или лоджия', 'Балкон'),
            o('terrace', 'Терраса или крыльцо', 'Терраса'),
            o('pool', 'Бассейн или хаммам', 'Бассейн'),
          ],
          followUps: [
            {
              id: 'apronLength',
              type: 'number',
              label: 'Длина фартука',
              unit: 'м',
              min: 0.5,
              max: 20,
              step: 0.1,
              placeholder: '3,2',
              showIf: { in: ['apron'] },
            },
            {
              id: 'bathScreen',
              type: 'boolean',
              label: 'Экран под ванну из плитки с люком',
              showIf: { in: ['bathroom'] },
            },
            {
              id: 'outdoorFrost',
              type: 'boolean',
              label: 'Нужна морозостойкая укладка на улице',
              showIf: { in: ['terrace'] },
            },
          ],
        },
        {
          id: 'surfaces',
          type: 'multi',
          label: 'Поверхности',
          required: true,
          options: [o('floor', 'Пол'), o('walls', 'Стены')],
          followUps: [
            {
              id: 'floorArea',
              type: 'number',
              label: 'Площадь пола',
              unit: 'м²',
              min: 0.5,
              max: 2000,
              step: 0.5,
              placeholder: '6',
              showIf: { in: ['floor'] },
              card: 2,
              cardPrefix: 'Пол',
            },
            {
              id: 'wallArea',
              type: 'number',
              label: 'Площадь стен',
              unit: 'м²',
              min: 0.5,
              max: 2000,
              step: 0.5,
              placeholder: '22',
              showIf: { in: ['walls'] },
              card: 3,
              cardPrefix: 'Стены',
            },
          ],
        },
      ],
    },
    {
      id: 'tile',
      title: 'Плитка и раскладка',
      questions: [
        {
          id: 'tileType',
          type: 'single',
          label: 'Материал',
          required: true,
          card: 4,
          options: [
            o('ceramic', 'Керамическая плитка', 'Керамика'),
            o('porcelain', 'Керамогранит'),
            o('mosaic', 'Мозаика'),
            o('stone', 'Натуральный камень', 'Камень'),
            o('clinker', 'Клинкер'),
          ],
          followUps: [
            {
              id: 'tileFormat',
              type: 'single',
              label: 'Формат',
              showIf: { in: ['ceramic', 'porcelain'] },
              options: [
                o('small', 'До 30×30'),
                o('medium', '30×60 или 60×60'),
                o('large', '60×120'),
                o('slab', 'Крупный, от 120×240', 'Слэбы'),
              ],
              followUps: [
                {
                  id: 'slabTools',
                  type: 'boolean',
                  label: 'Нужна помощь с подъёмом и резкой крупных листов',
                  showIf: { in: ['slab'] },
                },
              ],
            },
            {
              id: 'mosaicBase',
              type: 'single',
              label: 'Мозаика',
              showIf: { in: ['mosaic'] },
              options: [o('mesh', 'На сетке'), o('paper', 'На бумаге')],
            },
          ],
        },
        {
          id: 'layout',
          type: 'single',
          label: 'Раскладка',
          options: [
            o('straight', 'Прямая'),
            o('offset', 'Со смещением'),
            o('herringbone', 'Ёлочка'),
            o('diagonal', 'Диагональ'),
            o('scheme', 'По схеме дизайнера'),
          ],
        },
        {
          id: 'extras',
          type: 'multi',
          label: 'Дополнительные работы',
          options: [
            o('miter', 'Запил под 45°'),
            o('waterproof', 'Гидроизоляция'),
            o('levelWalls', 'Выравнивание стен'),
            o('screed', 'Стяжка пола'),
            o('dismantle', 'Демонтаж старой плитки'),
            o('epoxy', 'Эпоксидная затирка'),
            o('hatch', 'Люк-невидимка'),
            o('niches', 'Ниши и полки из плитки'),
          ],
          followUps: [
            {
              id: 'miterLength',
              type: 'number',
              label: 'Сколько метров запила',
              unit: 'м пог.',
              min: 0.5,
              max: 500,
              step: 0.5,
              showIf: { in: ['miter'] },
            },
            {
              id: 'oldTileArea',
              type: 'number',
              label: 'Площадь старой плитки',
              unit: 'м²',
              min: 0.5,
              max: 2000,
              step: 0.5,
              showIf: { in: ['dismantle'] },
            },
          ],
        },
        {
          id: 'baseState',
          type: 'single',
          label: 'Состояние основания',
          options: [
            o('ready', 'Ровное, готово к укладке'),
            o('uneven', 'Нужно выравнивать'),
            o('oldTile', 'Старая плитка'),
            o('unknown', 'Не знаю'),
          ],
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [
        {
          id: 'tileBought',
          type: 'single',
          label: 'Плитка куплена',
          options: [
            o('yes', 'Да, всё на объекте'),
            o('choosing', 'Выбираю, нужна консультация'),
            o('calc', 'Нужно рассчитать и купить'),
          ],
        },
        start(),
      ],
    },
  ],
};

const FINISHING: JobQuestionnaire = {
  category: 'FINISHING',
  sections: [
    {
      id: 'works',
      title: 'Работы',
      questions: [
        {
          id: 'works',
          type: 'multi',
          label: 'Какие работы нужны',
          required: true,
          card: 1,
          options: [
            o('plaster', 'Штукатурка стен', 'Штукатурка'),
            o('putty', 'Шпаклёвка под покраску', 'Шпаклёвка'),
            o('paint', 'Покраска стен', 'Покраска'),
            o('wallpaper', 'Поклейка обоев', 'Обои'),
            o('decor', 'Декоративная штукатурка', 'Декор'),
            o('drywall', 'Гипсокартон', 'ГКЛ'),
            o('ceilings', 'Потолки'),
            o('slopes', 'Откосы'),
            o('moldings', 'Молдинги и лепнина', 'Молдинги'),
          ],
          followUps: [
            {
              id: 'plasterType',
              type: 'single',
              label: 'Штукатурка',
              showIf: { in: ['plaster'] },
              options: [
                o('gypsum', 'Гипсовая, ручная'),
                o('machine', 'Механизированная'),
                o('cement', 'Цементная, для влажных помещений'),
              ],
            },
            {
              id: 'wallpaperType',
              type: 'single',
              label: 'Какие обои',
              showIf: { in: ['wallpaper'] },
              options: [
                o('nonwoven', 'Флизелиновые'),
                o('vinyl', 'Виниловые'),
                o('paintable', 'Под покраску'),
                o('paper', 'Бумажные'),
                o('mural', 'Фотообои или фрески'),
              ],
            },
            {
              id: 'paintFinish',
              type: 'single',
              label: 'Краска',
              showIf: { in: ['paint'] },
              options: [o('matte', 'Матовая'), o('semi', 'Полуматовая'), o('gloss', 'Глянцевая')],
              followUps: [
                {
                  id: 'paintQuality',
                  type: 'single',
                  label: 'Качество подготовки',
                  options: [
                    o('standard', 'Обычное'),
                    o('high', 'Высокое: под глянец и боковой свет'),
                  ],
                },
              ],
            },
            {
              id: 'decorStyle',
              type: 'single',
              label: 'Декоративное покрытие',
              display: 'select',
              showIf: { in: ['decor'] },
              options: [
                o('venetian', 'Венецианская штукатурка'),
                o('microcement', 'Микроцемент'),
                o('concrete', 'Под бетон'),
                o('travertine', 'Под травертин'),
                o('silk', 'Жидкий шёлк'),
              ],
            },
            {
              id: 'drywallItems',
              type: 'multi',
              label: 'Что из гипсокартона',
              showIf: { in: ['drywall'] },
              options: [
                o('partitions', 'Перегородки'),
                o('boxes', 'Короба'),
                o('niches', 'Ниши'),
                o('multilevel', 'Многоуровневый потолок'),
              ],
            },
            {
              id: 'ceilingType',
              type: 'single',
              label: 'Какой потолок',
              showIf: { in: ['ceilings'] },
              options: [
                o('stretch', 'Натяжной'),
                o('drywall', 'Гипсокартон'),
                o('paint', 'Покраска'),
                o('rack', 'Реечный'),
              ],
              followUps: [
                {
                  id: 'stretchFinish',
                  type: 'single',
                  label: 'Фактура полотна',
                  showIf: { in: ['stretch'] },
                  options: [
                    o('matte', 'Матовое'),
                    o('satin', 'Сатиновое'),
                    o('gloss', 'Глянцевое'),
                  ],
                },
                {
                  id: 'shadowGap',
                  type: 'boolean',
                  label: 'Теневой или парящий профиль',
                  showIf: { in: ['stretch', 'drywall'] },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'object',
      title: 'Помещение',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Тип объекта',
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Дом'),
            o('office', 'Офис'),
            o('commercial', 'Коммерческое помещение', 'Коммерция'),
          ],
        },
        {
          id: 'wallArea',
          type: 'number',
          label: 'Площадь стен',
          hint: 'Примерно: периметр комнаты умножить на высоту потолка',
          unit: 'м²',
          min: 1,
          max: 5000,
          placeholder: '80',
          card: 2,
          cardPrefix: 'Стены',
        },
        {
          id: 'ceilingHeight',
          type: 'number',
          label: 'Высота потолков',
          unit: 'м',
          min: 2,
          max: 8,
          step: 0.05,
          placeholder: '2,7',
        },
        {
          id: 'roomsCount',
          type: 'number',
          label: 'Сколько помещений',
          unit: 'шт.',
          min: 1,
          max: 50,
          card: 3,
          cardPrefix: 'Помещений:',
        },
        {
          id: 'wallsState',
          type: 'single',
          label: 'Стены сейчас',
          options: [
            o('bare', 'Бетон или кирпич без отделки'),
            o('oldPlaster', 'Старая штукатурка'),
            o('oldCoating', 'Старые обои или краска'),
            o('drywall', 'Гипсокартон'),
          ],
          followUps: [
            {
              id: 'removeOld',
              type: 'boolean',
              label: 'Снять старое покрытие силами подрядчика',
              showIf: { in: ['oldCoating', 'oldPlaster'] },
            },
          ],
        },
        {
          id: 'furnished',
          type: 'boolean',
          label: 'В помещении есть мебель',
          hint: 'Подрядчику придётся укрыть или передвинуть её',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [materials(), start()],
    },
  ],
};

const FLOORING: JobQuestionnaire = {
  category: 'FLOORING',
  sections: [
    {
      id: 'covering',
      title: 'Покрытие',
      questions: [
        {
          id: 'covering',
          type: 'single',
          label: 'Что укладываем',
          required: true,
          card: 1,
          options: [
            o('laminate', 'Ламинат'),
            o('engineered', 'Инженерная доска', 'Инженерная доска'),
            o('parquet', 'Паркет'),
            o('spc', 'Кварцвинил (SPC, LVT)', 'Кварцвинил'),
            o('linoleum', 'Линолеум'),
            o('carpet', 'Ковролин'),
            o('selfLevel', 'Наливной пол'),
            o('screed', 'Только стяжка', 'Стяжка'),
          ],
          followUps: [
            {
              id: 'pattern',
              type: 'single',
              label: 'Рисунок укладки',
              showIf: { in: ['parquet', 'engineered', 'spc', 'laminate'] },
              options: [
                o('deck', 'Палуба'),
                o('herringbone', 'Ёлочка'),
                o('chevron', 'Французская ёлка'),
                o('squares', 'Квадраты'),
              ],
            },
            {
              id: 'installMethod',
              type: 'single',
              label: 'Способ укладки',
              showIf: { in: ['parquet', 'engineered', 'spc'] },
              options: [o('glue', 'На клей'), o('floating', 'Плавающий, на замок')],
            },
            {
              id: 'woodFinish',
              type: 'single',
              label: 'Финишное покрытие',
              showIf: { in: ['parquet', 'engineered'] },
              options: [
                o('lacquer', 'Лак'),
                o('oil', 'Масло'),
                o('none', 'Не нужно, доска уже покрыта'),
              ],
            },
            {
              id: 'selfLevelType',
              type: 'single',
              label: 'Какой наливной пол',
              showIf: { in: ['selfLevel'] },
              options: [
                o('cement', 'Цементный, под покрытие'),
                o('polymer', 'Полимерный, финишный'),
                o('decor', 'Декоративный 3D'),
              ],
            },
            {
              id: 'screedType',
              type: 'single',
              label: 'Тип стяжки',
              showIf: { in: ['screed'] },
              options: [
                o('wet', 'Цементно-песчаная'),
                o('semiDry', 'Полусухая'),
                o('dry', 'Сухая, сборная'),
              ],
              followUps: [
                {
                  id: 'screedThickness',
                  type: 'number',
                  label: 'Толщина стяжки',
                  unit: 'см',
                  min: 1,
                  max: 25,
                },
              ],
            },
          ],
        },
        {
          id: 'area',
          type: 'number',
          label: 'Площадь',
          unit: 'м²',
          min: 1,
          max: 5000,
          required: true,
          placeholder: '45',
          card: 2,
        },
        {
          id: 'roomsCount',
          type: 'number',
          label: 'Сколько помещений',
          unit: 'шт.',
          min: 1,
          max: 50,
        },
      ],
    },
    {
      id: 'base',
      title: 'Основание',
      questions: [
        {
          id: 'baseState',
          type: 'single',
          label: 'Что сейчас на полу',
          options: [
            o('even', 'Ровная стяжка'),
            o('uneven', 'Перепады, нужно выравнивать'),
            o('oldCovering', 'Старое покрытие'),
            o('wood', 'Деревянный пол на лагах'),
          ],
          followUps: [
            {
              id: 'oldCovering',
              type: 'single',
              label: 'Какое старое покрытие',
              display: 'select',
              showIf: { in: ['oldCovering'] },
              options: [
                o('linoleum', 'Линолеум'),
                o('laminate', 'Ламинат'),
                o('parquet', 'Паркет'),
                o('tile', 'Плитка'),
                o('carpet', 'Ковролин'),
              ],
              followUps: [
                {
                  id: 'removeOld',
                  type: 'boolean',
                  label: 'Демонтировать и вывезти',
                },
              ],
            },
            {
              id: 'joistsOk',
              type: 'boolean',
              label: 'Лаги крепкие, пол не скрипит',
              yesLabel: 'Да',
              noLabel: 'Нет, нужно чинить',
              showIf: { in: ['wood'] },
            },
          ],
        },
        {
          id: 'warmFloor',
          type: 'boolean',
          label: 'Нужен тёплый пол',
          cardLabel: 'Тёплый пол',
          card: 3,
          followUps: [
            {
              id: 'warmFloorType',
              type: 'single',
              label: 'Тип тёплого пола',
              showIf: { is: true },
              options: [
                o('cable', 'Электрический кабельный'),
                o('film', 'Плёночный инфракрасный'),
                o('water', 'Водяной'),
              ],
            },
            {
              id: 'warmFloorArea',
              type: 'number',
              label: 'Площадь обогрева',
              unit: 'м²',
              min: 1,
              max: 1000,
              showIf: { is: true },
            },
          ],
        },
      ],
    },
    {
      id: 'finish',
      title: 'Доборы, сроки и условия',
      questions: [
        {
          id: 'skirting',
          type: 'single',
          label: 'Плинтус',
          options: [
            o('plastic', 'Пластиковый'),
            o('mdf', 'МДФ, под покраску'),
            o('wood', 'Деревянный'),
            o('hidden', 'Скрытый, теневой'),
            o('none', 'Не нужен'),
          ],
        },
        {
          id: 'thresholds',
          type: 'boolean',
          label: 'Нужна стыковка с плиткой и порожки',
        },
        materials(),
        start(),
      ],
    },
  ],
};

const ROOFING: JobQuestionnaire = {
  category: 'ROOFING',
  sections: [
    {
      id: 'object',
      title: 'Здание',
      questions: [
        {
          id: 'buildingType',
          type: 'single',
          label: 'Что за здание',
          required: true,
          card: 2,
          options: [
            o('house', 'Частный дом', 'Дом'),
            o('dacha', 'Дача'),
            o('outbuilding', 'Баня, гараж или навес', 'Хозпостройка'),
            o('apartmentBlock', 'Многоквартирный дом', 'МКД'),
            o('commercial', 'Коммерческое здание', 'Коммерция'),
          ],
        },
        {
          id: 'roofShape',
          type: 'single',
          label: 'Форма крыши',
          options: [
            o('single', 'Односкатная'),
            o('gable', 'Двускатная'),
            o('hip', 'Вальмовая или шатровая'),
            o('mansard', 'Мансардная, ломаная'),
            o('flat', 'Плоская'),
            o('complex', 'Сложная, много ендов'),
          ],
        },
        {
          id: 'area',
          type: 'number',
          label: 'Площадь кровли',
          unit: 'м²',
          min: 5,
          max: 10000,
          placeholder: '150',
          card: 3,
        },
        {
          id: 'floors',
          type: 'number',
          label: 'Этажность здания',
          unit: 'эт.',
          min: 1,
          max: 30,
        },
      ],
    },
    {
      id: 'task',
      title: 'Работы',
      questions: [
        {
          id: 'task',
          type: 'single',
          label: 'Что нужно сделать',
          required: true,
          card: 1,
          options: [
            o('new', 'Новая кровля', 'Новая кровля'),
            o('replace', 'Полная замена кровли', 'Замена кровли'),
            o('leak', 'Ремонт протечки'),
            o('insulation', 'Утепление кровли', 'Утепление'),
            o('gutter', 'Монтаж водостока', 'Водосток'),
            o('snow', 'Очистка от снега и наледи', 'Очистка от снега'),
          ],
          followUps: [
            {
              id: 'roofMaterial',
              type: 'single',
              label: 'Кровельный материал',
              display: 'select',
              showIf: { in: ['new', 'replace'] },
              card: 4,
              options: [
                o('metalTile', 'Металлочерепица'),
                o('profiled', 'Профнастил'),
                o('shingles', 'Гибкая черепица'),
                o('seam', 'Фальцевая кровля', 'Фальц'),
                o('ondulin', 'Ондулин'),
                o('ceramic', 'Натуральная черепица'),
                o('membrane', 'Мембрана (для плоской кровли)', 'Мембрана'),
                o('undecided', 'Пока не решили'),
              ],
            },
            {
              id: 'oldMaterial',
              type: 'single',
              label: 'Что сейчас на крыше',
              showIf: { in: ['replace'] },
              options: [
                o('slate', 'Шифер'),
                o('metal', 'Металл'),
                o('soft', 'Мягкая кровля, рубероид'),
                o('tile', 'Черепица'),
              ],
              followUps: [
                {
                  id: 'asbestosDisposal',
                  type: 'boolean',
                  label: 'Нужна утилизация старого шифера',
                  showIf: { in: ['slate'] },
                },
              ],
            },
            {
              id: 'rafters',
              type: 'single',
              label: 'Стропильная система',
              showIf: { in: ['new', 'replace'] },
              options: [
                o('ok', 'В порядке'),
                o('repair', 'Нужен частичный ремонт'),
                o('build', 'Нужно делать новую'),
              ],
            },
            {
              id: 'leakPlace',
              type: 'single',
              label: 'Где течёт',
              showIf: { in: ['leak'] },
              options: [
                o('chimney', 'У трубы или вентиляции'),
                o('valley', 'В ендове'),
                o('ridge', 'По коньку'),
                o('many', 'В нескольких местах'),
                o('unknown', 'Не знаю'),
              ],
            },
            {
              id: 'insulationType',
              type: 'single',
              label: 'Утеплитель',
              showIf: { in: ['insulation', 'new'] },
              options: [
                o('mineral', 'Минеральная вата'),
                o('pir', 'ПИР-плиты'),
                o('ecowool', 'Эковата'),
                o('xps', 'Экструдированный пенополистирол'),
              ],
            },
            {
              id: 'atticUse',
              type: 'single',
              label: 'Подкровельное пространство',
              showIf: { in: ['insulation', 'new', 'replace'] },
              options: [o('cold', 'Холодный чердак'), o('living', 'Жилая мансарда')],
            },
            {
              id: 'gutterMaterial',
              type: 'single',
              label: 'Водосток',
              showIf: { in: ['gutter'] },
              options: [o('metal', 'Металлический'), o('plastic', 'Пластиковый')],
              followUps: [
                {
                  id: 'gutterLength',
                  type: 'number',
                  label: 'Длина желобов',
                  unit: 'м пог.',
                  min: 1,
                  max: 1000,
                },
              ],
            },
          ],
        },
        {
          id: 'pitch',
          type: 'single',
          label: 'Уклон кровли',
          options: [
            o('low', 'Пологий, до 15°'),
            o('mid', 'Средний, 15-35°'),
            o('steep', 'Крутой, больше 35°'),
            o('unknown', 'Не знаю'),
          ],
        },
        {
          id: 'extras',
          type: 'multi',
          label: 'Дополнительно',
          options: [
            o('snowGuards', 'Снегозадержатели'),
            o('roofWindows', 'Мансардные окна'),
            o('ventilation', 'Вентиляция кровли'),
            o('soffits', 'Подшивка свесов'),
            o('lightning', 'Молниезащита'),
            o('walkways', 'Кровельные лестницы и мостики'),
          ],
          followUps: [
            {
              id: 'roofWindowsCount',
              type: 'number',
              label: 'Сколько мансардных окон',
              unit: 'шт.',
              min: 1,
              max: 50,
              showIf: { in: ['roofWindows'] },
            },
          ],
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [materials(), start(), contract()],
    },
  ],
};

const WINDOWS_DOORS: JobQuestionnaire = {
  category: 'WINDOWS_DOORS',
  sections: [
    {
      id: 'items',
      title: 'Изделия',
      questions: [
        {
          id: 'items',
          type: 'multi',
          label: 'Что нужно',
          required: true,
          card: 1,
          options: [
            o('pvc', 'Пластиковые окна', 'Окна ПВХ'),
            o('woodWindows', 'Деревянные окна', 'Деревянные окна'),
            o('aluminum', 'Алюминиевые окна', 'Алюминиевые окна'),
            o('balcony', 'Остекление балкона или лоджии', 'Остекление балкона'),
            o('entrance', 'Входная дверь'),
            o('interior', 'Межкомнатные двери', 'Межкомнатные двери'),
            o('sliding', 'Раздвижные двери или перегородки', 'Раздвижные системы'),
          ],
          followUps: [
            {
              id: 'windowsCount',
              type: 'number',
              label: 'Сколько окон',
              unit: 'шт.',
              min: 1,
              max: 200,
              required: true,
              showIf: { in: ['pvc', 'woodWindows', 'aluminum'] },
              card: 2,
              cardPrefix: 'Окон:',
            },
            {
              id: 'windowWork',
              type: 'single',
              label: 'Что с окнами',
              showIf: { in: ['pvc', 'woodWindows', 'aluminum'] },
              options: [
                o('replace', 'Замена старых'),
                o('new', 'Установка в новостройке или доме'),
                o('repair', 'Ремонт и регулировка'),
              ],
            },
            {
              id: 'glazing',
              type: 'single',
              label: 'Стеклопакет',
              showIf: { in: ['pvc', 'woodWindows', 'aluminum'] },
              options: [
                o('single', 'Однокамерный'),
                o('double', 'Двухкамерный'),
                o('energy', 'Энергосберегающий'),
                o('unknown', 'Посоветуйте'),
              ],
            },
            {
              id: 'windowExtras',
              type: 'multi',
              label: 'К окнам',
              showIf: { in: ['pvc', 'woodWindows', 'aluminum'] },
              options: [
                o('sills', 'Подоконники'),
                o('slopes', 'Откосы'),
                o('drips', 'Отливы'),
                o('nets', 'Москитные сетки'),
                o('childLock', 'Детские замки'),
              ],
            },
            {
              id: 'balconyType',
              type: 'single',
              label: 'Остекление',
              showIf: { in: ['balcony'] },
              options: [o('cold', 'Холодное, алюминий'), o('warm', 'Тёплое, ПВХ')],
              followUps: [
                {
                  id: 'balconyShape',
                  type: 'single',
                  label: 'Форма балкона',
                  options: [o('straight', 'Прямой'), o('l', 'Г-образный'), o('u', 'П-образный')],
                },
                {
                  id: 'balconyLength',
                  type: 'number',
                  label: 'Длина остекления',
                  unit: 'м',
                  min: 1,
                  max: 30,
                  step: 0.1,
                },
                {
                  id: 'balconyFinish',
                  type: 'boolean',
                  label: 'Нужна внутренняя отделка и утепление',
                  showIf: { in: ['warm'] },
                },
              ],
            },
            {
              id: 'entranceFor',
              type: 'single',
              label: 'Входная дверь',
              showIf: { in: ['entrance'] },
              options: [o('apartment', 'В квартиру'), o('house', 'В частный дом')],
              followUps: [
                {
                  id: 'entranceFeatures',
                  type: 'multi',
                  label: 'Что важно',
                  options: [
                    o('thermalBreak', 'Терморазрыв'),
                    o('soundproof', 'Шумоизоляция'),
                    o('smartLock', 'Электронный замок'),
                    o('videoEye', 'Видеоглазок'),
                  ],
                },
              ],
            },
            {
              id: 'interiorCount',
              type: 'number',
              label: 'Сколько межкомнатных дверей',
              unit: 'шт.',
              min: 1,
              max: 100,
              showIf: { in: ['interior'] },
              card: 3,
              cardPrefix: 'Дверей:',
            },
            {
              id: 'interiorType',
              type: 'single',
              label: 'Тип межкомнатных дверей',
              showIf: { in: ['interior'] },
              options: [
                o('swing', 'Распашные'),
                o('hidden', 'Скрытого монтажа'),
                o('coupe', 'Купе'),
                o('folding', 'Книжка'),
              ],
            },
          ],
        },
        {
          id: 'supply',
          type: 'single',
          label: 'Кто поставляет изделия',
          card: 4,
          options: [
            o('contractor', 'Подрядчик, изготовление под размер', 'Изготовление под размер'),
            o('customer', 'Изделия уже куплены', 'Только монтаж'),
          ],
          followUps: [
            {
              id: 'brand',
              type: 'text',
              label: 'Предпочтения по профилю или производителю',
              placeholder: 'Например: REHAU, VEKA или аналог',
              maxLength: 120,
              showIf: { in: ['contractor'] },
            },
          ],
        },
      ],
    },
    {
      id: 'object',
      title: 'Объект',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Тип объекта',
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Частный дом', 'Дом'),
            o('office', 'Офис'),
          ],
        },
        {
          id: 'floor',
          type: 'number',
          label: 'Этаж',
          hint: 'Выше третьего этажа могут понадобиться высотные работы',
          unit: 'этаж',
          min: 1,
          max: 100,
          showIf: { q: 'objectType', in: ['apartment', 'office'] },
        },
        {
          id: 'dismantle',
          type: 'boolean',
          label: 'Нужен демонтаж и вывоз старых изделий',
        },
        {
          id: 'measure',
          type: 'boolean',
          label: 'Нужен замер на объекте',
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки',
      questions: [start()],
    },
  ],
};

const DESIGN: JobQuestionnaire = {
  category: 'DESIGN',
  sections: [
    {
      id: 'object',
      title: 'Объект',
      questions: [
        {
          id: 'objectType',
          type: 'single',
          label: 'Что проектируем',
          required: true,
          card: 2,
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Дом'),
            o('apartments', 'Апартаменты'),
            o('office', 'Офис'),
            o('horeca', 'Кафе или ресторан', 'HoReCa'),
            o('retail', 'Магазин или шоурум', 'Ритейл'),
          ],
        },
        {
          id: 'area',
          type: 'number',
          label: 'Площадь',
          unit: 'м²',
          min: 5,
          max: 5000,
          required: true,
          placeholder: '75',
          card: 3,
        },
        {
          id: 'rooms',
          type: 'single',
          label: 'Количество комнат',
          showIf: { q: 'objectType', in: ['apartment', 'apartments', 'house'] },
          options: ROOMS_OPTIONS,
        },
        {
          id: 'repairStage',
          type: 'single',
          label: 'Стадия ремонта',
          options: [
            o('notStarted', 'Ещё не начат'),
            o('inProgress', 'Идёт ремонт'),
            o('done', 'Ремонт готов, нужен декор'),
          ],
        },
      ],
    },
    {
      id: 'project',
      title: 'Проект',
      questions: [
        {
          id: 'scope',
          type: 'single',
          label: 'Что нужно',
          required: true,
          card: 1,
          options: [
            o('planning', 'Планировочное решение', 'Планировка'),
            o('concept', 'Эскизный проект с визуализацией', 'Визуализация'),
            o('full', 'Полный рабочий проект', 'Полный проект'),
            o('consult', 'Консультация дизайнера', 'Консультация'),
          ],
          followUps: [
            {
              id: 'parts',
              type: 'multi',
              label: 'Состав проекта',
              showIf: { in: ['full'] },
              options: [
                o('measure', 'Обмерный план'),
                o('plan', 'Планировка с расстановкой мебели'),
                o('visual', '3D-визуализация'),
                o('drawings', 'Чертежи для строителей'),
                o('specs', 'Ведомость материалов и мебели'),
                o('sourcing', 'Комплектация'),
                o('supervision', 'Авторский надзор'),
              ],
              followUps: [
                {
                  id: 'supervisionMonths',
                  type: 'number',
                  label: 'Авторский надзор',
                  unit: 'мес.',
                  min: 1,
                  max: 24,
                  showIf: { in: ['supervision'] },
                },
              ],
            },
            {
              id: 'visualRooms',
              type: 'number',
              label: 'Сколько помещений визуализировать',
              unit: 'шт.',
              min: 1,
              max: 50,
              showIf: { in: ['concept', 'full'] },
            },
            {
              id: 'consultFormat',
              type: 'single',
              label: 'Как провести консультацию',
              showIf: { in: ['consult'] },
              options: [o('visit', 'С выездом на объект'), o('online', 'Онлайн')],
            },
          ],
        },
        {
          id: 'style',
          type: 'multi',
          label: 'Стиль',
          hint: 'До трёх вариантов',
          maxSelected: 3,
          card: 4,
          options: [
            o('modern', 'Современный'),
            o('minimal', 'Минимализм'),
            o('scandi', 'Скандинавский'),
            o('neoclassic', 'Неоклассика'),
            o('loft', 'Лофт'),
            o('japandi', 'Джапанди'),
            o('artdeco', 'Ар-деко'),
            o('undecided', 'Пока не определились'),
          ],
        },
        {
          id: 'budgetLevel',
          type: 'single',
          label: 'Уровень бюджета на ремонт',
          options: [o('economy', 'Эконом'), o('middle', 'Средний'), o('premium', 'Премиум')],
        },
      ],
    },
    {
      id: 'people',
      title: 'Кто будет жить',
      questions: [
        {
          id: 'residents',
          type: 'number',
          label: 'Сколько человек',
          unit: 'чел.',
          min: 1,
          max: 20,
          showIf: { q: 'objectType', in: ['apartment', 'apartments', 'house'] },
          followUps: [
            {
              id: 'children',
              type: 'boolean',
              label: 'Есть дети',
            },
          ],
        },
        {
          id: 'pets',
          type: 'boolean',
          label: 'Есть домашние животные',
          hint: 'Поможет подобрать стойкие материалы',
          showIf: { q: 'objectType', in: ['apartment', 'apartments', 'house'] },
        },
      ],
    },
    {
      id: 'terms',
      title: 'Формат и сроки',
      questions: [
        {
          id: 'format',
          type: 'single',
          label: 'Формат работы с дизайнером',
          options: [o('inPerson', 'Встречи лично'), o('online', 'Онлайн'), o('any', 'Не важно')],
        },
        start(),
      ],
    },
  ],
};

const OTHER: JobQuestionnaire = {
  category: 'OTHER',
  sections: [
    {
      id: 'task',
      title: 'Задача',
      questions: [
        {
          id: 'workType',
          type: 'single',
          label: 'Что за работа',
          required: true,
          card: 1,
          options: [
            o('handyman', 'Мелкий бытовой ремонт', 'Мастер на час'),
            o('furniture', 'Сборка мебели'),
            o('demolition', 'Демонтаж'),
            o('cleaning', 'Уборка после ремонта'),
            o('facade', 'Фасад и утепление'),
            o('other', 'Другое'),
          ],
          followUps: [
            {
              id: 'handymanTasks',
              type: 'multi',
              label: 'Какие задачи',
              showIf: { in: ['handyman'] },
              options: [
                o('hang', 'Повесить полки, карнизы, картины'),
                o('appliances', 'Подключить технику'),
                o('plumbing', 'Мелкий ремонт сантехники'),
                o('electrics', 'Мелкий ремонт электрики'),
                o('doors', 'Отремонтировать дверь или замок'),
              ],
            },
            {
              id: 'furnitureItems',
              type: 'multi',
              label: 'Что собрать',
              showIf: { in: ['furniture'] },
              options: [
                o('wardrobe', 'Шкаф'),
                o('kitchen', 'Кухонный гарнитур'),
                o('bed', 'Кровать'),
                o('storage', 'Комоды и тумбы'),
                o('table', 'Столы и стулья'),
              ],
              followUps: [
                {
                  id: 'furnitureCount',
                  type: 'number',
                  label: 'Сколько предметов',
                  unit: 'шт.',
                  min: 1,
                  max: 100,
                },
              ],
            },
            {
              id: 'demolitionItems',
              type: 'multi',
              label: 'Что демонтировать',
              showIf: { in: ['demolition'] },
              options: [
                o('walls', 'Стены и перегородки'),
                o('tiles', 'Плитку'),
                o('floors', 'Полы'),
                o('plumbing', 'Сантехнику'),
                o('all', 'Всё до бетона'),
              ],
              followUps: [
                {
                  id: 'debris',
                  type: 'boolean',
                  label: 'Нужен вывоз мусора',
                },
              ],
            },
            {
              id: 'area',
              type: 'number',
              label: 'Площадь',
              unit: 'м²',
              min: 1,
              max: 10000,
              showIf: { in: ['cleaning', 'facade', 'demolition'] },
              card: 2,
            },
            {
              id: 'otherTask',
              type: 'text',
              label: 'Что именно нужно сделать',
              placeholder: 'Например: заменить дверной доводчик',
              maxLength: 120,
              required: true,
              showIf: { in: ['other'] },
              card: 2,
            },
          ],
        },
        {
          id: 'objectType',
          type: 'single',
          label: 'Где работы',
          options: [
            o('apartment', 'Квартира'),
            o('house', 'Дом или дача', 'Дом'),
            o('office', 'Офис или помещение', 'Офис'),
          ],
        },
        {
          id: 'floor',
          type: 'number',
          label: 'Этаж',
          unit: 'этаж',
          min: 1,
          max: 100,
          showIf: { q: 'objectType', in: ['apartment', 'office'] },
          followUps: [
            {
              id: 'freightLift',
              type: 'boolean',
              label: 'Есть грузовой лифт',
              showIf: { min: 2 },
            },
          ],
        },
      ],
    },
    {
      id: 'terms',
      title: 'Сроки и условия',
      questions: [
        {
          id: 'visitTime',
          type: 'single',
          label: 'Когда удобно',
          options: [
            o('weekdays', 'В будни'),
            o('weekends', 'В выходные'),
            o('evenings', 'Вечером, после 18:00'),
            o('any', 'В любое время'),
          ],
        },
        materials(),
        start(),
      ],
    },
  ],
};

export const JOB_QUESTIONNAIRES: Record<JobCategory, JobQuestionnaire> = {
  REPAIR_TURNKEY,
  PLUMBING,
  ELECTRICAL,
  TILING,
  FINISHING,
  FLOORING,
  ROOFING,
  WINDOWS_DOORS,
  DESIGN,
  OTHER,
};

// ---------------------------------------------------------------------------------------------
// Обход анкеты

export interface FlatJobQuestion {
  question: JobQuestion;
  section: JobQuestionSection;
  /** Родительский вопрос (для followUps) или null. */
  parentId: string | null;
  /** Глубина вложенности: 0 для вопросов верхнего уровня. */
  depth: number;
}

const flatCache = new Map<JobCategory, readonly FlatJobQuestion[]>();

/** Все вопросы категории в порядке анкеты (обход в глубину). */
export function flattenJobQuestions(category: JobCategory): readonly FlatJobQuestion[] {
  const cached = flatCache.get(category);
  if (cached) return cached;
  const result: FlatJobQuestion[] = [];
  const walk = (
    questions: readonly JobQuestion[],
    section: JobQuestionSection,
    parentId: string | null,
    depth: number,
  ) => {
    for (const question of questions) {
      result.push({ question, section, parentId, depth });
      if (question.followUps) walk(question.followUps, section, question.id, depth + 1);
    }
  };
  for (const section of JOB_QUESTIONNAIRES[category].sections) {
    walk(section.questions, section, null, 0);
  }
  flatCache.set(category, result);
  return result;
}

function matches(condition: JobQuestionCondition, answer: JobAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if (condition.in) {
    const list = condition.in;
    const ok = Array.isArray(answer)
      ? answer.some((value) => list.includes(value))
      : typeof answer === 'string' && list.includes(answer);
    if (!ok) return false;
  }
  if (condition.is !== undefined && answer !== condition.is) return false;
  if (condition.min !== undefined && !(typeof answer === 'number' && answer >= condition.min)) {
    return false;
  }
  if (condition.max !== undefined && !(typeof answer === 'number' && answer <= condition.max)) {
    return false;
  }
  return true;
}

/**
 * Какие вопросы видны при данных ответах. Вопрос виден, если виден его родитель и выполнено
 * условие showIf. Вложенный вопрос без showIf показывается, когда на родителя есть ответ.
 * Условия смотрят только на видимые вопросы, поэтому «устаревшие» ответы на скрытые вопросы
 * (например, в состоянии формы) на результат не влияют.
 */
export function visibleJobQuestionIds(category: JobCategory, answers: JobDetails): Set<string> {
  const visible = new Set<string>();
  for (const { question, parentId } of flattenJobQuestions(category)) {
    if (isVisible(question, parentId, visible, answers)) visible.add(question.id);
  }
  return visible;
}

function isVisible(
  question: JobQuestion,
  parentId: string | null,
  visible: Set<string>,
  answers: Partial<JobDetails>,
): boolean {
  if (parentId !== null && !visible.has(parentId)) return false;
  const condition = question.showIf ?? (parentId !== null ? {} : undefined);
  if (!condition) return true;
  const ref = condition.q ?? parentId;
  if (ref === null || !visible.has(ref)) return false;
  return matches(condition, answers[ref]);
}

// ---------------------------------------------------------------------------------------------
// Проверка ответов

export interface JobDetailsError {
  questionId: string | null;
  message: string;
}

export type JobDetailsResult =
  { ok: true; details: JobDetails } | { ok: false; errors: JobDetailsError[]; message: string };

export interface ValidateJobDetailsOptions {
  /**
   * Мягкий режим: неизвестные и некорректные ответы молча отбрасываются, обязательность
   * не проверяется. Нужен для чтения сохранённых ответов и смены категории.
   */
  lenient?: boolean;
}

/** Управляющие и невидимые символы (bidi-override, нулевые байты): как SINGLE_LINE в API. */
const CONTROL_CHARS = /\p{C}/u;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function decimals(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

type Normalized = { value: JobAnswer } | { empty: true } | { error: string };

function normalizeAnswer(question: JobQuestion, raw: unknown): Normalized {
  const quoted = `«${question.label}»`;
  switch (question.type) {
    case 'single': {
      if (typeof raw !== 'string') return { error: `${quoted}: выберите вариант из списка` };
      if (raw === '') return { empty: true };
      if (!question.options.some((option) => option.value === raw)) {
        return { error: `${quoted}: такого варианта нет` };
      }
      return { value: raw };
    }
    case 'multi': {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
        return { error: `${quoted}: выберите варианты из списка` };
      }
      const chosen = new Set(raw as string[]);
      if ([...chosen].some((value) => !question.options.some((o) => o.value === value))) {
        return { error: `${quoted}: такого варианта нет` };
      }
      const ordered = question.options.map((o) => o.value).filter((value) => chosen.has(value));
      if (ordered.length === 0) return { empty: true };
      if (question.maxSelected !== undefined && ordered.length > question.maxSelected) {
        return { error: `${quoted}: можно выбрать не больше ${question.maxSelected}` };
      }
      return { value: ordered };
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return { error: `${quoted}: укажите число` };
      }
      const step = question.step ?? 1;
      const rounded = Number((Math.round(raw / step) * step).toFixed(decimals(step)));
      if (Math.abs(rounded - raw) > 1e-9) {
        return {
          error:
            step === 1
              ? `${quoted}: укажите целое число`
              : `${quoted}: слишком много знаков после запятой`,
        };
      }
      if (rounded < question.min || rounded > question.max) {
        return {
          error: `${quoted}: от ${formatJobNumber(question.min)} до ${formatJobNumber(question.max)} ${question.unit}`,
        };
      }
      return { value: rounded };
    }
    case 'boolean': {
      if (typeof raw !== 'boolean') return { error: `${quoted}: ответьте «да» или «нет»` };
      return { value: raw };
    }
    case 'text': {
      if (typeof raw !== 'string') return { error: `${quoted}: ответ должен быть текстом` };
      const text = raw
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text === '') return { empty: true };
      if (CONTROL_CHARS.test(text)) return { error: `${quoted}: недопустимые символы` };
      const max = question.maxLength ?? JOB_DETAILS_LIMITS.TEXT_MAX;
      if (text.length > max) return { error: `${quoted}: не больше ${max} символов` };
      return { value: text };
    }
  }
}

/**
 * Проверяет и нормализует ответы анкеты категории.
 *
 * Строгий режим (по умолчанию): неизвестный вопрос, неизвестный вариант, неверный тип, число
 * вне диапазона, слишком длинный текст и пропущенный обязательный видимый вопрос дают ошибку.
 * Ответы на скрытые вопросы (ветка не раскрыта) молча отбрасываются. Пустые ответы (пустая
 * строка, пустой список) считаются отсутствующими. Результат упорядочен как анкета.
 */
export function validateJobDetails(
  category: JobCategory,
  input: unknown,
  options: ValidateJobDetailsOptions = {},
): JobDetailsResult {
  const lenient = options.lenient === true;
  const fail = (errors: JobDetailsError[]): JobDetailsResult => ({
    ok: false,
    errors,
    message: errors[0]?.message ?? 'Проверьте ответы на вопросы',
  });

  if (input === undefined || input === null) {
    if (lenient) return { ok: true, details: {} };
    input = {};
  }
  if (!isPlainObject(input)) {
    return lenient
      ? { ok: true, details: {} }
      : fail([{ questionId: null, message: 'Ответы на вопросы переданы в неверном формате' }]);
  }
  const keys = Object.keys(input);
  if (keys.length > JOB_DETAILS_LIMITS.MAX_KEYS) {
    if (!lenient) return fail([{ questionId: null, message: 'Слишком много ответов' }]);
  }

  const flat = flattenJobQuestions(category);
  const known = new Set(flat.map((item) => item.question.id));
  const errors: JobDetailsError[] = [];
  if (!lenient) {
    for (const key of keys) {
      if (!known.has(key)) {
        errors.push({ questionId: key, message: 'Ответ на вопрос, которого нет в анкете' });
      }
    }
  }

  const details: JobDetails = {};
  const visible = new Set<string>();
  for (const { question, parentId } of flat) {
    if (!isVisible(question, parentId, visible, details)) continue;
    visible.add(question.id);
    const raw = Object.prototype.hasOwnProperty.call(input, question.id)
      ? input[question.id]
      : undefined;
    const normalized: Normalized =
      raw === undefined || raw === null ? { empty: true } : normalizeAnswer(question, raw);
    if ('value' in normalized) {
      details[question.id] = normalized.value;
    } else if ('error' in normalized) {
      if (!lenient) errors.push({ questionId: question.id, message: normalized.error });
    } else if (question.required && !lenient) {
      errors.push({ questionId: question.id, message: `Ответьте на вопрос «${question.label}»` });
    }
  }

  if (errors.length > 0) return fail(errors);
  if (jsonBytes(details) > JOB_DETAILS_LIMITS.MAX_BYTES) {
    return lenient
      ? { ok: true, details: {} }
      : fail([{ questionId: null, message: 'Слишком длинные ответы на вопросы' }]);
  }
  return { ok: true, details };
}

function jsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  let bytes = 0;
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

// ---------------------------------------------------------------------------------------------
// Отображение

/** 1250.5 → «1 250,5» (неразрывный узкий пробел между разрядами начиная с 10 000). */
export function formatJobNumber(value: number): string {
  const [int, frac] = String(Math.abs(value)).split('.');
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') : int;
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

function formatAnswer(question: JobQuestion, answer: JobAnswer): string {
  switch (question.type) {
    case 'single':
      return question.options.find((option) => option.value === answer)?.label ?? String(answer);
    case 'multi':
      return (answer as string[])
        .map((value) => question.options.find((option) => option.value === value)?.label ?? value)
        .join(', ');
    case 'number':
      return `${formatJobNumber(answer as number)} ${question.unit}`;
    case 'boolean':
      return answer ? (question.yesLabel ?? 'Да') : (question.noLabel ?? 'Нет');
    case 'text':
      return String(answer);
  }
}

export interface JobDetailItem {
  id: string;
  label: string;
  value: string;
  /** Для multi: подписи выбранных вариантов по отдельности. */
  values: string[];
  sectionId: string;
  sectionTitle: string;
  depth: number;
}

/**
 * Ответы для показа: пары «вопрос: ответ» в порядке анкеты. Некорректные и скрытые ответы
 * пропускаются (мягкий режим проверки).
 */
export function summarizeJobDetails(category: JobCategory, answers: unknown): JobDetailItem[] {
  const result = validateJobDetails(category, answers, { lenient: true });
  const details = result.ok ? result.details : {};
  const items: JobDetailItem[] = [];
  for (const { question, section, depth } of flattenJobQuestions(category)) {
    const answer = details[question.id];
    if (answer === undefined) continue;
    const values =
      question.type === 'multi'
        ? (answer as string[]).map(
            (value) => question.options.find((option) => option.value === value)?.label ?? value,
          )
        : [formatAnswer(question, answer)];
    items.push({
      id: question.id,
      label: question.label,
      value: formatAnswer(question, answer),
      values,
      sectionId: section.id,
      sectionTitle: section.title,
      depth,
    });
  }
  return items;
}

export interface JobDetailSection {
  id: string;
  title: string;
  items: JobDetailItem[];
}

/** Ответы, сгруппированные по разделам анкеты (пустые разделы опускаются). */
export function groupJobDetails(items: readonly JobDetailItem[]): JobDetailSection[] {
  const sections: JobDetailSection[] = [];
  for (const item of items) {
    let section = sections[sections.length - 1];
    if (!section || section.id !== item.sectionId) {
      section = { id: item.sectionId, title: item.sectionTitle, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

/**
 * Короткие подписи ключевых ответов для карточки в каталоге: «54 м²», «Новостройка»,
 * «Тёплый пол». Берутся вопросы с полем `card` в порядке приоритета.
 */
export function jobDetailHighlights(category: JobCategory, answers: unknown, limit = 4): string[] {
  const result = validateJobDetails(category, answers, { lenient: true });
  const details = result.ok ? result.details : {};
  const candidates: { order: number; index: number; text: string }[] = [];
  flattenJobQuestions(category).forEach(({ question }, index) => {
    const answer = details[question.id];
    if (question.card === undefined || answer === undefined) return;
    let text: string | null = null;
    switch (question.type) {
      case 'single': {
        const option = question.options.find((item) => item.value === answer);
        text = option ? (option.short ?? option.label) : null;
        break;
      }
      case 'multi': {
        const labels = (answer as string[]).map((value) => {
          const option = question.options.find((item) => item.value === value);
          return option?.short ?? option?.label ?? value;
        });
        text =
          labels.length > 2
            ? `${labels.slice(0, 2).join(', ')} и ещё ${labels.length - 2}`
            : labels.join(', ');
        break;
      }
      case 'number': {
        const value = formatJobNumber(answer as number);
        const unit = question.cardPrefix && question.unit === 'шт.' ? '' : ` ${question.unit}`;
        text = `${question.cardPrefix ? `${question.cardPrefix} ` : ''}${value}${unit}`;
        break;
      }
      case 'boolean':
        text = answer === true ? (question.cardLabel ?? question.label) : null;
        break;
      case 'text':
        text = String(answer);
        break;
    }
    if (text) candidates.push({ order: question.card, index, text });
  });
  return candidates
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.text);
}

/** Сколько видимых вопросов и сколько из них с ответом (для индикатора заполнения). */
export function jobDetailsProgress(
  category: JobCategory,
  answers: JobDetails,
): { answered: number; total: number } {
  const visible = visibleJobQuestionIds(category, answers);
  let answered = 0;
  for (const id of visible) if (answers[id] !== undefined) answered += 1;
  return { answered, total: visible.size };
}
