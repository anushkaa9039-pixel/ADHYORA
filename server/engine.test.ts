import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMastery, schedule, chooseTarget, weakList, buildRoadmap, forgetRisk, P0, DAY, type MM } from './engine.ts';

const m = (p: number): MM[string] => ({ p, n: 1, correct: 0, ivl: 1, ease: 2, due: 0, updated: 0 });

test('correct raises and wrong lowers mastery; harder correct counts more', () => {
  const up = updateMastery(0.4, true, 2, { weight: 0.6, reasoningOk: null });
  const down = updateMastery(0.4, false, 2, { weight: 0.6, reasoningOk: null });
  assert.ok(up > 0.4 && down < 0.4);
  assert.ok(updateMastery(0.4, true, 3, { weight: 0.6, reasoningOk: null }) > updateMastery(0.4, true, 1, { weight: 0.6, reasoningOk: null }));
});
test('flawed reasoning on a correct answer is treated as luck', () => {
  assert.ok(updateMastery(0.4, true, 2, { weight: 0.6, reasoningOk: false }) < updateMastery(0.4, true, 2, { weight: 0.6, reasoningOk: true }));
});
test('repeat attempts move mastery less', () => {
  const a = updateMastery(0.3, true, 2, { weight: 0.6, reasoningOk: null }) - 0.3;
  const b = updateMastery(0.3, true, 2, { weight: 0.3, reasoningOk: null }) - 0.3;
  assert.ok(b < a);
});
test('spaced repetition: wrong -> retry soon, correct -> growing intervals', () => {
  const now = 1_000_000;
  assert.ok(schedule(null, false, 0.2, now).due - now < DAY / 24);
  const a = schedule(null, true, 0.6, now), b = schedule(a, true, 0.7, now), c = schedule(b, true, 0.8, now);
  assert.ok(a.ivl === 1 && b.ivl > a.ivl && c.ivl > b.ivl);
});
test('forgetting risk grows with elapsed time', () => {
  const x = m(0.6);
  assert.ok(forgetRisk(x, 5 * DAY) > forgetRisk(x, DAY));
});
test('weak concept with weak prerequisite targets the root cause', () => {
  const mm: MM = { c1: m(0.2), c2: m(0.3), c3: m(0.25) }; // c3 -> c2 -> c1 all weak
  assert.equal(chooseTarget(mm).id, 'c1');
  assert.ok(weakList(mm).length === 3);
});
test('unassessed first, then stretch when nothing is weak', () => {
  assert.equal(chooseTarget({}).id, 'c1');
  const all: MM = Object.fromEntries(Array.from({ length: 17 }, (_, i) => ['c' + (i + 1), m(0.8 + i / 1000)]));
  assert.match(chooseTarget(all).reason, /stretch/);
});
test('roadmap never exceeds daily budget and skips unavailable dates', () => {
  const today = new Date('2026-11-01T00:00:00Z'), exam = new Date('2026-12-01T00:00:00Z');
  const r = buildRoadmap({ c1: m(0.1) }, { today, exam, hours: 2, unavailable: ['2026-11-03'] });
  assert.ok(!r.days.some((d) => d.date === '2026-11-03'));
  assert.ok(r.days.every((d) => d.items.reduce((s, i) => s + i.minutes, 0) <= 2 * 60 * 0.85 + 0.001));
  assert.ok(r.weeks.length >= 4 && r.months.length >= 1);
  assert.equal(P0, 0.3);
});
