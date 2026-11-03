// npm run playtest: serves the game and the hub service for a local-network playtest, and prints the link for other PCs.
// npm run dev (--local): the same, but reachable from this PC only (127.0.0.1).
// Only the game itself is served (an allow-list): index.html and assets/ with static file types. Server data (bank.json,
// market.json, brain.json, feedback.log), source, docs and dotfiles are never served, and a malformed URL gets 400, not a crash.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, ".."), GAME_PORT = 8080, HUB_PORT = 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp" };
/* gamePath(url): the file to serve for a request path, or 0 (not allowed) / -1 (malformed) */
function gamePath(url) {
  let rel;
  try { rel = decodeURIComponent(new URL(url, "http://x").pathname).replace(/^\/+/, "") || "index.html"; } catch (e) { return -1; }
  if (rel.includes("\0")) return -1;
  const parts = rel.split(/[\\/]+/);
  if (parts.some((p) => !p || p.startsWith("."))) return 0; /* dotfiles, "..", empty segments */
  if (!(rel == "index.html" || (parts[0] == "assets" && parts.length > 1)) || !TYPES[path.extname(rel).toLowerCase()]) return 0;
  const file = path.join(ROOT, ...parts);
  return file.startsWith(ROOT + path.sep) ? file : 0;
}
function gameHandler(req, res) {
  const file = gamePath(req.url);
  if (file === -1) { res.writeHead(400); return res.end("Bad request"); }
  if (!file) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()], "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(data);
  });
}
module.exports = { gamePath, gameHandler };

if (require.main === module) {
  const { createDirectoryServer } = require("./app.js");
  const local = process.argv.includes("--local"), bind = local ? "127.0.0.1" : "0.0.0.0";
  const game = http.createServer(gameHandler);
  game.on("clientError", (e, sock) => { try { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch (x) {} });
  game.listen(GAME_PORT, bind);
  const { server } = createDirectoryServer();
  server.on("clientError", (e, sock) => { try { sock.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch (x) {} });
  server.listen(HUB_PORT, bind);
  console.log("Runebound " + (local ? "dev" : "playtest") + " running.\n  You:        http://localhost:" + GAME_PORT);
  if (!local) {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log("  Same Wi-Fi: http://" + ip + ":" + GAME_PORT);
    console.log("Feedback is saved to feedback.log. If others can't connect, allow Node.js through the Windows firewall (private networks).");
  }
  console.log("Ctrl+C to stop.");
}
