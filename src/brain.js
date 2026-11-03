"use strict";
/* The epic boss's shared brain (one for everyone), kept by the hub service.
   - Dodge model: a small neural network (6 inputs -> 8 tanh -> 2) that predicts where a player will be ~0.7 s later from what
     the boss sees now: [dx, dy] from the boss (/300), velocity [vx, vy] (/250), dash ready (0/1), health (0..1).
     Output: the player's displacement / 150. The boss leads its aimed spells with it.
   - Spell scores: for each spell, an average of how many players it hit per cast (EMA). The boss favours spells that work.
   - Generation: +1 for every fight that improves it. The boss trusts the brain more as it grows (client: min(cap, gen / 40)).
   Players never send weights, only observations (samples) and spell hit counts; the server validates, caps and trains on
   them itself. One training per player key per 60 s. Storage: brain.json, atomic writes (temp + rename).
   Training: Adam (lr 0.01, b1 .9, b2 .999), shuffled mini-batches of 32, L2 weight decay, gradient clipping, and a 20%
   held-out validation split: a fight that makes validation worse (or produces NaN) is rolled back. The last 20 generations
   are kept for rollback.
   Owner controls (ADMIN_KEY env on the server, never in the game files): /api/brain/admin { key, action, value }:
   "cap" 0..1 (difficulty dial: how much the boss may trust the brain), "rollback" (to a kept generation), "reset". */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const IN = 6, HID = 8, OUT = 2;
const SPELLS = ["slam", "marks", "lances", "hex", "cross", "judge", "storm", "ring", "rain", "split", "nova", "charge"];

function freshBrain() {
  let x = 12345; /* deterministic small init */
  const r = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 0.6;
  return { gen: 0, cap: 1, hist: [], fights: 0, samples: 0, w1: Array.from({ length: HID }, () => Array.from({ length: IN }, r)), b1: Array(HID).fill(0),
    w2: Array.from({ length: OUT }, () => Array.from({ length: HID }, r)), b2: Array(OUT).fill(0), spells: {}, loss: null, val: null, opt: null };
}
function forward(B, f) {
  const h = B.w1.map((row, j) => Math.tanh(row.reduce((a, w, i) => a + w * f[i], B.b1[j])));
  const o = B.w2.map((row, k) => row.reduce((a, w, j) => a + w * h[j], B.b2[k]));
  return { h, o };
}
const zeros = (B) => ({ w1: B.w1.map((r) => r.map(() => 0)), b1: B.b1.map(() => 0), w2: B.w2.map((r) => r.map(() => 0)), b2: B.b2.map(() => 0) });
const mse = (B, data) => (data.length ? data.reduce((a, [f, t]) => { const { o } = forward(B, f); return a + o.reduce((q, v, k) => q + (v - t[k]) ** 2, 0) / OUT; }, 0) / data.length : 0);
const matrix = (v, rows, columns) => Array.isArray(v) && v.length === rows && v.every((r) => Array.isArray(r) && r.length === columns && r.every(Number.isFinite));
const vector = (v, length) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);
const finite = (B) => matrix(B.w1, HID, IN) && matrix(B.w2, OUT, HID) && vector(B.b1, HID) && vector(B.b2, OUT);
/* train(B, samples): Adam on shuffled mini-batches, L2 decay, gradient clipping. Mutates B (and B.opt, the Adam moments). */
function train(B, samples, { lr = 0.01, epochs = 6, batch = 32, l2 = 1e-4, clip = 1 } = {}) {
  const opt = B.opt && B.opt.m ? B.opt : (B.opt = { m: zeros(B), v: zeros(B), t: 0 });
  const data = samples.slice();
  for (let e = 0; e < epochs; e++) {
    for (let i = data.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [data[i], data[k]] = [data[k], data[i]]; }
    for (let s0 = 0; s0 < data.length; s0 += batch) {
      const g = zeros(B), part = data.slice(s0, s0 + batch), n = part.length;
      for (const [f, t] of part) {
        const { h, o } = forward(B, f), d = o.map((v, k) => (2 * (v - t[k])) / OUT);
        for (let k = 0; k < OUT; k++) { for (let j = 0; j < HID; j++) g.w2[k][j] += d[k] * h[j]; g.b2[k] += d[k]; }
        for (let j = 0; j < HID; j++) {
          const gh = (1 - h[j] * h[j]) * d.reduce((a, dk, k) => a + dk * B.w2[k][j], 0);
          for (let i = 0; i < IN; i++) g.w1[j][i] += gh * f[i];
          g.b1[j] += gh;
        }
      }
      opt.t++;
      const b1 = 0.9, b2 = 0.999, c1 = 1 - b1 ** opt.t, c2 = 1 - b2 ** opt.t;
      const upd = (w, gr, M, V, at, decay) => { /* one Adam step for weight at[] of tensor w */
        let gg = gr / n + (decay ? l2 * w : 0);
        gg = Math.max(-clip, Math.min(clip, gg));
        const m = b1 * M + (1 - b1) * gg, v = b2 * V + (1 - b2) * gg * gg;
        at(w - (lr * (m / c1)) / (Math.sqrt(v / c2) + 1e-8), m, v);
      };
      for (const [W, G, M, V, decay] of [[B.w1, g.w1, opt.m.w1, opt.v.w1, 1], [B.w2, g.w2, opt.m.w2, opt.v.w2, 1]])
        W.forEach((row, r) => row.forEach((w, c) => upd(w, G[r][c], M[r][c], V[r][c], (nw, m, v) => { row[c] = nw; M[r][c] = m; V[r][c] = v; }, decay)));
      for (const [W, G, M, V] of [[B.b1, g.b1, opt.m.b1, opt.v.b1], [B.b2, g.b2, opt.m.b2, opt.v.b2]])
        W.forEach((w, c) => upd(w, G[c], M[c], V[c], (nw, m, v) => { W[c] = nw; M[c] = m; V[c] = v; }, 0));
    }
  }
  return mse(B, samples);
}
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

function createBrain(options = {}) {
  const file = options.file || path.join(__dirname, "..", "brain.json");
  const now = options.now || (() => Date.now());
  let B = freshBrain();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw || !finite(raw) || !Number.isInteger(raw.gen) || raw.gen < 0 ||
      !Number.isFinite(raw.cap) || raw.cap < 0 || raw.cap > 1 ||
      !Array.isArray(raw.hist) || !Number.isInteger(raw.fights) || !Number.isInteger(raw.samples) ||
      !raw.spells || typeof raw.spells !== "object" || Array.isArray(raw.spells))
      throw new Error("Brain store has an invalid shape.");
    B = Object.assign(freshBrain(), raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lastTrain = new Map();
  let timer = null;
  function save(sync) {
    const write = () => { timer = null; const tmp = file + ".tmp"; try { fs.writeFileSync(tmp, JSON.stringify(B)); fs.renameSync(tmp, file); } catch (e) { console.error("brain save failed:", e.message); } };
    if (sync) { if (timer) clearTimeout(timer); return write(); }
    if (!timer) timer = setTimeout(write, 500);
  }
  const pub = () => ({ gen: B.gen, cap: B.cap, fights: B.fights, samples: B.samples, w1: B.w1, b1: B.b1, w2: B.w2, b2: B.b2, spells: B.spells, loss: B.loss, val: B.val });
  const snap = () => JSON.parse(JSON.stringify({ gen: B.gen, w1: B.w1, b1: B.b1, w2: B.w2, b2: B.b2, spells: B.spells, loss: B.loss, val: B.val }));
  return {
    get() { return [200, pub()]; },
    /* body: { tok, samples: [[f6], [t2]] (10..600), spells: { key: [hits, casts] } } */
    train(body) {
      if (typeof body.tok !== "string" || !/^[a-f0-9]{32}$/.test(body.tok)) return [400, { error: "Key is invalid." }];
      const who = crypto.createHash("sha256").update(body.tok).digest("hex"), t = now();
      if (t - (lastTrain.get(who) || -1e12) < 60000) return [429, { error: "The brain is still digesting your last fight." }];
      if (!Array.isArray(body.samples) || body.samples.length > 600) return [400, { error: "Samples are invalid." }];
      const samples = [];
      for (const s of body.samples) {
        if (!Array.isArray(s) || s.length !== 2 || !Array.isArray(s[0]) || s[0].length !== IN || !Array.isArray(s[1]) || s[1].length !== OUT) continue;
        const f = s[0].map((v) => num(v, -4, 4)), y = s[1].map((v) => num(v, -3, 3));
        if (f.every((v) => v !== null) && y.every((v) => v !== null)) samples.push([f, y]);
      }
      if (samples.length < 10) return [400, { error: "Not enough samples to learn from." }];
      lastTrain.set(who, t);
      /* spell scores update whatever happens to the network */
      if (body.spells && typeof body.spells === "object") for (const k of SPELLS) {
        const v = body.spells[k];
        if (!Array.isArray(v) || v.length !== 2) continue;
        const hits = num(v[0], 0, 200), casts = num(v[1], 1, 100);
        if (hits === null || casts === null) continue;
        B.spells[k] = +((B.spells[k] ?? 0.5) * 0.85 + (hits / casts) * 0.15).toFixed(3);
      }
      /* hold out 20% to check the fight really improved the network; roll back if it got worse or broke */
      for (let i = samples.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [samples[i], samples[k]] = [samples[k], samples[i]]; }
      const nv = Math.max(2, Math.floor(samples.length * 0.2)), val = samples.slice(0, nv), fit = samples.slice(nv);
      const before = snap(), opt0 = JSON.stringify(B.opt || null), vb = mse(B, val);
      const loss = train(B, fit), va = mse(B, val);
      if (!finite(B) || !Number.isFinite(va) || va > vb * 1.02 + 1e-4) {
        Object.assign(B, { w1: before.w1, b1: before.b1, w2: before.w2, b2: before.b2 });
        B.opt = JSON.parse(opt0);
        save();
        return [200, { gen: B.gen, kept: false, val: +vb.toFixed(4) }];
      }
      B.loss = +loss.toFixed(4); B.val = +va.toFixed(4);
      B.hist = (B.hist || []).concat([before]).slice(-20);
      B.gen++; B.fights++; B.samples += samples.length;
      save();
      return [200, { gen: B.gen, kept: true, loss: B.loss, val: B.val }];
    },
    admin(body) {
      const key = options.adminKey ?? process.env.ADMIN_KEY;
      if (typeof key !== "string" || !key || typeof body.key !== "string") return [403, { error: "Forbidden." }];
      const provided = Buffer.from(body.key), expected = Buffer.from(key);
      if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return [403, { error: "Forbidden." }];
      if (body.action === "cap") { const c = num(body.value, 0, 1); if (c === null) return [400, { error: "cap must be 0..1" }]; B.cap = c; }
      else if (body.action === "rollback") { const h = (B.hist || []).find((x) => x.gen === body.value); if (!h) return [404, { error: "No such generation kept." }]; Object.assign(B, h); B.opt = null; }
      else if (body.action === "reset") { const cap = B.cap; B = freshBrain(); B.cap = cap; }
      else return [400, { error: "Unknown action." }];
      save();
      return [200, pub()];
    },
    flush: () => save(true),
    _brain: () => B,
  };
}

module.exports = { createBrain, forward, train, IN, HID, OUT, SPELLS };
