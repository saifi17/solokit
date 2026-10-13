// Home page demo: one card that walks through the seven steps of a job,
// each with a small live-looking preview of its tool.
import { useState } from 'preact/hooks';
import { tools } from '../data/tools';
import { Icon, base } from './ui';
import { calcRate } from './RateCalculator';
import { feeMethods, receive } from '../data/fees';
import { compose } from '../lib/emails';
import { instantFor, local } from '../lib/tz';
import { money } from '../lib/format';

const MEET = [
  { name: 'London', zone: 'Europe/London' },
  { name: 'Berlin', zone: 'Europe/Berlin' },
  { name: 'New York', zone: 'America/New_York' },
];

function MeetPreview() {
  const hours = Array.from({ length: 14 }, (_, i) => 7 + i); // 7am..8pm London
  const cols = hours.map((h) => instantFor('Europe/London', 2026, 9, 14, h));
  const work = (zone: string, t: number) => { const h = local(zone, t).hour; return h >= 9 && h < 17; };
  const best = cols.map((t) => MEET.every((p) => work(p.zone, t)));
  return (
    <div class="pv pv-meet">
      {MEET.map((p) => (
        <div class="pvm-row">
          <span>{p.name}</span>
          <div class="pvm-cells">{cols.map((t, i) => <i class={`${work(p.zone, t) ? 'w' : ''} ${best[i] ? 'b' : ''}`} />)}</div>
        </div>
      ))}
      <div class="pv-note"><Icon name="check" size={16} /><span>Best time: <strong>2–4 pm in London</strong>, 3–5 pm in Berlin, 9–11 am in New York</span></div>
    </div>
  );
}

function PricePreview() {
  const r = calcRate({ income: '60000', costs: '6000', tax: '25', hours: '25', off: '6', margin: '10' })!;
  const parts = [
    { l: 'Take-home', v: r.income, c: 'var(--accent)' },
    { l: 'Tax', v: r.taxAmount, c: '#D99A2B' },
    { l: 'Costs', v: r.costs, c: '#5B7DB1' },
    { l: 'Margin', v: r.marginAmount, c: '#A7AEB4' },
  ];
  return (
    <div class="pv pv-price">
      <p class="pv-label">Your minimum rate</p>
      <p class="pv-big">{money(r.rate, 'USD', { decimals: 0 })}<small> / hour</small></p>
      <p class="pv-sub">{money(r.rate * 8, 'USD', { decimals: 0 })} a day, to take home $60,000 a year</p>
      <div class="bar">{parts.map((p) => <span style={{ width: `${(p.v / r.revenue) * 100}%`, background: p.c }} />)}</div>
      <ul class="legend">{parts.map((p) => <li><i style={{ background: p.c }} />{p.l}<span>{money((p.v / r.revenue) * r.rate, 'USD', { decimals: 0 })}</span></li>)}</ul>
    </div>
  );
}

function QuotePreview() {
  return (
    <div class="pv pv-doc">
      <div class="pvd-head"><b>Morgan Studio</b><span class="pvd-title">Quote</span></div>
      <div class="pvd-meta"><span>Prepared for <b>Northwind Ltd</b></span><span>Valid for 30 days</span></div>
      <div class="pvd-lines">
        <div><span>Website design, 5 pages</span><b>$2,800</b></div>
        <div><span>Development and launch</span><b>$1,400</b></div>
      </div>
      <div class="pvd-total"><span>Total</span><b>$4,200</b></div>
      <div class="pvd-deposit"><span>Deposit to start (50%)</span><b>$2,100</b></div>
    </div>
  );
}

function TrackPreview() {
  return (
    <div class="pv pv-track">
      <div class="pvt-timer"><span class="pill running">Running</span><b>1:42:18</b><span class="pvt-task">Checkout page, Northwind Ltd</span></div>
      <div class="pvt-list">
        <div><span>Homepage layout</span><b>3h 15m</b></div>
        <div><span>Design revisions</span><b>2h 30m</b></div>
      </div>
      <div class="pv-note"><Icon name="invoice" size={16} /><span>5h 45m unbilled: <strong>one click turns it into an invoice</strong></span></div>
    </div>
  );
}

function InvoicePreview() {
  return (
    <div class="pv pv-doc pv-invoice">
      <div class="pvd-band"><b>Morgan Studio</b><span class="pvd-title">Invoice</span></div>
      <div class="pvd-meta"><span>Billed to <b>Northwind Ltd</b></span><span>INV-014</span></div>
      <div class="pvd-lines">
        <div><span>Website design</span><b>$2,800</b></div>
        <div><span>Development, 20 hrs</span><b>$1,600</b></div>
      </div>
      <div class="pvd-total"><span>Amount due</span><span class="pv-stamp">Paid</span><b>$4,400</b></div>
    </div>
  );
}

function PaidPreview() {
  const ids = ['wise-ach', 'payoneer-bank', 'stripe', 'paypal'];
  const rows = ids.map((id) => { const m = feeMethods.find((x) => x.id === id)!; return { m, r: receive(1000, 0, m, true) }; })
    .sort((a, b) => b.r.final - a.r.final);
  return (
    <div class="pv pv-paid">
      <p class="pv-label">A client pays $1,000. You keep:</p>
      {rows.map(({ m, r }) => (
        <div class="pvp-row">
          <span>{m.name}</span>
          <div class="pvp-bar"><i style={{ width: `${r.final / 10}%` }} /></div>
          <b>{money(r.final, 'USD')}</b>
        </div>
      ))}
      <p class="pv-sub">After fees and converting to another currency, with published rates.</p>
    </div>
  );
}

function FollowPreview() {
  const mail = compose('gentle', {
    contact: 'Jordan Lee', company: 'Northwind Ltd', number: 'INV-014', amount: 4400, currency: 'USD', dueDate: '2026-10-08',
    project: '', yourName: 'Alex Morgan', business: 'Morgan Studio', paymentDetails: '', attach: true, lateFee: 'none', lateFeeValue: 0, pauseWork: false, today: '2026-10-13',
  });
  const first = mail.body.split('\n\n').slice(0, 2).join('\n\n');
  return (
    <div class="pv pv-mail">
      <div class="pvm-bar"><i /><i /><i /></div>
      <p class="pvm-subject"><span>Subject</span>{mail.subject}</p>
      <p class="pvm-body">{first}</p>
    </div>
  );
}

const previews = [MeetPreview, PricePreview, QuotePreview, TrackPreview, InvoicePreview, PaidPreview, FollowPreview];

export default function HeroDemo() {
  const [i, setI] = useState(4);
  const t = tools[i];
  const Preview = previews[i];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % tools.length); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + tools.length) % tools.length); }
  };
  return (
    <div class="demo">
      <div class="demo-steps" role="tablist" aria-label="Steps of a freelance job" onKeyDown={onKey}>
        {tools.map((tool, j) => (
          <button type="button" role="tab" id={`demo-tab-${j}`} aria-selected={i === j} aria-controls="demo-panel" tabIndex={i === j ? 0 : -1} class={i === j ? 'on' : j < i ? 'done' : ''} onClick={() => setI(j)}>
            <span class="ds-n">{j + 1}</span><span class="ds-l">{tool.stage}</span>
          </button>
        ))}
      </div>
      <div class="demo-panel" id="demo-panel" role="tabpanel" aria-labelledby={`demo-tab-${i}`}>
        <p class="ask demo-ask" key={`ask-${i}`}><small>Client</small>“{t.ask}”</p>
        <div class="demo-head">
          <span class="demo-icon"><Icon name={t.icon} size={20} /></span>
          <div><b>{t.title}</b><span>{t.short}</span></div>
        </div>
        <div class="demo-stage" key={i}><Preview /></div>
        <a class="btn btn-primary demo-cta" href={`${base()}tools/${t.slug}/`}>Open the {t.name.toLowerCase()} <Icon name="arrow" /></a>
      </div>
    </div>
  );
}
