// Backups: everything is stored in this browser only, so people need a way
// to move it to another device or keep a safe copy.
import { keys, load, save, remove } from './storage';
import { downloadFile } from './ics';
import { todayISO } from './format';

// Not copied into backups: the theme is a per-device choice, and the date of
// the last backup belongs to this browser.
const LOCAL_ONLY = ['theme', 'last-backup'];

export function exportBackup() {
  const data: Record<string, unknown> = {};
  for (const k of keys()) {
    if (LOCAL_ONLY.includes(k)) continue;
    data[k] = load(k, null);
  }
  const file = { app: 'SoloKit', version: 1, exportedAt: new Date().toISOString(), data };
  downloadFile(`solokit-backup-${todayISO()}.json`, JSON.stringify(file, null, 2), 'application/json');
  save('last-backup', Date.now());
}

/** When this browser last downloaded a backup (ms), or 0 if never. */
export function lastBackup(): number {
  return load<number>('last-backup', 0) || 0;
}

export async function importBackup(file: File): Promise<number> {
  const text = await file.text();
  let parsed: { app?: string; data?: Record<string, unknown> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file isn\'t a SoloKit backup (it isn\'t valid JSON).');
  }
  if (parsed.app !== 'SoloKit' || typeof parsed.data !== 'object' || !parsed.data) {
    throw new Error('This file isn\'t a SoloKit backup.');
  }
  // Lists of saved items (documents, time entries) are merged by id, so a
  // restore never deletes something that only exists on this device.
  let n = 0;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!/^[a-z0-9-]+$/.test(k) || LOCAL_ONLY.includes(k)) continue;
    const current = load<unknown>(k, null);
    if (Array.isArray(v) && Array.isArray(current) && v.every((x) => x && typeof x === 'object' && 'id' in x)) {
      const byId = new Map<string, unknown>();
      for (const item of current as { id: string }[]) byId.set(item.id, item);
      for (const item of v as { id: string }[]) byId.set(item.id, item);
      save(k, [...byId.values()]);
      n += (v as unknown[]).length;
    } else {
      save(k, v);
      n++;
    }
  }
  return n;
}

export function deleteEverything() {
  for (const k of keys()) if (k !== 'theme') remove(k);
}
