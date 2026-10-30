// Updates version.json (the in-game build board) with real numbers before a push.
// Usage: node tools/board.js "short note" "in:New thing" "fix:Fixed thing" "out:Removed thing"
// In:  the note + change lines (kind:text). Out: version.json with log, test count, commit sparkline.
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const root = path.join(__dirname, "..");
const file = path.join(root, "version.json");
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const now = new Date();

// note + newest changes first (keep the last 12)
// --reset clears the old change log; every run bumps the patch version (v0.5.0 -> v0.5.1)
const args = process.argv.slice(2).filter((a) => a != "--reset");
if (process.argv.includes("--reset")) j.log = [];
const [ma, mi, pa] = String(j.ver || "0.5.-1").split(".").map(Number);
j.ver = `${ma}.${mi}.${pa + 1}`;
process.argv = [process.argv[0], process.argv[1], ...args];
if (process.argv[2]) j.note = process.argv[2];
// size of the change about to be committed (lines added / removed, staged + unstaged)
const stat = execSync("git diff HEAD --numstat", { cwd: root, encoding: "utf8" })
  .split("\n").filter(Boolean).map((l) => l.split("\t"))
  .reduce((a, [ad, de]) => ({ add: a.add + (+ad || 0), del: a.del + (+de || 0) }), { add: 0, del: 0 });
const add = process.argv.slice(3).map((s) => {
  const m = s.match(/^(in|out|fix):(.*)$/);
  return { k: m ? m[1] : "in", t: (m ? m[2] : s).trim(), at: now.toISOString(), add: stat.add, del: stat.del };
});
j.log = [...add, ...(j.log || [])].slice(0, 12);

// tests: run the suite and count passes
let tests = 0, failed = 0;
try {
  const out = execSync("node test/dev.test.js", { cwd: root, encoding: "utf8" });
  tests = (out.match(/^PASS /gm) || []).length;
} catch (e) {
  tests = ((e.stdout || "").match(/^PASS /gm) || []).length;
  failed = ((e.stdout || "").match(/^FAIL /gm) || []).length;
}
const prev = (j.stats && j.stats.tests) || tests;

// commits per hour for the last 12 hours (oldest first) + commits today
const times = execSync('git log --since="24 hours ago" --format=%ct', { cwd: root, encoding: "utf8" })
  .split(/\s+/).filter(Boolean).map((s) => +s * 1000);
const spark = Array.from({ length: 12 }, (_, i) => {
  const end = now - (11 - i) * 36e5, start = end - 36e5;
  return times.filter((t) => t > start && t <= end).length;
});
// lines changed per hour for the last 12 hours (oldest first), ignoring version.json
const numLog = execSync('git log --since="12 hours ago" --format=@%ct --numstat', { cwd: root, encoding: "utf8" });
const linesAt = [];
let curT = 0;
for (const ln of numLog.split("\n")) {
  if (ln.startsWith("@")) curT = +ln.slice(1) * 1000;
  else if (ln.trim()) {
    const [ad, de, file] = ln.split("\t");
    if (file && !file.endsWith("version.json")) linesAt.push([curT, (+ad || 0) + (+de || 0)]);
  }
}
const lines = Array.from({ length: 12 }, (_, i) => {
  const end = now - (11 - i) * 36e5, start = end - 36e5;
  return linesAt.filter(([t]) => t > start && t <= end).reduce((a, [, n]) => a + n, 0);
});
const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
const today = times.filter((t) => t >= +midnight).length;

j.stats = { tests, prevTests: prev, failed, today, spark, lines, features: (j.log || []).filter((l) => l.k == "in").length, open: (j.board || []).filter((r) => r.s != "done").length, at: now.toISOString() };
fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
console.log(`board: ${tests} tests (${tests - prev >= 0 ? "+" : ""}${tests - prev}), ${today} commits today, ${add.length} new log lines`);
