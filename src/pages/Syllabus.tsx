import { useEffect, useState } from 'react';
import { api } from '../api';
import { readTextFile } from '../Pick';
import { Btn, Err, field, Ghost, H, Load, useApi } from '../ui';
import type { Choice } from '../subjects';

type View = { id: string; subject: string; level: string; custom: boolean; source: string; text: string; total: number; active: number; units: { unit: string; topics: { id: string; name: string; on: boolean; requires: string[] }[] }[] };

/** See the syllabus, tick off what is NOT in your exam, or give your own syllabus text. */
export function Syllabus({ choice, onChanged, onUseCourse }: { choice: Choice; onChanged: (msg: string) => void; onUseCourse: (id: string) => void }) {
  const { data: v, err, reload } = useApi<View>('/syllabus');
  const [off, setOff] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (v) setOff(new Set(v.units.flatMap((u) => u.topics.filter((t) => !t.on).map((t) => t.id)))); }, [v]);
  if (!v) return <Load d={v} e={err} />;
  const all = v.units.flatMap((u) => u.topics.map((t) => t.id));
  const dirty = all.some((id) => off.has(id) !== !v.units.flatMap((u) => u.topics).find((t) => t.id === id)!.on);
  const toggle = (ids: string[], on: boolean) => setOff((o) => { const n = new Set(o); ids.forEach((i) => (on ? n.delete(i) : n.add(i))); return n; });
  const saveTopics = async () => {
    setBusy('save'); setMsg('');
    try { await api('/syllabus/topics', { method: 'PUT', body: { off: [...off] } }); onChanged('Syllabus saved. Your test, scores, practice and study plan now use only the topics you kept.'); }
    catch (e: any) { setMsg(e.message); }
    setBusy('');
  };
  const rebuild = async (t: string) => {
    setBusy('build'); setMsg('');
    try {
      if (v.custom) { await api('/syllabus/replace', { method: 'POST', body: { text: t } }); onChanged(t ? 'Your syllabus is in. Topics you already studied kept their scores.' : 'A fresh AI syllabus was written.'); }
      else { const c = await api<{ id: string }>('/course', { method: 'POST', body: { level: choice.levelLabel, subject: choice.subject, syllabus: t } }); onUseCourse(c.id); }
    } catch (e: any) { setMsg(e.message); }
    setBusy('');
  };
  return (
    <div>
      <H sub={`${v.level} ${v.subject}. ${v.source}.`}>Syllabus</H>
      <p className="mb-4 max-w-[64ch] text-sm text-[#3b4a3b]">Tick the topics that are in your exam. Untick anything your school or board has removed: it disappears from your test, scores, practice and study plan. You can tick it again any time.</p>
      <p className="mb-3 text-sm"><b>{v.active} of {v.total}</b> topics in your syllabus.</p>
      <div className="mb-4 max-w-[760px]">
        {v.units.map((u) => {
          const ids = u.topics.map((t) => t.id), allOn = ids.every((i) => !off.has(i));
          return (
            <fieldset key={u.unit} className="mb-4 rounded-lg border border-[#d3dccb] p-3">
              <legend className="px-1 font-dsp text-lg font-extrabold text-wine">{u.unit}</legend>
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#5b6a5b]"><input type="checkbox" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} />Whole unit</label>
              <ul className="divide-y divide-[#e5ebdf]">{u.topics.map((t) => (
                <li key={t.id} className="py-1.5"><label className="flex items-start gap-2 text-[15px]"><input type="checkbox" className="mt-1" checked={!off.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                  <span className={off.has(t.id) ? 'text-[#8a968a] line-through' : ''}>{t.name}{t.requires.length > 0 && <span className="block text-xs text-[#5b6a5b]">Needs first: {t.requires.join(', ')}</span>}</span></label></li>
              ))}</ul>
            </fieldset>
          );
        })}
      </div>
      <div className="mb-10 flex flex-wrap gap-2"><Btn disabled={!dirty || busy !== ''} onClick={saveTopics}>{busy === 'save' ? 'Saving…' : 'Save my syllabus'}</Btn><Ghost disabled={!dirty} onClick={reload}>Undo changes</Ghost></div>

      <h4 className="mb-1 font-dsp text-2xl font-extrabold text-wine">Give your own syllabus</h4>
      <p className="mb-3 max-w-[64ch] text-sm text-[#3b4a3b]">{v.custom ? 'Paste or load your syllabus and the AI will organise it into topics and replace the list above. Topics with the same name keep their scores.' : `${v.subject} currently uses the built-in syllabus. To study a different or reduced syllabus, paste it here: it becomes your own editable ${v.subject} course with an AI-written test.`}</p>
      <textarea className={`${field} max-w-[760px]`} rows={7} maxLength={12000} value={text} placeholder={'Unit 1: Grammar\n- Tenses\n- Reported speech\nUnit 2: Writing\n- Formal letters'} onChange={(e) => setText(e.target.value)} aria-label="Your syllabus text" />
      <label className="mt-2 block text-xs font-semibold">…or load a text file (.txt, .md, .csv)<input type="file" accept=".txt,.md,.csv,text/plain" className="mt-1 block text-xs" onChange={async (e) => { try { setText(await readTextFile(e.target.files![0])); setMsg(''); } catch (x: any) { setMsg(x.message); } }} /></label>
      <p className="mb-3 mt-1 text-xs text-[#5b6a5b]">PDFs and photos cannot be read yet: copy the text out of them and paste it here.</p>
      <div className="flex flex-wrap gap-2">
        <Btn disabled={text.trim().length < 5 || busy !== ''} onClick={() => rebuild(text.trim())}>{busy === 'build' ? 'AI is organising your syllabus…' : v.custom ? 'Use this syllabus' : 'Create my own syllabus course'}</Btn>
        {v.custom && <Ghost disabled={busy !== ''} onClick={() => confirm('Replace your topics with a fresh AI-written standard syllabus?') && rebuild('')}>Regenerate with AI</Ghost>}
      </div>
      <div className="mt-3"><Err msg={msg} /></div>
    </div>
  );
}
