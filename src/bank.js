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
   MAT_SRC[src] = { m: { mat: biggest n per entry }, gap: ms between two entries of that src+mat, day: most per mat per day (a number, or per mat) }.
   Gather: at most 3 x mastery 1.36 per gather (5); day cap = the client's soft curve (full to 40 gathers, x0.5 to 80, x0.2 after) with a hard stop. */
const MATS = ["dust", "shard", "eye", "bark", "heart", "ore", "herb", "echo"];
const all = (n) => Object.fromEntries(MATS.map((k) => [k, n]));
const MAT_SRC = {
  gather: { m: { ore: 5, herb: 5, echo: 5 }, gap: 2000, day: 350 },
  raid: { m: { dust: 12, shard: 6, bark: 6, eye: 2, heart: 2 }, gap: 15000, day: { dust: 400, shard: 200, bark: 200, eye: 30, heart: 30 } },
  lore: { m: { dust: 5, shard: 2, bark: 2, eye: 1 }, gap: 700, day: { dust: 100, shard: 30, bark: 30, eye: 5 } },
  salvage: { m: { dust: 8 }, gap: 1000, day: 200 },
  bounty: { m: all(5), gap: 1000, day: 50 },
  contract: { m: { echo: 3 }, gap: 0, day: 0 }, /* Contract Board reward: echo only (never a rare), at most 3 and never more than delivered; 3 a day via contractOk */
};
const MAT_SPEND = ["craft", "maiden", "smith", "contract", "pet", "garden"]; /* n < 0 only, never below 0 */
/* Contract Board: a payout (gold, XP or a material reward, each its own entry) needs a delivery of at least CONTRACT.min
   materials ("contract" spends) earlier in the same sync, one payout of each kind per delivery, at most CONTRACT.day a day. */
const CONTRACT = { min: 6, day: 3 };
/* craft gains: only the client's own recipes, each paired with its exact spends logged earlier in the same sync
   (eye and heart have no recipe: rares can't be crafted). Every other craft gain is dropped; each recipe has a day cap. */
const RECIPE = {
  dust: { n: 3, need: { ore: 5, echo: 2 }, day: 300 }, /* refine-ore */
  shard: { n: 1, need: { dust: 5 }, day: 60 }, /* refine-k */
  bark: { n: 1, need: { dust: 5 }, day: 60 },
};
/* The Maiden: every gain must match one of her trades, paid by its spend earlier in the same sync (src "maiden").
   [from, to, least spent, got, pool]. Pool x: the island exchange (prices drift down to these floors), 10 a day; pool r: her rare trades, 3 a day. */
const MAIDEN = [
  ["ore", "herb", 2, 2, "x"], ["herb", "ore", 2, 2, "x"], ["ore", "echo", 5, 1, "x"], ["herb", "echo", 5, 1, "x"], ["echo", "ore", 1, 2, "x"], ["echo", "herb", 1, 2, "x"],
  ["eye", "heart", 1, 1, "r"], ["heart", "eye", 1, 1, "r"], ["shard", "eye", 12, 1, "r"], ["bark", "heart", 12, 1, "r"],
  ["shard", "bark", 5, 4, "r"], ["bark", "shard", 5, 4, "r"], ["dust", "eye", 30, 1, "r"], ["dust", "heart", 30, 1, "r"],
];
const MAIDEN_DAY = { x: 10, r: 3 };
/* pets: the bank owns which pets an account has, their level (1-5) and the active one, and applies the bonus itself.
   Ledger ["pet", 0, 0, op, k, 0], op buy / feed / set, each paid by "pet" material spends earlier in the same sync.
   Bonus = p x mult(lv), mult = 1 + (lv-1)/4 (2x at 5); fox: gather gains, owl: RULES XP, sprite: recipe gains; wolf: client raid damage inside raid caps.
   The bonus comes on top of the day caps (they count base gains). Pet spends a sync does not use are refunded at its end. */
const PET = {
  kinds: { fox: { b: "gather", p: 0.05 }, owl: { b: "xp", p: 0.05 }, wolf: { b: "dmg", p: 0.03 }, sprite: { b: "refine", p: 0.05 } },
  price: { fox: { ore: 15, herb: 10 }, owl: { herb: 15, echo: 4 }, wolf: { shard: 6, bark: 6 }, sprite: { dust: 30, echo: 3 } },
  food: { fox: "herb", owl: "echo", wolf: "bark", sprite: "dust" }, max: 5, setGap: 600e3, /* one switch per 10 min: no swapping pets per gain type */
};
const petMult = (lv) => 1 + (lv - 1) / 4;
/* the Beastkeeper's Garden: the bank owns the plots. Ledger ["garden", 0, 0, "plant", plot, seed] paid by "garden" material spends
   earlier in the same sync, ["garden", 0, 0, "harvest", plot, 0]. Plant time, growth and yield use server time and these tables only.
   Perk of the active pet: owl grows 15% faster (fixed at planting), fox +1 yield, sprite +1 echo every 3rd harvest, wolf: never wilts.
   A plot left WILT ms after it is ripe wilts (yield halved, at least 1). Day caps: plants and harvests. */
const GARDEN = {
  plots: 6, day: 24, wilt: 24 * 3600e3, owl: 0.85,
  seeds: { herb: { cost: { herb: 2 }, grow: 20 * 60e3, y: { herb: 4 } }, ore: { cost: { ore: 2 }, grow: 30 * 60e3, y: { ore: 5 } }, echo: { cost: { herb: 2, ore: 2 }, grow: 40 * 60e3, y: { echo: 2 } } },
  /* daily streak: ["garden", 0, 0, "streak", 0, 0], one claim per server UTC day; consecutive days climb a 7-step ladder (then it loops),
     one missed day per UTC week (day / 7) is forgiven; materials only, paid from this table (never from the entry). */
  streakSyncs: 5, /* real earning syncs before the streak opens (Sybil guard, like trading) */
  streak: [{ herb: 2 }, { ore: 2 }, { herb: 3 }, { ore: 3 }, { herb: 3, ore: 3 }, { herb: 3, echo: 1 }, { herb: 5, ore: 5, echo: 3 }],
};
/* gsView(gs, t): the streak as of server time t. Out: { n: claims in the live streak, can: claim open today, gap, wk, graceLeft } */
function gsView(gs, t) {
  const day = Math.floor(t / 86400e3), wk = Math.floor(day / 7);
  if (!gs) return { n: 0, can: true, gap: 99, wk, graceLeft: true, day };
  const gap = day - gs.d, graceLeft = gs.gw != wk, alive = gap <= 1 || (gap == 2 && graceLeft);
  return { n: alive ? gs.n : 0, can: gap >= 1, gap, wk, graceLeft, day, alive };
}
const MAT_MAX = 99999, SEED_MAT = 50;
/* trades (online only): A offers { give, want } to B's public trade code. A's give is escrowed at once (A's confirm, the offer can't change);
   B accepts (B's confirm): the bank re-checks B, swaps both sides in one step and burns TAX of the gold each side receives.
   Each side: { gold?: 0..1e6, mat?: { key: 1..9999 } }, at most 5 materials. Offers expire after 10 minutes (escrow refunded). */
const TRADE = { tax: 0.05, ttl: 600e3, open: 5, inbox: 20, perMin: 10, gold: 1e6, n: 9999, lines: 5,
  ageMs: 24 * 3600e3, syncs: 20, /* Sybil guard: trading unlocks for accounts at least a day old with 20 real syncs */
  ipAccts: 3, /* different accounts trading from one IP per day */
  inMat: 300, inGold: 20000, /* most materials / gold one account may RECEIVE by trade per day */
  keepMs: 86400e3, logMax: 5e6 };
const SPENDS = ["cosmetic", "smith", "seraph", "maiden", "guild", "skill", "upgrade", "equip"];
/* blackjack Assist rent: the server keeps each player's price multiplier (same rule as BJ_PRICE in index.html): x1.5 per rent,
   capped at x20, the extra halving every 10 minutes since the last rent. A rent is accepted only at that price (+-1 rounding). */
const ASSIST = { cost: 50, mul: 1.5, max: 20, half: 10 };
const assistMul = (a, t) => 1 + (Math.min(ASSIST.max, Math.max(1, a.bjm || 1)) - 1) * Math.pow(0.5, Math.max(0, t - (a.bjmAt || 0)) / 60000 / ASSIST.half);
const assistPrice = (a, t) => Math.max(ASSIST.cost, Math.round(ASSIST.cost * assistMul(a, t)));
const SEED_GOLD = 500, SEED_XP = 2000; /* a new online account keeps at most this much of its old offline save */
const MAX_ENTRIES = 150, SYNC_GAP_MS = 1000, NS_GAP = 5 * 60e3;
const SEEDS_PER_IP = 3, SEED_WINDOW_MS = 24 * 3600e3; /* seeded new accounts per IP per day: a shared save code can't farm the seed with fresh tokens */

const hash = (t) => createHash("sha256").update(t).digest("hex");
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

function createBank(options = {}) {
  const file = options.file || path.join(__dirname, "..", "bank.json");
  const now = options.now || Date.now;
  const onEntry = typeof options.onEntry == "function" ? options.onEntry : null; /* analytics: told about every ACCEPTED entry */
  /* one file, written atomically: { v: 2, accts, trades, migrated } (older files held only the accounts) */
  let accts = {}, trades = {}, migrated = false;
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) || {};
    if (j.v === 2) { accts = j.accts || {}; trades = j.trades || {}; migrated = j.migrated === true; } else accts = j;
  } catch {}
  const state = () => JSON.stringify({ v: 2, accts, trades, migrated });
  /* migration: an older build kept trades in <bank>-trades.json. Refund its open escrow once: the refunds and the
     migrated flag land in the same atomic write, so a failed rename or a crash can never pay them twice. */
  const oldTrades = file.replace(/\.json$/, "") + "-trades.json";
  if (!migrated) try {
    const old = JSON.parse(fs.readFileSync(oldTrades, "utf8")) || {};
    for (const tr of Object.values(old)) if (tr && tr.st == "open" && accts[tr.from] && tr.give) {
      const a = accts[tr.from];
      if (!a.mat) a.mat = {};
      a.gold += int(tr.give.gold, 0, 1e6) ? tr.give.gold : 0;
      for (const [k, n] of Object.entries(tr.give.mat || {})) if (MATS.includes(k) && int(n, 1, 9999)) a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n);
    }
    migrated = true;
    fs.writeFileSync(file + ".tmp", state()); fs.renameSync(file + ".tmp", file);
    try { fs.renameSync(oldTrades, oldTrades + ".migrated"); } catch {} /* only tidying: the flag already guards the refund */
  } catch {}
  const tradeLog = options.tradeLog || file.replace(/\.json$/, "") + "-trades.log";
  const byCode = new Map(); /* public trade code -> account id */
  const codeOf = (id) => hash("trade:" + id).slice(0, 10);
  for (const id of Object.keys(accts)) byCode.set(codeOf(id), id);
  let dirty = false, timer = null;
  /* flush(): write now (shutdown, tests); persist() batches writes to at most one every 500 ms */
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    dirty = false;
    try { fs.writeFileSync(file + ".tmp", state()); fs.renameSync(file + ".tmp", file); }
    catch (e) { console.error("bank: save failed", e.message); }
  }
  function persist() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!dirty) return;
      dirty = false;
      try {
        fs.writeFileSync(file + ".tmp", state()); fs.renameSync(file + ".tmp", file);
      }
      catch (e) { console.error("bank: save failed", e.message); }
    }, 500);
    timer.unref?.();
  }

  /* contractOk(a, cr, k, t): may this sync claim one more contract payout of kind k (contractg / contractx / contractm)?
     Needs CONTRACT.min delivered units per payout of that kind, and at most CONTRACT.day payouts of that kind a day. Records it if so. */
  function contractOk(a, cr, k, t) {
    const used = cr.used[k] || 0;
    if (cr.c < CONTRACT.min * (used + 1)) return false;
    const day = Math.floor(t / 86400e3);
    if (!a.cd || a.cd.d != day) a.cd = { d: day, n: {} };
    if ((a.cd.n[k] || 0) >= CONTRACT.day) return false;
    a.cd.n[k] = (a.cd.n[k] || 0) + 1;
    cr.used[k] = used + 1;
    return true;
  }
  /* dayOk(a, kind, n, cap, t): room for n more of kind today (cap 0/undefined = none)? Counts it if so. */
  function dayOk(a, kind, n, cap, t) {
    const day = Math.floor(t / 86400e3);
    if (!a.md || a.md.d != day) a.md = { d: day, n: {} };
    if (cap && (a.md.n[kind] || 0) + n > cap) return false;
    a.md.n[kind] = (a.md.n[kind] || 0) + n;
    return true;
  }
  /* matEntry(a, src, mat, g, x, n, t): apply one material entry if the rules allow it. Out: true if applied. */
  function matEntry(a, src, k, g, x, n, t, cr) {
    if (g || x || typeof src != "string" || !MATS.includes(k) || !int(n, -MAT_MAX, MAT_MAX) || !n) return false;
    const kind = src + ":" + k;
    if (n < 0) {
      if (!MAT_SPEND.includes(src) || (a.mat[k] || 0) + n < 0) return false;
      a.mat[k] += n;
      if (src == "craft") cr.sp[k] = (cr.sp[k] || 0) - n;
      if (src == "maiden") cr.ms[k] = (cr.ms[k] || 0) - n;
      if (src == "contract") cr.c -= n;
      if (src == "pet") cr.pt[k] = (cr.pt[k] || 0) - n;
      if (src == "garden") cr.gd[k] = (cr.gd[k] || 0) - n;
      return true;
    }
    if (src == "maiden") {
      const m = MAIDEN.find((x) => x[1] == k && x[3] == n && (cr.ms[x[0]] || 0) >= x[2]);
      if (!m || !dayOk(a, "maiden:" + m[4], 1, MAIDEN_DAY[m[4]], t)) return false;
      cr.ms[m[0]] -= m[2]; /* that trade's payment is used up */
      a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n);
      return true;
    }
    if (src == "craft") {
      const rc = RECIPE[k];
      if (!rc || n != rc.n || Object.entries(rc.need).some(([m, q]) => (cr.sp[m] || 0) < q) || !dayOk(a, kind, n, rc.day, t)) return false;
      for (const [m, q] of Object.entries(rc.need)) cr.sp[m] -= q; /* this recipe's spends are used up */
      a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n + petBonus(a, "refine", "fr", n));
      return true;
    }
    const r = MAT_SRC[src];
    if (!r || !r.m[k] || n > r.m[k] || t - (a.last[kind] || 0) < r.gap) return false;
    if (src == "contract" && (n > cr.c || !contractOk(a, cr, "contractm", t))) return false; /* last: a refused reward never uses a day slot */
    if (!dayOk(a, kind, n, typeof r.day == "object" ? r.day[k] : r.day, t)) return false;
    a.last[kind] = t;
    a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n + (src == "gather" ? petBonus(a, "gather", "fg", n) : 0));
    return true;
  }
  /* petBonus(a, b, carry, n): whole extra units from the active pet if its bonus is b; the fraction carries to the next gain. */
  function petBonus(a, b, c, n) {
    const k = a.pet && a.pet.on, d = k && PET.kinds[k];
    if (!d || d.b != b || !a.pet.own[k]) return 0;
    const v = (a.pet[c] || 0) + n * d.p * petMult(a.pet.own[k]), w = Math.floor(v);
    a.pet[c] = v - w;
    return w;
  }
  /* petEntry(a, op, k, g, x, n, t, cr): buy / feed / set. Out: true if applied. */
  function petEntry(a, op, k, g, x, n, t, cr) {
    if (g || x || n || typeof k != "string") return false;
    if (!a.pet) a.pet = { own: {}, on: "" };
    const own = a.pet.own, pay = (need) => {
      if (Object.entries(need).some(([m, q]) => (cr.pt[m] || 0) < q)) return false;
      for (const [m, q] of Object.entries(need)) cr.pt[m] -= q;
      return true;
    };
    if (op == "set") {
      if ((k && !(Object.hasOwn(PET.kinds, k) && own[k])) || t - (a.pet.at || 0) < PET.setGap) return false;
      a.pet.on = k; a.pet.at = t; return true;
    }
    if (!Object.hasOwn(PET.kinds, k)) return false;
    if (op == "buy") { if (own[k] || !pay(PET.price[k])) return false; own[k] = 1; return true; }
    if (op == "feed") { const lv = own[k]; if (!lv || lv >= PET.max || !pay({ [PET.food[k]]: 5 * lv })) return false; own[k] = lv + 1; return true; }
    return false;
  }
  /* gardenEntry(a, op, plot, g, x, s, t, cr): plant / harvest. Out: true if applied. */
  function gardenEntry(a, op, i, g, x, s, t, cr) {
    if (g || x || !Number.isInteger(i) || i < 0 || i >= GARDEN.plots) return false;
    if (!a.gd || !Array.isArray(a.gd.p)) a.gd = { p: Array(GARDEN.plots).fill(null), sc: 0 };
    const p = a.gd.p, pk = a.pet && a.pet.own && a.pet.own[a.pet.on] ? a.pet.on : "";
    if (op == "plant") {
      const sd = typeof s == "string" && Object.hasOwn(GARDEN.seeds, s) && GARDEN.seeds[s];
      if (!sd || p[i] || Object.entries(sd.cost).some(([m, q]) => (cr.gd[m] || 0) < q) || !dayOk(a, "garden:plant", 1, GARDEN.day, t)) return false;
      for (const [m, q] of Object.entries(sd.cost)) cr.gd[m] -= q;
      p[i] = { s, at: t, d: Math.round(sd.grow * (pk == "owl" ? GARDEN.owl : 1)), pk }; /* the perk is locked at planting: switching pets before harvest changes nothing */
      return true;
    }
    if (op == "streak") {
      const v = gsView(a.gd.gs, t);
      if (i || s || !v.can || (a.ns || 0) < GARDEN.streakSyncs) return false; /* once per server day; established accounts only (no fresh-alt farming); nothing in the entry decides the payout */
      const n = v.n + 1, gw = v.gap == 2 && v.alive ? v.wk : a.gd.gs ? a.gd.gs.gw : -1;
      a.gd.gs = { d: v.day, n, gw };
      for (const [m, q] of Object.entries(GARDEN.streak[(n - 1) % 7])) a.mat[m] = Math.min(MAT_MAX, (a.mat[m] || 0) + q);
      return true;
    }
    if (op == "harvest") {
      const c = p[i];
      if (s || !c || t - c.at < c.d || !dayOk(a, "garden:harvest", 1, GARDEN.day, t)) return false;
      const pk = typeof c.pk == "string" ? c.pk : ""; /* the pet active at planting (older plots: no perk) */
      const wilt = pk != "wolf" && t - c.at - c.d >= GARDEN.wilt;
      for (const [m, q] of Object.entries(GARDEN.seeds[c.s].y)) {
        const n = wilt ? Math.max(1, Math.floor(q / 2)) : q + (pk == "fox" ? 1 : 0);
        a.mat[m] = Math.min(MAT_MAX, (a.mat[m] || 0) + n);
      }
      if (pk == "sprite" && !wilt && ++a.gd.sc % 3 == 0) a.mat.echo = Math.min(MAT_MAX, (a.mat.echo || 0) + 1);
      p[i] = null;
      return true;
    }
    return false;
  }
  /* gsOut(a, t): the streak for the client, relative to server days (no clock skew): { n, ago: days since the last claim (-1 none), gu: grace used this week } */
  function gsOut(a, t) {
    const gs = a.gd && a.gd.gs;
    const lk = (a.ns || 0) < GARDEN.streakSyncs ? 1 : 0;
    if (!gs) return { n: 0, ago: -1, gu: 0, lk };
    const v = gsView(gs, t);
    return { n: gs.n, ago: v.gap, gu: v.graceLeft ? 0 : 1, lk };
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
      a = accts[id] = { gold: int(s.gold, 0, 1e9) ? Math.min(s.gold, SEED_GOLD) : 0, xp: int(s.xp, 0, 1e9) ? Math.min(s.xp, SEED_XP) : 0, last: {}, bet: 0, at: 0, born: t, ns: 0 };
      a.mat = {}; if (s.mat && typeof s.mat == "object") for (const k of MATS) if (int(s.mat[k], 1, MAT_MAX)) a.mat[k] = Math.min(s.mat[k], SEED_MAT);
    }
    if (!a.mat) a.mat = {}; /* accounts from before materials */
    if (t - a.at < SYNC_GAP_MS) return [429, { error: "Too many syncs.", gold: a.gold, xp: a.xp }];
    const prevAt = a.at || t; /* the client may have rented any time since the last sync, when the price was higher */
    a.at = t;
    let dropped = 0, earned = false;
    const cr = { sp: {}, ms: {}, c: 0, used: {}, pt: {}, gd: {} }; /* craft spends in this sync per material (for recipes); contract units delivered (for payouts) */
    for (const e of body.led) {
      const d0 = dropped;
      try {
      if (!Array.isArray(e) || typeof e[0] != "string" || !int(e[1], -1e6, 1e6) || !int(e[2], 0, 1e5)) { dropped++; continue; }
      const [kind, g, x] = e, rule = RULES[kind];
      if (rule) {
        const k = kind + (g ? "g" : "x"); /* a raid's gold and its XP arrive as two entries: timed separately */
        if (g < 0 || g > rule.g || x > rule.x || t - (a.last[k] || 0) < rule.gap) { dropped++; continue; }
        if (kind == "contract" && !contractOk(a, cr, k, t)) { dropped++; continue; } /* last: a refused payout never uses a day slot */
        a.last[k] = t;
        a.gold += g; a.xp += x + (x > 0 ? petBonus(a, "xp", "fx", x) : 0);
        if (g > 0 || x > 0) earned = true;
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
        else if (e[5] > 0) earned = true;
      } else if (kind == "pet") {
        if (!petEntry(a, e[3], e[4], g, x, e[5], t, cr)) dropped++;
      } else if (kind == "garden") {
        if (!gardenEntry(a, e[3], e[4], g, x, e[5], t, cr)) dropped++;
      } else if (SPENDS.includes(kind)) {
        if (g > 0 || x || a.gold + g < 0) { dropped++; continue; }
        a.gold += g;
      } else dropped++; /* dev tools, market (escrow pays itself) and unknown kinds never move the bank */
      } finally { if (onEntry && dropped == d0 && Array.isArray(e)) try { onEntry(e[0], e[1], e[2], e[3]); } catch {} } /* accepted: count it */
    }
    for (const [m, q] of Object.entries(cr.gd)) if (q > 0) a.mat[m] = Math.min(MAT_MAX, (a.mat[m] || 0) + q); /* unused garden spends come back */
    for (const [m, q] of Object.entries(cr.pt)) if (q > 0) a.mat[m] = Math.min(MAT_MAX, (a.mat[m] || 0) + q); /* unused pet spends come back */
    if (earned && t - (a.nsAt || 0) >= NS_GAP) { a.ns = (a.ns || 0) + 1; a.nsAt = t; } /* a real sync (trade unlock): a real earn, at most one per 5 minutes */
    persist();
    return [200, { gold: a.gold, xp: a.xp, mat: { ...a.mat }, tc: codeOf(id), dropped, pet: a.pet ? { own: { ...a.pet.own }, on: a.pet.on } : { own: {}, on: "" }, garden: (a.gd ? a.gd.p : Array(GARDEN.plots).fill(null)).map((c) => (c ? { s: c.s, age: t - c.at, d: c.d } : null)), streak: gsOut(a, t), bjm: a.bjm || 1, bjmAge: a.bjmAt ? t - a.bjmAt : 1e12 }]; /* bjmAge: ms since the last rent (no clock skew) */
  }

  /* ---------- trades ---------- */
  /* indexes: open offers by player (from and to), and two queues in time order so expiry and clean-up never walk every offer */
  const openBy = new Map(), openQ = [], doneQ = [];
  const idx = (pid) => { let s = openBy.get(pid); if (!s) openBy.set(pid, (s = new Set())); return s; };
  for (const tr of Object.values(trades).sort((x, y) => x.at - y.at)) {
    if (tr.st == "open") { openQ.push(tr.id); idx(tr.from).add(tr.id); idx(tr.to).add(tr.id); } else doneQ.push(tr.id);
  }
  function closeTr(tr, st, t) { tr.st = st; tr.end = t; openBy.get(tr.from)?.delete(tr.id); openBy.get(tr.to)?.delete(tr.id); doneQ.push(tr.id); }
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
  const units = (sd) => Object.values(sd.mat).reduce((n, q) => n + q, 0);
  const has = (a, sd) => a.gold >= sd.gold && Object.entries(sd.mat).every(([k, n]) => (a.mat[k] || 0) >= n);
  const room = (a, sd) => Object.entries(sd.mat).every(([k, n]) => (a.mat[k] || 0) + n <= MAT_MAX);
  function take(a, sd) { a.gold -= sd.gold; for (const [k, n] of Object.entries(sd.mat)) a.mat[k] -= n; }
  function put(a, sd, tax) { a.gold += sd.gold - tax; for (const [k, n] of Object.entries(sd.mat)) a.mat[k] = Math.min(MAT_MAX, (a.mat[k] || 0) + n); }
  const taxOf = (g) => (g > 0 ? Math.max(1, Math.ceil(g * TRADE.tax)) : 0); /* rounds up, at least 1 gold */
  /* received today by trade (Sybil guard: alt accounts can't funnel without limit) */
  function inbound(a, t) { const d = Math.floor(t / 86400e3); if (!a.ti || a.ti.d != d) a.ti = { d, m: 0, g: 0 }; return a.ti; }
  const inboundOk = (a, sd, tax, t) => { const r = inbound(a, t); return r.m + units(sd) <= TRADE.inMat && r.g + sd.gold - tax <= TRADE.inGold; };
  function inboundAdd(a, sd, tax, t) { const r = inbound(a, t); r.m += units(sd); r.g += sd.gold - tax; }
  function log(ev, tr, extra) {
    try {
      if (fs.existsSync(tradeLog) && fs.statSync(tradeLog).size > TRADE.logMax) fs.renameSync(tradeLog, tradeLog + ".1"); /* rotate: at most ~2 x logMax on disk */
      fs.appendFileSync(tradeLog, JSON.stringify({ at: new Date(now()).toISOString(), ev, id: tr.id, from: tr.from.slice(0, 12), to: tr.to.slice(0, 12), give: tr.give, want: tr.want, ...extra }) + "\n");
    } catch {}
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
  /* canTrade(w, ip, t): the Sybil guard for offers and accepts. Old accounts (from before birth dates) count as old. */
  const ipDay = new Map(); /* ip -> { d, ids } accounts that traded from it today */
  function canTrade(w, ip, t) {
    if (t - (w.a.born || 0) < TRADE.ageMs || (w.a.ns || 0) < TRADE.syncs) return [403, { error: "Trading unlocks after a day of play (" + Math.min(w.a.ns || 0, TRADE.syncs) + "/" + TRADE.syncs + " syncs)." }];
    if (!ip) return [0];
    const d = Math.floor(t / 86400e3);
    let e = ipDay.get(ip);
    if (!e || e.d != d) ipDay.set(ip, (e = { d, ids: new Set() }));
    if (!e.ids.has(w.id) && e.ids.size >= TRADE.ipAccts) return [429, { error: "Too many accounts trading from this network today." }];
    e.ids.add(w.id);
    if (ipDay.size > 50000) for (const [k, v] of ipDay) if (v.d != d) ipDay.delete(k);
    return [0];
  }
  /* expire(t): refund offers past TRADE.ttl, forget settled ones after TRADE.keepMs; both queues are in time order */
  function expire(t) {
    while (openQ.length) {
      const tr = trades[openQ[0]];
      if (tr && tr.st == "open" && t - tr.at < TRADE.ttl) break;
      openQ.shift();
      if (tr && tr.st == "open") { closeTr(tr, "expired", t); if (accts[tr.from]) put(accts[tr.from], tr.give, 0); log("expire", tr); }
    }
    while (doneQ.length) {
      const tr = trades[doneQ[0]];
      if (tr && t - (tr.end || tr.at) < TRADE.keepMs) break;
      doneQ.shift();
      if (tr && tr.st != "open") delete trades[tr.id];
    }
  }
  function tradeOffer(body, ip) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const to = typeof body.to == "string" && byCode.get(body.to);
    if (!to || !accts[to]) return [404, { error: "No player with that trade code." }];
    if (to == w.id) return [400, { error: "You can't trade with yourself." }];
    const give = side(body.give), want = side(body.want);
    if (!give || !want) return [400, { error: "Bad trade amounts." }];
    if (!give.gold && !units(give) && !want.gold && !units(want)) return [400, { error: "An empty trade." }];
    const [ct, cv] = canTrade(w, ip, t); if (ct) return [ct, cv];
    const mine = [...idx(w.id)].filter((k) => trades[k] && trades[k].from == w.id).length;
    if (mine >= TRADE.open) return [429, { error: "Too many open offers." }];
    if (idx(to).size >= TRADE.inbox) return [429, { error: "That player has too many offers waiting." }];
    if (!has(w.a, give)) return [409, { error: "You don't have what you offer." }];
    take(w.a, give); /* escrow: the offer is the proposer's confirm */
    const id = hash(w.id + ":" + t + ":" + Math.random()).slice(0, 16);
    const tr = (trades[id] = { id, from: w.id, to, give, want, st: "open", at: t });
    openQ.push(id); idx(w.id).add(id); idx(to).add(id);
    log("offer", tr); persist();
    return [200, { id, gold: w.a.gold, mat: { ...w.a.mat } }];
  }
  function tradeAccept(body, ip) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const tr = typeof body.id == "string" && trades[body.id];
    if (!tr || tr.to != w.id) return [404, { error: "No such offer for you." }];
    if (tr.st != "open") return [409, { error: "This offer is " + tr.st + "." }];
    const [ct, cv] = canTrade(w, ip, t); if (ct) return [ct, cv];
    const from = accts[tr.from];
    if (!from) return [409, { error: "The other player is gone." }];
    if (!has(w.a, tr.want)) return [409, { error: "You don't have what they want." }];
    const taxIn = taxOf(tr.give.gold), taxOut = taxOf(tr.want.gold);
    if (!room(w.a, tr.give) || !room(from, tr.want)) return [409, { error: "Someone's bag is full for this trade." }];
    if (!inboundOk(w.a, tr.give, taxIn, t) || !inboundOk(from, tr.want, taxOut, t)) return [409, { error: "Daily trade limit reached: try again tomorrow." }];
    closeTr(tr, "done", t); /* first, so nothing can settle it twice */
    take(w.a, tr.want); put(w.a, tr.give, taxIn); put(from, tr.want, taxOut);
    inboundAdd(w.a, tr.give, taxIn, t); inboundAdd(from, tr.want, taxOut, t);
    log("done", tr, { tax: taxIn + taxOut }); persist();
    return [200, { gold: w.a.gold, mat: { ...w.a.mat }, tax: taxIn + taxOut }];
  }
  function tradeCancel(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const tr = typeof body.id == "string" && trades[body.id];
    if (!tr || (tr.from != w.id && tr.to != w.id)) return [404, { error: "No such offer." }];
    if (tr.st != "open") return [409, { error: "This offer is " + tr.st + "." }];
    closeTr(tr, tr.from == w.id ? "cancelled" : "declined", t);
    if (accts[tr.from]) put(accts[tr.from], tr.give, 0); /* escrow back to the proposer (capped at the bag limit) */
    log(tr.st, tr); persist();
    return [200, { gold: w.a.gold, mat: { ...w.a.mat } }];
  }
  function tradeList(body) {
    const t = now(); expire(t);
    const [st, w] = who(body || {}, t); if (st) return [st, w];
    const view = (tr) => ({ id: tr.id, out: tr.from == w.id, give: tr.give, want: tr.want, left: Math.max(0, TRADE.ttl - (t - tr.at)) });
    const offers = [...idx(w.id)].map((k) => trades[k]).filter((tr) => tr && tr.st == "open").map(view);
    return [200, { tc: codeOf(w.id), offers, gold: w.a.gold, mat: { ...w.a.mat }, unlock: { syncs: Math.min(w.a.ns || 0, TRADE.syncs), need: TRADE.syncs, ready: t - (w.a.born || 0) >= TRADE.ageMs && (w.a.ns || 0) >= TRADE.syncs } }];
  }

  return { sync, flush, tradeOffer, tradeAccept, tradeCancel, tradeList, TRADE, RULES, MAT_SRC, ASSIST, assistPrice, size: () => Object.keys(accts).length };
}

module.exports = { createBank, PET, GARDEN, RULES, ASSIST, SEEDS_PER_IP, MATS, MAT_SRC, TRADE };
