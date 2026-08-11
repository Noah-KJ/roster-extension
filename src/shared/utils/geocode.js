// ════════════════════════════════════════════
// shared/utils/geocode.js
// 地址 → 經緯度（OpenStreetMap Nominatim）
//
// 使用限制（Nominatim Usage Policy，https://operations.osmfoundation.org/policies/nominatim/）：
//   - 這是 OSM 基金會提供的公開免費服務，最多每秒 1 次請求
//   - 本專案僅在人員／據點「地址有變更」或「尚未定位」時，於儲存當下呼叫一次並快取結果
//     （lat/lng 存進 employee.geo / site.geo，不會每次開地圖都重查）
//   - 若要批次補齊舊資料座標，請使用通勤地圖卡片中的「批次定位」功能，
//     該功能已內建節流（每次請求間隔 1.1 秒）以符合政策
//   - 大量／商用情境請自架 Nominatim 或改用付費地理編碼服務
// ════════════════════════════════════════════

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * 將台灣地址轉換為經緯度
 * @param {string} city 縣市
 * @param {string} dist 鄉鎮市區
 * @param {string} addr 詳細地址
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
export async function geocodeAddress(city, dist, addr) {
  const q = [city, dist, addr].filter(Boolean).join('');
  if (!q) return null;

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=tw&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch (err) {
    console.error('geocodeAddress 失敗:', err);
    return null;
  }
}

/** 將 addr 陣列組成比對用字串，用來判斷地址是否變更（避免不必要的重複查詢） */
export function addrKey(addr) {
  return (addr ?? []).join('|');
}

/** 簡單延遲，供批次地理編碼節流使用 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
