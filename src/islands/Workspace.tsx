// Workspace: everything saved in this browser, in one place.
// Documents, clients, your business details, and backups.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Field, Input, Select, TextArea, Seg, Modal, Icon, useToast, base } from './ui';
import { listDocs, saveDoc, deleteDoc, duplicate, totals, displayStatus, statusLabel, type Doc } from '../lib/documents';
import { getProfile, saveProfile, resizeLogo, type Profile } from '../lib/profile';
import { loadEntries, duration, entryAmount } from '../lib/time';
import { subscribe } from '../lib/storage';
import { exportBackup, importBackup, deleteEverything, lastBackup } from '../lib/backup';
import { money, fmtDate, todayISO, addDays, hm, toNum, toISO } from '../lib/format';
import { downloadFile } from '../lib/ics';
import { toCSVText } from '../lib/csv';
import { currencies } from '../data/currencies';

type Tab = 'documents' | 'clients' | 'profile' | 'data';

function sumByCurrency(items: { amount: number; currency: string }[]): string {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.currency, (map.get(it.currency) || 0) + it.amount);
  if (!map.size) return money(0, getProfile().currency);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => money(v, c)).join(' + ');
}

export default function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('documents');
  const [kind, setKind] = useState<'all' | 'invoice' | 'quote'>('all');
  const [status, setStatus] = useState('any');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<Doc | 'all' | null>(null);
  const [toast, showToast] = useToast();
  const [installEvt, setInstallEvt] = useState<Event & { prompt?: () => void } | null>(null);
  const [backedUp, setBackedUp] = useState(0);

  const refresh = () => setDocs(listDocs());
  useEffect(() => {
    refresh();
    setBackedUp(lastBackup());
    setReady(true);
    const h = location.hash.replace('#', '') as Tab;
    if (['documents', 'clients', 'profile', 'data'].includes(h)) setTab(h);
    const un = subscribe('documents', refresh);
    const unB = subscribe('last-backup', () => setBackedUp(lastBackup()));
    const onInstall = (e: Event) => { e.preventDefault(); setInstallEvt(e as Event & { prompt?: () => void }); };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => { un(); unB(); window.removeEventListener('beforeinstallprompt', onInstall); };
  }, []);

  const go = (t: Tab) => { setTab(t); history.replaceState(null, '', `#${t}`); };

  const today = todayISO();
  const entries = useMemo(() => (ready ? loadEntries() : []), [ready, docs]);
  const invoices = docs.filter((d) => d.type === 'invoice');
  const outstanding = invoices.filter((d) => d.status === 'sent');
  const overdue = outstanding.filter((d) => displayStatus(d, today) === 'overdue');
  const paidRecent = invoices.filter((d) => d.status === 'paid' && d.paidDate && d.paidDate >= addDays(today, -30));
  const unbilled = entries.filter((e) => !e.billed);
  // Everything lives in this browser only, so nudge people to keep a copy.
  const backupAge = backedUp ? Math.floor((Date.now() - backedUp) / 86400000) : -1;
  const backupDue = ready && docs.length >= 3 && (backupAge < 0 || backupAge >= 30);
  const backupText = backupAge < 0 ? 'No backup yet' : backupAge === 0 ? 'Last backup: today' : `Last backup: ${fmtDate(toISO(new Date(backedUp)))} (${backupAge} day${backupAge === 1 ? '' : 's'} ago)`;

  const filtered = docs.filter((d) => {
    if (kind !== 'all' && d.type !== kind) return false;
    const st = displayStatus(d, today);
    if (status !== 'any' && st !== status) return false;
    if (q.trim()) {
      const hay = `${d.number} ${d.client.name} ${d.client.contact} ${d.project}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const clients = useMemo(() => {
    const map = new Map<string, { name: string; email: string; docs: Doc[] }>();
    for (const d of docs) {
      const name = d.client.name.trim() || 'No client name';
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, email: d.client.email, docs: [] });
      map.get(key)!.docs.push(d);
    }
    return [...map.values()].sort((a, b) => Math.max(...b.docs.map((x) => x.updatedAt)) - Math.max(...a.docs.map((x) => x.updatedAt)));
  }, [docs]);

  function exportCSV() {
    const rows: (string | number)[][] = [['Type', 'Number', 'Client', 'Project', 'Issue date', 'Due / valid until', 'Status', 'Currency', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Paid on']];
    const n = (v: number) => v.toFixed(2);
    for (const d of filtered) {
      const t = totals(d);
      const isInv = d.type === 'invoice';
      const paid = d.status === 'paid' ? t.total : t.paid;
      rows.push([isInv ? 'Invoice' : 'Quote', d.number, d.client.name, d.project, d.issueDate, d.dueDate, statusLabel[displayStatus(d, today)], d.currency,
        n(t.subtotal), n(t.discount), n(t.tax), n(t.total), isInv ? n(paid) : '', isInv ? n(t.total - paid) : '', d.paidDate]);
    }
    downloadFile(`solokit-documents-${today}.csv`, toCSVText(rows), 'text/csv;charset=utf-8');
  }

  const edit = (d: Doc) => `${base()}tools/${d.type === 'invoice' ? 'invoice-generator' : 'project-quote-generator'}/?doc=${d.id}`;

  function markPaid(d: Doc) {
    saveDoc({ ...d, status: 'paid', paidDate: today });
    showToast(`${d.number} marked as paid`);
  }
  function dup(d: Doc) {
    const c = saveDoc(duplicate(d));
    showToast(`Copied to ${c.number}`);
  }
  function doDelete() {
    if (confirm === 'all') { deleteEverything(); refresh(); showToast('Everything deleted from this device'); }
    else if (confirm) { deleteDoc(confirm.id); showToast(`${confirm.number} deleted`); }
    setConfirm(null);
  }
  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const n = await importBackup(file);
      refresh();
      showToast(`Backup restored (${n} item${n === 1 ? '' : 's'})`);
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  return (
    <div class="workspace">
      <div class="figures ws-figures">
        <div><span>Waiting to be paid</span><b>{sumByCurrency(outstanding.map((d) => ({ amount: totals(d).balance, currency: d.currency })))}</b><em>{outstanding.length} invoice{outstanding.length === 1 ? '' : 's'} sent</em></div>
        <div class={overdue.length ? 'warn' : ''}><span>Overdue</span><b>{sumByCurrency(overdue.map((d) => ({ amount: totals(d).balance, currency: d.currency })))}</b><em>{overdue.length ? <a href={`${base()}tools/late-payment-email-generator/?doc=${overdue[0].id}`}>Send a reminder</a> : 'Nothing overdue'}</em></div>
        <div><span>Paid in the last 30 days</span><b>{sumByCurrency(paidRecent.map((d) => ({ amount: totals(d).total, currency: d.currency })))}</b><em>{paidRecent.length} invoice{paidRecent.length === 1 ? '' : 's'}</em></div>
        <div><span>Time not invoiced</span><b>{hm(unbilled.reduce((s, e) => s + duration(e), 0))}</b><em>{unbilled.length ? <a href={`${base()}tools/time-tracker/`}>{money(unbilled.reduce((s, e) => s + entryAmount(e), 0), getProfile().currency)} ready to bill</a> : 'All billed'}</em></div>
      </div>

      {backupDue && (
        <div class="backup-nudge" role="note">
          <Icon name="shield" size={18} />
          <p><b>Keep a copy of your work.</b> Your invoices are saved only in this browser{backupAge < 0 ? ', and you haven\'t downloaded a backup yet.' : `, and your last backup was ${backupAge} days ago.`}</p>
          <button type="button" class="btn btn-secondary btn-sm" onClick={exportBackup}><Icon name="download" size={16} />Download backup</button>
        </div>
      )}

      <div class="ws-tabs" role="tablist" aria-label="Workspace sections">
        {([['documents', 'Documents'], ['clients', 'Clients'], ['profile', 'Business details'], ['data', 'Backup and data']] as [Tab, string][]).map(([t, l]) => (
          <button type="button" role="tab" aria-selected={tab === t} class={tab === t ? 'on' : ''} onClick={() => go(t)}>{l}</button>
        ))}
      </div>

      {tab === 'documents' && (
        <section class="panel" role="tabpanel">
          <div class="ws-filters">
            <Seg label="Type" value={kind} options={[['all', 'All'], ['invoice', 'Invoices'], ['quote', 'Quotes']]} onChange={setKind} />
            <div class="control ws-status"><select aria-label="Status" value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
              <option value="any">Any status</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="overdue">Overdue</option>
              <option value="paid">Paid</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="expired">Expired</option>
            </select></div>
            <div class="control ws-search"><Icon name="search" size={15} class="faint" /><input aria-label="Search" placeholder="Search by client, number or project" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></div>
            <div class="ws-new">
              {docs.length > 0 && <button type="button" class="btn btn-quiet btn-sm" onClick={exportCSV} title="For your accountant or a spreadsheet"><Icon name="download" size={16} />CSV</button>}
              <a class="btn btn-primary btn-sm" href={`${base()}tools/invoice-generator/?new=1`}><Icon name="plus" size={16} />Invoice</a>
              <a class="btn btn-secondary btn-sm" href={`${base()}tools/project-quote-generator/?new=1`}><Icon name="plus" size={16} />Quote</a>
            </div>
          </div>
          {!ready ? <p class="muted">Loading…</p> : docs.length === 0 ? (
            <div class="empty">
              <b>No invoices or quotes yet</b>
              <span>Everything you create with SoloKit is saved here, on this device.</span>
              <a class="btn btn-primary btn-sm" href={`${base()}tools/invoice-generator/?new=1`}>Make your first invoice</a>
            </div>
          ) : filtered.length === 0 ? (
            <p class="muted" style="padding:16px 0">Nothing matches these filters.</p>
          ) : (
            <div class="table-wrap">
              <table class="ws-table">
                <thead><tr><th scope="col">Number</th><th scope="col">Client</th><th scope="col">Issued</th><th scope="col">Due / valid</th><th scope="col" class="n">Amount</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {filtered.map((d) => {
                    const st = displayStatus(d, today);
                    const t = totals(d);
                    return (
                      <tr>
                        <td><a href={edit(d)} class="doc-link"><Icon name={d.type === 'invoice' ? 'invoice' : 'quote'} size={16} />{d.number || 'No number'}</a></td>
                        <td>{d.client.name || <span class="faint">No client</span>}{d.project && <span class="tiny faint" style="display:block">{d.project}</span>}</td>
                        <td>{fmtDate(d.issueDate)}</td>
                        <td>{fmtDate(d.dueDate)}</td>
                        <td class="n"><strong>{money(t.total, d.currency)}</strong>{d.type === 'invoice' && d.status !== 'paid' && t.paid > 0 && <span class="tiny faint" style="display:block">{money(t.balance, d.currency)} still due</span>}</td>
                        <td><span class={`pill ${st}`}>{statusLabel[st]}</span></td>
                        <td class="row-actions">
                          {d.type === 'invoice' && d.status === 'sent' && <button type="button" class="btn btn-secondary btn-sm" onClick={() => markPaid(d)}>Mark paid</button>}
                          {st === 'overdue' && <a class="btn btn-quiet btn-sm" href={`${base()}tools/late-payment-email-generator/?doc=${d.id}`}>Remind</a>}
                          <button type="button" class="icon-btn" aria-label={`Duplicate ${d.number}`} title="Duplicate" onClick={() => dup(d)}><Icon name="copy" size={16} /></button>
                          <button type="button" class="icon-btn" aria-label={`Delete ${d.number}`} title="Delete" onClick={() => setConfirm(d)}><Icon name="trash" size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'clients' && (
        <section class="panel" role="tabpanel">
          {clients.length === 0 ? (
            <div class="empty"><b>No clients yet</b><span>Clients appear here once you add them to an invoice or quote.</span></div>
          ) : (
            <div class="table-wrap">
              <table class="ws-table">
                <thead><tr><th scope="col">Client</th><th scope="col">Documents</th><th scope="col" class="n">Invoiced</th><th scope="col" class="n">Paid</th><th scope="col" class="n">Waiting</th><th scope="col">Last activity</th></tr></thead>
                <tbody>
                  {clients.map((c) => {
                    const inv = c.docs.filter((d) => d.type === 'invoice');
                    const amt = (list: Doc[]) => sumByCurrency(list.map((d) => ({ amount: totals(d).total, currency: d.currency })));
                    return (
                      <tr>
                        <td><button type="button" class="link-btn" style="font-size:15px;padding:0" onClick={() => { setQ(c.name); setKind('all'); setStatus('any'); go('documents'); }}>{c.name}</button>{c.email && <span class="tiny faint" style="display:block">{c.email}</span>}</td>
                        <td>{inv.length} invoice{inv.length === 1 ? '' : 's'}, {c.docs.length - inv.length} quote{c.docs.length - inv.length === 1 ? '' : 's'}</td>
                        <td class="n">{amt(inv)}</td>
                        <td class="n">{amt(inv.filter((d) => d.status === 'paid'))}</td>
                        <td class="n">{sumByCurrency(inv.filter((d) => d.status === 'sent').map((d) => ({ amount: totals(d).balance, currency: d.currency })))}</td>
                        <td>{fmtDate(toISO(new Date(Math.max(...c.docs.map((d) => d.updatedAt)))))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'profile' && <ProfileForm onSaved={() => showToast('Business details saved')} />}

      {tab === 'data' && (
        <section class="panel data-panel" role="tabpanel">
          <div class="data-row">
            <div><h2 class="h3">Download a backup</h2><p class="muted small">A single file with your documents, clients, time entries and settings. Keep it somewhere safe, or use it to move to another device.</p><p class="tiny faint">{backupText}</p></div>
            <button type="button" class="btn btn-primary" onClick={exportBackup}><Icon name="download" />Download backup</button>
          </div>
          <div class="data-row">
            <div><h2 class="h3">Restore a backup</h2><p class="muted small">Adds the backup's invoices, quotes and time entries to this browser. Anything that's only on this device stays. Your settings are replaced by the backup's.</p></div>
            <label class="btn btn-secondary"><input type="file" accept="application/json,.json" class="sr-only" onChange={onImport} /><Icon name="upload" />Choose backup file</label>
          </div>
          {installEvt && (
            <div class="data-row">
              <div><h2 class="h3">Install SoloKit</h2><p class="muted small">Open it like an app, even without internet.</p></div>
              <button type="button" class="btn btn-secondary" onClick={() => { installEvt.prompt?.(); setInstallEvt(null); }}><Icon name="offline" />Install</button>
            </div>
          )}
          <div class="data-row danger-zone">
            <div><h2 class="h3">Delete everything</h2><p class="muted small">Removes all SoloKit data from this browser. Download a backup first if you might need it.</p></div>
            <button type="button" class="btn btn-danger" onClick={() => setConfirm('all')}><Icon name="trash" />Delete all data</button>
          </div>
          <p class="tiny faint">Your data is stored only in this browser (local storage). Clearing your browser's site data also removes it.</p>
        </section>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'all' ? 'Delete all SoloKit data?' : `Delete ${confirm ? (confirm as Doc).number : ''}?`}
        footer={<><button type="button" class="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button><button type="button" class="btn btn-danger" onClick={doDelete}><Icon name="trash" />Delete</button></>}>
        <p class="muted">{confirm === 'all' ? 'Every invoice, quote, time entry and setting on this device will be removed. This can\'t be undone.' : 'It will be removed from this device. This can\'t be undone.'}</p>
      </Modal>
      {toast}
    </div>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const [p, setP] = useState<Profile>(getProfile());
  const [err, setErr] = useState('');
  useEffect(() => setP(getProfile()), []);
  const set = (k: keyof Profile, numeric = false) => (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    setP({ ...p, [k]: numeric ? toNum(v) : v });
  };
  async function logo(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try { setErr(''); setP({ ...p, logo: await resizeLogo(f) }); } catch (x) { setErr((x as Error).message); }
  }
  return (
    <div role="tabpanel">
    <form class="panel profile-form" onSubmit={(e) => { e.preventDefault(); saveProfile(p); onSaved(); }}>
      <p class="muted small" style="margin-bottom:16px">Filled in automatically on new invoices, quotes and reminder emails. Documents you've already made keep their own copy.</p>
      <div class="profile-grid">
        <div class="stack">
          <h2 class="h3">You</h2>
          <div class="grid-2">
            <Field label="Business name">{(id) => <Input id={id} value={p.businessName} onInput={set('businessName')} placeholder="Morgan Studio" />}</Field>
            <Field label="Your name">{(id) => <Input id={id} value={p.yourName} onInput={set('yourName')} placeholder="Alex Morgan" />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Email">{(id) => <Input id={id} type="email" value={p.email} onInput={set('email')} />}</Field>
            <Field label="Phone">{(id) => <Input id={id} type="tel" value={p.phone} onInput={set('phone')} />}</Field>
          </div>
          <Field label="Address">{(id) => <TextArea id={id} rows={2} value={p.address} onInput={set('address')} />}</Field>
          <div class="grid-2">
            <Field label="Website">{(id) => <Input id={id} value={p.website} onInput={set('website')} />}</Field>
            <Field label="Tax or VAT number">{(id) => <Input id={id} value={p.taxId} onInput={set('taxId')} />}</Field>
          </div>
          <div class="logo-field">
            {p.logo ? <img src={p.logo} alt="Your logo" /> : <span class="logo-empty"><Icon name="upload" />No logo</span>}
            <div>
              <label class="btn btn-secondary btn-sm"><input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="sr-only" onChange={logo} />{p.logo ? 'Change logo' : 'Upload logo'}</label>
              {p.logo && <button type="button" class="link-btn" onClick={() => setP({ ...p, logo: '' })}>Remove</button>}
              {err && <p class="hint" style="color:var(--bad)">{err}</p>}
            </div>
          </div>
        </div>
        <div class="stack">
          <h2 class="h3">Defaults</h2>
          <div class="grid-2">
            <Field label="Currency">{(id) => <Select id={id} value={p.currency} onChange={set('currency')} options={currencies.map(([c, n]) => [c, `${c}, ${n}`])} />}</Field>
            <Field label="Hourly rate">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" value={p.defaultRate || ''} onInput={set('defaultRate', true)} suffix={p.currency} />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Payment terms">{(id) => <Select id={id} value={String(p.paymentTerms)} onChange={set('paymentTerms', true)} options={[['0', 'Due on receipt'], ['7', '7 days'], ['14', '14 days'], ['15', '15 days'], ['30', '30 days'], ['45', '45 days'], ['60', '60 days']]} />}</Field>
            <Field label="Tax">{(id) => (
              <div class="control">
                <select id={id} class="mini-select" value={p.taxLabel} onChange={set('taxLabel')} aria-label="Tax name">{['Tax', 'VAT', 'GST', 'Sales tax', 'HST'].map((t) => <option>{t}</option>)}</select>
                <input type="number" inputMode="decimal" min="0" step="0.5" value={p.taxRate || ''} onInput={set('taxRate', true)} aria-label="Tax rate" placeholder="0" />
                <span class="affix">%</span>
              </div>
            )}</Field>
          </div>
          <Field label="How clients pay you">{(id) => <TextArea id={id} rows={3} value={p.paymentDetails} onInput={set('paymentDetails')} placeholder="Bank, Wise, Payoneer or PayPal details" />}</Field>
          <Field label="Online payment link (optional)" hint="A PayPal.me, Stripe, Wise or Payoneer link. New invoices show it with a QR code.">{(id) => <Input id={id} type="url" inputMode="url" value={p.paymentLink} onInput={set('paymentLink')} placeholder="paypal.me/alexmorgan" />}</Field>
          <div class="grid-2">
            <Field label="Invoice numbers">{(id) => <Input id={id} value={p.invoicePrefix} onInput={set('invoicePrefix')} suffix={`next: ${p.invoicePrefix}${String(p.nextInvoice).padStart(3, '0')}`} />}</Field>
            <Field label="Next invoice number">{(id) => <Input id={id} type="number" min="1" value={p.nextInvoice} onInput={set('nextInvoice', true)} />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Quote numbers">{(id) => <Input id={id} value={p.quotePrefix} onInput={set('quotePrefix')} />}</Field>
            <Field label="Next quote number">{(id) => <Input id={id} type="number" min="1" value={p.nextQuote} onInput={set('nextQuote', true)} />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Template">{(id) => <Select id={id} value={p.template} onChange={set('template')} options={[['modern', 'Modern'], ['classic', 'Classic'], ['minimal', 'Minimal']]} />}</Field>
            <Field label="Paper size">{(id) => <Select id={id} value={p.paper} onChange={set('paper')} options={[['A4', 'A4'], ['Letter', 'US Letter']]} />}</Field>
          </div>
        </div>
      </div>
      <div class="profile-foot"><button type="submit" class="btn btn-primary"><Icon name="save" />Save details</button></div>
    </form>
    </div>
  );
}
