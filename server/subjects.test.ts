import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, engineFor } from '../src/subjects.ts';
test('class and subject choices', () => {
  assert.equal(LEVELS.filter((l) => /^Class \d+$/.test(l.label)).length, 12);
  const ug = LEVELS.find((l) => l.id === 'ug')!.subjects, pg = LEVELS.find((l) => l.id === 'pg')!.subjects;
  assert.ok(ug.length && pg.length && !ug.some((s) => pg.includes(s)), 'UG and PG subject lists differ');
  assert.equal(engineFor('c10', 'Physics'), 'physics');
  assert.equal(engineFor('c10', ' mathematics '), 'maths');
  assert.equal(engineFor('c8', 'Physics'), null, 'no Physics content for other classes');
  assert.equal(engineFor('ug', 'Mathematics'), null);
  assert.equal(engineFor('other', 'Astronomy'), null);
});
