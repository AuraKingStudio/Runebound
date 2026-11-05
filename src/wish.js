/* Rune Wishes: the hub's free gacha shrine and its three minigames (Fortune Wheel, Rune Reels, Treasure Dig).
   ALL FREE: no money, no paid currency. Wish Tokens are earned by play only; the bank owns them online.
   Security (assume the client is reverse engineered): every roll here uses crypto RNG (or an injected rng in tests);
   the client sends only {tok, op args} and animates what comes back. Token grants come only from this server's own
   events (daily by server UTC day, the minigames below, accepted Cipher wins / garden harvests / raid wins), each with
   a day cap, plus a total day cap. Dig boards are server-held (one open per account, one-time 24-hex ids, 10 min ttl).
   Account data is bounded: owned cosmetics only from the fixed catalogue (Object.hasOwn), counters clamped.
   Pity: an Epic or better at least every 10 pulls; Legendary at the 60th pull at the latest, soft pity from pull 45
   (+6% Legendary per pull after 44). Duplicate cosmetics turn into Stardust; the Stardust shop sells any cosmetic. */
"use strict";
const { randomInt, randomBytes } = require("node:crypto");

/* odds in parts per 10000 (shown in the banner as exact %); the client keeps an identical copy (a test checks it) */
const WISH = {
  odds: { L: 60, E: 510, R: 2500, C: 6930 },
  epicEvery: 10, hard: 60, soft: 45, softAdd: 600,
  dupe: { R: 5, E: 25, L: 100 }, /* stardust for a duplicate cosmetic */
  shop: { R: 40, E: 160, L: 600 }, /* stardust price of a chosen cosmetic */
  tokMax: 999, sdMax: 99999,
  dayCap: 40, /* most tokens earned per UTC day from everything */
  src: { daily: 3, cipher: 4, garden: 3, raid: 3 }, /* per-source day caps (daily: the gift size, once a day) */
  /* item pools by tier: [id, kind, name, payload]; kind m = materials (never a dupe), sd = stardust, t title, a aura, h pet hat, n name effect */
  pool: {
    C: [["c_ore", "m", "Ore bundle", { ore: 4 }], ["c_herb", "m", "Moonleaf bundle", { herb: 4 }], ["c_dust", "m", "Rune dust", { dust: 4 }], ["c_echo", "m", "Skycrystal", { echo: 1 }], ["c_sd", "sd", "Stardust pouch", 5]],
    R: [["t_lucky", "t", "Title: Lucky Star"], ["t_dream", "t", "Title: Dreamwalker"], ["t_moth", "t", "Title: Lantern Moth"], ["t_rune", "t", "Title: Runeborn"],
      ["r_shard", "m", "Shard cache", { shard: 2 }], ["r_bark", "m", "Bark cache", { bark: 2 }], ["r_echo", "m", "Crystal cluster", { echo: 3 }]],
    E: [["a_ember", "a", "Aura: Ember Ring"], ["a_tide", "a", "Aura: Tidal Halo"], ["a_bloom", "a", "Aura: Petal Bloom"],
      ["h_crown", "h", "Pet hat: Tiny Crown"], ["h_witch", "h", "Pet hat: Witch Hat"], ["h_halo", "h", "Pet hat: Halo"]],
    L: [["n_prism", "n", "Name: Prism"], ["n_star", "n", "Name: Starfire"], ["a_aether", "a", "Aura: Aether Wings"]],
  },
  /* Fortune Wheel: 2 spins a day. [weight, prize]; prize { tok?, sd?, mat? } */
  wheel: { day: 2, seg: [[22, { tok: 1 }], [16, { sd: 10 }], [18, { mat: { ore: 6 } }], [12, { tok: 2 }], [18, { mat: { herb: 6 } }], [8, { tok: 3 }], [5, { sd: 40 }], [1, { tok: 10 }]] },
  /* Rune Reels: 6 spins a day, 3 reels of 6 runes, weighted per reel. Pays by the best match. */
  reels: { day: 6, w: [30, 24, 18, 14, 9, 5], three: [{ sd: 8 }, { sd: 12 }, { tok: 1 }, { tok: 2 }, { tok: 3 }, { tok: 8 }], two: { sd: 3 }, none: { sd: 1 } },
  /* Treasure Dig: 3 boards a day, 5x5 tiles, 6 picks; a cave-in (2 hidden) ends the board early (finds kept). */
  dig: { day: 3, n: 25, picks: 6, ttl: 600e3, tiles: [["chest", 1, { tok: 3 }], ["tok", 3, { tok: 1 }], ["sd", 4, { sd: 6 }], ["gem", 3, { mat: { shard: 1 } }], ["ore", 3, { mat: { ore: 3 } }], ["cave", 2, null]] },
};
const TIERS = ["C", "R", "E", "L"];
const CAT = {}; /* id -> [tier, kind, name, payload] */
for (const t of TIERS) for (const [id, k, n, p] of WISH.pool[t]) CAT[id] = [t, k, n, p];
const COSM = (id) => Object.hasOwn(CAT, id) && "tahn".includes(CAT[id][1]);
const utcDay = (t) => Math.floor(t / 86400e3);
const cnum = (v, hi) => (Number.isInteger(v) && v >= 0 ? Math.min(v, hi) : 0);

/* rollTier(w, rng): one pull's tier, moving the pity counters in w ({ p10, p60 }) */
function rollTier(w, rng) {
  w.p10 = cnum(w.p10, 99) + 1; w.p60 = cnum(w.p60, 999) + 1;
  const o = WISH.odds, L = w.p60 >= WISH.hard ? 10000 : w.p60 >= WISH.soft ? o.L + (w.p60 - WISH.soft + 1) * WISH.softAdd : o.L;
  const r = rng(10000);
  let tier = r < L ? "L" : r < L + o.E ? "E" : r < L + o.E + o.R ? "R" : "C";
  if (tier != "L" && tier != "E" && w.p10 >= WISH.epicEvery) tier = "E";
  if (tier == "L") { w.p60 = 0; w.p10 = 0; } else if (tier == "E") w.p10 = 0;
  return tier;
}

/* createWish({ acct(tok) -> [id, a] | null, now, persist, onEntry, matMax, rng? }) */
function createWish(o) {
  const rng = typeof o.rng == "function" ? o.rng : (n) => randomInt(n);
  const digs = new Map(), byAcct = new Map(), ipHits = new Map();
  const st = (a, t) => {
    let w = a.wi;
    if (!w || typeof w != "object") w = a.wi = {};
    w.t = cnum(w.t, WISH.tokMax); w.sd = cnum(w.sd, WISH.sdMax); w.p10 = cnum(w.p10, 99); w.p60 = cnum(w.p60, 999); w.n = cnum(w.n, 1e9);
    if (!w.own || typeof w.own != "object") w.own = {};
    const d = utcDay(t);
    if (!w.dy || w.dy.d !== d) w.dy = { d, e: 0, s: {} };
    return w;
  };
  const view = (a, w) => ({ t: w.t, sd: w.sd, p10: w.p10, p60: w.p60, n: w.n, own: Object.keys(w.own).filter(COSM), day: { e: w.dy.e, s: { ...w.dy.s }, cap: WISH.dayCap }, mat: { ...a.mat } });
  /* give(a, w, prize, src): apply a prize; tokens obey the day caps. Out: what was really given */
  function give(a, w, p, src) {
    const got = {};
    if (p.tok) { const n = Math.max(0, Math.min(p.tok, WISH.dayCap - w.dy.e, WISH.tokMax - w.t)); if (n) { w.t += n; w.dy.e += n; got.tok = n; } }
    if (p.sd) { const n = Math.min(p.sd, WISH.sdMax - w.sd); if (n > 0) { w.sd += n; got.sd = n; } }
    if (p.mat) for (const [m, n] of Object.entries(p.mat)) { a.mat[m] = Math.min(o.matMax, (a.mat[m] || 0) + n); got.mat = got.mat || {}; got.mat[m] = n; }
    return got;
  }
  /* grant(a, src, n): server-side token grant after an accepted bank event (cipher / garden / raid), capped per source and day */
  function grant(a, src, n = 1) {
    if (!a || !Object.hasOwn(WISH.src, src) || src == "daily") return 0;
    const w = st(a, o.now()), used = cnum(w.dy.s[src], 999), k = Math.max(0, Math.min(n, WISH.src[src] - used));
    if (!k) return 0;
    const got = give(a, w, { tok: k }, src);
    if (got.tok) w.dy.s[src] = used + got.tok;
    return got.tok || 0;
  }
  const who = (b, t) => { const w = o.acct(b && b.tok); if (!w) return null; return [w[0], w[1], st(w[1], t)]; };
  const track = (k) => { if (o.onEntry) try { o.onEntry("wish", 0, 0, k); } catch {} };

  /* the pull itself: n = 1 or 10 */
  function pull(a, w, n) {
    const res = [];
    for (let i = 0; i < n; i++) {
      const tier = rollTier(w, rng), pool = WISH.pool[tier], it = pool[Math.min(pool.length - 1, rng(pool.length))], [id, k, nm, p] = it;
      const r = { id, tier, nm };
      if (k == "m") r.got = give(a, w, { mat: p });
      else if (k == "sd") r.got = give(a, w, { sd: p });
      else if (w.own[id]) { r.dupe = 1; r.got = give(a, w, { sd: WISH.dupe[tier] }); }
      else { w.own[id] = 1; r.new = 1; }
      res.push(r);
    }
    w.n += n;
    return res;
  }

  const ops = {
    state: (a, w) => [200, view(a, w)],
    daily(a, w, b, t) {
      if (w.dy.s.daily) return [403, { error: "Already claimed today.", ...view(a, w) }];
      const got = give(a, w, { tok: WISH.src.daily }, "daily"); w.dy.s.daily = 1;
      track("daily");
      return [200, { got, ...view(a, w) }];
    },
    pull(a, w, b) {
      const n = b.n === 10 ? 10 : b.n === 1 ? 1 : 0;
      if (!n) return [400, { error: "Pull 1 or 10." }];
      if (w.t < n) return [403, { error: "Not enough Wish Tokens.", ...view(a, w) }];
      w.t -= n;
      const res = pull(a, w, n);
      track(n == 10 ? "pull10" : "pull1");
      return [200, { res, ...view(a, w) }];
    },
    shop(a, w, b) {
      const id = b.id;
      if (typeof id != "string" || !COSM(id)) return [400, { error: "Unknown item." }];
      if (w.own[id]) return [403, { error: "Already yours.", ...view(a, w) }];
      const price = WISH.shop[CAT[id][0]];
      if (w.sd < price) return [403, { error: "Not enough Stardust.", ...view(a, w) }];
      w.sd -= price; w.own[id] = 1;
      track("shop");
      return [200, { id, ...view(a, w) }];
    },
    wheel(a, w) {
      const u = cnum(w.dy.s.wheel, 99);
      if (u >= WISH.wheel.day) return [403, { error: "The wheel rests until tomorrow.", ...view(a, w) }];
      w.dy.s.wheel = u + 1;
      const seg = WISH.wheel.seg, tot = seg.reduce((s, x) => s + x[0], 0);
      let r = rng(tot), i = 0;
      while (r >= seg[i][0]) r -= seg[i++][0];
      const got = give(a, w, seg[i][1], "wheel");
      track("wheel");
      return [200, { seg: i, got, ...view(a, w) }];
    },
    reels(a, w) {
      const u = cnum(w.dy.s.reels, 99);
      if (u >= WISH.reels.day) return [403, { error: "The reels rest until tomorrow.", ...view(a, w) }];
      w.dy.s.reels = u + 1;
      const R = WISH.reels, tot = R.w.reduce((s, x) => s + x, 0);
      const one = () => { let r = rng(tot), i = 0; while (r >= R.w[i]) r -= R.w[i++]; return i; };
      const reels = [one(), one(), one()], [x, y, z] = reels;
      const p = x == y && y == z ? R.three[x] : x == y || y == z || x == z ? R.two : R.none;
      const got = give(a, w, p, "reels");
      track("reels");
      return [200, { reels, got, ...view(a, w) }];
    },
    /* dig: no id = start a board (if none open); with id + i = reveal tile i */
    dig(a, w, b, t, id0) {
      for (const [k, d] of digs) if (t - d.at > WISH.dig.ttl) { digs.delete(k); if (byAcct.get(d.who) == k) byAcct.delete(d.who); }
      if (b.id === undefined) {
        const cur = byAcct.get(id0), cd = cur && digs.get(cur);
        if (cd) return [200, { id: cur, open: cd.open, picks: WISH.dig.picks - cd.open.length, ...view(a, w) }]; /* resume the open board */
        const u = cnum(w.dy.s.dig, 99);
        if (u >= WISH.dig.day) return [403, { error: "The dig site rests until tomorrow.", ...view(a, w) }];
        w.dy.s.dig = u + 1;
        const tiles = []; for (const [k, n] of WISH.dig.tiles) for (let i = 0; i < n; i++) tiles.push(k);
        while (tiles.length < WISH.dig.n) tiles.push("dirt");
        for (let i = tiles.length - 1; i > 0; i--) { const j = rng(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
        const id = randomBytes(12).toString("hex");
        digs.set(id, { who: id0, tiles, open: [], at: t }); byAcct.set(id0, id);
        if (digs.size > 20000) { const k = digs.keys().next().value; digs.delete(k); }
        track("dig");
        return [200, { id, open: [], picks: WISH.dig.picks, ...view(a, w) }];
      }
      const d = typeof b.id == "string" && /^[a-f0-9]{24}$/.test(b.id) ? digs.get(b.id) : null;
      if (!d || d.who != id0) return [403, { error: "Unknown dig." }];
      const i = b.i;
      if (!Number.isInteger(i) || i < 0 || i >= WISH.dig.n || d.open.some((x) => x[0] == i)) return [400, { error: "Pick a closed tile." }];
      const k = d.tiles[i], def = WISH.dig.tiles.find((x) => x[0] == k), got = def && def[2] ? give(a, w, def[2], "dig") : {};
      d.open.push([i, k]);
      const over = k == "cave" || d.open.length >= WISH.dig.picks;
      if (over) { digs.delete(b.id); byAcct.delete(id0); }
      return [200, { i, k, got, over, picks: WISH.dig.picks - d.open.length, board: over ? d.tiles : undefined, ...view(a, w) }];
    },
  };

  /* call(op, body, ip): the route; per-IP limit 120 calls a minute */
  function call(op, body, ip) {
    if (!Object.hasOwn(ops, op)) return [404, { error: "Unknown." }];
    const t = o.now(), b = body && typeof body == "object" ? body : {};
    const hits = (ipHits.get(ip) || []).filter((x) => t - x < 60e3);
    if (hits.length >= 120) return [429, { error: "Slow down." }];
    hits.push(t); ipHits.set(ip, hits);
    if (ipHits.size > 20000) for (const [k, v] of ipHits) if (t - v[v.length - 1] > 60e3) ipHits.delete(k);
    const w = who(b, t);
    if (!w) return [403, { error: "No online account." }];
    const r = ops[op](w[1], w[2], b, t, w[0]);
    if (op != "state") o.persist();
    return r;
  }
  return { call, grant, _digs: digs };
}

module.exports = { createWish, rollTier, WISH, CAT };
