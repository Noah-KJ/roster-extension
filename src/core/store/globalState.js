// ════════════════════════════════════════════
// core/store/globalState.js
// 唯一記憶體真相來源
// ════════════════════════════════════════════
import {
	getSettings,  setSettings  as _setSettings,
	getSites,     setSites     as _setSites,
	getEmployees, setEmployees as _setEmployees,
	getMonthSchedule, setMonthSchedule as _setMonthSchedule,
} from '../../shared/storage.js';
import {
	DEFAULT_DUTIES, DEFAULT_LEAVE_TYPES, DEFAULT_REGIONS,
	DEFAULT_LOCATED, DEFAULT_ONDUTY_KEY,
} from '../../shared/constants.js';
import { daysUntil } from '../../shared/utils/date.js';

const _state = {
	settings:  {},
	sites:     [],
	employees: [],
	schedule:  {},
};

const _derived = {
	activeSites:     [],
	activeEmployees: [],
	deadlines:       [],
};

const _listeners = new Set();

// ── 初始化 ────────────────────────────────────
export async function init() {
	try {
		const [settings, sites, employees] = await Promise.all([
			getSettings(),
			getSites(),
			getEmployees(),
		]);

		_state.settings = {
			holidayMap:        {},
			holidayRaw:        {},
			calOverrides:      {},
			...settings,
			regions:           settings.regions           ?? DEFAULT_REGIONS,
			leaveTypes:        settings.leaveTypes        ?? DEFAULT_LEAVE_TYPES,
			duties:            settings.duties            ?? DEFAULT_DUTIES,
			located:           settings.located           ?? DEFAULT_LOCATED,
			onDutyKey:         settings.onDutyKey         ?? DEFAULT_ONDUTY_KEY,
			deadlineThreshold: settings.deadlineThreshold ?? 90,
		};
		_state.sites     = sites ?? [];
		_state.employees = employees ?? [];

		const month = _state.settings.month ?? '';
		_state.schedule = month ? await getMonthSchedule(month) : {};

		_rebuildDerived('all');
		_bindStorageListener();
	} catch (error) {
		console.error('[globalState] 初始化失敗:', error);
	}
}

// ── Getter (使用拷貝防止外部直接修改 reference) ────────
export const getSettingsState  = () => structuredClone(_state.settings);
export const getSitesState     = () => structuredClone(_state.sites);
export const getEmployeesState = () => structuredClone(_state.employees);
export const getScheduleState  = () => structuredClone(_state.schedule);
export const getDerived        = () => structuredClone(_state.derived);

// ── Setter (加入 Try-Catch 確保穩定性) ──────────────
export async function setSettingsState(patch) {
	const previous = _state.settings;
	_state.settings = { ..._state.settings, ...patch };
	
	try {
		await _setSettings(_state.settings);
		// 判斷是否更改了月份，如果是的話衍生資料全部都要重算
		const needFullRebuild = patch.month && patch.month !== previous.month;
		_rebuildDerived(needFullRebuild ? 'all' : 'settings');
		_notify('settings');
	} catch (error) {
		console.error('[globalState] 儲存 Settings 失敗:', error);
		_state.settings = previous; // Rollback
	}
}

export async function setSitesState(sites) {
	const previous = _state.sites;
	_state.sites = sites;
	
	try {
		await _setSites(sites);
		_rebuildDerived('sites');
		_notify('sites');
	} catch (error) {
		console.error('[globalState] 儲存 Sites 失敗:', error);
		_state.sites = previous; // Rollback
	}
}

export async function setEmployeesState(employees) {
	const previous = _state.employees;
	_state.employees = employees;
	
	try {
		await _setEmployees(employees);
		_rebuildDerived('employees');
		_notify('employees');
	} catch (error) {
		console.error('[globalState] 儲存 Employees 失敗:', error);
		_state.employees = previous; // Rollback
	}
}

export async function setScheduleState(schedule) {
	const previous = _state.schedule;
	_state.schedule = schedule;
	const month = _state.settings.month ?? '';
	
	try {
		if (month) await _setMonthSchedule(month, schedule);
		_notify('schedule');
	} catch (error) {
		console.error('[globalState] 儲存 Schedule 失敗:', error);
		_state.schedule = previous; // Rollback
	}
}

// ── 衍生資料重算 (根據變更來源精準更新) ─────────────────
function _rebuildDerived(trigger = 'all') {
	const month = _state.settings.month ?? '';

	if (trigger === 'all' || trigger === 'settings' || trigger === 'sites') {
		_derived.activeSites = _state.sites.filter(site => {
		if (!site.CEDate || !month) return true;
		return site.CEDate.slice(0, 7) >= month;
		});
	}

	if (trigger === 'all' || trigger === 'settings' || trigger === 'employees') {
		_derived.activeEmployees = _state.employees.filter(emp => {
		if (!emp.lastDate || !month) return true;
			return emp.lastDate.slice(0, 7) >= month;
		});
	}

	if (trigger === 'all' || trigger === 'sites' || trigger === 'employees') {
		const rows = [];
		for (const site of _state.sites) {
			const label = site.name?.[1] || site.name?.[0] || '';
			if (site.CEDate)  rows.push({ type: '合約日', name: label, date: site.CEDate,  days: daysUntil(site.CEDate) });
			if (site.HOADate) rows.push({ type: '區大日', name: label, date: site.HOADate, days: daysUntil(site.HOADate) });
		}
		for (const emp of _state.employees) {
			if (emp.lastDate) rows.push({ type: '離職日', name: emp.name, date: emp.lastDate, days: daysUntil(emp.lastDate) });
		}
		rows.sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
		_derived.deadlines = rows;
	}
}

// ── 訂閱 ──────────────────────────────────────
export function subscribe(fn) {
	_listeners.add(fn);
	return () => _listeners.delete(fn);
}

function _notify(key) {
	_listeners.forEach(fn => fn(key));
}

// ── chrome.storage.onChanged ──────────────────
let _storageListenerBound = false;

// 簡易版深度比對 (避免自身寫入 Storage 時引發的二次觸發)
const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function _bindStorageListener() {
	if (_storageListenerBound) return;
	_storageListenerBound = true;

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;

		let derivedTrigger = null;

		if (changes.settings && !isEqual(_state.settings, changes.settings.newValue)) {
			const oldMonth = _state.settings.month;
			_state.settings = { ..._state.settings, ...changes.settings.newValue };
			derivedTrigger = (oldMonth !== _state.settings.month) ? 'all' : 'settings';
			_notify('settings');
		}
		
		if (changes.sites && !isEqual(_state.sites, changes.sites.newValue)) {
			_state.sites = changes.sites.newValue ?? [];
			derivedTrigger = derivedTrigger === 'all' ? 'all' : 'sites';
			_notify('sites');
		}
		
		if (changes.employees && !isEqual(_state.employees, changes.employees.newValue)) {
			_state.employees = changes.employees.newValue ?? [];
			// 若 trigger 已經是 all 或 sites，就不覆蓋，避免遺漏重算
			if (!derivedTrigger) derivedTrigger = 'employees';
			else if (derivedTrigger === 'sites') derivedTrigger = 'all';
			_notify('employees');
		}
		
		if (changes.schedules) {
			const month = _state.settings.month ?? '';
			const newSchedule = changes.schedules.newValue?.[month] ?? {};
			if (!isEqual(_state.schedule, newSchedule)) {
				_state.schedule = newSchedule;
				_notify('schedule');
			}
		}

		// 統一重算衍生資料
		if (derivedTrigger) {
			_rebuildDerived(derivedTrigger);
		}
	});
}