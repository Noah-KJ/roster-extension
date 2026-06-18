// ════════════════════════════════════════════
// pages/data/components/siteTab.js
// 據點列表 + Modal CRUD
// ════════════════════════════════════════════

import { getSitesState, setSitesState,
         getSettingsState }              from '../../../core/store/globalState.js';
import { SITE_TEMPLATE }                 from '../../../shared/constants.js';
import { showConfirm, showToastMsg }     from '../../../shared/utils/notify.js';
import { assignRepChar }                 from '../../../core/services/siteService.js';
import { ValidationError }               from './validation.js';
import {
  openModal, closeModal, bindModalClose,
  bindEl, fillSelect, fillRegionSelects,
} from '../../../shared/utils/dom.js';

let _editingSiteId = null;
const _cleanups = [];

// ── 初始化 ────────────────────────────────────
export function mount() {
  bindEl('btn-add-site',        'click',  () => openSiteModal(null), _cleanups);
  bindEl('btn-save-site',       'click',  saveSite,    _cleanups);
  bindEl('site-region-filter',  'change', renderSites, _cleanups);
  bindEl('site-located-filter', 'change', renderSites, _cleanups);
  bindEl('site-search',         'input',  renderSites, _cleanups);
  bindEl('duties-day-add',      'click',  () => _addDutyRow('日班'), _cleanups);
  bindEl('duties-night-add',    'click',  () => _addDutyRow('夜班'), _cleanups);


  fillSelect('site-region-filter',  getSettingsState().regions, '', '全部轄區');
  fillSelect('site-located-filter', getSettingsState().located, '', '全部地點');

  _cleanups.push(bindModalClose('site-modal'));
  _cleanups.push(bindModalClose('confirm-modal'));

  renderSites();
}

export function unmount() {
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;
}

// ── 列表渲染 ──────────────────────────────────
export function renderSites() {
  const sites = getSitesState();
  const q = document.getElementById('site-search')?.value.trim().toLowerCase() ?? '';

  let filtered = sites;
  const regionFilter  = document.getElementById('site-region-filter')?.value ?? '';
  const locatedFilter = document.getElementById('site-located-filter')?.value ?? '';

  if (regionFilter)  filtered = filtered.filter(s => s.region === regionFilter);
  if (locatedFilter) filtered = filtered.filter(s => s.located === locatedFilter);
  if (q) filtered = filtered.filter(s =>
    (s.name[0] ?? '').includes(q) ||
    (s.name[1] ?? '').includes(q) ||
    (s.addr[2] ?? '').includes(q)
  );

  document.getElementById('site-count').textContent = `共 ${filtered.length} 筆`;
  const tbody = document.getElementById('sites-tbody');
  const empty = document.getElementById('sites-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = ''; empty.style.display = ''; return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = '';

  for (const site of filtered) {
    const dayTotal   = (site.duties ?? []).filter(d => d.shift === '日班').reduce((s, r) => s + (r.count || 0), 0);
    const nightTotal = (site.duties ?? []).filter(d => d.shift === '夜班').reduce((s, r) => s + (r.count || 0), 0);

    const vacancies = [];
    for (const d of (site.duties ?? [])) {
      const remaining = d.last ?? d.count;
      if (remaining > 0) vacancies.push(`${d.shift === '日班' ? '日' : '夜'}${d.duty}×${remaining}`);
    }
    const vacancyHtml = vacancies.length
      ? vacancies.map(v => `<span class="vacancy-badge">${v}</span>`).join(' ')
      : '<span class="days-badge ok">滿編</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${site.name[1] ?? ''}</td>
      <td>${site.region  ?? ''}</td>
      <td>${site.located ?? ''}</td>
      <td>${site.tel     ?? ''}</td>
      <td>${dayTotal   || '—'}</td>
      <td>${nightTotal || '—'}</td>
      <td>${vacancyHtml}</td>
      <td>${site.note ?? ''}</td>
      <td>
        <div class="td-actions">
          <button class="icon-btn" title="編輯">✏️</button>
          <button class="icon-btn danger" title="刪除">🗑</button>
        </div>
      </td>`;
    tr.querySelector('[title="編輯"]').addEventListener('click', e => {
      e.stopPropagation(); openSiteModal(site.id);
    });
    tr.querySelector('[title="刪除"]').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`確定要刪除「${site.name[0]}」嗎？`).then(ok => {
        if (!ok) return;
        setSitesState(getSitesState().filter(s => s.id !== site.id));
        renderSites();
      });
    });
    tr.addEventListener('click', () => openSiteModal(site.id));
    tbody.appendChild(tr);
  }
}

// ── Modal ─────────────────────────────────────
function openSiteModal(id) {
  _editingSiteId = id;
  const sites  = getSitesState();
  const site   = id ? sites.find(s => s.id === id) : SITE_TEMPLATE();
  const duties = getSettingsState().duties ?? [];

  document.getElementById('site-modal-title').textContent = id ? '編輯據點' : '新增據點';
  document.getElementById('s-name').value      = site.name[0] ?? '';
  document.getElementById('s-shortName').value = site.name[1] ?? '';
  document.getElementById('s-tel').value       = site.tel     ?? '';
  document.getElementById('s-note').value      = site.note    ?? '';
  document.getElementById('s-CEDate').value    = site.CEDate  ?? '';
  document.getElementById('s-HOADate').value   = site.HOADate ?? '';

  fillRegionSelects('s-city', 's-dist', _cleanups, site.addr[0], site.addr[1]);
  document.getElementById('s-addr').value = site.addr[2] ?? '';

  fillSelect('s-region',  getSettingsState().regions, site.region  ?? '');
  fillSelect('s-located', getSettingsState().located, site.located ?? '');

  _renderDutyRows('日班', (site.duties ?? []).filter(d => d.shift === '日班'), duties);
  _renderDutyRows('夜班', (site.duties ?? []).filter(d => d.shift === '夜班'), duties);

  openModal('site-modal');
}

async function saveSite() {
  try {
    const fullName  = document.getElementById('s-name').value.trim();
    const shortName = document.getElementById('s-shortName').value.trim();
    const city      = document.getElementById('s-city').value;
    const dist      = document.getElementById('s-dist').value;
    const addr      = document.getElementById('s-addr').value.trim();
    const tel       = document.getElementById('s-tel').value.trim();
    const region    = document.getElementById('s-region').value;
    const located   = document.getElementById('s-located').value;

    const errors = [];
    if (!fullName)  errors.push('請填寫名稱');
    if (!shortName) errors.push('請填寫簡稱');
    if (!addr)      errors.push('請填寫詳細地址');
    if (!tel)       errors.push('請填寫社區電話');
    if (!region)    errors.push('請選擇轄區');
    if (!located)   errors.push('請選擇駐地');
    if (errors.length > 0) throw new ValidationError(errors);

    const data = {
      id:       _editingSiteId ?? crypto.randomUUID(),
      name:     [fullName, shortName, null],
      addr:     [city, dist, addr],
      tel,
      region,
      located,
      email:    document.getElementById('s-email')?.value.trim() ?? '',
      note:     document.getElementById('s-note').value.trim(),
      CEDate:   document.getElementById('s-CEDate').value,
      HOADate:  document.getElementById('s-HOADate').value,
      duties:   _collectDuties(),
    };

    // 產生不重複代表字
    data.name[2] = assignRepChar(data, getSitesState());

    const sites = getSitesState();
    await setSitesState(
      _editingSiteId
        ? sites.map(s => s.id === _editingSiteId ? data : s)
        : [...sites, data]
    );
    closeModal('site-modal');
    renderSites();

  } catch (err) {
    if (err instanceof ValidationError) {
      showToastMsg(err.messages.join('・'), true);
    } else {
      console.error(err);
      showToastMsg('系統儲存時發生非預期錯誤：' + err.message, true);
    }
  }
}

// ── 勤務列 ────────────────────────────────────
function _renderDutyRows(shift, rows, duties) {
  const containerId = shift === '日班' ? 'duties-day-grid' : 'duties-night-grid';
  const container   = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  rows.forEach((row, i) => container.appendChild(_makeDutyRow(shift, i, row, duties)));
}

function _makeDutyRow(shift, idx, row, duties) {
  const el        = document.createElement('div');
  el.className    = 'duty-row';
  el.dataset.idx  = idx;
  el.dataset.shift = shift;

  const label = document.createElement('span');
  label.className   = 'duty-label';
  label.textContent = `${shift === '日班' ? '日' : '夜'}${idx + 1}`;

  const dutySelect = document.createElement('select');
  dutySelect.style.cssText = 'padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;';
  for (const d of duties) {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    if (d === row.duty) opt.selected = true;
    dutySelect.appendChild(opt);
  }

  const countInput = document.createElement('input');
  countInput.type  = 'number'; countInput.min = 1; countInput.max = 99;
  countInput.value = row.count ?? 1;
  countInput.style.cssText = 'padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;width:60px;';

  const delBtn = document.createElement('button');
  delBtn.textContent   = '✕';
  delBtn.style.cssText = 'background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:4px;';
  delBtn.addEventListener('click', () => {
    el.remove();
    _reIndexDutyLabels(shift);
  });

  el.append(label, dutySelect, countInput, delBtn);
  return el;
}

function _addDutyRow(shift) {
  const containerId = shift === '日班' ? 'duties-day-grid' : 'duties-night-grid';
  const container   = document.getElementById(containerId);
  if (!container || container.children.length >= 8) return;
  const duties = getSettingsState().duties ?? [];
  container.appendChild(_makeDutyRow(shift, container.children.length, { duty: duties[0], count: 1 }, duties));
}

function _reIndexDutyLabels(shift) {
  const containerId = shift === '日班' ? 'duties-day-grid' : 'duties-night-grid';
  const prefix      = shift === '日班' ? '日' : '夜';
  const container   = document.getElementById(containerId);
  if (!container) return;
  [...container.children].forEach((row, i) => {
    row.dataset.idx = i;
    row.querySelector('.duty-label').textContent = `${prefix}${i + 1}`;
  });
}

function _collectDuties() {
  const sites    = getSitesState();
  const existing = _editingSiteId
    ? (sites.find(s => s.id === _editingSiteId)?.duties ?? [])
    : [];

  const result = [];
  for (const shift of ['日班', '夜班']) {
    const containerId = shift === '日班' ? 'duties-day-grid' : 'duties-night-grid';
    const container   = document.getElementById(containerId);
    if (!container) continue;
    for (const row of container.children) {
      const duty  = row.querySelector('select').value;
      const count = parseInt(row.querySelector('input').value) || 1;
      const prev  = existing.find(d => d.shift === shift && d.duty === duty);
      const last  = (prev && prev.count === count) ? prev.last : count;
      result.push({ shift, duty, count, last });
    }
  }
  return result;
}