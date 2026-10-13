// Payment fee calculator: how much of an international payment you keep
// with each way of getting paid, or how much to charge to keep a target.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Field, Input, Select, Seg, Icon, useStored } from './ui';
import { feeMethods, platforms, receive, chargeFor, FEES_CHECKED, type FeeMethod } from '../data/fees';
import { currencies } from '../data/currencies';
import { money, num, toNum } from '../lib/format';

type State = {
  mode: 'receive' | 'charge';
  amount: string;
  currency: string;
  platform: string;
  platformPct: string;
  convert: boolean;
  local: string;
  enabled: string[];
};
const initial: State = {
  mode: 'receive', amount: '1000', currency: 'USD', platform: 'none', platformPct: '0',
  convert: true, local: 'EUR', enabled: feeMethods.map((m) => m.id),
};
type Override = Partial<Pick<FeeMethod, 'pct' | 'fixed' | 'convPct' | 'convFixed'>>;

export default function FeeCalculator() {
  const [s, setS] = useStored<State>('fee-calc', initial);
  const [over, setOver] = useStored<Record<string, Override>>('fee-overrides', {});
  const [open, setOpen] = useState<string>('');
  const [rate, setRate] = useState<{ value: number; status: 'idle' | 'loading' | 'ok' | 'error' }>({ value: 0, status: 'idle' });

  // First visit: guess the local currency from the device's time zone.
  useEffect(() => {
    try { if (localStorage.getItem('solokit:fee-calc')) return; } catch { return; }
    const guess = guessCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    if (guess && guess !== s.local) setS({ ...s, local: guess });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amount = Math.max(0, toNum(s.amount));
  const platform = platforms.find((p) => p.id === s.platform) ?? platforms[0];
  const platformPct = s.platform === 'none' ? 0 : Math.min(95, Math.max(0, toNum(s.platformPct)));
  const convert = s.convert && s.local !== s.currency;

  // Live mid-market rate for showing amounts in your local currency.
  useEffect(() => {
    if (!s.convert || s.local === s.currency) { setRate({ value: 0, status: 'idle' }); return; }
    const key = `solokit:fx:${s.currency}`;
    let cancelled = false;
    const use = (rates: Record<string, number>) => {
      const v = rates[s.local];
      if (!cancelled) setRate(v ? { value: v, status: 'ok' } : { value: 0, status: 'error' });
    };
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (cached && Date.now() - cached.t < 6 * 3600000) { use(cached.rates); return; }
    } catch { /* ignore */ }
    setRate({ value: 0, status: 'loading' });
    fetch(`https://open.er-api.com/v6/latest/${s.currency}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('rate'))))
      .then((j) => {
        if (j.result !== 'success' || !j.rates) throw new Error('rate');
        try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), rates: j.rates })); } catch { /* ignore */ }
        use(j.rates);
      })
      .catch(() => { if (!cancelled) setRate({ value: 0, status: 'error' }); });
    return () => { cancelled = true; };
  }, [s.convert, s.local, s.currency]);

  const methods = useMemo(() => feeMethods.map((m) => ({ ...m, ...(over[m.id] || {}) })), [over]);

  const rows = useMemo(() => {
    const list = methods.filter((m) => s.enabled.includes(m.id)).map((m) => {
      if (s.mode === 'receive') {
        const r = receive(amount, platformPct, m, convert);
        return { m, r, value: r.final };
      }
      const charge = chargeFor(amount, platformPct, m, convert);
      const r = receive(charge, platformPct, m, convert);
      return { m, r, value: charge };
    });
    return list.sort((a, b) => (s.mode === 'receive' ? b.value - a.value : a.value - b.value));
  }, [methods, s.enabled, s.mode, amount, platformPct, convert]);

  const m = (n: number) => money(n, s.currency);
  const loc = (n: number) => (rate.status === 'ok' && convert ? money(n * rate.value, s.local) : '');
  const maxFee = Math.max(...rows.map((r) => r.r.totalFees), 0.01);
  const best = rows[0];

  const set = <K extends keyof State>(k: K, v: State[K]) => setS({ ...s, [k]: v });
  // Percentages stay between 0 and 95 so the maths never divides by zero.
  const setOverride = (id: string, k: keyof Override, v: string) => {
    const n = Math.max(0, toNum(v));
    setOver({ ...over, [id]: { ...(over[id] || {}), [k]: k === 'pct' || k === 'convPct' ? Math.min(95, n) : n } });
  };
  const resetOverride = (id: string) => { const next = { ...over }; delete next[id]; setOver(next); };

  return (
    <div class="split fees">
      <section class="panel" aria-label="Your numbers">
        <div class="stack">
          <Seg label="What do you want to know?" value={s.mode} options={[['receive', 'What will I receive?'], ['charge', 'What should I charge?']]} onChange={(v) => set('mode', v)} />
          <div class="grid-2">
            <Field label={s.mode === 'receive' ? 'Your client pays' : 'You want to end up with'}>
              {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="50" value={s.amount} onInput={(e) => set('amount', (e.target as HTMLInputElement).value)} />}
            </Field>
            <Field label="Invoice currency" hint={s.currency !== 'USD' ? 'Fixed fees below are in USD; edit them for this currency.' : undefined}>
              {(id) => <Select id={id} value={s.currency} onChange={(e) => set('currency', (e.target as HTMLSelectElement).value)}
                options={[['USD', 'USD, US dollar'], ['EUR', 'EUR, Euro'], ['GBP', 'GBP, British pound'], ['CAD', 'CAD, Canadian dollar'], ['AUD', 'AUD, Australian dollar']]} />}
            </Field>
          </div>
          <div class="grid-2">
            <Field label="Marketplace" hint={platform.note || 'Paid directly by your client.'}>
              {(id) => <Select id={id} value={s.platform} onChange={(e) => {
                const p = platforms.find((x) => x.id === (e.target as HTMLSelectElement).value)!;
                setS({ ...s, platform: p.id, platformPct: String(p.pct) });
              }} options={platforms.map((p) => [p.id, p.name])} />}
            </Field>
            {s.platform !== 'none' && (
              <Field label="Marketplace fee">
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" max="99" step="1" value={s.platformPct} onInput={(e) => set('platformPct', (e.target as HTMLInputElement).value)} suffix="%" />}
              </Field>
            )}
          </div>
          <label class="check">
            <input type="checkbox" checked={s.convert} onChange={(e) => set('convert', (e.target as HTMLInputElement).checked)} />
            <span>Convert the money to my local currency<span class="hint" style="display:block">Includes each provider's exchange-rate margin.</span></span>
          </label>
          {s.convert && (
            <Field label="My local currency" hint={
              s.local === s.currency ? 'Same as the invoice currency, so nothing is converted.'
                : rate.status === 'ok' ? `Today's mid-market rate: 1 ${s.currency} = ${num(rate.value, rate.value < 10 ? 4 : 2)} ${s.local}`
                  : rate.status === 'loading' ? 'Loading today\'s exchange rate…'
                    : rate.status === 'error' ? 'Couldn\'t load today\'s exchange rate, so amounts stay in the invoice currency.' : ''}>
              {(id) => <Select id={id} value={s.local} onChange={(e) => set('local', (e.target as HTMLSelectElement).value)} options={currencies.map(([c, n]) => [c, `${c}, ${n}`])} />}
            </Field>
          )}
          <fieldset class="method-pick">
            <legend class="label">Compare</legend>
            {methods.map((mm) => (
              <label class="check">
                <input type="checkbox" checked={s.enabled.includes(mm.id)}
                  onChange={(e) => set('enabled', (e.target as HTMLInputElement).checked ? [...s.enabled, mm.id] : s.enabled.filter((x) => x !== mm.id))} />
                {mm.name}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <div class="sticky">
        <div class="result">
          <div class="result-top">
            <p class="result-label">{s.mode === 'receive' ? `Out of ${m(amount)}, you keep the most with` : `To end up with ${m(amount)}, charge the least with`}</p>
            <p class="result-big fee-best">{best ? best.m.name : '—'}</p>
            {best && (
              <p class="result-sub">
                {s.mode === 'receive'
                  ? <>You'd receive <strong>{m(best.value)}</strong>{loc(best.value) && <> (about <strong>{loc(best.value)}</strong>)</>}, losing {num(best.r.pctLost * 100, 1)}% on the way.</>
                  : <>Ask for <strong>{m(best.value)}</strong>. Fees take {m(best.r.totalFees)} of it.</>}
              </p>
            )}
          </div>
          <ol class="fee-list">
            {rows.map(({ m: mm, r, value }, i) => (
              <li class={open === mm.id ? 'open' : ''}>
                <button type="button" class="fee-row" aria-expanded={open === mm.id} onClick={() => setOpen(open === mm.id ? '' : mm.id)}>
                  <span class="fee-rank">{i + 1}</span>
                  <span class="fee-name"><b>{mm.name}</b><span>{m(r.totalFees)} in fees ({num(r.pctLost * 100, 1)}%)</span></span>
                  <span class="fee-val"><b>{m(value)}</b>{s.mode === 'receive' && loc(value) && <span>{loc(value)}</span>}</span>
                  <span class="fee-bar" aria-hidden="true"><i style={{ width: `${(r.totalFees / maxFee) * 100}%` }} /></span>
                </button>
                {open === mm.id && (
                  <div class="fee-detail">
                    <p class="small muted">{mm.how}.</p>
                    <dl class="fee-break">
                      <div><dt>Client pays</dt><dd>{m(s.mode === 'receive' ? amount : value)}</dd></div>
                      {platformPct > 0 && <div><dt>{platform.name} fee ({num(platformPct, 1)}%)</dt><dd>−{m((s.mode === 'receive' ? amount : value) - r.afterPlatform)}</dd></div>}
                      <div><dt>{mm.name} fee</dt><dd>−{m(r.methodFee)}</dd></div>
                      {convert && <div><dt>Currency conversion</dt><dd>−{m(r.convFee)}</dd></div>}
                      <div class="total"><dt>You receive</dt><dd>{m(r.final)}{loc(r.final) && <span class="faint"> ≈ {loc(r.final)}</span>}</dd></div>
                    </dl>
                    <div class="fee-edit">
                      <label>Fee %<input type="number" inputMode="decimal" step="0.1" min="0" value={mm.pct} onInput={(e) => setOverride(mm.id, 'pct', (e.target as HTMLInputElement).value)} /></label>
                      <label>Fixed fee<input type="number" inputMode="decimal" step="0.01" min="0" value={mm.fixed} onInput={(e) => setOverride(mm.id, 'fixed', (e.target as HTMLInputElement).value)} /></label>
                      <label>Conversion %<input type="number" inputMode="decimal" step="0.1" min="0" value={mm.convPct} onInput={(e) => setOverride(mm.id, 'convPct', (e.target as HTMLInputElement).value)} /></label>
                    </div>
                    <p class="tiny faint">{mm.note} {over[mm.id] && <button type="button" class="link-btn" onClick={() => resetOverride(mm.id)}>Reset to the published fees</button>}</p>
                    {mm.source && <a class="tiny" href={mm.source} target="_blank" rel="noopener">See {mm.name.replace(/ \(.*\)/, '')}'s fee page <Icon name="arrow" size={13} /></a>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div class="result-foot">
            <p class="tiny faint">Published fees checked {FEES_CHECKED}. Fees change and depend on your country, so tap a method to see or edit its numbers.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const zoneCurrency: Record<string, string> = {
  'Asia/Karachi': 'PKR', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Dhaka': 'BDT', 'Asia/Colombo': 'LKR',
  'Asia/Manila': 'PHP', 'Asia/Jakarta': 'IDR', 'Asia/Kuala_Lumpur': 'MYR', 'Asia/Bangkok': 'THB', 'Asia/Ho_Chi_Minh': 'VND',
  'Asia/Singapore': 'SGD', 'Asia/Hong_Kong': 'HKD', 'Asia/Tokyo': 'JPY', 'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Qatar': 'QAR',
  'Africa/Lagos': 'NGN', 'Africa/Nairobi': 'KES', 'Africa/Johannesburg': 'ZAR', 'Africa/Cairo': 'EGP', 'Europe/Istanbul': 'TRY',
  'Europe/London': 'GBP', 'Europe/Zurich': 'CHF', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK', 'Europe/Copenhagen': 'DKK',
  'Europe/Warsaw': 'PLN', 'Europe/Prague': 'CZK', 'America/Sao_Paulo': 'BRL', 'America/Mexico_City': 'MXN',
  'America/Argentina/Buenos_Aires': 'ARS', 'America/Bogota': 'COP', 'America/Toronto': 'CAD', 'America/Vancouver': 'CAD',
  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD', 'Australia/Perth': 'AUD', 'Australia/Brisbane': 'AUD', 'Pacific/Auckland': 'NZD',
};
function guessCurrency(zone: string): string {
  if (zoneCurrency[zone]) return zoneCurrency[zone];
  if (zone.startsWith('Europe/')) return 'EUR';
  if (zone.startsWith('America/')) return 'USD';
  return '';
}
