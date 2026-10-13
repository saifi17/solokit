// Saved invoices and quotes. Each document keeps its own copy of your
// business details, so editing your profile later never changes an
// invoice you have already sent.
import { load, save } from './storage';
import { uid } from './id';
import { addDays, todayISO, round2 } from './format';
import { getProfile, takeNumber, peekNumber, type Profile } from './profile';

export type DocType = 'invoice' | 'quote';
export type DocStatus = 'draft' | 'sent' | 'paid' | 'accepted' | 'declined';
export type Unit = 'hrs' | 'days' | 'items' | '';

export type LineItem = { id: string; description: string; qty: number; unit: Unit; rate: number };

export type Party = {
  name: string;
  contact: string;
  email: string;
  address: string;
  taxId: string;
};

export type FromDetails = Pick<Profile, 'businessName' | 'yourName' | 'email' | 'phone' | 'website' | 'address' | 'taxId' | 'logo'>;

export type Doc = {
  id: string;
  type: DocType;
  number: string;
  status: DocStatus;
  issueDate: string;
  terms: number;          // invoice: days until due (-1 = custom date); quote: days valid
  dueDate: string;        // invoice due date, or quote "valid until"
  currency: string;
  from: FromDetails;
  client: Party;
  items: LineItem[];
  discountType: 'percent' | 'amount';
  discountValue: number;
  taxLabel: string;
  taxRate: number;
  notes: string;
  paymentDetails: string;
  paymentLink: string;    // e.g. a PayPal.me, Stripe or Wise payment link
  showQR: boolean;        // print a QR code for the payment link
  amountPaid: number;     // invoice only: deposits or part payments already received
  quoteTerms: string;     // quote only: scope & terms
  timeline: string;       // quote only: e.g. "3 weeks from deposit"
  deposit: number;        // quote only: % to pay upfront
  project: string;        // optional project title
  template: Profile['template'];
  accent: string;
  showLogo: boolean;
  paper: Profile['paper'];
  paidDate: string;
  sourceQuote: string;    // invoice created from a quote
  createdAt: number;
  updatedAt: number;
};

const KEY = 'documents';

export const emptyParty = (): Party => ({ name: '', contact: '', email: '', address: '', taxId: '' });
export const newItem = (rate = 0): LineItem => ({ id: uid(), description: '', qty: 1, unit: '', rate });

/** Documents saved by older versions may miss newer fields; fill them in. */
const newerFields: Partial<Doc> = { paymentLink: '', showQR: false, amountPaid: 0, project: '', timeline: '', quoteTerms: '', paper: 'A4', showLogo: true };
function upgrade(d: Doc): Doc {
  return { ...newerFields, ...d };
}
export function listDocs(): Doc[] {
  return load<Doc[]>(KEY, []).map(upgrade).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getDoc(id: string): Doc | undefined {
  const d = load<Doc[]>(KEY, []).find((x) => x.id === id);
  return d ? upgrade(d) : undefined;
}
export function saveDoc(doc: Doc) {
  const all = load<Doc[]>(KEY, []);
  const i = all.findIndex((d) => d.id === doc.id);
  const next = { ...doc, updatedAt: Date.now() };
  if (i >= 0) all[i] = next; else all.push(next);
  save(KEY, all);
  return next;
}
export function deleteDoc(id: string) {
  save(KEY, load<Doc[]>(KEY, []).filter((d) => d.id !== id));
}
export function saveAllDocs(docs: Doc[]) { save(KEY, docs); }

export function defaultQuoteTerms(rate: number, currency: string): string {
  const r = rate > 0 ? ` at ${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(rate)} per hour` : ' at my standard hourly rate';
  return [
    'Includes two rounds of revisions.',
    `Work outside this scope is billed separately${r}.`,
    'Work starts once the deposit is received.',
    'The final payment is due on delivery.',
  ].join('\n');
}

export function fromProfile(p: Profile): FromDetails {
  return { businessName: p.businessName, yourName: p.yourName, email: p.email, phone: p.phone, website: p.website, address: p.address, taxId: p.taxId, logo: p.logo };
}

/** A new, unsaved document filled in from your business details. */
export function createDoc(type: DocType, opts: { take?: boolean } = {}): Doc {
  const p = getProfile();
  const today = todayISO();
  const terms = type === 'invoice' ? p.paymentTerms : 30;
  return {
    id: uid(),
    type,
    number: opts.take === false ? peekNumber(type) : takeNumber(type),
    status: 'draft',
    issueDate: today,
    terms,
    dueDate: addDays(today, terms),
    currency: p.currency,
    from: fromProfile(p),
    client: emptyParty(),
    items: [newItem(p.defaultRate)],
    discountType: 'percent',
    discountValue: 0,
    taxLabel: p.taxLabel,
    taxRate: p.taxRate,
    notes: type === 'invoice' ? 'Thank you for your business.' : '',
    paymentDetails: p.paymentDetails,
    paymentLink: p.paymentLink,
    showQR: !!p.paymentLink,
    amountPaid: 0,
    quoteTerms: type === 'quote' ? defaultQuoteTerms(p.defaultRate, p.currency) : '',
    timeline: '',
    deposit: type === 'quote' ? 50 : 0,
    project: '',
    template: p.template,
    accent: p.accent,
    showLogo: true,
    paper: p.paper,
    paidDate: '',
    sourceQuote: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export type Totals = { subtotal: number; discount: number; taxable: number; tax: number; total: number; deposit: number; paid: number; balance: number };

export function lineAmount(it: LineItem) {
  return round2((Number(it.qty) || 0) * (Number(it.rate) || 0));
}

/** Money on a document. An invoice marked "paid" counts as paid in full. */
export function totals(doc: Pick<Doc, 'items' | 'discountType' | 'discountValue' | 'taxRate' | 'deposit' | 'type'> & { amountPaid?: number; status?: DocStatus }): Totals {
  const subtotal = round2(doc.items.reduce((s, it) => s + lineAmount(it), 0));
  const rawDiscount = doc.discountType === 'percent' ? subtotal * ((doc.discountValue || 0) / 100) : (doc.discountValue || 0);
  const discount = round2(Math.min(Math.max(0, rawDiscount), subtotal));
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * ((doc.taxRate || 0) / 100));
  const total = round2(taxable + tax);
  const deposit = doc.type === 'quote' ? round2(total * ((doc.deposit || 0) / 100)) : 0;
  const paid = doc.type !== 'invoice' ? 0 : doc.status === 'paid' ? total : round2(Math.min(Math.max(0, doc.amountPaid || 0), total));
  const balance = round2(total - paid);
  return { subtotal, discount, taxable, tax, total, deposit, paid, balance };
}

/** "overdue" is worked out from the due date; it is never stored. */
export function displayStatus(doc: Doc, today = todayISO()): DocStatus | 'overdue' | 'expired' {
  if (doc.type === 'invoice' && doc.status === 'sent' && doc.dueDate && doc.dueDate < today) return 'overdue';
  if (doc.type === 'quote' && doc.status === 'sent' && doc.dueDate && doc.dueDate < today) return 'expired';
  return doc.status;
}

export const statusLabel: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', accepted: 'Accepted', declined: 'Declined', overdue: 'Overdue', expired: 'Expired',
};

/** Clients you've billed before, newest first, for autocomplete. */
export function savedClients(): Party[] {
  const seen = new Map<string, Party>();
  for (const d of listDocs()) {
    const name = d.client.name.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), d.client);
  }
  return [...seen.values()];
}

/**
 * Copy a quote into a new invoice:
 *  - 'deposit': one line for the deposit
 *  - 'balance': every line, with the deposit shown as already paid
 *  - 'full':    every line, nothing paid yet
 */
export function invoiceFromQuote(q: Doc, mode: 'full' | 'deposit' | 'balance'): Doc {
  const inv = createDoc('invoice');
  inv.client = { ...q.client };
  inv.currency = q.currency;
  inv.from = { ...q.from };
  inv.template = q.template;
  inv.accent = q.accent;
  inv.paper = q.paper;
  inv.project = q.project;
  inv.sourceQuote = q.number;
  inv.paymentLink = q.paymentLink || inv.paymentLink;
  inv.showQR = q.showQR ?? inv.showQR;
  if (mode === 'deposit') {
    const t = totals(q);
    inv.items = [{ id: uid(), description: `Deposit (${q.deposit}%) for ${q.project || 'quote ' + q.number}`, qty: 1, unit: '', rate: t.deposit }];
    inv.taxRate = 0;
    inv.discountValue = 0;
  } else {
    inv.items = q.items.map((it) => ({ ...it, id: uid() }));
    inv.discountType = q.discountType;
    inv.discountValue = q.discountValue;
    inv.taxLabel = q.taxLabel;
    inv.taxRate = q.taxRate;
    if (mode === 'balance') {
      inv.amountPaid = totals(q).deposit;
      inv.notes = `Deposit of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: q.currency }).format(totals(q).deposit)} received for quote ${q.number}. Thank you.`;
    }
  }
  return inv;
}

export function duplicate(doc: Doc): Doc {
  const copy = createDoc(doc.type);
  return {
    ...doc,
    id: copy.id,
    number: copy.number,
    status: 'draft',
    issueDate: copy.issueDate,
    dueDate: addDays(copy.issueDate, doc.terms >= 0 ? doc.terms : 14),
    items: doc.items.map((it) => ({ ...it, id: uid() })),
    paidDate: '',
    amountPaid: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
