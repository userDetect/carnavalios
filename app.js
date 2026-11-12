'use strict';

const search = document.getElementById('search');
const buttons = [...document.querySelectorAll('.shop-filters button')];
const cards = [...document.querySelectorAll('.product-card')];
const empty = document.getElementById('empty');
const results = document.getElementById('results-count');

function groupFromUrl() {
  const group = new URLSearchParams(location.search).get('group');
  return buttons.some((button) => button.dataset.group === group) ? group : '';
}

function normalize(value) {
  return value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
}

let activeGroup = groupFromUrl();

function updateResults() {
  const query = normalize(search.value);
  let count = 0;
  for (const card of cards) {
    const title = normalize(card.querySelector('h2').textContent);
    card.hidden = Boolean((activeGroup && card.dataset.group !== activeGroup) || !title.includes(query));
    if (!card.hidden) count++;
  }
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset.group === activeGroup));
  }
  results.textContent = 'Найдено: ' + count;
  empty.hidden = count > 0;
}

function selectGroup(group) {
  activeGroup = group;
  const url = new URL(location.href);
  if (group) url.searchParams.set('group', group);
  else url.searchParams.delete('group');
  if (url.protocol !== 'file:' && url.href !== location.href) history.replaceState(null, '', url);
  updateResults();
}

buttons.forEach((button) => button.addEventListener('click', () => selectGroup(button.dataset.group)));
search.addEventListener('input', updateResults);
document.getElementById('reset-filters').addEventListener('click', () => {
  search.value = '';
  selectGroup('');
  search.focus();
});

updateResults();
