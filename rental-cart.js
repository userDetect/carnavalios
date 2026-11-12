'use strict';

(() => {
  const products = {
    "princess": {
      "name": "Принцесса «Королева звёзд»",
      "price": 1250
    },
    "jester": {
      "name": "Скоморох",
      "price": 2000
    },
    "reindeer": {
      "name": "Новогодний олень",
      "price": 3500
    },
    "rabbit": {
      "name": "Зайка-хозяйка",
      "price": 800
    },
    "baba-yaga": {
      "name": "Баба Яга Делюкс",
      "price": 3000
    },
    "snowman": {
      "name": "Снеговик-почтовик",
      "price": 1500
    },
    "dragon": {
      "name": "Змей Горыныч",
      "price": 3500
    },
    "snow-maiden": {
      "name": "Снегурочка",
      "price": 1500
    },
    "scroll": {
      "name": "Свиток для квестов",
      "price": 500,
      "props": true
    },
    "broom": {
      "name": "Метла Бабы Яги",
      "price": 1000,
      "props": true
    }
  };
  const cartKey = 'carnavalios-rental-cart';
  const form = document.getElementById('rental-request');
  const counter = document.querySelector('[data-cart-count]');
  const formatMoney = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
  let cart = readCart();

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(cartKey) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter((item) => item && typeof item.id === 'string' && Object.hasOwn(products, item.product))
        .map((item) => ({ ...item, size: typeof item.size === 'string' ? item.size.slice(0, 42) : '' }));
    } catch {
      return [];
    }
  }

  function changeCart(change) {
    const next = change(readCart());
    try {
      localStorage.setItem(cartKey, JSON.stringify(next));
    } catch {
      return false;
    }
    cart = next;
    updateCounter();
    return true;
  }

  function updateCounter() {
    counter.textContent = cart.length;
    counter.parentElement.setAttribute('aria-label', 'Корзина, позиций: ' + cart.length);
  }

  const feedback = document.createElement('div');
  feedback.className = 'cart-feedback';
  feedback.hidden = true;
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  const feedbackLink = document.createElement('a');
  feedbackLink.href = counter.parentElement.href;
  feedbackLink.textContent = 'Открыть корзину';
  feedback.append(message, feedbackLink);
  document.body.append(feedback);
  let feedbackTimer;

  function showFeedback(text, showLink = false) {
    window.clearTimeout(feedbackTimer);
    feedbackLink.hidden = !showLink;
    feedback.hidden = false;
    message.textContent = text;
    feedbackTimer = window.setTimeout(() => {
      if (!feedback.contains(document.activeElement)) feedback.hidden = true;
    }, 5200);
  }

  document.querySelectorAll('[data-add-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = button.dataset.addItem;
      const id = Array.from(crypto.getRandomValues(new Uint32Array(2))).join('-');
      const saved = changeCart((items) => [...items, { id, product, size: '' }]);
      if (saved) {
        showFeedback('В корзине: ' + products[product].name, true);
      } else {
        showFeedback('Браузер не смог сохранить корзину. Свяжитесь с прокатом по телефону.');
      }
    });
  });

  updateCounter();
  window.addEventListener('storage', (event) => {
    if (event.key !== cartKey && event.key !== null) return;
    cart = readCart();
    updateCounter();
    if (form) renderCart();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    cart = readCart();
    updateCounter();
    if (form) renderCart();
  });

  if (!form) return;

  const list = document.getElementById('cart-items');
  const empty = document.getElementById('cart-empty');
  const rowTemplate = document.getElementById('cart-row');
  const total = document.getElementById('cart-total');
  const draft = document.getElementById('request-draft');
  const requestText = document.getElementById('request-text');
  const email = document.getElementById('request-email');
  const copyStatus = document.getElementById('copy-status');
  const date = form.elements.namedItem('date');
  const phone = form.elements.namedItem('phone');

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  date.min = localToday.toISOString().slice(0, 10);

  function renderCart() {
    draft.hidden = true;
    form.hidden = cart.length === 0;
    empty.hidden = cart.length !== 0;
    list.replaceChildren();
    let subtotal = 0;

    for (const [index, item] of cart.entries()) {
      const product = products[item.product];
      subtotal += product.price;
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      const productUrl = 'costumes/' + item.product + '.html';
      const title = row.querySelector('.cart-item-name');
      title.textContent = product.name;
      title.href = productUrl;
      row.querySelector('.cart-image').href = productUrl;
      row.querySelector('img').src = 'assets/costumes/' + item.product + '.webp';
      row.querySelector('.cart-item-price').textContent = formatMoney.format(product.price);

      const sizeField = row.querySelector('.cart-size');
      sizeField.hidden = Boolean(product.props);
      const sizeInput = sizeField.querySelector('input');
      sizeInput.value = item.size;
      sizeInput.setAttribute('aria-label', 'Размер или рост — ' + product.name + ', позиция ' + (index + 1));
      sizeInput.addEventListener('input', () => {
        const saved = changeCart((items) => items.map((entry) =>
          entry.id === item.id ? { ...entry, size: sizeInput.value } : entry
        ));
        if (!saved) showFeedback('Не удалось сохранить размер.');
      });

      const remove = row.querySelector('.cart-remove');
      remove.setAttribute('aria-label', 'Удалить — ' + product.name + ', позиция ' + (index + 1));
      remove.addEventListener('click', () => {
        if (!changeCart((items) => items.filter((entry) => entry.id !== item.id))) {
          showFeedback('Не удалось обновить корзину.');
          return;
        }
        renderCart();
        const nextRow = list.children[Math.min(index, list.children.length - 1)];
        (nextRow?.querySelector('.cart-remove') ?? empty.querySelector('a')).focus();
      });
      list.append(row);
    }

    total.textContent = formatMoney.format(subtotal);
  }

  form.addEventListener('input', () => {
    phone.setCustomValidity('');
    draft.hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const digits = phone.value.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      phone.setCustomValidity('Введите номер телефона, по которому с вами можно связаться.');
      phone.reportValidity();
      return;
    }
    if (!cart.length) return;

    const eventDate = date.value.split('-').reverse().join('.');
    const name = form.elements.namedItem('name').value.trim();
    const notes = form.elements.namedItem('notes').value.trim();
    const items = cart.map((item, index) => {
      const product = products[item.product];
      const size = item.size.trim() || 'уточнить';
      return (index + 1) + '. ' + product.name + (product.props ? '' : ' (размер или рост: ' + size + ')');
    });
    const lines = [
      'Здравствуйте! Хочу уточнить наличие костюмов и реквизита.',
      '',
      'Дата праздника: ' + eventDate,
      '',
      ...items,
      '',
      ...(name ? ['Имя: ' + name] : []),
      'Телефон: ' + phone.value.trim(),
      ...(notes ? ['Комментарий: ' + notes] : [])
    ];
    const subject = 'Заявка на прокат — ' + eventDate;
    requestText.value = lines.join('\n');
    email.href = 'mailto:prokat@xn--80aaah5ahlmons.xn--p1ai?subject=' +
      encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));
    copyStatus.textContent = '';
    draft.hidden = false;
    document.getElementById('draft-title').focus();
  });

  document.getElementById('copy-request').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(requestText.value);
      copyStatus.textContent = 'Заявка скопирована.';
    } catch {
      requestText.focus();
      requestText.select();
      copyStatus.textContent = 'Текст выделен. Скопируйте его в буфер обмена.';
    }
  });

  renderCart();
})();
