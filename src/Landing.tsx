import { useEffect } from 'react';
import { initShelf } from './shelf';
import { Workspace } from './Workspace';
import { StudyBuddy } from './StudyBuddy';
import { goTab } from './api';
import { ErrorBoundary } from './ErrorBoundary';

export function Landing() {
  // If the 3D shelf cannot start (very old browser, blocked animation API), the rest of the page must still work.
  useEffect(() => { try { return initShelf(); } catch (e) { console.error('Shelf failed to start:', e); return undefined; } }, []);
  return (
    <>
      <div className="cur" id="cur"><div className="ring"></div><div className="dot"></div><div className="lb">Open</div></div>

      <main className="hero" id="hero">
        <header className="bar"><span className="logo">ADHY<i>O</i>RA</span><span style={{ display: 'flex', gap: 24 }}><a href="#workspace" onClick={() => goTab('dashboard', undefined, false)}>Start here</a><a href="#how">How it works</a><a href="#chat">Study Buddy</a></span></header>
        <div className="hl"><h1>Learn your way. Rise every day.</h1><p>Adhyora finds what you do not know yet, then helps you practise and revise it. Browse the books to see how, or press Start here.</p></div>
        <section className="shelf" id="shelf" aria-label="The Adhyora shelf"><div className="stage" id="stage"></div></section>
        <div className="cap" id="cap" aria-live="polite"><div className="m t" id="ct"></div><div className="m s" id="cs"></div></div>
        <button className="open" id="openb">Open this book</button>
        <button className="arr l" id="pv" aria-label="Previous book"><svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 1L1 5l4 4M1 5h16" /></svg></button>
        <button className="arr rt" id="nx" aria-label="Next book"><svg width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M13 1l4 4-4 4M17 5H1" /></svg></button>
      </main>

      <div className="dt" id="dt" role="dialog" aria-modal="true" aria-label="Book details">
        <button className="cls" id="cls">Close</button>
        <div className="dg"><div className="dl" id="dl"></div><div className="dr" id="dr"></div></div>
      </div>

      <ErrorBoundary><Workspace /></ErrorBoundary>
      <ErrorBoundary><StudyBuddy /></ErrorBoundary>

      <section className="doc" id="how">
        <h2>How It Works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {([['Pick', 'Enter your name, then choose your class and subject. No account, no password.', '#A9C3A3'], ['Test', 'A short test finds what you already know.', '#9CBFB0'], ['See', 'Your scores show which topics are strong and which are weak.', '#E8B04A'], ['Practise', 'Questions target your weak topics and get harder as you improve.', '#8FB59E'], ['Revise', 'Topics come back just before you would forget them.', '#E4D5AE']] as const).map(([t, d, c], i) => (
            <li key={t} className="rounded-2xl p-5" style={{ background: c, color: '#1B2B22' }}>
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-navy font-dsp text-lg font-extrabold text-white">{i + 1}</span>
              <h3 className="mb-1 font-dsp text-2xl font-extrabold">{t}</h3>
              <p className="text-sm leading-snug">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-sage px-5 py-3 text-center font-semibold text-navy">Every answer updates your score for that topic, and your score decides what comes next. ↻</p>
        <p className="mt-3 text-center text-sm">Teachers see which topics the whole class finds hard, never anyone's private chats.</p>
      </section>
    </>
  );
}
