// ════════════════════════════════════════════
// background.js
// ════════════════════════════════════════════

import { DEFAULT_DUTIES, DEFAULT_LEAVE_TYPES, KEYS } from './src/shared/constants.js';
import { buildHolidayDaySet } from './src/core/services/holidayService.js';

const SPA_URL = chrome.runtime.getURL('index.html');

// ── 1. 安裝時初始化預設資料 ───────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;

  const existing = await chrome.storage.local.get(KEYS.SETTINGS);
  if (existing[KEYS.SETTINGS]) return;

  const d     = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  await chrome.storage.local.set({
    [KEYS.SETTINGS]: {
      orgName:      '',
      month,
      leaveTypes:   [...DEFAULT_LEAVE_TYPES],
      duties:       [...DEFAULT_DUTIES],
      holidayMap:   {},
      holidayRaw:   {},
      calOverrides: {},
    },
    [KEYS.SITES]:     [],
    [KEYS.EMPLOYEES]: [],
    [KEYS.SCHEDULES]: {},
  });
});

// ── 2. 統一訊息處理 ───────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case 'EXPORT_SCHEDULE':
      exportSchedule(msg.format).then(sendResponse);
      return true;

    case 'EXPORT_BASE_DATA':
      exportBaseData().then(sendResponse);
      return true;

    case 'IMPORT_BASE_DATA':
      importBaseData(msg.data).then(sendResponse);
      return true;
  }
});

// ── exportSchedule ────────────────────────────
async function exportSchedule(format) {
  try {
    const raw       = await chrome.storage.local.get(null);
    const settings  = raw[KEYS.SETTINGS]  ?? {};
    const sites     = raw[KEYS.SITES]     ?? [];
    const employees = raw[KEYS.EMPLOYEES] ?? [];
    const month     = settings.month ?? '';

    if (!month) return { ok: false, error: '請先在設定頁選擇排班月份' };

    const allSchedules = raw[KEYS.SCHEDULES] ?? {};
    const schedule     = allSchedules[month] ?? {};

    if (format === 'json') {
      _download(
        JSON.stringify({
          community: _buildCommunityData(sites, employees, schedule),
          employee:  _buildEmployeeData(sites, employees, schedule),
          big:       _buildBigData(sites, employees, schedule),
        }, null, 2),
        `班表_${month}.json`,
        'application/json',
      );
      return { ok: true };
    }

    // xlsx：透過 offscreen document 執行（service worker 沒有 DOM）
    await _exportXlsx({ settings, sites, employees, schedule, month });
    return { ok: true };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── exportBaseData ────────────────────────────
async function exportBaseData() {
  try {
    const raw      = await chrome.storage.local.get(null);
    const settings = raw[KEYS.SETTINGS]  ?? {};
    const payload  = {
      settings: {
        duties:       settings.duties       ?? [],
        leaveTypes:   settings.leaveTypes   ?? [],
        holidayMap:   settings.holidayMap   ?? {},
        holidayRaw:   settings.holidayRaw   ?? {},
        calOverrides: settings.calOverrides ?? {},
      },
      sites:     raw[KEYS.SITES]     ?? [],
      employees: raw[KEYS.EMPLOYEES] ?? [],
    };
    _download(JSON.stringify(payload, null, 2), `基本資料_${_today()}.json`, 'application/json');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── importBaseData ────────────────────────────
async function importBaseData(incoming) {
  try {
    const raw      = await chrome.storage.local.get(null);
    const existing = {
      settings:  raw[KEYS.SETTINGS]  ?? {},
      sites:     raw[KEYS.SITES]     ?? [],
      employees: raw[KEYS.EMPLOYEES] ?? [],
    };

    // 覆蓋規則：
    //   - 匯入的 key 為空（空物件 / 空陣列）→ 保留現有
    //   - 兩邊都有資料 → 用匯入的覆蓋
    const merged = {};

    const inSettings = incoming.settings ?? {};
    merged[KEYS.SETTINGS] = _isEmpty(inSettings)
      ? existing.settings
      : { ...existing.settings, ...inSettings };

    merged[KEYS.SITES] = _isEmpty(incoming.sites ?? [])
      ? existing.sites
      : incoming.sites;

    merged[KEYS.EMPLOYEES] = _isEmpty(incoming.employees ?? [])
      ? existing.employees
      : incoming.employees;

    await chrome.storage.local.set(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── xlsx 輸出（透過 offscreen document）────────
async function _exportXlsx(payload) {
  // offscreen document 負責執行 ExcelJS（需要 DOM / Blob）
  await chrome.offscreen.createDocument({
    url:    chrome.runtime.getURL('src/offscrean/offscreen.html'),
    reasons: ['BLOBS'],
    justification: 'ExcelJS 需要 Blob API 產生 XLSX 檔案',
  }).catch(() => {});   // 已存在時忽略

  await chrome.runtime.sendMessage({ action: '_XLSX_EXPORT', payload });
}

// ── JSON 下載（service worker 用 data URL trick）
function _download(content, filename, mime) {
  // service worker 無法直接觸發下載，改用開新分頁的方式
  const dataUrl = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}

// ── 班表資料轉換輔助 ──────────────────────────
function _buildCommunityData(sites, employees, schedule) {
  return sites.map(site => ({
    site: site.name[1] || site.name[0],
    rows: employees.map(emp => ({
      name:  emp.name,
      days:  schedule[site.id]?.[emp.id] ?? {},
    })),
  }));
}

function _buildEmployeeData(sites, employees, schedule) {
  return employees.map(emp => ({
    name: emp.name,
    rows: sites.map(site => ({
      site: site.name[1] || site.name[0],
      days: schedule[site.id]?.[emp.id] ?? {},
    })),
  }));
}

function _buildBigData(sites, employees, schedule) {
  return employees.map(emp => {
    const days = {};
    for (const site of sites) {
      const dayMap = schedule[site.id]?.[emp.id];
      if (!dayMap) continue;
      for (const [d, val] of Object.entries(dayMap)) {
        if (!days[d]) days[d] = val === 'work' || val === 'dash'
          ? (site.name[2] || site.name[1]?.[0] || site.name[0]?.[0] || '?')
          : val;
      }
    }
    return { name: emp.name, days };
  });
}

// ── 工具 ──────────────────────────────────────
function _isEmpty(val) {
  if (Array.isArray(val)) return val.length === 0;
  if (val && typeof val === 'object') return Object.keys(val).length === 0;
  return !val;
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}