// ════════════════════════════════════════════
// pages/data/components/ratioPanel.js
// 編現比水位圖
// ════════════════════════════════════════════

import { getSettingsState, getSitesState, getEmployeesState } from '../../../core/store/globalState.js';

// ── 樣式注入（只注一次）────────────────────
let _styleInjected = false;
function injectStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  const s = document.createElement('style');
  s.id = 'ratio-panel-style';
  s.textContent = `
    /* ── 水位圖佈局 ── */
    .rp-row {
      display: flex;
      gap: 32px;
      justify-content: center;
      padding: 20px 16px 8px;
      flex-wrap: wrap;
    }

    /* ── 單個水位槽 ── */
    .rp-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .rp-label {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: .06em;
      color: var(--text-secondary, #888);
    }
    .rp-tank {
      position: relative;
      width: 108px;
      height: 168px;
      border: 2.5px solid var(--border, #d0d0d0);
      border-radius: 10px 10px 6px 6px;
      overflow: hidden;
      background: var(--bg-secondary, #f3f3f3);
      box-shadow: inset 0 2px 6px rgba(0,0,0,.06);
    }

    /* ── 安全帶（0.8-1.2 區域） ── */
    .rp-safe-band {
      position: absolute;
      left: 0; right: 0;
      background: rgba(76,175,80,.10);
      border-top: 1px dashed rgba(76,175,80,.35);
      border-bottom: 1px dashed rgba(76,175,80,.35);
      pointer-events: none;
      z-index: 1;
    }

    /* ── 1.0 刻度線 ── */
    .rp-tick-mid {
      position: absolute;
      left: 0; right: 0;
      bottom: 50%;
      height: 1px;
      background: rgba(0,0,0,.15);
      pointer-events: none;
      z-index: 2;
    }
    .rp-tick-mid::after {
      content: '1.0';
      position: absolute;
      right: 4px;
      top: -9px;
      font-size: 9px;
      color: rgba(0,0,0,.35);
    }

    /* ── 水體 ── */
    .rp-water {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      transition: height 1s cubic-bezier(.34,1.4,.64,1),
                  background-color .6s ease;
      z-index: 3;
    }
    .rp-water.green  { background-color: #4caf5099; }
    .rp-water.yellow { background-color: #ffb30099; }
    .rp-water.red    { background-color: #e5393599; }

    /* ── 波浪 ── */
    .rp-waves {
      position: absolute;
      top: -14px; left: 0; right: 0;
      height: 14px;
      overflow: hidden;
    }
    .rp-wave-svg {
      position: absolute;
      top: 0;
      width: 200%;
      height: 100%;
      animation: rpWave1 2.6s linear infinite;
    }
    .rp-wave-svg.w2 {
      animation: rpWave2 3.4s linear infinite;
      opacity: .5;
    }
    @keyframes rpWave1 {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    @keyframes rpWave2 {
      from { transform: translateX(-50%); }
      to   { transform: translateX(0); }
    }

    /* ── 數值疊層 ── */
    .rp-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 4;
      pointer-events: none;
    }
    .rp-num {
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
      text-shadow: 0 1px 4px rgba(0,0,0,.25);
    }
    .rp-num.on-water  { color: #fff; }
    .rp-num.off-water { color: var(--text-primary, #333); }
    .rp-status {
      margin-top: 5px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .04em;
      padding: 2px 7px;
      border-radius: 10px;
    }
    .rp-status.green  { background: #4caf5033; color: #2e7d32; }
    .rp-status.yellow { background: #ffb30033; color: #a16b00; }
    .rp-status.red    { background: #e5393533; color: #b71c1c; }
    .rp-num.on-water + .rp-status { background: rgba(255,255,255,.25); color: #fff; }

    /* ── 無資料 ── */
    .rp-no-data {
      font-size: 13px;
      color: var(--text-muted, #aaa);
    }

    /* ── 底部說明 ── */
    .rp-meta {
      font-size: 11px;
      color: var(--text-secondary, #999);
      text-align: center;
    }

    /* ── 圖例 ── */
    .rp-legend {
      display: flex;
      gap: 14px;
      justify-content: center;
      flex-wrap: wrap;
      padding: 8px 0 4px;
    }
    .rp-legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--text-secondary, #888);
    }
    .rp-legend-dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(s);
}

// ── 工具函式 ─────────────────────────────

/** ratio → 槽高百分比；顯示範圍 0–2.0 */
function toFill(ratio) {
  if (ratio === null) return 0;
  return Math.min(Math.max(ratio / 2, 0), 1) * 100;
}

function colorClass(ratio) {
  if (ratio === null) return 'green';
  if (ratio < 0.8)   return 'yellow';
  if (ratio > 1.2)   return 'red';
  return 'green';
}

function statusText(ratio, cls) {
  if (ratio === null) return '';
  if (cls === 'yellow') return '人力充裕';
  if (cls === 'red')    return '人力偏緊';
  return '安全';
}

// ── 計算 ──────────────────────────────────

export function calcRatios() {
  const sites     = getSitesState()     || [];
  const employees = getEmployeesState() || [];
  const settings  = getSettingsState()  || {};

  // 取排班月份天數（key 為 month，非 scheduleMonth）
  const month = settings.month ?? '';
  let monthDays = 30;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    if (y && m) monthDays = new Date(y, m, 0).getDate();
  }

  // ── 據點員額需求 ──────────────────────
  let totalReq = 0, dayReq = 0, nightReq = 0;
  for (const site of sites) {
    for (const d of (site.duties || [])) {
      const cnt = Number(d.count) || 0;
      totalReq += cnt;
      if (d.shift === '日班') dayReq   += cnt;
      if (d.shift === '夜班') nightReq += cnt;
    }
  }

  // ── 員工接受天數 ─────────────────────
  let totalEmpDays = 0, dayEmpDays = 0, nightEmpDays = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  for (const emp of employees) {
    // 已離職者不計
    if (emp.lastDate && new Date(emp.lastDate) < today) continue;
    const d = Number(emp.days) || 0;
    totalEmpDays += d;                         // 全體皆計入總量
    if (emp.shift === '日班') dayEmpDays   += d;
    if (emp.shift === '夜班') nightEmpDays += d;
    // shift === '日/夜' → 僅計入 totalEmpDays，不計日/夜分項
  }

  const safe = (num, den) =>
    (den === 0 || totalReq === 0) ? null : +(num / den).toFixed(3);

  return {
    monthDays,
    total: safe(totalReq   * monthDays, totalEmpDays),
    day:   safe(dayReq     * monthDays, dayEmpDays),
    night: safe(nightReq   * monthDays, nightEmpDays),
  };
}

// ── 建構單顆水位槽 ────────────────────────

function buildTank(label, ratio) {
  const cls    = colorClass(ratio);
  const fill   = toFill(ratio);
  const status = statusText(ratio, cls);

  // 安全帶：0.8→40%, 1.2→60%
  const safeLo = toFill(0.8);
  const safeHi = toFill(1.2);

  // 數字顏色：水面以上用深色，水中用白色
  const numCls = fill > 55 ? 'on-water' : 'off-water';

  // 波浪填色（稍深一點讓波峰可見）
  const waveColors = { green: '#4caf50', yellow: '#ffb300', red: '#e53935' };
  const wc = waveColors[cls];

  const numHTML = ratio === null
    ? `<span class="rp-no-data">無資料</span>`
    : `<span class="rp-num ${numCls}">${ratio.toFixed(2)}</span>
       <span class="rp-status ${cls}">${status}</span>`;

  return `
    <div class="rp-wrap">
      <div class="rp-label">${label}</div>
      <div class="rp-tank">
        <!-- 安全帶 -->
        <div class="rp-safe-band"
             style="bottom:${safeLo}%;height:${safeHi - safeLo}%"></div>
        <!-- 1.0 刻度線 -->
        <div class="rp-tick-mid"></div>
        <!-- 水體 -->
        <div class="rp-water ${cls}" style="height:${fill}%">
          <!-- 波浪 -->
          <div class="rp-waves">
            <svg class="rp-wave-svg w1" viewBox="0 0 400 14"
                 preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,7 C50,0 100,14 150,7 C200,0 250,14 300,7 C350,0 400,14 400,7
                       L400,14 L0,14 Z" fill="${wc}"/>
            </svg>
            <svg class="rp-wave-svg w2" viewBox="0 0 400 14"
                 preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0,9 C60,2 120,16 180,9 C240,2 300,16 360,9 C390,4 400,10 400,9
                       L400,14 L0,14 Z" fill="${wc}"/>
            </svg>
          </div>
        </div>
        <!-- 數值疊層 -->
        <div class="rp-overlay">${numHTML}</div>
      </div>
    </div>
  `;
}

// ── 渲染 ──────────────────────────────────

export function renderRatioPanel() {
  const el = document.getElementById('ratio-panel');
  if (!el) return;

  const { total, day, night, monthDays } = calcRatios();

  el.innerHTML = `
    <div class="rp-row">
      ${buildTank('總體', total)}
      ${buildTank('日班', day)}
      ${buildTank('夜班', night)}
    </div>
    <p class="rp-meta">排班月份共 ${monthDays} 天 ／ 刻度線 1.0 為理論平衡點</p>
    <div class="rp-legend">
      <span class="rp-legend-item">
        <span class="rp-legend-dot" style="background:#ffb300"></span>＜ 0.8 人力過剩
      </span>
      <span class="rp-legend-item">
        <span class="rp-legend-dot" style="background:#4caf50"></span>0.8 – 1.2 安全
      </span>
      <span class="rp-legend-item">
        <span class="rp-legend-dot" style="background:#e53935"></span>＞ 1.2 人力吃緊
      </span>
    </div>
  `;
}

// ── Mount / Unmount ───────────────────────

export function mount() {
  injectStyle();
}

export function unmount() {}