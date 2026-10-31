import { useEffect, useRef, useState } from 'react';
import { api } from './api';

type Msg = { r: 'u' | 'a'; c: string };
const CH: [string, string][] = [
  ['Explain step by step', 'Explain {t} step by step for a student. Use a simple example, then ask me one check question.'],
  ['Quiz me', 'Give me 3 short questions on {t}, one at a time. Wait for my answer before the next.'],
  ['Find my mistake', 'Here is my answer and working on {t}. Find the exact misconception behind any error, explain it, then ask one follow-up question.'],
  ['Draw a diagram', 'Explain {t} with a clear labelled diagram, drawn as one SVG in a ```svg code block (viewBox 0 0 400 300, light background, readable text).'],
  ['Revision plan', 'Make a 5-day revision plan for {t} with what to revise each day and a quick self-test.'],
];
const esc = (s: string) => s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string));
function fmt(t: string) {
  let svg: string | null = null;
  t = t.replace(/```svg\s*([\s\S]*?)```/, (_m, s) => { svg = s.trim(); return ''; });
  let h = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+\s*(.+)$/gm, '<b>$1</b>').replace(/^\s*[-*]\s+/gm, '• ').trim();
  if (svg && /^<svg/i.test(svg)) {
    if (!/xmlns=/.test(svg)) svg = (svg as string).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    // Rendered through <img>, so any script inside the SVG cannot run.
    h += `<img alt="Diagram from Study Buddy" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
  }
  return h;
}
const HELLO = 'Hi, I am your Study Buddy. Type what you are studying above, then tap a button or ask me anything.';

export function StudyBuddy() {
  const [topic, setTopic] = useState('');
  const [hist, setHist] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint] = useState('Enter sends. Shift+Enter adds a new line.');
  const [needs, setNeeds] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('adh_chat') || 'null'); if (s) { setHist(s.h || []); setTopic(s.t || ''); } } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem('adh_chat', JSON.stringify({ h: hist.slice(-30), t: topic })); } catch { /* ignore */ } box.current?.scrollTo(0, box.current.scrollHeight); }, [hist, topic]);

  async function send(text: string, needsInput = false) {
    text = text.trim();
    if (busy) return;
    if (needsInput && !q.trim()) { setNeeds(true); ta.current?.focus(); return; }
    if (!text) return;
    setNeeds(false); setQ('');
    const next: Msg[] = [...hist, { r: 'u', c: text }, { r: 'a', c: 'Thinking…' }];
    setHist(next); setBusy(true);
    ctl.current = new AbortController();
    try {
      const msgs = next.slice(-13, -1).map((m) => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.c }));
      const r = await api<{ text: string }>('/chat', { method: 'POST', body: { topic, messages: msgs }, signal: ctl.current.signal });
      setHist([...next.slice(0, -1), { r: 'a', c: r.text }]);
    } catch (e: any) {
      const stopped = ctl.current?.signal.aborted;
      setHist([...next.slice(0, -1), { r: 'a', c: stopped ? '(stopped)' : e.message || 'Something went wrong. Please send that again.' }]);
    }
    setBusy(false);
  }
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { topic?: string; prompt?: string };
      if (d.topic) setTopic(d.topic);
      document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' });
      if (d.prompt) setQ(d.prompt);
      setTimeout(() => ta.current?.focus(), 400);
    };
    window.addEventListener('adhyora:ask', h);
    return () => window.removeEventListener('adhyora:ask', h);
  }, []);

  return (
    <section className="chatw" id="chat">
      <div className="chatin">
        <h2>Study Buddy</h2>
        <p>Type the topic, tap what you need, and talk it through. It explains step by step, quizzes you, and looks for the idea behind a wrong answer.</p>
        <div className="chat">
          <div className="ch-h">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What are you studying? e.g. Class 10 Physics, Light" aria-label="Topic" />
            <button onClick={() => { ctl.current?.abort(); setHist([]); setBusy(false); }}>New chat</button>
          </div>
          <div className="chips">{CH.map(([n, p]) => <button key={n} onClick={() => send(p.replace('{t}', topic.trim() || 'the topic I am studying'), n === 'Find my mistake')}>{n}</button>)}</div>
          <div className="msgs" ref={box} aria-live="polite">
            {!hist.length && <div className="bub a">{HELLO}</div>}
            {hist.map((m, i) => <div key={i} className={'bub ' + m.r} {...(m.r === 'u' ? { children: m.c } : { dangerouslySetInnerHTML: { __html: fmt(m.c) } })} />)}
          </div>
          <div className="inp">
            <textarea ref={ta} rows={1} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Message"
              placeholder={needs ? 'Paste your answer and working here, then press Send…' : 'Ask a doubt, or paste your answer and your working…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }} />
            <button onClick={() => (busy ? ctl.current?.abort() : send(q))}>{busy ? 'Stop' : 'Send'}</button>
          </div>
          <div className="hint">{hint}</div>
        </div>
      </div>
    </section>
  );
}
