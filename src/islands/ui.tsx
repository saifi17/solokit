// Small shared building blocks for the interactive tools (Preact).
import type { ComponentChildren, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'preact';
import { useEffect, useRef, useState, useCallback, useId as usePreactId } from 'preact/hooks';
import { icons } from '../data/icons';
import { load, save, subscribe } from '../lib/storage';

export function Icon({ name, size = 18, class: cls = '' }: { name: string; size?: number; class?: string }) {
  return (
    <svg class={`icon ${cls}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] ?? '' }} />
  );
}

/** Stable id that matches between the server-rendered HTML and the browser. */
export function useId() {
  return usePreactId();
}

type FieldProps = {
  label: string;
  hint?: ComponentChildren;
  children: (id: string) => ComponentChildren;
  class?: string;
};
/** Label + control + hint, with the id wired up for accessibility. */
export function Field({ label, hint, children, class: cls = '' }: FieldProps) {
  const id = useId();
  return (
    <div class={`field ${cls}`}>
      <label for={id}>{label}</label>
      {children(id)}
      {hint && <span class="hint">{hint}</span>}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { prefix?: string; suffix?: string; invalid?: boolean };
/** Text/number input in the standard control box, with optional prefix/suffix. */
export function Input({ prefix, suffix, invalid, ...rest }: InputProps) {
  return (
    <div class={`control${invalid ? ' invalid' : ''}`}>
      {prefix && <span class="affix">{prefix}</span>}
      <input {...rest} />
      {suffix && <span class="affix">{suffix}</span>}
    </div>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <div class="control"><textarea {...props} /></div>;
}

export function Select({ options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  return (
    <div class="control">
      <select {...rest}>
        {options.map(([v, l]) => <option value={v}>{l}</option>)}
      </select>
    </div>
  );
}

/** Two to four mutually exclusive options. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** Native <dialog> wrapper. */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} class="modal" style={wide ? { width: 'min(820px, calc(100vw - 24px))' } : undefined}
      onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div class="modal-head">
        <h2>{title}</h2>
        <button type="button" class="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div class="modal-body">{children}</div>
      {footer && <div class="modal-foot">{footer}</div>}
    </dialog>
  );
}

/** A small message at the bottom of the screen. */
export function useToast(): [ComponentChildren, (msg: string) => void] {
  const [msg, setMsg] = useState('');
  const timer = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 2600);
  }, []);
  const node = msg ? <div class="toast" role="status"><Icon name="check" size={16} />{msg}</div> : null;
  return [node, show];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/**
 * State that is saved in localStorage. It starts from `fallback` (so the
 * server-rendered HTML and the first browser render match), then loads the
 * saved value after the component mounts.
 */
export function useStored<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    setValue(load<T>(key, fallback));
    setReady(true);
    return subscribe(key, () => setValue(load<T>(key, fallback)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(latest.current) : v;
    latest.current = next;
    setValue(next);
    save(key, next);
  }, [key]);
  return [value, set, ready];
}

/** Re-render every `ms` (for clocks and running timers). */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, enabled]);
  return now;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function base(): string {
  return (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL;
}
