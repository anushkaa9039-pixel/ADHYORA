import { useState } from 'react';
import { api, goTab } from '../api';
import { Bar, Btn, Err, field, Ghost, H, Load, pct, useApi, useMeta, when } from '../ui';

export function Mistakes() {
  const { data, err } = useApi<{ ts: number; concept: string; question: string; chosen: string; correct: string; misconception: { name: string; fix: string } | null; explanation: string | null }[]>('/mistakes');
  if (!data) return <Load d={data} e={err} />;
  return (
    <div>
      <H sub="Wrong answers, and why.">Mistake notebook</H>
      {!data.length && <p className="text-sm text-[#5b6a5b]">No mistakes recorded yet.</p>}
      <ul className="max-w-[760px] divide-y divide-[#d3dccb]">{data.map((m, i) => (
        <li key={i} className="py-3 text-sm"><p className="text-sage2">{m.concept} · {new Date(m.ts).toLocaleDateString()}</p><p className="font-semibold">{m.question}</p>
          <p>You chose: {m.chosen}. Correct: <b>{m.correct}</b></p>
          {m.misconception && <p className="text-wine"><b>{m.misconception.name}.</b> {m.misconception.fix}</p>}{m.explanation && <p>{m.explanation}</p>}</li>
      ))}</ul>
    </div>
  );
}

export function Revision() {
  const { data, err } = useApi<{ id: string; name: string; p: number; due: number; ivlDays: number; risk: number; isDue: boolean; reviews: number }[]>('/revision');
  if (!data) return <Load d={data} e={err} />;
  const due = data.filter((r) => r.isDue), later = data.filter((r) => !r.isDue);
  const Row = (r: (typeof data)[number]) => (
    <li key={r.id} className="flex items-center justify-between gap-4 py-2"><div className="min-w-0 flex-1"><b>{r.name}</b> <span className="text-sm">mastery {pct(r.p)} · forgetting risk {pct(r.risk)} · {when(r.due)}</span><div className="mt-1 max-w-xs"><Bar p={r.p} /></div></div>
      <Ghost onClick={() => goTab('practice', r.id)}>{r.isDue ? 'Revise now' : 'Practise'}</Ghost></li>
  );
  return (
    <div>
      <H sub="Topics due for another look.">Revision planner</H>
      {!data.length && <p className="text-sm text-[#5b6a5b]">Nothing scheduled yet. Answer questions and your reviews appear here.</p>}
      {due.length > 0 && <><h4 className="mb-1 font-semibold">Due now ({due.length})</h4><ul className="mb-8 max-w-[760px] divide-y divide-[#d3dccb]">{due.map(Row)}</ul></>}
      {later.length > 0 && <><h4 className="mb-1 font-semibold">Coming up</h4><ul className="max-w-[760px] divide-y divide-[#d3dccb]">{later.map(Row)}</ul></>}
    </div>
  );
}

type Items = { concept: string; minutes: number }[];
type Rm = { needsExam: true } | { needsExam: false; examDate: string; hours: number; unavailable: string[]; days: { date: string; items: Items }[]; weeks: { label: string; items: Items }[]; months: { label: string; items: Items }[]; uncovered: number; totalMinutes: number };

export function Roadmap() {
  const meta = useMeta();
  const { data, err, reload } = useApi<Rm>('/roadmap');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState('');
  if (!data) return <Load d={data} e={err} />;
  const nm = (id: string) => meta.concepts.find((c) => c.id === id)?.name ?? id;
  const list = (items: Items) => items.map((i) => `${nm(i.concept)} (${i.minutes} min)`).join(', ');
  if (data.needsExam) return (<div><H>Study roadmap</H><p className="mb-3 max-w-[60ch]">Add your exam date and daily hours in My profile.</p><Btn onClick={() => goTab('profile')}>Open profile</Btn></div>);
  const unavailable = async () => { try { await api('/roadmap/unavailable', { method: 'POST', body: { date } }); setMsg(''); setDate(''); reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <div>
      <H sub="Your day-by-day plan. Weak topics get more time.">Study roadmap</H>
      {data.days.length === 0 ? <p>Your exam date has passed or is today. Update it in your profile.</p> : (
        <>
          <p className="mb-6 text-sm">{data.days.length} study days until {data.examDate} at {data.hours} h per day ({Math.round(data.totalMinutes / 60)} h of new learning).{data.uncovered > 0 && <b className="text-wine"> Short by about {Math.round(data.uncovered / 60)} h: add hours or prioritise the weak concepts.</b>}</p>
          <h4 className="mb-1 font-semibold">Next 7 days</h4>
          <ul className="mb-8 max-w-[800px] divide-y divide-[#d3dccb] text-sm">{data.days.slice(0, 7).map((d) => <li key={d.date} className="py-2"><b>{new Date(d.date + 'T00:00:00Z').toUTCString().slice(0, 11)}</b> {list(d.items) || 'Revision only'}</li>)}</ul>
          <h4 className="mb-1 font-semibold">Weekly view</h4>
          <ul className="mb-8 max-w-[800px] divide-y divide-[#d3dccb] text-sm">{data.weeks.slice(0, 8).map((w) => <li key={w.label} className="py-2"><b>{w.label}</b> {list(w.items)}</li>)}</ul>
          <h4 className="mb-1 font-semibold">Monthly view</h4>
          <ul className="mb-8 max-w-[800px] divide-y divide-[#d3dccb] text-sm">{data.months.map((w) => <li key={w.label} className="py-2"><b>{w.label}</b> {list(w.items)}</li>)}</ul>
        </>
      )}
      <h4 className="mb-1 font-semibold">Backlog recovery</h4>
      <p className="mb-2 max-w-[62ch] text-sm text-[#3b4a3b]">Busy on a day? Mark it unavailable and the plan adjusts.</p>
      <div className="flex max-w-[420px] gap-2"><input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /><Btn disabled={!date} onClick={unavailable}>Mark unavailable</Btn></div>
      <Err msg={msg} />
      {data.unavailable.length > 0 && <p className="mt-2 text-sm">Unavailable: {data.unavailable.join(', ')}</p>}
    </div>
  );
}
