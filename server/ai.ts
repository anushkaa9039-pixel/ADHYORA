// AI calls (plain fetch, no SDK). Works with Anthropic (ANTHROPIC_API_KEY) or Google Gemini (GEMINI_API_KEY).
// Every function degrades cleanly when no key is set, and real failures (bad key, wrong model, quota) are reported, never hidden.
import { MISC, type Q } from './data.js';

type Provider = 'anthropic' | 'gemini';
/** Hosts often keep quotes or spaces when a key is pasted into settings; strip them so the key still works. */
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
const keyOf = (p: Provider) => (p === 'gemini' ? clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY) : clean(process.env.ANTHROPIC_API_KEY));
/** Which AI service is used: AI_PROVIDER if set and its key exists, otherwise Anthropic if its key exists, otherwise Gemini. */
export function provider(): Provider | null {
  const pref = clean(process.env.AI_PROVIDER).toLowerCase();
  if ((pref === 'gemini' || pref === 'anthropic') && keyOf(pref)) return pref;
  return keyOf('anthropic') ? 'anthropic' : keyOf('gemini') ? 'gemini' : null;
}
export const aiOn = () => provider() !== null;
export const modelName = () => (provider() === 'gemini' ? clean(process.env.GEMINI_MODEL) || 'gemini-2.5-flash' : clean(process.env.ANTHROPIC_MODEL) || 'claude-sonnet-5-5');
/** A serverless function is killed at its time limit, so AI calls must give up a little earlier and report it. */
const LIMIT = process.env.VERCEL ? 52000 : 120000;

/** Carries the HTTP status so the route can tell the learner what is actually wrong (bad key, wrong model, busy, slow). */
export class AiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
export function explainAiError(e: unknown): string {
  const st = e instanceof AiError ? e.status : 0;
  const gem = provider() === 'gemini';
  if (st === 401 || st === 403) return `The AI key was rejected. Check ${gem ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'} (no quotes or spaces). On Vercel, redeploy after changing it; locally, restart the server.`;
  if (st === 404) return `The AI model was not found. Check ${gem ? 'GEMINI_MODEL' : 'ANTHROPIC_MODEL'}, or remove it to use the default.`;
  if (st === 429) return 'The AI service is busy or over its limit (rate limit or free-tier quota). Wait a minute and try again.';
  if (st === 500 || st === 502 || st === 503 || st === 529) return 'The AI service is busy right now. Try again in a moment.';
  if (e instanceof Error && /timeout|abort/i.test(e.name + e.message)) return 'The AI took too long to answer. Try again.';
  if (st === 0) return 'The server could not reach the AI service. Check the internet connection of the machine running the server.';
  return 'The AI service returned an error. Try again.';
}

type Msg = { role: 'user' | 'assistant'; content: string };

async function call(system: string, messages: Msg[], max = 900, timeout = 45000, jsonOut = false): Promise<string> {
  const p = provider();
  if (!p) throw new AiError(503, 'No AI key is set on the server.');
  const signal = AbortSignal.timeout(Math.min(timeout, LIMIT));
  const key = keyOf(p);
  const geminiCall = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      // Gemini 2.5 models spend part of the output budget on hidden thinking, so the cap is generous.
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: Math.min(max * 3 + 1500, 20000), ...(jsonOut ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal,
    });
  let r: Response;
  if (p === 'gemini') {
    // A model name can be missing for a given key or retired; on 404 try the next known model instead of failing.
    const tried = [modelName(), 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'].filter((m, i, a) => m && a.indexOf(m) === i);
    // Also move on when a model is overloaded (503/500/502) or out of quota (429): another model is often free. Retry the list once after a short pause.
    const skip = (st: number) => st === 404 || st === 429 || st === 500 || st === 502 || st === 503;
    r = await geminiCall(tried[0]);
    for (let round = 0; round < 2 && skip(r.status); round++) {
      if (round === 1) await new Promise((ok) => setTimeout(ok, 2000));
      for (let i = round === 0 ? 1 : 0; i < tried.length && skip(r.status); i++) r = await geminiCall(tried[i]);
    }
  } else r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelName(), max_tokens: max, system, messages }),
      signal,
    });
  if (!r.ok) {
    const detail: string = await r.json().then((j: any) => String(j?.error?.message ?? '')).catch(() => '');
    // Gemini reports a bad key as HTTP 400 "API key not valid".
    const st = p === 'gemini' && r.status === 400 && /api key|api_key/i.test(detail) ? 401 : r.status;
    throw new AiError(st, `AI request failed (${r.status})${detail ? ': ' + detail : ''}`);
  }
  const j: any = await r.json();
  if (p === 'gemini') {
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((x: any) => (typeof x?.text === 'string' ? x.text : '')).join('').trim();
    if (!text) throw new AiError(502, `The AI returned no text${j.promptFeedback?.blockReason ? ' (blocked: ' + j.promptFeedback.blockReason + ')' : ''}.`);
    return text;
  }
  return (j.content ?? []).map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim();
}

/** Tiny real request to find out whether the key and model work. Cached for a minute so it cannot be used to burn credit. */
let last: { at: number; r: { ok: boolean; message: string } } | null = null;
export async function checkAi(force = false): Promise<{ ok: boolean; message: string }> {
  if (!aiOn()) return { ok: false, message: 'No AI key is set on the server. Add ANTHROPIC_API_KEY or GEMINI_API_KEY (.env file locally, Environment Variables on Vercel), then restart or redeploy.' };
  if (!force && last && Date.now() - last.at < 60000) return last.r;
  let r: { ok: boolean; message: string };
  try { await call('Reply with the single word OK.', [{ role: 'user', content: 'ping' }], 16, 15000); r = { ok: true, message: `The AI key and model work (${provider()}, ${modelName()}).` }; }
  catch (e) { r = { ok: false, message: explainAiError(e) }; }
  last = { at: Date.now(), r };
  return r;
}

const json = (t: string) => { try { return JSON.parse(t.replace(/```json|```/g, '').trim()); } catch { return null; } };
const MISC_LIST = Object.entries(MISC).map(([id, m]) => `${id}: ${m.name}`).join('\n');

export async function chat(topic: string, messages: { role: 'user' | 'assistant'; content: string }[], context: string) {
  const sys = `You are Adhyora's Study Buddy for school and college exam preparation. Be warm, clear and concise. Teach step by step with a small example. Ask the student one question at a time. When the student shows working or an answer, name the exact misconception behind any mistake before correcting it, and ask a targeted follow-up. Raise difficulty only when they answer well. If unsure of a fact, say so. Plain text, short paragraphs, no headings. Topic: ${topic || 'not stated'}. ${context}`;
  return call(sys, messages, 1200);
}

/** `known` = the misconception ids this question may be tagged with (defaults to the built-in library). */
export async function analyseReasoning(q: Q, chosen: string, reasoning: string, known?: Record<string, { name: string }>): Promise<{ sound: boolean; misconception: string | null; note: string } | null> {
  const lib = known ?? MISC;
  const list = known ? Object.entries(known).map(([id, m]) => `${id}: ${m.name}`).join('\n') || '(none: always use null)' : MISC_LIST;
  try {
    const t = await call(
      'You grade a student\'s written reasoning for one multiple-choice question. Reply with JSON only: {"sound":boolean,"misconception":string|null,"note":string}. "sound" is true only if the reasoning is valid and supports the answer. "misconception" must be one id from the list or null. "note" is one short sentence to the student.\nMisconception ids:\n' + list,
      [{ role: 'user', content: `Question: ${q.q}\nOptions: ${q.o.join(' | ')}\nCorrect answer: ${q.o[q.a]}\nStudent chose: ${chosen}\nStudent reasoning: ${reasoning}` }],
      300, 45000, true,
    );
    const j = json(t);
    if (!j || typeof j.sound !== 'boolean') return null;
    return { sound: j.sound, misconception: typeof j.misconception === 'string' && (lib as Record<string, unknown>)[j.misconception] ? j.misconception : null, note: String(j.note ?? '').slice(0, 300) };
  } catch { return null; }
}

export async function generateQuestion(concept: string, conceptName: string, diff: number, misc: string | null, subject: { name: string; syllabus: string } = { name: 'Physics', syllabus: 'Class 10 CBSE' }): Promise<Omit<Q, 'id' | 'c' | 'src'> | null> {
  try {
    const t = await call(
      `You write one original ${subject.syllabus} ${subject.name} multiple-choice question. Reply with JSON only: {"q":string,"o":[4 strings],"a":0-3 index of the correct option,"w":{"<wrong option index>":"<misconception id>"},"exp":string}. Use misconception ids only from the list. Exactly one option must be correct and the numbers must be right. Difficulty 1 recall, 2 application, 3 multi-step.\nMisconception ids:\n` + MISC_LIST,
      [{ role: 'user', content: `Concept: ${conceptName}. Difficulty: ${diff}.${misc ? ` Target this misconception: ${MISC[misc].name}.` : ''}` }],
      700, 45000, true,
    );
    const j = json(t);
    if (!j || typeof j.q !== 'string' || !Array.isArray(j.o) || j.o.length !== 4 || j.o.some((x: unknown) => typeof x !== 'string') || !Number.isInteger(j.a) || j.a < 0 || j.a > 3) return null;
    const w: Record<number, string> = {};
    for (const [k, v] of Object.entries(j.w ?? {})) if (Number(k) !== j.a && Number(k) >= 0 && Number(k) < 4 && typeof v === 'string' && MISC[v]) w[Number(k)] = v;
    return { d: diff, q: j.q.slice(0, 500), o: j.o.map((x: string) => x.slice(0, 160)), a: j.a, w, exp: typeof j.exp === 'string' ? j.exp.slice(0, 500) : undefined };
  } catch { return null; }
}


// ---------------------------------------------------------------------------------------------
// Any-subject generators (used for every subject without a built-in bank): syllabus + questions.
// ---------------------------------------------------------------------------------------------
export type Topic = { unit: string; name: string; requires: string[] };
export type GenQ = { c: string; d: number; q: string; o: string[]; a: number; w: Record<number, { name: string; fix: string }>; exp?: string };
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export { norm };

/** Ask the AI for a syllabus. With `text`, it must organise exactly what the student supplied and add nothing. */
export async function generateSyllabus(level: string, subject: string, text?: string): Promise<Topic[] | null> {
  const own = !!text?.trim();
  const sys = `You are a curriculum designer for school and college exams. Reply with JSON only: {"units":[{"name":string,"topics":[{"name":string,"requires":[string]}]}]}. ` +
    `Each topic is one teachable, testable concept (a student can answer a few questions on it). "requires" lists names of EARLIER topics that must be understood first (use [] when none; most topics need 0 to 2). ` +
    (own ? 'Use ONLY the syllabus the student supplied: keep its order and wording, split overly broad lines into separate topics, never add topics that are not in it. ' : 'Cover the whole standard syllabus for this class and subject in the usual teaching order. ') +
    'Between 8 and 40 topics. Topic names are short (under 70 characters). No commentary.';
  {
    const t = await call(sys, [{ role: 'user', content: `Class or level: ${level}\nSubject: ${subject}${own ? `\nSyllabus supplied by the student:\n${text!.slice(0, 12000)}` : ''}` }], 6000, 90000, true);
    const j = json(t);
    if (!j || !Array.isArray(j.units)) return null;
    const out: Topic[] = [], seen = new Set<string>();
    for (const u of j.units) {
      if (!u || typeof u.name !== 'string' || !Array.isArray(u.topics)) continue;
      for (const tp of u.topics) {
        if (!tp || typeof tp.name !== 'string' || !tp.name.trim() || seen.has(norm(tp.name))) continue;
        seen.add(norm(tp.name));
        out.push({ unit: u.name.trim().slice(0, 80) || 'Syllabus', name: tp.name.trim().slice(0, 100), requires: Array.isArray(tp.requires) ? tp.requires.filter((x: unknown) => typeof x === 'string') : [] });
      }
    }
    return out.length >= 2 ? out.slice(0, 60) : null;
  }
}

/** One question per concept (or several for one concept) in a single request. Invalid items are dropped, never repaired. */
export async function generateQuestions(ctx: { level: string; subject: string }, items: { id: string; name: string; unit: string }[], diff: number, opts: { count?: number; avoid?: string[]; misc?: string | null } = {}): Promise<GenQ[]> {
  if (!items.length) return [];
  const per = opts.count ?? 1;
  const sys = `You write original multiple-choice exam questions for ${ctx.level} ${ctx.subject}. Reply with JSON only: {"questions":[{"concept":string,"q":string,"o":[4 strings],"a":0-3,"w":{"<wrong option index>":{"name":string,"fix":string}},"exp":string}]}. ` +
    `Write exactly ${per} question${per > 1 ? 's' : ''} for each listed concept id, in the "concept" field. Exactly one option is correct, the other three are plausible wrong answers that each reflect a specific common misconception. ` +
    'In "w" give, for EVERY wrong option index, the misconception name (short) and "fix" (one or two sentences correcting it). "exp" explains the correct answer briefly. ' +
    'Check any calculation or fact before answering. Difficulty 1 = recall, 2 = application, 3 = multi-step or analysis. For language or humanities subjects use short passages, grammar, vocabulary, interpretation or recall as fits the topic. No images or diagrams. Do not put the letter A/B/C/D inside option text.';
  const user = `Difficulty: ${diff}.${opts.misc ? ` Target this misconception: ${opts.misc}.` : ''}${opts.avoid?.length ? ` Do not repeat these questions: ${opts.avoid.map((x) => x.slice(0, 120)).join(' | ')}.` : ''}\nConcepts:\n` + items.map((c) => `${c.id}: ${c.name} (unit: ${c.unit})`).join('\n');
  {
    const t = await call(sys, [{ role: 'user', content: user }], Math.min(7000, 700 * items.length * per + 500), 90000, true);
    const j = json(t);
    const out: GenQ[] = [];
    for (const x of Array.isArray(j?.questions) ? j.questions : []) {
      if (!x || typeof x.q !== 'string' || !items.some((c) => c.id === x.concept) || !Array.isArray(x.o) || x.o.length !== 4 || x.o.some((o: unknown) => typeof o !== 'string' || !o.trim()) || !Number.isInteger(x.a) || x.a < 0 || x.a > 3) continue;
      if (new Set(x.o.map((o: string) => norm(o))).size !== 4) continue; // duplicate options: unusable
      const w: GenQ['w'] = {};
      for (const [k, v] of Object.entries(x.w ?? {}) as [string, any][]) if (Number(k) !== x.a && Number(k) >= 0 && Number(k) < 4 && v && typeof v.name === 'string' && v.name.trim()) w[Number(k)] = { name: v.name.trim().slice(0, 120), fix: String(v.fix ?? '').slice(0, 400) };
      out.push({ c: x.concept, d: diff, q: x.q.slice(0, 700), o: x.o.map((o: string) => o.slice(0, 200)), a: x.a, w, exp: typeof x.exp === 'string' ? x.exp.slice(0, 500) : undefined });
    }
    return out;
  }
}
