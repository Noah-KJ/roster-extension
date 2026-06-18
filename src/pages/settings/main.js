// ════════════════════════════════════════════
// pages/settings/main.js
// 設定頁進入點
// ════════════════════════════════════════════

import { getSettingsState, setSettingsState } from '../../core/store/globalState.js';
import { setupCardToggles, bindEl }           from '../../shared/utils/dom.js';
import { showHint }                           from '../../shared/utils/notify.js';
import { setupChipManager }                   from './components/chipManager.js';
import { setupCalendar, renderCalendar }      from './components/calendarView.js';
import {
  DEFAULT_LEAVE_TYPES, DEFAULT_DUTIES,
  DEFAULT_REGIONS, DEFAULT_LOCATED, DEFAULT_ONDUTY_KEY,
} from '../../shared/constants.js';

const _cleanups = [];
const TODAY     = new Date();

// calendarView 共享的可變狀態，以物件傳入讓 component 可寫回
const _calCtx = { calYear: 0, calMonth: 0, cleanups: _cleanups };

// ── 初始化 ────────────────────────────────────
export async function mount() {
  const settings = getSettingsState();

  document.getElementById('org-name').value       = settings.orgName ?? '';
  document.getElementById('schedule-month').value = settings.month   ?? '';

  const [y, m] = (settings.month ?? `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}`).split('-');
  _calCtx.calYear  = parseInt(y);
  _calCtx.calMonth = parseInt(m) - 1;

  setupCardToggles('#page-settings', _cleanups);
  _setupBasic();
  _setupChips();
  setupCalendar(_calCtx);
}

export function unmount() {
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;
}

// ── 基本設定 ──────────────────────────────────
function _setupBasic() {
  const el = document.getElementById('btn-save-basic');
  if (!el) return;
  const h = async () => {
    const orgName = document.getElementById('org-name').value.trim();
    const month   = document.getElementById('schedule-month').value;
    await setSettingsState({ orgName, month });
    if (month) {
      const [y, m] = month.split('-');
      _calCtx.calYear  = parseInt(y);
      _calCtx.calMonth = parseInt(m) - 1;
      renderCalendar(_calCtx);
    }
    showHint('basic-hint');
  };
  el.addEventListener('click', h);

  bindEl('btn-save-key', 'click', async () => {
    const onDutyKey = [
      document.getElementById('on-duty-key').value   || DEFAULT_ONDUTY_KEY[0],
      document.getElementById('non-empty-key').value || DEFAULT_ONDUTY_KEY[1],
      document.getElementById('empty-key').value     || DEFAULT_ONDUTY_KEY[2],
    ];
    await setSettingsState({ onDutyKey });
    showHint('basic-hint');
  }, _cleanups);
  
  _cleanups.push(() => el.removeEventListener('click', h));
}

// ── Chip 管理器（假別 / 勤務 / 轄區 / 駐地）──
function _setupChips() {
  const configs = [
    {
      stateKey: 'leaveTypes', defaults: DEFAULT_LEAVE_TYPES,
      containerId: 'leave-chips', inputId: 'leave-input',
      addBtnId: 'btn-add-leave', hintId: 'leave-hint',
    },
    {
      stateKey: 'regions', defaults: DEFAULT_REGIONS,
      containerId: 'region-chips', inputId: 'region-input',
      addBtnId: 'btn-add-region', hintId: 'region-hint',
    },
    {
      stateKey: 'locateds', defaults: DEFAULT_LOCATED,
      containerId: 'located-chips', inputId: 'located-input',
      addBtnId: 'btn-add-located', hintId: 'located-hint',
    },
    {
      stateKey: 'duties', defaults: DEFAULT_DUTIES,
      containerId: 'duty-chips', inputId: 'duty-input',
      addBtnId: 'btn-add-duty', hintId: 'duty-hint',
    },
  ];

  for (const cfg of configs) {
    setupChipManager({ ...cfg, cleanups: _cleanups });
  }
}