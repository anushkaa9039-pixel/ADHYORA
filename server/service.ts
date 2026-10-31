import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import { BANK, CONCEPTS, MISC, SUBJECTS, conceptsOf, subjectOf, type Concept, type Q } from './data.js';
import { DAY, P0, buildRoadmap, chooseTarget, difficultyFor, forgetRisk, iso, schedule, shuffle, updateMastery, weakList, type MM } from './engine.js';
import { aiOn, analyseReasoning, explainAiError, generateQuestion, generateQuestions, generateSyllabus, norm, type Topic } from './ai.js';

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
const bad = (m: string) => new HttpError(400, m);
const AI_OFF = 'AI is not set up on the server, so it cannot write this yet. Add ANTHROPIC_API_KEY or GEMINI_API_KEY (the .env file locally, Environment Variables on Vercel), then restart or redeploy. You can still paste your own syllabus to organise the topics.';
const isBuiltIn = (x: string) => SUBJECTS.some((s) => s.id === x);
const subOf = (conceptId: string) => subjectOf(conceptId) ?? conceptId.split('.')[0];

/** Offline fallback: turn pasted syllabus text into topics (one per line or separated by semicolons; headings become units). No AI, no invented prerequisites. */
export function parseSyllabusText(text: string): Topic[] {
  const out: Topic[] = [], seen = new Set<string>();
  let unit = 'Syllabus';
  const add = (name: string) => { name = name.trim().replace(/[.,]$/, '').slice(0, 100); if (name.length >= 3 && !seen.has(norm(name))) { seen.add(norm(name)); out.push({ unit, name, requires: [] }); } };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim().replace(/^[-*\u2022\u00b7]+\s*/, '').replace(/^(\(?\d+[.)]|[a-z][.)])\s+/i, '');
    if (!l) continue;
    const head = /^#+\s/.test(raw.trim()) || /^(unit|chapter|module|section|part|paper|block)\b/i.test(l) || /:$/.test(l);
    if (head) {
      const body = l.replace(/^#+\s*/, ''), ci = body.indexOf(':');
      // "Unit 3: Light; Lenses; Eye" lists topics after the colon; "Unit 3: Light" or "Light:" is just a unit title.
      if (ci >= 0 && body.slice(ci + 1).includes(';')) { unit = body.slice(0, ci).trim().slice(0, 80) || unit; body.slice(ci + 1).split(/[;,]/).forEach(add); }
      else unit = body.replace(/:$/, '').trim().slice(0, 80) || unit;
    } else l.split(';').forEach(add);
  }
  return out.slice(0, 60);
}
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

type Course = { id: string; student: string; level: string; subject: string; source: string; text: string; concepts: Concept[]; next: number };

export function makeService(db: Db) {
  const one = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
  const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
  const run = (sql: string, ...a: any[]) => db.prepare(sql).run(...a);

  const ensure = (sid: string) => { run('INSERT OR IGNORE INTO students(id, created) VALUES(?, ?)', sid, Date.now()); };

  // ---- courses: every subject without a built-in bank is a per-learner course whose syllabus the AI (or the learner) writes ----
  const cache = new Map<string, Course>();
  const readCourse = (id: string): Course | null => {
    const hit = cache.get(id);
    if (hit) return hit;
    const r = one('SELECT * FROM courses WHERE id = ?', id);
    if (!r) return null;
    const c: Course = { id: r.id, student: r.student, level: r.level, subject: r.subject, source: r.source, text: r.text ?? '', concepts: JSON.parse(r.concepts), next: r.next };
    cache.set(id, c);
    return c;
  };
  /** Resolve the subject header. `sid` null = class-wide (teacher) view, which may read any course. */
  const subj = (sid: string | null, x: unknown): string => {
    if (typeof x === 'string' && isBuiltIn(x)) return x;
    if (typeof x === 'string' && /^x[0-9a-f]{8}$/.test(x)) {
      const c = readCourse(x);
      if (c && (sid === null || c.student === sid)) return x;
      throw new HttpError(404, 'That subject was not found. Choose your class and subject again.');
    }
    return 'physics';
  };
  const fullCs = (sub: string): Concept[] => (isBuiltIn(sub) ? conceptsOf(sub) : readCourse(sub)?.concepts ?? []);
  const offSet = (sid: string) => new Set(all('SELECT concept FROM topic_off WHERE student = ?', sid).map((r) => r.concept as string));
  /** The learner's active syllabus: topics they switched off ("not in my syllabus") are excluded everywhere. */
  const csOf = (sid: string, sub: string): Concept[] => { const off = offSet(sid); return fullCs(sub).filter((c) => !off.has(c.id)); };
  const conceptById = (id: string): Concept | undefined => CONCEPTS.find((c) => c.id === id) ?? readCourse(id.split('.')[0])?.concepts.find((c) => c.id === id);
  const cname = (id: string) => conceptById(id)?.name ?? id;
  const miscOf = (id: string): { name: string; fix: string } | undefined => MISC[id] ?? (one('SELECT name, fix FROM dmisc WHERE id = ?', id) as { name: string; fix: string } | undefined);
  const registerMisc = (name: string, fix: string) => {
    const id = 'd_' + createHash('sha1').update(norm(name)).digest('hex').slice(0, 10);
    run('INSERT OR IGNORE INTO dmisc(id, name, fix) VALUES(?,?,?)', id, name, fix);
    return id;
  };
  const ctxOf = (sub: string) => { const c = readCourse(sub); return { level: c?.level ?? '', subject: c?.subject ?? '' }; };

  const masteryMap = (sid: string, sub = 'physics'): MM => {
    const mm: MM = {};
    const ids = new Set(csOf(sid, sub).map((c) => c.id));
    for (const r of all('SELECT * FROM mastery WHERE student = ?', sid)) if (ids.has(r.concept)) mm[r.concept] = { p: r.p, n: r.n, correct: r.correct, ivl: r.ivl, ease: r.ease, due: r.due, updated: r.updated };
    return mm;
  };

  const getQ = (sid: string, id: string): Q | null => {
    const b = BANK.find((q) => q.id === id);
    if (b) return b;
    const r = one('SELECT json FROM aiq WHERE id = ? AND student = ?', id, sid);
    return r ? (JSON.parse(r.json) as Q) : null;
  };
  const pub = (q: Q) => ({ id: q.id, concept: q.c, conceptName: cname(q.c), difficulty: q.d, text: q.q, source: q.src, options: shuffle(q.o.map((t, k) => ({ k, t }))) });

  function profile(sid: string) {
    ensure(sid);
    const s = one('SELECT * FROM students WHERE id = ?', sid);
    return { name: s.name, level: s.level, className: s.class_name, goal: s.goal, examDate: s.exam_date, hours: s.hours, unavailable: JSON.parse(s.unavailable) as string[] };
  }
  function saveProfile(sid: string, b: any) {
    ensure(sid);
    if (typeof b?.name !== 'string' || b.name.length > 80) throw bad('Name must be text up to 80 characters.');
    if (!['school', 'college'].includes(b.level)) throw bad('Level must be school or college.');
    if (typeof b.className !== 'string' || b.className.length > 80) throw bad('Class or course must be text up to 80 characters.');
    if (typeof b.goal !== 'string' || b.goal.length > 200) throw bad('Goal must be text up to 200 characters.');
    if (b.examDate !== null && b.examDate !== '' && !isDate(b.examDate)) throw bad('Exam date must be YYYY-MM-DD.');
    const h = Number(b.hours);
    if (!(h >= 0.5 && h <= 12)) throw bad('Daily hours must be between 0.5 and 12.');
    run('UPDATE students SET name=?, level=?, class_name=?, goal=?, exam_date=?, hours=? WHERE id=?', b.name.trim(), b.level, b.className.trim(), b.goal.trim(), b.examDate || null, h, sid);
    return profile(sid);
  }

  async function submit(sid: string, b: any) {
    ensure(sid);
    const q = typeof b?.qid === 'string' ? getQ(sid, b.qid) : null;
    if (!q) throw new HttpError(404, 'Unknown question.');
    if (!Number.isInteger(b.choice) || b.choice < 0 || b.choice >= q.o.length) throw bad('Invalid choice.');
    const mode = b.mode === 'diagnostic' ? 'diagnostic' : 'practice';
    const reasoning = typeof b.reasoning === 'string' ? b.reasoning.trim().slice(0, 1000) : '';
    const correct = b.choice === q.a;
    let rOk: boolean | null = null, rMisc: string | null = null, rNote = '';
    const analysed = !!reasoning && aiOn();
    if (analysed) {
      const known = isBuiltIn(subOf(q.c)) ? undefined : Object.fromEntries(Object.values(q.w).map((id) => [id, { name: miscOf(id)?.name ?? id }]));
      const r = await analyseReasoning(q, q.o[b.choice], reasoning, known);
      if (r) { rOk = r.sound; rMisc = r.misconception; rNote = r.note; }
    }
    const misc = (!correct ? q.w[b.choice] : undefined) ?? rMisc ?? null;
    const attempts = one('SELECT COUNT(*) n FROM answers WHERE student = ? AND qid = ?', sid, q.id).n as number;
    const prev = one('SELECT * FROM mastery WHERE student = ? AND concept = ?', sid, q.c);
    const before = prev?.p ?? P0;
    const after = updateMastery(before, correct, q.d, { weight: attempts ? 0.3 : 0.6, reasoningOk: rOk });
    const now = Date.now();
    const sch = schedule(prev ? { ivl: prev.ivl, ease: prev.ease } : null, correct, after, now);
    run(
      `INSERT INTO mastery(student, concept, p, n, correct, ivl, ease, due, updated) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(student, concept) DO UPDATE SET p=excluded.p, n=n+1, correct=correct+excluded.correct, ivl=excluded.ivl, ease=excluded.ease, due=excluded.due, updated=excluded.updated`,
      sid, q.c, after, 1, correct ? 1 : 0, sch.ivl, sch.ease, sch.due, now,
    );
    run('INSERT INTO answers(student, concept, qid, diff, chosen, correct, misc, reasoning, reasoning_ok, p_before, p_after, mode, ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      sid, q.c, q.id, q.d, b.choice, correct ? 1 : 0, misc, reasoning || null, rOk === null ? null : rOk ? 1 : 0, before, after, mode, now);
    const concept = conceptById(q.c) ?? { id: q.c, name: q.c, unit: '', pre: [], s: '' };
    return {
      correct, correctText: q.o[q.a], concept: q.c, conceptName: concept.name, pBefore: before, pAfter: after,
      misconception: misc && miscOf(misc) ? { id: misc, ...miscOf(misc)! } : null,
      explanation: q.exp ?? null,
      reasoning: { analysed, sound: rOk, note: rNote },
      prerequisites: correct ? [] : concept.pre.map(cname),
      dueAt: sch.due, repeated: attempts > 0,
    };
  }

  /** Diagnostic questions already written for this learner (AI-written ones are stored per learner and reused until answered). */
  const storedDiag = (sid: string): Q[] => all("SELECT json FROM aiq WHERE student = ? AND id LIKE 'dg-%' ORDER BY ts DESC", sid).map((r) => JSON.parse(r.json) as Q);

  function diagnostic(sid: string, sub = 'physics') {
    ensure(sid); sub = subj(sid, sub);
    const cs = csOf(sid, sub), ids = new Set(cs.map((c) => c.id));
    const done = new Set(all("SELECT DISTINCT concept FROM answers WHERE student = ? AND mode = 'diagnostic'", sid).map((r) => r.concept as string).filter((c) => ids.has(c)));
    const pending = cs.filter((c) => !done.has(c.id));
    let qs: Q[];
    if (isBuiltIn(sub)) qs = BANK.filter((q) => q.d === 2 && ids.has(q.c) && !done.has(q.c));
    else { const have = storedDiag(sid), seen = new Set<string>(); qs = []; for (const c of pending) { const q = have.find((x) => x.c === c.id); if (q && !seen.has(c.id)) { seen.add(c.id); qs.push(q); } } }
    return { total: cs.length, answered: done.size, pending: pending.length, questions: qs.map(pub) };
  }

  /** Make sure every pending topic of an AI course has a diagnostic question. Shared between concurrent callers. */
  const inflight = new Map<string, Promise<void>>();
  function prepareDiagnostic(sid: string, sub = 'physics'): Promise<void> {
    ensure(sid); sub = subj(sid, sub);
    if (isBuiltIn(sub)) return Promise.resolve();
    const key = sid + sub, hit = inflight.get(key);
    if (hit) return hit;
    const p = (async () => {
      const d = diagnostic(sid, sub);
      const have = new Set(d.questions.map((q) => q.concept));
      const need = csOf(sid, sub).filter((c) => !have.has(c.id) && diagnostic(sid, sub).questions.every((q) => q.concept !== c.id)).filter((c) => !all("SELECT 1 FROM answers WHERE student=? AND concept=? AND mode='diagnostic' LIMIT 1", sid, c.id).length);
      if (!need.length) return;
      if (!aiOn()) throw new HttpError(503, AI_OFF);
      const ctx = ctxOf(sub);
      const chunks = (a: Concept[]) => Array.from({ length: Math.ceil(a.length / 5) }, (_, i) => a.slice(i * 5, i * 5 + 5));
      const got = new Set<string>();
      let firstErr: unknown = null;
      for (let pass = 0; pass < 2; pass++) {
        const todo = need.filter((c) => !got.has(c.id));
        if (!todo.length) break;
        // allSettled: one busy or failed batch must not throw away the batches that worked.
        const res = await Promise.allSettled(chunks(todo).map((ch) => generateQuestions(ctx, ch, 2)));
        for (const r of res) if (r.status === 'rejected') { firstErr ??= r.reason; console.error('AI diagnostic batch failed:', r.reason instanceof Error ? r.reason.message : r.reason); }
        for (const g of res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))) {
          if (got.has(g.c)) continue;
          got.add(g.c);
          const w: Record<number, string> = {};
          for (const [k, v] of Object.entries(g.w)) w[Number(k)] = registerMisc(v.name, v.fix);
          const q: Q = { id: 'dg-' + randomUUID().slice(0, 12), c: g.c, d: 2, q: g.q, o: g.o, a: g.a, w, src: 'ai', exp: g.exp };
          run('INSERT INTO aiq(id, student, json, ts) VALUES(?,?,?,?)', q.id, sid, JSON.stringify(q), Date.now());
        }
        if (!got.size && firstErr) break; // nothing worked (bad key, quota, ...): a second pass would only wait again
      }
      if (!got.size) throw new HttpError(502, firstErr ? explainAiError(firstErr) : 'The AI could not write the test just now. Please try again in a moment.');
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function practiceNext(sid: string, o: { ai: boolean; concept?: string; subject?: string }) {
    ensure(sid);
    const sub = subj(sid, o.subject), cs = csOf(sid, sub);
    const mm = masteryMap(sid, sub);
    if (o.concept && !cs.some((c) => c.id === o.concept)) throw bad('Unknown concept for this subject.');
    const target = o.concept ? { id: o.concept, reason: 'Chosen from your revision list.' } : chooseTarget(mm, cs);
    const p = mm[target.id]?.p ?? P0;
    const d = difficultyFor(p);
    const lastMisc = one('SELECT misc FROM answers WHERE student=? AND concept=? AND correct=0 AND misc IS NOT NULL ORDER BY id DESC LIMIT 1', sid, target.id)?.misc as string | undefined;
    const head = { target: { id: target.id, name: cname(target.id), p: mm[target.id]?.p ?? null, reason: target.reason }, difficulty: d, followUp: lastMisc ? miscOf(lastMisc)?.name ?? null : null };
    if (!isBuiltIn(sub)) {
      // AI course: there is no stored bank, so every practice question is written fresh by the AI for this concept and level.
      if (!aiOn()) throw new HttpError(503, AI_OFF);
      const concept = cs.find((c) => c.id === target.id)!;
      const avoid = all('SELECT qid FROM answers WHERE student=? AND concept=? ORDER BY id DESC LIMIT 5', sid, target.id).map((r) => getQ(sid, r.qid)?.q).filter(Boolean) as string[];
      let g: Awaited<ReturnType<typeof generateQuestions>>[number] | undefined;
      try { g = (await generateQuestions(ctxOf(sub), [concept], d, { avoid, misc: lastMisc ? miscOf(lastMisc)?.name ?? null : null }))[0]; }
      catch (e) { console.error('AI practice question failed:', e instanceof Error ? e.message : e); throw new HttpError(502, explainAiError(e)); }
      if (!g) throw new HttpError(502, 'The AI did not return a usable question. Please try again.');
      const w: Record<number, string> = {};
      for (const [k, v] of Object.entries(g.w)) w[Number(k)] = registerMisc(v.name, v.fix);
      const q: Q = { id: 'ai-' + randomUUID().slice(0, 12), c: target.id, d, q: g.q, o: g.o, a: g.a, w, src: 'ai', exp: g.exp };
      run('INSERT INTO aiq(id, student, json, ts) VALUES(?,?,?,?)', q.id, sid, JSON.stringify(q), Date.now());
      return { ...head, question: pub(q), repeated: false, note: 'AI-generated practice question, not a past-year question.' };
    }
    if (o.ai && aiOn()) {
      const g = await generateQuestion(target.id, cname(target.id), d, lastMisc ?? null, SUBJECTS.find((x) => x.id === sub)!);
      if (g) {
        const q: Q = { ...g, id: 'ai-' + randomUUID().slice(0, 12), c: target.id, src: 'ai' };
        run('INSERT INTO aiq(id, student, json, ts) VALUES(?,?,?,?)', q.id, sid, JSON.stringify(q), Date.now());
        return { ...head, question: pub(q), repeated: false, note: 'AI-generated practice question, not a past-year question.' };
      }
    }
    const hist = all('SELECT qid, correct FROM answers WHERE student=? AND concept=? ORDER BY id DESC', sid, target.id);
    const lastQ = hist[0]?.qid;
    const score = (q: Q) => {
      const h = hist.filter((x) => x.qid === q.id);
      return (h.length ? 0 : 10) - 4 * h.filter((x) => x.correct).length - (q.id === lastQ ? 5 : 0) - 3 * Math.abs(q.d - d) + (lastMisc && Object.values(q.w).includes(lastMisc) ? 6 : 0);
    };
    const best = BANK.filter((q) => q.c === target.id).sort((a, b) => score(b) - score(a))[0];
    const repeated = hist.some((x) => x.qid === best.id);
    return { ...head, question: pub(best), repeated, note: repeated ? 'Question bank exhausted for this concept, so this repeats an earlier question and counts at half weight. Turn on AI questions for fresh ones.' : null };
  }

  function model(sid: string, sub = 'physics') {
    ensure(sid); sub = subj(sid, sub);
    const mm = masteryMap(sid, sub), now = Date.now(), cs = csOf(sid, sub);
    const concepts = cs.map((c) => {
      const m = mm[c.id];
      return { ...c, pre: c.pre.filter((x) => cs.some((y) => y.id === x)), assessed: !!m, p: m?.p ?? null, n: m?.n ?? 0, correct: m?.correct ?? 0, due: m?.due ?? null, risk: m ? forgetRisk(m, now) : null };
    });
    const weak = weakList(mm, cs).map((w) => ({ id: w.id, name: cname(w.id), p: w.p, score: w.score, weakPrereqs: w.weakPre.map((x) => ({ id: x, name: cname(x), assessed: !!mm[x] })) }));
    const history = all('SELECT concept, diff, correct, misc, p_before, p_after, mode, ts FROM answers WHERE student=? ORDER BY id DESC LIMIT 400', sid)
      .filter((r) => subOf(r.concept) === sub).slice(0, 25).map((r) => ({ concept: cname(r.concept), diff: r.diff, correct: !!r.correct, misconception: r.misc ? miscOf(r.misc)?.name : null, pBefore: r.p_before, pAfter: r.p_after, mode: r.mode, ts: r.ts }));
    return { concepts, weak, history };
  }

  function dashboard(sid: string, sub = 'physics') {
    sub = subj(sid, sub);
    const m = model(sid, sub), cs = csOf(sid, sub);
    const a = (() => { const r = all('SELECT concept, correct FROM answers WHERE student=?', sid).filter((x) => cs.some((c) => c.id === x.concept)); return { n: r.length, c: r.reduce((t, x) => t + x.correct, 0) }; })();
    const assessed = m.concepts.filter((c) => c.assessed);
    const diag = diagnostic(sid, sub);
    const dueNow = assessed.filter((c) => c.due! <= Date.now()).length;
    return {
      subject: sub, assessed: assessed.length, total: cs.length, answers: a.n, accuracy: a.n ? a.c / a.n : null,
      avg: assessed.length ? assessed.reduce((s, c) => s + c.p!, 0) / assessed.length : null,
      diagnosticDone: diag.pending === 0, diagnosticAnswered: diag.answered, dueNow,
      next: chooseTarget(masteryMap(sid, sub), cs), nextName: cname(chooseTarget(masteryMap(sid, sub), cs).id), notifications: notifications(sid, sub),
    };
  }

  function mistakes(sid: string, sub = 'physics') {
    ensure(sid);
    return all('SELECT qid, chosen, misc, concept, ts FROM answers WHERE student=? AND correct=0 ORDER BY id DESC LIMIT 400', sid).filter((r) => subOf(r.concept) === subj(sid, sub)).slice(0, 100).map((r) => {
      const q = getQ(sid, r.qid);
      return { ts: r.ts, concept: cname(r.concept), question: q?.q ?? '(question unavailable)', chosen: q?.o[r.chosen] ?? '', correct: q?.o[q.a] ?? '', misconception: r.misc ? { name: miscOf(r.misc)?.name, fix: miscOf(r.misc)?.fix } : null, explanation: q?.exp ?? null };
    });
  }

  function revision(sid: string, sub = 'physics') {
    ensure(sid); sub = subj(sid, sub);
    const now = Date.now(), mm = masteryMap(sid, sub);
    return csOf(sid, sub).filter((c) => mm[c.id]).map((c) => {
      const m = mm[c.id];
      return { id: c.id, name: c.name, p: m.p, due: m.due, ivlDays: m.ivl, risk: forgetRisk(m, now), isDue: m.due <= now, reviews: m.n };
    }).sort((a, b) => a.due - b.due);
  }

  function roadmap(sid: string, sub = 'physics') {
    sub = subj(sid, sub);
    const p = profile(sid);
    if (!p.examDate) return { needsExam: true as const };
    const today = new Date(iso(new Date()) + 'T00:00:00Z');
    const r = buildRoadmap(masteryMap(sid, sub), { cs: csOf(sid, sub), today, exam: new Date(p.examDate + 'T00:00:00Z'), hours: p.hours, unavailable: p.unavailable });
    return { needsExam: false as const, examDate: p.examDate, hours: p.hours, unavailable: p.unavailable, ...r };
  }
  function markUnavailable(sid: string, date: unknown, sub = 'physics') {
    if (!isDate(date)) throw bad('Date must be YYYY-MM-DD.');
    const p = profile(sid);
    const today = iso(new Date());
    const list = [...new Set([...p.unavailable, date])].filter((d) => d >= today).sort().slice(0, 60);
    run('UPDATE students SET unavailable=? WHERE id=?', JSON.stringify(list), sid);
    return roadmap(sid, sub);
  }

  function notifications(sid: string, sub = 'physics') {
    const out: { kind: string; title: string; body: string; tab: string }[] = [];
    const rev = revision(sid, sub).filter((r) => r.isDue);
    const last = one('SELECT MAX(ts) t FROM answers WHERE student=?', sid)?.t as number | null;
    const p = profile(sid);
    if (!last) out.push({ kind: 'start', title: 'Take the diagnostic test', body: 'Your plan and practice are built from it.', tab: 'diagnostic' });
    if (rev.length) out.push({ kind: 'revision', title: `${rev.length} concept${rev.length > 1 ? 's' : ''} due for revision`, body: rev.slice(0, 4).map((r) => r.name).join(', '), tab: 'revision' });
    if (last && Date.now() - last > DAY) out.push({ kind: 'missed', title: 'Missed session', body: `No practice for ${Math.floor((Date.now() - last) / DAY)} day(s). A short session today keeps revision on schedule.`, tab: 'practice' });
    if (p.examDate) {
      const d = Math.ceil((Date.parse(p.examDate + 'T00:00:00Z') - Date.now()) / DAY);
      if (d >= 0 && d <= 14) out.push({ kind: 'exam', title: `Exam in ${d} day${d === 1 ? '' : 's'}`, body: 'Check the roadmap and weak concepts.', tab: 'roadmap' });
    }
    return out;
  }

  function addPyq(sid: string, b: any, sub = 'physics') {
    ensure(sid);
    if (!csOf(sid, subj(sid, sub)).some((c) => c.id === b?.concept)) throw bad('Pick a concept from the current subject.');
    const year = Number(b.year), marks = Number(b.marks || 0);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw bad('Year must be between 1990 and 2100.');
    if (!Number.isInteger(marks) || marks < 0 || marks > 20) throw bad('Marks must be 0 to 20.');
    if (typeof b.text !== 'string' || b.text.trim().length < 5 || b.text.length > 1000) throw bad('Question text must be 5 to 1000 characters.');
    run('INSERT INTO pyqs(student, concept, year, marks, text, ts) VALUES(?,?,?,?,?,?)', sid, b.concept, year, marks, b.text.trim(), Date.now());
    return pyqs(sid, sub);
  }
  function pyqs(sid: string, sub = 'physics') {
    ensure(sid); sub = subj(sid, sub);
    const items = all('SELECT id, concept, year, marks, text FROM pyqs WHERE student=? ORDER BY year DESC, id DESC', sid).filter((r) => subOf(r.concept) === sub).map((r) => ({ ...r, conceptName: cname(r.concept), source: 'PYQ (entered by you)' }));
    const stats = csOf(sid, sub).map((c) => ({ id: c.id, name: c.name, count: items.filter((i) => i.concept === c.id).length, marks: items.filter((i) => i.concept === c.id).reduce((s, i) => s + i.marks, 0) })).filter((s) => s.count);
    return { items, stats: stats.sort((a, b) => b.marks - a.marks || b.count - a.count) };
  }

  /** Class-wide view. Reads only mastery and answer aggregates; never chat text or written reasoning. */
  function teacher(sub = 'physics') {
    sub = subj(null, sub);
    const rows = all('SELECT student, concept, p FROM mastery').filter((r) => subOf(r.concept) === sub);
    const studs = all('SELECT id, name FROM students ORDER BY created').filter((x) => rows.some((r) => r.student === x.id));
    const concepts = fullCs(sub).map((c) => {
      const r = rows.filter((x) => x.concept === c.id);
      const weak = r.filter((x) => x.p < 0.5).length;
      return { id: c.id, name: c.name, unit: c.unit, assessed: r.length, avg: r.length ? r.reduce((s, x) => s + x.p, 0) / r.length : null, weakShare: r.length ? weak / r.length : null, weak };
    });
    const misconceptions = (() => {
      const g = new Map<string, { n: number; st: Set<string> }>();
      for (const r of all('SELECT misc, concept, student FROM answers WHERE misc IS NOT NULL')) if (subOf(r.concept) === sub) { const e = g.get(r.misc) ?? { n: 0, st: new Set<string>() }; e.n++; e.st.add(r.student); g.set(r.misc, e); }
      return [...g.entries()].sort((x, y) => y[1].st.size - x[1].st.size || y[1].n - x[1].n).slice(0, 10).map(([m, e]) => ({ name: miscOf(m)?.name ?? m, fix: miscOf(m)?.fix ?? '', students: e.st.size, times: e.n }));
    })();
    const students = studs.map((s, i) => {
      const r = rows.filter((x) => x.student === s.id);
      const low = [...r].sort((a, b) => a.p - b.p)[0];
      const weakTopics = r.filter((x) => x.p < 0.5).sort((a, b) => a.p - b.p).map((x) => cname(x.concept));
      return { label: s.name || `Learner ${i + 1}`, assessed: r.length, avg: r.reduce((t, x) => t + x.p, 0) / r.length, weakest: low ? cname(low.concept) : null, weakTopics: weakTopics.slice(0, 5), needsHelp: weakTopics.length > 0 };
    });
    return { students: students.length, concepts, gaps: concepts.filter((c) => c.assessed && c.weakShare! >= 0.4).sort((a, b) => b.weakShare! - a.weakShare!), misconceptions, studentList: students };
  }

  const chatContext = (sid: string, sub = 'physics') => {
    sub = subj(sid, sub);
    const cs = csOf(sid, sub);
    const w = weakList(masteryMap(sid, sub), cs).slice(0, 3).map((x) => cname(x.id));
    const c = readCourse(sub);
    return (c ? `The student studies ${c.level} ${c.subject}. Their syllabus topics: ${cs.map((x) => x.name).slice(0, 45).join('; ')}. Stay within this syllabus. ` : '') + (w.length ? `The student's weakest concepts right now: ${w.join(', ')}.` : '');
  };

  /** Delete one subject's progress (or all subjects with 'all'). The profile and syllabus are kept. */
  function resetProgress(sid: string, sub: string) {
    ensure(sid);
    const every = sub === 'all', sb = every ? '' : subj(sid, sub);
    const inScope = (cid: string) => every || subOf(cid) === sb;
    for (const t of ['mastery', 'answers', 'pyqs']) for (const r of all(`SELECT DISTINCT concept FROM ${t} WHERE student = ?`, sid)) if (inScope(r.concept)) run(`DELETE FROM ${t} WHERE student = ? AND concept = ?`, sid, r.concept);
    const keep = new Set(BANK.map((q) => q.id));
    for (const r of all('SELECT id, json FROM aiq WHERE student = ?', sid)) if (!keep.has(r.id) && inScope(JSON.parse(r.json).c)) run('DELETE FROM aiq WHERE id = ?', r.id);
    return { reset: every ? 'all subjects' : sb };
  }

  // ---- AI courses and the editable syllabus ----
  const courseSubject = (c: Course) => ({ id: c.id, name: c.subject, level: /college|ug|pg|bachelor|master/i.test(c.level) ? 'college' : 'school', syllabus: c.level, custom: true });
  const listCourses = (sid: string) => all('SELECT id FROM courses WHERE student = ? ORDER BY updated DESC', sid).map((r) => courseSubject(readCourse(r.id)!));

  async function buildTopics(level: string, subject: string, text: string): Promise<{ topics: Topic[]; source: string }> {
    if (aiOn()) {
      let t: Topic[] | null = null, why = '';
      try { t = await generateSyllabus(level, subject, text || undefined); }
      catch (e) { console.error('AI syllabus failed:', e instanceof Error ? e.message : e); why = explainAiError(e); }
      if (t) return { topics: t, source: text ? 'Your syllabus, organised by AI' : 'Written by AI for this class and subject' };
      if (!text) throw new HttpError(502, why || 'The AI answered, but not in a form that could be used as a syllabus. Please try again, or paste your own syllabus.');
    }
    if (text) {
      const t = parseSyllabusText(text);
      if (t.length >= 2) return { topics: t, source: 'Your syllabus (read from your text, AI off)' };
      throw bad('I could not find at least two topics in that text. Put one topic per line (headings can end with a colon).');
    }
    throw new HttpError(503, AI_OFF);
  }
  /** Build concepts from topics. A topic whose name already exists keeps its id, so progress survives a syllabus update. */
  function toConcepts(courseId: string, topics: Topic[], prev: Concept[], next: number) {
    const byName = new Map(prev.map((c) => [norm(c.name), c.id]));
    let n = next;
    const ids = topics.map((t) => byName.get(norm(t.name)) ?? `${courseId}.k${n++}`);
    const idOf = new Map(topics.map((t, i) => [norm(t.name), ids[i]]));
    const concepts: Concept[] = topics.map((t, i) => ({
      id: ids[i], name: t.name, unit: t.unit, s: courseId,
      pre: [...new Set(t.requires.map((r) => idOf.get(norm(r))).filter((x): x is string => !!x && x !== ids[i] && ids.indexOf(x) < i))],
    }));
    return { concepts, next: n };
  }

  async function createCourse(sid: string, b: any) {
    ensure(sid);
    const level = typeof b?.level === 'string' ? b.level.trim().slice(0, 80) : '', subject = typeof b?.subject === 'string' ? b.subject.trim().slice(0, 60) : '';
    if (!level || !subject) throw bad('Choose a class or level and a subject.');
    const text = typeof b.syllabus === 'string' ? b.syllabus.trim().slice(0, 12000) : '';
    const old = one('SELECT id FROM courses WHERE student = ? AND lower(level) = lower(?) AND lower(subject) = lower(?)', sid, level, subject);
    if (old && !text) return courseSubject(readCourse(old.id)!);
    const { topics, source } = await buildTopics(level, subject, text);
    const now = Date.now();
    if (old) { saveCourse(readCourse(old.id)!, topics, source, text); return courseSubject(readCourse(old.id)!); }
    const id = 'x' + randomBytes(4).toString('hex');
    const { concepts, next } = toConcepts(id, topics, [], 1);
    run('INSERT INTO courses(id, student, level, subject, source, text, concepts, next, created, updated) VALUES(?,?,?,?,?,?,?,?,?,?)', id, sid, level, subject, source, text, JSON.stringify(concepts), next, now, now);
    return courseSubject(readCourse(id)!);
  }
  function saveCourse(c: Course, topics: Topic[], source: string, text: string) {
    const { concepts, next } = toConcepts(c.id, topics, c.concepts, c.next);
    run('UPDATE courses SET concepts = ?, next = ?, source = ?, text = ?, updated = ? WHERE id = ?', JSON.stringify(concepts), next, source, text, Date.now(), c.id);
    cache.delete(c.id);
  }

  function syllabusView(sid: string, sub = 'physics') {
    ensure(sid); sub = subj(sid, sub);
    const off = offSet(sid), cs = fullCs(sub), c = readCourse(sub), sj = SUBJECTS.find((x) => x.id === sub);
    const nameOf = new Map(cs.map((x) => [x.id, x.name]));
    const units: { unit: string; topics: { id: string; name: string; on: boolean; requires: string[] }[] }[] = [];
    for (const x of cs) {
      let u = units.find((y) => y.unit === x.unit);
      if (!u) units.push((u = { unit: x.unit, topics: [] }));
      u.topics.push({ id: x.id, name: x.name, on: !off.has(x.id), requires: x.pre.map((p) => nameOf.get(p) ?? p) });
    }
    return {
      id: sub, subject: c?.subject ?? sj?.name ?? '', level: c?.level ?? sj?.syllabus ?? '', custom: !!c,
      source: c?.source ?? 'Built-in syllabus (Class 10 CBSE)', text: c?.text ?? '',
      total: cs.length, active: cs.filter((x) => !off.has(x.id)).length, units,
    };
  }
  /** "Some of my syllabus is deleted": the learner ticks the topics that ARE in their exam; the rest vanish from tests, plan and practice. */
  function setTopics(sid: string, sub: string, offIds: unknown) {
    ensure(sid); sub = subj(sid, sub);
    const ids = new Set(fullCs(sub).map((c) => c.id));
    if (!Array.isArray(offIds)) throw bad('Send the list of topics to leave out.');
    const off = [...new Set(offIds.filter((x): x is string => typeof x === 'string' && ids.has(x)))];
    if (ids.size - off.length < 1) throw bad('Keep at least one topic in your syllabus.');
    for (const id of ids) run('DELETE FROM topic_off WHERE student = ? AND concept = ?', sid, id);
    for (const id of off) run('INSERT OR IGNORE INTO topic_off(student, concept) VALUES(?,?)', sid, id);
    return syllabusView(sid, sub);
  }
  /** Replace the syllabus of an AI course with the learner's own text (or regenerate the standard one when text is empty). */
  async function replaceSyllabus(sid: string, sub: string, text: unknown) {
    ensure(sid); sub = subj(sid, sub);
    const c = readCourse(sub);
    if (!c) throw bad('This subject uses the built-in syllabus. Use "my own syllabus" to create an editable one.');
    const t = typeof text === 'string' ? text.trim().slice(0, 12000) : '';
    const { topics, source } = await buildTopics(c.level, c.subject, t);
    saveCourse(c, topics, source, t);
    return syllabusView(sid, sub);
  }
  const concepts = (sid: string, sub = 'physics') => csOf(sid, subj(sid, sub)).map((c) => ({ ...c, pre: c.pre.filter((x) => csOf(sid, subj(sid, sub)).some((y) => y.id === x)) }));

  /** Study Buddy without an AI key: explains from the subject's own concepts, misconceptions and questions. Not AI. */
  function offlineBuddy(sid: string, sub: string, topic: string, msg: string) {
    sub = subj(sid, sub);
    const cs = csOf(sid, sub), mm = masteryMap(sid, sub);
    const course = readCourse(sub);
    const head = 'Study Buddy (offline mode, no AI key: answers come from the built-in syllabus, not an AI).\n\n';
    if (course) {
      const w = weakList(mm, cs).slice(0, 3).map((x) => cname(x.id));
      return head + `${course.subject} (${course.level}). Your topics: ${cs.map((c) => c.name).join('; ')}.` + (w.length ? `\n\nYour weakest right now: ${w.join(', ')}.` : '') + '\n\nTo have a topic explained, quizzed or drawn, add ANTHROPIC_API_KEY or GEMINI_API_KEY on the server.';
    }
    const words = new Set(`${topic} ${msg}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const hit = cs.map((c) => ({ c, n: (c.name.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => words.has(w)).length })).sort((a, b) => b.n - a.n)[0];
    const label = SUBJECTS.find((x) => x.id === sub)!.name;
    if (!hit || !hit.n) {
      const w = weakList(mm, cs).slice(0, 3).map((x) => cname(x.id));
      return head + `Tell me a ${label} topic and I will explain it. Topics: ${cs.map((c) => c.name).join('; ')}.` + (w.length ? `\n\nYour weakest right now: ${w.join(', ')}.` : '');
    }
    const c = hit.c, qs = BANK.filter((q) => q.c === c.id);
    const fixes = [...new Set(qs.flatMap((q) => Object.values(q.w)))].map((id) => `- ${MISC[id].name}: ${MISC[id].fix}`);
    const q = qs[Math.floor(Math.random() * qs.length)];
    const p = mm[c.id]?.p;
    return head + `${c.name} (${c.unit}). ` + (p == null ? 'You have not been assessed on this yet.' : `Your mastery: ${Math.round(p * 100)}%.`) +
      (c.pre.length ? `\nBuild on first: ${c.pre.map(cname).join(', ')}.` : '') +
      (fixes.length ? `\n\nCommon mistakes to avoid:\n${fixes.join('\n')}` : '') +
      `\n\nTry this: ${q.q} Options: ${q.o.join(' / ')}. Reply with your answer and your reasoning, or use the Practice tab to be marked.`;
  }
  return { offlineBuddy, resetProgress, ensure, profile, saveProfile, submit, diagnostic, prepareDiagnostic, practiceNext, model, dashboard, mistakes, revision, roadmap, markUnavailable, notifications, addPyq, pyqs, teacher, chatContext, listCourses, createCourse, syllabusView, setTopics, replaceSyllabus, concepts };
}
export type Service = ReturnType<typeof makeService>;
