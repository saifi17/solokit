// Late payment email generator: four stages, from a friendly heads-up to a
// final notice. Fills in from a saved invoice or from what you type.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Field, Input, Select, TextArea, Icon, useStored, useToast, copyText, base } from './ui';
import { compose, stages, suggestStage, type Stage, type ReminderInput } from '../lib/emails';
import { listDocs, totals, type Doc } from '../lib/documents';
import { getProfile } from '../lib/profile';
import { currencies } from '../data/currencies';
import { daysBetween, todayISO, addDays, money, fmtDate, toNum } from '../lib/format';

type State = {
  contact: string; company: string; email: string; number: string; amount: string; currency: string; dueDate: string;
  project: string; yourName: string; business: string; paymentDetails: string; attach: boolean;
  lateFee: ReminderInput['lateFee']; lateFeeValue: string; pauseWork: boolean; stage: Stage | 'auto';
};

const initial: State = {
  contact: '', company: '', email: '', number: '', amount: '', currency: 'USD', dueDate: '', project: '',
  yourName: '', business: '', paymentDetails: '', attach: true, lateFee: 'none', lateFeeValue: '', pauseWork: false, stage: 'auto',
};

export default function ReminderEmail() {
  const [s, setS, ready] = useStored<State>('reminder', initial);
  const [invoices, setInvoices] = useState<Doc[]>([]);
  const [picked, setPicked] = useState('');
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (!ready) return;
    const unpaid = listDocs().filter((d) => d.type === 'invoice' && d.status !== 'paid');
    setInvoices(unpaid);
    const p = getProfile();
    const params = new URLSearchParams(location.search);
    const fromDoc = params.get('doc') ? unpaid.find((d) => d.id === params.get('doc')) : undefined;
    if (fromDoc) { fill(fromDoc); return; }
    // First visit: example due date so the preview isn't empty, plus your details.
    setS((prev) => ({
      ...prev,
      yourName: prev.yourName || p.yourName,
      business: prev.business || p.businessName,
      paymentDetails: prev.paymentDetails || p.paymentDetails,
      currency: prev.number ? prev.currency : p.currency,
      dueDate: prev.dueDate || addDays(todayISO(), -5),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function fill(d: Doc) {
    const p = getProfile();
    setPicked(d.id);
    setS((prev) => ({
      ...prev,
      contact: d.client.contact, company: d.client.name, email: d.client.email, number: d.number,
      amount: String(totals(d).total), currency: d.currency, dueDate: d.dueDate, project: d.project,
      yourName: d.from.yourName || p.yourName, business: d.from.businessName || p.businessName,
      paymentDetails: d.paymentDetails || p.paymentDetails, stage: 'auto',
    }));
  }

  const set = <K extends keyof State>(k: K) => (e: Event) => {
    const el = e.target as HTMLInputElement;
    setS({ ...s, [k]: el.type === 'checkbox' ? el.checked : el.value });
  };

  const late = s.dueDate ? daysBetween(s.dueDate, todayISO()) : 0;
  const suggested = s.dueDate ? suggestStage(s.dueDate) : 'gentle';
  const stage: Stage = s.stage === 'auto' ? suggested : s.stage;

  const mail = useMemo(() => compose(stage, {
    contact: s.contact, company: s.company, number: s.number, amount: toNum(s.amount), currency: s.currency,
    dueDate: s.dueDate, project: s.project, yourName: s.yourName, business: s.business, paymentDetails: s.paymentDetails,
    attach: s.attach, lateFee: s.lateFee, lateFeeValue: toNum(s.lateFeeValue), pauseWork: s.pauseWork,
  }), [s, stage]);

  const mailto = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  const lateText = !s.dueDate ? '' : late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : late === 0 ? 'Due today' : `Due in ${-late} day${late === -1 ? '' : 's'}`;

  return (
    <div class="split wide-right reminder">
      <form class="panel" onSubmit={(e) => e.preventDefault()} noValidate>
        {invoices.length > 0 && (
          <Field label="Fill in from a saved invoice" hint="Unpaid invoices from your workspace.">
            {(id) => (
              <Select id={id} value={picked} onChange={(e) => { const d = invoices.find((x) => x.id === (e.target as HTMLSelectElement).value); if (d) fill(d); else setPicked(''); }}
                options={[['', 'Choose an invoice…'], ...invoices.map((d) => [d.id, `${d.number}${d.client.name ? `, ${d.client.name}` : ''} (${money(totals(d).total, d.currency)}, due ${fmtDate(d.dueDate)})`] as [string, string])]} />
            )}
          </Field>
        )}
        <div class="panel-head" style={invoices.length ? 'margin-top:24px' : ''}><h2>The invoice</h2></div>
        <div class="stack">
          <div class="grid-2">
            <Field label="Invoice number">{(id) => <Input id={id} value={s.number} onInput={set('number')} placeholder="INV-014" />}</Field>
            <Field label="Due date" hint={lateText}>{(id) => <Input id={id} type="date" value={s.dueDate} onInput={set('dueDate')} />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Amount">{(id) => <Input id={id} type="number" inputMode="decimal" min="0" value={s.amount} onInput={set('amount')} placeholder="2400" />}</Field>
            <Field label="Currency">{(id) => <Select id={id} value={s.currency} onChange={set('currency')} options={currencies.map(([c, n]) => [c, `${c}, ${n}`])} />}</Field>
          </div>
          <Field label="Project (optional)">{(id) => <Input id={id} value={s.project} onInput={set('project')} placeholder="the website redesign" />}</Field>
        </div>

        <div class="panel-head" style="margin-top:24px"><h2>Who it's to and from</h2></div>
        <div class="stack">
          <div class="grid-2">
            <Field label="Client contact">{(id) => <Input id={id} value={s.contact} onInput={set('contact')} placeholder="Jordan Lee" />}</Field>
            <Field label="Client email">{(id) => <Input id={id} type="email" value={s.email} onInput={set('email')} placeholder="jordan@northwind.com" />}</Field>
          </div>
          <div class="grid-2">
            <Field label="Your name">{(id) => <Input id={id} value={s.yourName} onInput={set('yourName')} placeholder="Alex Morgan" />}</Field>
            <Field label="Business (optional)">{(id) => <Input id={id} value={s.business} onInput={set('business')} placeholder="Morgan Studio" />}</Field>
          </div>
          <Field label="How to pay you (optional)">{(id) => <TextArea id={id} rows={2} value={s.paymentDetails} onInput={set('paymentDetails')} placeholder={'Wise: alex@morganstudio.com\nor bank transfer, details on the invoice'} />}</Field>
        </div>

        <div class="panel-head" style="margin-top:24px"><h2>Options</h2></div>
        <div class="stack">
          <label class="check"><input type="checkbox" checked={s.attach} onChange={set('attach')} />Say the invoice is attached again</label>
          <div class="grid-2">
            <Field label="Late fee in your terms">{(id) => (
              <Select id={id} value={s.lateFee} onChange={set('lateFee')} options={[['none', 'No late fee'], ['percent', 'Percent per month'], ['fixed', 'Fixed amount']]} />
            )}</Field>
            {s.lateFee !== 'none' && (
              <Field label={s.lateFee === 'percent' ? 'Late fee per month' : 'Late fee amount'} hint="Only mention one if it's in your contract or terms.">
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.5" value={s.lateFeeValue} onInput={set('lateFeeValue')} suffix={s.lateFee === 'percent' ? '%' : s.currency} />}
              </Field>
            )}
          </div>
          <label class="check"><input type="checkbox" checked={s.pauseWork} onChange={set('pauseWork')} />In the final notice, say work is paused until it's paid</label>
        </div>
      </form>

      <div class="sticky">
        <div class="stage-pick" role="radiogroup" aria-label="Reminder stage">
          {stages.map((st) => (
            <button type="button" role="radio" aria-checked={stage === st.id} class={stage === st.id ? 'on' : ''} onClick={() => setS({ ...s, stage: st.id === suggested ? 'auto' : st.id })}>
              <b>{st.name}</b>
              <span>{st.when}</span>
              {st.id === suggested && s.dueDate && <em>Suggested</em>}
            </button>
          ))}
        </div>
        <div class="mail-window">
          <div class="mw-bar"><i /><i /><i /><span>New message</span></div>
          <div class="mail">
            <div class="mail-row"><span>To</span><b>{s.email || s.contact || 'your client'}</b></div>
            <div class="mail-row"><span>Subject</span><b>{mail.subject}</b></div>
            <pre class="mail-body">{mail.body}</pre>
          </div>
          <div class="mw-actions">
            <button type="button" class="btn btn-primary" onClick={async () => { if (await copyText(mail.body)) showToast('Email copied'); }}><Icon name="copy" />Copy email</button>
            <button type="button" class="btn btn-secondary" onClick={async () => { if (await copyText(mail.subject)) showToast('Subject copied'); }}>Copy subject</button>
            <a class="btn btn-quiet" href={mailto}><Icon name="send" />Open in email app</a>
          </div>
        </div>
        {mail.nextStep && <p class="next-tip"><Icon name="calendar" size={16} />{mail.nextStep}</p>}
        <p class="tiny faint" style="margin-top:10px">Not legal advice. For large unpaid amounts, check the rules where your client is based. <a href={`${base()}tools/invoice-generator/`}>Need a fresh copy of the invoice?</a></p>
      </div>
      {toast}
    </div>
  );
}
