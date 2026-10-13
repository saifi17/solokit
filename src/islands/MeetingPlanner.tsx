// Time zone meeting planner. Columns are the 24 hours of the chosen date in
// the first city's time zone; each row shows the local time there.
// Every city uses the default working hours unless it has its own (for
// example, you work 1pm to 10pm to overlap with clients abroad).
// Pick a slot, then copy it for an email, download a calendar invite or
// share a link that opens the same plan.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Field, Input, Seg, Icon, Modal, useStored, useNow, useToast, copyText } from './ui';
import { allPlaces, devicePlace, instantFor, local, fmtTime, gmtLabel, type Place } from '../lib/tz';
import { buildICS, googleCalendarUrl, downloadFile } from '../lib/ics';
import { todayISO } from '../lib/format';

type State = { places: Place[]; start: number; end: number; clock: '12' | '24'; length: number; title: string };
const initial: State = {
  places: [{ name: 'London', zone: 'Europe/London' }, { name: 'New York', zone: 'America/New_York' }],
  start: 9, end: 17, clock: '12', length: 60, title: 'Project call',
};

export default function MeetingPlanner() {
  const [s, setS, ready] = useStored<State>('meet', initial);
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [toast, showToast] = useToast();
  const now = useNow(30000);
  const places = useMemo(() => allPlaces(), []);
  const h12 = s.clock === '12';

  // First visit: start with your own city. A shared link overrides everything.
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    const c = q.get('c');
    if (c) {
      const list = c.split(',').map((x) => {
        const [name, zone, hrs] = x.split('|');
        const p: Place = { name, zone };
        const [a, b] = (hrs || '').split('-').map((n) => parseInt(n, 10));
        if (isHour(a) && isHour(b)) { p.start = a; p.end = b; }
        return p;
      }).filter((p) => p.name && p.zone && isZone(p.zone));
      const [hs, he] = (q.get('h') || '').split('-').map(Number);
      if (list.length) setS({ ...s, places: list, start: isHour(hs) ? hs : s.start, end: isHour(he) ? he : s.end, title: q.get('t') || s.title });
      if (q.get('d')) setDate(q.get('d')!);
      if (q.get('s')) setPicked(Number(q.get('s')));
      return;
    }
    if (!localStorage.getItem('solokit:meet')) {
      const me = devicePlace();
      if (!s.places.some((p) => p.zone === me.zone)) setS({ ...s, places: [me, ...s.places] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const [y, mo, d] = date.split('-').map(Number);
  const home = s.places[0];
  const hoursOf = (p: Place): [number, number] => (p.start != null && p.end != null ? [p.start, p.end] : [s.start, s.end]);
  const hasOwnHours = (p: Place) => p.start != null && p.end != null;
  const isWork = (p: Place, h: number) => { const [a, b] = hoursOf(p); return a < b ? h >= a && h < b : h >= a || h < b; };
  const hoursText = (p: Place) => { const [a, b] = hoursOf(p); return `${fmtTime(a, 0, h12, true)}–${fmtTime(b, 0, h12, true)}`; };
  const isAwake = (h: number) => h >= 7 && h < 22;

  const cols = useMemo(() => {
    if (!home || !y) return [];
    return Array.from({ length: 24 }, (_, h) => instantFor(home.zone, y, mo - 1, d, h));
  }, [home?.zone, y, mo, d]);

  const best = cols.map((t) => s.places.every((p) => isWork(p, local(p.zone, t).hour)));

  // Longest run of "everyone working" hours, or the least-bad hour if none.
  const suggestion = useMemo(() => {
    let bestStart = -1, bestLen = 0;
    for (let i = 0; i < 24;) {
      if (!best[i]) { i++; continue; }
      let j = i;
      while (j < 24 && best[j]) j++;
      if (j - i > bestLen) { bestLen = j - i; bestStart = i; }
      i = j;
    }
    if (bestStart >= 0) return { start: bestStart, len: bestLen, overlap: true };
    const score = cols.map((t) => s.places.reduce((sum, p) => { const h = local(p.zone, t).hour; return sum + (isWork(p, h) ? 0 : isAwake(h) ? 1 : 5); }, 0));
    const min = Math.min(...score);
    return { start: Math.max(0, score.indexOf(min)), len: 1, overlap: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, s.places, s.start, s.end]);

  const slotStart = picked ?? suggestion.start;
  const wrapRef = useRef<HTMLDivElement>(null);

  // Bring the suggested slot into view (the grid scrolls sideways).
  useEffect(() => {
    if (picked != null) return;
    const wrap = wrapRef.current;
    const cell = wrap?.querySelector<HTMLElement>(`tbody tr:first-child td:nth-of-type(${slotStart + 1})`);
    const label = wrap?.querySelector<HTMLElement>('tbody .city');
    if (!wrap || !cell || !label) return;
    wrap.scrollLeft = Math.max(0, cell.offsetLeft - label.offsetWidth - cell.offsetWidth * 2);
  }, [slotStart, picked, s.places.length, date, ready]);
  const slotCols = Math.max(1, Math.ceil(s.length / 60));
  const startInstant = cols[slotStart] ?? Date.now();
  const endInstant = startInstant + s.length * 60000;

  function addPlace(value: string) {
    const v = value.trim().toLowerCase();
    if (!v) return;
    const p = places.find((x) => x.name.toLowerCase() === v || `${x.name} (${x.zone})`.toLowerCase() === v || x.zone.toLowerCase() === v)
      ?? places.find((x) => x.name.toLowerCase().startsWith(v));
    if (!p) { showToast('No city found. Try a nearby big city.'); return; }
    if (s.places.some((x) => x.name === p.name && x.zone === p.zone)) { setQuery(''); return; }
    setS({ ...s, places: [...s.places, p] });
    setQuery('');
    setPicked(null);
  }
  function removePlace(i: number) { setS({ ...s, places: s.places.filter((_, j) => j !== i) }); setPicked(null); }
  function makeFirst(i: number) { const list = [...s.places]; const [p] = list.splice(i, 1); setS({ ...s, places: [p, ...list] }); setPicked(null); }
  /** Give one city its own working hours, or pass nulls to use the default again. */
  function setOwnHours(i: number, start: number | null, end: number | null) {
    const places = s.places.map((p, j) => {
      if (j !== i) return p;
      const { start: _a, end: _b, ...rest } = p;
      return start == null || end == null || (start === s.start && end === s.end) ? rest : { ...rest, start, end };
    });
    setS({ ...s, places });
    setPicked(null);
  }

  // "Tue, 15 Sep" (some browsers write "Sept"; keep it the same everywhere).
  const dateLabel = (zone: string, t: number) => new Date(t).toLocaleDateString('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).replace('Sept', 'Sep');
  const slotText = (p: Place) => {
    const a = local(p.zone, startInstant);
    const b = local(p.zone, endInstant);
    return `${fmtTime(a.hour, a.minute, h12)} – ${fmtTime(b.hour, b.minute, h12)}`;
  };
  const emailText = () => [
    `Proposed time for ${s.title || 'our call'}:`,
    '',
    ...s.places.map((p) => `- ${p.name}: ${slotText(p)}, ${dateLabel(p.zone, startInstant)}`),
    '',
    'Does that work for you?',
  ].join('\n');
  const shareUrl = () => {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('c', s.places.map((p) => `${p.name}|${p.zone}${hasOwnHours(p) ? `|${p.start}-${p.end}` : ''}`).join(','));
    u.searchParams.set('d', date);
    u.searchParams.set('h', `${s.start}-${s.end}`);
    u.searchParams.set('s', String(slotStart));
    if (s.title) u.searchParams.set('t', s.title);
    return u.toString();
  };
  const event = () => ({ title: s.title || 'Meeting', start: startInstant, end: endInstant, description: `${emailText()}\n\nPlanned with SoloKit` });

  const hourOptions = Array.from({ length: 24 }, (_, h) => <option value={h}>{fmtTime(h, 0, h12)}</option>);

  return (
    <div class="meet">
      <form class="panel meet-controls" onSubmit={(e) => { e.preventDefault(); addPlace(query); }} noValidate>
        <Field label="Add a city or time zone" hint="Type a city, then press Enter.">
          {(id) => (
            <div class="control">
              <Icon name="globe" size={16} class="faint" />
              <input id={id} list="dl-places" value={query} placeholder="e.g. Sydney" autoComplete="off"
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  setQuery(v);
                  if (places.some((p) => `${p.name} (${p.zone})` === v)) addPlace(v);
                }} />
              <button type="submit" class="icon-btn" aria-label="Add city" style="width:32px;height:32px"><Icon name="plus" size={16} /></button>
            </div>
          )}
        </Field>
        <datalist id="dl-places">{places.map((p) => <option value={`${p.name} (${p.zone})`} />)}</datalist>
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onInput={(e) => { setDate((e.target as HTMLInputElement).value || todayISO()); setPicked(null); }} />}</Field>
        <div class="field">
          <span class="label">Working hours</span>
          <div class="hours-pair">
            <div class="control"><select aria-label="Working day starts" value={s.start} onChange={(e) => { setS({ ...s, start: Number((e.target as HTMLSelectElement).value) }); setPicked(null); }}>{hourOptions}</select></div>
            <span class="faint">to</span>
            <div class="control"><select aria-label="Working day ends" value={s.end} onChange={(e) => { setS({ ...s, end: Number((e.target as HTMLSelectElement).value) }); setPicked(null); }}>{hourOptions}</select></div>
          </div>
          <span class="hint">Used for every city. To change one city, press its hours in the table.</span>
        </div>
        <div class="field">
          <span class="label">Meeting length</span>
          <Seg label="Meeting length" value={String(s.length) as '30' | '60' | '90'} options={[['30', '30 min'], ['60', '1 hour'], ['90', '1.5 hours']]} onChange={(v) => setS({ ...s, length: Number(v) })} />
        </div>
        <div class="field">
          <span class="label">Clock</span>
          <Seg label="Clock" value={s.clock} options={[['12', '12-hour'], ['24', '24-hour']]} onChange={(v) => setS({ ...s, clock: v })} />
        </div>
      </form>

      <div class="meet-main">
        <div class="tz-wrap" ref={wrapRef} tabindex={0} aria-label="Hours in each city. Click an hour to choose it.">
          <table class="tz-grid">
            <thead><tr><th class="city"><span class="sr-only">City</span></th>{best.map((b, i) => <th class={`${b ? 'best' : ''} ${i >= slotStart && i < slotStart + slotCols ? 'sel' : ''}`} aria-hidden="true" />)}</tr></thead>
            <tbody>
              {s.places.map((p, i) => {
                const nowL = local(p.zone, now);
                const homeKey = (t: number) => local(home.zone, t).dateKey;
                return (
                  <tr>
                    <th class="city" scope="row">
                      <div class="city-top">
                        <b>{p.name}</b>
                        <span class="city-tools">
                          {i > 0 && <button type="button" aria-label={`Make ${p.name} the main time zone`} title="Use as main time zone" onClick={() => makeFirst(i)}>↑</button>}
                          {s.places.length > 1 && <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removePlace(i)}>×</button>}
                        </span>
                      </div>
                      <span class="city-sub">{i === 0 && <em>Main</em>}{fmtTime(nowL.hour, nowL.minute, h12)} now, {gmtLabel(p.zone, now)}</span>
                      <button type="button" class={`city-hours${hasOwnHours(p) ? ' own' : ''}`} aria-haspopup="dialog" aria-label={`Working hours in ${p.name}: ${hoursText(p)}. Change`} onClick={() => setEditing(i)}>
                        <Icon name="clock" size={12} />{hoursText(p)}
                      </button>
                    </th>
                    {cols.map((t, c) => {
                      const l = local(p.zone, t);
                      const cls = ['h', isWork(p, l.hour) ? 'work' : isAwake(l.hour) ? 'awake' : 'night'];
                      if (best[c]) cls.push('best');
                      if (c >= slotStart && c < slotStart + slotCols) cls.push('sel');
                      if (now >= t && now < t + 3600000) cls.push('now');
                      const otherDay = l.dateKey !== homeKey(t);
                      return (
                        <td class={cls.join(' ')} onClick={() => setPicked(c)} title={`${p.name}: ${fmtTime(l.hour, l.minute, h12)} ${dateLabel(p.zone, t)}`}>
                          {fmtTime(l.hour, l.minute, h12, true)}
                          {otherDay && <small>{dateLabel(p.zone, t).split(' ')[0].replace(',', '')}</small>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div class="tz-legend tiny muted">
          <span><i class="sw work" />Working hours</span>
          <span><i class="sw awake" />Awake, off work</span>
          <span><i class="sw night" />Night</span>
          <span><i class="sw best" />Everyone is working</span>
          <span><i class="sw sel" />Your pick (click any hour)</span>
        </div>

        <div class="result meet-result" aria-live="polite">
          <div class="result-top">
            <p class="result-label">
              {picked != null ? 'Your chosen time' : suggestion.overlap ? `Best time: ${suggestion.len} shared working hour${suggestion.len === 1 ? '' : 's'}` : 'No shared working hours, so here is the closest option'}
            </p>
            <p class="result-big meet-big">{home ? slotText(home) : '—'}</p>
            <p class="result-sub">{home && <>{dateLabel(home.zone, startInstant)} in {home.name}</>}</p>
            {picked == null && !suggestion.overlap && s.places.length > 1 && (
              <p class="next-tip"><Icon name="clock" size={16} />If you or your client can start earlier or work later, press that city's hours in the table and change them. The best time updates straight away.</p>
            )}
          </div>
          <dl class="result-rows">
            {s.places.map((p) => (
              <div><dt>{p.name}</dt><dd>{slotText(p)} <span class="faint">{dateLabel(p.zone, startInstant)}</span></dd></div>
            ))}
          </dl>
          <div class="result-foot meet-actions">
            <div class="control meet-title"><input aria-label="Meeting title" value={s.title} onInput={(e) => setS({ ...s, title: (e.target as HTMLInputElement).value })} placeholder="Meeting title" /></div>
            <button type="button" class="btn btn-primary" onClick={async () => { if (await copyText(emailText())) showToast('Copied, ready to paste into an email'); }}><Icon name="copy" />Copy for email</button>
            <button type="button" class="btn btn-secondary" onClick={() => downloadFile(`${(s.title || 'meeting').replace(/[^\w-]+/g, '-').toLowerCase()}.ics`, buildICS(event()), 'text/calendar')}><Icon name="calendar" />Calendar invite</button>
            <a class="btn btn-secondary" href={googleCalendarUrl(event())} target="_blank" rel="noopener">Google Calendar</a>
            <button type="button" class="btn btn-quiet" onClick={async () => { if (await copyText(shareUrl())) showToast('Link copied. It opens this exact plan.'); }}><Icon name="link" />Share link</button>
          </div>
        </div>
      </div>
      {(() => {
        const i = editing;
        const p = i != null ? s.places[i] : undefined;
        const [a, b] = p ? hoursOf(p) : [s.start, s.end];
        return (
          <Modal open={!!p} onClose={() => setEditing(null)} title={p ? `Working hours in ${p.name}` : 'Working hours'}
            footer={<>
              {p && hasOwnHours(p) && <button type="button" class="btn btn-quiet" onClick={() => setOwnHours(i!, null, null)}>Use the default ({fmtTime(s.start, 0, h12, true)}–{fmtTime(s.end, 0, h12, true)})</button>}
              <button type="button" class="btn btn-primary" onClick={() => setEditing(null)}>Done</button>
            </>}>
            {p && (
              <div class="stack">
                <p class="muted" style="margin:0">Useful when someone keeps different hours, for example a client who starts at 8am, or you working late to overlap with them.</p>
                <div class="hours-pair">
                  <div class="control"><select aria-label={`Working day starts in ${p.name}`} value={a} onChange={(e) => setOwnHours(i!, Number((e.target as HTMLSelectElement).value), b)}>{hourOptions}</select></div>
                  <span class="faint">to</span>
                  <div class="control"><select aria-label={`Working day ends in ${p.name}`} value={b} onChange={(e) => setOwnHours(i!, a, Number((e.target as HTMLSelectElement).value))}>{hourOptions}</select></div>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}
      {toast}
    </div>
  );
}

function isHour(n: number) { return Number.isInteger(n) && n >= 0 && n <= 23; }

function isZone(z: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; }
}

