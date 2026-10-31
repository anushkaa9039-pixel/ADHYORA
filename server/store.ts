// The server keeps NO learner data between requests. A serverless host (Vercel) has no disk that survives and may run every request
// on a different machine, so the browser holds the learner's data and sends it with each request. This module copies that snapshot
// into a throw-away in-memory SQLite database (so all the existing service code runs unchanged) and copies the result back out.
import type { Db } from './db.js';

type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Snapshot = Record<string, Row[]>;

/** table -> how its rows are tied to one learner (dmisc is a shared lookup of AI-written misconception names). */
const TABLES: Record<string, 'id' | 'student' | null> = { students: 'id', mastery: 'student', answers: 'student', aiq: 'student', courses: 'student', topic_off: 'student', pyqs: 'student', dmisc: null };
const MAX_ROWS = 20000;
const KEEP_ANSWERS = 1500;
const DAY = 86400000;

const columnsOf = (db: Db, table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

/** Put a snapshot sent by the browser into the database. Only known tables and columns are accepted, and every row is forced to belong to `sid`. */
export function loadState(db: Db, sid: string, snap: unknown): void {
  if (!snap || typeof snap !== 'object') return;
  db.exec('BEGIN');
  try {
    for (const [table, owner] of Object.entries(TABLES)) {
      const rows = (snap as Record<string, unknown>)[table];
      if (!Array.isArray(rows)) continue;
      const allowed = columnsOf(db, table);
      for (const raw of rows.slice(0, MAX_ROWS)) {
        if (!raw || typeof raw !== 'object') continue;
        const row: Record<string, unknown> = { ...(raw as object) };
        if (owner) row[owner] = sid;
        const keys = Object.keys(row).filter((k) => allowed.has(k) && (row[k] === null || typeof row[k] === 'string' || typeof row[k] === 'number'));
        if (!keys.length) continue;
        db.prepare(`INSERT OR REPLACE INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...(keys.map((k) => row[k]) as Cell[]));
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Keep the snapshot small enough to travel with every request: oldest answers and stale unanswered practice questions go. */
function prune(db: Db, sid: string): void {
  db.prepare('DELETE FROM answers WHERE student = ? AND id NOT IN (SELECT id FROM answers WHERE student = ? ORDER BY id DESC LIMIT ?)').run(sid, sid, KEEP_ANSWERS);
  db.prepare("DELETE FROM aiq WHERE student = ? AND id LIKE 'ai-%' AND ts < ? AND id NOT IN (SELECT qid FROM answers WHERE student = ?)").run(sid, Date.now() - 2 * DAY, sid);
}

/** Everything that belongs to this learner, ready to be stored in the browser. */
export function dumpState(db: Db, sid: string): Snapshot {
  prune(db, sid);
  const out: Snapshot = {};
  for (const [table, owner] of Object.entries(TABLES)) {
    out[table] = (owner ? db.prepare(`SELECT * FROM ${table} WHERE ${owner} = ?`).all(sid) : db.prepare(`SELECT * FROM ${table}`).all()).map((r: unknown) => ({ ...(r as Row) }));
  }
  return out;
}
