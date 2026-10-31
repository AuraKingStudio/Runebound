# Runebound – handoff note for the next agent

Update this file before every push (owner's rule).

## Project

Runebound is a browser-only (.io-style web) action game with a sky-island hub (NPCs, shop, guild, blackjack, quests, bots) and a raid arena. Live web build: https://aurakingstudio.github.io/Runebound/ (GitHub Pages, served from the repo root of `main`).

## Layout (keep it this small)

| File | Role |
|---|---|
| `index.html` | The whole browser game: CSS, embedded art, game logic, WebRTC transport, hub networking. Keep browser code here. |
| `src/app.js` | The only Node file: the hub directory service (`npm run signaling`); tests `require` it for `createDirectoryServer`. |
| `src/test.js` | 146 tests: game, networking authority, transport, directory (`npm test`). Parses the `<script>` block of `index.html`. |
| `assets/icon.png` | Tab icon. Images belong in `assets/`, code in `src/`. |
| `package.json` | Scripts only: `npm test`, `npm run dev` (live-server on 8080), `npm run signaling`. Only dev dependency: live-server. |
| `.nojekyll` | Makes GitHub Pages serve files as-is. |

Removed in this pass as unused: `tools/board.js`, `version.json` (plus the in-game dev board and update banner), `ads-config.js`, `privacy.html`, `banner.png`, `icon.svg`, the old copy-paste invite-code transport, and the old `main.js`, `signaling-server.js` and `test/dev.test.js`, which were merged into `src/`. Electron and the Windows .exe build (`build-exe.bat`, electron and electron-builder) were removed: it's a web-only game.

## Multiplayer hub (pilot)

- **Seat assignment:** after the name is set, the game asks the directory for a seat. It gets the first hub with an open seat, up to 10 hubs × 10 players. The first player in an empty hub hosts; player 11 opens Hub 2. No join/create buttons.
- **Badge:** shows the hub number, why that hub was chosen, and the state: assigned → connecting → connected → synced, or hosting N/10.
- **Authority split (owner's rule):** clients do everything they safely can and show it immediately. The host ("master") checks only the cheat-sensitive parts and answers with a confirmation or a correction.
  - **Movement:** the guest moves locally and sends its position. The host clamps steps faster than class speed × speed bonus × 1.35, plus dash distance on cooldown. On a clamp it sends a correction `c` with the move's sequence number; the guest shifts by the error and keeps the steps walked since.
  - **Chat and emotes:** shown at once, then sent as a query with a sequence number. The host rate-limits (chat 0.7 s, emote 1 s) and validates. It relays to the other players and acks, or rejects, which undoes the sender's bubble.
- **Lightweight wire format (owner's rule: many clients per host):**
  - `r` roster `[slot, id, name, cls, lv, title, spd]`, sent only on join or leave.
  - `s` state: a flat list of `[slot, x, y, facing 0-3]` whole numbers, only for players who moved, 10 times a second, plus a full refresh once a second.
  - Guest `m` `{x, y, f, d, s}` at most 15 times a second while moving and once a second while still. Chat, emote and ack messages are rare.
- **Smoothing:** remote players are drawn 150 ms behind from a buffer of updates and smoothed. Teleports over 160 px snap, no coasting after a stop, and no slow start after standing still.
- **Robustness:**
  - Networking runs on a 50 ms timer, not the render loop, so a paused or background host keeps relaying.
  - A guest that isn't connected after 30 s gives up its seat and retries.
  - Closing a tab releases its seat immediately.
  - A guest sends its position when joining, so the host doesn't start it at a random spawn point.
  - Cloudflare STUN server for finding peers on other networks; no TURN relay.
- **Local testing:**
  - On `localhost` the game uses `http://localhost:8787` automatically; the public `signalingUrl` stays blank.
  - `?player=N` (localhost only) gives each tab its own save, so two VS Code Simple Browser tabs are two players.
  - Run `npm run signaling` and `npm run dev`.

## Verified (2026-10-31)

- `npm test` passes all 146 tests; `node --check` on both src files and `git diff --check` are clean.
- A two- and three-browser test drove headless Chrome over DevTools against the real directory and WebRTC:
  - Passed: host and guest in Hub 1, synced, see each other, no bots.
  - Passed: chat between three players in every direction; spam rejected and withdrawn.
  - Passed: capacity overflow to Hub 2; leaving frees the seat.
  - With the earlier (uncompressed) protocol, guest and host movement matched within 20 px.
- After the compact protocol and join-position fix, browser movement was **not** rerun. The automated runs failed because simulated keys didn't reach the background browsers, and the fix rerun was interrupted. The owner tested with two real windows on the earlier protocol and said it "works really good".

## Not done / open

- Host migration and reconnect: a hub dies when its host leaves.
- Raid sync is disabled.
- Accounts, PC > console > phone host preference (must be measured or opt-in, not trusted), TURN relay.
- Public hosting: GitHub Pages can't run `src/app.js`. A stable Cloudflare named tunnel or server is needed; Quick Tunnel URLs expire. `cloudflared` is installed at `%LOCALAPPDATA%\Runebound\cloudflared\cloudflared.exe`.
- A player-controlled host can still cheat. Don't claim robust anti-cheat or 100-player scale (no benchmark exists).
- Older owner reports still open: pause softlock; guild kick/disband.
- Dev tools (F2, `?dev`, triple-tap) still ship in the normal build.

## Rules for agents

- No new npm packages. Web only: no Electron, no .exe.
- Never send save data to the directory; it gets only the minimal display profile.
- Keep input validation, bounded messages, CORS and rate limits.
- Commit only tested changes and update this file before pushing.
