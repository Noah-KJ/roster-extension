// ════════════════════════════════════════════
// pages/schedule/main.js
// ════════════════════════════════════════════

import {
  getSettingsState, getScheduleState, setScheduleState,
  subscribe, getDerived,
} from '../../core/store/globalState.js';
import { buildHolidaySet, isHoliday } from '../../core/services/holidayService.js';
import { applyClick, applyBigClick }  from '../../core/services/scheduleEngine.js';
import { DOW_ZH, DEFAULT_ONDUTY_KEY } from '../../shared/constants.js';

const _cleanups = [];
let _holidaySet = new Set();

export async function mount() {
  _rebuildHolidaySet();
  _updateMonthLabel();
  _setupTabs();
  _populateSelects();
  renderBigTable();
  renderCommunityTable();
  renderEmployeeTable();

  const unsub = subscribe(key => {
    if (key === 'settings') {
      _rebuildHolidaySet();
      _updateMonthLabel();
      renderBigTable();
      renderCommunityTable();
      renderEmployeeTable();
    }
    if (key === 'sites' || key === 'employees') {
      _populateSelects();
      renderBigTable();
      renderCommunityTable();
      renderEmployeeTable();
    }
    if (key === 'schedule') {
      renderBigTable();
      renderCommunityTable();
      renderEmployeeTable();
    }
  });
  _cleanups.push(unsub);
}

export function unmount() {
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;
}

function _updateMonthLabel() {
  const month = getSettingsState().month ?? '';
  const el    = document.getElementById('month-label');
  if (el) el.textContent = month
    ? month.replace('-', ' 年 ') + ' 月'
    : '尚未設定月份';
}

function _rebuildHolidaySet() {
  const s = getSettingsState();
  _holidaySet = buildHolidaySet(s.month ?? '', s);
}

function _setupTabs() {
  document.querySelectorAll('#page-schedule .tab-nav .tab').forEach(btn => {
    const h = () => {
      document.querySelectorAll('#page-schedule .tab-nav .tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#page-schedule .tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    };
    btn.addEventListener('click', h);
    _cleanups.push(() => btn.removeEventListener('click', h));
  });
}

function _populateSelects() {
  const { activeSites: sites, activeEmployees: employees } = getDerived();

  const siteSel = document.getElementById('site-select');
  if (siteSel) {
    siteSel.innerHTML = '<option value="">跳至據點…</option>';
    for (const s of sites) {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.name[0];
      siteSel.appendChild(opt);
    }
    const h = () => {
      const id = siteSel.value; if (!id) return;
      document.getElementById(`site-table-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      siteSel.value = '';
    };
    siteSel.addEventListener('change', h);
    _cleanups.push(() => siteSel.removeEventListener('change', h));
  }

  const empSel = document.getElementById('emp-select');
  if (empSel) {
    empSel.innerHTML = '<option value="">跳至人員…</option>';
    for (const e of employees) {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.name;
      empSel.appendChild(opt);
    }
    const h = () => {
      const id = empSel.value; if (!id) return;
      document.getElementById(`emp-table-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      empSel.value = '';
    };
    empSel.addEventListener('change', h);
    _cleanups.push(() => empSel.removeEventListener('change', h));
  }
}

function _getMonthMeta() {
  const month = getSettingsState().month ?? '';
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  return { y, m, days: new Date(y, m, 0).getDate() };
}

/**
 * { id → day } Map，只收錄 dateField 落在 monthStr 內的項目
 */
function _buildDayMap(arr, dateField, monthStr) {
  const map = {};
  for (const item of arr) {
    const date = item[dateField];
    if (!date || date.slice(0, 7) !== monthStr) continue;
    map[item.id] = parseInt(date.slice(8));
  }
  return map;
}

// ── 格狀態 ────────────────────────────────────
function _applyCellState(td, val, readonly = false) {
  const onDutyKey = getSettingsState().onDutyKey ?? DEFAULT_ONDUTY_KEY;
  td.classList.remove('state-work', 'state-pending', 'state-leave', 'state-dash');
  if (val === undefined)   { td.classList.add('state-pending'); td.textContent = onDutyKey[2] ?? ''; }
  else if (val === 'work') { td.classList.add('state-work');    td.textContent = onDutyKey[0]; }
  else if (val === 'dash') { td.classList.add('state-dash');    td.textContent = onDutyKey[1]; }
  else                     { td.classList.add('state-leave');   td.textContent = val; }
  if (readonly) td.style.pointerEvents = 'none';
}

function _applyCellBg(td, isHol, isDistDay, isBlocked) {
  if (isBlocked) {
    td.classList.remove('col-holiday');
    td.style.background    = '#111';
    td.style.pointerEvents = 'none';
    return;
  }
  if (isDistDay) {
    td.classList.remove('col-holiday');
    td.style.background = 'rgba(255, 107, 107, 0.18)';
    return;
  }
  if (isHol) td.classList.add('col-holiday');
}

// ── 大班表（可點擊）──────────────────────────
export function renderBigTable() {
  const wrap = document.getElementById('big-wrap');
  if (!wrap) return;
  const meta = _getMonthMeta();
  if (!meta) { wrap.innerHTML = '<p class="empty-state">請先在設定頁選擇排班月份</p>'; return; }

  const { y, m, days }                           = meta;
  const { activeSites: sites, activeEmployees: employees } = getDerived();
  const schedule   = getScheduleState();
  const monthStr   = `${y}-${String(m).padStart(2, '0')}`;
  const resignDayMap = _buildDayMap(employees, 'lastDate', monthStr);
  wrap.innerHTML   = '';

  const table = _makeTable('big-table', days);
  _buildDateHeader(table, '大班表', y, m, days, null);

  const tbody = document.createElement('tbody');
  for (const emp of employees) {
    const tr       = document.createElement('tr');
    const labelTd  = document.createElement('td');
    labelTd.className   = 'row-label';
    labelTd.textContent = emp.name;
    tr.appendChild(labelTd);

    const resignDay = resignDayMap[emp.id] ?? null;
    const hasArr    = (emp.arrSites ?? []).length > 0;

    for (let d = 1; d <= days; d++) {
      const hol       = isHoliday(_holidaySet, y, m, d);
      const isBlocked = resignDay !== null && d > resignDay;
      const td        = document.createElement('td');
      td.className    = 'day-cell';

      if (isBlocked) {
        _applyCellBg(td, false, false, true);
        td.textContent = '';
      } else {
        let cellVal = ''; let cellColor = '';
        for (const site of sites) {
          const v = schedule[site.id]?.[emp.id]?.[d];
          if (v === undefined) continue;
          if (v === 'work')  {
            cellVal   = site.name[2] || site.name[1]?.[0] || site.name[0]?.[0] || '?';
            cellColor = 'var(--text2)';
            break;
          }
          if (v === 'dash') continue;
          cellVal = v; break;
        }
        _applyCellBg(td, hol, false, false);
        _applyCellState(td, cellVal || undefined, !hasArr);
        if (cellColor) td.style.color = cellColor;

        // 有預排據點的人員才能點擊循環
        if (hasArr) {
          td.style.cursor = 'pointer';
          td.addEventListener('click',       () => _onBigCellClick({ empId: emp.id, day: d }));
          td.addEventListener('contextmenu', e => { e.preventDefault(); _onBigCellClick({ empId: emp.id, day: d, direction: 'backward' }); });
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

// ── 社區班表（據點 tab，可點擊）──────────────
export function renderCommunityTable() {
  const wrap = document.getElementById('community-wrap');
  if (!wrap) return;
  const meta = _getMonthMeta();
  if (!meta) { wrap.innerHTML = '<p class="empty-state">請先在設定頁選擇排班月份</p>'; return; }

  const { y, m, days }                           = meta;
  const { activeSites: sites, activeEmployees: employees } = getDerived();
  const schedule   = getScheduleState();
  const monthStr   = `${y}-${String(m).padStart(2, '0')}`;
  const distDayMap = _buildDayMap(sites,     'HOADate',  monthStr);
  const resignDayMap = _buildDayMap(employees, 'lastDate', monthStr);
  wrap.innerHTML   = '';

  for (const site of sites) {
    const siteData  = schedule[site.id] ?? {};
    const distDay   = distDayMap[site.id] ?? null;

    // 按 arrSites 的每個 { siteId, shift, duty } 找出對應員工
    // 每個 (emp, shift, duty) 組合一行
    const rows = [];
    for (const emp of employees) {
      const arr = (emp.arrSites ?? []).filter(a => a.siteId === site.id);
      for (const a of arr) {
        rows.push({ emp, shift: a.shift, duty: a.duty });
      }
    }

    if (rows.length === 0) continue;

    const table = _makeTable(`site-table-${site.id}`, days);
    _buildDateHeader(table, site.name[1] || site.name[0], y, m, days, distDay);

    const tbody = document.createElement('tbody');

    // 正班先、機動後；同班別內按班段排序
    const sorted = [
      ...rows.filter(r => r.emp.mobility === '正班'),
      ...rows.filter(r => r.emp.mobility !== '正班'),
    ];

    for (const { emp, shift, duty } of sorted) {
      tbody.appendChild(_makeScheduleRow({
        emp, siteId: site.id, siteData, y, m, days,
        distDay, resignDayMap,
        rowLabel: `${emp.name} ${shift} ${duty}`,
      }));
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }
}

// ── 人員班表（人員 tab，可點擊）──────────────
export function renderEmployeeTable() {
  const wrap = document.getElementById('employee-wrap');
  if (!wrap) return;
  const meta = _getMonthMeta();
  if (!meta) { wrap.innerHTML = '<p class="empty-state">請先在設定頁選擇排班月份</p>'; return; }

  const { y, m, days }                           = meta;
  const { activeSites: sites, activeEmployees: employees } = getDerived();
  const schedule   = getScheduleState();
  const monthStr   = `${y}-${String(m).padStart(2, '0')}`;
  const distDayMap = _buildDayMap(sites,     'HOADate',  monthStr);
  const resignDayMap = _buildDayMap(employees, 'lastDate', monthStr);
  wrap.innerHTML   = '';

  for (const emp of employees) {
    const arrSites = emp.arrSites ?? [];
    if (arrSites.length === 0) continue;

    const table = _makeTable(`emp-table-${emp.id}`, days);
    _buildDateHeader(table, emp.name, y, m, days, null);

    const tbody = document.createElement('tbody');

    for (const { siteId, shift, duty } of arrSites) {
      const site     = sites.find(s => s.id === siteId);
      if (!site) continue;
      const siteData = schedule[siteId] ?? {};
      const distDay  = distDayMap[siteId] ?? null;

      tbody.appendChild(_makeScheduleRow({
        emp, siteId, siteData, y, m, days,
        distDay, resignDayMap,
        rowLabel: `${site.name[1] || site.name[0]} ${shift} ${duty}`,
      }));
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }
}

// ── 點擊格 ────────────────────────────────────
async function _onCellClick({ empId, siteId, day, direction = 'forward' }) {
  const { activeEmployees } = getDerived();
  const emp = activeEmployees.find(e => e.id === empId);
  if (!emp) return;
  const newSchedule = applyClick({
    schedule:   getScheduleState(),
    siteId, empId, day, direction,
    leaveTypes: getSettingsState().leaveTypes ?? [],
    emp,
  });
  await setScheduleState(newSchedule);
}

// ── 大班表點擊 ────────────────────────────────
async function _onBigCellClick({ empId, day, direction = 'forward' }) {
  const { activeSites: sites, activeEmployees: employees } = getDerived();
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const newSchedule = applyBigClick({
    schedule:   getScheduleState(),
    empId, day, direction,
    leaveTypes: getSettingsState().leaveTypes ?? [],
    emp,
    sites,
  });
  await setScheduleState(newSchedule);
}

// ── DOM 輔助 ──────────────────────────────────
function _makeTable(id, days) {
  const table          = document.createElement('table');
  table.className      = 'schedule-table';
  table.id             = id;
  table.style.width    = `calc(var(--row-label) + ${days} * var(--cell-w))`;
  table.style.marginBottom = '32px';
  return table;
}

function _buildDateHeader(table, cornerLabel, y, m, days, districtDay = null) {
  const thead  = document.createElement('thead');
  const headTr = document.createElement('tr');
  const cornerTh = document.createElement('th');
  cornerTh.className   = 'row-label';
  cornerTh.textContent = cornerLabel;
  headTr.appendChild(cornerTh);
  for (let d = 1; d <= days; d++) {
    const dow       = new Date(y, m - 1, d).getDay();
    const hol       = isHoliday(_holidaySet, y, m, d);
    const isDistDay = districtDay === d;
    const th        = document.createElement('th');
    if (isDistDay) {
      th.className        = 'day-header';
      th.style.background = 'rgba(255, 107, 107, 0.3)';
      th.style.color      = '#ff8080';
    } else {
      th.className = 'day-header' + (hol ? ' is-holiday' : '');
    }
    th.innerHTML = `${d}<span class="dow">${DOW_ZH[dow]}</span>`;
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);
}

function _makeScheduleRow({ emp, siteId, siteData, y, m, days, distDay, resignDayMap, rowLabel }) {
  const tr        = document.createElement('tr');
  const resignDay = resignDayMap?.[emp.id] ?? null;

  const labelTd       = document.createElement('td');
  labelTd.className   = 'row-label';
  labelTd.textContent = rowLabel;
  tr.appendChild(labelTd);

  for (let d = 1; d <= days; d++) {
    const hol       = isHoliday(_holidaySet, y, m, d);
    const isDistDay = distDay === d;
    const isBlocked = resignDay !== null && d > resignDay;
    const td        = document.createElement('td');
    td.className    = 'day-cell';

    if (isBlocked) {
      _applyCellBg(td, false, false, true);
    } else {
      _applyCellBg(td, hol, isDistDay, false);
      _applyCellState(td, siteData[emp.id]?.[d]);
      td.addEventListener('click',       () => _onCellClick({ empId: emp.id, siteId, day: d }));
      td.addEventListener('contextmenu', e => { e.preventDefault(); _onCellClick({ empId: emp.id, siteId, day: d, direction: 'backward' }); });
    }
    tr.appendChild(td);
  }
  return tr;
}

function _makeSeparatorRow(days) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan       = days + 1;
  td.style.cssText = 'height:8px;background:transparent;border:none;';
  tr.appendChild(td);
  return tr;
}