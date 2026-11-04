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
  contract: { g: 400, x: 300, gap: 30000 },
};
/* materials: the server owns each account's counts. A ledger entry ["mat", 0, 0, src, mat, n] adds n (n < 0 spends).
   MAT_SRC[src] = { m: { mat: biggest n per entry }, gap: ms between two entries of that src+mat, day: most per mat per day (0 = no day cap) }.
   Gather: at most 3 x mastery 1.36 per gather (5); day cap = the client's soft curve (full to 40 gathers, x0.5 to 80, x0.2 after) with a hard stop. */
const MATS = ["dust", "shard", "eye", "bark", "heart", "ore", "herb", "echo"];
const all = (n) => Object.fromEntries(MATS.map((k) => [k, n]));
const MAT_SRC = {
  gather: { m: { ore: 5, herb: 5, echo: 5 }, gap: 2000, day: 350 },
  raid: { m: { dust: 12, shard: 6, bark: 6, eye: 2, heart: 2 }, gap: 15000, day: 0 },
  lore: { m: { dust: 5, shard: 2, bark: 2, eye: 1 }, gap: 700, day: 0 },
  salvage: { m: { dust: 8 }, gap: 1000, day: 200 },
  bounty: { m: all(5), gap: 1000, day: 50 },
  contract: { m: all(10), gap: 30000, day: 100 },
  maiden: { m: all(5), gap: 1000, day: 40 },
};
const MAT_SPEND = ["craft", "maiden", "smith"]; /* n < 0 only, never below 0 */
/* craft gains (refines) need craft spends earlier in the same sync: gained units <= spent units, at most 3 per entry.
   Every recipe uses more units than it makes, so crafting can turn materials into others but never mint them. */
const CRAFT_GAIN = 3;
const MAT_MAX = 99999, SEED_MAT = 50;
/* trades (online only): A offers { give, want } to B's public trade code. A's give is escrowed at once (A's confirm, the offer can't change);
   B accepts (B's confirm): the bank re-checks B, swaps both sides in one step and burns TAX of the gold each side receives.
   Each side: { gold?: 0..1e6, mat?: { key: 1..9999 } }, at most 5 materials. Offers expire after 10 minutes (escrow refunded). */
const TRADE = { tax: 0.05, ttl: 600e3, open: 5, perMin: 10, gold: 1e6, n: 9999, lines: 5 };
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
  const tradeFile = file.replace(/\.json$/, "") + "-trades.json", tradeLog = options.tradeLog || file.replace(/\.json$/, "") + "-trades.log";
  let trades = {};
  try { trades = JSON.parse(fs.readFileSync(tradeFile, "utf8")) || {}; } catch {}
  const byCode = new Map(); /* public trade code -> account id */
  const codeOf = (id) => hash("trade:" + id).slice(0, 10);
  for (const id of Object.keys(accts)) byCode.set(codeOf(id), id);
  let dirty = false, timer = null;
  function persist() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) return;
      dirty = false;
      try {
        fs.writeFileSync(file + ".tmp", JSON.stringify(accts)); fs.renameSync(file + ".tmp", file);
        fs.writeFileSync(tradeFile + ".tmp", JSON.stringify(trades)); fs.renameSync(tradeFile + ".tmp", tradeFile);
      }
      catch (e) { console.error("bank: save failed", e.message); }
    }, 500);
    timer.unref?.();
  }

  /* matEntry(a, src, mat, g, x, n, t): apply one material entry if the rules allow it. Out: true if applied. */
  function matEntry(a, src, k, g, x, n, t, cr) {
    if (g || x || typeof src != "string" || !MATS.includes(k) || !int(n, -MAT_MAX, MAT_MAX) || !n) return false;
    const kind = src + ":" + k;
    if (n < 0) {
      if (!MAT_SPEND.includes(src) || (a.mat[k] || 0) + n < 0) return false;
      a.mat[k] += n;
      if (src == "craft") cr.u -= n;
      return true;
    }
    if (src == "craft") {
      if (n > CRAFT_GAIN || n > cr.u) return false;
      cr.u -= n;
      a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n);
      return true;
    }
    const r = MAT_SRC[src];
    if (!r || !r.m[k] || n > r.m[k] || t - (a.last[kind] || 0) < r.gap) return false;
    const day = Math.floor(t / 86400e3);
    if (!a.md || a.md.d != day) a.md = { d: day, n: {} };
    if (r.day && (a.md.n[kind] || 0) + n > r.day) return false;
    a.md.n[kind] = (a.md.n[kind] || 0) + n;
    a.last[kind] = t;
    a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n);
    return true;
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
      byCode.set(codeOf(id), id);
      a = accts[id] = { gold: int(s.gold, 0, 1e9) ? Math.min(s.gold, SEED_GOLD) : 0, xp: int(s.xp, 0, 1e9) ? Math.min(s.xp, SEED_XP) : 0, last: {}, bet: 0, at: 0 };
      a.mat = {}; if (s.mat && typeof s.mat == "object") for (const k of MATS) if (int(s.mat[k], 1, MAT_MAX)) a.mat[k] = Math.min(s.mat[k], SEED_MAT);
    }
    if (!a.mat) a.mat = {}; /* accounts from before materials */
    if (t - a.at < SYNC_GAP_MS) return [429, { error: "Too many syncs.", gold: a.gold, xp: a.xp }];
    const prevAt = a.at || t; /* the client may have rented any time since the last sync, when the price was higher */
    a.at = t;
    let dropped = 0;
    const cr = { u: 0 }; /* craft units spent in this sync, available to craft gains */
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
      } else if (kind == "mat") {
        if (!matEntry(a, e[3], e[4], g, x, e[5], t, cr)) dropped++;
      } else if (SPENDS.includes(kind)) {
        if (g > 0 || x || a.gold + g < 0) { dropped++; continue; }
        a.gold += g;
      } else dropped++; /* dev tools, market (escrow pays itself) and unknown kinds never move the bank */
    }
    persist();
    return [200, { gold: a.gold, xp: a.xp, mat: { ...a.mat }, tc: codeOf(id), dropped, bjm: a.bjm || 1, bjmAge: a.bjmAt ? t - a.bjmAt : 1e12 }]; /* bjmAge: ms since the last rent (no clock skew) */
  }

  /* ---------- trades ---------- */
  /* side(v): a clean { gold, mat } or null */
  function side(v) {
    if (v == null) return { gold: 0, mat: {} };
    if (typeof v != "object" || Array.isArray(v)) return null;
    const gold = v.gold == null ? 0 : v.gold, m = v.mat == null ? {} : v.mat;
    if (!int(gold, 0, TRADE.gold) || !m || typeof m != "object" || Array.isArray(m)) return null;
    const keys = Object.keys(m);
    if (keys.length > TRADE.lines || keys.some((k) => !MATS.includes(k) || !int(m[k], 1, TRADE.n))) return null;
    return { gold, mat: Object.fromEntries(keys.map((k) => [k, m[k]])) };
  }
  const has = (a, sd) => a.gold >= sd.gold && Object.entries(sd.mat).every(([k, n]) => (a.mat[k] || 0) >= n);
  function take(a, sd) { a.gold -= sd.gold; for (const [k, n] of Object.entries(sd.mat)) a.mat[k] -= n; }
  function put(a, sd, tax) { a.gold += sd.gold - tax; for (const [k, n] of Object.entries(sd.mat)) a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n); }
  const taxOf = (g) => Math.floor(g * TRADE.tax);
  function log(ev, tr, extra) {
    try { fs.appendFileSync(tradeLog, JSON.stringify({ at: new Date(now()).toISOString(), ev, id: tr.id, from: tr.from.slice(0, 12), to: tr.to.slice(0, 12), give: tr.give, want: tr.want, ...extra }) + "\n"); } catch {}
  }
  /* who(body, t): [0, { id, a }] for the caller (rate-limited), or an error reply */
  function who(body, t) {
    if (typeof body.tok != "string" || !/^[a-f0-9]{32}$/.test(body.tok)) return [400, { error: "Bad account token." }];
    const id = hash(body.tok), a = accts[id];
    if (!a) return [404, { error: "Sync once before trading." }];
    if (!a.mat) a.mat = {};
    a.tr = (a.tr || []).filter((x) => t - x < 60e3);
    if (a.tr.length >= TRADE.perMin) return [429, { error: "Too many trade actions: wait a minute." }];
    a.tr.push(t);
    return [0, { id, a }];
  }
  /* expire(t): escrow back for offers older than TRADE.ttl; settled offers are forgotten after a week */
  function expire(t) {
    for (const tr of Object.values(trades)) if (tr.st == "open" && t - tr.at >= TRADE.ttl) {
      tr.st = "expired";
      if (accts[tr.from]) put(accts[tr.from], tr.give, 0);
      log("expire", tr);
    }
    for (const [k, tr] of Object.entries(trades)) if (tr.st != "open" && t - tr.at > 7 * 86400e3) delete trades[k];
  }
  function tradeOffer(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const to = typeof body.to == "string" && byCode.get(body.to);
    if (!to || !accts[to]) return [404, { error: "No player with that trade code." }];
    if (to == w.id) return [400, { error: "You can't trade with yourself." }];
    const give = side(body.give), want = side(body.want);
    if (!give || !want) return [400, { error: "Bad trade amounts." }];
    if (!give.gold && !Object.keys(give.mat).length && !want.gold && !Object.keys(want.mat).length) return [400, { error: "An empty trade." }];
    if (Object.values(trades).filter((tr) => tr.st == "open" && tr.from == w.id).length >= TRADE.open) return [429, { error: "Too many open offers." }];
    if (!has(w.a, give)) return [409, { error: "You don't have what you offer." }];
    take(w.a, give); /* escrow: the offer is the proposer's confirm */
    const id = hash(w.id + ":" + t + ":" + Math.random()).slice(0, 16);
    const tr = (trades[id] = { id, from: w.id, to, give, want, st: "open", at: t });
    log("offer", tr); persist();
    return [200, { id, gold: w.a.gold, mat: { ...w.a.mat } }];
  }
  function tradeAccept(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const tr = typeof body.id == "string" && trades[body.id];
    if (!tr || tr.to != w.id) return [404, { error: "No such offer for you." }];
    if (tr.st != "open") return [409, { error: "This offer is " + tr.st + "." }];
    const from = accts[tr.from];
    if (!from) return [409, { error: "The other player is gone." }];
    if (!has(w.a, tr.want)) return [409, { error: "You don't have what they want." }];
    const taxIn = taxOf(tr.give.gold), taxOut = taxOf(tr.want.gold);
    tr.st = "done"; /* first, so nothing can settle it twice */
    take(w.a, tr.want); put(w.a, tr.give, taxIn); put(from, tr.want, taxOut);
    log("done", tr, { tax: taxIn + taxOut }); persist();
    return [200, { gold: w.a.gold, mat: { ...w.a.mat }, tax: taxIn + taxOut }];
  }
  function tradeCancel(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const tr = typeof body.id == "string" && trades[body.id];
    if (!tr || (tr.from != w.id && tr.to != w.id)) return [404, { error: "No such offer." }];
    if (tr.st != "open") return [409, { error: "This offer is " + tr.st + "." }];
    tr.st = tr.from == w.id ? "cancelled" : "declined";
    if (accts[tr.from]) put(accts[tr.from], tr.give, 0); /* escrow back to the proposer */
    log(tr.st, tr); persist();
    return [200, { gold: w.a.gold, mat: { ...w.a.mat } }];
  }
  function tradeList(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const view = (tr) => ({ id: tr.id, out: tr.from == w.id, give: tr.give, want: tr.want, left: Math.max(0, TRADE.ttl - (t - tr.at)) });
    const offers = Object.values(trades).filter((tr) => tr.st == "open" && (tr.from == w.id || tr.to == w.id)).map(view);
    return [200, { tc: codeOf(w.id), offers, gold: w.a.gold, mat: { ...w.a.mat } }];
  }

  return { sync, tradeOffer, tradeAccept, tradeCancel, tradeList, TRADE, RULES, MAT_SRC, ASSIST, assistPrice, size: () => Object.keys(accts).length };
}

module.exports = { createBank, RULES, ASSIST, SEEDS_PER_IP, MATS, MAT_SRC, TRADE };
