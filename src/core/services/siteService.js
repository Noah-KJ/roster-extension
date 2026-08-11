// ════════════════════════════════════════════
// core/services/siteService.js
// ════════════════════════════════════════════

export function recalcLast(sites, employees) {
  // 先攤平所有正班的預排紀錄，減少後續巢狀查找的負擔
  const allRegularArrSites = employees
    .filter(e => e.mobility === '正班')
    .flatMap(e => e.arrSites ?? []);

  return sites.map(site => ({
    ...site,
    duties: (site.duties ?? []).map(d => {
      const used = allRegularArrSites.filter(
        a => a.siteId === site.id && a.duty === d.duty && a.shift === d.shift
      ).length;
      return { ...d, last: Math.max(0, d.count - used) };
    }),
  }));
}

export function assignRepChar(newSite, allSites) {
  const usedChars = new Set(allSites.filter(s => s.id !== newSite.id).map(s => s.name[2]).filter(Boolean));
  const newSiteChars = [...(newSite.name[1] ?? ''), ...(newSite.name[0] ?? '')].filter(c => c.trim());

  // 1. 先嘗試從自己的名稱中找未使用的字
  const availableChar = newSiteChars.find(c => !usedChars.has(c));
  if (availableChar) return availableChar;

  // 2. 退而求其次，跟其他據點借用/交換
  for (const site of allSites) {
    if (site.id === newSite.id) continue;
    const altPool = [...(site.name[1] ?? ''), ...(site.name[0] ?? '')].filter(c => c.trim());
    
    for (const c of altPool) {
      if (!usedChars.has(c) || c === site.name[2]) {
        site.name[2] = altPool.find(x => x !== c && !usedChars.has(x)) ?? site.name[2];
        return c;
      }
    }
  }
  
  return newSite.name[0]?.[0] ?? '？';
}
