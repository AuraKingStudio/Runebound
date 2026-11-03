**Play in your browser:** https://aurakingstudio.github.io/Runebound/

# Runebound (prototype)

A co-op raid game that runs in the browser: a floating hub island, NPCs, and boss raids for 3 or 6 players (you plus bots or friends). All art is drawn in code (canvas and SVG); the only image file is `assets/icon.png`.

- Play at the link above, or open `index.html` locally (single player works offline).
- Your progress (gold, gear, materials, quests) is saved in the browser. Market listings are held by the hub service (see below).
- **Esc** or **P** pauses. **Settings** (top bar) has sound, keys, frame cap (30/60/144/Max), Show FPS, Low spec mode and dash aim.

## What is in the game

- **Hub NPCs** (8 spots, one kept free for a future pet NPC):

  | NPC | What they do |
  |---|---|
  | Elder | Quest chain; some quests unlock NPCs |
  | Merchant | Upgrades, rotating equipment stock, and the player **Market** |
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
- `src/app.js`: the hub service: hub directory (WebRTC setup) and the market routes (`npm run signaling`).
- `src/market.js`: the player market (server escrow) and its JSON store.
- `src/playtest.js`: LAN playtest: serves the game and the hub service together (`npm run playtest`).
- `src/test.js`: game, network, market and directory tests (`npm test`); `npm run bench` runs the raid and network benchmarks.
- `assets/icon.png`: tab icon.
- `AgentInstruction.md`: working notes and rules for contributors and coding agents.

## Agent handoff

Before handing work to another agent, update this section with enough detail for someone unfamiliar with the game to continue without guessing. Keep it current and concise; distinguish verified facts from plans, and do not overwrite or discard unrelated work in a dirty working tree.

### Current handoff

- **Updated:** 2026-11-03
- **Task and goal:** Resolve the test and validation blockers identified before publishing the pending game changes.
- **Status:** Fixed the validation blockers; the complete test suite and benchmark pass.
- **Changes:** `src/test.js` now checks brain initialization, training, persistence, throttling, admin controls, HTTP routes, the Epic Raid client sample/send flow, and uses a fixed RNG for repeatable gameplay simulations. `src/brain.js` now safely rejects admin keys whose UTF-8 byte lengths differ and cancels pending save timers on synchronous flush. `AgentInstruction.md` records the Echo Archon and remaining real-browser validation gap.
- **Decisions:** Preserve gameplay assertions; make simulation inputs reproducible instead of weakening expected outcomes. Keep admin failures shaped as 403 rather than allowing `timingSafeEqual` to throw.
- **Validation:** `npm test` and `npm run bench` both pass with stable lobby/raid results and headless Epic Raid brain flow. `git diff --check` passes.
- **Known issues and risks:** No real-browser or hosted-hub end-to-end validation has been run for the Echo Archon.
- **Next step:** Verify the Echo Archon against a real browser and hub service before relying on its learned behavior in a hosted game. Changes are ready to commit and push.
- **Worktree notes:** The Epic raid UI, shared brain service/routes, tests, and handoff documentation form one coherent change set; do not partially publish the UI without its service or vice versa.

## Player market (server escrow)

Merchant › **Market** lets players sell materials and spare gear to each other for gold.

**How a trade works**

- **Listing:** listing an item moves it from the player's save to the server. The server is then the only copy.
- **Buying:** buying delivers the item from the server at once.
- **Payouts:** the seller collects the gold, minus a 5% tax (a gold sink), with **Collect**.
- **Expiry:** unsold items return to the seller after 48 h.
- **Limits:** at most 6 open listings per player, and prices from 1 to 1,000,000.

**How the data is stored**

- **Identity:** each player has a private random key in `localStorage` (`rb_mtok`). The server stores only its SHA-256 hash.
- **File:** listings and payouts live in `market.json`, which is git-ignored. The server writes it atomically (a temp file, then a rename) and at most every 500 ms.

**Known gap:** wallets (gold, items) still live in the browser save, so an edited save can list items it never earned. The planned fix is server-side wallets once the game runs on a VPS.

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
