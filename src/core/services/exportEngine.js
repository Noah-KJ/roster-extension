// ════════════════════════════════════════════
// core/services/exportEngine.js
// ExcelJS 報表輸出——不碰 DOM
// ════════════════════════════════════════════

import { rocMonthLabel }       from '../../shared/utils/date.js';
import { DEFAULT_ONDUTY_KEY }  from '../../shared/constants.js';

const FONT         = '微軟正黑體';
const YELLOW_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
const RED_FILL     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
const BLACK_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
const NO_FILL      = { type: 'pattern', pattern: 'none' };
const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E2E50' } };
const HEADER_FONT  = { name: FONT, bold: true, color: { argb: 'FFDDE1FF' }, size: 14 };
const LABEL_FONT   = { name: FONT, bold: true, size: 14 };
const NORMAL_FONT  = { name: FONT, size: 14 };
const LEAVE_FONT   = { name: FONT, bold: true, color: { argb: 'FFCC0000' }, size: 14 };
const BLOCKED_FONT = { name: FONT, bold: true, color: { argb: 'FF444444' }, size: 14 };
const THIN_BORDER  = {
  top:    { style: 'thin', color: { argb: 'FF2E2E50' } },
  bottom: { style: 'thin', color: { argb: 'FF2E2E50' } },
  left:   { style: 'thin', color: { argb: 'FF2E2E50' } },
  right:  { style: 'thin', color: { argb: 'FF2E2E50' } },
};

function _buildDayMap(arr, dateField, month) {
  const map = {};
  for (const item of arr) {
    if (!item[dateField]) continue;
    if (item[dateField].slice(0, 7) !== month) continue;
    map[item.id] = parseInt(item[dateField].slice(8));
  }
  return map;
}

function _getCellFill(isHol, isDistDay) {
  if (isDistDay) return RED_FILL;
  if (isHol)     return YELLOW_FILL;
  return NO_FILL;
}

function applyCell(cell, value, isHol, isDistDay, onDutyKey) {
  const display = (value === 'work' || value === 'dash') ? '' : (value ?? '');
  const isLeave = display !== '';
  cell.value     = display;
  cell.font      = isLeave ? LEAVE_FONT : NORMAL_FONT;
  cell.fill      = _getCellFill(isHol, isDistDay);
  cell.border    = THIN_BORDER;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function applyBlockedCell(cell) {
  cell.value     = '✕';
  cell.font      = BLOCKED_FONT;
  cell.fill      = BLACK_FILL;
  cell.border    = THIN_BORDER;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function buildDateHeaderRow(ws, days, holDays, districtDay, labelColWidth) {
  const corner = ws.getCell(1, 1);
  corner.font      = HEADER_FONT;
  corner.fill      = HEADER_FILL;
  corner.border    = THIN_BORDER;
  corner.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getColumn(1).width = labelColWidth;

  for (let d = 1; d <= days; d++) {
    const cell      = ws.getCell(1, d + 1);
    const isHol     = holDays.has(d);
    const isDistDay = districtDay === d;
    cell.value     = d;
    cell.font      = HEADER_FONT;
    cell.fill      = isDistDay ? RED_FILL : isHol ? YELLOW_FILL : HEADER_FILL;
    cell.border    = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getColumn(d + 1).width = 4;
  }
  ws.getRow(1).height = 22;
}

async function downloadWorkbook(wb, filename) {
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── 社區班表 ──────────────────────────────────
export async function exportCommunityXlsx(settings, schedule, allSites, allEmps, holDays) {
  const month      = settings.month ?? '';
  const [y, m]     = month.split('-');
  const days       = new Date(+y, +m, 0).getDate();
  const onDutyKey  = settings.onDutyKey ?? DEFAULT_ONDUTY_KEY;
  const wb         = new ExcelJS.Workbook();
  wb.creator       = settings.orgName ?? '排班小幫手';
  const distDayMap = _buildDayMap(allSites, 'HOADate',  month);
  const resignDayMap = _buildDayMap(allEmps, 'lastDate', month);

  for (const site of allSites) {
    const distDay = distDayMap[site.id] ?? null;
    const ws      = wb.addWorksheet((site.name[1] || site.name[0]).slice(0, 31));
    buildDateHeaderRow(ws, days, holDays, distDay, 12);
    ws.getCell(1, 1).value = `${site.name[1] || site.name[0]}  ${rocMonthLabel(month)}`;

    // 每個 (emp, shift, duty) 組合一行
    const rows = [];
    for (const emp of allEmps) {
      for (const a of (emp.arrSites ?? [])) {
        if (a.siteId === site.id) rows.push({ emp, shift: a.shift, duty: a.duty });
      }
    }

    const siteData = schedule[site.id] ?? {};
    let row = 2;
    for (const { emp, shift, duty } of rows) {
      const resignDay = resignDayMap[emp.id] ?? null;
      const dayMap    = siteData[emp.id] ?? {};
      const nameCell  = ws.getCell(row, 1);
      nameCell.value     = `${emp.name} ${shift} ${duty}`;
      nameCell.font      = LABEL_FONT;
      nameCell.border    = THIN_BORDER;
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let d = 1; d <= days; d++) {
        const cell = ws.getCell(row, d + 1);
        if (resignDay !== null && d > resignDay) {
          applyBlockedCell(cell);
        } else {
          applyCell(cell, d in dayMap ? dayMap[d] : '', holDays.has(d), distDay === d, onDutyKey);
        }
      }
      ws.getRow(row).height = 20;
      row++;
    }
  }
  await downloadWorkbook(wb, `社區班表_${month}.xlsx`);
}

// ── 人員班表 ──────────────────────────────────
export async function exportEmployeeXlsx(settings, schedule, allSites, allEmps, holDays) {
  const month      = settings.month ?? '';
  const [y, m]     = month.split('-');
  const days       = new Date(+y, +m, 0).getDate();
  const onDutyKey  = settings.onDutyKey ?? DEFAULT_ONDUTY_KEY;
  const wb         = new ExcelJS.Workbook();
  wb.creator       = settings.orgName ?? '排班小幫手';
  const distDayMap = _buildDayMap(allSites, 'HOADate',  month);
  const resignDayMap = _buildDayMap(allEmps, 'lastDate', month);

  for (const emp of allEmps) {
    const resignDay = resignDayMap[emp.id] ?? null;
    const ws        = wb.addWorksheet(emp.name.slice(0, 31));
    buildDateHeaderRow(ws, days, holDays, null, 12);
    ws.getCell(1, 1).value = `${emp.name}  ${rocMonthLabel(month)}`;

    let row = 2;
    for (const { siteId, shift, duty } of (emp.arrSites ?? [])) {
      const site     = allSites.find(s => s.id === siteId);
      if (!site) continue;
      const distDay  = distDayMap[siteId] ?? null;
      const dayMap   = schedule[siteId]?.[emp.id] ?? {};
      const nameCell = ws.getCell(row, 1);
      nameCell.value     = `${site.name[1] || site.name[0]} ${shift} ${duty}`;
      nameCell.font      = LABEL_FONT;
      nameCell.border    = THIN_BORDER;
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let d = 1; d <= days; d++) {
        const cell = ws.getCell(row, d + 1);
        if (resignDay !== null && d > resignDay) {
          applyBlockedCell(cell);
        } else {
          applyCell(cell, d in dayMap ? dayMap[d] : '', holDays.has(d), distDay === d, onDutyKey);
        }
      }
      ws.getRow(row).height = 20;
      row++;
    }
  }
  await downloadWorkbook(wb, `人員班表_${month}.xlsx`);
}

// ── 大班表 ────────────────────────────────────
export async function exportBigXlsx(settings, schedule, allSites, allEmps, holDays) {
  const month      = settings.month ?? '';
  const [y, m]     = month.split('-');
  const days       = new Date(+y, +m, 0).getDate();
  const onDutyKey  = settings.onDutyKey ?? DEFAULT_ONDUTY_KEY;
  const wb         = new ExcelJS.Workbook();
  const ws         = wb.addWorksheet('大班表');
  const resignDayMap = _buildDayMap(allEmps, 'lastDate', month);
  buildDateHeaderRow(ws, days, holDays, null, 12);
  ws.getCell(1, 1).value = `${settings.orgName ?? ''}  ${rocMonthLabel(month)}`;

  let row = 2;
  for (const emp of allEmps) {
    const resignDay = resignDayMap[emp.id] ?? null;
    const nameCell  = ws.getCell(row, 1);
    nameCell.value     = emp.name;
    nameCell.font      = LABEL_FONT;
    nameCell.border    = THIN_BORDER;
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    for (let d = 1; d <= days; d++) {
      const cell = ws.getCell(row, d + 1);
      if (resignDay !== null && d > resignDay) {
        applyBlockedCell(cell);
        continue;
      }
      const isHol  = holDays.has(d);
      let cellVal  = ''; let isLeave = false;
      for (const site of allSites) {
        const dayMap = schedule[site.id]?.[emp.id];
        if (!dayMap || !(d in dayMap)) continue;
        const val = dayMap[d];
        if (val === 'dash') continue;
        if (val === 'work') {
          cellVal = site.name[2] || site.name[1]?.[0] || site.name[0]?.[0] || '?';
          break;
        }
        cellVal = val; isLeave = true; break;
      }
      cell.value     = cellVal;
      cell.font      = isLeave ? LEAVE_FONT : NORMAL_FONT;
      cell.fill      = isHol ? YELLOW_FILL : NO_FILL;
      cell.border    = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getRow(row).height = 20;
    row++;
  }
  await downloadWorkbook(wb, `大班表_${month}.xlsx`);
}