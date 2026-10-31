import { useState } from 'react';
import { goTab, askBuddy, getSubject } from '../api';
import { Bar, barColor, Btn, Ghost, H, Load, pct, useApi, useMeta, when } from '../ui';

type C = { id: string; name: string; unit: string; pre: string[]; assessed: boolean; p: number | null; n: number; correct: number; due: number | null; risk: number | null };
type Mod = { concepts: C[]; weak: { id: string; name: string; p: number; weakPrereqs: { id: string; name: string; assessed: boolean }[] }[]; history: { concept: string; diff: number; correct: boolean; misconception: string | null; pBefore: number; pAfter: number; mode: string; ts: number }[] };

export function Graph() {
  const { data: m, err } = useApi<Mod>('/model');
  const [sel, setSel] = useState<string | null>(null);
  const sj = useMeta().subjects.find((x) => x.id === getSubject());
  if (!m) return <Load d={m} e={err} />;
  const depth: Record<string, number> = {};
  const dp = (c: C): number => (depth[c.id] ??= c.pre.length ? 1 + Math.max(...c.pre.map((p) => dp(m.concepts.find((x) => x.id === p)!))) : 0);
  m.concepts.forEach(dp);
  const cols: C[][] = [];
  m.concepts.forEach((c) => (cols[depth[c.id]] ??= []).push(c));
  const W = 170, Hh = 56, GX = 70, GY = 22;
  const pos: Record<string, { x: number; y: number }> = {};
  cols.forEach((col, ci) => col.forEach((c, ri) => (pos[c.id] = { x: ci * (W + GX) + 10, y: ri * (Hh + GY) + 10 })));
  const width = cols.length * (W + GX), height = Math.max(...cols.map((c) => c.length)) * (Hh + GY) + 10;
  const s = m.concepts.find((c) => c.id === sel);
  return (
    <div>
      <H sub={`${sj?.syllabus} ${sj?.name}, arrow = learn this first, colour = your score.`}>Concept graph</H>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[820px]" role="img" aria-label="Concept graph with prerequisites">
          <defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#5F7A5B" /></marker></defs>
          {m.concepts.flatMap((c) => c.pre.map((p) => <line key={p + c.id} x1={pos[p].x + W} y1={pos[p].y + Hh / 2} x2={pos[c.id].x} y2={pos[c.id].y + Hh / 2} stroke="#5F7A5B" strokeWidth="1.4" markerEnd="url(#ar)" opacity={sel && sel !== c.id && sel !== p ? 0.2 : 0.8} />))}
          {m.concepts.map((c) => (
            <g key={c.id} transform={`translate(${pos[c.id].x},${pos[c.id].y})`} onClick={() => setSel(c.id)} style={{ cursor: 'pointer' }} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(c.id)}>
              <rect width={W} height={Hh} rx="8" fill="#fff" stroke={sel === c.id ? '#7E2A3F' : '#c6d3c1'} strokeWidth={sel === c.id ? 2.5 : 1.2} />
              <rect width="6" height={Hh} rx="3" fill={barColor(c.p)} />
              <foreignObject x="12" y="4" width={W - 18} height={Hh - 8}><div style={{ fontSize: 12, lineHeight: 1.2, color: '#1B2B22' }}><b>{c.name}</b><div style={{ color: '#5b6a5b' }}>{pct(c.p)}</div></div></foreignObject>
            </g>
          ))}
        </svg>
      </div>
      {s && (
        <div className="mt-4 max-w-[640px] border-l-4 border-sage2 pl-3 text-sm">
          <p className="text-base font-semibold">{s.name} <span className="font-normal text-[#5b6a5b]">({s.unit})</span></p>
          <p>Mastery: {pct(s.p)}. Needs first: {s.pre.length ? s.pre.map((p) => m.concepts.find((c) => c.id === p)!.name).join(', ') : 'nothing, it is a starting concept'}. Leads to: {m.concepts.filter((c) => c.pre.includes(s.id)).map((c) => c.name).join(', ') || 'nothing further'}.</p>
          <div className="mt-2 flex gap-2"><Btn onClick={() => goTab('practice', s.id)}>Practise this</Btn><Ghost onClick={() => askBuddy(s.name)}>Ask Study Buddy</Ghost></div>
        </div>
      )}
    </div>
  );
}

export function Model() {
  const { data: m, err } = useApi<Mod>('/model');
  if (!m) return <Load d={m} e={err} />;
  const assessed = m.concepts.filter((c) => c.assessed);
  return (
    <div>
      <H sub="Your score for each topic. It updates after every answer.">Learner model</H>
      {!assessed.length && <p className="mb-6 text-sm text-[#5b6a5b]">No scores yet. They appear as soon as you answer your first question.</p>}
      <div className="mb-10 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[#5b6a5b]"><tr><th className="py-2 pr-3">Concept</th><th className="w-48 pr-3">Mastery</th><th className="pr-3">Answers</th><th className="pr-3">Forgetting risk</th><th>Next revision</th></tr></thead>
        <tbody className="divide-y divide-[#d3dccb]">{m.concepts.map((c) => (
          <tr key={c.id}><td className="py-2 pr-3">{c.name}</td><td className="pr-3"><Bar p={c.p} /><span className="text-xs">{pct(c.p)}</span></td><td className="pr-3">{c.assessed ? `${c.correct} of ${c.n} correct` : '–'}</td><td className="pr-3">{c.risk == null ? '–' : pct(c.risk)}</td><td>{c.due ? when(c.due) : '–'}</td></tr>
        ))}</tbody>
      </table></div>

      <h4 className="mb-1 font-dsp text-2xl font-extrabold text-wine">Weakness map</h4>
      <p className="mb-3 max-w-[62ch] text-sm text-[#3b4a3b]">Topics under 60%, most important first.</p>
      {!m.weak.length ? <p className="mb-10 text-sm text-[#5b6a5b]">{assessed.length ? 'No weak concepts right now.' : 'Complete the diagnostic to see this.'}</p> : (
        <ol className="mb-10 max-w-[720px] divide-y divide-[#d3dccb]">{m.weak.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-4 py-2"><div><b>{w.name}</b> <span className="text-sm">{pct(w.p)}</span>
            {w.weakPrereqs.length > 0 && <div className="text-sm text-wine">Held back by: {w.weakPrereqs.map((p) => p.name + (p.assessed ? '' : ' (not assessed)')).join(', ')}</div>}</div>
            <Ghost onClick={() => goTab('practice', w.id)}>Practise</Ghost></li>
        ))}</ol>
      )}

      <h4 className="mb-2 font-dsp text-2xl font-extrabold text-wine">Progress report: recent answers</h4>
      {!m.history.length ? <p className="text-sm text-[#5b6a5b]">No answers yet.</p> : (
        <ul className="max-w-[760px] divide-y divide-[#d3dccb] text-sm">{m.history.map((h, i) => (
          <li key={i} className="py-2"><b>{h.concept}</b> · difficulty {h.diff} · {h.mode} · {h.correct ? 'correct' : 'wrong'}: {pct(h.pBefore)} → {pct(h.pAfter)}{h.misconception ? ` · ${h.misconception}` : ''} <span className="text-[#5b6a5b]">({new Date(h.ts).toLocaleString()})</span></li>
        ))}</ul>
      )}
    </div>
  );
}
