// Time zone maths using only the browser's Intl API (it knows every
// country's daylight-saving rules).
import { cities } from '../data/cities';

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string) {
  let f = partsCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    partsCache.set(zone, f);
  }
  return f;
}

/** How far `zone` is ahead of UTC (in ms) at `instant`. */
export function offsetMs(zone: string, instant: number): number {
  const p = Object.fromEntries(fmt(zone).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of wall-clock time y-m-d h:00 in `zone`. */
export function instantFor(zone: string, y: number, m: number, d: number, h: number, min = 0): number {
  const guess = Date.UTC(y, m, d, h, min);
  let t = guess - offsetMs(zone, guess);
  t = guess - offsetMs(zone, t); // second pass handles DST edges
  return t;
}

export type Local = { hour: number; minute: number; day: number; weekday: string; dateKey: string };

/** Wall-clock parts in `zone` at `instant`. `hour` includes minutes as a fraction. */
export function local(zone: string, instant: number): Local {
  const shifted = new Date(instant + offsetMs(zone, instant));
  const minute = shifted.getUTCMinutes();
  const p = Object.fromEntries(fmt(zone).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return {
    hour: shifted.getUTCHours() + minute / 60,
    minute,
    day: shifted.getUTCDate(),
    weekday: p.weekday,
    dateKey: `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`,
  };
}

export function fmtTime(hour: number, minute: number, h12: boolean, compact = false): string {
  const hh = Math.floor(hour) % 24;
  const mm = String(minute).padStart(2, '0');
  if (!h12) return `${String(hh).padStart(2, '0')}:${mm}`;
  const suffix = hh < 12 ? 'am' : 'pm';
  const h = hh % 12 === 0 ? 12 : hh % 12;
  if (compact) return `${h}${minute ? ':' + mm : ''}${suffix}`;
  return `${h}:${mm} ${suffix}`;
}

/** "GMT+5" style label for a zone at an instant. */
export function gmtLabel(zone: string, instant: number): string {
  const mins = Math.round(offsetMs(zone, instant) / 60000);
  const sign = mins >= 0 ? '+' : '−';
  const a = Math.abs(mins);
  return `GMT${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

export type Place = { name: string; zone: string };

/** City list plus every IANA zone the browser knows (for search). */
export function allPlaces(): Place[] {
  const list: Place[] = cities.map(([name, zone]) => ({ name, zone }));
  const known = new Set(list.map((p) => p.zone));
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    for (const z of zones) {
      if (known.has(z) || !z.includes('/')) continue;
      list.push({ name: z.split('/').pop()!.replace(/_/g, ' '), zone: z });
    }
  } catch { /* old browser: cities only */ }
  return list;
}

export function devicePlace(): Place {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const city = cities.find(([, z]) => z === zone)?.[0] || zone.split('/').pop()!.replace(/_/g, ' ');
  return { name: city, zone };
}
