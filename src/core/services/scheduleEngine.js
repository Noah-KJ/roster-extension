// ════════════════════════════════════════════
// core/services/scheduleEngine.js
// 排班狀態機——純函式，不碰 DOM / storage
// ════════════════════════════════════════════

/**
 * 取得下一個/上一個狀態，利用模數運算統一邏輯
 */
function getCycleValue(current, sequence, direction = 'forward') {
	const delta = direction === 'backward' ? -1 : 1;
	const idx = sequence.indexOf(current);
	const curIdx = idx === -1 ? sequence.length - 1 : idx; // 找不到或 undefined 預設從最後開始算
	const nextIdx = (curIdx + delta + sequence.length) % sequence.length;
	return sequence[nextIdx];
}

/**
 * 人員班表 / 社區班表 點擊格後，計算整個 schedule 的下一個狀態
 */
export function applyClick({ schedule, siteId, empId, day, leaveTypes, emp, direction = 'forward' }) {
	// 只淺拷貝會被動到的路徑（非整包 structuredClone），維持與其他 site/emp 資料的參照共用
	const next = { ...schedule };
	next[siteId] = { ...next[siteId] };
	next[siteId][empId] = { ...next[siteId][empId] };

	const cur = next[siteId][empId][day];
	const otherSiteIds = (emp.arrSites ?? []).map(a => a.siteId).filter(id => id !== siteId);

	// ── 特殊規則：點擊 dash 格 → 與 work 格互換 ──
	if (cur === 'dash') {
		const workSiteId = [siteId, ...otherSiteIds].find(sid => next[sid]?.[empId]?.[day] === 'work');
		if (workSiteId !== undefined) {
			next[siteId][empId][day] = 'work';
			next[workSiteId] = { ...next[workSiteId] };
			next[workSiteId][empId] = { ...next[workSiteId][empId] };
			next[workSiteId][empId][day] = 'dash';
		} else {
			delete next[siteId][empId][day];
		}
		return next;
	}

	// ── 一般循環：undefined → work → leave... → undefined ──
	const sequence = [undefined, 'work', ...leaveTypes];
	const nextVal = getCycleValue(cur, sequence, direction);

	if (nextVal === undefined) delete next[siteId][empId][day];
	else next[siteId][empId][day] = nextVal;

	for (const otherId of otherSiteIds) {
		next[otherId] = { ...next[otherId] };
		next[otherId][empId] = { ...next[otherId][empId] };

		if (nextVal === 'work') {
			next[otherId][empId][day] = 'dash';
		} else if (nextVal === undefined) {
			delete next[otherId][empId][day];
		} else {
			next[otherId][empId][day] = nextVal;
		}
	}

	return next;
}

/**
 * 大班表點擊：循環「預排據點代表字 → 假別 → undefined」
 */
export function applyBigClick({ schedule, empId, day, leaveTypes, emp, sites, direction = 'forward' }) {
	// 只淺拷貝會被動到的路徑（非整包 structuredClone），維持與其他 site/emp 資料的參照共用
	const next = { ...schedule };
	const arrSiteIds = [...new Set((emp.arrSites ?? []).map(a => a.siteId))];

	if (arrSiteIds.length === 0) return next;

	// 找目前狀態
	let cur; 
	const workSiteId = arrSiteIds.find(sid => next[sid]?.[empId]?.[day] === 'work');
	if (workSiteId !== undefined) {
		cur = workSiteId;
	} else {
		for (const sid of arrSiteIds) {
			const v = next[sid]?.[empId]?.[day];
			if (v && v !== 'dash') { cur = v; break; }
		}
	}

	const sequence = [...arrSiteIds, ...leaveTypes, undefined];
	const nextVal = getCycleValue(cur, sequence, direction);

	// 套用到所有預排據點
	for (const sid of arrSiteIds) {
		next[sid] = { ...next[sid] };
		next[sid][empId] = { ...next[sid][empId] };

		if (nextVal === undefined) {
			delete next[sid][empId][day];
		} else if (arrSiteIds.includes(nextVal)) {
			next[sid][empId][day] = (sid === nextVal) ? 'work' : 'dash';
		} else {
			next[sid][empId][day] = nextVal;
		}
	}

	return next;
}
