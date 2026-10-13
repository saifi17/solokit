// Time tracker storage: finished entries plus the timer that is running now.
import { load, save } from './storage';
import { uid } from './id';
import { createDoc, saveDoc, type Doc } from './documents';
import { fmtDate, toISO, round2 } from './format';
import { toCSVText } from './csv';

export type TimeEntry = {
  id: string;
  client: string;
  task: string;
  start: number;     // ms since epoch
  end: number;
  rate: number;      // hourly, in the profile currency
  billed: string;    // invoice number once invoiced, '' if not yet
};

export type Running = { start: number; client: string; task: string; rate: number } | null;

const ENTRIES = 'time-entries';
const RUNNING = 'time-running';

export const loadEntries = () => load<TimeEntry[]>(ENTRIES, []).sort((a, b) => b.start - a.start);
export const saveEntries = (e: TimeEntry[]) => save(ENTRIES, e);
export const loadRunning = () => load<Running>(RUNNING, null);
export const saveRunning = (r: Running) => save(RUNNING, r);

export const duration = (e: Pick<TimeEntry, 'start' | 'end'>) => Math.max(0, e.end - e.start);
export const entryAmount = (e: TimeEntry) => round2((duration(e) / 3600000) * (e.rate || 0));

export function addEntry(partial: Omit<TimeEntry, 'id' | 'billed'>) {
  const all = load<TimeEntry[]>(ENTRIES, []);
  all.push({ ...partial, id: uid(), billed: '' });
  saveEntries(all);
}

/** Monday 00:00 of the current week (local time). */
export function weekStart(now = new Date()): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/** Create a draft invoice from unbilled entries for one client and mark them billed. */
export function invoiceEntries(client: string, ids: string[]): Doc {
  const all = load<TimeEntry[]>(ENTRIES, []);
  const picked = all.filter((e) => ids.includes(e.id)).sort((a, b) => a.start - b.start);
  const doc = createDoc('invoice');
  doc.client = { ...doc.client, name: client };
  doc.items = picked.map((e) => ({
    id: uid(),
    description: `${fmtDate(toISO(new Date(e.start)))}: ${e.task || 'Work'}`,
    qty: round2(duration(e) / 3600000),
    unit: 'hrs',
    rate: e.rate,
  }));
  const saved = saveDoc(doc);
  saveEntries(all.map((e) => (ids.includes(e.id) ? { ...e, billed: saved.number } : e)));
  return saved;
}

/** Timesheet as CSV (opens in Excel / Google Sheets). */
export function toCSV(entries: TimeEntry[], currency: string): string {
  const rows: (string | number)[][] = [['Date', 'Client', 'Task', 'Start', 'End', 'Hours', `Rate (${currency})`, `Amount (${currency})`, 'Invoice']];
  for (const e of [...entries].sort((a, b) => a.start - b.start)) {
    const s = new Date(e.start);
    const en = new Date(e.end);
    const t = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    rows.push([toISO(s), e.client, e.task, t(s), t(en), round2(duration(e) / 3600000).toFixed(2), Number(e.rate || 0).toFixed(2), entryAmount(e).toFixed(2), e.billed]);
  }
  return toCSVText(rows);
}
