// ════════════════════════════════════════════
// app.js — SPA router
// ════════════════════════════════════════════

import { init }       from './src/core/store/globalState.js';
import { startClock } from './src/shared/utils/date.js';

// 將模組與模板合併，提升配置可讀性
const PAGES = {
	data:     { mod: () => import('./src/pages/data/main.js'),     tpl: 'tpl-data' },
	schedule: { mod: () => import('./src/pages/schedule/main.js'), tpl: 'tpl-schedule' },
	settings: { mod: () => import('./src/pages/settings/main.js'), tpl: 'tpl-settings' },
};

let _currentUnmount = null;

async function navigate(pageKey) {
	// 優雅地卸載前一個頁面
	_currentUnmount?.();

	const page = Object.hasOwn(PAGES, pageKey) ? PAGES[pageKey] : PAGES.settings; // 加入 fallback
	const root = document.getElementById('page-root');
	const template = document.getElementById(page.tpl);

	// 使用 replaceChildren 一步完成清空與插入
	root.replaceChildren(template.content.cloneNode(true));

	const mod = await page.mod();
	_currentUnmount = mod.unmount ?? null;
	await mod.mount();

	// 更新導覽列狀態
	document.querySelectorAll('.nav-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.page === pageKey);
	});
}

function bindSidebarNav() {
	// 使用事件代理，減少 Listener 數量並支援動態元素
	document.body.addEventListener('click', (e) => {
		const btn = e.target.closest('.nav-btn');
		if (btn) navigate(btn.dataset.page);
	});
}

// ── 啟動 ──────────────────────────────────────
(async () => {
	await init();
	startClock();
	bindSidebarNav();
	await navigate('settings');
})();
