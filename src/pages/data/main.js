// ════════════════════════════════════════════
// pages/data/main.js
// 資料頁進入點
// ════════════════════════════════════════════

import { subscribe }                              from '../../core/store/globalState.js';
import { setupCardToggles }                       from '../../shared/utils/dom.js';
import { mount as mountSite,  
         unmount as unmountSite, renderSites }    from './components/siteTab.js';
import { mount as mountEmp, 
         unmount as unmountEmp, 
         renderEmployees }                        from './components/employeeTab.js';
import { mount as mountOverview,
         unmount as unmountOverview, 
         renderDeadlinePanel, refreshMapSelects } from './components/overviewTab.js';
import { mount as mountRatio,
         unmount as unmountRatio,
         renderRatioPanel }                       from './components/ratioPanel.js';

const _cleanups = [];

export async function mount() {
  document.querySelectorAll('#page-data .tab-nav .tab').forEach(btn => {
    const h = () => {
      document.querySelectorAll('#page-data .tab-nav .tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#page-data .tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
      if (btn.dataset.tab === 'overview') refreshMapSelects();
    };
    btn.addEventListener('click', h);
    _cleanups.push(() => btn.removeEventListener('click', h));
  });

  setupCardToggles('#page-data', _cleanups);
  mountSite();
  mountEmp();
  mountOverview();
  mountRatio();

  // 初始渲染
  renderRatioPanel();

  const unsub = subscribe(key => {
    if (key === 'sites')     { renderSites(); renderRatioPanel(); }
    if (key === 'employees') { renderEmployees(); renderRatioPanel(); }
    if (key === 'settings')  { renderRatioPanel(); }
    if (key === 'sites' || key === 'employees' || key === 'schedule') renderDeadlinePanel();
    if (key === 'sites' || key === 'employees') refreshMapSelects();
  });
  _cleanups.push(unsub);
}

export function unmount() {
  unmountSite();
  unmountEmp();
  unmountOverview();
  unmountRatio();
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;
}