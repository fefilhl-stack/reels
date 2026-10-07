// Тексты главной ТУРБО для общих компонентов (шапка, схема, карточки).
// Факты о компании взяты с turbosolution.ru; цифры в демо-карточках
// (миллисекунды, проценты, суммы) иллюстративные, как на макете Relay.
import type { HeaderContent } from '../Header';
import type { FlowContent } from '../sections/FlowCard';
import type { TimelineContent } from '../sections/RunTimeline';
import type { ApprovalContent } from '../sections/SlackCard';
import type { BarsContent } from '../sections/IsoBarsCard';
import type { ManifestoContent } from '../sections/Manifesto';
import type { RegionsContent } from '../sections/Regions';
import type { DailyContent } from '../sections/DailyCards';

export const SITE = 'https://turbosolution.ru';
export const PHONE = '+7 (495) 721-91-65';
export const PHONE_HREF = 'tel:+74957219165';
export const EMAIL = 'info@turbosolution.ru';
export const TELEGRAM = 'https://t.me/turbosolution';
export const YOUTUBE = 'https://www.youtube.com/@turbosolution';

export const HEADER: HeaderContent = {
  brand: 'ТУРБО',
  brandLabel: 'ТУРБО, наверх',
  mark: 'turbo',
  links: [
    { href: '#products', label: 'Продукты' },
    { href: '#platform', label: 'Платформа' },
    { href: '#clients', label: 'Клиенты' },
    { href: '#services', label: 'Внедрение' },
  ],
  cta: { href: '#demo', label: 'Запросить демо' },
  status: 'в реестре российского ПО',
  navLabel: 'Основное меню',
  menu: ['Открыть меню', 'Закрыть меню'],
};

export const PRODUCTS: [string, string][] = [
  ['X', 'платформа'],
  ['ERP', 'erp'],
  ['БЮД', 'бюджет'],
  ['ТОРО', 'ремонты'],
  ['ИК', 'имущество'],
  ['ОТЛ', 'отель'],
  ['WMS', 'склад'],
];

export const FLOW: FlowContent = {
  name: 'Ремонт насоса Н-12',
  meta: '3 шага / 1 ветка',
  state: 'в работе',
  aria: 'Пример процесса: заявка на ремонт насоса, три шага и одна ветка, процесс идёт',
  nodes: {
    start: ['Дефект обнаружен', 'турбо торо'],
    cond: ['Простой больше 4 ч', 'условие'],
    log: ['Резерв запчастей', 'турбо wms'],
    ask: ['Согласовать наряд', 'ждёт главного инженера'],
  },
  branches: ['да', 'иначе'],
  wait: '26 мин',
  runsLabel: 'последние операции',
  firstRuns: [
    { id: 3, time: '09:41:02', name: 'наряд на ремонт', took: '129 мс' },
    { id: 2, time: '09:38:57', name: 'закрытие месяца', took: '2,1 с' },
    { id: 1, time: '09:31:14', name: 'заявка на закупку', took: '410 мс' },
  ],
  names: ['наряд на ремонт', 'закрытие месяца', 'заявка на закупку', 'бюджет на квартал', 'бронь номера 214', 'консолидация мсфо'],
  took: ['129 мс', '96 мс', '2,1 с', '410 мс', '188 мс', '1,4 с', '74 мс'],
};

export const TIMELINE: TimelineContent = {
  head: 'операция',
  unit: 'мс',
  steps: [
    { name: 'чтение документа', start: 0, ms: 115, play: 1.5 },
    { name: 'проверка лимита', start: 118, ms: 3, play: 0.45 },
    { name: 'ветка, свыше 5 млн', start: 123, ms: 0, play: 0.35 },
    { name: 'согласование', start: 130, ms: 26, play: 0.6, wait: 'у финдиректора' },
  ],
};

export const APPROVAL: ApprovalContent = {
  channel: '#казначейство',
  day: 'сегодня',
  bot: 'ТУРБО',
  mark: 'turbo',
  badge: 'БОТ',
  typing: 'ТУРБО печатает',
  ask: { before: 'Платёж на ', amount: '6,4 млн ₽', after: ' по договору поставки выше лимита и ждёт согласования.' },
  payload: [
    ['сумма', '6 400 000,00 ₽'],
    ['основание', 'договор поставки'],
    ['операция', '#41982'],
  ],
  buttons: ['Согласовать', 'Отложить'],
  hint: 'или ответьте в треде',
  you: ['Я', 'Вы'],
  person: 'Дарья Руденко',
  times: ['09:41', '09:43'],
  replies: { approved: 'Согласовано, сумма сходится с договором.', held: 'Отложим, сначала сверю график платежей.' },
  results: { approved: '✓ операция 41982 продолжилась через 26 мин', held: '■ операция 41982 на паузе, инициатор знает почему' },
};

export const BARS: BarsContent = {
  title: 'операций по дням недели',
  total: 'в среднем 62 000',
  days: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  aria: 'Число операций по дням недели, растёт с понедельника к субботе',
};

export const MANIFESTO: ManifestoContent = {
  label: '[ во что мы верим ]',
  lines: ['Лучшая ERP — та, о которой', 'не вспоминают', 'на планёрке.'],
  aria: 'Во что мы верим',
  mark: 'turbo',
};

export const HUB: [string, string][] = [
  ['ERP', 'финансы'],
  ['WMS', 'склад'],
  ['ТОРО', 'ремонты'],
  ['БЮД', 'бюджет'],
];

export const REGIONS: RegionsContent = {
  label: 'пример: операции по площадкам за сутки',
  foot: 'данные не покидают ваш контур',
  regions: [
    { code: 'msk-dc-1', city: 'Москва', value: 46, lime: true },
    { code: 'nsk-dc-1', city: 'Новосибирск', value: 38, lime: false },
    { code: 'ekb-dc-1', city: 'Екатеринбург', value: 16, lime: false },
  ],
};

export const DAILY: DailyContent = {
  week: { label: 'неделя, операция за операцией', chip: 'закрытие дня через 12 мин', days: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] },
  ring: { label: 'без ручной работы', value: 81, caption: 'операций проходят без участия человека' },
  people: { label: 'ждут согласования', unit: 'согласования', caption: 'Дольше всех ждёт: 26 минут, #казначейство' },
  waves: { label: 'сбои и восстановления', recovered: 'восстановлено', failed: 'сбой' },
};
