import { useEffect, useState } from 'react';
import { api, askBuddy, getSubject } from '../api';
import { Btn, Err, field, Ghost, H, Load, pct, useApi, useMeta, when } from '../ui';

type PQ = { id: string; concept: string; conceptName: string; difficulty: number; text: string; source: 'bank' | 'ai'; options: { k: number; t: string }[] };
type Res = { correct: boolean; correctText: string; conceptName: string; pBefore: number; pAfter: number; misconception: { name: string; fix: string } | null; explanation: string | null; reasoning: { analysed: boolean; sound: boolean | null; note: string }; prerequisites: string[]; dueAt: number; repeated: boolean };

function Runner({ q, mode, onNext, nextLabel }: { q: PQ; mode: 'diagnostic' | 'practice'; onNext: () => void; nextLabel: string }) {
  const meta = useMeta();
  const [choice, setChoice] = useState<number | null>(null);
  const [why, setWhy] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    if (choice === null) return;
    setBusy(true); setErr('');
    try { setRes(await api<Res>('/answer', { method: 'POST', body: { qid: q.id, choice, reasoning: why, mode } })); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="max-w-[720px]">
      <p className="mb-1 text-sm text-sage2">{q.conceptName} · difficulty {q.difficulty} of 3 · {q.source === 'ai' ? 'AI-generated question' : 'Practice bank question (author-written, not a past-year paper)'}</p>
      <p className="mb-4 text-lg font-semibold">{q.text}</p>
      <div role="radiogroup" className="grid gap-2">
        {q.options.map((o) => (
          <button key={o.k} role="radio" aria-checked={choice === o.k} disabled={!!res} onClick={() => setChoice(o.k)}
            className={`rounded-lg border px-4 py-3 text-left text-[15px] ${choice === o.k ? 'border-wine bg-beige' : 'border-[#cfd8c9] bg-white hover:bg-sage'} ${res && o.t === res.correctText ? '!border-sage2 !bg-sage' : ''}`}>{o.t}</button>
        ))}
      </div>
      {!res && (
        <>
          <label className="mt-4 block text-sm font-semibold">Why did you choose it? (optional)
            <textarea className={`${field} mt-1`} rows={2} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <p className="mb-3 mt-1 text-xs text-[#5b6a5b]">{meta.ai ? 'Your reasoning is read for misconceptions and affects how much this answer counts.' : 'Reasoning is saved, but reading it for misconceptions needs an AI key on the server. Wrong options are still checked for known misconceptions.'}</p>
          <Btn disabled={choice === null || busy} onClick={submit}>{busy ? 'Checking…' : 'Submit answer'}</Btn>
        </>
      )}
      <Err msg={err} />
      {res && (
        <div className="mt-5 border-l-4 pl-4" style={{ borderColor: res.correct ? '#5F7A5B' : '#7E2A3F' }}>
          <p className="font-semibold">{res.correct ? 'Correct.' : `Not quite. The answer is: ${res.correctText}`}</p>
          <p className="text-sm">Mastery of {res.conceptName}: {pct(res.pBefore)} → <b>{pct(res.pAfter)}</b>{res.repeated ? ' (repeat question, counted at half weight)' : ''}. Next revision {when(res.dueAt)}.</p>
          {res.misconception && <p className="mt-2 text-sm"><b>Misconception spotted: {res.misconception.name}.</b> {res.misconception.fix}</p>}
          {res.explanation && <p className="mt-2 text-sm">{res.explanation}</p>}
          {res.reasoning.analysed && res.reasoning.note && <p className="mt-2 text-sm"><b>On your reasoning:</b> {res.reasoning.note}</p>}
          {!res.correct && res.prerequisites.length > 0 && <p className="mt-2 text-sm text-[#3b4a3b]">Related earlier ideas: {res.prerequisites.join(', ')}.</p>}
          <div className="mt-3 flex gap-2">
            <Btn onClick={onNext}>{nextLabel}</Btn>
            {!res.correct && <Ghost onClick={() => askBuddy(res.conceptName, `I answered "${q.options.find((o) => o.k === choice)?.t}" to: ${q.text} Please explain where I went wrong.`)}>Explain with Study Buddy</Ghost>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Diagnostic() {
  const { data: d, err, reload } = useApi<{ total: number; answered: number; pending: number; questions: PQ[] }>('/diagnostic');
  const meta = useMeta();
  const custom = !!meta.subjects.find((x) => x.id === getSubject())?.custom;
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [d?.questions.length]);
  if (!d) return <Load d={d} e={err || (custom ? 'The AI is writing your test from your syllabus. This can take up to a minute…' : '')} />;
  if (!d.questions.length && d.pending > 0) return (<div><H>Diagnostic test</H><p className="mb-3 max-w-[60ch]">The test could not be written just now.</p><Btn onClick={reload}>Try again</Btn></div>);
  if (!d.questions.length) return (<div><H>Diagnostic test</H><p className="max-w-[60ch]">Test done: all {d.total} topics assessed. Open My scores to see your results.</p></div>);
  const q = d.questions[i];
  return (
    <div>
      <H sub="One question per topic. No timer.">Diagnostic test</H>
      <p className="mb-4 text-sm text-[#5b6a5b]">{d.answered + i} of {d.total} done</p>
      {q && <Runner key={q.id} q={q} mode="diagnostic" nextLabel={i + 1 < d.questions.length ? 'Next question' : 'Finish'} onNext={() => (i + 1 < d.questions.length ? setI(i + 1) : reload())} />}
    </div>
  );
}

export function Practice({ concept }: { concept?: string }) {
  const meta = useMeta();
  const custom = !!meta.subjects.find((x) => x.id === getSubject())?.custom;
  const [ai, setAi] = useState(false);
  const [n, setN] = useState(0);
  const { data: d, err } = useApi<{ question: PQ; target: { name: string; p: number | null; reason: string }; difficulty: number; followUp: string | null; note: string | null }>(`/practice/next?ai=${ai ? 1 : 0}${concept ? `&concept=${concept}` : ''}`, [n]);
  if (!d) return <Load d={d} e={err || (custom ? 'The AI is writing a question for you…' : '')} />;
  return (
    <div>
      <H sub="Questions from your weakest topics.">Practice</H>
      <div className="mb-5 max-w-[720px] border-l-4 border-sage2 pl-3 text-sm">
        <p><b>Focus: {d.target.name}</b> (mastery {pct(d.target.p)}). {d.target.reason}</p>
        {d.followUp && <p>Follow-up on your recent misconception: {d.followUp}.</p>}
        {d.note && <p className="text-wine">{d.note}</p>}
      </div>
      {custom ? <p className="mb-5 text-sm text-[#5b6a5b]">Every question here is written fresh by the AI for this topic and difficulty.</p> : (
      <label className={`mb-5 flex items-center gap-2 text-sm ${meta.ai ? '' : 'opacity-60'}`}>
        <input type="checkbox" disabled={!meta.ai} checked={ai} onChange={(e) => { setAi(e.target.checked); setN(n + 1); }} />
        Generate a fresh AI question for this concept {meta.ai ? '' : '(needs an AI key on the server)'}
      </label>)}
      <Runner key={d.question.id + n} q={d.question} mode="practice" nextLabel="Next question" onNext={() => setN(n + 1)} />
    </div>
  );
}
