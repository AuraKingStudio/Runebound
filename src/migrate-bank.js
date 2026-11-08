"use strict";
/* One-time import: bank.json -> PostgreSQL. Usage: node --env-file=.env src/migrate-bank.js [path/to/bank.json]
   Refuses to run when the database already holds accounts (no double import). The file is left untouched. */
const fs = require("fs"), path = require("path");
const { openDb } = require("./db.js");
(async () => {
  const file = process.argv[2] || path.join(__dirname, "..", "bank.json");
  const j = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  const state = j.v === 2 ? { accts: j.accts || {}, trades: j.trades || {}, migrated: j.migrated === true } : { accts: j, trades: {}, migrated: false };
  /* an old build kept open trades in <bank>-trades.json: their escrow refund only runs in file mode, so do that first */
  if (!state.migrated && fs.existsSync(file.replace(/\.json$/, "") + "-trades.json")) throw new Error("old-format open trades found: start the server once with BANK_FILE=1 to refund them, then import");
  const db = await openDb(process.env.DATABASE_URL);
  if (Object.keys(db.initial.accts).length) { console.error("The database already has accounts: import refused."); await db.close(); process.exit(1); }
  await db.saveNow(state); /* throws on failure: never a false "imported" */
  const n = (await db.pool.query("SELECT count(*)::int AS n FROM accounts")).rows[0].n;
  if (n !== Object.keys(state.accts).length) { console.error(`import incomplete: ${n} of ${Object.keys(state.accts).length} accounts`); await db.close(); process.exit(1); }
  console.log(`Imported ${n} of ${Object.keys(state.accts).length} accounts and ${Object.keys(state.trades).length} trades from ${file}`);
  await db.close();
})().catch((e) => { console.error("import failed:", e.message); process.exit(1); });
