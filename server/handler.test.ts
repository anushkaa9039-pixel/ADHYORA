// The server stores nothing between requests: the browser sends the learner's data each time (this is what makes Vercel work).
// These tests drive the same handler Vercel runs, passing the state back and forth exactly like the browser does. AI is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './handler.ts';

const SID = 'learner-handler-0001';
let state: unknown = undefined;
async function rpc(method: string, path: string, body?: unknown, subject = 'physics', sid = SID) {
  const out = await handle({ method, path, body, sid, subject, state });
  if (out.body.state) state = out.body.state;
  return out;
}
const data = (o: { body: Record<string, unknown> }) => o.body.data as any;
const noAi = () => { for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AI_PROVIDER']) delete process.env[k]; };
const realFetch = globalThis.fetch;
const reply = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
const geminiReply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

test('health and meta need no learner and no data', async () => {
  noAi();
  const h = await handle({ method: 'GET', path: '/health' });
  assert.equal(h.status, 200);
  assert.equal((h.body.data as any).ai, false);
  const m = await handle({ method: 'GET', path: '/meta' });
  assert.equal((m.body.data as any).subjects.length >= 2, true);
  assert.equal(m.body.state, undefined);
  assert.equal((await handle({ method: 'GET', path: '/nope' })).status, 404);
  assert.equal((await handle({ method: 'GET', path: '/profile', sid: 'x' })).status, 400, 'bad learner id');
});

test('built-in subject works with no server storage: progress travels in the browser state', async () => {
  const p = await rpc('PUT', '/profile', { name: 'Asha', level: 'school', className: 'Class 10', goal: '', examDate: null, hours: 2 });
  assert.equal(p.status, 200);
  assert.ok(state, 'state sent back after a write');
  const d = data(await rpc('GET', '/diagnostic'));
  assert.equal(d.questions.length, 17);
  const q = d.questions[0];
  const a = await rpc('POST', '/answer', { qid: q.id, choice: q.options[0].k, mode: 'diagnostic' });
  assert.equal(a.status, 200);
  // Next request is answered by a brand-new in-memory database that only knows what the state says.
  const dash = data(await rpc('GET', '/dashboard'));
  assert.equal(dash.answers, 1);
  assert.equal(data(await rpc('GET', '/profile')).name, 'Asha');
  assert.equal(data(await rpc('GET', '/diagnostic')).answered, 1);
  // A different browser (no state) starts empty.
  const other = await handle({ method: 'GET', path: '/dashboard', sid: 'learner-handler-0002', subject: 'physics' });
  assert.equal((other.body.data as any).answers, 0);
});

test('a hostile state cannot reach other tables, other learners or inject SQL', async () => {
  const evil = { students: [{ id: 'someone-else-123', name: 'x', 'name) VALUES(1); DROP TABLE students; --': 'y' }], answers: [{ id: 1, student: 'someone-else-123', concept: 'c1', qid: 'q', diff: 1, chosen: 0, correct: 1, ts: 1 }], sqlite_master: [{ name: 'z' }] };
  const out = await handle({ method: 'POST', path: '/pyqs', body: { concept: 'c1', year: 2020, marks: 2, text: 'A question about light' }, sid: 'learner-handler-0003', subject: 'physics', state: evil });
  assert.equal(out.status, 200);
  const st = out.body.state as any;
  assert.deepEqual(st.students.map((r: any) => r.id), ['learner-handler-0003']);
  assert.ok(st.answers.every((r: any) => r.student === 'learner-handler-0003'));
});

test('without an AI key: clear message, pasted syllabus still works, partial state is kept', async () => {
  noAi();
  state = undefined;
  const e = await rpc('POST', '/course', { level: 'Class 8', subject: 'English' });
  assert.equal(e.status, 503);
  assert.match(String(e.body.error), /ANTHROPIC_API_KEY or GEMINI_API_KEY/);
  const c = await rpc('POST', '/course', { level: 'Class 8', subject: 'English', syllabus: 'Unit 1: Grammar\n- Tenses\n- Modals\nUnit 2: Writing\n- Formal letters' });
  assert.equal(c.status, 200);
  const id = data(c).id as string;
  assert.match(id, /^x[0-9a-f]{8}$/);
  assert.equal(data(await rpc('GET', '/syllabus', undefined, id)).total, 3, 'the course lives in the browser state');
  const dg = await rpc('GET', '/diagnostic', undefined, id);
  assert.equal(dg.status, 503);
  assert.match(String(dg.body.error), /GEMINI_API_KEY/);
  const chat = data(await rpc('POST', '/chat', { topic: 'Tenses', messages: [{ role: 'user', content: 'hi' }] }, id));
  assert.equal(chat.offline, true);
});

test('Gemini: syllabus, test and chat work, and the request is shaped the way the Gemini API expects', async () => {
  noAi();
  process.env.GEMINI_API_KEY = ' "test-gemini-key" ';
  state = undefined;
  let seen: { url: string; key: string; body: any } | null = null;
  globalThis.fetch = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    seen = { url, key: init.headers['x-goog-api-key'], body };
    const sys: string = body.systemInstruction.parts[0].text, user: string = body.contents.at(-1).parts[0].text;
    if (sys.includes('curriculum designer')) return geminiReply(JSON.stringify({ units: [{ name: 'Grammar', topics: [{ name: 'Tenses', requires: [] }, { name: 'Modals', requires: ['Tenses'] }] }] }));
    if (sys.includes('multiple-choice exam questions')) {
      const ids = [...user.matchAll(/^(x[0-9a-f]{8}\.k\d+): /gm)].map((m) => m[1]);
      return geminiReply(JSON.stringify({ questions: ids.map((id) => ({ concept: id, q: `Q for ${id}?`, o: ['a1', 'b2', 'c3', 'd4'], a: 0, w: { 1: { name: 'Mix-up one', fix: 'Fix one.' }, 2: { name: 'Mix-up two', fix: 'Fix two.' }, 3: { name: 'Mix-up three', fix: 'Fix three.' } }, exp: 'Because.' })) }));
    }
    return geminiReply('Tenses show when something happens.');
  }) as typeof fetch;
  try {
    assert.equal((await handle({ method: 'GET', path: '/health' })).body.data && ((await handle({ method: 'GET', path: '/health' })).body.data as any).provider, 'gemini');
    const c = await rpc('POST', '/course', { level: 'Class 8', subject: 'English' });
    assert.equal(c.status, 200, JSON.stringify(c.body.error));
    assert.ok(seen!.url.includes('generativelanguage.googleapis.com') && seen!.url.includes('gemini-2.5-flash:generateContent'));
    assert.equal(seen!.key, 'test-gemini-key', 'quotes and spaces around the key are ignored');
    assert.equal(seen!.body.generationConfig.responseMimeType, 'application/json');
    const id = data(c).id as string;
    const d = data(await rpc('GET', '/diagnostic', undefined, id));
    assert.equal(d.questions.length, 2);
    assert.ok(d.questions.every((q: any) => !('a' in q)));
    const r = await rpc('POST', '/answer', { qid: d.questions[0].id, choice: d.questions[0].options.find((o: any) => o.t !== 'a1').k, mode: 'diagnostic' }, id);
    assert.equal(data(r).correct, false);
    assert.ok(data(r).misconception.name.startsWith('Mix-up'));
    const p = data(await rpc('GET', '/practice/next', undefined, id));
    assert.equal(p.question.source, 'ai');
    const ch = data(await rpc('POST', '/chat', { topic: 'Tenses', messages: [{ role: 'user', content: 'Explain tenses' }] }, id));
    assert.equal(ch.text, 'Tenses show when something happens.');
    assert.equal(seen!.body.contents.at(-1).role, 'user');
  } finally { globalThis.fetch = realFetch; noAi(); }
});

test('AI failures are explained, not hidden: bad key, busy, wrong model', async () => {
  noAi();
  process.env.GEMINI_API_KEY = 'bad-key';
  state = undefined;
  const failWith = (status: number, message: string) => { globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message } }), { status })) as typeof fetch; };
  try {
    failWith(400, 'API key not valid. Please pass a valid API key.');
    let r = await rpc('POST', '/course', { level: 'Class 8', subject: 'English' });
    assert.equal(r.status, 502);
    assert.match(String(r.body.error), /key was rejected.*GEMINI_API_KEY/);
    failWith(429, 'Quota exceeded');
    r = await rpc('POST', '/course', { level: 'Class 8', subject: 'English' });
    assert.match(String(r.body.error), /over its limit/);
    failWith(404, 'models/x is not found');
    r = await rpc('POST', '/chat', { messages: [{ role: 'user', content: 'hi' }] });
    assert.match(String(r.body.error), /model was not found.*GEMINI_MODEL/);
  } finally { globalThis.fetch = realFetch; noAi(); }
});

test('Anthropic still works, and wins when both keys are set', async () => {
  noAi();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.GEMINI_API_KEY = 'g-test';
  let url = '';
  globalThis.fetch = (async (u: string) => { url = u; return reply('Hello from Claude'); }) as typeof fetch;
  try {
    const ch = data(await handle({ method: 'POST', path: '/chat', body: { messages: [{ role: 'user', content: 'hi' }] }, sid: SID, subject: 'physics' }));
    assert.equal(ch.text, 'Hello from Claude');
    assert.ok(url.startsWith('https://api.anthropic.com/'));
  } finally { globalThis.fetch = realFetch; noAi(); }
});
