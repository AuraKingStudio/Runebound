"use strict";
/* Player market (auction house), server escrow.
   The server is the only place a listed item exists: selling moves it from the player's save into a listing here; it comes
   back out only through buy (to the buyer), cancel or expiry (to the seller). Gold from a sale is held here as a payout until
   the seller collects it. Players are identified by a private random token kept in their browser; only its SHA-256 hash is
   stored, so the data file never holds anything that could be replayed.
   NOTE (escrow only, owner's choice): wallets still live in the browser, so the server cannot prove a seller really earned
   an item or that a buyer really had the gold. Moving wallets server-side on the VPS is the next step (AgentInstruction rule 8).
   Storage: one JSON file, written atomically (temp file + rename) and at most every 500 ms. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MATS = ["dust", "shard", "eye", "bark", "heart"];
const GEAR_T = ["tank", "dmg", "util", "helm", "glove", "boots"];
const TAX = 0.05; /* 5% of every sale is burned (gold sink) */
const MAX_OPEN = 6; /* open listings per player */
const TTL_MS = 48 * 3600e3; /* a listing lasts 48 h, then returns to the seller */
const MAX_PRICE = 1e6;

const hashTok = (tok) => crypto.createHash("sha256").update(tok).digest("hex");
const validTok = (tok) => typeof tok === "string" && /^[a-f0-9]{32}$/.test(tok);

/* cleanItem(it): a validated copy of an item, or null. Materials: {k:"mat", m, n}. Gear: {k:"gear", t, g, r}. */
function cleanItem(it) {
  if (!it || typeof it !== "object") return null;
  if (it.k === "mat") {
    const n = Number(it.n);
    if (!MATS.includes(it.m) || !Number.isInteger(n) || n < 1 || n > 999) return null;
    return { k: "mat", m: it.m, n };
  }
  if (it.k === "gear") {
    const r = Number(it.r);
    if (!GEAR_T.includes(it.t) || typeof it.g !== "string" || !/^[a-z]{2,3}$/.test(it.g) || !Number.isInteger(r) || r < 0 || r > 4) return null;
    return { k: "gear", t: it.t, g: it.g, r };
  }
  return null;
}

function createMarket(options = {}) {
  const file = options.file || path.join(__dirname, "..", "market.json");
  const now = options.now || (() => Date.now());
  let db = { seq: 0, listings: [], payouts: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw && Array.isArray(raw.listings) && raw.payouts && typeof raw.payouts === "object") db = { seq: raw.seq | 0, listings: raw.listings, payouts: raw.payouts };
  } catch {}
  let saveTimer = null;
  function save(sync) {
    const write = () => {
      saveTimer = null;
      const tmp = file + ".tmp";
      try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file); } catch (e) { console.error("market save failed:", e.message); }
    };
    if (sync) return write();
    if (!saveTimer) saveTimer = setTimeout(write, 500);
  }
  const pay = (owner, p) => { (db.payouts[owner] = db.payouts[owner] || []).push(p); };
  /* expire(): open listings past their time go back to the seller (as a payout), and finished ones older than 7 days are dropped */
  function expire() {
    const t = now();
    let changed = false;
    for (const L of db.listings) if (L.status === "open" && L.exp < t) { L.status = "expired"; pay(L.seller, { type: "item", item: L.item, why: "expired" }); changed = true; }
    const keep = db.listings.filter((L) => L.status === "open" || t - L.at < 7 * 24 * 3600e3);
    if (keep.length !== db.listings.length) { db.listings = keep; changed = true; }
    if (changed) save();
  }
  const pub = (L, me) => ({ id: L.id, name: L.name, item: L.item, price: L.price, exp: L.exp, mine: me === L.seller });

  /* each call: (body) -> [status, value] */
  return {
    browse(body) {
      expire();
      const me = validTok(body.tok) ? hashTok(body.tok) : null;
      const open = db.listings.filter((L) => L.status === "open");
      return [200, { listings: open.slice(-200).map((L) => pub(L, me)), pending: me ? (db.payouts[me] || []).length : 0, tax: TAX, maxOpen: MAX_OPEN }];
    },
    sell(body) {
      if (!validTok(body.tok)) return [400, { error: "Market key is invalid." }];
      expire();
      const me = hashTok(body.tok), item = cleanItem(body.item), price = Number(body.price);
      if (!item) return [400, { error: "Item is invalid." }];
      if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) return [400, { error: "Price must be 1 to 1,000,000 gold." }];
      if (db.listings.filter((L) => L.seller === me && L.status === "open").length >= MAX_OPEN) return [409, { error: `At most ${MAX_OPEN} listings at once.` }];
      const name = typeof body.name === "string" ? body.name.replace(/[^\w .-]/g, "").slice(0, 16) || "Raider" : "Raider";
      const L = { id: "m" + (++db.seq).toString(36), seller: me, name, item, price, at: now(), exp: now() + TTL_MS, status: "open" };
      db.listings.push(L);
      save();
      return [200, { listing: pub(L, me) }];
    },
    buy(body) {
      if (!validTok(body.tok)) return [400, { error: "Market key is invalid." }];
      expire();
      const me = hashTok(body.tok), L = db.listings.find((x) => x.id === body.id);
      if (!L || L.status !== "open") return [404, { error: "That listing is gone." }];
      if (L.seller === me) return [409, { error: "That is your own listing." }];
      L.status = "sold";
      L.buyer = me;
      L.soldAt = now();
      pay(L.seller, { type: "gold", n: Math.floor(L.price * (1 - TAX)), why: "sold", item: L.item });
      save();
      return [200, { item: L.item, price: L.price }];
    },
    cancel(body) {
      if (!validTok(body.tok)) return [400, { error: "Market key is invalid." }];
      const me = hashTok(body.tok), L = db.listings.find((x) => x.id === body.id);
      if (!L || L.status !== "open" || L.seller !== me) return [404, { error: "That listing is not yours or is gone." }];
      L.status = "cancelled";
      save();
      return [200, { item: L.item }];
    },
    collect(body) {
      if (!validTok(body.tok)) return [400, { error: "Market key is invalid." }];
      expire();
      const me = hashTok(body.tok), list = db.payouts[me] || [];
      delete db.payouts[me];
      if (list.length) save();
      return [200, { payouts: list }];
    },
    flush: () => save(true),
    _db: () => db,
  };
}

module.exports = { createMarket, cleanItem, TAX, MAX_OPEN, TTL_MS };
