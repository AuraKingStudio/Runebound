/* Runebound hub directory: ten in-memory hub assignments and WebRTC setup messages, plus the player market (src/market.js).
   It never simulates gameplay. Inputs: browser join/heartbeat/poll/offer/answer/leave requests.
   Run with `npm run signaling`; the tests require it for createDirectoryServer. */
"use strict";

const http = require("node:http");
const { randomBytes, timingSafeEqual, createHash } = require("node:crypto");
const { createMarket } = require("./market.js");
const { createBrain } = require("./brain.js");
const { createBank } = require("./bank.js");
const { createAnalytics } = require("./analytics.js");

const MAX_BODY_BYTES = 16 * 1024;
const MAX_HUBS = 10;
const MAX_PLAYERS_PER_HUB = 12;
const SESSION_TTL_MS = 30000;
const SDP_LIMIT = 16000;

function token() {
  return randomBytes(24).toString("hex");
}

function validProfile(profile) {
  return profile && typeof profile === "object" && !Array.isArray(profile) &&
    typeof profile.id === "string" && /^player-[a-zA-Z0-9-]{4,48}$/.test(profile.id) &&
    typeof profile.name === "string" && /^[A-Za-z0-9 _-]{1,16}$/.test(profile.name) &&
    ["tank", "dps", "heal"].includes(profile.cls) &&
    Number.isInteger(profile.lv) && profile.lv >= 1 && profile.lv <= 60 &&
    Number.isInteger(profile.ti) && profile.ti >= 0 && profile.ti < 100 &&
    Number.isFinite(profile.spd) && profile.spd >= 1 && profile.spd <= 1.3;
}

function validDescription(description, type) {
  return description && typeof description === "object" && !Array.isArray(description) &&
    description.type === type && typeof description.sdp === "string" &&
    description.sdp.length > 0 && description.sdp.length <= SDP_LIMIT;
}

function createDirectoryServer(options = {}) {
  const allowedOrigins = new Set(options.allowedOrigins || [
    "https://aurakingstudio.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);
  const feedbackFile = options.feedbackFile || require("path").join(__dirname, "..", "feedback.log");
  const market = options.market === true ? createMarket({ file: options.marketFile }) : null;
  const brain = options.brain === false ? null : createBrain({ file: options.brainFile });
  /* game analytics (owner-only reads, ADMIN_KEY): anonymous play events + the bank's accepted entries (trusted money totals) */
  const analytics = options.analytics === false ? null : createAnalytics({ file: options.analyticsFile }) /* no file (tests): memory only */;
  const adminKey = options.adminKey ?? process.env.ADMIN_KEY ?? "";
  const adminFails = new Map(); /* ip -> failed admin key tries (last 10 minutes), hard-capped */
  let globalFails = [], adminLockUntil = 0; /* 100 wrong keys from anyone in 10 minutes lock the admin read for everyone for 10 minutes */
  const adminHash = String(adminKey).length >= 32 ? createHash("sha256").update(String(adminKey)).digest() : null; /* short key: admin disabled */
  const bank = options.bank === true ? createBank({ file: options.bankFile, onEntry: analytics ? analytics.bank : null }) : null; /* online mode: the server owns gold and XP */
  const tradeHits = new Map(); /* ip -> trade call times (last minute) */
  /* local playtests: any page served from this network (192.168.x.x, 10.x.x.x, 172.16-31.x.x) may use the service */
  const lanOrigin = (o) => options.allowLan !== false && /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(o);
  const hubs = new Map();
  const sessions = new Map();
  const requestCounts = new Map();
  const maxHubs = options.maxHubs ?? MAX_HUBS;
  const maxPlayersPerHub = options.maxPlayersPerHub ?? MAX_PLAYERS_PER_HUB;
  const sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
  const requestsPerMinute = options.requestsPerMinute ?? 3000;
  /* flood guard: a whole-server cap per second and a cap on live sessions, on top of the per-address limit */
  const globalPerSecond = options.globalPerSecond ?? 2000;
  const maxSessions = options.maxSessions ?? maxHubs * maxPlayersPerHub * 2;
  let globalSecond = 0, globalCount = 0;
  const hostStaleMs = options.hostStaleMs ?? 4000; /* the host polls every 0.8 s: silent this long = gone, a successor may take over */
  /* behind a Cloudflare Tunnel every request comes from the local connector, so the player's real address is in
     cf-connecting-ip; it is trusted only when enabled AND the request arrives from this machine (the tunnel) */
  const trustCloudflare = !!options.trustCloudflare;

  function getSession(secret) {
    if (typeof secret !== "string" || secret.length !== 48) return null;
    const session = sessions.get(secret);
    if (!session || session.expiresAt < Date.now()) return null;
    return session;
  }

  function removeSession(session) {
    sessions.delete(session.secret);
    const hub = hubs.get(session.hubId);
    if (!hub) return;
    if (session.role === "host") {
      hubs.delete(session.hubId);
      for (const member of hub.members.values()) sessions.delete(member.secret);
    } else {
      hub.members.delete(session.peerId);
      hub.events.push({ type: "peer-left", peerId: session.peerId });
    }
  }

  function cleanup() {
    const now = Date.now();
    for (const hub of hubs.values()) {
      for (const member of [...hub.members.values()]) {
        if (member.expiresAt < now) removeSession(member);
      }
    }
  }

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
  }

  function send(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  }

  async function handle(req, res) {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin) && !lanOrigin(origin)) return send(res, 403, { error: "Origin is not allowed." });
    if (origin) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      res.setHeader("access-control-allow-private-network", "true"); /* lets the public game page reach a hub service on this PC */
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const now = Date.now();
    const socketIp = req.socket.remoteAddress || "unknown", cfIp = req.headers["cf-connecting-ip"];
    const ip = trustCloudflare && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socketIp) &&
      typeof cfIp === "string" && cfIp.length <= 64 ? cfIp : socketIp;
    if (requestCounts.size > 20000) for (const [key, value] of requestCounts) if (now - value.startedAt >= 60000) requestCounts.delete(key);
    let rate = requestCounts.get(ip);
    if (!rate || now - rate.startedAt >= 60000) {
      rate = { startedAt: now, count: 0 };
      requestCounts.set(ip, rate);
    }
    if (++rate.count > requestsPerMinute) return send(res, 429, { error: "Too many signaling requests; retry shortly." });
    if (now - globalSecond >= 1000) { globalSecond = now; globalCount = 0; }
    if (++globalCount > globalPerSecond) return send(res, 503, { error: "Server busy; retry shortly." });

    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      cleanup();
      return send(res, 200, { ok: true, hubs: hubs.size, maxHubs, maxPlayersPerHub });
    }
    if (req.method === "GET" && url.pathname === "/api/hubs") {
      cleanup();
      return send(res, 200, { hubs: [...hubs.values()].sort((a, b) => a.id - b.id).map((hub) => ({
        id: hub.id, players: hub.members.size, capacity: maxPlayersPerHub, flagged: !!hub.flagged,
      })) });
    }
    if (req.method !== "POST") return send(res, 404, { error: "Not found." });

    let body;
    try { body = await readJson(req); }
    catch (error) { return send(res, error.status || 400, { error: error.message }); }

    /* player market (server escrow): /api/market/browse | sell | buy | cancel | collect */
    const mk = /^\/api\/market\/(browse|sell|buy|cancel|collect)$/.exec(url.pathname);
    if (mk) {
      if (!market) return send(res, 503, { error: "The market is closed on this server." });
      const [status, value] = market[mk[1]](body || {});
      return send(res, status, value);
    }
    /* the epic boss's shared brain: /api/brain/get (weights) and /api/brain/train (observations from one fight) */
    const bk = /^\/api\/brain\/(get|train|admin)$/.exec(url.pathname);
    if (bk) {
      if (!brain) return send(res, 503, { error: "The brain is offline on this server." });
      const [status, value] = brain[bk[1]](body || {});
      return send(res, status, value);
    }
    if (url.pathname === "/api/bank/sync") {
      if (!bank) return send(res, 503, { error: "The bank is offline on this server." });
      const [status, value] = bank.sync(body || {}, ip); /* ip: Cloudflare-aware (above); caps seeded new accounts per IP */
      return send(res, status, value);
    }
    /* Cipher gather minigame: /api/cipher/start { tok, job } | /api/cipher/solve { tok, id, taps, ms } (per-IP limits live in the bank) */
    const cm = /^\/api\/cipher\/(start|solve)$/.exec(url.pathname);
    if (cm) {
      if (!bank) return send(res, 503, { error: "Ciphers need the online server." });
      const [status, value] = cm[1] == "start" ? bank.cipherStart(body || {}, ip) : bank.cipherSolve(body || {});
      return send(res, status, value);
    }
    /* Rune Wishes: /api/wish/state|daily|pull|shop|wheel|reels|dig|wear { tok, ... }, /api/wish/worn { codes } (public, read-only) (all rolls in the bank, src/wish.js) */
    const wm = /^\/api\/wish\/(state|daily|pull|shop|wheel|reels|dig|wear|worn)$/.exec(url.pathname);
    if (wm) {
      if (!bank) return send(res, 503, { error: "Wishes need the online server." });
      const [status, value] = bank.wish(wm[1], body || {}, ip);
      return send(res, status, value);
    }
    /* trades between online players (bank escrow): /api/trade/offer | accept | cancel | list */
    const tm = /^\/api\/trade\/(offer|accept|cancel|list)$/.exec(url.pathname);
    if (tm) {
      if (!bank) return send(res, 503, { error: "Trading needs the online server." });
      const now = Date.now(), hits = (tradeHits.get(ip) || []).filter((x) => now - x < 60e3); /* per IP: 30 trade calls a minute */
      if (hits.length >= 30) return send(res, 429, { error: "Too many trade requests." });
      hits.push(now); tradeHits.set(ip, hits);
      if (tradeHits.size > 20000) for (const [k, v] of tradeHits) if (now - v[v.length - 1] > 60e3) tradeHits.delete(k);
      const [status, value] = bank["trade" + tm[1][0].toUpperCase() + tm[1].slice(1)](body || {}, ip);
      return send(res, status, value);
    }
    if (url.pathname === "/api/analytics") {
      if (!analytics) return send(res, 503, { error: "Analytics are off on this server." });
      const [status, value] = analytics.record(body, ip);
      return send(res, status, value);
    }
    if (url.pathname === "/api/analytics/admin") {
      /* owner only: the key lives in the server's environment (ADMIN_KEY), never in the game files; 10 wrong tries per IP per 10 minutes */
      const now = Date.now(), fails = (adminFails.get(ip) || []).filter((x) => now - x < 600e3);
      globalFails = globalFails.filter((x) => now - x < 600e3);
      if (now < adminLockUntil || fails.length >= 10) return send(res, 429, { error: "Too many tries." });
      const b = body && typeof body == "object" ? body : {};
      const k = createHash("sha256").update(typeof b.key === "string" ? b.key : "").digest();
      if (!analytics || !adminHash || !timingSafeEqual(k, adminHash)) {
        if (adminFails.size >= 20000) for (const [kk, v] of adminFails) if (now - v[v.length - 1] > 600e3) adminFails.delete(kk);
        if (adminFails.has(ip) || adminFails.size < 20000) { fails.push(now); adminFails.set(ip, fails); }
        globalFails.push(now);
        if (globalFails.length >= 100) { adminLockUntil = now + 600e3; globalFails = []; }
        return send(res, 403, { error: "Forbidden." });
      }
      return send(res, 200, analytics.summary(Math.min(90, Math.max(1, Number.isInteger(b.days) ? b.days : 14))));
    }
    if (url.pathname === "/api/feedback") {
      /* playtest notes: one JSON line per note in feedback.log (no session needed; size-capped, rate-limited above) */
      if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1500) return send(res, 400, { error: "Feedback is invalid." });
      const clean = (v, n) => (typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? v : undefined);
      const line = JSON.stringify({ at: new Date().toISOString(), text: body.text, name: clean(body.name, 24), cls: clean(body.cls, 8), lv: clean(body.lv, 4), sc: clean(body.sc, 8), raid: clean(body.raid, 8),
        wins: clean(body.wins, 6), errors: Array.isArray(body.errors) ? body.errors.slice(0, 8).map((e) => String(e).slice(0, 200)) : [], ua: clean(body.ua, 120) });
      try { require("fs").appendFileSync(feedbackFile, line + "\n"); } catch (error) { return send(res, 500, { error: "Could not save feedback." }); }
      console.log("Feedback: " + body.text.slice(0, 80).replace(/\s+/g, " "));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/join") {
      cleanup();
      if (!validProfile(body.profile)) return send(res, 400, { error: "Player profile is invalid." });
      if (sessions.size >= maxSessions) return send(res, 503, { error: "All hubs are full." });
      const want = Number.isInteger(body.hubId) && body.hubId >= 1 && body.hubId <= maxHubs ? body.hubId : 0;
      /* host migration: the old host of hub `want` went silent, so the chosen successor takes the hub over under the same id */
      const old = want && hubs.get(want), oldHost = old && old.members.get("host");
      if (body.host === true && old && (!oldHost || Date.now() - (oldHost.expiresAt - sessionTtlMs) > hostStaleMs)) {
        if (oldHost) sessions.delete(oldHost.secret);
        for (const member of old.members.values()) sessions.delete(member.secret);
        hubs.delete(want);
        const session = { secret: token(), role: "host", hubId: want, profile: body.profile, expiresAt: Date.now() + sessionTtlMs, events: [] };
        hubs.set(want, { id: want, members: new Map([["host", session]]), events: [] });
        sessions.set(session.secret, session);
        return send(res, 200, { role: "host", hubId: want, token: session.secret, reason: `The host left; you now host hub ${want}.` });
      }
      const open = (hub) => !hub.flagged && hub.members.size < maxPlayersPerHub; /* never send new players to a reported host */
      const active = (want && hubs.get(want) && open(hubs.get(want)) ? hubs.get(want) : null) || /* after a host switch: back to the same hub */
        [...hubs.values()].sort((a, b) => a.id - b.id).find(open);
      if (active) {
        if ([...active.members.values()].some((member) => member.profile.id === body.profile.id)) {
          return send(res, 409, { error: "This profile already has a seat in the selected hub." });
        }
        const peerId = token();
        const session = { secret: token(), role: "guest", hubId: active.id, peerId, profile: body.profile, expiresAt: Date.now() + sessionTtlMs, events: [] };
        active.members.set(peerId, session);
        sessions.set(session.secret, session);
        active.events.push({ type: "peer-joined", peerId, profile: body.profile });
        const earlierHubs = active.id === 2 ? "Hub 1 is full" : `Hubs 1-${active.id - 1} are full`;
        const reason = active.id === 1
          ? "Hub 1 is the first hub with an open seat."
          : `${earlierHubs}; Hub ${active.id} is the first available.`;
        return send(res, 200, { role: "guest", hubId: active.id, peerId, token: session.secret, reason });
      }
      const occupied = new Set(hubs.keys());
      let hubId = 0;
      for (let id = 1; id <= maxHubs; id++) if (!occupied.has(id)) { hubId = id; break; }
      if (!hubId) return send(res, 503, { error: "All hubs are full." });
      const session = { secret: token(), role: "host", hubId, profile: body.profile, expiresAt: Date.now() + sessionTtlMs, events: [] };
      const hub = { id: hubId, members: new Map([["host", session]]), events: [] };
      hubs.set(hubId, hub);
      sessions.set(session.secret, session);
      const earlierHubs = hubId === 2 ? "Hub 1 is full" : `Hubs 1-${hubId - 1} are full`;
      const reason = hubId === 1
        ? "Hub 1 was empty, so you are its first player and host."
        : `${earlierHubs}; you are hosting the next available hub.`;
      return send(res, 200, { role: "host", hubId, token: session.secret, reason });
    }

    const session = getSession(body.token);
    if (!session) return send(res, 401, { error: "Session expired; rejoin the hub." });
    const hub = hubs.get(session.hubId);
    if (!hub) return send(res, 410, { error: "Hub is no longer available." });
    session.expiresAt = Date.now() + sessionTtlMs;

    if (url.pathname === "/api/heartbeat") return send(res, 200, { ok: true });
    if (url.pathname === "/api/poll") {
      const events = session.role === "host" ? hub.events.splice(0, 20) : session.events.splice(0, 10);
      return send(res, 200, { events });
    }
    if (url.pathname === "/api/offer") {
      if (session.role !== "guest" || !validDescription(body.description, "offer")) return send(res, 400, { error: "Offer is invalid." });
      hub.events.push({ type: "offer", peerId: session.peerId, profile: session.profile, description: body.description });
      return send(res, 202, { ok: true });
    }
    if (url.pathname === "/api/answer") {
      if (session.role !== "host" || typeof body.peerId !== "string" || !validDescription(body.description, "answer")) {
        return send(res, 400, { error: "Answer is invalid." });
      }
      const guest = hub.members.get(body.peerId);
      if (!guest || guest.role !== "guest") return send(res, 404, { error: "Joining player is no longer in this hub." });
      guest.events.push({ type: "answer", peerId: body.peerId, description: body.description });
      return send(res, 202, { ok: true });
    }
    if (url.pathname === "/api/report") {
      /* a guest's fair-play checks failed on its host; once half the guests agree, the hub gets no new players */
      if (session.role !== "guest" || typeof body.reason !== "string" || body.reason.length > 80) return send(res, 400, { error: "Report is invalid." });
      hub.reports = hub.reports || new Set();
      hub.reports.add(session.peerId);
      const guests = hub.members.size - 1;
      if (!hub.flagged && hub.reports.size * 2 >= guests) {
        hub.flagged = true;
        console.log(`Hub ${hub.id} flagged by ${hub.reports.size}/${guests} guests: ${body.reason.replace(/[^\w .,'-]/g, "")}`);
      }
      return send(res, 200, { ok: true, flagged: !!hub.flagged });
    }
    if (url.pathname === "/api/kick") {
      /* the host removed a cheater: free its seat even if the cheater keeps its own session alive */
      if (session.role !== "host" || typeof body.peerId !== "string") return send(res, 400, { error: "Kick is invalid." });
      const member = hub.members.get(body.peerId);
      if (!member || member.role !== "guest") return send(res, 404, { error: "That player is not in this hub." });
      removeSession(member);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/leave") {
      removeSession(session);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Not found." });
  }

  const server = http.createServer({ requestTimeout: 10000, headersTimeout: 8000 }, (req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) send(res, 500, { error: "Internal signaling error." });
      else res.destroy(error);
    });
  });
  server.keepAliveTimeout = 5000; /* slow or idle connections are dropped (slowloris) */
  server.maxConnections = options.maxConnections ?? 4000;
  return { server, hubs, sessions, cleanup, market, brain, bank, analytics };
}

if (require.main === module) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://aurakingstudio.github.io,http://localhost:8080,http://127.0.0.1:8080")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const port = Number(process.env.PORT || 8787);
  /* modes: local (this PC), --lan (players on your Wi-Fi), --cf (behind a Cloudflare tunnel: home PC or VPS).
     Behind the tunnel only this machine may connect (127.0.0.1); Cloudflare filters floods before they arrive. */
  const cf = process.env.TRUST_CLOUDFLARE === "1" || process.argv.includes("--cf"), lan = process.argv.includes("--lan");
  const { server } = createDirectoryServer({ allowedOrigins, trustCloudflare: cf, allowLan: !cf, bank: cf, analyticsFile: require("path").join(__dirname, "..", "analytics.json"),
    requestsPerMinute: Number(process.env.RATE_PER_MIN) || (cf ? 600 : 3000) });
  const bind = cf ? "127.0.0.1" : lan ? "0.0.0.0" : "127.0.0.1";
  server.listen(port, bind, () => console.log(`Runebound signaling directory (${cf ? "online" : lan ? "LAN" : "local"}) listening on ${bind}:${port}`));
}

module.exports = { createDirectoryServer };
