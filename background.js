// ════════════════════════════════════════════
// background.js
// ════════════════════════════════════════════

import { DEFAULT_DUTIES, DEFAULT_LEAVE_TYPES, KEYS } from './src/shared/constants.js';

// ── 1. 安裝時初始化預設資料 ───────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
	if (reason !== 'install') return;

	const { [KEYS.SETTINGS]: existingSettings } = await chrome.storage.local.get(KEYS.SETTINGS);
	if (existingSettings) return;

	const d = new Date();
	const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

	await chrome.storage.local.set({
		[KEYS.SETTINGS]: {
			orgName: '', month,
			leaveTypes: [...DEFAULT_LEAVE_TYPES],
			duties: [...DEFAULT_DUTIES],
			holidayMap: {}, holidayRaw: {}, calOverrides: {},
		},
		[KEYS.SITES]: [],
		[KEYS.EMPLOYEES]: [],
		[KEYS.SCHEDULES]: {},
	});
});

// ── 2. 統一訊息處理 (Action Handlers) ─────────
const ACTION_HANDLERS = {
	EXPORT_SCHEDULE:  ({ format }) => exportSchedule(format),
	EXPORT_BASE_DATA: () => exportBaseData(),
	IMPORT_BASE_DATA: ({ data }) => importBaseData(data),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	const handler = Object.hasOwn(ACTION_HANDLERS, msg.action) ? ACTION_HANDLERS[msg.action] : null;
	if (handler) {
		// 統一在頂層捕捉錯誤並回應
		handler(msg)
			.then(res => sendResponse({ ok: true, ...res }))
			.catch(err => sendResponse({ ok: false, error: err.message }));
		return true;
	}
});

// ── 業務邏輯 ──────────────────────────────────
async function exportSchedule(format) {
	const { [KEYS.SETTINGS]: settings = {}, [KEYS.SITES]: sites = [], [KEYS.EMPLOYEES]: employees = [], [KEYS.SCHEDULES]: schedules = {} } = await chrome.storage.local.get(null);
	const month = settings.month;

	if (!month) throw new Error('請先在設定頁選擇排班月份');
	const schedule = schedules[month] ?? {};

	if (format === 'json') {
		const payload = {
			community: _buildCommunityData(sites, employees, schedule),
			employee:  _buildEmployeeData(sites, employees, schedule),
			big:       _buildBigData(sites, employees, schedule),
		};
		_download(JSON.stringify(payload, null, 2), `班表_${month}.json`, 'application/json');
		return;
	}

	await _exportXlsx({ settings, sites, employees, schedule, month });
}

async function exportBaseData() {
	const { [KEYS.SETTINGS]: settings = {}, [KEYS.SITES]: sites = [], [KEYS.EMPLOYEES]: employees = [] } = await chrome.storage.local.get(null);
	const payload = {
		settings: {
			duties:       settings.duties       ?? [],
			leaveTypes:   settings.leaveTypes   ?? [],
			holidayMap:   settings.holidayMap   ?? {},
			holidayRaw:   settings.holidayRaw   ?? {},
			calOverrides: settings.calOverrides ?? {},
		},
		sites,
		employees,
	};
	_download(JSON.stringify(payload, null, 2), `基本資料_${_today()}.json`, 'application/json');
}

async function importBaseData({ settings: inSettings = {}, sites: inSites, employees: inEmployees }) {
	const existing = await chrome.storage.local.get(null);
	
	const merged = {
		[KEYS.SETTINGS]:  _isEmpty(inSettings) ? (existing[KEYS.SETTINGS] || {}) : { ...existing[KEYS.SETTINGS], ...inSettings },
		[KEYS.SITES]:     _isEmpty(inSites) ? (existing[KEYS.SITES] || []) : inSites,
		[KEYS.EMPLOYEES]: _isEmpty(inEmployees) ? (existing[KEYS.EMPLOYEES] || []) : inEmployees,
	};

	await chrome.storage.local.set(merged);
}

// ── 輔助工具 ──────────────────────────────────
async function _exportXlsx(payload) {
	await chrome.offscreen.createDocument({
		url: chrome.runtime.getURL('src/offscrean/offscreen.html'),
		reasons: ['BLOBS'],
		justification: 'ExcelJS 需要 Blob API 產生 XLSX 檔案',
	}).catch(() => {}); // 已存在時忽略

	await chrome.runtime.sendMessage({ action: '_XLSX_EXPORT', payload });
}

function _download(content, filename, mime) {
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