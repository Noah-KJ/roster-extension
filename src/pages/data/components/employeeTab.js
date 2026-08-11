// ════════════════════════════════════════════
// pages/data/components/employeeTab.js
// 人員列表 + Modal CRUD
// （「預排據點」子清單的連動 select 邏輯拆到 arrSitesEditor.js）
// ════════════════════════════════════════════

import {
  getSitesState, setSitesState,
  getEmployeesState, setEmployeesState,
  getSettingsState, getScheduleState,
} from '../../../core/store/globalState.js';
import { SHIFT, MOBILITY, EMPLOYEE_TEMPLATE } from '../../../shared/constants.js';
import { recalcLast }                    from '../../../core/services/siteService.js';
import {
  openModal, closeModal, bindModalClose,
  fillRegionSelects, bindEl, fillSelect,
} from '../../../shared/utils/dom.js';
import { showConfirm, showToastMsg } from '../../../shared/utils/notify.js';
import { geocodeAddress, addrKey }   from '../../../shared/utils/geocode.js';
import { ValidationError }           from './validation.js';
import {
  renderArrList, addArrRow, collectArrList, refreshAllArrRows,
} from './arrSitesEditor.js';

let _editingEmpId = null;
const _cleanups = [];

// ── 初始化 ────────────────────────────────────
export function mount() {
  bindEl('btn-add-emp',         'click',  () => openEmpModal(null), _cleanups);
  bindEl('btn-save-emp',        'click',  saveEmployee, _cleanups);
  bindEl('emp-search',          'input',  renderEmployees, _cleanups);
  bindEl('emp-shift-filter',    'change', renderEmployees, _cleanups);
  bindEl('emp-mobility-filter', 'change', renderEmployees, _cleanups);
  bindEl('btn-add-arrSites',    'click',  () => addArrRow(), _cleanups);

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
  renderArrList(emp.arrSites ?? [], id);

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
    arrSites: collectArrList(),
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

    // 地址有變更，或尚未有座標（例如舊資料）→ 重新地理編碼取得經緯度
    // 供「通勤地圖」使用；地址沒變則沿用既有座標，避免重複呼叫外部服務
    const prevEmp = _editingEmpId ? getEmployeesState().find(e => e.id === _editingEmpId) : null;
    const needsGeocode = !prevEmp || addrKey(prevEmp.addr) !== addrKey(data.addr) || !prevEmp.geo;
    if (needsGeocode) {
      data.geo = await geocodeAddress(...data.addr);
      if (!data.geo) showToastMsg('地址定位失敗，通勤地圖將暫時無法顯示此人員', true);
    } else {
      data.geo = prevEmp.geo;
    }

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
      refreshAllArrRows();
    });
    grid.appendChild(chip);
  }
}
