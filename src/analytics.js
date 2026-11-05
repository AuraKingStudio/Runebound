/* Runebound game analytics (read by the owner only).
   Browsers send anonymous play events: POST /api/analytics { sid, ev: [[name, key, n], ...] } (at most 60 per call).
     sid: a random 16-hex id per browser (NOT the bank token; nothing personal is stored), name: one of EVENTS,
     key: a short [a-z0-9_-] id (an NPC, a boss, a result), n: a small integer (a time, an amount).
   These are hints from the client (it could lie), so money and rewards come from the bank instead:
     bank(kind, g, x, sub) is called for every ledger entry the bank ACCEPTED (blackjack bets and payouts, raid and quest
     rewards, materials), so those totals can't be faked by an edited client.
   Owner: POST /api/analytics/admin { key: ADMIN_KEY, days } -> summary(days). File: analytics.json (git-ignored), 90 days kept. */
"use strict";

const fs = require("node:fs");

const EVENTS = ["session", "hb", "npc", "bj", "raid_go", "raid_win", "raid_lose", "invite", "join", "gather", "pet", "trade", "garden", "cipher"];
const KEEP_DAYS = 90, MAX_SIDS = 5000, MAX_KEYS = 200, PER_MIN = 240, SIDS_PER_IP = 20, MAX_IPS = 20000, SAVE_MS = 60e3, HB_MS = 55e3;
const day = (t) => new Date(t).toISOString().slice(0, 10);

function createAnalytics(options = {}) {
  const file = options.file || "", now = options.now || Date.now; /* no file: memory only */
  let db = { days: {}, seen: {} };
  if (file) try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (j && j.days && j.seen) db = j; } catch {}
  let seenN = Object.keys(db.seen).length; /* counters, no Object.keys per request */
  for (const k in db.days) { const d = db.days[k]; if (d.sids && d.np == null) { const v = Object.values(d.sids); d.np = v.length; d.nn = v.filter((s) => s.n).length; d.m = v.reduce((a, s) => a + s.m, 0); } d.kc = d.kc || {}; }
  let timer = null, saving = false, last = 0;
  /* persist: at most once a minute, async, atomic (tmp + rename) */
  function persist() {
    if (timer || !file) return;
    timer = setTimeout(async () => {
      timer = null;
      if (saving) return persist();
      saving = true; last = now();
      try { await fs.promises.writeFile(file + ".tmp", JSON.stringify(db)); await fs.promises.rename(file + ".tmp", file); }
      catch (e) { console.error("analytics: save failed", e.message); }
      saving = false;
    }, Math.max(0, SAVE_MS - (now() - last)));
    timer.unref?.();
  }
  let curDay = "";
  const ipNew = new Map(); /* ip -> new sids today */
  function today(t) {
    const k = day(t);
    let d = db.days[k];
    if (!d) {
      d = db.days[k] = { sids: {}, ev: {}, bank: {}, np: 0, nn: 0, m: 0, kc: {} };
      const keys = Object.keys(db.days).sort();
      while (keys.length > KEEP_DAYS) delete db.days[keys.shift()];
      for (const kk of keys) if (kk < k && db.days[kk].sids) delete db.days[kk].sids; /* older days: totals only */
      const old = day(t - KEEP_DAYS * 864e5); /* forget ids not seen for 90 days */
      for (const s in db.seen) if (db.seen[s] < old) { delete db.seen[s]; seenN--; }
    }
    if (k != curDay) { curDay = k; ipNew.clear(); }
    return d;
  }
  const hits = new Map(); /* ip -> [minute start, events] (sids are attacker-chosen) */

  /* record({ sid, ev }, ip): In: one browser's batch. Out: [status, body]. Unknown names, bad keys or numbers are skipped. */
  function record(body, ip = "") {
    if (!body || typeof body != "object" || typeof body.sid != "string" || !/^[a-f0-9]{16}$/.test(body.sid) || !Array.isArray(body.ev) || body.ev.length > 60) return [400, { error: "Bad analytics." }];
    const t = now(), sid = body.sid; ip = String(ip);
    let h = hits.get(ip);
    if (!h || t - h[0] >= 60e3) {
      if (!h && hits.size >= MAX_IPS) { for (const [k, v] of hits) if (t - v[0] >= 60e3) hits.delete(k); if (hits.size >= MAX_IPS) return [429, { error: "Busy." }]; }
      h = [t, 0]; hits.set(ip, h);
    }
    const d = today(t);
    let s = d.sids[sid];
    if (!s && d.np < MAX_SIDS) {
      const c = ipNew.get(ip) || 0;
      if (c < SIDS_PER_IP && (ipNew.has(ip) || ipNew.size < MAX_IPS)) {
        ipNew.set(ip, c + 1);
        s = d.sids[sid] = { f: t, l: t, m: 0, h: 0 }; d.np++;
        if (!db.seen[sid] && seenN < MAX_SIDS * 4) { seenN++; s.n = 1; d.nn++; } /* first day ever: a new player */
        if (s.n || db.seen[sid]) db.seen[sid] = day(t); /* last day seen */
      }
    }
    let kept = 0;
    for (const e of body.ev) {
      if (!Array.isArray(e)) continue;
      const [name, key = "", n = 1] = e;
      if (!EVENTS.includes(name) || typeof key != "string" || !/^[a-z0-9_-]{0,24}$/.test(key) || !Number.isInteger(n) || n < -1e6 || n > 1e6) continue;
      if (name == "hb") { if (!s || t - (s.h || 0) < HB_MS) continue; s.h = t; s.m++; d.m++; } /* hb: at most once per sid per 55 s */
      if (++h[1] > PER_MIN) break; /* a flooding IP stops counting for the rest of the minute */
      const ev = (d.ev[name] = d.ev[name] || {});
      if (!ev[key]) { if ((d.kc[name] || 0) >= MAX_KEYS) continue; d.kc[name] = (d.kc[name] || 0) + 1; }
      const c = (ev[key] = ev[key] || { c: 0, s: 0 });
      c.c++; c.s += name == "hb" ? 1 : n;
      if (s) s.l = t;
      kept++;
    }
    if (kept) persist();
    return [200, { ok: true, kept }];
  }

  /* bank(kind, g, x, sub): one ACCEPTED bank entry (trusted). kind: ledger kind, sub: the material source for "mat". */
  function bank(kind, g, x, sub) {
    const d = today(now()), k = kind == "mat" && typeof sub == "string" ? "mat:" + sub.slice(0, 16) : String(kind).slice(0, 24);
    if (!d.bank[k]) { if ((d.kc["$bank"] || 0) >= MAX_KEYS) return; d.kc["$bank"] = (d.kc["$bank"] || 0) + 1; }
    const b = (d.bank[k] = d.bank[k] || { c: 0, gin: 0, gout: 0, x: 0 });
    b.c++; if (g > 0) b.gin += g; else b.gout -= g; b.x += x || 0;
    persist();
  }

  /* summary(days): what the owner panel shows. Players, minutes connected, clicks, blackjack, raids, invites, per day + totals. */
  function summary(days = 14) {
    const t = now(), keys = [];
    for (let i = days - 1; i >= 0; i--) keys.push(day(t - i * 864e5));
    const sum = (o) => Object.values(o || {}).reduce((a, v) => a + v.c, 0), get = (d, n, k) => (d.ev[n] && d.ev[n][k]) || { c: 0, s: 0 };
    const rows = keys.map((k) => {
      const d = db.days[k] || { ev: {}, bank: {} }, bj = d.bank.bj || { c: 0, gin: 0, gout: 0 };
      return { day: k, players: d.np || 0, newPlayers: d.nn || 0, minutes: d.m || 0, sessions: sum(d.ev.session),
        npc: sum(d.ev.npc), invites: sum(d.ev.invite), joins: sum(d.ev.join), raids: sum(d.ev.raid_go), wins: sum(d.ev.raid_win), losses: sum(d.ev.raid_lose),
        hands: sum(d.ev.bj), bjBet: bj.gout, bjPaid: bj.gin, gathers: sum(d.ev.gather), trades: sum(d.ev.trade) };
    });
    const merge = (name) => { const o = {}; for (const k of keys) for (const [kk, v] of Object.entries((db.days[k] || { ev: {} }).ev[name] || {})) { o[kk] = o[kk] || { c: 0, s: 0 }; o[kk].c += v.c; o[kk].s += v.s; } return o; };
    const bankAll = {}; for (const k of keys) for (const [kk, v] of Object.entries((db.days[k] || { bank: {} }).bank)) { const b = (bankAll[kk] = bankAll[kk] || { c: 0, gin: 0, gout: 0, x: 0 }); b.c += v.c; b.gin += v.gin; b.gout += v.gout; b.x += v.x; }
    const td = db.days[day(t)] || { sids: {} }, live = Object.values(td.sids || {}).filter((s) => t - s.l < 150e3).length;
    let players = 0; for (const s in db.seen) if (db.seen[s] >= keys[0]) players++; /* seen = last day seen, so this works after older days are compacted */
    const tot = (f) => rows.reduce((a, r) => a + r[f], 0);
    const raid = {}; for (const [n, f] of [["raid_go", "go"], ["raid_win", "win"], ["raid_lose", "lose"]]) for (const [k, v] of Object.entries(merge(n))) { raid[k] = raid[k] || { go: 0, win: 0, lose: 0, secs: 0 }; raid[k][f] += v.c; if (f == "win") raid[k].secs += v.s; }
    const bjRes = merge("bj");
    return { days: rows, live, players, total: { minutes: tot("minutes"), sessions: tot("sessions"), newPlayers: tot("newPlayers"), invites: tot("invites"), joins: tot("joins"),
      raids: tot("raids"), wins: tot("wins"), losses: tot("losses"), hands: tot("hands"), bjBet: tot("bjBet"), bjPaid: tot("bjPaid"), gathers: tot("gathers"), trades: tot("trades") },
      npc: merge("npc"), raid, bj: Object.fromEntries(Object.entries(bjRes).map(([k, v]) => [k, { hands: v.c, net: v.s }])), invite: merge("invite"), gather: merge("gather"), pet: merge("pet"), bank: bankAll };
  }
  return { record, bank, summary, EVENTS };
}

module.exports = { createAnalytics, EVENTS };
