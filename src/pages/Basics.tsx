import { useEffect, useState } from 'react';
import { api, goTab } from '../api';
import { Btn, Err, field, H, Ghost, Load, pct, useApi, useMeta } from '../ui';

type Dash = { assessed: number; total: number; answers: number; accuracy: number | null; avg: number | null; diagnosticDone: boolean; diagnosticAnswered: number; dueNow: number; next: { id: string; reason: string }; nextName?: string; notifications: { kind: string; title: string; body: string; tab: string }[] };

export function Dashboard() {
  const { data: d, err } = useApi<Dash>('/dashboard');
  const meta = useMeta();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  useEffect(() => {
    if (d && perm === 'granted' && d.notifications.length) new Notification('Adhyora', { body: d.notifications[0].title });
  }, [d, perm]);
  if (!d) return <Load d={d} e={err} />;
  const nm = d.nextName ?? meta.concepts.find((c) => c.id === d.next.id)?.name;
  return (
    <div>
      <H sub="What to do next.">Dashboard</H>
      <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
        {[['Concepts assessed', `${d.assessed} of ${d.total}`], ['Average mastery', pct(d.avg)], ['Answers given', String(d.answers)], ['Accuracy', d.accuracy == null ? 'No answers yet' : pct(d.accuracy)]].map(([k, v]) => (
          <div key={k} className="border-l-4 border-sage2 pl-3"><dt className="text-sm text-[#5b6a5b]">{k}</dt><dd className="font-dsp text-2xl font-extrabold">{v}</dd></div>
        ))}
      </dl>
      <h4 className="mb-2 font-semibold">What to do next</h4>
      <p className="mb-3 max-w-[60ch]">{!d.diagnosticDone ? `Finish the diagnostic test (${d.diagnosticAnswered} of ${d.total} concepts done). Everything else is built from it.` : `Practise ${nm}. ${d.next.reason}`}</p>
      <div className="mb-8 flex gap-2">
        <Btn onClick={() => goTab(d.diagnosticDone ? 'practice' : 'diagnostic')}>{d.diagnosticDone ? 'Start practice' : 'Continue diagnostic'}</Btn>
        {d.dueNow > 0 && <Ghost onClick={() => goTab('revision')}>{d.dueNow} due for revision</Ghost>}
      </div>
      <h4 className="mb-2 font-semibold">Notifications</h4>
      {d.notifications.length === 0 ? <p className="text-sm text-[#5b6a5b]">Nothing needs your attention.</p> : (
        <ul className="mb-3 max-w-[70ch] divide-y divide-[#d3dccb]">
          {d.notifications.map((n, i) => <li key={i} className="flex items-start justify-between gap-4 py-2"><div><b>{n.title}</b><div className="text-sm text-[#3b4a3b]">{n.body}</div></div><Ghost onClick={() => goTab(n.tab)}>Open</Ghost></li>)}
        </ul>
      )}
      <p className="max-w-[70ch] text-sm text-[#5b6a5b]">
        Alerts appear here and, if you allow it, as browser notifications while this page is open. Phone push notifications are not built yet.{' '}
        {perm === 'default' && <button className="underline" onClick={() => Notification.requestPermission().then(setPerm)}>Allow browser notifications</button>}
      </p>
    </div>
  );
}

export function Profile() {
  const { data, err } = useApi<any>('/profile');
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (data) setF({ ...data, examDate: data.examDate ?? '' }); }, [data]);
  if (!f) return <Load d={f} e={err} />;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const save = async () => {
    try { await api('/profile', { method: 'PUT', body: { ...f, examDate: f.examDate || null } }); setMsg('Saved.'); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div className="max-w-[560px]">
      <H sub="Class, goal, exam date, daily hours.">Academic profile</H>
      <div className="grid gap-4">
        <fieldset><legend className="mb-1 text-sm font-semibold">I am a</legend>
          <div className="flex gap-2">{['school', 'college'].map((l) => <button key={l} onClick={() => set('level', l)} aria-pressed={f.level === l} className={`rounded-full px-4 py-2 text-sm font-semibold ${f.level === l ? 'bg-wine text-white' : 'bg-sage'}`}>{l === 'school' ? 'School student' : 'College student'}</button>)}</div>
        </fieldset>
        <label className="text-sm font-semibold">Name<input className={field} value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="text-sm font-semibold">{f.level === 'school' ? 'Class and board' : 'Course and semester'}<input className={field} value={f.className} maxLength={80} placeholder={f.level === 'school' ? 'Class 10, CBSE' : 'B.Sc Physics, Sem 2'} onChange={(e) => set('className', e.target.value)} /></label>
        <label className="text-sm font-semibold">Goal<input className={field} value={f.goal} maxLength={200} placeholder="e.g. 90% in boards" onChange={(e) => set('goal', e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm font-semibold">Exam date<input type="date" className={field} value={f.examDate} onChange={(e) => set('examDate', e.target.value)} /></label>
          <label className="text-sm font-semibold">Study hours per day<input type="number" step="0.5" min="0.5" max="12" className={field} value={f.hours} onChange={(e) => set('hours', Number(e.target.value))} /></label>
        </div>
        <div className="flex items-center gap-3"><Btn onClick={save}>Save profile</Btn><Err msg={msg === 'Saved.' ? '' : msg} />{msg === 'Saved.' && <span className="text-sm text-sage2">Saved.</span>}</div>
      </div>
    </div>
  );
}
