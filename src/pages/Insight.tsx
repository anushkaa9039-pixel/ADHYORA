import { useState } from 'react';
import { api, getSubject } from '../api';
import { Bar, Btn, Err, barColor, field, H, Load, pct, useApi, useMeta } from '../ui';

export function Pyq() {
  const meta = useMeta();
  const { data, err, reload } = useApi<{ items: { id: number; conceptName: string; year: number; marks: number; text: string; source: string }[]; stats: { id: string; name: string; count: number; marks: number }[] }>('/pyqs');
  const mine = meta.concepts.filter((c) => c.s === getSubject());
  const [f, setF] = useState({ concept: mine[0]?.id ?? '', year: new Date().getFullYear() - 1, marks: 3, text: '' });
  const [msg, setMsg] = useState('');
  if (!data) return <Load d={data} e={err} />;
  const add = async () => { try { await api('/pyqs', { method: 'POST', body: f }); setF({ ...f, text: '' }); setMsg(''); reload(); } catch (e: any) { setMsg(e.message); } };
  const max = Math.max(1, ...data.stats.map((s) => s.marks));
  return (
    <div>
      <H sub="Add your own past questions to see which topics carry the most marks.">PYQ hub</H>
      <div className="mb-8 grid max-w-[640px] gap-3">
        <label className="text-sm font-semibold">Concept<select className={field} value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })}>{mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Year<input type="number" className={field} value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} /></label>
          <label className="text-sm font-semibold">Marks<input type="number" className={field} value={f.marks} onChange={(e) => setF({ ...f, marks: Number(e.target.value) })} /></label>
        </div>
        <label className="text-sm font-semibold">Question<textarea rows={3} className={field} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></label>
        <div className="flex items-center gap-3"><Btn disabled={f.text.trim().length < 5} onClick={add}>Add PYQ</Btn><Err msg={msg} /></div>
      </div>
      <h4 className="mb-2 font-semibold">Where your marks come from</h4>
      {!data.stats.length ? <p className="mb-8 text-sm text-[#5b6a5b]">Add questions to see which concepts carry the most marks.</p> : (
        <ul className="mb-8 max-w-[640px] gap-2 text-sm">{data.stats.map((s) => <li key={s.id} className="py-1"><div className="flex justify-between"><span>{s.name}</span><span>{s.count} question{s.count > 1 ? 's' : ''}, {s.marks} marks</span></div><Bar p={s.marks / max} /></li>)}</ul>
      )}
      <ul className="max-w-[760px] divide-y divide-[#d3dccb] text-sm">{data.items.map((i) => <li key={i.id} className="py-2"><span className="rounded bg-beige px-2 py-0.5 text-xs font-semibold">{i.source}</span> {i.year} · {i.conceptName} · {i.marks} marks<p className="mt-1">{i.text}</p></li>)}</ul>
    </div>
  );
}

type T = { students: number; concepts: { id: string; name: string; unit: string; assessed: number; avg: number | null; weakShare: number | null; weak: number }[]; gaps: { id: string; name: string; weak: number; assessed: number; weakShare: number | null }[]; misconceptions: { name: string; fix: string; students: number; times: number }[]; studentList: { label: string; assessed: number; avg: number; weakest: string | null; weakTopics: string[]; needsHelp: boolean }[] };

export function Teacher() {
  const { data: t, err } = useApi<T>('/teacher/class');
  if (!t) return <Load d={t} e={err} />;
  const helpers = t.studentList.filter((s) => s.needsHelp);
  const problem = new Set(t.gaps.map((g) => g.id));
  return (
    <div>
      <H sub="Who is struggling, and with which topic.">Teacher insights</H>
      <p className="mb-6 rounded bg-beige p-3 text-sm">No login, so this page is open to anyone. Protect it at your host before real use.</p>
      {t.students === 0 ? <p className="text-sm text-[#5b6a5b]">No data yet. It fills in when learners answer questions.</p> : (
        <>
          <dl className="mb-8 grid grid-cols-3 gap-4 text-center">
            {[['Learners', String(t.students), '#5F7A5B'], ['Need help', String(helpers.length), helpers.length ? '#7E2A3F' : '#5F7A5B'], ['Problem topics', String(t.gaps.length), t.gaps.length ? '#7E2A3F' : '#5F7A5B']].map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-sage p-4"><dd className="font-dsp text-4xl font-extrabold" style={{ color: c }}>{v}</dd><dt className="text-sm">{k}</dt></div>
            ))}
          </dl>
          <h4 className="mb-1 font-dsp text-2xl font-extrabold text-wine">Class mastery by topic</h4>
          <p className="mb-3 max-w-[64ch] text-sm text-[#3b4a3b]">Bar = class average. Line = 50%. Red = 40% or more of learners are below 50%.</p>
          <div className="mb-8 max-w-[760px]" role="img" aria-label="Bar chart of class average mastery for each topic">
            {t.concepts.map((c) => (
              <div key={c.id} className="mb-2 grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-3 text-sm">
                <span className="truncate" title={c.name}>{c.name}</span>
                <div className="relative h-4 rounded bg-sage"><div className="h-4 rounded" style={{ width: `${(c.avg ?? 0) * 100}%`, background: problem.has(c.id) ? '#7E2A3F' : barColor(c.avg) }} /><div className="absolute inset-y-0 left-1/2 border-l border-dashed border-ink" /></div>
                <span className="w-40 text-xs">{c.assessed ? <>{pct(c.avg)} {problem.has(c.id) ? <b className="text-wine">Problem</b> : <span className="text-sage2">OK</span>}</> : 'No data'}</span>
              </div>
            ))}
          </div>
          <h4 className="mb-1 font-dsp text-2xl font-extrabold text-wine">Who needs help, and with what</h4>
          <div className="mb-8 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[#5b6a5b]"><tr><th className="py-2 pr-3">Learner</th><th className="pr-3">Status</th><th className="pr-3">Average</th><th>Struggling with</th></tr></thead>
            <tbody className="divide-y divide-[#d3dccb]">{t.studentList.map((s, i) => (
              <tr key={i}><td className="py-2 pr-3 font-semibold">{s.label}</td>
                <td className="pr-3">{s.needsHelp ? <span className="rounded bg-wine px-2 py-0.5 text-xs font-semibold text-white">Needs help</span> : <span className="rounded bg-sage px-2 py-0.5 text-xs font-semibold">On track</span>}</td>
                <td className="pr-3">{pct(s.avg)}</td><td>{s.weakTopics.length ? s.weakTopics.join(', ') : 'No topic below 50%'}</td></tr>
            ))}</tbody></table></div>
          <h4 className="mb-1 font-dsp text-2xl font-extrabold text-wine">Common misconceptions</h4>
          {!t.misconceptions.length ? <p className="text-sm text-[#5b6a5b]">None detected yet.</p> : <ul className="max-w-[760px] divide-y divide-[#d3dccb] text-sm">{t.misconceptions.map((m) => <li key={m.name} className="py-2"><b>{m.name}</b> · {m.students} learner{m.students > 1 ? 's' : ''}, {m.times} time{m.times > 1 ? 's' : ''}<p>{m.fix}</p></li>)}</ul>}
        </>
      )}
    </div>
  );
}
