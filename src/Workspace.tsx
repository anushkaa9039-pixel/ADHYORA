import { useEffect, useMemo, useState } from 'react';
import { api, askBuddy, setSubject } from './api';
import { Pick } from './Pick';
import type { Choice } from './subjects';
import { Btn, Ghost, MetaCtx, type Concept, type Meta, type Subject } from './ui';
import { Dashboard, Profile } from './pages/Basics';
import { Diagnostic, Practice } from './pages/Questions';
import { Graph, Model } from './pages/Model';
import { Mistakes, Revision, Roadmap } from './pages/Plan';
import { Pyq, Teacher } from './pages/Insight';
import { Syllabus } from './pages/Syllabus';

const TABS: [string, string, string][] = [
  ['dashboard', 'Home', 'Your starting point: what to do next and what needs your attention.'],
  ['syllabus', 'Syllabus', 'Your topics. Untick anything removed from your exam, or paste your own syllabus. Every subject works, the AI writes what is missing.'],
  ['diagnostic', 'Start test', 'A short test with one question per topic. It finds what you already know and what you do not.'],
  ['model', 'My scores', 'Your score for every topic. It changes after each answer. Weak topics are listed below the table.'],
  ['graph', 'Topic map', 'How topics connect. An arrow means "learn this first". Click a topic to practise it.'],
  ['practice', 'Practice', 'Questions chosen for your weakest topics. They get harder as you improve.'],
  ['mistakes', 'Mistakes', 'Every wrong answer, the right answer, and the idea behind your mistake.'],
  ['revision', 'Revision', 'Topics to look at again, timed for just before you would forget them.'],
  ['roadmap', 'Study plan', 'A day-by-day plan until your exam. Add your exam date and daily hours in My profile first.'],
  ['pyq', 'Past papers', 'Type in your own previous-year questions to see which topics carry the most marks.'],
  ['profile', 'My profile', 'Your class or course, goal, exam date and daily study hours. No account needed.'],
  ['teacher', 'Teacher view', 'Mastery, gaps and misconceptions from the data saved in this browser. There is no shared class database or login, so it shows only this learner.'],
];
const STEPS = ['Pick your subject', 'Take the short test', 'See your weak topics', 'Practise and revise them'];

export function Workspace() {
  const [tab, setTab] = useState('dashboard');
  const [focus, setFocus] = useState<string | undefined>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [rev, setRev] = useState(0);
  const [solo, setSolo] = useState(false);
  const [sel, setSel] = useState<Choice | null>(() => { try { const c = JSON.parse(localStorage.getItem('adh_pick') || 'null') as Choice | null; if (c?.engine) setSubject(c.engine); return c?.engine ? c : null; } catch { return null; } });
  const [editing, setEditing] = useState(!sel);
  const [extra, setExtra] = useState<{ key: string; concepts: Concept[]; subjects: Subject[] } | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem('adh_name') || ''; } catch { return ''; } });
  const choose = (c: Choice, nm: string) => {
    try { localStorage.setItem('adh_pick', JSON.stringify(c)); localStorage.setItem('adh_name', nm); } catch { /* ignore */ }
    setName(nm);
    api<any>('/profile').then((p) => api('/profile', { method: 'PUT', body: { name: nm, level: c.level === 'ug' || c.level === 'pg' ? 'college' : 'school', className: c.levelLabel.slice(0, 80), goal: p.goal, examDate: p.examDate, hours: p.hours } })).catch(() => {});
    setSubject(c.engine ?? 'none'); setSel(c); setEditing(false); if (!solo) setTab('dashboard'); setFocus(undefined); setMsg(''); setRev((r) => r + 1);
  };
  const sub = sel?.engine ?? '';
  /** Switch to a course the learner just created from the Syllabus page (their own syllabus for a built-in subject). */
  const useCourse = (id: string) => { if (!sel) return; choose({ ...sel, engine: id }, name); setTab('syllabus'); setMsg('Your own syllabus course is ready. Take the short test to start.'); };
  const reset = async (all: boolean) => {
    const name = all ? 'ALL subjects' : sel?.subject;
    if (!confirm(`Reset progress for ${name}? Answers, mastery, mistakes, revision schedule and saved PYQs will be deleted. This cannot be undone.`)) return;
    try { await api('/reset', { method: 'POST', body: { all } }); setMsg(`Progress reset for ${name}.`); setRev(rev + 1); } catch (e: any) { setMsg(e.message); }
  };
  useEffect(() => { api<Meta>('/meta').then(setMeta).catch((e) => setErr(e.message)); }, []);
  // Topic names and the learner's own AI courses are not in the static /meta, so they are fetched per subject and merged in.
  useEffect(() => {
    if (!sub) return;
    let live = true;
    Promise.all([api<Concept[]>('/concepts'), api<Subject[]>('/courses')]).then(([concepts, subjects]) => live && setExtra({ key: sub + ':' + rev, concepts, subjects })).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [sub, rev]);
  const ctx = useMemo<Meta | null>(() => meta && extra ? { ...meta, concepts: [...meta.concepts.filter((c) => c.s !== sub), ...extra.concepts], subjects: [...meta.subjects, ...extra.subjects] } : null, [meta, extra, sub]);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { tab: string; concept?: string; solo?: boolean };
      setTab(d.tab); setFocus(d.concept); if (d.solo !== undefined) setSolo(d.solo);
      document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener('adhyora:tab', h);
    return () => window.removeEventListener('adhyora:tab', h);
  }, []);

  return (
    <section id="workspace" className="bg-paper px-4 py-16 text-ink md:px-8">
      <div className="mx-auto max-w-[1060px]">
        {err && <p className="rounded bg-beige p-3 text-sm text-wine">{err}</p>}
        {editing && <Pick initial={sel} name={name} onDone={choose} />}
        {!editing && sel && (
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-sage px-4 py-2 text-sm">
            <span>Hi, <b>{name}</b> · <b>{sel.levelLabel}</b> · <b>{sel.subject}</b></span>
            <Ghost onClick={() => setEditing(true)}>Change</Ghost>
            {<span className="ml-auto flex gap-2"><Ghost onClick={() => reset(false)}>Reset this subject</Ghost><Ghost onClick={() => reset(true)}>Reset everything</Ghost></span>}
          </div>
        )}
        {msg && <p className="mb-3 rounded bg-beige p-3 text-sm" role="status">{msg}</p>}
        {!editing && sel?.engine && (<>
        {!solo && <ol className="mb-6 grid max-w-[820px] gap-2 text-sm sm:grid-cols-4" aria-label="How Adhyora works">
          {STEPS.map((t, i) => <li key={t} className="flex items-center gap-2 rounded-lg bg-sage px-3 py-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>{t}</li>)}
        </ol>}
        {solo ? (
          <div className="mb-6 flex gap-2"><Ghost onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}>← Back to the shelf</Ghost><Ghost onClick={() => setSolo(false)}>All pages</Ghost></div>
        ) : (<>
        <nav className="mb-3 flex flex-wrap gap-2" aria-label="Workspace pages">
          {TABS.map(([k, n]) => (
            <button key={k} onClick={() => { setTab(k); setFocus(undefined); }} aria-current={tab === k}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-wine text-white' : 'bg-sage text-[#243024] hover:bg-sage2 hover:text-white'}`}>{n}</button>
          ))}
        </nav>
        <p className="mb-8 max-w-[70ch] text-[15px] text-[#3b4a3b]" aria-live="polite"><b>{TABS.find((t) => t[0] === tab)?.[1]}:</b> {TABS.find((t) => t[0] === tab)?.[2]}</p>
        </>)}
        {ctx && extra?.key === sub + ':' + rev && (
          <MetaCtx.Provider value={ctx}><div key={sub + rev}>
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'syllabus' && sel && <Syllabus choice={sel} onChanged={(m) => { setMsg(m); setRev((r) => r + 1); }} onUseCourse={useCourse} />}
            {tab === 'profile' && <Profile />}
            {tab === 'diagnostic' && <Diagnostic />}
            {tab === 'practice' && <Practice key={focus ?? 'auto'} concept={focus} />}
            {tab === 'graph' && <Graph />}
            {tab === 'model' && <Model />}
            {tab === 'mistakes' && <Mistakes />}
            {tab === 'revision' && <Revision />}
            {tab === 'roadmap' && <Roadmap />}
            {tab === 'pyq' && <Pyq />}
            {tab === 'teacher' && <Teacher />}
          </div></MetaCtx.Provider>
        )}
        </>)}
      </div>
    </section>
  );
}
