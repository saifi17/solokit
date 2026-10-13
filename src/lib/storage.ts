// Tiny wrapper around localStorage. Everything SoloKit saves lives in the
// visitor's own browser under keys starting with "solokit:".
// Every write fires a "solokit:store" event so other parts of the page
// (and other open tabs, via the native "storage" event) can refresh.

const PREFIX = 'solokit:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('solokit:store', { detail: { key } }));
    return true;
  } catch {
    return false; // private mode or storage full
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
    window.dispatchEvent(new CustomEvent('solokit:store', { detail: { key } }));
  } catch { /* ignore */ }
}

/** All SoloKit keys (without the prefix), for backups. */
export function keys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  } catch {
    return [];
  }
}

/** Call `cb` whenever `key` changes in this tab or another one. Returns an unsubscribe function. */
export function subscribe(key: string, cb: () => void): () => void {
  const local = (e: Event) => { if ((e as CustomEvent).detail?.key === key) cb(); };
  const other = (e: StorageEvent) => { if (e.key === PREFIX + key) cb(); };
  window.addEventListener('solokit:store', local);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener('solokit:store', local);
    window.removeEventListener('storage', other);
  };
}
