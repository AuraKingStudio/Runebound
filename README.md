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

- **Updated:** 2026-11-04 (Happy, for PM Bob; security review by Zulu/Hawk)
- **Task and goal:** Ship and harden everything since ba0b406: save codes, What's new, the guest/room trust fixes and the bank seed limit. Push after Zulu's two-browser room test.
- **Status:** All items below are committed on `main` up to 0ee50c4. On a clean checkout of 0ee50c4, `npm test` passes ALL (581 checks) and `npm run bench` passes ALL (33 scenarios).
- **Changes:**
  - Guest gate (fedc1ab): a guest takes hub messages (roster, joins, leaves, classes, colours, positions) only from its host, `NET_SESSION.peerId`.
  - Room signing (4de180e): hosts sign answers and guests sign offers, and invite links carry the host key hash (`hk`). **Old `?room=` links without `hk` are refused**, so players need a fresh invite link.
  - Bank (de9f0b4, `src/bank.js`, `src/app.js`): at most 3 seeded new accounts per IP per day (Cloudflare-aware IP), so a shared save code can't farm starting gold or XP.
  - Dev server (efd094b, `src/playtest.js`): an allow-list serves only `index.html` and assets, never bank/market/brain data, logs, docs, source or dotfiles. A malformed URL gets 400, and `npm run dev` binds to 127.0.0.1.
  - F2 save codes (f136b56): Settings › 💾 Save exports an `RB1.<base64>.<checksum>` code. Import goes through the normal load sanitizer, and no autosave can overwrite it before the reload. Reset needs RESET typed. The bank syncs once at load, so online gold and XP always come from the server, and the code never contains `rb_btok`.
  - Load hardening (21f4e0b): `up` takes only dmg/vit/spd/cdr, classes are checked with `Object.hasOwn(CL, …)`, raw numbers must be finite and are range-clamped, `tut` is 0-4, and gold that isn't finite becomes 0. The reset dialog says that online the bank restores gold and XP.
  - Blackjack Stats clamps (ca8d135): each part is clamped to the hands played, bars are capped at 100%, and net gold uses trunc.
  - F3 What's new (f0a76ce, 0ee50c4): a corner card (`#news`) once per `BUILD` (stored in `rb_news`), with a soft `sfx("coin")` at the player's volume. Close it with ×, or it fades after 14 s. It is never a dialog, and players who haven't finished the tutorial skip it. NEWS includes the fresh-invite-link notice. **To announce an update, bump `BUILD` and edit `NEWS`** (index.html, above `sfx`).
- **Validation (clean checkout of 0ee50c4):** `npm test` ALL PASSED, 581 checks (539 at b3a8cea). `npm run bench` ALL PASSED, 33 scenarios. 12-player phone host: CPU 34.0 of 50 ms/s when everyone walks and 15.1 when idle; upload 0.022 of 0.5 Mbit/s when idle. `git diff --check` is clean, and `npm audit` reports 0 vulnerabilities.
- **Not tested:** a real two-browser room with signing (Zulu is running it before the push); phones and tablets for F2's Save dialog, the F3 card and the Stats tab; the bank IP limit behind the live Cloudflare tunnel.
- **Known issues and risks:** The phone-CPU bench checks are timing-sensitive. Under heavy machine load (other agents' browsers) walk/dash 12p read 51-77 of 50 ms/s, and they pass on a quiet run (f0a76ce and 0ee50c4 measure the same, 7.3 ms CPU). Several agents share one working tree: build each commit from the HEAD blob plus your own edits, and check `git show --stat` (21f4e0b swept in early room-signing code; Bob kept it). Old invite links stop working when this is pushed.
- **Next step:** Zulu finishes the two-browser E2E, then Bob pushes. After that: tablet QA at 1024×768, 820×1180 and 844×390 for the Save dialog, the What's new card and the Stats tab.

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
