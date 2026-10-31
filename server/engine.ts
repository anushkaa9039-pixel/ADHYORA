// Pure adaptive-learning logic: mastery update, spaced repetition, weakness detection, question targeting, roadmap.
import { CONCEPTS, type Concept } from './data.js';
const DEF = CONCEPTS.filter((c) => c.s === 'physics'); // default subject for callers that pass none

export const DAY = 86400000;
export const P0 = 0.3; // prior mastery before any evidence
export type M = { p: number; n: number; correct: number; ivl: number; ease: number; due: number; updated: number };
export type MM = Record<string, M>;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function dependents(id: string, cs: Concept[] = CONCEPTS): number {
  const seen = new Set<string>();
  const walk = (x: string) => { for (const c of cs) if (c.pre.includes(x) && !seen.has(c.id)) { seen.add(c.id); walk(c.id); } };
  walk(id);
  return seen.size;
}

/** Bayesian knowledge tracing step with difficulty-dependent guess/slip, evidence weight and reasoning check. */
export function updateMastery(p: number, correct: boolean, diff: number, o: { weight: number; reasoningOk: boolean | null }): number {
  let g = 0.25 - 0.05 * (diff - 1); // guess: harder questions are harder to guess
  const s = 0.08 + 0.04 * (diff - 1); // slip
  if (correct && o.reasoningOk === false) g = 0.6; // right answer, flawed reasoning: probably luck
  else if (correct && o.reasoningOk === true) g *= 0.5; // right answer, sound reasoning: strong evidence
  const post = correct ? (p * (1 - s)) / (p * (1 - s) + (1 - p) * g) : (p * s) / (p * s + (1 - p) * (1 - g));
  const mixed = p + o.weight * (post - p);
  return clamp(mixed + (1 - mixed) * 0.1 * (correct ? 1 : 0.5), 0.02, 0.98);
}

export function schedule(prev: { ivl: number; ease: number } | null, correct: boolean, p: number, now: number) {
  const ease0 = prev?.ease ?? 2.0;
  const ivl0 = prev?.ivl ?? 0;
  if (!correct) return { ivl: 1 / 48, ease: Math.max(1.3, ease0 - 0.2), due: now + DAY / 48 }; // retry in 30 min
  const ivl = ivl0 < 1 ? 1 : Math.max(1, Math.round(ivl0 * ease0 * (0.6 + p)));
  return { ivl, ease: Math.min(2.8, ease0 + 0.05), due: now + ivl * DAY };
}

export function forgetRisk(m: M, now: number): number {
  const elapsed = Math.max(0, (now - m.updated) / DAY);
  const stability = Math.max(1 / 48, m.ivl) * (0.5 + m.p);
  return 1 - Math.exp(-elapsed / stability);
}

export const difficultyFor = (p: number) => (p < 0.4 ? 1 : p < 0.7 ? 2 : 3);

/** `cs` is the learner's active syllabus (topics they removed are not in it, so they never count as weak or as prerequisites). */
export function weakList(mm: MM, cs: Concept[] = CONCEPTS) {
  const ids = new Set(cs.map((c) => c.id));
  return cs.filter((c) => mm[c.id] && mm[c.id].p < 0.6)
    .map((c) => ({
      id: c.id,
      p: mm[c.id].p,
      score: (1 - mm[c.id].p) * (1 + 0.25 * dependents(c.id, cs)), // weak concepts that block many others rank higher
      weakPre: c.pre.filter((x) => ids.has(x) && (!mm[x] || mm[x].p < 0.5)),
    }))
    .sort((a, b) => b.score - a.score);
}

export function chooseTarget(mm: MM, cs: Concept[] = DEF): { id: string; reason: string } {
  const ids = new Set(cs.map((c) => c.id));
  const name = (id: string) => cs.find((c) => c.id === id)!.name;
  const w = weakList(mm, cs);
  if (w.length) {
    let cur = w[0].id;
    for (let i = 0; i < 10; i++) {
      const pre = cs.find((c) => c.id === cur)!.pre.filter((x) => ids.has(x) && (!mm[x] || mm[x].p < 0.5));
      if (!pre.length) break;
      cur = pre.sort((a, b) => (mm[a]?.p ?? P0) - (mm[b]?.p ?? P0))[0];
    }
    return cur === w[0].id
      ? { id: cur, reason: `Your weakest high-impact concept (${Math.round(w[0].p * 100)}% mastery).` }
      : { id: cur, reason: `${name(w[0].id)} is weak, and it depends on ${name(cur)}, so we start there.` };
  }
  const fresh = cs.find((c) => !mm[c.id]);
  if (fresh) return { id: fresh.id, reason: 'Not assessed yet.' };
  const low = [...cs].sort((a, b) => mm[a.id].p - mm[b.id].p)[0];
  return { id: low.id, reason: 'No weak concepts left, so this stretches your lowest one with harder questions.' };
}

export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Study plan from mastery, free hours and exam date. Every day stays within the daily budget (no overload). */
export function buildRoadmap(mm: MM, o: { today: Date; exam: Date; hours: number; unavailable: string[]; cs?: Concept[] }) {
  const CS = o.cs ?? DEF;
  const un = new Set(o.unavailable);
  const days: { date: string; items: { concept: string; minutes: number }[] }[] = [];
  for (let d = o.today, i = 0; d < o.exam && i < 400; d = addDays(d, 1), i++) if (!un.has(iso(d))) days.push({ date: iso(d), items: [] });
  if (!days.length) return { days: [], weeks: [], months: [], uncovered: 0, totalMinutes: 0 };
  const cap = o.hours * 60 * 0.85; // 15% of every day is left for spaced revision
  const total = days.length * cap;
  const w = CS.map((c) => 1 - (mm[c.id]?.p ?? P0) + 0.15);
  const sw = w.reduce((a, b) => a + b, 0);
  let di = 0, room = cap, uncovered = 0;
  CS.forEach((c, i) => {
    let need = Math.max(15, Math.round((total * w[i]) / sw / 5) * 5);
    while (need > 0) {
      if (di >= days.length) { uncovered += need; break; }
      const take = Math.min(need, room);
      if (take > 0) days[di].items.push({ concept: c.id, minutes: take });
      need -= take; room -= take;
      if (room <= 0) { di++; room = cap; }
    }
  });
  const group = (key: (d: string, i: number) => string) => {
    const g = new Map<string, Record<string, number>>();
    days.forEach((d, i) => { const k = key(d.date, i); const m = g.get(k) ?? {}; d.items.forEach((it) => (m[it.concept] = (m[it.concept] ?? 0) + it.minutes)); g.set(k, m); });
    return [...g.entries()].map(([label, m]) => ({ label, items: Object.entries(m).map(([concept, minutes]) => ({ concept, minutes })) }));
  };
  return {
    days,
    weeks: group((_d, i) => `Week ${Math.floor(i / 7) + 1}`),
    months: group((d) => d.slice(0, 7)),
    uncovered,
    totalMinutes: Math.round(total),
  };
}
