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
- **Task and goal:** Juicier blackjack (VFX + SFX on every beat), an Assist price that multiplies and cools down, and a big Assist seconds-left clock.
- **Status:** Implemented. Unit tests pass. The phone-CPU bench rows fail on this PC right now, at the old code as well (see Validation). Not tested on real phones or tablets.
- **Changes (all in `index.html`):** `BJ_SFX` (after `sfx()`) makes synthesized sounds for deal, flip, chip, hit, stand, double, split, reveal, bust, win, lose, push, blackjack and streak(n), and respects volume. `BJ_VFX` (before the blackjack section) draws one overlay canvas (`canvas.bjfx`) only while particles live. Its typed-array pool holds 240 particles (80 in Low spec) with no per-frame allocation: sparks, coins, chips, confetti, dust, rings, and coin/chip flights from A to B. CSS adds a deck shoe, table flashes, rubber-stamp results (WIN/LOSE/PUSH/BUST/BLACKJACK), a floating STAND tag, a bust slump, a hit card slam with a glowing total, and a win-streak badge. `bjFx` plays each action's beat; `bjFxEnd` runs once per round: hole-card flip, the Barkeep's draws, then stamps, payout coins to the purse, lost chips to the Barkeep, dealer-bust smoke and the streak. The streak is a display counter only. Assist: price = 50 × `V.bjm`; each rent multiplies `V.bjm` by 1.5 (cap ×20), and the extra halves every 10 minutes since `V.bjmAt`. Both are saved. The button shows "price → next · ×1.5" with a "cools down over time" line. `bjClock` shows whole seconds with spinning coins, rays and an aura that turns hot at 10 s or less. A 1 s `setTimeout` updates only the number; it stops on `closeDlg` and when the Assist ends. A natural adds a "+10 s" pop. The old per-frame `.bjleft` query in the HUD loop is gone.
- **Decisions:** Settings: Low spec (×0.4 particles, 80-particle pool, no flash, no card glow, static clock), effects off (×0.35, softer clock), Screen shake (scales or removes table and world shake), reduced motion (no particles, flash, shake or BLACKJACK banner; the clock shows only the number; the `!important` card glow is overridden). Payouts, odds and the tutorial hand (DOUBLE only, lands 21) are unchanged. Assist rent only ever spends (`goldAdd(-price, "bjchart")`), and a broken save multiplier reads as ×1.
- **Validation:** `npm test`: 510 PASS, 3 FAIL. The 3 fails are only the bench phone-CPU rows (walk/chat/churn 12p: 59.0/58.4/58.2 of 50 ms/s). An earlier run in this session passed in full. `npm run bench`: 4 FAILED, then 3 FAILED on a rerun (same rows plus dash/audit 12p, 50–57 ms/s). A baseline at HEAD's `index.html` (without the blackjack changes) failed the same way twice (4 and 5 FAILED), so the cause is PC load, not this change. New tests: 27 for the pool, Low spec, effects off, shake, reduced motion, streak, banner, sound wiring, Assist price growth, decay (stubbed `Date`), short gold, broken and capped multipliers, and clock start/stop. Headless Chrome screenshots at 1280×720, 1024×768, 768×1024, 844×390 and 640×390 showed no layout overflow and no console errors. Natural blackjack was checked normal, reduced motion and Low spec. 390×844 shows the game's rotate prompt. `git diff --check` is clean.
- **Known issues and risks:** **The server does not validate the Assist price yet.** A modified client could underpay (`bjchart` is just an allowed spend in `src/bank.js`), so server-side pricing is a follow-up. Particle positions for mid-animation cards are estimated from the row layout. The 640×390 table panel scrolls vertically, as it did before.
- **Next step:** Check the feel and frame time on a real low-end phone and tablet (touch + controller). Move Assist pricing onto the VPS bank.

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
