// ════════════════════════════════════════════
// pages/data/components/overviewTab.js
// 期限總覽：據點合約日、區大日 + 員工離職日
// 通勤地圖：以據點或人員為中心的輻射狀道路路線圖（Leaflet + OpenStreetMap + OSRM）
// ════════════════════════════════════════════

import { getSettingsState, getDerived,
  getEmployeesState, getSitesState, setSettingsState,
  setEmployeesState, setSitesState }        from '../../../core/store/globalState.js';
import { formatDate }                       from '../../../shared/utils/date.js';
import { debounce, bindEl }                 from '../../../shared/utils/dom.js';
import { showHint, showToastMsg }           from '../../../shared/utils/notify.js';
import { geocodeAddress, sleep }            from '../../../shared/utils/geocode.js';
import { getDrivingRoute, runLimited,
         straightLineKm }                   from '../../../shared/utils/routing.js';

// ── 常數 ─────────────────────────────────────
const _cleanups = [];

// 通勤地圖樣式
const ROUTE_COLOR         = '#c9a87c'; // 路線（實際道路）
const ROUTE_FALLBACK_DASH = '8, 10';   // 路線取得失敗時的直線退回樣式
const CENTER_COLOR        = '#ff6b6b'; // 中心點（選定的據點／人員）
const TARGET_COLOR        = '#4ecdc4'; // 目的地（其他人員／據點）
const TAIWAN_CENTER       = [23.7, 120.9];
const GEOCODE_DELAY_MS    = 1100; // Nominatim 政策：最多每秒 1 次請求

// 通勤地圖狀態
let _mapMode      = 'site'; // 'site' | 'employee'
let _leafletMap   = null;
let _layerGroup   = null;

// ── 初始化 ────────────────────────────────────
export function mount() {
  _setupDeadlinePanel();
  _setupCommuteMap();

  renderDeadlinePanel();
}

export function unmount() {
  _cleanups.forEach(fn => fn());
  _cleanups.length = 0;

  if (_leafletMap) {
    _leafletMap.remove();
    _leafletMap = null;
    _layerGroup = null;
  }
}

// ── Deadline Panel ────────────────────────────
function _setupDeadlinePanel() {
  const input = document.getElementById('deadline-threshold');
  if (input) {
    // 從 storage 還原上次的天數
    input.value = getSettingsState().deadlineThreshold ?? 90;

    // 更新顯示防抖
    const debouncedShowHint = debounce(() => {
      showHint('deadline-hint');
    }, 600);

    const h = async () => {
      const val = parseInt(input.value);
      if (!val || val < 1) return;
      await setSettingsState({ deadlineThreshold: val });
      renderDeadlinePanel();
      debouncedShowHint();
    };

    input.addEventListener('input', h);
    _cleanups.push(() => input.removeEventListener('input', h));
  }
  renderDeadlinePanel();
}

export function renderDeadlinePanel() {
  const tbody     = document.getElementById('deadline-tbody');
  const empty     = document.getElementById('deadline-empty');
  const threshold = getSettingsState().deadlineThreshold ?? 90;
  if (!tbody) return;

  const { deadlines } = getDerived();

  if (deadlines.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = '';

  for (const row of deadlines) {
    const tr     = document.createElement('tr');
    const isWarn = row.days !== null && row.days <= threshold;
    if (isWarn) tr.classList.add('row-warn');
    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.type}</td>
      <td>${formatDate(row.date)}</td>
      <td>${_daysBadge(row.days, threshold)}</td>`;
    tbody.appendChild(tr);
  }
}

function _daysBadge(days, threshold) {
  if (days === null) return '<span class="days-badge none">未設定</span>';
  const label = days < 0 ? `已過期 ${Math.abs(days)} 天` : `${days} 天後`;
  const cls   = days < 0 ? 'urgent' : days <= threshold ? 'warning' : 'ok';
  return `<span class="days-badge ${cls}">${label}</span>`;
}

// ── 通勤地圖 ──────────────────────────────────
function _setupCommuteMap() {
  document.querySelectorAll('#map-mode-toggle .map-mode-btn').forEach(btn => {
    const h = () => {
      if (btn.classList.contains('active')) return;
      document.querySelectorAll('#map-mode-toggle .map-mode-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mapMode = btn.dataset.mode;
      refreshMapSelects();
    };
    btn.addEventListener('click', h);
    _cleanups.push(() => btn.removeEventListener('click', h));
  });

  bindEl('map-target-select', 'change', _renderCommuteMap, _cleanups);
  bindEl('btn-geocode-all',   'click',  _batchGeocode,      _cleanups);

  refreshMapSelects();
}

/** 依目前模式（據點／人員）重新填充下拉選單，並重繪地圖 */
export function refreshMapSelects() {
  const sel = document.getElementById('map-target-select');
  if (!sel) return;

  const isSite = _mapMode === 'site';
  const prev   = sel.value;
  const list   = isSite ? getDerived().activeSites : getDerived().activeEmployees;

  sel.innerHTML = `<option value="">${isSite ? '選擇據點…' : '選擇人員…'}</option>`;
  for (const item of list) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = isSite ? (item.name[1] || item.name[0]) : item.name;
    sel.appendChild(opt);
  }
  sel.value = list.some(i => i.id === prev) ? prev : '';

  _renderCommuteMap();
}

/** 建立（或取得既有的）Leaflet 地圖實例 */
function _ensureMap() {
  if (_leafletMap) return _leafletMap;

  const container = document.getElementById('commute-map');
  if (!container || typeof L === 'undefined') return null;

  _leafletMap = L.map(container, { scrollWheelZoom: true }).setView(TAIWAN_CENTER, 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  }).addTo(_leafletMap);
  _layerGroup = L.layerGroup().addTo(_leafletMap);

  // 「通勤地圖」卡片以 max-height 動畫展開／收合；地圖若在收合狀態下建立，
  // 容器尺寸可能量測不到，展開瞬間補一次 invalidateSize() 避免磚圖跑版
  const header = document.querySelector('#card-commute-map .card-header');
  if (header) {
    const h = () => setTimeout(() => _leafletMap?.invalidateSize(), 260);
    header.addEventListener('click', h);
    _cleanups.push(() => header.removeEventListener('click', h));
  }

  return _leafletMap;
}

/** 依目前選定的中心點（據點或人員），繪製輻射狀通勤路線 */
async function _renderCommuteMap() {
  const sel      = document.getElementById('map-target-select');
  const targetId = sel?.value;
  const mapEl    = document.getElementById('commute-map');
  const emptyEl  = document.getElementById('commute-map-empty');
  const listEl   = document.getElementById('commute-route-list');
  const hintEl   = document.getElementById('map-fetch-hint');
  if (!mapEl || !emptyEl || !listEl) return;

  listEl.innerHTML = '';
  hintEl.textContent = '';

  const isSite = _mapMode === 'site';

  if (!targetId) {
    mapEl.style.display = 'none';
    emptyEl.textContent = '選擇據點或人員後，將顯示輻射狀通勤路線圖';
    emptyEl.style.display = '';
    return;
  }

  const center = isSite
    ? getSitesState().find(s => s.id === targetId)
    : getEmployeesState().find(e => e.id === targetId);

  if (!center) { emptyEl.style.display = ''; mapEl.style.display = 'none'; return; }

  const centerLabel = isSite ? (center.name[1] || center.name[0]) : center.name;

  if (!center.geo) {
    mapEl.style.display = 'none';
    emptyEl.textContent =
      `「${centerLabel}」尚未定位地址，請至${isSite ? '「據點」' : '「人員」'}分頁重新開啟並儲存一次，` +
      `或使用上方「批次定位缺少座標的地址」`;
    emptyEl.style.display = '';
    return;
  }

  // 目的地清單：據點模式 → 所有在職人員；人員模式 → 該員的已預排據點
  let targets = [];
  if (isSite) {
    targets = getDerived().activeEmployees
      .filter(e => e.geo)
      .map(e => ({ id: e.id, label: e.name, geo: e.geo, sub: '' }));
  } else {
    const sites = getSitesState();
    const seen  = new Set();
    for (const a of (center.arrSites ?? [])) {
      if (seen.has(a.siteId)) continue;
      seen.add(a.siteId);
      const site = sites.find(s => s.id === a.siteId);
      if (!site?.geo) continue;
      targets.push({
        id: site.id, label: site.name[1] || site.name[0],
        geo: site.geo, sub: `${a.shift}/${a.duty}`,
      });
    }
  }

  emptyEl.style.display = 'none';
  mapEl.style.display   = 'block';

  const map = _ensureMap();
  if (!map) return;
  _layerGroup.clearLayers();

  const centerMarker = L.circleMarker([center.geo.lat, center.geo.lng], {
    radius: 9, color: CENTER_COLOR, fillColor: CENTER_COLOR, fillOpacity: 0.9, weight: 2,
  }).bindPopup(`<b>${centerLabel}</b>（中心點）`);
  _layerGroup.addLayer(centerMarker);

  if (targets.length === 0) {
    hintEl.textContent = isSite ? '目前沒有已定位座標的在職人員可顯示' : '此人員目前沒有已定位座標的預排據點';
    map.setView([center.geo.lat, center.geo.lng], 13);
    return;
  }

  hintEl.textContent = `正在計算 ${targets.length} 條路線…`;

  const results = await runLimited(targets, async t => ({
    ...t,
    route: await getDrivingRoute(center.geo, t.geo),
  }), 3);

  // 若使用者在路線計算期間切換了目標，放棄這次結果
  if (document.getElementById('map-target-select')?.value !== targetId) return;

  hintEl.textContent = '';
  results.sort((a, b) =>
    (a.route?.distanceKm ?? straightLineKm(center.geo, a.geo)) -
    (b.route?.distanceKm ?? straightLineKm(center.geo, b.geo)));

  const bounds = [[center.geo.lat, center.geo.lng]];

  for (const t of results) {
    bounds.push([t.geo.lat, t.geo.lng]);

    const marker = L.circleMarker([t.geo.lat, t.geo.lng], {
      radius: 6, color: TARGET_COLOR, fillColor: TARGET_COLOR, fillOpacity: 0.85, weight: 2,
    }).bindPopup(`<b>${t.label}</b>${t.sub ? ` (${t.sub})` : ''}`);
    _layerGroup.addLayer(marker);

    const isFallback = !t.route;
    const coords = t.route?.coords ?? [[center.geo.lat, center.geo.lng], [t.geo.lat, t.geo.lng]];
    const line = L.polyline(coords, {
      color:     ROUTE_COLOR,
      weight:    isFallback ? 2 : 3,
      opacity:   isFallback ? 0.6 : 0.85,
      dashArray: isFallback ? ROUTE_FALLBACK_DASH : null,
    });
    _layerGroup.addLayer(line);

    const distanceKm  = t.route?.distanceKm  ?? straightLineKm(center.geo, t.geo);
    const durationMin = t.route?.durationMin ?? null;

    const li = document.createElement('li');
    if (isFallback) li.classList.add('route-fallback');
    li.innerHTML = `
      <span>${t.label}${t.sub ? `　<span style="color:var(--text2)">${t.sub}</span>` : ''}</span>
      <span class="route-meta">${distanceKm.toFixed(1)} km${
        durationMin ? `・約 ${Math.round(durationMin)} 分鐘` : '（路線取得失敗，估計直線距離）'
      }</span>`;
    listEl.appendChild(li);
  }

  map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
}

/** 批次為尚未有座標的據點／人員地址進行地理編碼（節流以符合 Nominatim 使用政策） */
async function _batchGeocode() {
  const btn = document.getElementById('btn-geocode-all');
  if (!btn) return;

  const siteIds = getSitesState().filter(s => !s.geo && s.addr?.[2]).map(s => s.id);
  const empIds  = getEmployeesState().filter(e => !e.geo && e.addr?.[2]).map(e => e.id);
  const total   = siteIds.length + empIds.length;

  if (total === 0) { showToastMsg('目前沒有缺少座標的地址'); return; }

  const originalLabel = btn.textContent;
  btn.disabled = true;
  let done = 0, failed = 0;

  let nextSites = [...getSitesState()];
  for (const id of siteIds) {
    btn.textContent = `定位中…（${++done}/${total}）`;
    const site = nextSites.find(s => s.id === id);
    const geo  = await geocodeAddress(...site.addr);
    if (!geo) failed++;
    nextSites = nextSites.map(s => s.id === id ? { ...s, geo: geo ?? s.geo } : s);
    await sleep(GEOCODE_DELAY_MS);
  }
  await setSitesState(nextSites);

  let nextEmps = [...getEmployeesState()];
  for (const id of empIds) {
    btn.textContent = `定位中…（${++done}/${total}）`;
    const emp = nextEmps.find(e => e.id === id);
    const geo = await geocodeAddress(...emp.addr);
    if (!geo) failed++;
    nextEmps = nextEmps.map(e => e.id === id ? { ...e, geo: geo ?? e.geo } : e);
    await sleep(GEOCODE_DELAY_MS);
  }
  await setEmployeesState(nextEmps);

  btn.textContent = originalLabel;
  btn.disabled = false;
  showHint('geocode-hint');
  showToastMsg(
    failed ? `完成，但有 ${failed} 筆定位失敗（地址可能不夠精確）` : `已完成 ${total} 筆地址定位`,
    failed > 0,
  );

  refreshMapSelects();
}
