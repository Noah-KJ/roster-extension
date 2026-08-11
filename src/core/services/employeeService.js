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
// ════════════════════════════════════════════
// core/services/employeeService.js
// ════════════════════════════════════════════

export function getArrSiteCandidates({ sites, empShift, empDuties, mobility, forbSiteIds, alreadyArr }) {
  const forbidSet = new Set(forbSiteIds);
  const shifts = empShift === '日/夜' ? ['日班', '夜班'] : [empShift];

  return sites
    .filter(site => !forbidSet.has(site.id)) // 排除禁排
    .flatMap(site => 
      (site.duties ?? [])
        // 1. 篩選符合的班別與勤務
        .filter(d => shifts.includes(d.shift) && empDuties.includes(d.duty))
        // 2. 檢查名額 (僅正班需要)
        .filter(d => {
          if (mobility !== '正班') return true;
          const used = alreadyArr.filter(a => a.siteId === site.id && a.shift === d.shift && a.duty === d.duty).length;
          return (d.last ?? d.count) > used;
        })
        // 3. 避免重複加入
        .filter(d => !alreadyArr.some(a => a.siteId === site.id && a.shift === d.shift && a.duty === d.duty))
        // 4. 映射為最終格式
        .map(d => ({ site, shift: d.shift, duty: d.duty }))
    );
}
