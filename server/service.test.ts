import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { makeService } from './service.ts';
import { BANK } from './data.ts';

const svc = makeService(openDb(':memory:'));
const A = 'learner-aaaa-1111', B = 'learner-bbbb-2222';

async function answer(sid: string, qid: string, wrong: boolean, mode = 'practice') {
  const q = BANK.find((x) => x.id === qid)!;
  const choice = wrong ? Number(Object.keys(q.w)[0] ?? (q.a + 1) % 4) : q.a;
  return svc.submit(sid, { qid, choice, mode });
}

test('full loop: diagnostic -> model -> weakness -> adaptive -> srs -> teacher', async () => {
  const d = svc.diagnostic(A);
  assert.equal(d.questions.length, 17);
  assert.ok(d.questions.every((q: any) => !('a' in q)), 'correct answer is never sent to the client');
  // A fails the whole electricity unit's basics and one light concept, passes the rest.
  for (const q of d.questions) {
    const wrong = ['c9', 'c10', 'c2'].includes(q.concept);
    await answer(A, q.id, wrong, 'diagnostic');
  }
  assert.equal(svc.diagnostic(A).questions.length, 0);
  const m = svc.model(A);
  assert.ok(m.concepts.every((c) => c.assessed));
  const c9 = m.concepts.find((c) => c.id === 'c9')!, c1 = m.concepts.find((c) => c.id === 'c1')!;
  assert.ok(c9.p! < 0.3 && c1.p! > 0.5, 'mastery reflects answers');
  assert.ok(m.weak.some((w) => w.id === 'c10' && w.weakPrereqs.some((p) => p.id === 'c9')), 'prerequisite difficulty found');
  const next = await svc.practiceNext(A, { ai: false });
  assert.equal(next.target.id, 'c9', 'targets root cause');
  assert.equal(next.difficulty, 1);
  // Misconception detected from the chosen distractor
  const r = await answer(A, 'c10-3', true);
  assert.equal(r.misconception?.id, 'm_r_depends_vi');
  assert.ok(r.pAfter < r.pBefore);
  // Mastery rises with correct answers and the question gets harder
  let p = svc.model(A).concepts.find((c) => c.id === 'c9')!.p!;
  for (const id of ['c9-1', 'c9-2', 'c9-3']) { const x = await answer(A, id, false); assert.ok(x.pAfter > x.pBefore); p = x.pAfter; }
  assert.ok(p > 0.3);
  // Spaced repetition: wrong answer is due soon, correct is pushed out
  const rev = svc.revision(A);
  assert.ok(rev.find((x) => x.id === 'c10')!.due < Date.now() + 3600_000);
  assert.ok(rev.find((x) => x.id === 'c1')!.due > Date.now() + 3600_000);
  assert.ok(svc.mistakes(A).length >= 4);
  // Teacher: class aggregate across two learners
  for (const q of svc.diagnostic(B).questions) await answer(B, q.id, ['c9', 'c10'].includes(q.concept), 'diagnostic');
  const t = svc.teacher();
  assert.equal(t.students, 2);
  assert.ok(t.gaps.some((g) => g.id === 'c9') && t.misconceptions.length > 0);
  assert.ok(!JSON.stringify(t).includes('reasoning'));
});

test('validation and roadmap', async () => {
  await assert.rejects(svc.submit(A, { qid: 'nope', choice: 0 }), /Unknown/);
  await assert.rejects(svc.submit(A, { qid: 'c1-1', choice: 9 }), /Invalid/);
  assert.throws(() => svc.saveProfile(A, { name: 'x', level: 'bad', className: '', goal: '', examDate: null, hours: 2 }));
  assert.equal(svc.roadmap(A).needsExam, true);
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  svc.saveProfile(A, { name: 'Asha', level: 'school', className: 'Class 10', goal: '90%', examDate: future, hours: 2 });
  const r: any = svc.roadmap(A);
  assert.ok(r.days.length >= 29 && r.weeks.length >= 4);
  const day = r.days[1].date;
  const r2: any = svc.markUnavailable(A, day);
  assert.ok(!r2.days.some((d: any) => d.date === day));
  svc.addPyq(A, { concept: 'c10', year: 2023, marks: 3, text: 'State Ohm law and draw its V-I graph.' });
  assert.equal(svc.pyqs(A).items[0].source, 'PYQ (entered by you)');
});

test('subjects are isolated: own diagnostic, mastery, weakness, practice, reset', async () => {
  const C = 'learner-cccc-3333';
  const md = svc.diagnostic(C, 'maths');
  assert.equal(md.total, 6);
  assert.equal(md.questions.length, 6);
  assert.ok(md.questions.every((q: any) => q.concept.startsWith('a') && !('a' in q)), 'only maths questions, no answers sent');
  assert.equal(svc.diagnostic(C, 'physics').questions.length, 17, 'physics diagnostic unaffected');
  for (const q of md.questions) await answer(C, q.id, ['a2', 'a4'].includes(q.concept), 'diagnostic');
  assert.equal(svc.diagnostic(C, 'maths').questions.length, 0);
  assert.equal(svc.diagnostic(C, 'physics').questions.length, 17, 'maths answers do not complete physics');
  const mm = svc.model(C, 'maths');
  assert.equal(mm.concepts.length, 6);
  assert.ok(mm.concepts.every((c) => c.assessed) && mm.history.every((h) => h.mode === 'diagnostic'));
  assert.ok(svc.model(C, 'physics').concepts.every((c) => !c.assessed), 'no physics mastery created');
  assert.equal(svc.dashboard(C, 'physics').answers, 0);
  assert.equal(svc.dashboard(C, 'maths').answers, 6);
  const next = await svc.practiceNext(C, { ai: false, subject: 'maths' });
  assert.ok(next.target.id.startsWith('a') && next.question.concept.startsWith('a'));
  await assert.rejects(svc.practiceNext(C, { ai: false, subject: 'maths', concept: 'c1' }), /Unknown concept/);
  assert.throws(() => svc.addPyq(C, { concept: 'c1', year: 2023, marks: 3, text: 'physics question here' }, 'maths'));
  assert.equal(svc.resetProgress(C, 'maths').reset, 'maths');
  assert.equal(svc.diagnostic(C, 'maths').questions.length, 6, 'reset restores the diagnostic');
  assert.equal(svc.mistakes(C, 'maths').length, 0);
});

test('offline Study Buddy answers from the current subject only', () => {
  const a = svc.offlineBuddy('learner-dddd-4444', 'maths', 'Quadratic equations', 'explain discriminant');
  assert.match(a, /offline mode/); assert.match(a, /Quadratic equations/); assert.match(a, /Discriminant/);
  assert.ok(!/Ohm|lens|mirror/i.test(a));
  assert.match(svc.offlineBuddy('learner-dddd-4444', 'physics', 'Ohm law', ''), /Ohm/);
  assert.match(svc.offlineBuddy('learner-dddd-4444', 'maths', 'hello', 'hi'), /Topics:/);
});

test('teacher insights flag learners and the topics they struggle with', () => {
  const t = svc.teacher('physics');
  const stuck = t.studentList.filter((s) => s.weakTopics.includes('Charge, current and potential difference'));
  assert.equal(stuck.length, 1, 'only the learner still weak on it (B) is flagged; A recovered through practice');
  assert.ok(stuck[0].needsHelp);
  assert.ok(t.studentList.every((s) => typeof s.needsHelp === 'boolean' && Array.isArray(s.weakTopics)));
  assert.ok(t.gaps.some((g) => g.name.startsWith('Charge')));
});
