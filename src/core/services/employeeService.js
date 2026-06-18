// ════════════════════════════════════════════
// core/services/employeeService.js
// 人員純計算——不碰 DOM / storage
// ════════════════════════════════════════════

/**
 * 取得可預排的據點候選清單
 * 考量人員班段、掌握勤務、禁排、已預排
 *
 * @param {object} params
 * @param {Site[]}   params.sites
 * @param {string}   params.empShift      - '日班' | '夜班' | '日/夜'
 * @param {string[]} params.empDuties     - 已勾選的勤務
 * @param {string}   params.mobility      - '正班' | '機動'
 * @param {string[]} params.forbSiteIds   - 禁排的 siteId[]（目前從 site.forbEmp 反查）
 * @param {Array}    params.alreadyArr    - 已預排 [{ siteId, shift, duty }]
 * @returns {{ site: Site, shift: string, duty: string }[]}
 */
export function getArrSiteCandidates({
  sites,
  empShift,
  empDuties,
  mobility,
  forbSiteIds,
  alreadyArr,
}) {
  const forbidSet = new Set(forbSiteIds);
  const shifts    = empShift === '日/夜' ? ['日班', '夜班'] : [empShift];
  const result    = [];

  for (const site of sites) {
    if (forbidSet.has(site.id)) continue;

    for (const shift of shifts) {
      for (const d of (site.duties ?? [])) {
        if (d.shift !== shift)              continue;
        if (!empDuties.includes(d.duty))   continue;

        // 正班：檢查剩餘名額（扣掉 modal 內已預排）
        if (mobility === '正班') {
          const modalUsed = alreadyArr.filter(
            a => a.siteId === site.id && a.shift === shift && a.duty === d.duty
          ).length;
          if ((d.last ?? d.count) - modalUsed <= 0) continue;
        }

        // 避免重複加入同一組合
        const duplicate = alreadyArr.some(
          a => a.siteId === site.id && a.shift === shift && a.duty === d.duty
        );
        if (!duplicate) result.push({ site, shift, duty: d.duty });
      }
    }
  }

  return result;
}