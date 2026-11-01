// npm run playtest: serves the game and the hub service for a local-network playtest, and prints the link for other PCs.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const { createDirectoryServer } = require("./app.js");
const ROOT = path.join(__dirname, ".."), GAME_PORT = 8080, HUB_PORT = 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".css": "text/css", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || /(^|[\/])(\.|node_modules|src)/.test(path.relative(ROOT, file))) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  });
}).listen(GAME_PORT, "0.0.0.0");
const { server } = createDirectoryServer();
server.listen(HUB_PORT, "0.0.0.0");
const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log("Runebound playtest running.\n  You:        http://localhost:" + GAME_PORT);
for (const ip of ips) console.log("  Same Wi-Fi: http://" + ip + ":" + GAME_PORT);
console.log("Feedback is saved to feedback.log. If others can't connect, allow Node.js through the Windows firewall (private networks).\nCtrl+C to stop.");
