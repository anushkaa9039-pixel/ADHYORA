import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, name TEXT DEFAULT '', level TEXT DEFAULT 'school', class_name TEXT DEFAULT '', goal TEXT DEFAULT '', exam_date TEXT, hours REAL DEFAULT 2, unavailable TEXT DEFAULT '[]', created INTEGER);
CREATE TABLE IF NOT EXISTS mastery(student TEXT, concept TEXT, p REAL, n INTEGER, correct INTEGER, ivl REAL, ease REAL, due INTEGER, updated INTEGER, PRIMARY KEY(student, concept));
CREATE TABLE IF NOT EXISTS answers(id INTEGER PRIMARY KEY AUTOINCREMENT, student TEXT, concept TEXT, qid TEXT, diff INTEGER, chosen INTEGER, correct INTEGER, misc TEXT, reasoning TEXT, reasoning_ok INTEGER, p_before REAL, p_after REAL, mode TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS ix_answers_student ON answers(student, ts);
CREATE TABLE IF NOT EXISTS aiq(id TEXT PRIMARY KEY, student TEXT, json TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY, student TEXT, level TEXT, subject TEXT, source TEXT, text TEXT DEFAULT '', concepts TEXT, next INTEGER DEFAULT 1, created INTEGER, updated INTEGER);
CREATE INDEX IF NOT EXISTS ix_courses_student ON courses(student);
CREATE TABLE IF NOT EXISTS topic_off(student TEXT, concept TEXT, PRIMARY KEY(student, concept));
CREATE TABLE IF NOT EXISTS dmisc(id TEXT PRIMARY KEY, name TEXT, fix TEXT);
CREATE TABLE IF NOT EXISTS pyqs(id INTEGER PRIMARY KEY AUTOINCREMENT, student TEXT, concept TEXT, year INTEGER, marks INTEGER, text TEXT, ts INTEGER);
`;

export function openDb(path = process.env.DB_PATH || 'data/adhyora.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
export type Db = ReturnType<typeof openDb>;
