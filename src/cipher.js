/* Cipher: a short minigame that pops up while gathering, one per gather job, paying a bonus pack of that job's material.
   It doubles as a bot trap. Honest limits: this is NOT a perfect captcha. A determined bot author can script it.
   What it does is raise the cost of botting: the server makes every puzzle (random params, crypto RNG), each id is a
   one-time nonce (deleted on any attempt), answers are checked here against server-kept solutions, the server clock
   measures human-scale minimum times (too fast = strike, 3 strikes = locked for the UTC day), a start needs 10
   ACCEPTED gathers of that job since its last cipher, 6 packs a day, 1 open challenge per account, 20 starts/IP/hour.
   Games:  mine (ore)  timing bar: 3 strikes, each phase 0-1 must fall in params.zone (+-TOL). min 1500 ms.
           herb (herb) 9 glyph leaves, 4 glow in order: taps = those 4 leaf indexes in order. min 1200 ms.
           echo (echo) 4-6 tones 0-5 played once: taps = the tones in order. min 1500 + 300 per tone.
   The client's ms is kept only as the last reported value (diagnostics); every decision uses the server clock. */
"use strict";

const { randomBytes, randomInt } = require("node:crypto");

const CIPHER = { need: 10, day: 6, strikes: 3, ttl: 30000, ipHour: 20, pack: 5, tol: 0.03, maxOpen: 20000,
  jobs: { ore: "mine", herb: "herb", echo: "echo" },
  bonus: ["dust", "dust", "shard", "bark"] /* 1 in 4 packs add 1 of these (never a rare: no eye/heart) */ };
const minMs = (c) => (c.game == "mine" ? 1500 : c.game == "herb" ? 1200 : 1500 + 300 * c.ans.length);
const utcDay = (t) => Math.floor(t / 86400e3);

function makeGame(game) {
  if (game == "mine") {
    const speed = randomInt(180, 321), width = randomInt(240, 321), zw = randomInt(12, 21) / 100, a = randomInt(5, Math.round((0.95 - zw) * 100) + 1) / 100;
    const zone = [a, Math.round((a + zw) * 100) / 100];
    return { params: { speed, width, zone, period: Math.round((2 * width / speed) * 1000) }, ans: zone };
  }
  if (game == "herb") {
    const glyphs = Array.from({ length: 12 }, (_, i) => i);
    for (let i = glyphs.length - 1; i > 0; i--) { const j = randomInt(i + 1); [glyphs[i], glyphs[j]] = [glyphs[j], glyphs[i]]; }
    const idx = Array.from({ length: 9 }, (_, i) => i);
    for (let i = 8; i > 0; i--) { const j = randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const seq = idx.slice(0, 4);
    return { params: { grid: glyphs.slice(0, 9), seq }, ans: seq };
  }
  const tones = Array.from({ length: randomInt(4, 7) }, () => randomInt(6));
  return { params: { tones }, ans: tones };
}

function check(c, taps) {
  if (!Array.isArray(taps)) return false;
  if (c.game == "mine") {
    const [a, b] = c.ans;
    return taps.length == 3 && taps.every((p) => typeof p == "number" && Number.isFinite(p) && p >= a - CIPHER.tol && p <= b + CIPHER.tol);
  }
  return taps.length == c.ans.length && taps.every((v, i) => v === c.ans[i]);
}

/* createCipher({ acct(tok) -> [id, a] | null, now, persist, onEntry, matMax }) */
function createCipher(o) {
  const open = new Map(), byAcct = new Map(), ipHits = new Map();
  const day = (a, t) => { if (!a.ci || a.ci.d != utcDay(t)) a.ci = { d: utcDay(t), packs: 0, strikes: 0 }; return a.ci; };
  function sweep(t) {
    if (open.size < CIPHER.maxOpen) return;
    for (const [k, c] of open) if (t - c.at > CIPHER.ttl) { open.delete(k); if (byAcct.get(c.who) == k) byAcct.delete(c.who); }
  }
  /* gathered(a, mat): one ACCEPTED gather entry of mat (the bank calls this) */
  function gathered(a, k) { if (CIPHER.jobs[k]) { a.cg = a.cg || {}; a.cg[k] = Math.min(1e6, (a.cg[k] || 0) + 1); } }

  function start(body, ip) {
    const t = o.now(), b = body && typeof body == "object" ? body : {};
    const w = o.acct(b.tok);
    if (!w) return [403, { error: "No online account." }];
    const [who, a] = w, job = b.job;
    if (typeof job != "string" || !Object.hasOwn(CIPHER.jobs, job)) return [403, { error: "Unknown job." }];
    const ci = day(a, t);
    if (ci.strikes >= CIPHER.strikes) return [403, { error: "Rest a while" }];
    if (ci.packs >= CIPHER.day) return [403, { error: "No more ciphers today." }];
    const cur = byAcct.get(who), cc = cur && open.get(cur);
    if (cc && t - cc.at <= CIPHER.ttl) return [403, { error: "A cipher is already open." }];
    if (cur) { open.delete(cur); byAcct.delete(who); }
    if (((a.cg && a.cg[job]) || 0) < CIPHER.need) return [403, { error: "Gather more first." }];
    const hits = (ipHits.get(ip) || []).filter((x) => t - x < 3600e3);
    if (hits.length >= CIPHER.ipHour) return [403, { error: "Too many ciphers from this address." }];
    hits.push(t); ipHits.set(ip, hits);
    if (ipHits.size > 20000) for (const [k, v] of ipHits) if (t - v[v.length - 1] > 3600e3) ipHits.delete(k);
    sweep(t);
    a.cg[job] = 0; /* this job's gathers are used up by this challenge */
    const game = CIPHER.jobs[job], g = makeGame(game), id = randomBytes(12).toString("hex");
    open.set(id, { who, job, game, ans: g.ans, at: t });
    byAcct.set(who, id);
    o.persist();
    return [200, { id, game, params: g.params, exp: CIPHER.ttl }];
  }

  function solve(body) {
    const t = o.now(), b = body && typeof body == "object" ? body : {};
    const w = o.acct(b.tok);
    if (!w) return [200, { ok: false, why: "No online account." }];
    const [who, a] = w;
    const c = typeof b.id == "string" && /^[a-f0-9]{24}$/.test(b.id) ? open.get(b.id) : null;
    if (!c || c.who != who) return [200, { ok: false, why: "Unknown cipher." }]; /* another account's id: untouched, not theirs to burn */
    open.delete(b.id); if (byAcct.get(who) == b.id) byAcct.delete(who); /* one try, whatever the outcome */
    const ci = day(a, t);
    if (typeof b.ms == "number" && Number.isFinite(b.ms)) ci.ms = Math.max(0, Math.min(1e6, Math.round(b.ms))); /* logged only */
    if (t - c.at > CIPHER.ttl) { o.persist(); return [200, { ok: false, why: "Expired." }]; }
    if (t - c.at < minMs(c)) { ci.strikes++; o.persist(); return [200, { ok: false, why: "Too fast." }]; }
    if (!check(c, b.taps)) { o.persist(); return [200, { ok: false, why: "Wrong." }]; }
    if (ci.packs >= CIPHER.day) { o.persist(); return [200, { ok: false, why: "No more ciphers today." }]; }
    ci.packs++;
    const pack = { [c.job]: CIPHER.pack };
    if (randomInt(4) == 0) { const m = CIPHER.bonus[randomInt(CIPHER.bonus.length)]; pack[m] = (pack[m] || 0) + 1; }
    for (const [m, n] of Object.entries(pack)) a.mat[m] = Math.min(o.matMax, (a.mat[m] || 0) + n);
    if (o.onEntry) try { o.onEntry("cipher", 0, 0, c.job); } catch {}
    if (o.onWin) o.onWin(a); /* a Wish Token (capped per day in src/wish.js) */
    o.persist();
    return [200, { ok: true, pack, mat: { ...a.mat } }];
  }
  return { start, solve, gathered, _open: open };
}

module.exports = { createCipher, CIPHER };
