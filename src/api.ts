const key = 'adh_sid';
// Anonymous, device-local learner id. There is no login, email or account.
export function sid(): string {
  let v: string | null = null;
  try { v = localStorage.getItem(key); } catch { /* storage blocked: use a per-page id */ }
  if (!v) {
    // crypto.randomUUID only exists on https or localhost; opening the site by a network address over http would otherwise break every request.
    const c = globalThis.crypto as Crypto | undefined;
    v = typeof c?.randomUUID === 'function' ? c.randomUUID() : Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-');
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  }
  return v;
}
const skey = 'adh_subject';
export const getSubject = () => { try { return localStorage.getItem(skey) || 'physics'; } catch { return 'physics'; } };
export function setSubject(v: string) { try { localStorage.setItem(skey, v); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('adhyora:subject', { detail: v })); }

// ---- The learner's data lives in this browser. The server keeps nothing between requests (that is what lets it run on Vercel),
// so every call that needs the learner's data sends it along, and calls that change it send the new copy back. ----
const stateKey = () => 'adh_state_' + sid();
let memState: unknown = null; // used when localStorage is blocked
const readState = (): unknown => { try { const s = localStorage.getItem(stateKey()); return s ? JSON.parse(s) : memState; } catch { return memState; } };
function writeState(s: unknown) {
  memState = s;
  try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch { /* storage full or blocked: keep the in-memory copy for this visit */ }
}
/** Remove every saved learner record in this browser (used by nothing automatic; handy from the console). */
export const forgetAll = () => { memState = null; try { Object.keys(localStorage).filter((k) => k.startsWith('adh_state_')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } };

const NO_STATE = ['/meta', '/ai/check', '/health'];
let writes: Promise<unknown> = Promise.resolve(); // changes are sent one at a time so two of them can never overwrite each other

type Init = { method?: string; body?: unknown; signal?: AbortSignal };
async function send<T>(path: string, init: Init): Promise<T> {
  const method = init.method ?? 'GET';
  const r = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, path, body: init.body, sid: sid(), subject: getSubject(), state: NO_STATE.some((p) => path.startsWith(p)) ? undefined : readState() }),
    signal: init.signal,
  }).catch((e) => {
    if (init.signal?.aborted) throw e;
    throw new Error('Cannot reach the Adhyora server. Locally, make sure it is running (npm run dev) and refresh the page. On Vercel, open /api/health on your site to check the backend.');
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not JSON: the host answered instead of the app */ }
  if (!j) {
    if (r.status === 413) throw new Error('Your saved data is too large to send. Use "Reset everything" in the workspace.');
    throw new Error(`The server answered with an error page (HTTP ${r.status}), not with data. If this is a Vercel site, the /api functions did not deploy or crashed: open /api/health and check the function logs.`);
  }
  if (j.state) writeState(j.state); // saved even when the call failed: partial work (e.g. some AI questions) is kept
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j.data as T;
}
export function api<T>(path: string, init: Init = {}): Promise<T> {
  // Anything that can change the learner's data (including opening an AI test, which writes it) waits for earlier changes to finish.
  const changes = (init.method ?? 'GET') !== 'GET' || path.startsWith('/diagnostic') || path.startsWith('/practice/next');
  if (!changes) return send<T>(path, init);
  const p = writes.then(() => send<T>(path, init), () => send<T>(path, init));
  writes = p.catch(() => undefined);
  return p;
}
export const goTab = (tab: string, concept?: string, solo?: boolean) => window.dispatchEvent(new CustomEvent('adhyora:tab', { detail: { tab, concept, solo } }));
export const askBuddy = (topic: string, prompt?: string) => window.dispatchEvent(new CustomEvent('adhyora:ask', { detail: { topic, prompt } }));
