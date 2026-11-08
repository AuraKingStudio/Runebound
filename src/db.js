"use strict";
/* PostgreSQL storage for the bank (step 1: one game server).
   The bank still works in memory; this module loads it at start and saves the accounts the bank touched (and the trades)
   when they changed, all in one transaction. Saves run one at a time; a save asked for during a save runs right after it.
   A failed save is retried with backoff (1 s, 2 s, 4 s ... 30 s) until it lands; drain() waits until nothing is left.
   Gold also sits in its own column with CHECK (gold >= 0): a negative or broken balance rolls the whole save back.
   Secrets: the connection string comes from DATABASE_URL (a .env on the server), never from git, never logged. */
const { Pool } = require("pg");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  gold bigint NOT NULL CHECK (gold >= 0),
  data jsonb NOT NULL CHECK (octet_length(data::text) < 65536),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trades (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  data jsonb NOT NULL CHECK (octet_length(data::text) < 16384),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v jsonb NOT NULL);
`;

async function openDb(url, options = {}) {
  if (!url) throw new Error("db: DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: options.max || 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  pool.on("error", (e) => console.error("db: idle client error:", e.message));
  await pool.query(SCHEMA);
  const accts = {}, trades = {}, seen = { a: new Map(), t: new Map() };
  for (const r of (await pool.query("SELECT id, data FROM accounts")).rows) { accts[r.id] = r.data; seen.a.set(r.id, JSON.stringify(r.data)); }
  for (const r of (await pool.query("SELECT id, data FROM trades")).rows) { trades[r.id] = r.data; seen.t.set(r.id, JSON.stringify(r.data)); }
  const m = (await pool.query("SELECT v FROM meta WHERE k = 'migrated'")).rows[0];
  const initial = { accts, trades, migrated: m ? m.v === true : false };
  let savedMigrated = initial.migrated;

  /* queue: `want` = the newest state still to write (+ the ids it touched); one write at a time; failures retry */
  const quarantine = new Set(); /* account ids the database refused (alert on status().quarantined > 0) */
  let want = null, touched = new Set(), running = null, retryT = null, fails = 0, lastError = "", waiters = [];
  const settle = () => { if (!want && !running && !retryT) { const w = waiters; waiters = []; w.forEach((f) => f()); } };
  function save(state, ids) {
    want = state;
    if (ids && touched) for (const id of ids) touched.add(id); else touched = null; /* no ids: compare every account */
    if (!running && !retryT) pump();
    return drain();
  }
  function pump() {
    if (!want) return settle();
    const st = want, ids = touched;
    want = null; touched = new Set();
    running = write(st, ids).then(() => { fails = 0; lastError = ""; running = null; pump(); }, (e) => {
      running = null; fails++; lastError = e.message;
      console.error(`db: save failed (try ${fails}), retrying:`, e.message);
      if (!want) want = st; /* keep what failed (a newer state already includes it) */
      touched = ids && touched ? new Set([...ids, ...touched]) : null;
      retryT = setTimeout(() => { retryT = null; pump(); }, Math.min(30000, 1000 * 2 ** (fails - 1)));
    });
  }
  /* drain(): resolves once every asked-for save has landed */
  const drain = () => new Promise((res) => { waiters.push(res); settle(); });
  async function write(state, ids) {
    const ch = { a: [], t: [] };
    const list = ids ? [...ids].filter((id) => Object.hasOwn(state.accts, id)) : Object.keys(state.accts);
    for (const id of list) {
      const a = state.accts[id], j = JSON.stringify(a);
      if (seen.a.get(id) === j) continue;
      ch.a.push([id, a.gold, j]); /* sent as is: CHECK (gold >= 0) refuses a negative balance and rolls back */
    }
    for (const [id, tr] of Object.entries(state.trades)) { const j = JSON.stringify(tr); if (seen.t.get(id) !== j) ch.t.push([id, j]); }
    const gone = [...seen.t.keys()].filter((id) => !Object.hasOwn(state.trades, id));
    const mig = state.migrated === true;
    if (!ch.a.length && !ch.t.length && !gone.length && mig === savedMigrated) return;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const ok = [];
      for (const [id, g, j] of ch.a) {
        /* one bad row (negative gold, oversized) must not block everyone: SAVEPOINT per row, skip it, keep it quarantined */
        if (!Number.isSafeInteger(g)) { quarantine.add(id); console.error("db: account skipped (gold not a whole number):", id.slice(0, 12)); continue; }
        await c.query("SAVEPOINT r");
        try {
          await c.query("INSERT INTO accounts (id, gold, data, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (id) DO UPDATE SET gold = EXCLUDED.gold, data = EXCLUDED.data, updated_at = now()", [id, g, j]);
          await c.query("RELEASE SAVEPOINT r"); ok.push([id, g, j]); quarantine.delete(id);
        } catch (e) {
          if (e.code != "23514") throw e; /* only CHECK violations are row problems; anything else fails the batch (retried) */
          await c.query("ROLLBACK TO SAVEPOINT r"); quarantine.add(id);
          console.error("db: account skipped (CHECK refused):", id.slice(0, 12), e.constraint || "");
        }
      }
      ch.a = ok;
      for (const [id, j] of ch.t)
        await c.query("INSERT INTO trades (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [id, j]);
      if (gone.length) await c.query("DELETE FROM trades WHERE id = ANY($1)", [gone]);
      await c.query("INSERT INTO meta (k, v) VALUES ('migrated', $1::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", [JSON.stringify(mig)]);
      await c.query("COMMIT");
      for (const [id, , j] of ch.a) seen.a.set(id, j); /* only after the commit: a failed save is written again */
      for (const [id, j] of ch.t) seen.t.set(id, j);
      for (const id of gone) seen.t.delete(id);
      savedMigrated = mig;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { c.release(); }
  }
  /* saveNow(state): one direct write of every account that throws on failure (the import script) */
  const saveNow = (state) => write(state, null);
  /* close(ms): wait for the queue (retries included) up to ms; true when everything landed */
  async function close(ms = 20000) {
    let tm;
    const done = await Promise.race([drain().then(() => true), new Promise((r) => (tm = setTimeout(() => r(false), ms)))]);
    clearTimeout(tm); clearTimeout(retryT); retryT = null;
    await pool.end().catch(() => {});
    return done;
  }
  const status = () => ({ fails, lastError, pending: !!(want || running || retryT), quarantined: quarantine.size });
  return { initial, save, saveNow, drain, close, status, pool };
}

module.exports = { openDb, SCHEMA };
