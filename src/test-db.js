"use strict";
/* PostgreSQL bank tests. Needs TEST_DATABASE_URL (a throwaway database: its tables are dropped). Run: npm run test:db */
const { openDb } = require("./db.js");
const { createBank } = require("./bank.js");
const url = process.env.TEST_DATABASE_URL;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  if (!url) { console.log("SKIP db tests: TEST_DATABASE_URL is not set"); return; }
  let dbName = ""; try { dbName = decodeURIComponent(new URL(url).pathname.slice(1)); } catch {}
  if (!/_test$/.test(dbName) || url === process.env.DATABASE_URL) throw new Error("refusing: TEST_DATABASE_URL must name a database ending in _test, different from DATABASE_URL (its tables are dropped)");
  const { Pool } = require("pg"), p = new Pool({ connectionString: url });
  await p.query("DROP TABLE IF EXISTS accounts, trades, meta"); await p.end();

  let t = 1e6;
  const db1 = await openDb(url);
  ok(Object.keys(db1.initial.accts).length == 0, "db: a fresh database starts empty");
  const b1 = createBank({ store: db1, now: () => t }), tok = "ab".repeat(16);
  t += 1500; const r1 = b1.sync({ tok, led: [], seed: { gold: 500 } });
  ok(r1[0] == 200, "db: a new account syncs");
  const gold = r1[1].gold;
  await b1.flush(); await db1.close();

  const db2 = await openDb(url);
  const ids = Object.keys(db2.initial.accts);
  ok(ids.length == 1 && /^[a-f0-9]{64}$/.test(ids[0]) && !JSON.stringify(db2.initial).includes(tok), "db: one account, stored by hash only (no token)");
  const b2 = createBank({ store: db2, now: () => t });
  t += 1500; const r2 = b2.sync({ tok, led: [] });
  ok(r2[0] == 200 && r2[1].gold === gold, "db: gold survives a restart");
  const row = (await db2.pool.query("SELECT gold FROM accounts WHERE id = $1", [ids[0]])).rows[0];
  ok(row && +row.gold === gold, "db: the gold column matches the account");
  let refused = false;
  try { await db2.pool.query("UPDATE accounts SET gold = -1 WHERE id = $1", [ids[0]]); } catch (e) { refused = /check/i.test(e.message); }
  ok(refused, "db: the database refuses a negative balance");
  let bad = false;
  try { await db2.pool.query("INSERT INTO accounts (id, gold, data) VALUES ('not-a-hash', 0, '{}')"); } catch (e) { bad = true; }
  ok(bad, "db: account ids must be sha-256 hashes");
  await b2.flush();
  const before = (await db2.pool.query("SELECT updated_at FROM accounts")).rows[0].updated_at;
  await b2.flush();
  const after = (await db2.pool.query("SELECT updated_at FROM accounts")).rows[0].updated_at;
  ok(+before === +after, "db: an unchanged account is not rewritten");
  const id = ids[0], raw = db2.initial.accts[id];
  /* Hawk HIGH 2: a refused save (negative gold) is retried, and lands once the state is fixed */
  const id2 = "e".repeat(64); db2.initial.accts[id2] = { gold: 42 };
  raw.gold = -5; await db2.save({ accts: db2.initial.accts, trades: {}, migrated: false }, [id, id2]);
  const rows2 = (await db2.pool.query("SELECT id, gold FROM accounts")).rows;
  ok(db2.status().quarantined == 1 && +rows2.find((x) => x.id == id2).gold === 42 && +rows2.find((x) => x.id == id).gold !== -5, "db: one bad account is set aside, everyone else still saves");
  raw.gold = 777; await db2.save({ accts: db2.initial.accts, trades: {}, migrated: false }, [id]);
  ok(+(await db2.pool.query("SELECT gold FROM accounts WHERE id = $1", [id])).rows[0].gold === 777 && db2.status().quarantined == 0, "db: once fixed, the account saves again");
  /* Hawk HIGH 1: a save queued while another runs is not lost at shutdown */
  raw.gold = 778; db2.save({ accts: db2.initial.accts, trades: {}, migrated: false }, [id]);
  raw.gold = 779; db2.save({ accts: db2.initial.accts, trades: {}, migrated: false }, [id]);
  ok((await db2.close(10000)) === true, "db: close waits for every queued save");
  const db3 = await openDb(url);
  ok(db3.initial.accts[id].gold === 779, "db: the last queued save survived shutdown");
  let big = false; try { await db3.pool.query("INSERT INTO accounts (id, gold, data) VALUES ($1, 0, $2::jsonb)", ["c".repeat(64), JSON.stringify({ x: "y".repeat(70000) })]); } catch (e) { big = true; }
  ok(big, "db: oversized account data is refused");
  await db3.close();
})().then(() => { console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0); }, (e) => { console.error("db tests crashed:", e.message); process.exit(1); });
