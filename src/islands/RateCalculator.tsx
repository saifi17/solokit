// Freelance rate calculator.
// Revenue you need = (take-home ÷ (1 − tax) + costs) × (1 + safety margin)
// Minimum hourly rate = revenue ÷ (billable hours per week × weeks worked)
import { useMemo, useState } from 'preact/hooks';
import { currencies } from '../data/currencies';
import { money, num, toNum, parseNum } from '../lib/format';
import { getProfile, updateProfile } from '../lib/profile';
import { Field, Input, Select, Icon, useStored, useToast, copyText, base } from './ui';

type State = {
  currency: string; income: string; costs: string; tax: string;
  hours: string; off: string; margin: string; current: string; projectHours: string;
};
const initial: State = { currency: 'USD', income: '60000', costs: '6000', tax: '25', hours: '25', off: '6', margin: '10', current: '', projectHours: '20' };

const costItems: { key: string; label: string; per: 'month' | 'year'; placeholder: string }[] = [
  { key: 'software', label: 'Software & subscriptions', per: 'month', placeholder: '80' },
  { key: 'internet', label: 'Internet & phone', per: 'month', placeholder: '60' },
  { key: 'workspace', label: 'Coworking or office', per: 'month', placeholder: '0' },
  { key: 'equipment', label: 'Laptop & equipment', per: 'year', placeholder: '800' },
  { key: 'insurance', label: 'Insurance & health cover', per: 'year', placeholder: '600' },
  { key: 'admin', label: 'Accountant, bank & payment fees', per: 'year', placeholder: '900' },
  { key: 'learning', label: 'Courses, books & events', per: 'year', placeholder: '300' },
];

export function calcRate(s: Pick<State, 'income' | 'costs' | 'tax' | 'hours' | 'off' | 'margin'>) {
  const income = toNum(s.income);
  const costs = toNum(s.costs);
  const tax = toNum(s.tax) / 100;
  const hours = toNum(s.hours);
  const weeks = 52 - toNum(s.off);
  const margin = toNum(s.margin) / 100;
  const yearHours = hours * weeks;
  const valid = income >= 0 && costs >= 0 && tax >= 0 && tax < 0.9 && hours > 0 && weeks > 0 && margin >= 0;
  if (!valid) return null;
  const profitBeforeTax = income / (1 - tax);
  const taxAmount = profitBeforeTax - income;
  const base = profitBeforeTax + costs;
  const marginAmount = base * margin;
  const revenue = base + marginAmount;
  const rate = Math.ceil(revenue / yearHours);
  return { income, costs, taxAmount, marginAmount, revenue, rate, yearHours, weeks, hours, tax };
}

export default function RateCalculator({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useStored<State>('rate-calc', initial);
  const [costDraft, setCostDraft] = useStored<Record<string, string>>('rate-costs', {});
  const [showCosts, setShowCosts] = useState(false);
  const [toast, showToast] = useToast();
  const set = (k: keyof State) => (e: Event) => setS({ ...s, [k]: (e.target as HTMLInputElement).value });

  const r = useMemo(() => calcRate(s), [s]);
  const cur = s.currency;
  const m = (n: number) => money(n, cur, { decimals: 0 });

  const costTotal = costItems.reduce((sum, it) => sum + toNum(costDraft[it.key]) * (it.per === 'month' ? 12 : 1), 0);

  // "Check your current rate": what you'd keep at that rate.
  const currentRate = parseNum(s.current);
  let check: { ok: boolean; text: string } | null = null;
  if (r && Number.isFinite(currentRate) && currentRate > 0) {
    const revenueAtCurrent = currentRate * r.yearHours;
    const keep = Math.max(0, (revenueAtCurrent - r.costs) * (1 - r.tax));
    const diff = keep - r.income;
    check = diff >= 0
      ? { ok: true, text: `At ${m(currentRate)}/hour you'd take home about ${m(keep)} a year, ${m(diff)} above your goal.` }
      : { ok: false, text: `At ${m(currentRate)}/hour you'd take home about ${m(keep)} a year, ${m(-diff)} short of your goal. Raising your rate by ${m(r.rate - currentRate)} closes the gap.` };
  }

  // Split the hourly rate into whole currency units that add up exactly.
  const splitRate = (values: number[], total: number) => {
    const raw = values.map((v) => (v / values.reduce((a, b) => a + b, 0)) * total);
    const floor = raw.map(Math.floor);
    let left = total - floor.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - Math.floor(v), i] as [number, number]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { floor[i]++; left--; } });
    return floor;
  };
  const share = r ? [
    { label: 'Take-home pay', value: r.income, color: 'var(--accent)' },
    { label: 'Income tax', value: r.taxAmount, color: '#E0A33A' },
    { label: 'Business costs', value: r.costs, color: '#3FA37C' },
    { label: 'Safety margin', value: r.marginAmount, color: '#9AA3BC' },
  ] : [];

  async function copySummary() {
    if (!r) return;
    const text = [
      `My minimum freelance rate: ${m(r.rate)} per hour (${m(r.rate * 8)} per day)`,
      `Revenue needed per year: ${m(r.revenue)}`,
      `Based on ${m(r.income)} take-home, ${m(r.costs)} costs, ${num(r.tax * 100)}% tax, ${num(r.hours)} billable hours a week for ${num(r.weeks)} weeks.`,
      `Worked out with SoloKit: https://saifi17.github.io/solokit/tools/freelance-hourly-rate-calculator/`,
    ].join('\n');
    if (await copyText(text)) showToast('Summary copied');
  }

  function useInQuote() {
    if (!r) return;
    updateProfile({ defaultRate: r.rate, currency: cur });
    window.location.href = `${base()}tools/project-quote-generator/?new=1`;
  }

  const result = (
    <div class="result" aria-live="polite">
      <div class="result-top">
        <p class="result-label">Your minimum rate</p>
        <p class="result-big">{r ? m(r.rate) : '—'} <small>/ hour</small></p>
        <p class="result-sub">{r ? <>or <strong>{m(r.rate * 8)}</strong> for an 8-hour day</> : 'Check the numbers: hours and weeks worked must be above zero and tax below 90%.'}</p>
      </div>
      {r && (
        <>
          <dl class="result-rows">
            <div><dt>Per week, billing {num(r.hours)} hours</dt><dd>{m(r.rate * r.hours)}</dd></div>
            <div><dt>Per month, on average</dt><dd>{m(r.revenue / 12)}</dd></div>
            <div><dt>Revenue needed per year</dt><dd>{m(r.revenue)}</dd></div>
          </dl>
          <div class="rate-share">
            <p class="tiny faint">Where each {m(r.rate)} goes</p>
            <div class="bar" role="img" aria-label={share.map((x) => `${x.label} ${Math.round((x.value / r.revenue) * 100)}%`).join(', ')}>
              {share.map((x) => <span style={{ width: `${(x.value / r.revenue) * 100}%`, background: x.color }} />)}
            </div>
            <ul class="legend">
              {(() => { const parts = splitRate(share.map((x) => x.value), r.rate); return share.map((x, i) => (
                <li><i style={{ background: x.color }} />{x.label}<span>{m(parts[i])}</span></li>
              )); })()}
            </ul>
          </div>
          {!compact && check && <p class={`rate-check ${check.ok ? 'ok' : 'bad'}`}>{check.text}</p>}
          {!compact && (
            <div class="rate-project">
              <label for="rc-ph">Price a project</label>
              <div class="rp-row">
                <Input id="rc-ph" type="number" inputMode="decimal" min="0" step="1" value={s.projectHours} onInput={set('projectHours')} suffix="hours" />
                <strong>{m(r.rate * toNum(s.projectHours))}</strong>
              </div>
            </div>
          )}
        </>
      )}
      <div class="result-foot">
        {compact ? (
          <a class="btn btn-primary" href={`${base()}tools/freelance-hourly-rate-calculator/`}>Open the full calculator <Icon name="arrow" /></a>
        ) : (
          <>
            <button type="button" class="btn btn-primary" onClick={useInQuote} disabled={!r}><Icon name="quote" />Use this rate in a quote</button>
            <button type="button" class="btn btn-secondary" onClick={copySummary} disabled={!r}><Icon name="copy" />Copy</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div class={compact ? 'rate compact' : 'split rate'}>
      <form class="panel" onSubmit={(e) => e.preventDefault()} noValidate>
        <div class="panel-head"><div><h2>Your goal</h2><p class="panel-sub">What you want to earn in a year.</p></div></div>
        <div class="stack">
          {!compact && (
            <Field label="Currency">
              {(id) => <Select id={id} value={cur} onChange={set('currency')} options={currencies.map(([c, n]) => [c, `${c}, ${n}`])} />}
            </Field>
          )}
          <Field label="Take-home pay per year" hint="What you want to keep after tax and business costs.">
            {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="1000" value={s.income} onInput={set('income')} suffix={cur} />}
          </Field>
          {!compact && (
            <>
              <div class="grid-2">
                <Field label="Business costs per year" hint={<button type="button" class="link-btn" onClick={() => setShowCosts(!showCosts)}>{showCosts ? 'Hide the cost list' : 'Help me add these up'}</button>}>
                  {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="100" value={s.costs} onInput={set('costs')} suffix={cur} />}
                </Field>
                <Field label="Income tax rate" hint="Your average rate, not the top band.">
                  {(id) => <Input id={id} type="number" inputMode="decimal" min="0" max="89" step="1" value={s.tax} onInput={set('tax')} suffix="%" />}
                </Field>
              </div>
              {showCosts && (
                <div class="cost-list">
                  {costItems.map((it) => (
                    <div class="cost-row">
                      <label for={`cost-${it.key}`}>{it.label}</label>
                      <Input id={`cost-${it.key}`} type="number" inputMode="decimal" min="0" placeholder={it.placeholder}
                        value={costDraft[it.key] ?? ''} onInput={(e) => setCostDraft({ ...costDraft, [it.key]: (e.target as HTMLInputElement).value })}
                        suffix={`/ ${it.per}`} />
                    </div>
                  ))}
                  <div class="cost-total">
                    <span>Total per year: <strong>{m(costTotal)}</strong></span>
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => { setS({ ...s, costs: String(Math.round(costTotal)) }); setShowCosts(false); }}>Use this total</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div class="panel-head" style="margin-top:28px"><div><h2>Your time</h2><p class="panel-sub">Only count hours a client pays for.</p></div></div>
        <div class="stack">
          <Field label={`Billable hours per week: ${s.hours || 0}`} hint="Most full-time freelancers bill 20–30 hours. The rest goes on sales and admin.">
            {(id) => <input id={id} type="range" min="5" max="50" step="1" value={s.hours} onInput={set('hours')} />}
          </Field>
          <div class="grid-2">
            <Field label="Weeks off per year" hint="Holidays, public holidays, sick days.">
              {(id) => <Input id={id} type="number" inputMode="decimal" min="0" max="51" step="1" value={s.off} onInput={set('off')} suffix="weeks" />}
            </Field>
            {!compact && (
              <Field label="Safety margin" hint="Extra for quiet months and late payers.">
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" max="100" step="5" value={s.margin} onInput={set('margin')} suffix="%" />}
              </Field>
            )}
          </div>
          {!compact && (
            <Field label="Your current rate (optional)" hint="See whether it gets you to your goal.">
              {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="1" placeholder="e.g. 40" value={s.current} onInput={set('current')} suffix={`${cur} / hour`} />}
            </Field>
          )}
        </div>
      </form>
      <div class={compact ? '' : 'sticky'}>{result}</div>
      {toast}
    </div>
  );
}
