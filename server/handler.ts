// One request handler shared by the local Express server (server/local.ts) and the Vercel functions (api/*.ts).
// The browser sends { method, path, body, sid, subject, state } to POST /api/rpc. `state` is that learner's own data (see store.ts).
import { openDb } from './db.js';
import { HttpError, makeService, type Service } from './service.js';
import { aiOn, chat, checkAi, explainAiError, modelName, provider } from './ai.js';
import { CONCEPTS, MISC, SUBJECTS } from './data.js';
import { dumpState, loadState } from './store.js';

export type RpcIn = { method?: unknown; path?: unknown; body?: unknown; sid?: unknown; subject?: unknown; state?: unknown };
export type RpcOut = { status: number; body: Record<string, unknown> };
type Ctx = { svc: Service; sid: string; sub: string; body: any; q: URLSearchParams };
/** learner: needs the learner's data loaded. rw: may change it, so the new data is sent back (even if the call then fails). */
type Route = { learner?: boolean; rw?: boolean; run: (c: Ctx) => unknown };

const ROUTES: Record<string, Route> = {
  'GET /health': { run: () => ({ ok: true, ai: aiOn(), provider: provider(), model: aiOn() ? modelName() : null, vercel: !!process.env.VERCEL }) },
  'GET /ai/check': { run: () => checkAi() },
  'GET /meta': { run: () => ({ concepts: CONCEPTS, misc: MISC, subjects: SUBJECTS, ai: aiOn() }) },
  'GET /profile': { learner: true, run: (c) => c.svc.profile(c.sid) },
  'PUT /profile': { learner: true, rw: true, run: (c) => c.svc.saveProfile(c.sid, c.body) },
  'GET /dashboard': { learner: true, run: (c) => c.svc.dashboard(c.sid, c.sub) },
  // Writes the learner's AI-written test the first time it is opened, so it changes the stored data.
  'GET /diagnostic': { learner: true, rw: true, run: async (c) => { await c.svc.prepareDiagnostic(c.sid, c.sub); return c.svc.diagnostic(c.sid, c.sub); } },
  'GET /courses': { learner: true, run: (c) => c.svc.listCourses(c.sid) },
  'POST /course': { learner: true, rw: true, run: (c) => c.svc.createCourse(c.sid, { level: c.body?.level, subject: c.body?.subject, syllabus: c.body?.syllabus }) },
  'GET /concepts': { learner: true, run: (c) => c.svc.concepts(c.sid, c.sub) },
  'GET /syllabus': { learner: true, run: (c) => c.svc.syllabusView(c.sid, c.sub) },
  'PUT /syllabus/topics': { learner: true, rw: true, run: (c) => c.svc.setTopics(c.sid, c.sub, c.body?.off) },
  'POST /syllabus/replace': { learner: true, rw: true, run: (c) => c.svc.replaceSyllabus(c.sid, c.sub, c.body?.text) },
  'POST /answer': { learner: true, rw: true, run: (c) => c.svc.submit(c.sid, c.body) },
  'GET /practice/next': { learner: true, rw: true, run: (c) => c.svc.practiceNext(c.sid, { ai: c.q.get('ai') === '1', subject: c.sub, concept: c.q.get('concept') ?? undefined }) },
  'GET /model': { learner: true, run: (c) => c.svc.model(c.sid, c.sub) },
  'GET /mistakes': { learner: true, run: (c) => c.svc.mistakes(c.sid, c.sub) },
  'GET /revision': { learner: true, run: (c) => c.svc.revision(c.sid, c.sub) },
  'GET /roadmap': { learner: true, run: (c) => c.svc.roadmap(c.sid, c.sub) },
  'POST /roadmap/unavailable': { learner: true, rw: true, run: (c) => c.svc.markUnavailable(c.sid, c.body?.date, c.sub) },
  'GET /pyqs': { learner: true, run: (c) => c.svc.pyqs(c.sid, c.sub) },
  'POST /pyqs': { learner: true, rw: true, run: (c) => c.svc.addPyq(c.sid, c.body, c.sub) },
  'POST /reset': { learner: true, rw: true, run: (c) => c.svc.resetProgress(c.sid, c.body?.all ? 'all' : c.sub) },
  // Without a shared database this can only summarise the learner's own results (see README).
  'GET /teacher/class': { learner: true, run: (c) => c.svc.teacher(c.sub) },
  'POST /chat': { learner: true, run: chatRoute },
};

async function chatRoute(c: Ctx) {
  const msgs = c.body?.messages;
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > 20) throw new HttpError(400, 'Send 1 to 20 messages.');
  const clean = msgs.map((m: any) => ({ role: m?.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: String(m?.content ?? '').slice(0, 4000) }));
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw new HttpError(400, 'Last message must be from the student.');
  const last = [...clean].reverse().find((m) => m.role === 'user')!;
  const topic = String(c.body?.topic ?? '');
  if (!aiOn()) return { text: c.svc.offlineBuddy(c.sid, c.sub, topic, last.content), offline: true };
  try { return { text: await chat(topic.slice(0, 200), clean, c.svc.chatContext(c.sid, c.sub)) }; }
  catch (e) { console.error('Study Buddy AI call failed:', e instanceof Error ? e.message : e); throw new HttpError(502, explainAiError(e)); }
}

export async function handle(req: RpcIn): Promise<RpcOut> {
  const method = String(req?.method ?? 'GET').toUpperCase();
  let url: URL;
  try { url = new URL(String(req?.path ?? ''), 'http://x'); } catch { return { status: 400, body: { error: 'Bad request path.' } }; }
  const route = ROUTES[`${method} ${url.pathname}`];
  if (!route) return { status: 404, body: { error: `Unknown request: ${method} ${url.pathname}` } };

  const sid = String(req?.sid ?? '');
  if (route.learner && !/^[a-zA-Z0-9-]{8,64}$/.test(sid)) return { status: 400, body: { error: 'Missing or invalid learner id.' } };

  const db = openDb(':memory:');
  try {
    const svc = makeService(db);
    if (route.learner) loadState(db, sid, req.state);
    const ctx: Ctx = { svc, sid, sub: typeof req.subject === 'string' && req.subject ? req.subject : 'physics', body: req.body ?? {}, q: url.searchParams };
    let status = 200, body: Record<string, unknown>;
    try { body = { data: await route.run(ctx) }; }
    catch (e) {
      if (e instanceof HttpError) { status = e.status; body = { error: e.message }; }
      else { console.error(e); status = 500; body = { error: 'Something went wrong on the server. Try again; if it keeps happening, check the server log.' }; }
    }
    // Send the learner's data back even when the call failed: a half-finished AI test or syllabus is still worth keeping.
    if (route.learner && route.rw) { try { body.state = dumpState(db, sid); } catch (e) { console.error('Could not export learner data:', e); } }
    return { status, body };
  } finally { try { db.close(); } catch { /* ignore */ } }
}

/** Read a JSON request body from a plain Node request (used when the host has not already parsed it). */
export async function readJsonBody(req: AsyncIterable<Buffer | string> & { body?: unknown }, limit = 6_000_000): Promise<unknown> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  const parts: Buffer[] = [];
  let n = 0;
  for await (const ch of req) { const b = typeof ch === 'string' ? Buffer.from(ch) : ch; n += b.length; if (n > limit) throw new HttpError(413, 'Your saved data is too large to send. Use Reset everything.'); parts.push(b); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8') || 'null'); } catch { return null; }
}
