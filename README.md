**Play in your browser:** https://aurakingstudio.github.io/Runebound/

# Runebound (prototype)

- A browser game: play it at the link above, or open `index.html` locally (single player works offline).
- Progress (gold, upgrades, quests) is saved in the browser's storage.
- Press **Esc** or **P** (or use Pause) to pause.

## Files

- `index.html`: the whole browser game, including its networking.
- `src/app.js`: the only Node file: the hub directory service (`npm run signaling`).
- `src/test.js`: game, transport and directory tests (`npm test`).
- `assets/icon.png`: tab icon.

## Player-hosted hubs (pilot)

After the player name is set, the game asks the hub directory for a seat. The directory assigns the first hub with an open seat, in numeric order: up to 10 hubs of 10 players. The first player in an empty hub hosts it. The corner badge shows the hub number, why it was chosen, and whether you are connecting, connected or synced.

**How the traffic is split.** Each player shows its own actions at once: movement, chat and emotes. The host then checks only what could be cheated. It clamps steps that are too fast for the class, speed bonus and dash cooldown, and rate-limits chat and emotes. It confirms each chat or emote, or rejects it so the sender's screen undoes it. A movement correction shifts the player by the host's error without throwing away the steps walked since.

**How it stays light.** Names, classes and levels are sent only in a roster message when someone joins or leaves. Positions travel as `[slot, x, y, facing]` whole numbers. The host sends only players who moved (10 times a second), plus a full refresh once a second. Guests send at most 15 updates a second while moving and one keep-alive a second while still. Remote players are drawn about 150 ms behind and smoothed, so uneven updates still look like walking.

**Not implemented:** raid sync, host migration, reconnect, accounts, and PC/console/phone host ranking. A player-controlled host can still cheat; these checks are not robust anti-cheat. There is no 100-player benchmark.

### Run it locally

1. `npm run signaling`: starts the directory on port 8787 (set `PORT` to change it).
2. `npm run dev`: serves the game on http://localhost:8080. On localhost the game uses `http://localhost:8787` automatically.
3. Open two tabs, for example in VS Code's **Simple Browser: Show**: `http://localhost:8080/?player=1` and `http://localhost:8080/?player=2`. On localhost, `?player=N` gives each tab its own save, so they are two different players. The first hosts Hub 1, the second joins it.

### Hosting for other people

GitHub Pages only serves files; it cannot run `src/app.js`. Run the directory on a reachable machine behind HTTPS. Set `ALLOWED_ORIGINS` to the game's exact origin (e.g. `https://aurakingstudio.github.io`). Then set `signalingUrl` in `NETWORK_CONFIG` in `index.html`. It is blank in the public build, so nothing is publicly hosted right now. Cloudflare Quick Tunnel URLs change on every restart; use a named tunnel and a stable domain. Players on strict networks may need a TURN relay in `iceServers`. Never commit private TURN credentials.

The directory keeps hub seats and WebRTC offer/answer data in memory only; a restart clears it. It never receives save data or runs the game. Shared display profiles are player-supplied, not verified.
