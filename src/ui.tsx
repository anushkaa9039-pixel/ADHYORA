import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { api } from './api';

export type Concept = { id: string; name: string; unit: string; pre: string[]; s: string };
export type Subject = { id: string; name: string; level: string; syllabus: string; custom?: boolean };
export type Meta = { subjects: Subject[]; concepts: Concept[]; misc: Record<string, { name: string; fix: string }>; ai: boolean };
export const MetaCtx = createContext<Meta | null>(null);
export const useMeta = () => useContext(MetaCtx)!;

export const pct = (p: number | null | undefined) => (p == null ? 'Not assessed' : Math.round(p * 100) + '%');
export const barColor = (p: number | null) => (p == null ? '#cfd8c9' : p < 0.4 ? '#7E2A3F' : p < 0.7 ? '#E8B04A' : '#5F7A5B');
export const when = (ts: number) => {
  const d = ts - Date.now(), a = Math.abs(d);
  const s = a < 3600e3 ? `${Math.max(1, Math.round(a / 60e3))} min` : a < 86400e3 ? `${Math.round(a / 3600e3)} h` : `${Math.round(a / 86400e3)} d`;
  return d <= 0 ? (a < 60e3 ? 'now' : `${s} overdue`) : `in ${s}`;
};

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setErr('');
    api<T>(path).then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, err, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export const Btn = ({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`rounded-full bg-wine px-5 py-2.5 text-sm font-semibold text-white disabled:bg-[#b7c4b3] ${className}`} />
);
export const Ghost = ({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`rounded-full border border-sage2 px-4 py-2 text-sm font-semibold text-ink hover:bg-sage disabled:opacity-50 ${className}`} />
);
export const Bar = ({ p }: { p: number | null }) => (
  <div className="h-2 w-full rounded bg-sage" role="img" aria-label={pct(p)}><div className="h-2 rounded" style={{ width: `${(p ?? 0) * 100}%`, background: barColor(p) }} /></div>
);
export const H = ({ children, sub }: { children: ReactNode; sub?: string }) => (
  <div className="mb-5"><h3 className="font-dsp text-3xl font-extrabold text-wine">{children}</h3>{sub && <p className="mt-1 max-w-[62ch] text-[15px] text-[#3b4a3b]">{sub}</p>}</div>
);
export const Err = ({ msg }: { msg: string }) => (msg ? <p className="rounded bg-beige p-3 text-sm text-wine">{msg}</p> : null);
export const Load = ({ d, e }: { d: unknown; e: string }) => (d ? null : <p className="text-sm text-[#5b6a5b]">{e || 'Loading…'}</p>);
export const field = 'w-full rounded-lg border border-[#cfd8c9] bg-white px-3 py-2 text-[15px] text-ink';
