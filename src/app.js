/* Runebound hub directory (the only Node file): ten in-memory hub assignments and WebRTC setup messages.
   It never simulates gameplay. Inputs: browser join/heartbeat/poll/offer/answer/leave requests.
   Run with `npm run signaling`; the tests require it for createDirectoryServer. */
"use strict";

const http = require("node:http");
const { randomBytes } = require("node:crypto");

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
  const hubs = new Map();
  const sessions = new Map();
  const requestCounts = new Map();
  const maxHubs = options.maxHubs ?? MAX_HUBS;
  const maxPlayersPerHub = options.maxPlayersPerHub ?? MAX_PLAYERS_PER_HUB;
  const sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
  const requestsPerMinute = options.requestsPerMinute ?? 3000;
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
    if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "Origin is not allowed." });
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

    if (url.pathname === "/api/join") {
      cleanup();
      if (!validProfile(body.profile)) return send(res, 400, { error: "Player profile is invalid." });
      const active = [...hubs.values()].sort((a, b) => a.id - b.id)
        .find((hub) => !hub.flagged && hub.members.size < maxPlayersPerHub); /* never send new players to a reported host */
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

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) send(res, 500, { error: "Internal signaling error." });
      else res.destroy(error);
    });
  });
  return { server, hubs, sessions, cleanup };
}

if (require.main === module) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://aurakingstudio.github.io,http://localhost:8080,http://127.0.0.1:8080")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const port = Number(process.env.PORT || 8787);
  const { server } = createDirectoryServer({ allowedOrigins, trustCloudflare: process.env.TRUST_CLOUDFLARE === "1" });
  server.listen(port, "0.0.0.0", () => console.log(`Runebound signaling directory listening on ${port}`));
}

module.exports = { createDirectoryServer };
