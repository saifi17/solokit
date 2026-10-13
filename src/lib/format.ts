// Formatting helpers for money, numbers, dates and durations.
// Dates are shown as "13 Oct 2026": clear in every country, unlike 10/13/2026.

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function money(amount: number, currency = 'USD', opts: { decimals?: number } = {}): string {
  const key = `${currency}|${opts.decimals ?? 'auto'}`;
  let f = moneyFormats.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        ...(opts.decimals != null ? { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals } : {}),
      });
    } catch {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    moneyFormats.set(key, f);
  }
  return f.format(Number.isFinite(amount) ? amount : 0);
}

/** Symbol for a currency code, e.g. USD -> $, EUR -> €, CAD -> CA$. */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export function num(n: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number.isFinite(n) ? n : 0);
}

/** Parse what people type: "1,250.50" -> 1250.5. Empty or invalid -> NaN. */
export function parseNum(v: string | number | undefined | null): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  return Number(cleaned);
}

/** Same as parseNum but returns `fallback` (default 0) instead of NaN. */
export function toNum(v: string | number | undefined | null, fallback = 0): number {
  const n = parseNum(v);
  return Number.isFinite(n) ? n : fallback;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Dates (ISO strings "YYYY-MM-DD" in the visitor's local time) ----
export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}
/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '';
  return fromISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateLong(iso: string | undefined | null): string {
  if (!iso) return '';
  return fromISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---- Durations ----
/** 6138000 -> "1:42:18" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
/** 6138000 -> "1h 42m" */
export function hm(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
/** Hours as a decimal rounded to 2 places: 6138000 -> 1.71 */
export const hours = (ms: number) => round2(ms / 3600000);
