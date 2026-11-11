**Play in your browser:** https://aurakingstudio.github.io/Runebound/

# Runebound (prototype)

A co-op raid game that runs in the browser: a floating hub island, NPCs, and boss raids for 3 or 6 players (you plus bots or friends). All art is drawn in code (canvas and SVG); the only image file is `assets/icon.png`.

- Play at the link above, or open `index.html` locally (single player works offline).
- Your progress (gold, gear, materials, quests) is saved in the browser. The player market is paused until wallets can be verified server-side (see below).
- **Esc** or **P** pauses. **Settings** (top bar) has sound, keys, frame cap (30/60/144/Max), Show FPS, Low spec mode and dash aim.

## What is in the game

- **Hub NPCs** (8 spots). Every NPC window has one header with a ✕ and, where it has sections, one tab bar:

  | NPC | Tabs / what they do |
  |---|---|
  | Elder | Quests (main + side) · Bounties (daily) · Contracts |
  | Class Master | Class · Raid skills (pick the 2 skills you bring) |
  | Merchant | Upgrades · Gear · Shop (Rune Pass, cosmetics) · Market (paused) |
  | Archivist | Tales with gifts and secret pages |
  | Smith | Forge · Temper (and salvage) · Refine |
  | Beastkeeper | Pets (one follows you); the Zen Garden opens with him |
  | Seraph | One-raid blessings for gold |
  | Barkeep | Blackjack · Daily (Wish Shrine, Wheel, Reels, Dig; red count while rewards wait) |

  The Maiden is off the hub for now (her code is kept for the Archivist secret-NPC rework).
- **Raids:** The Hollow Seer (3 players) and Thornmaw Colossus (6 players). **Rune Trials** are endless harder versions with bigger rewards.
- **Gear:** six slots (weapon per class, armor, charm, helmet, gloves, boots), five rarities, and a perk on class weapons at each rarity.
- **Materials:** about 4 per raid win, used to forge and trade.
- **Daily rewards** live in the Barkeep's Daily tab (or **G**). The Zen Garden has its own 🌸 top-bar button.
- **Rune Wishes:** free Wish Shrine with auras, trails, emote bubbles, pet hats, name effects and titles; outfits show to everyone live (bank-confirmed online).

## Files

- `index.html`: the whole browser game, including its networking.
- `src/app.js`: the hub service: hub directory (WebRTC setup) and opt-in market routes (`npm run signaling`; market disabled by default).
- `src/market.js`: the player market (server escrow) and its JSON store.
- `src/playtest.js`: LAN playtest: serves the game and the hub service together (`npm run playtest`).
- `src/test.js`: game, network, market and directory tests; `src/test-db.js`: PostgreSQL bank tests (run when `TEST_DATABASE_URL` points at a database whose name ends in `_test`, otherwise they print SKIP). `npm test` runs both; `npm run bench` runs the raid and network benchmarks.
- `assets/icon.png`: tab icon.
- `AgentInstruction.md`: working notes and rules for contributors and coding agents.

## Agent handoff

Before handing work to another agent, update this section with enough detail for someone unfamiliar with the game to continue without guessing. Keep it current and concise; distinguish verified facts from plans, and do not overwrite or discard unrelated work in a dirty working tree.

### Current handoff

- **Updated:** 2026-11-11 (runebound-05), second pass: UI overhaul from web research (NN/g hierarchy and grouping, Xbox XAG labels/contrast, 44-48 px touch targets, tabs vs radio pickers, 8 px spacing)
- **Goal (owner):** tutorial must work; less text; one clear, consistent UI style; NPC content shown simply; DPS Engine bar; raid popups off the center; hide the hub message; F2 dev menu with Finish tutorial. Push.
- **Status:** committed on `main` and pushed. BUILD 2026.11.11.2.
- **Second pass:** Smith slot pickers fixed (`FORGE.k=` was a JS syntax error, so only Weapon worked); `fgrp(label, inner)` = one labelled, boxed control group (Smith 1 Slot / 2 Item / 3 Rarity, Settings, Save); `tabsBar(..., sub)` pickers are `role="radiogroup"` with a ✓ on the picked option; Settings = Game | Keys | More tabs; Save = Export / Import / Reset (danger) groups; Wish Shrine sub-tabs use the picker look and shorter text; hub NPC names always show (12 px).
- **Changes:**
  - One button system (Bob's batch 1): gold primary `.claim`, dark secondary, 44 px icon `.x`; every dialog has `dlgHead()` + one ✕.
  - `tabsBar(items, cur, js, sub)`: the one tab bar. Merchant, Class Master (Class | Raid skills), Elder (Quests | Bounties | Contracts), Barkeep (Blackjack | Daily), Smith (Forge | Temper | Refine), Shop sub-tabs, Daily games. `sub` = pickers (garden seeds, Smith slot/type/tier).
  - Row action buttons are one size (116 x 44) and one look. Gold purse row under every header (no header purse hitting the ✕).
  - Raid skills: big rows with "✔ Bringing" / "Bring" (`ldUI`), off the raid screen.
  - Raid: `popMsg` in the arena = one small line at 13% height (no stack over the boss); result = compact card under the boss bar; `engineBar()` bottom-left for DPS.
  - `#netBadge` hidden unless the dev panel is open. F2 always answers: dev tools, or a dev-code prompt (same hash) when the flag is not set. Dev tools: **Finish tutorial** (`devTutDone`).
  - Tutorial verified headless as a new player: walk → Class Master → Elder → Merchant → Archivist → Smith → Beastkeeper → raid, each step via the real interact key.
- **Checks:** `npm test` passes (the PostgreSQL bank tests SKIP without TEST_DATABASE_URL). `npm run bench` passes; the phone-CPU checks hover at the 50 ms/s limit and flake under load (untouched `main` flakes the same way).
- **Not tested:** physical phones/tablets; Firefox/Safari.
- **Next:** owner playtest of the new windows; README tables stay in sync with `tabsBar` users.

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
