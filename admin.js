'use strict';

const get = (id) => document.getElementById(id);
const products = {
  'snow-maiden': { name: 'Снегурочка', price: 1500, stock: 2 },
  reindeer: { name: 'Новогодний олень', price: 3500, stock: 1 },
  'baba-yaga': { name: 'Баба Яга Делюкс', price: 3000, stock: 1 },
  broom: { name: 'Метла Бабы Яги', price: 1000, stock: 1 },
  princess: { name: 'Принцесса «Королева звёзд»', price: 1250, stock: 2 },
  rabbit: { name: 'Зайка-хозяйка', price: 800, stock: 1 },
  jester: { name: 'Скоморох', price: 2000, stock: 1 },
  dragon: { name: 'Змей Горыныч', price: 3500, stock: 1 },
  scroll: { name: 'Свиток для квестов', price: 500, stock: 2 },
  snowman: { name: 'Снеговик-почтовик', price: 1500, stock: 1 }
};
const statusLabels = {
  new: 'Новая', confirmed: 'Подтверждена', issued: 'Выдана', returned: 'Возвращена', cancelled: 'Отменена'
};
const nextActions = {
  new: ['Подтвердить бронь', 'confirmed'],
  confirmed: ['Отметить выдачу', 'issued'],
  issued: ['Отметить возврат', 'returned']
};
const storageKey = 'carnavalios-admin-demo-v1';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const today = new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', dateStyle: 'short' }).format(new Date()) + 'T00:00:00Z');
const day = (date, offset) => new Date(date.getTime() + offset * 86_400_000);
const dateLabel = (date) => dateFormat.format(date);
const iso = (date) => date.toISOString().slice(0, 10);
const fromIso = (date) => new Date(date + 'T00:00:00Z');
const isActive = (order) => order.status === 'confirmed' || order.status === 'issued';

const samples = [
  [108, 'Новогодний утренник', 'Марина С.', 'new', 2, 3, [
    ['snow-maiden', '128 см'], ['reindeer', '176 см'], ['baba-yaga', '46–48'], ['broom']
  ], 'Заберём комплект накануне. Утренник начинается в 10:00.'],
  [107, 'Школьный спектакль', 'Ирина Н.', 'new', 1, 2, [
    ['princess', '134 см'], ['princess', '146 см'], ['scroll']
  ], 'Два платья для разных участниц.'],
  [106, 'Праздник в детском саду', 'Анна К.', 'confirmed', 1, 2, [
    ['rabbit', '122 см'], ['snowman', '128 см']
  ], 'Выдача после 17:00.'],
  [105, 'День рождения', 'Алексей М.', 'new', 1, 2, [
    ['snowman', '134 см'], ['dragon', '180 см']
  ], 'Если снеговик занят, подойдёт другой зимний образ.'],
  [104, 'Семейный квест', 'Ольга Р.', 'issued', -1, 1, [
    ['jester', '50'], ['scroll']
  ], 'Реквизит забрали вместе с костюмом.'],
  [103, 'Сказка на сцене', 'Елена В.', 'returned', -3, -2, [
    ['baba-yaga', '48'], ['broom']
  ], 'Комплект вернули полностью.']
];
const orders = samples.map(([id, title, customer, status, pickup, due, items, note]) => ({
  id, title, customer, status, note, items,
  pickup: iso(day(today, pickup)),
  eventDate: iso(day(today, Math.min(pickup + 1, due))),
  due: iso(day(today, due))
}));

const filter = get('status-filter');
const search = get('request-search');
const list = get('request-list');
const detail = get('request-detail');
const nav = [...document.querySelectorAll('[data-view]')];
const metrics = [...document.querySelectorAll('[data-metric]')];
let selected = orders[0].id;
let week = 0;

function loadStatuses() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.date !== iso(today) || !saved.statuses) return;
    for (const order of orders) {
      const status = saved.statuses[order.id];
      if (Object.hasOwn(statusLabels, status)) order.status = status;
    }
  } catch {
    // The demo is still usable if browser storage is unavailable.
  }
}

function saveStatuses() {
  try {
    const statuses = Object.fromEntries(orders.map((order) => [order.id, order.status]));
    localStorage.setItem(storageKey, JSON.stringify({ date: iso(today), statuses }));
  } catch {
    // In-memory status changes remain available for the current session.
  }
}

function selectOrder(id, focusDetail = false) {
  selected = id;
  renderRequests();
  if (focusDetail) detail.querySelector('h2')?.focus();
}

function visibleOrders() {
  const term = search.value.trim().toLocaleLowerCase('ru-RU').replace(/^#/, '');
  return orders.filter((order) =>
    (!filter.value || order.status === filter.value) &&
    (order.id + ' ' + order.title + ' ' + order.customer).toLocaleLowerCase('ru-RU').includes(term)
  );
}

function renderRequests() {
  for (const metric of metrics) {
    const status = metric.dataset.metric;
    metric.querySelector('strong').textContent = orders.filter((order) => order.status === status).length;
    metric.setAttribute('aria-pressed', String(filter.value === status));
  }
  const visible = visibleOrders();
  get('queue-count').textContent = 'Найдено: ' + visible.length;
  if (!visible.some((order) => order.id === selected)) selected = visible[0]?.id;
  list.innerHTML = visible.length ? visible.map((order) => `
    <button type="button" class="queue-row" data-order="${order.id}" aria-pressed="${order.id === selected}">
      <span><strong class="queue-title">${order.title}</strong>
      <span class="queue-meta">#${order.id} · ${order.customer} · ${dateLabel(fromIso(order.pickup))}</span></span>
      <span class="status status-${order.status}">${statusLabels[order.status]}</span>
    </button>
  `).join('') : '<p class="admin-empty">По вашему запросу заявок нет.</p>';
  renderOrder(orders.find((order) => order.id === selected));
}

function availableStock(productId, order) {
  let peak = 0;
  for (let date = fromIso(order.pickup); iso(date) <= order.due; date = day(date, 1)) {
    const key = iso(date);
    const reserved = orders
      .filter((other) => other.id !== order.id && isActive(other) && other.pickup <= key && key <= other.due)
      .reduce((count, other) => count + other.items.filter(([id]) => id === productId).length, 0);
    peak = Math.max(peak, reserved);
  }
  return products[productId].stock - peak;
}

function renderOrder(order) {
  if (!order) {
    detail.innerHTML = '<p class="admin-empty">Выберите заявку, чтобы посмотреть состав комплекта.</p>';
    return;
  }
  const requested = new Map();
  for (const [id] of order.items) requested.set(id, (requested.get(id) || 0) + 1);
  const shortages = new Set([...requested].filter(([id, quantity]) => availableStock(id, order) < quantity).map(([id]) => id));
  const canBook = order.status === 'new' && shortages.size === 0;
  const action = nextActions[order.status];
  const total = order.items.reduce((sum, [id]) => sum + products[id].price, 0);
  detail.innerHTML = `
    <header class="order-head">
      <div><p class="order-ref">Заявка #${order.id}</p><h2 tabindex="-1">${order.title}</h2></div>
      <span class="status status-${order.status}">${statusLabels[order.status]}</span>
    </header>
    <dl class="order-meta">
      <div><dt>Клиент</dt><dd>${order.customer}</dd></div>
      <div><dt>Дата праздника</dt><dd>${dateLabel(fromIso(order.eventDate))}</dd></div>
      <div><dt>Выдача и возврат</dt><dd>${dateLabel(fromIso(order.pickup))} → ${dateLabel(fromIso(order.due))}</dd></div>
    </dl>
    <p class="order-note">${order.note}</p>
    <h3>Состав комплекта</h3>
    <ul class="order-items">${order.items.map(([id, size]) => `
      <li class="order-item">
        <img src="assets/costumes/${id}.webp" width="35" height="41" alt="">
        <div><strong>${products[id].name}</strong>${size ? '<small>' + size + '</small>' : ''}</div>
        <div class="order-item-side"><strong>${money.format(products[id].price)}</strong>
          ${order.status === 'new' ? (shortages.has(id) ? '<span class="unavailable">Занят на эти даты</span>' : '<span>Свободен</span>') : ''}
        </div>
      </li>`).join('')}
    </ul>
    <p class="order-sum"><span>Прокат по ценам каталога</span><strong>${money.format(total)}</strong></p>
  ${order.status === 'new' && shortages.size ? '<p class="order-alert">На эти даты не хватает экземпляров. Согласуйте замену перед подтверждением.</p>' : ''}
    <div class="order-actions">
      ${action ? '<button class="button button-dark" type="button" data-status="' + action[1] + '"' +
        (order.status === 'new' && !canBook ? ' disabled' : '') + '>' + action[0] + '</button>' : ''}
      ${order.status === 'new' || order.status === 'confirmed' ?
        '<button class="button button-outline" type="button" data-status="cancelled">Отменить заявку</button>' : ''}
    </div>`;
}

function changeView(view) {
  get('requests').hidden = view !== 'requests';
  get('calendar').hidden = view !== 'calendar';
  for (const button of nav) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (view === 'calendar') renderCalendar();
}

function renderCalendar() {
  const monday = day(today, -((today.getUTCDay() + 6) % 7) + week * 7);
  get('week-title').textContent = dateLabel(monday) + ' — ' + dateLabel(day(monday, 6));
  get('calendar-days').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = day(monday, index);
    const key = iso(date);
    const events = orders.filter((order) => isActive(order) && order.pickup <= key && key <= order.due);
    return `<section class="calendar-day"${key === iso(today) ? ' data-today' : ''}>
      <h3>${weekdayFormat.format(date)} · ${date.getUTCDate()}</h3>
      ${events.map((order) => `<button class="calendar-event" type="button" data-order="${order.id}">
        ${order.title}<small>${key === order.pickup ? 'Выдача' : key === order.due ? 'Возврат' : 'В прокате'} · #${order.id}</small>
      </button>`).join('')}
    </section>`;
  }).join('');
}

for (const button of nav) button.addEventListener('click', () => changeView(button.dataset.view));
for (const metric of metrics) {
  metric.addEventListener('click', () => {
    filter.value = filter.value === metric.dataset.metric ? '' : metric.dataset.metric;
    renderRequests();
  });
}
filter.addEventListener('change', renderRequests);
search.addEventListener('input', renderRequests);
list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-order]');
  if (button) selectOrder(Number(button.dataset.order), true);
});
detail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-status]');
  if (!button || button.disabled) return;
  const order = orders.find((item) => item.id === selected);
  const newStatus = button.dataset.status;
  if (newStatus === 'cancelled' && !window.confirm('Отменить заявку #' + order.id + '?')) return;
  order.status = newStatus;
  saveStatuses();
  if (filter.value && filter.value !== order.status) filter.value = '';
  selectOrder(order.id, true);
  get('announcement').textContent = 'Заявка #' + order.id + '. ' + statusLabels[order.status];
});
get('prev-week').addEventListener('click', () => { week--; renderCalendar(); });
get('next-week').addEventListener('click', () => { week++; renderCalendar(); });
get('current-week').addEventListener('click', () => { week = 0; renderCalendar(); });
get('calendar-days').addEventListener('click', (event) => {
  const button = event.target.closest('[data-order]');
  if (!button) return;
  search.value = filter.value = '';
  changeView('requests');
  selectOrder(Number(button.dataset.order), true);
});
get('reset-demo').addEventListener('click', () => {
  if (!window.confirm('Вернуть все заявки в исходное состояние?')) return;
  orders.forEach((order, index) => { order.status = samples[index][3]; });
  saveStatuses();
  search.value = filter.value = '';
  week = 0;
  changeView('requests');
  selectOrder(orders[0].id, true);
  get('announcement').textContent = 'Демо сброшено.';
});

loadStatuses();
get('today').textContent = dateLabel(today);
renderRequests();
