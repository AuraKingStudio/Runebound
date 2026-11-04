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

- **Updated:** 2026-11-04 (Happy, for PM Bob; security by Zulu, reviews by Hawk)
- **Task and goal:** More grinding, resources and trading (round 3), then a UI rework that fits the rune isle ("Dusk Aether"). Push after Zulu's and Hawk's reviews.
- **Status:** Everything below is committed locally on `main` up to 829395b and **not pushed**. On a clean checkout of 829395b, `npm test` passes ALL (678 checks, up from 581 at 0ee50c4) and `npm run bench` passes ALL (33 scenarios).
- **Changes, round 3 (grinding, resources, trading):**
  - Materials on the server (b89a70d, edc6ba9, 318d819; Zulu): every material change is a ledger entry `["mat", 0, 0, src, key, n]` with per-source caps, gaps and daily caps, plus the server recipe table (cb33d73). Contract payouts can't mint rare materials. Migration writes the refund and the migrated flag in one atomic write.
  - F4 Gathering (2ed76c2): 6 nodes on the hub island (Rune Ore, Moonherb, Echo Shard), a 1.2 s channel (moving cancels it), and each node regrows after 60 s. The daily curve is full yield for 40 gathers, half to 80, then a fifth. Mastery runs from level 1 to 10 at +4% each, with a fractional carry and no dice. `matAdd(k, n, src)` is the only way materials change; the hub's gold/XP audit skips `"mat"` entries. Smith recipes: refine ore (5 ore + 2 echo → 3 dust) and Moon Tonic (4 herb + 1 echo: +8% damage for the next raid).
  - Trading (8719076, Zulu): online only, through bank escrow and a 🤝 Trade window.
  - F5 Contract Board (637f2a1): the Quest Board shows 3 orders a day picked from the date, so everyone sees the same board. A delivery logs its `"contract"` spends before the gold, XP and Echo payout (within `RULES.contract`), with 30 s between deliveries.
  - F6 Maiden's Exchange (cf7998a): ore, herb and echo barter for each other, never gold. Each material's daily demand (×0.8/1/1.25) comes from the date, and every trade of a material that day adds +25% to its price. 10 trades a day; no A→B→A loop pays.
- **Changes, UI "Dusk Aether" (`index.html` CSS, plus `loCls()`):**
  - P1 (6f141de): `--ae-*` tokens, twilight glass panels with a violet mist top, teal glyph edges and code-drawn rune corner notches, small-caps titles and teal focus rings. Panels stay dark, so all ~195 inline light text colours keep ≥4.5:1 contrast.
  - P2 (42fc2d1): chamfered runestone HUD plates, a rune-coin gold pill, and teal-glass chat and action banner. The net badge moved under the gold (fixes the overlap with the quest tracker at 844×390). `body.lo` follows `SET.low` (no glows on Low spec). Colours are baked hex because `color-mix` is missing on older tablets.
  - P3 (5b7b3e0): twilight rows tinted by their accent (`color-mix` only inside `@supports`), teal runestone buttons, a slate disabled state, glass raid cards, and teal close buttons and tabs. HUD tap targets are ≥44 px on touch and phones; hover glows apply only under `(hover: hover)`.
  - P3 fixes (829395b): white text on the red/violet blackjack STAND and SPLIT, 44 px dialog buttons on touch, and on short screens (≤480 px tall) the blackjack moves stay pinned to the window bottom via `:has()` (older browsers just scroll).
- **Validation (clean checkout of 829395b):** `npm test` ALL PASSED (678 checks). `npm run bench` ALL PASSED (33 scenarios). 12-player phone host: CPU 36.5 of 50 ms/s when everyone walks and 17.6 when idle; upload 0.100 and 0.021 of 0.5 Mbit/s. Headless Chrome at 1280×720, 1024×768 and 844×390: hub, Maiden, Quest Board and Settings render with no console errors, and gathering works end to end (channel, yield, ledger entry).
- **Not tested:** real phones and tablets (touch, iOS Safari, older Android WebView) for the new UI, the gathering nodes, the Contract Board and the Exchange; two-browser trading; Low spec mode on a real weak GPU.
- **Known issues and risks:**
  - The phone-CPU bench checks are timing-sensitive: under heavy machine load they read 50-89 of 50 ms/s at any commit. Run the pre-push bench on a quiet machine.
  - Several agents share one working tree: build each commit from the HEAD blob plus your own edits, written through a temp file and a rename, and check `git show --stat`.
  - The panel scrollbar is still gold (cosmetic, for a P4).
  - Gathering nodes sit at fixed island spots: if the river or NPCs move, re-check them with `riverNear` and `bridgeAt`.
- **Next step:** Hawk passes round 3, then Bob pushes. After that: real-device QA at 1024×768, 820×1180 and 844×390, and the P4 scrollbar.

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
