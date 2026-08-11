// ════════════════════════════════════════════
// pages/data/components/arrSitesEditor.js
// 人員 Modal 內的「預排據點」子清單
// 三個 select（據點 / 班段 / 勤務）彼此連動，候選池由
// employeeService.getArrSiteCandidates 依人員班段／掌握勤務／名額計算
// ════════════════════════════════════════════

import { getSitesState }        from '../../../core/store/globalState.js';
import { getArrSiteCandidates } from '../../../core/services/employeeService.js';

const ROW_CSS = 'padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;';

let _currentEmpId = null; // 目前編輯中的人員 id（新增時為 null）；用於排除禁排據點

/** 依 items 重繪整個「預排據點」清單；editingEmpId 傳目前編輯中的人員 id（新增時傳 null） */
export function renderArrList(items, editingEmpId) {
  _currentEmpId = editingEmpId;
  const list = document.getElementById('arrSites-list');
  list.innerHTML = '';
  items.forEach(item => list.appendChild(_makeArrRow(item)));
}

/** 新增一列空白的「預排」 */
export function addArrRow() {
  document.getElementById('arrSites-list').appendChild(_makeArrRow({}));
}

/** 收集目前所有列的 { siteId, shift, duty }（只留三者都選好的列） */
export function collectArrList() {
  return [...document.querySelectorAll('#arrSites-list .sub-row')].map(row => ({
    siteId: row.querySelector('.arr-site-select')?.value ?? '',
    shift:  row.querySelector('.arr-shift-select')?.value ?? '',
    duty:   row.querySelector('.arr-duty-select')?.value ?? '',
  })).filter(a => a.siteId && a.shift && a.duty);
}

/** 人員班段／掌握勤務變更時，重新刷新所有列的候選池（候選池可能改變） */
export function refreshAllArrRows() {
  document.querySelectorAll('#arrSites-list .sub-row').forEach(row => {
    const siteSelect  = row.querySelector('.arr-site-select');
    const shiftSelect = row.querySelector('.arr-shift-select');
    const dutySelect  = row.querySelector('.arr-duty-select');
    const prevSite  = siteSelect.value;
    const prevShift = shiftSelect.value;
    const prevDuty  = dutySelect.value;
    _fillArrSiteOptions(row, prevSite);
    _fillArrShiftOptions(row, prevShift);
    _fillArrDutyOptions(row, prevDuty);
  });
}

// ── 內部：單列 DOM ──────────────────────────────
/**
 * 建立一列「預排」：[據點 select] [班段 select] [勤務 select] [✕]
 * 三個 select 互相連動：
 *   - 據點變更 → 重算可用班段（依 site.duties 與人員 shift/duties 交集）
 *   - 班段變更 → 重算可用勤務
 */
function _makeArrRow(item) {
  const row = document.createElement('div');
  row.className = 'sub-row arrSites-row';

  const siteSelect  = document.createElement('select');
  siteSelect.className     = 'arr-site-select';
  siteSelect.style.cssText = ROW_CSS;

  const shiftSelect = document.createElement('select');
  shiftSelect.className     = 'arr-shift-select';
  shiftSelect.style.cssText = ROW_CSS;

  const dutySelect  = document.createElement('select');
  dutySelect.className     = 'arr-duty-select';
  dutySelect.style.cssText = ROW_CSS;

  const delBtn = document.createElement('button');
  delBtn.textContent   = '✕';
  delBtn.style.cssText = 'background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:4px;flex-shrink:0;';
  delBtn.addEventListener('click', () => row.remove());

  row.append(siteSelect, shiftSelect, dutySelect, delBtn);

  // 初始填充
  _fillArrSiteOptions(row, item.siteId);
  _fillArrShiftOptions(row, item.shift);
  _fillArrDutyOptions(row, item.duty);

  siteSelect.addEventListener('change', () => {
    _fillArrShiftOptions(row);
    _fillArrDutyOptions(row);
  });
  shiftSelect.addEventListener('change', () => {
    _fillArrDutyOptions(row);
  });

  return row;
}

/** 取得目前 modal 內的人員班段與已勾選勤務 */
function _getCurrentEmpContext() {
  return {
    empShift:  document.getElementById('e-shift')?.value ?? '',
    empDuties: [...document.querySelectorAll('#e-duties input:checked')].map(cb => cb.value),
    mobility:  document.getElementById('e-mobility')?.value ?? '',
  };
}

/** 收集除自己以外，其他列已選的 { siteId, shift, duty } */
function _collectOtherArr(excludeRow) {
  return [...document.querySelectorAll('#arrSites-list .sub-row')]
    .filter(r => r !== excludeRow)
    .map(r => ({
      siteId: r.querySelector('.arr-site-select')?.value ?? '',
      shift:  r.querySelector('.arr-shift-select')?.value ?? '',
      duty:   r.querySelector('.arr-duty-select')?.value ?? '',
    }))
    .filter(a => a.siteId);
}

/** 填據點選單：依 candidates 計算可選據點（去重） */
function _fillArrSiteOptions(row, selectedSiteId = '') {
  const siteSelect = row.querySelector('.arr-site-select');
  const sites      = getSitesState();
  const { empShift, empDuties, mobility } = _getCurrentEmpContext();
  const others     = _collectOtherArr(row);

  const candidates = getArrSiteCandidates({
    sites, empShift, empDuties, mobility,
    forbSiteIds: sites.filter(s => (s.forbEmp ?? []).some(f => f.empId === _currentEmpId)).map(s => s.id),
    alreadyArr: others,
  });

  // 去重據點 id
  const siteIds = [...new Set(candidates.map(c => c.site.id))];

  siteSelect.innerHTML = '<option value="">選擇據點</option>';
  for (const id of siteIds) {
    const site = sites.find(s => s.id === id);
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = site.name[1] || site.name[0];
    if (id === selectedSiteId) opt.selected = true;
    siteSelect.appendChild(opt);
  }

  // 若原本選的據點已不在候選中（例如編輯既有資料），仍保留顯示
  if (selectedSiteId && !siteIds.includes(selectedSiteId)) {
    const site = sites.find(s => s.id === selectedSiteId);
    if (site) {
      const opt = document.createElement('option');
      opt.value = selectedSiteId; opt.textContent = site.name[1] || site.name[0];
      opt.selected = true;
      siteSelect.appendChild(opt);
    }
  }
}

/** 填班段選單：依選定據點 + 人員班段交集 */
function _fillArrShiftOptions(row, selectedShift = '') {
  const siteSelect  = row.querySelector('.arr-site-select');
  const shiftSelect = row.querySelector('.arr-shift-select');
  const siteId = siteSelect.value;

  shiftSelect.innerHTML = '<option value="">班段</option>';
  if (!siteId) return;

  const sites = getSitesState();
  const site  = sites.find(s => s.id === siteId);
  if (!site) return;

  const { empShift, empDuties, mobility } = _getCurrentEmpContext();
  const others    = _collectOtherArr(row);
  const candidates = getArrSiteCandidates({
    sites, empShift, empDuties, mobility,
    forbSiteIds: [],
    alreadyArr: others,
  }).filter(c => c.site.id === siteId);

  const shifts = [...new Set(candidates.map(c => c.shift))];
  for (const s of shifts) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (s === selectedShift) opt.selected = true;
    shiftSelect.appendChild(opt);
  }
  if (selectedShift && !shifts.includes(selectedShift)) {
    const opt = document.createElement('option');
    opt.value = selectedShift; opt.textContent = selectedShift;
    opt.selected = true;
    shiftSelect.appendChild(opt);
  }
}

/** 填勤務選單：依選定據點 + 班段交集 */
function _fillArrDutyOptions(row, selectedDuty = '') {
  const siteSelect  = row.querySelector('.arr-site-select');
  const shiftSelect = row.querySelector('.arr-shift-select');
  const dutySelect  = row.querySelector('.arr-duty-select');
  const siteId = siteSelect.value;
  const shift  = shiftSelect.value;

  dutySelect.innerHTML = '<option value="">選擇勤務</option>';
  if (!siteId || !shift) return;

  const sites = getSitesState();
  const { empShift, empDuties, mobility } = _getCurrentEmpContext();
  const others    = _collectOtherArr(row);
  const candidates = getArrSiteCandidates({
    sites, empShift, empDuties, mobility,
    forbSiteIds: [],
    alreadyArr: others,
  }).filter(c => c.site.id === siteId && c.shift === shift);

  const dutiesAvail = [...new Set(candidates.map(c => c.duty))];
  for (const d of dutiesAvail) {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    if (d === selectedDuty) opt.selected = true;
    dutySelect.appendChild(opt);
  }
  if (selectedDuty && !dutiesAvail.includes(selectedDuty)) {
    const opt = document.createElement('option');
    opt.value = selectedDuty; opt.textContent = selectedDuty;
    opt.selected = true;
    dutySelect.appendChild(opt);
  }
}
