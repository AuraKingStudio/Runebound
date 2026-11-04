/* Runebound bank: in online mode the VPS owns each player's gold and XP. The browser sends its ledger entries
   ([kind, gold, xp]) since the last sync; the bank checks each one against its own reward table and timing, applies
   the good ones, drops the rest, and answers with the true balance, which the browser then shows.
   A save edit or a fake reward cannot raise the server balance beyond what the rules allow.
   Identity: a private random token kept in the browser; only its SHA-256 hash is stored. File: bank.json (git-ignored). */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

/* biggest single reward per kind and the shortest gap between two (ms); mirrors auditRules() in index.html (a test keeps them equal) */
const RULES = {
  raid: { g: 2048, x: 2730, gap: 15000 },
  daily: { g: 300, x: 0, gap: 72000000 },
  lore: { g: 1000, x: 150, gap: 700 },
  bounty: { g: 80, x: 60, gap: 1000 },
  quest: { g: 350, x: 100, gap: 2000 },
};
const SPENDS = ["cosmetic", "smith", "seraph", "maiden", "guild", "skill", "upgrade", "equip"];
/* blackjack Assist rent: the server keeps each player's price multiplier (same rule as BJ_PRICE in index.html): x1.5 per rent,
   capped at x20, the extra halving every 10 minutes since the last rent. A rent is accepted only at that price (+-1 rounding). */
const ASSIST = { cost: 50, mul: 1.5, max: 20, half: 10 };
const assistMul = (a, t) => 1 + (Math.min(ASSIST.max, Math.max(1, a.bjm || 1)) - 1) * Math.pow(0.5, Math.max(0, t - (a.bjmAt || 0)) / 60000 / ASSIST.half);
const assistPrice = (a, t) => Math.max(ASSIST.cost, Math.round(ASSIST.cost * assistMul(a, t)));
const SEED_GOLD = 500, SEED_XP = 2000; /* a new online account keeps at most this much of its old offline save */
const MAX_ENTRIES = 150, SYNC_GAP_MS = 1000;
const SEEDS_PER_IP = 3, SEED_WINDOW_MS = 24 * 3600e3; /* seeded new accounts per IP per day: a shared save code can't farm the seed with fresh tokens */

const hash = (t) => createHash("sha256").update(t).digest("hex");
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

function createBank(options = {}) {
  const file = options.file || path.join(__dirname, "..", "bank.json");
  const now = options.now || Date.now;
  let accts = {};
  try { accts = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch {}
  let dirty = false, timer = null;
  function persist() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) return;
      dirty = false;
      try { fs.writeFileSync(file + ".tmp", JSON.stringify(accts)); fs.renameSync(file + ".tmp", file); }
      catch (e) { console.error("bank: save failed", e.message); }
    }, 500);
    timer.unref?.();
  }

  /* sync({ tok, led, seed }, ip): In: token, new ledger entries, offline balance (first sync only). Out: [status, { gold, xp, dropped }] */
  const seeded = new Map(); /* ip -> times a new account got a seed (in memory, last SEED_WINDOW_MS) */
  /* seedOk(ip, t): may this IP seed one more new account? Records it if so. No IP (tests, local) = no limit. */
  function seedOk(ip, t) {
    if (!ip) return true;
    if (seeded.size > 50000) for (const [k, v] of seeded) if (t - v[v.length - 1] >= SEED_WINDOW_MS) seeded.delete(k);
    const list = (seeded.get(ip) || []).filter((x) => t - x < SEED_WINDOW_MS);
    if (list.length >= SEEDS_PER_IP) { seeded.set(ip, list); return false; }
    list.push(t); seeded.set(ip, list);
    return true;
  }
  function sync(body, ip) {
    if (typeof body.tok != "string" || !/^[a-f0-9]{32}$/.test(body.tok)) return [400, { error: "Bad account token." }];
    if (!Array.isArray(body.led) || body.led.length > MAX_ENTRIES) return [400, { error: "Bad ledger." }];
    const id = hash(body.tok), t = now();
    let a = accts[id];
    if (!a) {
      const s = body.seed && seedOk(ip, t) ? body.seed : {}; /* over the per-IP limit: the account opens empty */
      a = accts[id] = { gold: int(s.gold, 0, 1e9) ? Math.min(s.gold, SEED_GOLD) : 0, xp: int(s.xp, 0, 1e9) ? Math.min(s.xp, SEED_XP) : 0, last: {}, bet: 0, at: 0 };
    }
    if (t - a.at < SYNC_GAP_MS) return [429, { error: "Too many syncs.", gold: a.gold, xp: a.xp }];
    const prevAt = a.at || t; /* the client may have rented any time since the last sync, when the price was higher */
    a.at = t;
    let dropped = 0;
    for (const e of body.led) {
      if (!Array.isArray(e) || typeof e[0] != "string" || !int(e[1], -1e6, 1e6) || !int(e[2], 0, 1e5)) { dropped++; continue; }
      const [kind, g, x] = e, rule = RULES[kind];
      if (rule) {
        const k = kind + (g ? "g" : "x"); /* a raid's gold and its XP arrive as two entries: timed separately */
        if (g < 0 || g > rule.g || x > rule.x || t - (a.last[k] || 0) < rule.gap) { dropped++; continue; }
        a.last[k] = t;
        a.gold += g; a.xp += x;
      } else if (kind == "bj") {
        if (x) { dropped++; continue; }
        if (g < 0) { if (a.gold + g < 0) { dropped++; continue; } a.gold += g; a.bet += -g; }
        else if (g > 0) { if (g > a.bet * 3) { dropped++; a.bet = 0; continue; } a.gold += g; a.bet = 0; }
      } else if (kind == "bjchart") {
        const lo = assistPrice(a, t), hi = assistPrice(a, prevAt); /* price only decays: anything from now's price up to the price at the last sync is honest */
        if (x || -g < lo - 1 || -g > hi + 1 || a.gold + g < 0) { dropped++; continue; }
        a.gold += g;
        a.bjm = Math.min(ASSIST.max, assistMul(a, t) * ASSIST.mul); a.bjmAt = prevAt; /* the rent happened somewhere since the last sync: anchor there, so a 2nd rent in the same sync still has its window */
      } else if (SPENDS.includes(kind)) {
        if (g > 0 || x || a.gold + g < 0) { dropped++; continue; }
        a.gold += g;
      } else dropped++; /* dev tools, market (escrow pays itself) and unknown kinds never move the bank */
    }
    persist();
    return [200, { gold: a.gold, xp: a.xp, dropped, bjm: a.bjm || 1, bjmAge: a.bjmAt ? t - a.bjmAt : 1e12 }]; /* bjmAge: ms since the last rent (no clock skew) */
  }

  return { sync, RULES, ASSIST, assistPrice, size: () => Object.keys(accts).length };
}

module.exports = { createBank, RULES, ASSIST, SEEDS_PER_IP };
