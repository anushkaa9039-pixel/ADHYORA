import { useState } from 'react';
import { api } from './api';
import { Btn, field } from './ui';
import { LEVELS, engineFor, type Choice } from './subjects';

/** Read a text-like file in the browser. PDFs and photos cannot be read here, so the learner pastes the text instead. */
export function readTextFile(f: File): Promise<string> {
  return new Promise((ok, no) => {
    if (f.size > 200_000) return no(new Error('That file is too large. Paste just the syllabus text instead.'));
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ''));
    r.onerror = () => no(new Error('Could not read that file.'));
    r.readAsText(f);
  });
}

export function Pick({ initial, name: n0, onDone }: { initial: Choice | null; name: string; onDone: (c: Choice, name: string) => void }) {
  const [name, setName] = useState(n0);
  const [lvl, setLvl] = useState(initial?.level ?? 'c10');
  const [other, setOther] = useState(initial?.level === 'other' ? initial.levelLabel : '');
  const [subj, setSubj] = useState(initial?.subject ?? '');
  const [board, setBoard] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const L = LEVELS.find((l) => l.id === lvl);
  const label = lvl === 'other' ? other.trim() : L!.label;
  const ok = !!name.trim() && !!label && !!subj.trim() && !busy;
  const builtIn = lvl !== 'other' && !!engineFor(lvl, subj);

  async function go() {
    setBusy(true); setErr('');
    try {
      let engine = lvl === 'other' ? null : engineFor(lvl, subj);
      // Built-in subjects open straight away. Anything else, or any subject with the learner's own syllabus, becomes an AI course.
      if (!engine || text.trim()) {
        const c = await api<{ id: string }>('/course', { method: 'POST', body: { level: board.trim() ? `${label} (${board.trim()})` : label, subject: subj.trim(), syllabus: text.trim() } });
        engine = c.id;
      }
      onDone({ level: lvl, levelLabel: label, subject: subj.trim(), engine }, name.trim());
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  const pick = async (f?: File) => { if (!f) return; try { setText(await readTextFile(f)); setErr(''); } catch (e: any) { setErr(e.message); } };

  return (
    <div className="max-w-[640px]">
      <h3 className="mb-1 font-dsp text-3xl font-extrabold text-wine">Choose your class and subject</h3>
      <p className="mb-5 text-[15px] text-[#3b4a3b]">Enter your name and make two quick choices, then you are in. No account or password. You can change them any time.</p>
      <label className="mb-4 block text-sm font-semibold">Your name<input className={field} value={name} maxLength={60} placeholder="Enter your name" autoComplete="given-name" onChange={(e) => setName(e.target.value)} /></label>
      <label className="mb-4 block text-sm font-semibold">1. Class or level
        <select className={field} value={lvl} onChange={(e) => { setLvl(e.target.value); setSubj(''); }}>
          {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          <option value="other">Other (type it)</option>
        </select>
      </label>
      {lvl === 'other' && <label className="mb-4 block text-sm font-semibold">Type your class or course<input className={field} value={other} maxLength={60} placeholder="e.g. Diploma, 2nd year" onChange={(e) => setOther(e.target.value)} /></label>}
      <p className="mb-2 text-sm font-semibold">2. Subject</p>
      {L && <div className="mb-3 flex flex-wrap gap-2">{L.subjects.map((s) => (
        <button key={s} aria-pressed={subj.trim().toLowerCase() === s.toLowerCase()} onClick={() => setSubj(s)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${subj.trim().toLowerCase() === s.toLowerCase() ? 'border-navy bg-navy text-white' : 'border-sage2 hover:bg-sage'}`}>{s}{engineFor(lvl, s) ? ' ✓' : ''}</button>
      ))}</div>}
      <label className="mb-4 block text-sm font-semibold">Or type your own subject<input className={field} value={subj} maxLength={60} placeholder="e.g. Astronomy" onChange={(e) => setSubj(e.target.value)} /></label>
      {!builtIn && <label className="mb-4 block text-sm font-semibold">Board or university (optional)<input className={field} value={board} maxLength={40} placeholder="e.g. CBSE, ICSE, Maharashtra State Board, Delhi University" onChange={(e) => setBoard(e.target.value)} /></label>}
      <details className="mb-4 rounded-lg border border-[#cfd8c9] p-3" open={!!text}>
        <summary className="cursor-pointer text-sm font-semibold">3. Your own syllabus (optional)</summary>
        <p className="mb-2 mt-2 text-xs text-[#5b6a5b]">Some portions deleted, or a different syllabus? Paste exactly what you must study, one topic per line. The AI will use only that. Leave this empty and the AI writes the standard syllabus for you. You can also trim topics later in the Syllabus page.</p>
        <textarea className={field} rows={6} maxLength={12000} value={text} placeholder={'Unit 1: Grammar\n- Tenses\n- Reported speech\nUnit 2: Writing\n- Formal letters'} onChange={(e) => setText(e.target.value)} />
        <label className="mt-2 block text-xs font-semibold">…or load a text file (.txt, .md, .csv)<input type="file" accept=".txt,.md,.csv,text/plain" className="mt-1 block text-xs" onChange={(e) => pick(e.target.files?.[0])} /></label>
        <p className="mt-1 text-xs text-[#5b6a5b]">PDFs and photos cannot be read yet: copy the text out of them and paste it above.</p>
      </details>
      <p className="mb-4 text-xs text-[#5b6a5b]">✓ = ready-made, author-written questions. <b>Every other subject works too</b>: the AI writes the syllabus, your diagnostic test and your practice questions.</p>
      {err && <p className="mb-3 rounded bg-beige p-3 text-sm text-wine" role="alert">{err}</p>}
      <Btn disabled={!ok} onClick={go}>{busy ? (builtIn && !text.trim() ? 'Opening…' : 'AI is building your syllabus… this can take up to a minute') : 'Continue'}</Btn>
    </div>
  );
}
