// Backups: everything is stored in this browser only, so people need a way
// to move it to another device or keep a safe copy.
import { keys, load, save, remove } from './storage';
import { downloadFile } from './ics';
import { todayISO } from './format';

export function exportBackup() {
  const data: Record<string, unknown> = {};
  for (const k of keys()) {
    if (k === 'theme') continue;
    data[k] = load(k, null);
  }
  const file = { app: 'SoloKit', version: 1, exportedAt: new Date().toISOString(), data };
  downloadFile(`solokit-backup-${todayISO()}.json`, JSON.stringify(file, null, 2), 'application/json');
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
  let n = 0;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!/^[a-z0-9-]+$/.test(k)) continue;
    save(k, v);
    n++;
  }
  return n;
}

export function deleteEverything() {
  for (const k of keys()) if (k !== 'theme') remove(k);
}
