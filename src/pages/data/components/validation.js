// ════════════════════════════════════════════
// pages/data/components/validation.js
// 據點 / 人員表單驗證
// ════════════════════════════════════════════

export class ValidationError extends Error {
  constructor(messages) {
    super('表單欄位驗證失敗');
    this.name     = 'ValidationError';
    this.messages = Array.isArray(messages) ? messages : [messages];
  }
}

// ── 電話 ──────────────────────────────────────
// 接受格式：市話 02-1234-5678 / 手機 0912-345-678 / 無符號數字
const PHONE_RE = /^(0[2-8]\d{1,2}-?\d{3,4}-?\d{4}|09\d{2}-?\d{3}-?\d{3})$/;

export function validatePhone(phone) {
  if (!phone) return '請填寫電話';
  if (!PHONE_RE.test(phone.replace(/\s/g, ''))) return '電話格式不正確';
  return null;
}

// ── 簡稱 ──────────────────────────────────────
const SHORT_NAME_RE = /^[\u4e00-\u9fff]{1,4}$/;

/**
 * @param {string}   shortName   - 要驗證的簡稱
 * @param {Site[]}   sites       - 現有所有據點
 * @param {string|null} editingId - 編輯中的據點 id（排除自己）
 */
export function validateShortName(shortName, sites, editingId = null) {
  if (!shortName) return '請填寫簡稱';
  const conflict = sites.find(s => s.shortName === shortName && s.id !== editingId);
  if (conflict) return `簡稱「${shortName}」已被「${conflict.name}」使用`;
  return null;
}

// ── 通用必填 ──────────────────────────────────
export function validateRequired(value, label) {
  return value?.trim() ? null : `請填寫${label}`;
}

export function validateSelect(value, label) {
  return value ? null : `請選擇${label}`;
}

/**
 * 一次跑多個驗證，收集所有錯誤訊息
 * 若有錯誤則 throw ValidationError
 *
 * @param {Array<() => string|null>} checks - 每個 check 回傳 null（通過）或錯誤字串
 */
export function assertAll(checks) {
  const errors = checks.map(fn => fn()).filter(Boolean);
  if (errors.length > 0) throw new ValidationError(errors);
}