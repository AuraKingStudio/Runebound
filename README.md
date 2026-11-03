**Play in your browser:** https://aurakingstudio.github.io/Runebound/

# Runebound (prototype)

A co-op raid game that runs in the browser: a floating hub island, NPCs, and boss raids for 3 or 6 players (you plus bots or friends). All art is drawn in code (canvas and SVG); the only image file is `assets/icon.png`.

- Play at the link above, or open `index.html` locally (single player works offline).
- Your progress (gold, gear, materials, quests) is saved in the browser. The player market is paused until wallets can be verified server-side (see below).
- **Esc** or **P** pauses. **Settings** (top bar) has sound, keys, frame cap (30/60/144/Max), Show FPS, Low spec mode and dash aim.

## What is in the game

- **Hub NPCs** (8 spots, one kept free for a future pet NPC):

  | NPC | What they do |
  |---|---|
  | Elder | Quest chain; some quests unlock NPCs |
  | Merchant | Upgrades and rotating equipment stock; the player **Market** is paused |
  | Archivist | Tales with gifts and secret pages |
  | Smith | Forge gear from raid materials, temper, salvage, refine |
  | Seraph | One-raid blessings for gold |
  | Maiden | Rare trader, and a free daily blessing |
  | Barkeep | Blackjack |

  Class change is the **Class** button in the top bar.
- **Raids:** The Hollow Seer (3 players) and Thornmaw Colossus (6 players). **Rune Trials** are endless harder versions with bigger rewards.
- **Gear:** six slots (weapon per class, armor, charm, helmet, gloves, boots), five rarities, and a perk on class weapons at each rarity.
- **Materials:** about 4 per raid win, used to forge and trade.

## Files

- `index.html`: the whole browser game, including its networking.
- `src/app.js`: the hub service: hub directory (WebRTC setup) and opt-in market routes (`npm run signaling`; market disabled by default).
- `src/market.js`: the player market (server escrow) and its JSON store.
- `src/playtest.js`: LAN playtest: serves the game and the hub service together (`npm run playtest`).
- `src/test.js`: game, network, market and directory tests (`npm test`); `npm run bench` runs the raid and network benchmarks.
- `assets/icon.png`: tab icon.
- `AgentInstruction.md`: working notes and rules for contributors and coding agents.

## Agent handoff

Before handing work to another agent, update this section with enough detail for someone unfamiliar with the game to continue without guessing. Keep it current and concise; distinguish verified facts from plans, and do not overwrite or discard unrelated work in a dirty working tree.

### Current handoff

- **Updated:** 2026-11-03
- **Task and goal:** Seamless host migration (hub and arena stay alive), forced DOUBLE on the blackjack tutorial hand, Cloudflare tunnel setup.
- **Status:** Implemented; `npm test` passes in full. Not yet tested with real players across networks.
- **Changes:** Host pings guests every 2 s (`hq`); guests answer with time in hub, frame time, a one-off CPU benchmark and phone flag (`hr`); host ranks them (`netScore`: time in hub weighs most, then frames, CPU, ping, phone penalty) and shares the top 3. On host loss (channel close, or 6 s without `hq`), every guest runs `netMigrate`: the first live successor reopens the same `?room=` as host (`directoryJoin(profile, { host: true })`), the others rejoin after 1.2 s, with a 6 s fallback to the next successor. Remote players stay on screen as ghosts and are absorbed silently on rejoin; ghosts that never return leave after 15 s. Raids no longer end on leader loss: `raidFailover` makes the lowest-key member leader from its last snapshot; the old leader's hero becomes an ally bot. The blackjack tutorial hand (11 vs dealer 10) shows only DOUBLE, which draws a 10 for 21 and works even when the player is short on gold. `npm run online` starts signaling with Cloudflare trust (`--cf`); `npm run tunnel` runs `cloudflared`; `HOSTING.md` is the owner's step-by-step guide (play via `?hub=https://….trycloudflare.com`).
- **Decisions:** Successor choice is client-reported (unverifiable); the worst a liar gains is hosting. Raid handover grants no extra rewards.
- **Validation:** `npm test` passes, including 6 host-migration tests and 2 blackjack-tutorial tests. `git diff --check` is clean. Bench not run.
- **Known issues and risks:** The switch shows a ~1–3 s freeze of others/the boss while peers reconnect via ntfy (own character keeps moving). Directory (`?hub=`) mode depends on the owner's PC for re-join, so takeover only works while that service is up. Parties keyed to the old host end. `cloudflared` was not found on the owner's PC at the time of writing.
- **Next step:** Real cross-network test of migration with 3+ players; then pre-opened standby links to the successor to remove the reconnect freeze; then TURN.

## Player market (paused for release)

Merchant › **Market** is closed in the browser build. The Market Day quest is automatically treated as complete so this release gate does not block the Elder quest chain.

The directory server also disables market routes by default. `createDirectoryServer({market:true})` is an explicit test/development opt-in, not a production setting.

The escrow implementation remains for tests and future use. It supports listings, purchases, seller payouts (5% tax), 48-hour expiry, and six open listings per player.

**How the data is stored**

- **Identity:** each player has a private random key in `localStorage` (`rb_mtok`). The server stores only its SHA-256 hash.
- **File:** listings and payouts live in `market.json`, which is git-ignored. The server writes it atomically (a temp file, then a rename) and at most every 500 ms.

**Release gate:** gold and inventory still live in the editable browser save, and purchases are not debited against server-authoritative wallets. Keep the market disabled until wallet balances and item ownership are enforced server-side.

## Multiplayer (pilot)

On localhost, after the player name is set, the game asks the hub directory for a seat. The directory assigns the first hub with an open seat, in numeric order: up to 10 hubs of 12 players. The first player in an empty hub hosts it. The network badge shows the hub, assignment reason, and connection state. The public build uses serverless `?room=` links and an external ntfy relay for WebRTC setup; it has no hosted game directory by default.

**How the traffic is split.** Each player shows its own actions at once: movement, chat and emotes. The host then checks only what could be cheated. It clamps steps that are too fast for the class, speed bonus and dash cooldown, and rate-limits chat and emotes. It confirms each chat or emote, or rejects it so the sender's screen undoes it. A movement correction shifts the player by the host's error without throwing away the steps walked since.

**How it stays light.** Names, classes and levels are sent only in a roster message when someone joins or leaves. Positions travel as `[slot, x, y, facing]` whole numbers. The host sends only players who moved (10 times a second), plus a full refresh once a second. Guests send at most 15 updates a second while moving and one keep-alive a second while still. Remote players are drawn about 150 ms behind and smoothed, so uneven updates still look like walking.

When a hub host disappears, guests leave the dead session and retry with capped backoff. If they were in a raid, they return to the hub without win/loss rewards. This does not migrate hub or raid state; a guest in a public room cannot take over the old host's room. Accounts, host ranking, and TURN relay are also not implemented. A player-controlled host can still cheat; these checks are not robust anti-cheat. There is no 100-player benchmark.

### Run it locally

1. `npm run signaling`: starts the directory on port 8787 (set `PORT` to change it).
2. `npm run dev`: serves the game on http://localhost:8080. On localhost the game uses `http://localhost:8787` automatically.
3. Open two tabs, for example in VS Code's **Simple Browser: Show**: `http://localhost:8080/?player=1` and `http://localhost:8080/?player=2`. On localhost, `?player=N` gives each tab its own save, so they are two different players. The first hosts Hub 1, the second joins it.

### Hosting for other people

GitHub Pages only serves files; it cannot run `src/app.js`. The public build currently uses `?room=` peer-hosted rooms and the external ntfy relay; no directory service is configured by default. To use directory-managed hubs, run the directory on a reachable machine behind HTTPS, set `ALLOWED_ORIGINS` to the game's exact origin (e.g. `https://aurakingstudio.github.io`), and configure `signalingUrl` in `NETWORK_CONFIG` in `index.html` or pass an approved `?hub=` URL. Cloudflare Quick Tunnel URLs change on every restart; use a named tunnel and a stable domain. Players on strict networks may need a TURN relay in `iceServers`. Never commit private TURN credentials.

The directory keeps hub seats and WebRTC offer/answer data in memory only; a restart clears it. It never receives save data or runs the game. Shared display profiles are player-supplied, not verified.

## Release validation

| Area | Verified here | Still unverified |
|---|---|---|
| Automated | `npm test`, `npm run bench`, and `git diff --check` pass. | Hosted deployment behavior. |
| Local multiplayer | Two local browser pages synced; guest chat reached the host; reloading the host produced one disconnect notice and the guest reconnected to a synced hub. | Public `?room=` flow and cross-network WebRTC/TURN behavior. |
| Responsive UI | Integrated-browser checks at phone portrait and landscape sizes; portrait shows the rotate prompt and the network badge clears the top controls in landscape. | Physical phone/tablet testing and sustained low-end performance. |
| Persistence/support | Browser save survived reload; save-storage write failures now produce a visible warning; settings and feedback forms opened without submitting feedback. | Save export/reset is not player-facing; feedback delivery to a hosted endpoint was not tested. |
| Browsers | Integrated browser only. | Separate Chrome, Firefox, Safari, and Edge installations. |
