// ════════════════════════════════════════════
// core/services/siteService.js
// ════════════════════════════════════════════

/**
 * 根據正班預排重新計算所有據點 duties 的 last（剩餘名額）
 * site.duties: [{ shift, duty, count, last }]
 * emp.arrSites: [{ siteId, shift, duty }]
 */
export function recalcLast(sites, employees) {
  const regularEmps = employees.filter(e => e.mobility === '正班');

  return sites.map(site => ({
    ...site,
    duties: (site.duties ?? []).map(d => {
      const used = regularEmps
        .flatMap(e => e.arrSites ?? [])
        .filter(a => a.siteId === site.id && a.duty === d.duty && a.shift === d.shift)
        .length;
      return { ...d, last: Math.max(0, d.count - used) };
    }),
  }));
}

/**
 * 為新據點產生不重複的代表字
 * 優先順序：簡稱第一字 → 簡稱其他字 → 全稱各字 → 修改其他據點
 */
export function assignRepChar(newSite, allSites) {
  const used  = new Set(allSites.filter(s => s.id !== newSite.id).map(s => s.name[2]).filter(Boolean));
  const full  = newSite.name[0] ?? '';
  const short = newSite.name[1] ?? '';
  const pool  = [...short, ...full].filter(c => c.trim());

  for (const c of pool) {
    if (!used.has(c)) return c;
  }

  for (const site of allSites) {
    if (site.id === newSite.id) continue;
    const altPool = [...(site.name[1] ?? ''), ...(site.name[0] ?? '')].filter(c => c.trim());
    for (const c of altPool) {
      if (!used.has(c) || c === site.name[2]) {
        site.name[2] = altPool.find(x => x !== c && !used.has(x)) ?? site.name[2];
        return c;
      }
    }
  }
  return full[0] ?? '？';
}