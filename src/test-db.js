"use strict";
/* PostgreSQL bank tests. Needs TEST_DATABASE_URL (a throwaway database: its tables are dropped). Run: npm run test:db */
const { openDb } = require("./db.js");
const { createBank } = require("./bank.js");
const url = process.env.TEST_DATABASE_URL;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  if (!url) { console.log("SKIP db tests: TEST_DATABASE_URL is not set"); return; }
  if (!/_test\b/.test(url)) throw new Error("refusing: TEST_DATABASE_URL must name a *_test database (its tables are dropped)");
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
  await db2.close();
})().then(() => { console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0); }, (e) => { console.error(e); process.exit(1); });
