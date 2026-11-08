"use strict";
/* PostgreSQL storage for the bank (step 1: one game server).
   The bank still works in memory; this module loads it at start and saves only the accounts and trades that changed
   (compared as JSON), all in one transaction, at most one save running at a time. Gold also sits in its own column with
   CHECK (gold >= 0), so the database itself refuses a negative balance even if a bug slips through.
   Secrets: the connection string comes from DATABASE_URL (a .env on the server), never from git. */
const { Pool } = require("pg");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  gold bigint NOT NULL CHECK (gold >= 0),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trades (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v jsonb NOT NULL);
`;

async function openDb(url, options = {}) {
  if (!url) throw new Error("db: DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: options.max || 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  pool.on("error", (e) => console.error("db: idle client error", e.message));
  await pool.query(SCHEMA);
  const accts = {}, trades = {}, seen = { a: new Map(), t: new Map() };
  for (const r of (await pool.query("SELECT id, data FROM accounts")).rows) { accts[r.id] = r.data; seen.a.set(r.id, JSON.stringify(r.data)); }
  for (const r of (await pool.query("SELECT id, data FROM trades")).rows) { trades[r.id] = r.data; seen.t.set(r.id, JSON.stringify(r.data)); }
  const m = (await pool.query("SELECT v FROM meta WHERE k = 'migrated'")).rows[0];
  const initial = { accts, trades, migrated: m ? m.v === true : false };

  let running = null, again = null;
  /* save(state): write what changed since the last save. Calls during a save are merged into one follow-up save. */
  function save(state) {
    if (running) { again = state; return running; }
    running = write(state).catch((e) => console.error("db: save failed", e.message)).finally(() => {
      running = null;
      if (again) { const s = again; again = null; save(s); }
    });
    return running;
  }
  async function write(state) {
    const ch = { a: [], t: [] };
    for (const [id, a] of Object.entries(state.accts)) { const j = JSON.stringify(a); if (seen.a.get(id) !== j) ch.a.push([id, a, j]); }
    for (const [id, tr] of Object.entries(state.trades)) { const j = JSON.stringify(tr); if (seen.t.get(id) !== j) ch.t.push([id, j]); }
    const gone = [...seen.t.keys()].filter((id) => !Object.hasOwn(state.trades, id));
    if (!ch.a.length && !ch.t.length && !gone.length && state.migrated === initial.migrated) return;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      for (const [id, a, j] of ch.a)
        await c.query("INSERT INTO accounts (id, gold, data, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (id) DO UPDATE SET gold = EXCLUDED.gold, data = EXCLUDED.data, updated_at = now()", [id, Math.max(0, Math.trunc(+a.gold || 0)), j]);
      for (const [id, j] of ch.t)
        await c.query("INSERT INTO trades (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [id, j]);
      if (gone.length) await c.query("DELETE FROM trades WHERE id = ANY($1)", [gone]);
      await c.query("INSERT INTO meta (k, v) VALUES ('migrated', $1::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", [JSON.stringify(state.migrated === true)]);
      await c.query("COMMIT");
      for (const [id, , j] of ch.a) seen.a.set(id, j); /* only after the commit: a failed save is retried next time */
      for (const [id, j] of ch.t) seen.t.set(id, j);
      for (const id of gone) seen.t.delete(id);
      initial.migrated = state.migrated === true;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { c.release(); }
  }
  async function close() { if (running) await running; await pool.end(); }
  return { initial, save, close, pool };
}

module.exports = { openDb, SCHEMA };
