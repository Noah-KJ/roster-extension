// ════════════════════════════════════════════
// core/services/scheduleEngine.js
// 排班狀態機——純函式，不碰 DOM / storage
// ════════════════════════════════════════════

/**
 * 假別循環：undefined → 'work' → leave[0] → … → leave[n-1] → undefined
 */
export function nextLeave(current, leaveTypes) {
  if (current === undefined)  return 'work';
  if (current === 'work')     return leaveTypes[0];
  const idx = leaveTypes.indexOf(current);
  if (idx !== -1 && idx < leaveTypes.length - 1) return leaveTypes[idx + 1];
  if (idx === leaveTypes.length - 1)              return undefined;
  return 'work';
}

/**
 * 反向假別循環：undefined ← work ← leave[0] ← … ← leave[n-1] ← undefined
 */
export function prevLeave(current, leaveTypes) {
  if (current === undefined)              return leaveTypes[leaveTypes.length - 1];
  if (current === leaveTypes[0])          return 'work';
  if (current === 'work')                 return undefined;
  const idx = leaveTypes.indexOf(current);
  if (idx > 0)                            return leaveTypes[idx - 1];
  return undefined;
}

/**
 * 人員班表 / 社區班表 點擊格後，計算整個 schedule 的下一個狀態（immutable）
 *
 * 特殊規則：
 *   - 點擊 'dash' 格 → 與該員工當天的 'work' 格互換（不走 nextLeave 循環）
 *   - 其餘狀態走 nextLeave / prevLeave 線性循環
 *   - 點擊產生 'work' 時，其他預排據點該天設為 'dash'
 *   - 點擊產生假別時，其他預排據點該天同步設為該假別
 *   - 清空時，其他預排據點該天一併清空
 *
 * @param {object} params
 * @param {object}   params.schedule
 * @param {string}   params.siteId
 * @param {string}   params.empId
 * @param {number}   params.day
 * @param {string[]} params.leaveTypes
 * @param {Employee} params.emp
 * @param {'forward'|'backward'} [params.direction='forward']
 * @returns {object}
 */
export function applyClick({ schedule, siteId, empId, day, leaveTypes, emp, direction = 'forward' }) {
  const next = { ...schedule };
  const cur  = next[siteId]?.[empId]?.[day];

  const otherSiteIds = (emp.arrSites ?? [])
    .map(a => a.siteId)
    .filter(id => id !== siteId);

  // ── 特殊規則：點擊 dash 格 → 與 work 格互換 ──
  if (cur === 'dash') {
    // 找出該員工當天哪個據點是 'work'
    const workSiteId = [siteId, ...otherSiteIds].find(
      sid => next[sid]?.[empId]?.[day] === 'work'
    );

    if (workSiteId !== undefined) {
      next[siteId] = { ...next[siteId] };
      next[siteId][empId] = { ...next[siteId][empId] };
      next[siteId][empId][day] = 'work';

      next[workSiteId] = { ...next[workSiteId] };
      next[workSiteId][empId] = { ...next[workSiteId][empId] };
      next[workSiteId][empId][day] = 'dash';

      return next;
    }
    // 若找不到 work 格（理論上不會發生），falls through 走一般清空
    next[siteId] = { ...next[siteId] };
    next[siteId][empId] = { ...next[siteId][empId] };
    delete next[siteId][empId][day];
    return next;
  }

  // ── 一般循環 ──
  const nextVal = direction === 'backward'
    ? prevLeave(cur, leaveTypes)
    : nextLeave(cur, leaveTypes);

  next[siteId] = { ...next[siteId] };
  next[siteId][empId] = { ...next[siteId][empId] };
  if (nextVal === undefined) {
    delete next[siteId][empId][day];
  } else {
    next[siteId][empId][day] = nextVal;
  }

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
 *
 * 序列：undefined → site[0].repChar(work) → site[1].repChar(work) → ...
 *       → leave[0] → ... → leave[n-1] → undefined
 *
 * 循環到某據點代表字時，該據點設為 'work'，其餘預排據點設為 'dash'。
 * 循環到假別時，所有預排據點該天都設為該假別。
 * 循環到 undefined 時，所有預排據點該天清空。
 *
 * @param {object} params
 * @param {object}   params.schedule
 * @param {string}   params.empId
 * @param {number}   params.day
 * @param {string[]} params.leaveTypes
 * @param {Employee} params.emp        - 含 arrSites
 * @param {Site[]}   params.sites      - 含 name[2] 代表字
 * @param {'forward'|'backward'} [params.direction='forward']
 * @returns {object}
 */
export function applyBigClick({ schedule, empId, day, leaveTypes, emp, sites, direction = 'forward' }) {
  const next = { ...schedule };
  const arrSiteIds = [...new Set((emp.arrSites ?? []).map(a => a.siteId))];

  if (arrSiteIds.length === 0) return next;

  // 找目前狀態：哪個據點是 work？還是假別？還是空白？
  let cur; // undefined | siteId | leaveType
  const workSiteId = arrSiteIds.find(sid => next[sid]?.[empId]?.[day] === 'work');
  if (workSiteId !== undefined) {
    cur = workSiteId;
  } else {
    // 檢查是否為假別（任一預排據點有相同假別值）
    for (const sid of arrSiteIds) {
      const v = next[sid]?.[empId]?.[day];
      if (v && v !== 'dash') { cur = v; break; }
    }
  }

  // 建立完整循環序列：[siteId, siteId, ..., leave0, leave1, ..., undefined]
  const sequence = [...arrSiteIds, ...leaveTypes, undefined];

  let curIdx;
  if (cur === undefined) {
    curIdx = sequence.length - 1; // undefined 在序列最後
  } else {
    curIdx = sequence.indexOf(cur);
    if (curIdx === -1) curIdx = sequence.length - 1;
  }

  const delta  = direction === 'backward' ? -1 : 1;
  const nextIdx = (curIdx + delta + sequence.length) % sequence.length;
  const nextVal = sequence[nextIdx];

  // 套用到所有預排據點
  for (const sid of arrSiteIds) {
    next[sid] = { ...next[sid] };
    next[sid][empId] = { ...next[sid][empId] };

    if (nextVal === undefined) {
      delete next[sid][empId][day];
    } else if (arrSiteIds.includes(nextVal)) {
      // nextVal 是一個 siteId → 該據點 work，其他 dash
      next[sid][empId][day] = (sid === nextVal) ? 'work' : 'dash';
    } else {
      // nextVal 是假別 → 全部同步
      next[sid][empId][day] = nextVal;
    }
  }

  return next;
}