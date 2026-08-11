// ════════════════════════════════════════════
// shared/utils/routing.js
// 兩點間道路路線（OSRM）
//
// 注意：目前呼叫的是 OSRM 官方公開示範伺服器 (router.project-osrm.org)。
// 官方聲明此伺服器僅供評估／展示用途，非正式營運等級服務，也沒有 SLA 保證。
// 若通勤地圖的使用量變大或需要穩定性，建議：
//   1. 自架 OSRM（https://project-osrm.org/docs/v5.24.0/api/#general-options）
//   2. 或改用商用路徑服務（OpenRouteService、Google Directions API 等）
// 只要換掉下方 OSRM_BASE 常數即可切換服務來源。
// ════════════════════════════════════════════

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * 取得兩點間道路路線（駕車，對應計程車代叫情境）
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} to
 * @returns {Promise<{ coords:[number,number][], distanceKm:number, durationMin:number } | null>}
 *          coords 為 [lat,lng] 陣列，可直接丟給 Leaflet polyline；取得失敗回傳 null，
 *          呼叫端應以直線退回（fallback）
 */
export async function getDrivingRoute(from, to) {
  if (!from || !to) return null;
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    return {
      coords:      route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm:  route.distance / 1000,
      durationMin: route.duration / 60,
    };
  } catch (err) {
    console.error('getDrivingRoute 失敗:', err);
    return null;
  }
}

/**
 * 限制併發數量地跑一批非同步工作（避免對 OSRM 示範伺服器一次打過多請求）
 * @param {any[]} items
 * @param {(item:any) => Promise<any>} worker
 * @param {number} limit
 * @returns {Promise<any[]>} 依原始順序回傳結果
 */
export async function runLimited(items, worker, limit = 3) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

/** 直線距離（公里），Haversine，供路線取得失敗時的粗估備援 */
export function straightLineKm(from, to) {
  const R = 6371;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
