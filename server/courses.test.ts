// Any-subject flow: AI-written syllabus, AI diagnostic and practice, trimmed syllabus. The AI API is mocked (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { makeService, parseSyllabusText } from './service.ts';

const svc = makeService(openDb(':memory:'));
const calls = { syllabus: 0, questions: 0 };
const ENGLISH = [
  { name: 'Reading: Prose', topics: [{ name: 'Comprehension of unseen passages', requires: [] }, { name: 'Inference and tone', requires: ['Comprehension of unseen passages'] }] },
  { name: 'Grammar', topics: [{ name: 'Tenses', requires: [] }, { name: 'Reported speech', requires: ['Tenses'] }, { name: 'Modals', requires: [] }] },
  { name: 'Writing', topics: [{ name: 'Formal letters', requires: ['Tenses', 'Nonexistent topic'] }] },
];
function mockAi(on = true) {
  if (!on) { delete process.env.ANTHROPIC_API_KEY; return; }
  process.env.ANTHROPIC_API_KEY = 'test-key';
  globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
    const b = JSON.parse(init.body), user: string = b.messages[b.messages.length - 1].content;
    let out: unknown;
    if (b.system.includes('curriculum designer')) {
      calls.syllabus++;
      out = user.includes('Syllabus supplied') ? { units: [{ name: 'Mine', topics: [{ name: 'Tenses', requires: [] }, { name: 'Poetry: The Road Not Taken', requires: ['Tenses'] }] }] } : { units: ENGLISH };
    } else if (b.system.includes('multiple-choice exam questions')) {
      calls.questions++;
      const ids = [...user.matchAll(/^(x[0-9a-f]{8}\.k\d+): (.+?) \(unit/gm)].map((m) => ({ id: m[1], name: m[2] }));
      out = { questions: ids.map((c) => ({ concept: c.id, q: `Which is right about ${c.name}?`, o: ['right answer', 'wrong one', 'wrong two', 'wrong three'], a: 0, w: { 1: { name: `Confuses ${c.name} with its opposite`, fix: 'Re-read the rule.' }, 2: { name: 'Overgeneralises the rule', fix: 'Rules have exceptions.' } }, exp: 'Because.' })) };
    } else out = { sound: false, misconception: null, note: 'Check your working.' };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }] }), { status: 200 });
  }) as typeof fetch;
}
const S = 'learner-eng-00001', T = 'learner-other-02';
let course = '';

test('any subject: AI writes the syllabus, valid prerequisites only', async () => {
  mockAi();
  const c = await svc.createCourse(S, { level: 'Class 8', subject: 'English' });
  course = c.id;
  assert.match(course, /^x[0-9a-f]{8}$/);
  const v = svc.syllabusView(S, course);
  assert.equal(v.custom, true);
  assert.equal(v.total, 6);
  assert.deepEqual(v.units.map((u) => u.unit), ['Reading: Prose', 'Grammar', 'Writing']);
  const letters = v.units[2].topics[0];
  assert.deepEqual(letters.requires, ['Tenses'], 'unknown prerequisite dropped');
  assert.equal((await svc.createCourse(S, { level: 'class 8', subject: 'english' })).id, course, 'same class+subject reopens the same course');
  assert.equal(calls.syllabus, 1);
  assert.deepEqual(svc.listCourses(S).map((x) => x.name), ['English']);
  assert.deepEqual(svc.listCourses(T), [], 'courses are private to the learner');
  assert.throws(() => svc.syllabusView(T, course), /not found/);
});

test('AI diagnostic covers every topic, hides answers, tracks misconceptions, practice is AI-written', async () => {
  await svc.prepareDiagnostic(S, course);
  const d = svc.diagnostic(S, course);
  assert.equal(d.questions.length, 6);
  assert.equal(d.pending, 6);
  assert.ok(d.questions.every((q: any) => !('a' in q) && q.source === 'ai'));
  const wrongOn = new Set(d.questions.filter((q: any) => /Tenses/.test(q.text)).map((q: any) => q.concept));
  let seenMisc = '';
  for (const q of d.questions as any[]) {
    const correctText = 'right answer';
    const opt = q.options.find((o: any) => (wrongOn.has(q.concept) ? o.t === 'wrong one' : o.t === correctText));
    const r = await svc.submit(S, { qid: q.id, choice: opt.k, mode: 'diagnostic' });
    if (!r.correct) seenMisc = r.misconception!.name;
  }
  assert.match(seenMisc, /Confuses Tenses/);
  assert.equal(svc.diagnostic(S, course).pending, 0);
  const m = svc.model(S, course);
  assert.equal(m.concepts.length, 6);
  assert.ok(m.weak.some((w) => w.name === 'Tenses'));
  assert.ok(svc.mistakes(S, course)[0].misconception!.fix);
  const before = calls.questions;
  const next = await svc.practiceNext(S, { ai: false, subject: course });
  assert.equal(next.target.name, 'Tenses', 'targets the weak root topic');
  assert.equal(next.question.source, 'ai');
  assert.equal(calls.questions, before + 1);
  assert.equal(svc.dashboard(S, course).diagnosticDone, true);
  assert.equal(svc.dashboard(S, course).nextName, 'Tenses');
});

test('syllabus trimming: removed topics vanish from test, scores, weakness and plan', async () => {
  const gram = svc.syllabusView(S, course).units[1].topics;
  const v = svc.setTopics(S, course, [gram[0].id]); // leave out Tenses
  assert.equal(v.active, 5);
  assert.ok(!svc.model(S, course).concepts.some((c) => c.name === 'Tenses'));
  assert.ok(!svc.model(S, course).weak.some((w) => w.name === 'Tenses'), 'removed topic no longer counts as weak');
  assert.equal(svc.dashboard(S, course).total, 5);
  const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  svc.saveProfile(S, { name: 'Zed', level: 'school', className: 'Class 8', goal: '', examDate: future, hours: 2 });
  const rm: any = svc.roadmap(S, course);
  assert.ok(rm.days.every((d: any) => d.items.every((i: any) => i.concept !== gram[0].id)));
  assert.throws(() => svc.setTopics(S, course, svc.syllabusView(S, course).units.flatMap((u) => u.topics.map((t) => t.id))), /at least one/);
  assert.equal(svc.setTopics(S, course, []).active, 6, 'can be restored');
});

test('own syllabus replaces the AI one but keeps progress on topics with the same name', async () => {
  const tensesId = svc.syllabusView(S, course).units[1].topics[0].id;
  const v = await svc.replaceSyllabus(S, course, '1. Tenses\n2. Poetry: The Road Not Taken');
  assert.equal(v.total, 2);
  assert.match(v.source, /Your syllabus/);
  assert.equal(v.units[0].topics[0].id, tensesId, 'same name keeps its id');
  assert.ok(svc.model(S, course).concepts.find((c) => c.id === tensesId)!.assessed, 'progress kept');
  const fresh = svc.model(S, course).concepts.find((c) => c.name.startsWith('Poetry'))!;
  assert.equal(fresh.assessed, false);
  await svc.prepareDiagnostic(S, course);
  assert.equal(svc.diagnostic(S, course).questions.length, 1, 'only the new topic needs a question');
});

test('built-in subjects can also leave topics out; other learners are unaffected', async () => {
  const before = svc.diagnostic(T, 'physics').total;
  assert.equal(before, 17);
  svc.setTopics(S, 'physics', ['c9', 'c10']);
  assert.equal(svc.diagnostic(S, 'physics').total, 15);
  assert.ok(svc.diagnostic(S, 'physics').questions.every((q: any) => !['c9', 'c10'].includes(q.concept)));
  assert.equal(svc.diagnostic(T, 'physics').total, 17);
  assert.equal(svc.syllabusView(S, 'physics').custom, false);
  await assert.rejects(svc.replaceSyllabus(S, 'physics', 'x'), /built-in/);
});

test('reset clears an AI course progress and its written tests, keeps the syllabus', async () => {
  svc.resetProgress(S, course);
  assert.equal(svc.dashboard(S, course).answers, 0);
  assert.equal(svc.syllabusView(S, course).total, 2);
  assert.equal(svc.diagnostic(S, course).questions.length, 0, 'old written tests are gone until regenerated');
  await svc.prepareDiagnostic(S, course);
  assert.equal(svc.diagnostic(S, course).questions.length, 2);
});

test('without an AI key: clear errors, and a pasted syllabus still works', async () => {
  mockAi(false);
  await assert.rejects(svc.createCourse(T, { level: 'UG', subject: 'Economics' }), /ANTHROPIC_API_KEY/);
  const c = await svc.createCourse(T, { level: 'UG', subject: 'Economics', syllabus: 'Unit 1: Demand\n- Law of demand\n- Elasticity\nUnit 2: Supply\n- Law of supply; Equilibrium' });
  const v = svc.syllabusView(T, c.id);
  assert.deepEqual(v.units.map((u) => [u.unit, u.topics.length]), [['Unit 1: Demand', 2], ['Unit 2: Supply', 2]]);
  await assert.rejects(svc.prepareDiagnostic(T, c.id), /ANTHROPIC_API_KEY/);
  await assert.rejects(svc.practiceNext(T, { ai: false, subject: c.id }), /ANTHROPIC_API_KEY/);
  assert.match(svc.offlineBuddy(T, c.id, '', 'hi'), /Law of demand/);
  assert.equal(svc.teacher(c.id).concepts.length, 4);
});

test('syllabus text parser', () => {
  const t = parseSyllabusText('# Algebra\n- Linear equations\n- Quadratics; Polynomials\nGeometry:\n1) Triangles\n\nTriangles\nUnit 5: Optics; Lenses; Mirrors');
  assert.deepEqual(t.map((x) => `${x.unit}/${x.name}`), ['Algebra/Linear equations', 'Algebra/Quadratics', 'Algebra/Polynomials', 'Geometry/Triangles', 'Unit 5/Optics', 'Unit 5/Lenses', 'Unit 5/Mirrors']);
});
