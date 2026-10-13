// Invoice and quote editor. One component handles both types.
// - Changes save automatically to this browser (after the first edit).
// - The preview on the right is the real document, scaled to fit.
// - "Download PDF" prints just the document; the browser saves it as a PDF.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import DocPreview from './DocPreview';
import { Field, Input, TextArea, Select, Seg, Modal, Icon, useToast, copyText, base, useMedia } from './ui';
import {
  createDoc, getDoc, listDocs, saveDoc, deleteDoc, duplicate, totals, lineAmount, newItem, savedClients,
  invoiceFromQuote, displayStatus, statusLabel, type Doc, type DocType, type LineItem, type DocStatus, type Party,
} from '../lib/documents';
import { getProfile, updateProfile, takeNumber, peekNumber, resizeLogo, hasBusinessDetails } from '../lib/profile';
import { subscribe } from '../lib/storage';
import { currencies } from '../data/currencies';
import { addDays, todayISO, money, fmtDate, toNum, fmtDateLong, round2, toISO } from '../lib/format';
import { normaliseLink } from '../lib/qr';
import { uid } from '../lib/id';
import { loadEntries, saveEntries, duration, type TimeEntry } from '../lib/time';

const invoiceTerms: [string, string][] = [
  ['0', 'Due on receipt'], ['7', 'Net 7 (7 days)'], ['14', 'Net 14 (14 days)'], ['15', 'Net 15 (15 days)'],
  ['30', 'Net 30 (30 days)'], ['45', 'Net 45 (45 days)'], ['60', 'Net 60 (60 days)'], ['-1', 'Custom date'],
];
const quoteValidity: [string, string][] = [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['-1', 'Custom date']];
const units: [string, string][] = [['', 'No unit'], ['hrs', 'hours'], ['days', 'days'], ['items', 'items']];
const taxLabels: [string, string][] = [['Tax', 'Tax'], ['VAT', 'VAT'], ['GST', 'GST'], ['Sales tax', 'Sales tax'], ['HST', 'HST']];
const accents: [string, string][] = [['#0F6B58', 'Evergreen'], ['#1C232B', 'Charcoal'], ['#2D44D8', 'Blue'], ['#0E7490', 'Teal'], ['#6D3B8F', 'Plum'], ['#B4532A', 'Rust'], ['#A8322A', 'Red']];
const templates: [Doc['template'], string, string][] = [
  ['modern', 'Modern', 'Colour header, bold total'],
  ['classic', 'Classic', 'Serif letterhead'],
  ['minimal', 'Minimal', 'Quiet and spacious'],
];

const isBlankItem = (it: LineItem) => !it.description.trim() && !toNum(it.rate);

/** Grow a textarea with its text in browsers that don't support CSS field-sizing yet. */
function autoGrow(el: HTMLTextAreaElement) {
  if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

export default function DocEditor({ type }: { type: DocType }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saved, setSaved] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [clients, setClients] = useState<Party[]>([]);
  const [stampKey, setStampKey] = useState(0);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [modal, setModal] = useState<'' | 'import' | 'convert' | 'delete' | 'email'>('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [toast, showToast] = useToast();
  const isMobile = useMedia('(max-width: 960px)');

  const savedRef = useRef(false);
  const timer = useRef<number>();
  const pending = useRef<Doc | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [docHeight, setDocHeight] = useState(1123);

  const label = type === 'invoice' ? 'invoice' : 'quote';
  const Label = type === 'invoice' ? 'Invoice' : 'Quote';

  // ---------- loading ----------
  const refresh = () => {
    setDocs(listDocs().filter((d) => d.type === type));
    setClients(savedClients());
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('doc');
    let d = id ? getDoc(id) : undefined;
    if (!d && !params.has('new')) d = listDocs().find((x) => x.type === type);
    if (d) open(d, true); else startNew();
    refresh();
    const unsub = subscribe('documents', refresh);
    const onLeave = () => flush();
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    return () => { unsub(); window.removeEventListener('beforeunload', onLeave); window.removeEventListener('pagehide', onLeave); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(d: Doc, isSaved: boolean) {
    setDoc(d);
    setSaved(isSaved);
    savedRef.current = isSaved;
    setUrl(isSaved ? d.id : '');
  }
  function startNew() {
    open(createDoc(type, { take: false }), false);
  }
  function setUrl(id: string) {
    const url = new URL(location.href);
    url.search = id ? `?doc=${id}` : '';
    history.replaceState(null, '', url.toString());
  }

  // ---------- saving ----------
  function persist(d: Doc) {
    let toSave = d;
    if (!savedRef.current) {
      // First save of a new document: claim its number and remember your details.
      if (d.number === peekNumber(d.type)) toSave = { ...d, number: takeNumber(d.type) };
      const p = getProfile();
      if (!hasBusinessDetails(p) && (d.from.businessName || d.from.yourName)) {
        updateProfile({ ...d.from, currency: d.currency });
      }
      savedRef.current = true;
      setSaved(true);
      setUrl(d.id);
    }
    saveDoc(toSave);
  }
  function flush() {
    if (pending.current) {
      window.clearTimeout(timer.current);
      persist(pending.current);
      pending.current = null;
    }
  }
  function update(patch: Partial<Doc>) {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { if (pending.current) { persist(pending.current); pending.current = null; } }, 350);
      return next;
    });
  }
  const setFrom = (k: keyof Doc['from']) => (e: Event) => update({ from: { ...doc!.from, [k]: (e.target as HTMLInputElement).value } });
  const setClient = (k: keyof Party) => (e: Event) => update({ client: { ...doc!.client, [k]: (e.target as HTMLInputElement).value } });
  const setField = (k: keyof Doc) => (e: Event) => update({ [k]: (e.target as HTMLInputElement).value } as Partial<Doc>);

  // ---------- preview scaling ----------
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !doc) return;
    const measure = () => {
      const pageW = doc.paper === 'Letter' ? 816 : 794;
      setScale(el.clientWidth / pageW);
      const inner = el.querySelector<HTMLElement>('.doc');
      if (inner) setDocHeight(inner.offsetHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const inner = el.querySelector('.doc');
    if (inner) ro.observe(inner);
    measure();
    return () => ro.disconnect();
  }, [doc?.paper, doc?.id, tab, isMobile, !!doc]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.more')) setMoreOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreOpen]);

  const t = useMemo(() => (doc ? totals(doc) : null), [doc]);
  const unbilled = useMemo<TimeEntry[]>(() => (modal === 'import' || doc ? loadEntries().filter((e) => !e.billed) : []), [modal, doc?.id]);

  if (!doc || !t) {
    return <div class="panel" style="min-height:420px" aria-busy="true"><p class="muted">Loading the {label} editor…</p></div>;
  }

  const m = (n: number) => money(n, doc.currency);
  const shown = displayStatus(doc);
  const statusOptions: [DocStatus, string][] = type === 'invoice'
    ? [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']]
    : [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined']];

  // ---------- actions ----------
  function setStatus(st: DocStatus) {
    const patch: Partial<Doc> = { status: st };
    if (st === 'paid' && !doc!.paidDate) patch.paidDate = todayISO();
    if (st !== 'paid') patch.paidDate = st === 'draft' || st === 'sent' ? '' : doc!.paidDate;
    if (st === 'paid' || st === 'accepted') setStampKey((k) => k + 1);
    update(patch);
    if (st === 'paid') showToast('Marked as paid');
    if (st === 'accepted') showToast('Quote accepted. Turn it into an invoice from the menu.');
  }

  function printDoc() {
    flush();
    const node = frameRef.current?.querySelector('.doc');
    if (!node) return;
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = '';
    root.appendChild(node.cloneNode(true));
    let page = document.getElementById('print-page');
    if (!page) { page = document.createElement('style'); page.id = 'print-page'; document.head.appendChild(page); }
    page.textContent = `@page { size: ${doc!.paper === 'Letter' ? 'letter' : 'A4'}; margin: 14mm 0; } @page :first { margin-top: 0; }`;
    const old = document.title;
    document.title = `${Label} ${doc!.number}${doc!.client.name ? ' - ' + doc!.client.name : ''}`;
    const done = () => { document.title = old; root!.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }

  function newDoc() { flush(); setMoreOpen(false); startNew(); setTab('edit'); }
  function switchTo(id: string) {
    flush();
    if (id === '__new') return newDoc();
    const d = getDoc(id);
    if (d) open(d, true);
  }
  function dup() {
    flush(); setMoreOpen(false);
    const d = saveDoc(duplicate(doc!));
    open(d, true);
    showToast(`Copied to ${label} ${d.number}`);
  }
  function remove() {
    window.clearTimeout(timer.current);
    pending.current = null;
    if (saved) deleteDoc(doc!.id);
    setModal('');
    const nextDoc = listDocs().find((x) => x.type === type && x.id !== doc!.id);
    if (nextDoc) open(nextDoc, true); else startNew();
    showToast(`${Label} deleted`);
  }
  function convert(mode: 'full' | 'deposit' | 'balance') {
    flush();
    const quote = { ...doc!, status: 'accepted' as DocStatus };
    saveDoc(quote);
    const inv = saveDoc(invoiceFromQuote(quote, mode));
    window.location.href = `${base()}tools/invoice-generator/?doc=${inv.id}`;
  }

  async function uploadLogo(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      setLogoError('');
      const logo = await resizeLogo(file);
      update({ from: { ...doc!.from, logo }, showLogo: true });
    } catch (err) {
      setLogoError((err as Error).message);
    }
  }

  function saveAsDefaults() {
    updateProfile({ ...doc!.from, currency: doc!.currency, paymentDetails: doc!.paymentDetails, template: doc!.template, accent: doc!.accent, paper: doc!.paper, taxLabel: doc!.taxLabel });
    showToast('Saved as your default details');
  }

  // ---------- items ----------
  function setItem(id: string, patch: Partial<LineItem>) {
    update({ items: doc!.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  function addItem() {
    update({ items: [...doc!.items, newItem(getProfile().defaultRate)] });
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLTextAreaElement>('.item-row textarea');
      rows[rows.length - 1]?.focus();
    });
  }
  function removeItem(id: string) {
    const items = doc!.items.filter((it) => it.id !== id);
    update({ items: items.length ? items : [newItem()] });
  }
  function moveItem(id: string, dir: -1 | 1) {
    const items = [...doc!.items];
    const i = items.findIndex((it) => it.id === id);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    update({ items });
  }

  function importEntries(ids: string[]) {
    const all = loadEntries();
    const picked = all.filter((e) => ids.includes(e.id)).sort((a, b) => a.start - b.start);
    if (!picked.length) return;
    const lines: LineItem[] = picked.map((e) => ({
      id: uid(),
      description: `${fmtDate(toISO(new Date(e.start)))}: ${e.task || 'Work'}`,
      qty: round2(duration(e) / 3600000),
      unit: 'hrs',
      rate: e.rate,
    }));
    const keep = doc!.items.filter((it) => !isBlankItem(it));
    const client = doc!.client.name ? doc!.client : { ...doc!.client, name: picked[0].client };
    const next = { ...doc!, items: [...keep, ...lines], client };
    setDoc(next);
    persist(next);
    const number = getDoc(next.id)?.number || next.number;
    saveEntries(all.map((e) => (ids.includes(e.id) ? { ...e, billed: number } : e)));
    setModal('');
    showToast(`Added ${lines.length} time ${lines.length === 1 ? 'entry' : 'entries'}`);
  }

  function emailText() {
    const first = doc!.client.contact.trim().split(/\s+/)[0] || 'there';
    const sender = [doc!.from.yourName || doc!.from.businessName, doc!.from.yourName && doc!.from.businessName ? doc!.from.businessName : ''].filter(Boolean).join('\n') || '[Your name]';
    const forProject = doc!.project ? ` for ${doc!.project}` : '';
    if (type === 'invoice' && doc!.status === 'paid') {
      return {
        subject: `Receipt for invoice ${doc!.number}`,
        body: `Hi ${first},\n\nThank you for your payment of ${m(t!.total)} for invoice ${doc!.number}${forProject}${doc!.paidDate ? `, received on ${fmtDateLong(doc!.paidDate)}` : ''}. I've attached the invoice marked as paid, for your records.\n\nIt was a pleasure working with you, and I'm here if you need anything else.\n\nBest regards,\n${sender}`,
      };
    }
    if (type === 'invoice') {
      const link = normaliseLink(doc!.paymentLink || '');
      const how = [doc!.paymentDetails.trim(), link ? `Online: ${link}` : ''].filter(Boolean).join('\n');
      return {
        subject: `Invoice ${doc!.number} from ${doc!.from.businessName || doc!.from.yourName || '[your business]'}`,
        body: `Hi ${first},\n\nPlease find attached invoice ${doc!.number}${forProject}, for ${m(t!.balance)}${t!.paid > 0 ? ` (the balance after the ${m(t!.paid)} already paid)` : ''}. It is due on ${fmtDateLong(doc!.dueDate)}.\n\n${how ? `You can pay by:\n${how}\n\n` : ''}Thank you for your business, and let me know if you have any questions.\n\nBest regards,\n${sender}`,
      };
    }
    return {
      subject: `Quote ${doc!.number}${forProject}`,
      body: `Hi ${first},\n\nThanks for the chance to work on this. Please find attached my quote ${doc!.number}${forProject}, for ${m(t!.total)}${doc!.timeline ? `, with a timeline of ${doc!.timeline}` : ''}. It is valid until ${fmtDateLong(doc!.dueDate)}.\n\n${doc!.deposit > 0 ? `To get started, just reply to confirm and I'll send an invoice for the ${doc!.deposit}% deposit (${m(t!.deposit)}).\n\n` : 'To go ahead, just reply to confirm.\n\n'}Happy to answer any questions or adjust the scope.\n\nBest regards,\n${sender}`,
    };
  }

  const fromFilled = !!(doc.from.businessName || doc.from.yourName);
  const isBlank = !doc.client.name && doc.items.every(isBlankItem);

  function fillExample() {
    const items: LineItem[] = type === 'invoice'
      ? [
        { id: uid(), description: 'Website design, 5 pages', qty: 1, unit: '', rate: 2800 },
        { id: uid(), description: 'Front-end development', qty: 20, unit: 'hrs', rate: 80 },
        { id: uid(), description: 'Hosting setup and launch', qty: 1, unit: '', rate: 250 },
      ]
      : [
        { id: uid(), description: 'Discovery workshop and site plan', qty: 1, unit: '', rate: 600 },
        { id: uid(), description: 'Website design, 5 pages', qty: 1, unit: '', rate: 2800 },
        { id: uid(), description: 'Development and launch', qty: 1, unit: '', rate: 1400 },
      ];
    update({
      client: { name: 'Northwind Studio Ltd', contact: 'Jordan Lee', email: 'accounts@example.com', address: '400 Market Street, Suite 12\nSan Francisco, CA 94103, USA', taxId: '' },
      project: 'Website redesign',
      ...(type === 'quote' ? { timeline: '4 weeks from the deposit' } : {}),
      items,
    });
    showToast('Example added. Change anything you like.');
  }
  const termsValue = String(doc.terms);
  const pageW = doc.paper === 'Letter' ? 816 : 794;

  // ---------- render ----------
  const toolbar = (
    <div class="doc-toolbar panel">
      <div class="dt-left">
        <div class="control dt-switch">
          <select aria-label={`Open a saved ${label}`} value={saved ? doc.id : '__current'} onChange={(e) => switchTo((e.target as HTMLSelectElement).value)}>
            {!saved && <option value="__current">{doc.number || `New ${label}`} (not saved yet)</option>}
            {docs.map((d) => <option value={d.id}>{d.number}{d.client.name ? `, ${d.client.name}` : ''}</option>)}
            <option value="__new">+ New {label}</option>
          </select>
        </div>
        <button type="button" class="btn btn-secondary" onClick={newDoc}><Icon name="plus" />New</button>
      </div>
      <div class="dt-status">
        <Seg label="Status" value={doc.status} options={statusOptions} onChange={setStatus} />
        {(shown === 'overdue' || shown === 'expired') && <span class={`pill ${shown === 'overdue' ? 'overdue' : 'declined'}`}>{statusLabel[shown]}</span>}
      </div>
      <div class="dt-actions">
        <button type="button" class="btn btn-primary" onClick={printDoc}><Icon name="download" />Download PDF</button>
        <div class="more">
          <button type="button" class="btn btn-secondary" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen(!moreOpen)} aria-label="More actions"><Icon name="more" /></button>
          {moreOpen && (
            <div class="more-menu" role="menu" onClick={() => setMoreOpen(false)}>
              {type === 'quote' && <button type="button" role="menuitem" onClick={() => setModal('convert')}><Icon name="invoice" />Turn into an invoice</button>}
              <button type="button" role="menuitem" onClick={() => setModal('email')}><Icon name="mail" />Write the email</button>
              {type === 'invoice' && doc.status === 'sent' && saved && (
                <button type="button" role="menuitem" onClick={() => { flush(); window.location.href = `${base()}tools/late-payment-email-generator/?doc=${doc.id}`; }}><Icon name="send" />Send a payment reminder</button>
              )}
              <button type="button" role="menuitem" onClick={dup}><Icon name="copy" />Duplicate</button>
              <button type="button" role="menuitem" onClick={() => { flush(); window.location.href = `${base()}workspace/`; }}><Icon name="folder" />All documents</button>
              <button type="button" role="menuitem" class="danger" onClick={() => setModal('delete')}><Icon name="trash" />Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const form = (
    <form class="panel doc-form" onSubmit={(e) => e.preventDefault()} noValidate hidden={isMobile && tab === 'preview'}>
      {isBlank && (
        <div class="example-bar">
          <span>First time here? See how it works with example data.</span>
          <button type="button" class="btn btn-secondary btn-sm" onClick={fillExample}><Icon name="sparkle" size={16} />Fill in an example</button>
        </div>
      )}
      <details class="section" open>
        <summary>Your details<span class="sum-note">{doc.from.businessName || doc.from.yourName || 'Not added yet'}</span></summary>
        <div class="section-body">
          {!fromFilled && <p class="callout"><Icon name="info" />Add your details once. They'll be filled in on every {label} you make on this device.</p>}
          <div class="grid-2">
            <Field label="Business name">{(id) => <Input id={id} value={doc.from.businessName} onInput={setFrom('businessName')} placeholder="Morgan Studio" autoComplete="organization" />}</Field>
            <Field label="Your name">{(id) => <Input id={id} value={doc.from.yourName} onInput={setFrom('yourName')} placeholder="Alex Morgan" autoComplete="name" />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Email">{(id) => <Input id={id} type="email" value={doc.from.email} onInput={setFrom('email')} placeholder="alex@morganstudio.com" autoComplete="email" />}</Field>
            <Field label="Phone (optional)">{(id) => <Input id={id} type="tel" value={doc.from.phone} onInput={setFrom('phone')} placeholder="+44 20 7946 0958" autoComplete="tel" />}</Field>
          </div>
          <Field label="Address">{(id) => <TextArea id={id} rows={2} value={doc.from.address} onInput={setFrom('address')} placeholder={'21 Baker Street\nLondon NW1 6XE, United Kingdom'} />}</Field>
          <div class="grid-2">
            <Field label="Website (optional)">{(id) => <Input id={id} value={doc.from.website} onInput={setFrom('website')} placeholder="morganstudio.com" />}</Field>
            <Field label="Tax or VAT number (optional)">{(id) => <Input id={id} value={doc.from.taxId} onInput={setFrom('taxId')} placeholder="GB123456789" />}</Field>
          </div>
          <div class="logo-field">
            {doc.from.logo ? <img src={doc.from.logo} alt="Your logo" /> : <span class="logo-empty"><Icon name="upload" />No logo</span>}
            <div>
              <label class="btn btn-secondary btn-sm">
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="sr-only" onChange={uploadLogo} />
                {doc.from.logo ? 'Change logo' : 'Upload logo'}
              </label>
              {doc.from.logo && <button type="button" class="link-btn" onClick={() => update({ from: { ...doc.from, logo: '' } })}>Remove</button>}
              <p class="hint">PNG, JPG or SVG. A wide logo on a transparent background looks best.</p>
              {logoError && <p class="hint" style="color:var(--bad)">{logoError}</p>}
            </div>
          </div>
          <div><button type="button" class="btn btn-secondary btn-sm" onClick={saveAsDefaults}><Icon name="save" />Save as my default details</button></div>
        </div>
      </details>

      <details class="section" open>
        <summary>{type === 'invoice' ? 'Bill to' : 'Prepared for'}<span class="sum-note">{doc.client.name || 'Add your client'}</span></summary>
        <div class="section-body">
          <div class="grid-2">
            <Field label="Client or company">{(id) => (
              <Input id={id} list="dl-clients" value={doc.client.name} placeholder="Northwind Studio Ltd" onInput={(e) => {
                const name = (e.target as HTMLInputElement).value;
                const match = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
                update({ client: match && !doc.client.address && !doc.client.email ? { ...match } : { ...doc.client, name } });
              }} />
            )}</Field>
            <Field label="Contact person">{(id) => <Input id={id} value={doc.client.contact} onInput={setClient('contact')} placeholder="Jordan Lee" />}</Field>
          </div>
          <datalist id="dl-clients">{clients.map((c) => <option value={c.name} />)}</datalist>
          <Field label="Client email">{(id) => <Input id={id} type="email" value={doc.client.email} onInput={setClient('email')} placeholder="accounts@northwind.com" />}</Field>
          <Field label="Billing address">{(id) => <TextArea id={id} rows={2} value={doc.client.address} onInput={setClient('address')} placeholder={'400 Market Street, Suite 12\nSan Francisco, CA 94103, USA'} />}</Field>
          <Field label="Client tax or VAT number (optional)">{(id) => <Input id={id} value={doc.client.taxId} onInput={setClient('taxId')} placeholder="EU business? Add their VAT number." />}</Field>
        </div>
      </details>

      <details class="section" open>
        <summary>{Label} details<span class="sum-note">{doc.number}{doc.dueDate ? `, ${type === 'invoice' ? 'due' : 'valid until'} ${fmtDate(doc.dueDate)}` : ''}</span></summary>
        <div class="section-body">
          <div class="grid-2">
            <Field label={`${Label} number`}>{(id) => <Input id={id} value={doc.number} onInput={setField('number')} />}</Field>
            <Field label="Currency">{(id) => <Select id={id} value={doc.currency} onChange={setField('currency')} options={currencies.map(([c, n]) => [c, `${c}, ${n}`])} />}</Field>
          </div>
          <div class="grid-2">
            <Field label={type === 'invoice' ? 'Issue date' : 'Date'}>{(id) => (
              <Input id={id} type="date" value={doc.issueDate} onInput={(e) => {
                const issueDate = (e.target as HTMLInputElement).value;
                update({ issueDate, dueDate: doc.terms >= 0 && issueDate ? addDays(issueDate, doc.terms) : doc.dueDate });
              }} />
            )}</Field>
            <Field label={type === 'invoice' ? 'Payment terms' : 'Valid for'}>{(id) => (
              <Select id={id} value={(type === 'invoice' ? invoiceTerms : quoteValidity).some(([v]) => v === termsValue) ? termsValue : '-1'}
                options={type === 'invoice' ? invoiceTerms : quoteValidity}
                onChange={(e) => {
                  const terms = Number((e.target as HTMLSelectElement).value);
                  update({ terms, dueDate: terms >= 0 && doc.issueDate ? addDays(doc.issueDate, terms) : doc.dueDate });
                }} />
            )}</Field>
          </div>
          <div class="grid-2">
            <Field label={type === 'invoice' ? 'Due date' : 'Valid until'}>{(id) => (
              <Input id={id} type="date" value={doc.dueDate} onInput={(e) => update({ dueDate: (e.target as HTMLInputElement).value, terms: -1 })} />
            )}</Field>
            <Field label="Project (optional)">{(id) => <Input id={id} value={doc.project} onInput={setField('project')} placeholder="Website redesign" />}</Field>
          </div>
          {type === 'quote' && (
            <div class="grid-2">
              <Field label="Timeline (optional)">{(id) => <Input id={id} value={doc.timeline} onInput={setField('timeline')} placeholder="3 weeks from the deposit" />}</Field>
              <Field label="Deposit to start">{(id) => (
                <Input id={id} type="number" inputMode="decimal" min="0" max="100" step="5" key={`dep-${doc.id}`} defaultValue={String(doc.deposit)}
                  onInput={(e) => update({ deposit: Math.min(100, Math.max(0, toNum((e.target as HTMLInputElement).value))) })} suffix="%" />
              )}</Field>
            </div>
          )}
        </div>
      </details>

      <details class="section" open>
        <summary>Work and prices<span class="sum-note">{m(t.total)}</span></summary>
        <div class="section-body">
          <div class="items">
            {doc.items.map((it, i) => (
              <div class="item-row" key={it.id}>
                <div class="control it-desc">
                  <textarea aria-label={`Line ${i + 1} description`} rows={1} value={it.description} placeholder="What you did, e.g. Homepage design"
                    onInput={(e) => { const el = e.target as HTMLTextAreaElement; autoGrow(el); setItem(it.id, { description: el.value }); }} />
                </div>
                <div class="it-tools">
                  <button type="button" class="icon-btn" aria-label={`Move line ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => moveItem(it.id, -1)}><Icon name="chevron" size={16} class="up" /></button>
                  <button type="button" class="icon-btn" aria-label={`Remove line ${i + 1}`} title="Remove" onClick={() => removeItem(it.id)}><Icon name="trash" size={16} /></button>
                </div>
                <div class="control it-qty"><span class="affix">Qty</span><input aria-label={`Line ${i + 1} quantity`} type="number" inputMode="decimal" min="0" step="0.25" defaultValue={String(it.qty)}
                  onInput={(e) => setItem(it.id, { qty: toNum((e.target as HTMLInputElement).value) })} /></div>
                <div class="control it-unit"><select aria-label={`Line ${i + 1} unit`} value={it.unit} onChange={(e) => setItem(it.id, { unit: (e.target as HTMLSelectElement).value as LineItem['unit'] })}>
                  {units.map(([v, l]) => <option value={v}>{l}</option>)}
                </select></div>
                <div class="control it-rate"><span class="affix">Rate</span><input aria-label={`Line ${i + 1} rate`} type="number" inputMode="decimal" min="0" step="1" defaultValue={it.rate ? String(it.rate) : ''} placeholder="0"
                  onInput={(e) => setItem(it.id, { rate: toNum((e.target as HTMLInputElement).value) })} /></div>
                <div class="it-amount"><span class="faint tiny">Amount</span>{m(lineAmount(it))}</div>
              </div>
            ))}
          </div>
          <div class="items-actions">
            <button type="button" class="btn btn-secondary btn-sm" onClick={addItem}><Icon name="plus" />Add a line</button>
            {type === 'invoice' && (
              <button type="button" class="btn btn-quiet btn-sm" onClick={() => setModal('import')}><Icon name="timer" />Add tracked time{unbilled.length ? ` (${unbilled.length})` : ''}</button>
            )}
          </div>
          <div class="grid-2 totals-controls">
            <div class="field">
              <span class="label">Discount</span>
              <div class="control">
                <input aria-label="Discount" type="number" inputMode="decimal" min="0" step="1" key={`disc-${doc.id}`} defaultValue={doc.discountValue ? String(doc.discountValue) : ''} placeholder="0"
                  onInput={(e) => update({ discountValue: toNum((e.target as HTMLInputElement).value) })} />
                <select aria-label="Discount type" class="mini-select" value={doc.discountType} onChange={(e) => update({ discountType: (e.target as HTMLSelectElement).value as Doc['discountType'] })}>
                  <option value="percent">%</option><option value="amount">{doc.currency}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <span class="label">Tax</span>
              <div class="control">
                <select aria-label="Tax name" class="mini-select" value={doc.taxLabel} onChange={(e) => update({ taxLabel: (e.target as HTMLSelectElement).value })}>
                  {taxLabels.map(([v, l]) => <option value={v}>{l}</option>)}
                </select>
                <input aria-label="Tax rate" type="number" inputMode="decimal" min="0" max="100" step="0.5" key={`tax-${doc.id}`} defaultValue={doc.taxRate ? String(doc.taxRate) : ''} placeholder="0"
                  onInput={(e) => update({ taxRate: toNum((e.target as HTMLInputElement).value) })} />
                <span class="affix">%</span>
              </div>
            </div>
            {type === 'invoice' && (
              <div class="field">
                <label for={`paid-${doc.id}`}>Already paid</label>
                <div class="control">
                  <input id={`paid-${doc.id}`} type="number" inputMode="decimal" min="0" step="1" key={`paid-${doc.id}`} defaultValue={doc.amountPaid ? String(doc.amountPaid) : ''} placeholder="0"
                    onInput={(e) => update({ amountPaid: toNum((e.target as HTMLInputElement).value) })} />
                  <span class="affix">{doc.currency}</span>
                </div>
                <span class="hint">A deposit or part payment. The invoice shows the balance.</span>
              </div>
            )}
          </div>
          <dl class="mini-totals">
            <div><dt>Subtotal</dt><dd>{m(t.subtotal)}</dd></div>
            {t.discount > 0 && <div><dt>Discount</dt><dd>−{m(t.discount)}</dd></div>}
            {t.tax > 0 && <div><dt>{doc.taxLabel}</dt><dd>{m(t.tax)}</dd></div>}
            {t.paid > 0 && <div><dt>Total</dt><dd>{m(t.total)}</dd></div>}
            {t.paid > 0 && <div><dt>{doc.status === 'paid' ? 'Paid in full' : 'Already paid'}</dt><dd>−{m(t.paid)}</dd></div>}
            <div class="big"><dt>{type === 'invoice' ? (t.paid > 0 ? 'Balance due' : 'Amount due') : 'Total'}</dt><dd>{m(type === 'invoice' ? t.balance : t.total)}</dd></div>
            {type === 'quote' && doc.deposit > 0 && <div><dt>Deposit ({doc.deposit}%)</dt><dd>{m(t.deposit)}</dd></div>}
          </dl>
        </div>
      </details>

      <details class="section" open>
        <summary>{type === 'invoice' ? 'Payment and notes' : 'Terms and notes'}</summary>
        <div class="section-body">
          {type === 'quote' && (
            <Field label="Scope and terms" hint="What's included, revisions, what happens if the scope grows.">
              {(id) => <TextArea id={id} rows={4} value={doc.quoteTerms} onInput={setField('quoteTerms')} />}
            </Field>
          )}
          <Field label="How to pay you" hint={<>Bank, Wise, Payoneer or PayPal details. <button type="button" class="link-btn" onClick={() => { updateProfile({ paymentDetails: doc.paymentDetails, paymentLink: doc.paymentLink }); showToast('Payment details saved for next time'); }}>Save for next time</button></>}>
            {(id) => <TextArea id={id} rows={3} value={doc.paymentDetails} onInput={setField('paymentDetails')} placeholder={'Bank transfer (USD): Alex Morgan\nAccount 1234567890, routing 026073150\nor Wise: alex@morganstudio.com'} />}
          </Field>
          <Field label="Online payment link (optional)" hint="A PayPal.me, Stripe, Wise or Payoneer link. It's clickable in the PDF.">
            {(id) => <Input id={id} type="url" inputMode="url" value={doc.paymentLink} onInput={(e) => update({ paymentLink: (e.target as HTMLInputElement).value, showQR: doc.paymentLink ? doc.showQR : true })} placeholder="paypal.me/alexmorgan" />}
          </Field>
          {doc.paymentLink.trim() && (
            <label class="check">
              <input type="checkbox" checked={doc.showQR} onChange={(e) => update({ showQR: (e.target as HTMLInputElement).checked })} />
              Add a QR code, so clients can pay from their phone
            </label>
          )}
          <Field label="Notes (optional)">{(id) => <TextArea id={id} rows={2} value={doc.notes} onInput={setField('notes')} placeholder="Thank you for your business." />}</Field>
        </div>
      </details>

      <details class="section">
        <summary>Design<span class="sum-note">{templates.find(([v]) => v === doc.template)?.[1]}, {doc.paper}</span></summary>
        <div class="section-body">
          <div class="tpl-picker" role="radiogroup" aria-label="Template">
            {templates.map(([v, name, desc]) => (
              <button type="button" role="radio" aria-checked={doc.template === v} class={`tpl-card ${doc.template === v ? 'on' : ''}`} onClick={() => update({ template: v })} style={{ '--a': doc.accent } as Record<string, string>}>
                <span class={`tpl-thumb t-${v}`}><i /><i /><i /><i /></span>
                <b>{name}</b><span>{desc}</span>
              </button>
            ))}
          </div>
          <div class="field">
            <span class="label">Accent colour</span>
            <div class="swatches" role="radiogroup" aria-label="Accent colour">
              {accents.map(([c, name]) => (
                <button type="button" role="radio" aria-checked={doc.accent.toLowerCase() === c.toLowerCase()} aria-label={name} title={name} style={{ background: c }} onClick={() => update({ accent: c })} />
              ))}
              <label class="swatch-custom" title="Pick any colour">
                <input type="color" value={doc.accent} onInput={(e) => update({ accent: (e.target as HTMLInputElement).value })} aria-label="Custom colour" />
              </label>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <span class="label">Paper size</span>
              <Seg label="Paper size" value={doc.paper} options={[['A4', 'A4'], ['Letter', 'US Letter']]} onChange={(paper) => update({ paper })} />
              <span class="hint">US and Canadian clients usually use Letter.</span>
            </div>
            <label class="check" style="align-self:center">
              <input type="checkbox" checked={doc.showLogo} onChange={(e) => update({ showLogo: (e.target as HTMLInputElement).checked })} />
              Show my logo
            </label>
          </div>
        </div>
      </details>
      <p class="save-note tiny faint">{saved ? 'Saved on this device. Find everything later in your Workspace.' : 'Starts saving on this device as soon as you type.'}</p>
    </form>
  );

  const preview = (
    <div class="doc-side" hidden={isMobile && tab === 'edit'}>
      <div class="doc-frame" ref={frameRef} style={{ height: `${Math.ceil(docHeight * scale)}px`, '--s': scale } as Record<string, string | number>}>
        <div class="doc-scale" style={{ transform: `scale(${scale})`, width: `${pageW}px` }}>
          <DocPreview doc={doc} stampKey={stampKey} />
        </div>
      </div>
      <div class="doc-side-actions">
        <button type="button" class="btn btn-primary btn-block" onClick={printDoc}><Icon name="download" />Download PDF</button>
        <p class="tiny faint">In the print window, choose <strong>Save as PDF</strong> as the printer.</p>
      </div>
    </div>
  );

  const email = modal === 'email' ? emailText() : null;
  const groups = unbilled.reduce<Record<string, TimeEntry[]>>((acc, e) => { (acc[e.client || 'No client'] ||= []).push(e); return acc; }, {});

  return (
    <div class="doc-editor">
      {toolbar}
      {isMobile && (
        <div class="mobile-tabs">
          <Seg label="View" value={tab} options={[['edit', 'Edit'], ['preview', 'Preview']]} onChange={setTab} />
        </div>
      )}
      <div class="split wide-right doc-split">
        {form}
        <div class="sticky">{preview}</div>
      </div>

      <Modal open={modal === 'delete'} onClose={() => setModal('')} title={`Delete ${label} ${doc.number}?`}
        footer={<><button type="button" class="btn btn-secondary" onClick={() => setModal('')}>Keep it</button><button type="button" class="btn btn-danger" onClick={remove}><Icon name="trash" />Delete</button></>}>
        <p class="muted">This removes it from this device. It can't be undone, unless you have a backup.</p>
      </Modal>

      <Modal open={modal === 'convert'} onClose={() => setModal('')} title="Turn this quote into an invoice"
        footer={<button type="button" class="btn btn-secondary" onClick={() => setModal('')}>Cancel</button>}>
        <p class="muted">The quote will be marked as accepted, and a new invoice opens with the same client and work.</p>
        <div class="choice-list">
          {doc.deposit > 0 && doc.deposit < 100 && (
            <button type="button" class="choice" onClick={() => convert('deposit')}>
              <b>Invoice the {doc.deposit}% deposit</b><span>{m(t.deposit)} now, the rest when the work is done.</span>
            </button>
          )}
          {doc.deposit > 0 && doc.deposit < 100 && (
            <button type="button" class="choice" onClick={() => convert('balance')}>
              <b>Invoice the remaining balance</b><span>Every line from the quote, with the {doc.deposit}% deposit ({m(t.deposit)}) shown as paid. Balance: {m(t.total - t.deposit)}.</span>
            </button>
          )}
          <button type="button" class="choice" onClick={() => convert('full')}>
            <b>Invoice the full amount</b><span>{m(t.total)} with every line from the quote.</span>
          </button>
        </div>
      </Modal>

      <Modal open={modal === 'import'} onClose={() => setModal('')} title="Add tracked time" wide>
        {unbilled.length === 0 ? (
          <div class="empty">
            <b>No unbilled time yet</b>
            <span>Time you track in the time tracker shows up here, ready to bill.</span>
            <a class="btn btn-secondary btn-sm" href={`${base()}tools/time-tracker/`}><Icon name="timer" />Open the time tracker</a>
          </div>
        ) : (
          <ImportList groups={groups} currency={doc.currency} preselect={doc.client.name} onAdd={importEntries} />
        )}
      </Modal>

      <Modal open={modal === 'email'} onClose={() => setModal('')} title={`Email to send with the ${label}`} wide
        footer={<><button type="button" class="btn btn-secondary" onClick={async () => { if (email && await copyText(email.subject)) showToast('Subject copied'); }}>Copy subject</button>
          <button type="button" class="btn btn-primary" onClick={async () => { if (email && await copyText(email.body)) showToast('Email copied'); }}><Icon name="copy" />Copy email</button></>}>
        {email && (
          <div class="mail">
            <div class="mail-row"><span>To</span><b>{doc.client.email || doc.client.contact || doc.client.name || 'Your client'}</b></div>
            <div class="mail-row"><span>Subject</span><b>{email.subject}</b></div>
            <pre class="mail-body">{email.body}</pre>
            <p class="tiny faint">Download the PDF first, then attach it to this email.</p>
          </div>
        )}
      </Modal>
      {toast}
    </div>
  );
}

function ImportList({ groups, currency, preselect, onAdd }: { groups: Record<string, TimeEntry[]>; currency: string; preselect: string; onAdd: (ids: string[]) => void }) {
  const initial = Object.entries(groups).flatMap(([c, list]) => (preselect && c.toLowerCase() === preselect.toLowerCase() ? list.map((e) => e.id) : []));
  const [picked, setPicked] = useState<string[]>(initial);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const all = Object.values(groups).flat();
  const sel = all.filter((e) => picked.includes(e.id));
  const hrs = sel.reduce((s, e) => s + duration(e), 0) / 3600000;
  const amt = sel.reduce((s, e) => s + (duration(e) / 3600000) * e.rate, 0);
  return (
    <div class="import">
      {Object.entries(groups).map(([client, list]) => (
        <fieldset>
          <legend>
            <label class="check"><input type="checkbox" checked={list.every((e) => picked.includes(e.id))}
              onChange={(e) => setPicked((p) => ((e.target as HTMLInputElement).checked ? [...new Set([...p, ...list.map((x) => x.id)])] : p.filter((id) => !list.some((x) => x.id === id))))} />
              <b>{client}</b></label>
          </legend>
          {list.map((e) => (
            <label class="check import-row">
              <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
              <span>{fmtDate(toISO(new Date(e.start)))}</span>
              <span class="grow">{e.task || 'Work'}</span>
              <span>{(duration(e) / 3600000).toFixed(2)} h</span>
              <span>{money((duration(e) / 3600000) * e.rate, currency)}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <div class="import-foot">
        <span>{sel.length} selected: <strong>{hrs.toFixed(2)} hours, {money(amt, currency)}</strong></span>
        <button type="button" class="btn btn-primary" disabled={!sel.length} onClick={() => onAdd(picked)}>Add to {sel.length ? 'invoice' : 'invoice'}</button>
      </div>
    </div>
  );
}
