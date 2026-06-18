// ════════════════════════════════════════════
// pages/data/components/employeeTab.js
// 人員列表 + Modal CRUD
// ════════════════════════════════════════════

import {
  getSitesState, setSitesState,
  getEmployeesState, setEmployeesState,
  getSettingsState, getScheduleState,
} from '../../../core/store/globalState.js';
import { SHIFT, MOBILITY, EMPLOYEE_TEMPLATE } from '../../../shared/constants.js';
import { recalcLast }                    from '../../../core/services/siteService.js';
import { getArrSiteCandidates }          from '../../../core/services/employeeService.js';
import {
  openModal, closeModal, bindModalClose,
  fillRegionSelects, bindEl, fillSelect,
} from '../../../shared/utils/dom.js';
import { showConfirm, showToastMsg } from '../../../shared/utils/notify.js';
import { ValidationError }           from './validation.js';

let _editingEmpId = null;
const _cleanups = [];

// ── 初始化 ────────────────────────────────────
export function mount() {
  bindEl('btn-add-emp',         'click',  () => openEmpModal(null), _cleanups);
  bindEl('btn-save-emp',        'click',  saveEmployee, _cleanups);
  bindEl('emp-search',          'input',  renderEmployees, _cleanups);
  bindEl('emp-shift-filter',    'change', renderEmployees, _cleanups);
  bindEl('emp-mobility-filter', 'change', renderEmployees, _cleanups);
  bindEl('btn-add-arrSites',    'click',  () => _addArrRow(), _cleanups);

  fillSelect('emp-shift-filter',    SHIFT,    '', '全部班段');
  fillSelect('emp-mobility-filter', MOBILITY, '', '全部班別');

  _cleanups.push(bindModalClose('emp-modal'));
  _cleanups.push(bindModalClose('confirm-modal'));

  renderEmployees();
}

export function unmount() {
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;
}

// ── 列表渲染 ──────────────────────────────────
export function renderEmployees() {
  const sites     = getSitesState();
  const employees = getEmployeesState();
  const q              = document.getElementById('emp-search')?.value.trim().toLowerCase() ?? '';
  const shiftFilter    = document.getElementById('emp-shift-filter')?.value ?? '';
  const mobilityFilter = document.getElementById('emp-mobility-filter')?.value ?? '';

  let filtered = employees;
  if (shiftFilter)    filtered = filtered.filter(e => e.shift === shiftFilter);
  if (mobilityFilter) filtered = filtered.filter(e => e.mobility === mobilityFilter);
  if (q) filtered = filtered.filter(e =>
    e.name.includes(q) ||
    e.tel?.includes(q) ||
    (e.addr?.[2] ?? '').includes(q)
  );

  document.getElementById('emp-count').textContent = `共 ${filtered.length} 筆`;
  const tbody = document.getElementById('employees-tbody');
  const empty = document.getElementById('employees-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = ''; empty.style.display = ''; return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = '';

  const schedule = getScheduleState();
  const month    = getSettingsState().month ?? '';

  for (const emp of filtered) {
    const dutyText = emp.duties?.join('、') || '—';
    const arrText = (emp.arrSites ?? [])
      .map(a => {
        const s = sites.find(s => s.id === a.siteId);
        if (!s) return null;
        return `${s.name[1] || s.name[0]}(${a.shift}/${a.duty})`;
      }).filter(Boolean).join('、') || '—';

    // 已排天數：當月 work 格數
    let workedDays = 0;
    if (month) {
      for (const siteId of Object.keys(schedule)) {
        const dayMap = schedule[siteId]?.[emp.id] ?? {};
        workedDays += Object.values(dayMap).filter(v => v === 'work').length;
      }
    }
    const acceptDays = emp.days ?? 0;
    const daysWarn   = acceptDays > 0 && workedDays >= acceptDays;
    const daysHtml   = acceptDays
      ? `<span class="days-badge ${daysWarn ? 'urgent' : workedDays >= acceptDays * 0.8 ? 'warning' : 'ok'}">${workedDays} / ${acceptDays}</span>`
      : `${workedDays}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${emp.name}</td>
      <td>${emp.shift}</td>
      <td><span class="badge badge-${emp.mobility === '正班' ? 'regular' : 'flex'}">${emp.mobility}</span></td>
      <td>${dutyText}</td>
      <td>${arrText}</td>
      <td>${daysHtml}</td>
      <td>${emp.note ?? ''}</td>
      <td>
        <div class="td-actions">
          <button class="icon-btn" title="編輯">✏️</button>
          <button class="icon-btn danger" title="刪除">🗑</button>
        </div>
      </td>`;
    tr.querySelector('[title="編輯"]').addEventListener('click', e => { e.stopPropagation(); openEmpModal(emp.id); });
    tr.querySelector('[title="刪除"]').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`確定要刪除「${emp.name}」嗎？`).then(async ok => {
        if (!ok) return;
        const updated = getEmployeesState().filter(e => e.id !== emp.id);
        await setEmployeesState(updated);
        await setSitesState(recalcLast(getSitesState(), updated));
        renderEmployees();
      });
    });
    tr.addEventListener('click', () => openEmpModal(emp.id));
    tbody.appendChild(tr);
  }
}

// ── Modal ─────────────────────────────────────
export function openEmpModal(id) {
  _editingEmpId = id;
  const employees = getEmployeesState();
  const emp     = id ? employees.find(e => e.id === id) : EMPLOYEE_TEMPLATE();
  const duties  = getSettingsState().duties ?? [];

  document.getElementById('emp-modal-title').textContent = id ? '編輯人員' : '新增人員';
  document.getElementById('e-name').value     = emp.name     ?? '';
  document.getElementById('e-tel').value      = emp.tel      ?? '';
  document.getElementById('e-lastDate').value = emp.lastDate ?? '';
  document.getElementById('e-note').value     = emp.note     ?? '';
  document.getElementById('e-days').value     = emp.days     ?? 1;

  fillRegionSelects('e-city', 'e-dist', _cleanups, emp.addr?.[0], emp.addr?.[1]);
  document.getElementById('e-addr').value = emp.addr?.[2] ?? '';

  fillSelect('e-shift',    SHIFT,    emp.shift    ?? SHIFT[0]);
  fillSelect('e-mobility', MOBILITY, emp.mobility ?? MOBILITY[1]);

  _renderDutyChips(duties, emp.duties ?? []);
  _renderArrList(emp.arrSites ?? []);

  openModal('emp-modal');
}

// ── 表單收割 ──────────────────────────────────
function _getEmployeeFormData() {
  return {
    id:       _editingEmpId ?? crypto.randomUUID(),
    name:     document.getElementById('e-name').value.trim(),
    tel:      document.getElementById('e-tel').value.trim(),
    lastDate: document.getElementById('e-lastDate').value,
    note:     document.getElementById('e-note').value.trim(),
    days:     parseInt(document.getElementById('e-days').value) || 1,
    shift:    document.getElementById('e-shift').value,
    mobility: document.getElementById('e-mobility').value,
    addr: [
      document.getElementById('e-city').value,
      document.getElementById('e-dist').value,
      document.getElementById('e-addr').value.trim(),
    ],
    duties:   [...document.querySelectorAll('#e-duties input:checked')].map(cb => cb.value),
    arrSites: _collectArrList(),
  };
}

// ── 驗證 ──────────────────────────────────────
function _validateEmployeeData(data) {
  const errors = [];
  if (!data.name)          errors.push('請填寫姓名');
  if (!data.addr[2])       errors.push('請填寫詳細地址');
  if (!data.duties.length) errors.push('請選擇至少一項勤務');
  if (data.shift === '日/夜' && data.mobility === '正班') {
    errors.push('機動才能兼日夜班段');
  }

  // 預排列：每列都要選到據點 + 班段 + 勤務
  document.querySelectorAll('#arrSites-list .sub-row').forEach(row => {
    const siteId = row.querySelector('.arr-site-select')?.value;
    const shift  = row.querySelector('.arr-shift-select')?.value;
    const duty   = row.querySelector('.arr-duty-select')?.value;
    if (siteId && (!shift || !duty)) {
      const siteName = getSitesState().find(s => s.id === siteId)?.name?.[0] || '未知社區';
      errors.push(`預排的「${siteName}」未選擇完整的班段／勤務`);
    }
  });

  return errors;
}

// ── 儲存 ──────────────────────────────────────
async function saveEmployee() {
  try {
    const data   = _getEmployeeFormData();
    const errors = _validateEmployeeData(data);
    if (errors.length > 0) throw new ValidationError(errors);

    const employees = getEmployeesState();
    const updated = _editingEmpId
      ? employees.map(e => e.id === _editingEmpId ? data : e)
      : [...employees, data];

    await setEmployeesState(updated);
    await setSitesState(recalcLast(getSitesState(), updated));
    closeModal('emp-modal');
    renderEmployees();

  } catch (err) {
    if (err instanceof ValidationError) {
      showToastMsg(err.messages.join('・'), true);
    } else {
      console.error(err);
      showToastMsg('系統儲存時發生非預期錯誤：' + err.message, true);
    }
  }
}

// ── 勤務 chips ────────────────────────────────
function _renderDutyChips(duties, selected) {
  const grid = document.getElementById('e-duties');
  grid.innerHTML = '';
  for (const d of duties) {
    const chip = document.createElement('label');
    const checked = selected.includes(d);
    chip.className = 'duty-chip' + (checked ? ' selected' : '');
    chip.innerHTML = `<input type="checkbox" value="${d}" ${checked ? 'checked' : ''}>${d}`;
    chip.querySelector('input').addEventListener('change', () => {
      chip.classList.toggle('selected');
      _refreshAllArrRows();
    });
    grid.appendChild(chip);
  }
}

// ── 預排列（arrSites）────────────────────────
const ROW_CSS = 'padding:6px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;';

function _renderArrList(items) {
  const list = document.getElementById('arrSites-list');
  list.innerHTML = '';
  items.forEach(item => list.appendChild(_makeArrRow(item)));
}

function _addArrRow() {
  const list = document.getElementById('arrSites-list');
  list.appendChild(_makeArrRow({}));
}

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
  siteSelect.className   = 'arr-site-select';
  siteSelect.style.cssText = ROW_CSS;

  const shiftSelect = document.createElement('select');
  shiftSelect.className   = 'arr-shift-select';
  shiftSelect.style.cssText = ROW_CSS;

  const dutySelect  = document.createElement('select');
  dutySelect.className   = 'arr-duty-select';
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
    forbSiteIds: sites.filter(s => (s.forbEmp ?? []).some(f => f.empId === _editingEmpId)).map(s => s.id),
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

/** 勤務 chip 變更時，重新刷新所有列的選單（候選池可能改變）*/
function _refreshAllArrRows() {
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

function _collectArrList() {
  return [...document.querySelectorAll('#arrSites-list .sub-row')].map(row => ({
    siteId: row.querySelector('.arr-site-select')?.value ?? '',
    shift:  row.querySelector('.arr-shift-select')?.value ?? '',
    duty:   row.querySelector('.arr-duty-select')?.value ?? '',
  })).filter(a => a.siteId && a.shift && a.duty);
}