// Time tracker: start/stop a timer per client, add time by hand, see this
// week's totals, and turn unbilled hours into a draft invoice in one click.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Field, Input, Modal, Icon, useStored, useNow, useToast, base, Seg } from './ui';
import { duration, entryAmount, weekStart, invoiceEntries, toCSV, type TimeEntry, type Running } from '../lib/time';
import { getProfile } from '../lib/profile';
import { savedClients } from '../lib/documents';
import { clock, hm, money, toISO, fromISO, toNum, todayISO, num } from '../lib/format';
import { uid } from '../lib/id';
import { downloadFile } from '../lib/ics';

type Form = { task: string; client: string; rate: string };
type Edit = { id: string; date: string; startT: string; endT: string; task: string; client: string; rate: string };

const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const at = (date: string, time: string) => { const d = fromISO(date); const [h, mi] = time.split(':').map(Number); d.setHours(h || 0, mi || 0, 0, 0); return d.getTime(); };

export default function TimeTracker() {
  const [entries, setEntries, ready] = useStored<TimeEntry[]>('time-entries', []);
  const [running, setRunning] = useStored<Running>('time-running', null);
  const [form, setForm] = useStored<Form>('time-form', { task: '', client: '', rate: '' });
  const [currency, setCurrency] = useState('USD');
  const [view, setView] = useState<'week' | 'all'>('week');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [toast, showToast] = useToast();
  const now = useNow(1000, !!running);

  useEffect(() => {
    const p = getProfile();
    setCurrency(p.currency);
    if (!form.rate && p.defaultRate) setForm((f) => ({ ...f, rate: String(p.defaultRate) }));
    const names = new Set<string>(savedClients().map((c) => c.name));
    setClients([...names]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Show the running time in the browser tab.
  useEffect(() => {
    const base = document.title.replace(/^▶ [\d:]+ · /, '').replace(/^▶ [\d:]+ – /, '');
    if (running) document.title = `▶ ${clock(now - running.start)} – ${base}`;
    else document.title = base;
  }, [running, now]);

  const allClients = useMemo(() => [...new Set([...clients, ...entries.map((e) => e.client).filter(Boolean)])], [clients, entries]);
  const m = (n: number) => money(n, currency);

  function start() {
    if (running) return;
    setRunning({ start: Date.now(), client: form.client.trim(), task: form.task.trim(), rate: toNum(form.rate) });
  }
  function stop() {
    if (!running) return;
    const end = Date.now();
    if (end - running.start < 60000) { setRunning(null); showToast("Under a minute, so it wasn't saved"); return; }
    const entry: TimeEntry = { id: uid(), client: running.client, task: running.task, start: running.start, end, rate: running.rate, billed: '' };
    setEntries([entry, ...entries]);
    setRunning(null);
    showToast(`Saved ${hm(end - running.start)}`);
  }
  // Keep the running timer's details in sync with what's typed.
  function setF(k: keyof Form, v: string) {
    setForm({ ...form, [k]: v });
    if (running) setRunning({ ...running, [k]: k === 'rate' ? toNum(v) : v.trim() } as Running);
  }

  function openNew() {
    const end = new Date();
    const startD = new Date(end.getTime() - 3600000);
    setEdit({ id: '', date: todayISO(), startT: hhmm(startD.getTime()), endT: hhmm(end.getTime()), task: form.task, client: form.client, rate: form.rate });
  }
  function openEdit(e: TimeEntry) {
    setEdit({ id: e.id, date: toISO(new Date(e.start)), startT: hhmm(e.start), endT: hhmm(e.end), task: e.task, client: e.client, rate: String(e.rate || '') });
  }
  function saveEdit() {
    if (!edit) return;
    const s = at(edit.date, edit.startT);
    let e = at(edit.date, edit.endT);
    if (e <= s) e += 86400000; // finished after midnight
    const data = { client: edit.client.trim(), task: edit.task.trim(), start: s, end: e, rate: toNum(edit.rate) };
    if (edit.id) setEntries(entries.map((x) => (x.id === edit.id ? { ...x, ...data } : x)));
    else setEntries([{ id: uid(), billed: '', ...data }, ...entries]);
    setEdit(null);
    showToast(edit.id ? 'Entry updated' : 'Time added');
  }
  function removeEntry(id: string) {
    setEntries(entries.filter((e) => e.id !== id));
    setEdit(null);
    showToast('Entry deleted');
  }
  function bill(client: string, ids: string[]) {
    const doc = invoiceEntries(client, ids);
    window.location.href = `${base()}tools/invoice-generator/?doc=${doc.id}`;
  }
  function exportCSV() {
    const list = view === 'week' ? entries.filter((e) => e.start >= weekStart()) : entries;
    downloadFile(`timesheet-${todayISO()}.csv`, toCSV(list, currency), 'text/csv');
  }

  const ws = weekStart();
  const thisWeek = entries.filter((e) => e.start >= ws);
  const weekMs = thisWeek.reduce((s, e) => s + duration(e), 0) + (running && running.start >= ws ? now - running.start : 0);
  const weekAmt = thisWeek.reduce((s, e) => s + entryAmount(e), 0);
  const unbilled = entries.filter((e) => !e.billed);
  const byClient = Object.entries(unbilled.reduce<Record<string, TimeEntry[]>>((acc, e) => { (acc[e.client || ''] ||= []).push(e); return acc; }, {}));
  const unbilledAmt = unbilled.reduce((s, e) => s + entryAmount(e), 0);

  const shown = (view === 'week' ? thisWeek : entries).slice().sort((a, b) => b.start - a.start);
  const days = shown.reduce<Record<string, TimeEntry[]>>((acc, e) => { (acc[toISO(new Date(e.start))] ||= []).push(e); return acc; }, {});

  return (
    <div class="tracker">
      <section class={`panel timer ${running ? 'is-running' : ''}`} aria-label="Timer">
        <div class="timer-fields">
          <div class="control t-task">
            <input aria-label="What are you working on?" placeholder="What are you working on?" value={form.task}
              onInput={(e) => setF('task', (e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); running ? stop() : start(); } }} />
          </div>
          <div class="control t-client">
            <Icon name="building" size={16} class="faint" />
            <input aria-label="Client" placeholder="Client" list="dl-time-clients" value={form.client} onInput={(e) => setF('client', (e.target as HTMLInputElement).value)} />
          </div>
          <div class="control t-rate">
            <input aria-label="Hourly rate" type="number" inputMode="decimal" min="0" placeholder="Rate" value={form.rate} onInput={(e) => setF('rate', (e.target as HTMLInputElement).value)} />
            <span class="affix">{currency}/h</span>
          </div>
          <datalist id="dl-time-clients">{allClients.map((c) => <option value={c} />)}</datalist>
        </div>
        <div class="timer-main">
          <div class="timer-clock" aria-live="off">{running ? clock(now - running.start) : '0:00:00'}</div>
          {running
            ? <button type="button" class="btn btn-lg timer-btn stop" onClick={stop}><Icon name="stop" />Stop</button>
            : <button type="button" class="btn btn-lg btn-primary timer-btn" onClick={start}><Icon name="play" />Start</button>}
        </div>
        <div class="timer-foot">
          {running
            ? <span class="pill running">Running since {hhmm(running.start)}</span>
            : <span class="tiny faint">Keeps running if you close the tab. Press Enter to start or stop.</span>}
          <button type="button" class="link-btn" onClick={openNew}><Icon name="plus" size={16} />Add time manually</button>
        </div>
      </section>

      <div class="tracker-grid">
        <div>
          <div class="figures">
            <div><span>This week</span><b>{hm(weekMs)}</b></div>
            <div><span>Earned this week</span><b>{m(weekAmt)}</b></div>
            <div><span>Not invoiced yet</span><b>{m(unbilledAmt)}</b></div>
          </div>

          <div class="panel entries">
            <div class="panel-head">
              <h2>Time entries</h2>
              <div class="row-gap">
                <Seg label="Show" value={view} options={[['week', 'This week'], ['all', 'All']]} onChange={setView} />
                <button type="button" class="btn btn-secondary btn-sm" onClick={exportCSV} disabled={!shown.length}><Icon name="download" size={16} />CSV</button>
              </div>
            </div>
            {shown.length === 0 ? (
              <div class="empty">
                <b>{view === 'week' ? 'Nothing tracked this week' : 'No time tracked yet'}</b>
                <span>Type what you're working on and press Start. Your entries appear here.</span>
              </div>
            ) : (
              Object.entries(days).map(([day, list]) => (
                <div class="day">
                  <div class="day-head">
                    <b>{fromISO(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</b>
                    <span>{hm(list.reduce((s, e) => s + duration(e), 0))}</span>
                  </div>
                  {list.map((e) => (
                    <div class="entry">
                      <div class="e-main">
                        <b>{e.task || 'Untitled work'}</b>
                        <span>{e.client || 'No client'}<span aria-hidden="true">, </span>{hhmm(e.start)}–{hhmm(e.end)}</span>
                      </div>
                      <div class="e-num">
                        <b>{hm(duration(e))}</b>
                        <span>{e.rate ? m(entryAmount(e)) : 'No rate'}</span>
                      </div>
                      {e.billed ? <span class="pill paid" title="Already on an invoice">{e.billed}</span> : <span class="pill draft">Unbilled</span>}
                      <button type="button" class="icon-btn" aria-label={`Edit ${e.task || 'entry'}`} onClick={() => openEdit(e)}><Icon name="edit" size={16} /></button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <aside class="panel bill-panel">
          <h2>Ready to invoice</h2>
          <p class="panel-sub">Unbilled time, by client.</p>
          {byClient.length === 0 ? (
            <p class="muted small" style="margin-top:12px">{entries.length ? 'All tracked time is invoiced. Nice.' : 'Nothing to invoice yet. Tracked time appears here, grouped by client.'}</p>
          ) : (
            <ul class="bill-list">
              {byClient.map(([client, list]) => {
                const ms = list.reduce((s, e) => s + duration(e), 0);
                const amt = list.reduce((s, e) => s + entryAmount(e), 0);
                return (
                  <li>
                    <div><b>{client || 'No client'}</b><span>{hm(ms)}, {list.length} {list.length === 1 ? 'entry' : 'entries'}</span></div>
                    <strong>{m(amt)}</strong>
                    <button type="button" class="btn btn-primary btn-sm" onClick={() => bill(client || 'Client', list.map((e) => e.id))}>
                      <Icon name="invoice" size={16} />Create invoice
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p class="tiny faint" style="margin-top:14px">Creates a draft invoice with one line per entry. You can edit it before sending.</p>
        </aside>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit time entry' : 'Add time manually'}
        footer={<>
          {edit?.id && <button type="button" class="btn btn-danger" style="margin-right:auto" onClick={() => removeEntry(edit.id)}><Icon name="trash" />Delete</button>}
          <button type="button" class="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button type="button" class="btn btn-primary" onClick={saveEdit}>{edit?.id ? 'Save changes' : 'Add time'}</button>
        </>}>
        {edit && (
          <>
            <Field label="What did you work on?">{(id) => <Input id={id} value={edit.task} onInput={(e) => setEdit({ ...edit, task: (e.target as HTMLInputElement).value })} placeholder="Homepage layout" />}</Field>
            <div class="grid-2">
              <Field label="Client">{(id) => <Input id={id} list="dl-time-clients" value={edit.client} onInput={(e) => setEdit({ ...edit, client: (e.target as HTMLInputElement).value })} />}</Field>
              <Field label="Hourly rate">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" value={edit.rate} onInput={(e) => setEdit({ ...edit, rate: (e.target as HTMLInputElement).value })} suffix={currency} />}</Field>
            </div>
            <div class="grid-3">
              <Field label="Date">{(id) => <Input id={id} type="date" value={edit.date} onInput={(e) => setEdit({ ...edit, date: (e.target as HTMLInputElement).value })} />}</Field>
              <Field label="Start">{(id) => <Input id={id} type="time" value={edit.startT} onInput={(e) => setEdit({ ...edit, startT: (e.target as HTMLInputElement).value })} />}</Field>
              <Field label="End">{(id) => <Input id={id} type="time" value={edit.endT} onInput={(e) => setEdit({ ...edit, endT: (e.target as HTMLInputElement).value })} />}</Field>
            </div>
            <p class="small muted">Duration: <strong>{(() => { const s = at(edit.date, edit.startT); let e = at(edit.date, edit.endT); if (e <= s) e += 86400000; return `${hm(e - s)} (${num((e - s) / 3600000, 2)} hours)`; })()}</strong></p>
          </>
        )}
      </Modal>
      {toast}
    </div>
  );
}
