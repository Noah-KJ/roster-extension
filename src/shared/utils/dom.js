// ════════════════════════════════════════════
// shared/utils/dom.js
// 純 DOM 操作工具
// ════════════════════════════════════════════

import { TAIWAN_REGIONS } from '../constants.js';

/** 開啟 modal */
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

/** 關閉 modal */
export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/**
 * 綁定 modal 通用關閉行為（[data-close] 按鈕 + 點背景）
 * 回傳 cleanup 函式
 */
export function bindModalClose(backdropId) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return () => {};

  const handlers = [];

  backdrop.querySelectorAll('[data-close]').forEach(btn => {
    const h = () => closeModal(btn.dataset.close);
    btn.addEventListener('click', h);
    handlers.push([btn, 'click', h]);
  });

  const bgH = e => { if (e.target === backdrop) closeModal(backdropId); };
  backdrop.addEventListener('click', bgH);
  handlers.push([backdrop, 'click', bgH]);

  return () => handlers.forEach(([el, ev, h]) => el.removeEventListener(ev, h));
}

/**
 * 綁定事件並記錄 cleanup
 */
export function bindEl(id, event, handler, cleanups) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(event, handler);
  cleanups.push(() => el.removeEventListener(event, handler));
}

/**
 * 填充 <select> 選項
 * @param {string}      selectId
 * @param {string[]}    options
 * @param {string}      selectedValue
 * @param {string|null} placeholder - 有值時加「全部」選項（toolbar 用），null 時不加（modal 用）
 */
export function fillSelect(selectId, options, selectedValue = '', placeholder = null) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  selectEl.innerHTML = '';

  if (placeholder !== null) {
    const first = document.createElement('option');
    first.value = ''; first.textContent = placeholder;
    selectEl.appendChild(first);
  }

  const current = Array.isArray(selectedValue) ? selectedValue[0] : selectedValue;
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt; option.textContent = opt;
    if (opt === current) option.selected = true;
    selectEl.appendChild(option);
  }
}

/**
 * 折疊/展開 card（點 header 切換 .is-open，且同一時間只能展開一個）
 */
export function setupCardToggles(scopeSelector, cleanups) {
  const scope = document.querySelector(scopeSelector);
  if (!scope) return;

  scope.querySelectorAll('.card').forEach(card => card.classList.remove('is-open'));

  const toggleCard = (event) => {
    if (
      event.target.closest('.card-header-actions') ||
      event.target.closest('button')               ||
      event.target.closest('select')               ||
      event.target.closest('input[type="number"]')
    ) return;

    const currentCard = event.currentTarget.closest('.card');
    if (!currentCard) return;

    // 1. 先檢查當前點擊的 card 是否已經是展開狀態
    const isAlreadyOpen = currentCard.classList.contains('is-open');

    // 2. 💡 如果接下來是要「展開」（原本是收合的），就把 scope 內「其他」所有 card 都收合
    if (!isAlreadyOpen) {
      scope.querySelectorAll('.card').forEach(card => {
        if (card !== currentCard) {
          card.classList.remove('is-open');
        }
      });
    }

    // 3. 最後切換當前點擊的 card 狀態
    currentCard.classList.toggle('is-open');
  };

  scope.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', toggleCard);
    cleanups.push(() => header.removeEventListener('click', toggleCard));
  });
}

/**
 * 防抖
 */
export function debounce(fn, delay = 500) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function fillRegionSelects(city, dist, pageCleanups) {
  // 1. 初始化：填充縣市，並清空鄉鎮市區
  const cities = Object.keys(TAIWAN_REGIONS);
  fillSelect(city, cities);
  fillSelect(dist, TAIWAN_REGIONS[cities[0]] );

  // 2. 安全綁定：使用 bindEl 監聽縣市切換
  bindEl(city, 'change', (e) => {
    const selectedCity = e.target.value; 

    if (selectedCity && TAIWAN_REGIONS[selectedCity]) {
      const districts = TAIWAN_REGIONS[selectedCity];
      fillSelect(dist, districts);
    } else {
      fillSelect(dist, [], '', '先選縣市');
    }
  }, pageCleanups);
}