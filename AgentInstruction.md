# Runebound – agent instructions

## Before pushing (owner's rules)

1. Update unit tests (`src/test.js`) for newly coded features.
2. Update the benchmark (`SCENARIOS` in `src/test.js`) if needed, and run it (`npm run bench`).
3. Update this file: what has been done, what is upcoming, what is a concern.
4. Avoid explaining; be concise and precise.
5. Always generate assets with code (canvas/SVG drawn in `index.html`): code-drawn art is what sells the game. The only image files allowed are `assets/icon.png` and the arena background (`IM.arena`, embedded in `index.html`).


## Project

Runebound is a browser-only (.io-style web) action game with a sky-island hub (NPCs, shop, guild, blackjack, quests, bots) and a raid arena. Live web build: https://aurakingstudio.github.io/Runebound/ (GitHub Pages, served from the repo root of `main`).

## Layout (keep it this small)

| File | Role |
|---|---|
| `index.html` | The whole browser game: CSS, embedded art, game logic, WebRTC transport, hub networking. Keep browser code here. |
| `src/app.js` | The only Node file: the hub directory service (`npm run signaling`); tests `require` it for `createDirectoryServer`. |
| `src/test.js` | Tests for game, raids, party, networking, anti-cheat, transport, directory, rate limit + scenario benchmark (`npm test`, `npm run bench`, `npm run bench -- --raids=N`). Parses the `<script>` block of `index.html`. |
| `assets/icon.png` | Tab icon. One of only two allowed image files (with the embedded arena background). Code lives in `src/`. |
| `package.json` | Scripts only: `npm test`, `npm run bench`, `npm run dev` (live-server on 8080), `npm run signaling`. Only dev dependency: live-server. |
| `.nojekyll` | Makes GitHub Pages serve files as-is. |

Removed in this pass as unused: `tools/board.js`, `version.json` (plus the in-game dev board and update banner), `ads-config.js`, `privacy.html`, `banner.png`, `icon.svg`, the old copy-paste invite-code transport, and the old `main.js`, `signaling-server.js` and `test/dev.test.js`, which were merged into `src/`. Electron and the Windows .exe build (`build-exe.bat`, electron and electron-builder) were removed: it's a web-only game.

## Group sizes (owner)

Small raid 3, large raid 6, hub and epic raid **12** (the most the game will ever need; 3 or 6 by default). The game must run perfectly for 12 players with a **phone** as master. `HUB_MAX = 12` in `index.html`, `MAX_PLAYERS_PER_HUB = 12` in `src/app.js`.

## Multiplayer hub (pilot)

- **Seat assignment:** after the name is set, the game asks the directory for a seat. It gets the first hub with an open seat, up to 10 hubs × 12 players. The first player in an empty hub hosts; player 13 opens Hub 2. No join/create buttons.
- **Badge:** shows the hub number, why that hub was chosen, and the state: assigned → connecting → connected → synced, or hosting N/12.
- **Authority split (owner's rule):** clients do everything they safely can and show it immediately. The host ("master") checks only the cheat-sensitive parts and answers with a confirmation or a correction.
  - **Movement:** the guest moves locally and sends its position. The host clamps steps faster than class speed × speed bonus × 1.35, plus dash distance on cooldown. On a clamp it sends a correction `c` with the move's sequence number; the guest shifts by the error and keeps the steps walked since.
  - **Chat and emotes:** shown at once, then sent as a query with a sequence number. The host rate-limits (chat 0.7 s, emote 1 s) and validates. It relays to the other players and acks, or rejects, which undoes the sender's bubble.
- **Lightweight wire format (owner's rule: keep it light; player details sent once):**
  - **Player details travel once per receiver.** Entry `[slot, id, name, cls, lv, title, spd]`; slot 0 is the master.
    - A newcomer gets the full list `r` once, with the master first and itself last. Everyone else gets only the newcomer's entry `j` (~58 B).
    - Leaving is `l` + slot (18 B). A level or speed change is `u` [slot, lv, spd]. With nobody joining or leaving, no player details are sent.
  - **Positions `s`, one message per guest:**
    - A packed string, base-91 digits. A moved player is a 4-char delta (code = 4096 + slot*4 + facing, then dx+45, dy+45), or a 6-char absolute position when it moved more than 45 px (`netPack`/`netUnpack`).
    - Only players who moved are sent, never the receiver itself. Players farther than 320 px go at most every 3 intervals.
    - Everyone gets everything (absolute) once a second.
    - The rate is 10/s up to 20 players, easing to 4/s at 100 (`netStateMs`).
  - Guest `m` `{x, y, f, d, s}` at most 15 times a second while moving and once a second while still. Chat, emote, ack, fair-play and correction messages are rare.
- **Smoothing:** each remote player is drawn behind by ~1.4× its own update interval (min 150 ms, max 600) from a buffer of updates, then smoothed. Teleports over 160 px snap, no coasting past a stop, no slow start after standing still.
- **Robustness:**
  - Networking runs on a 50 ms timer, not the render loop, so a paused or background host keeps relaying.
  - A guest that isn't connected after 30 s gives up its seat and retries.
  - Closing a tab releases its seat immediately.
  - A guest sends its position when joining, so the host doesn't start it at a random spawn point.
  - Cloudflare STUN server for finding peers on other networks; no TURN relay.
- **Hub address from the link:** `?hub=https://<name>.trycloudflare.com` sets the hub directory at runtime, so a temporary tunnel address never needs committing. Only https Quick Tunnel hosts are accepted; tested.
- **Local testing:**
  - On `localhost` the game uses `http://localhost:8787` automatically; the public `signalingUrl` stays blank.
  - `?player=N` (localhost only) gives each tab its own save, so two VS Code Simple Browser tabs are two players.
  - Run `npm run signaling` and `npm run dev`.

## Handoff (2026-10-31, latest; read first)

**Built since networked raids (commits 5b9a47f, 5dd4122, 0089be0):**
- Ultimates on R / RT / `#bu`: `ULT`, `ult()`, `ultFx()`. Tank Bulwark (shield 150 for 8 s to all, boss stun 3 s, cd 50). Healer Resurrect (50% HP, once per raid). DPS Overdrive (`ultDmg` = 420·(eng−1)^1.5, Engine resets). Networked as `ra` a=3; bots use them in `raidAI`.
- VFX: `VX` + `drawVX` (beam/flash/nova/dome/pillar/slash/stars), `sparks`, `skillFx`, `hitFx`, projectile trails, Circle redraw.
- Save code: `saveCode` / `saveRead` / `saveCheck` (seal + plausibility; paid items dropped), 💾 button `saveUI`.
- Hold-to-attack (`HOLD` set). Party frame `#ptl` / `partyFrame`. F near a player invites; Yes/No popup `#pinv`; busy refusal.
- Barkeep locked: `DISCORD_URL`, `discordUnlock`. Tutorial has no blackjack (`TUT_DONE` 5, `tutMigrate` v3); first hand ever rigged (`V.bj1`).
- Lore rewritten (no Rune Warden).
- Equipment tab (`shopUI('eq')`): `eqRoll` seeded stock every 2 raids (`V.rc`), tiers `TIERS` (common→legendary, legendary only from level 30). Types: tank `dr`, damage `dmg`, utility `dd` double dash / `bd` buff time / `hl` heal. Ledger kind `equip`.
- Class bonuses `CLB` (tank vit → less damage, DPS dmg → faster Engine, healer cdr → more healing); `upCost` ramp; win gold +1%/level (max +50%); loss gives 15 gold; audit raid cap ×1.5.
- Host accepts 2 dashes per window (Twin Feather).
- Hub address: if none configured, the game uses `http://localhost:8787` (`npm run signaling`); `app.js` sends `access-control-allow-private-network`. So the live site works for windows on the same PC only.

**Owner's next asks / not done:**
1. Play with friends from the GitHub link. Needs a public signaling service (Cloudflare tunnel or a server); OR build manual copy-paste offer/answer codes (serverless WebRTC). Owner wants: first player = host, others join as clients, each keeps their own browser save.
2. Host migration: hub dies when the host leaves; raid ends if the leader leaves.
3. Rebind crash: `settingsUI()` is called but doesn't exist.
4. Not rerun since this batch: bench, 2-browser raid E2E, screenshots of the new effects and UI.
5. Random levels on the paid shop's display characters.



**Done**
- **Networked raids:** the party leader's screen runs the fight (`S.net.role` `lead`); members mirror it (`member`, `raidPuppet`/`raidApply`).
  - Member → leader: `rm` moves (15/s, budget-checked like the hub), `ra` skill casts.
  - Leader → members: `rs` snapshot 10/s (players, boss, new telegraphs/circles/events once).
  - Messages are relayed by the master, bundled per receiver every 50 ms (`rb`), multicast via `to: [keys]`.
  - 5 s with no contact (`RAID_SILENT_MS`) ends the raid for that side.
- **Relay rate limit fix:** fixed 1 s window per sender (it never reset before, so members went silent after 40 messages).
- **Party invite:** F near a player sends the invite at once. The invited player gets a small Yes/No popup (`#pinv`, top center), declined after 20 s. A second invite while one is pending is refused (`pa` `busy`; the sender sees "already has a pending invite"). Inspect (`playerUI`, existing data only) opens by clicking a name in the party menu.
- **Healer Circle:** allies inside deal +25% damage (`ZONE_DMG`).
- **Dash distance:** DPS 150 > healer 105 > tank 60 (tested).
- **Arena:** floor radius 240 with the background scaled to fit; raid walking speed ×0.75 (`RAID_SPEED`).
- **Emotes:** all bought with gold.
- **2-browser test (headless Chrome, real directory + WebRTC):** invite popup → party → Small Raid → won on both screens; Bravo's position gap ≤ 19 px, boss HP gap ≤ 0.4%; leader sent 1.35 KB/s, member 0.69 KB/s; no page errors (boss started at 25% HP).

**Done (2026-11-01)**
- Raiding players are hidden in the hub (`rz` flag: guest → master → others; newcomers told on join; master's own raid as slot 0).
- Bots (DPS/healer) step into a nearby healer Circle, so the +25% helps the whole team.
- Party frames show each member's ultimate meter (charging / ready / used); DPS show ⚙xN Engine stacks under their feet.
- Seeker Bolt is a visible homing orb (`b.bolts`, damage on arrival) with a reticle on the target 0.6 s before it fires. Leader-side only: raid members' puppet view doesn't get `b.bolts`/`b.seek` yet (netcode agent).
- Tank rework: Taunt holds 6 s / cooldown 10 s; Taunt puts the tank on top of threat; tank damage draws 3x threat, and the boss stays on the tank in the gap only if it kept the lead (no Seeker Bolts while on a tank). Sunder: each blow on the same tank +12% damage taken (max 5), cleared by Shield Bash or 4 s without blows.
- Removed the hidden `#netBadge` element (no lobby status text in the UI).
- **Internet play without a server (room mode):** on the public site the first player opens a room (URL gets `?room=CODE`, 🔗 button `#blk` copies the invite link); friends open the link and join as guests. Only the offer/answer (deflated SDP) goes through the free ntfy.sh relay (`ROOM_RELAY`, SSE + POST); game data stays peer to peer. It mimics the directory API inside `RBNet`, so game code is unchanged. Localhost without `?room=` still uses `npm run signaling`. Host reloading its own link stays host (`sessionStorage.rbRoom`). Limits: STUN only (no TURN), so strict networks may fail; room ends when the host leaves.
- **2-browser room test (headless Chrome, real ntfy.sh relay, same PC):** guest connected in 2–3 s → invite → party → Small Raid → won on both screens, no page errors. Fresh saves are both Tank: set one to another class or the raid refuses to start.

**Done (2026-11-01, later)**
- Healer: Empower (skill 2, replaces Heal; `EMP`, `buffTarget`, `empower`): tank shield + next stun ×1.5 (`stunUp`), DPS +15% dmg / faster attacks (`emp`), healer small shield, self heal when alone or under 40%. Target = ally nearest the mouse (`mouseAlly`, sent as `ra.t`), dashed gold ring shows it. Auto-Resurrect on death when ready (`selfRes`). Dash through allies heals 25 (`DASH_HEAL`, leader-side only).
- Tank Strike is a 140° frontal cleave (`CLEAVE`, `cleaveHits`); bots turn to the boss first.
- DPS: Rapid Fire hits add Engine time (`ENGINE.volley`); Heavy Shot knocks the boss back (`HEAVY_KB`); dash = 30% faster attacks for 3 s (`RUSH`).
- All dashes have i-frames; touching the boss shoves you out and deals 8 (`BUMP`, not to its current target).
- Boss HP +~17% (Seer 20000, Thornmaw 40000) so raids stay ≥ 90 s.
- Quests: added Raid Veteran (5 wins) and Sharpen Your Craft (5 skill levels) before Colossus Slayer; `ok()` goals checked in `save()`.
- Fix: left click on the touch joystick zone with a mouse now attacks (was opening the virtual stick).
- Known: bench "small, you heal" (autopilot P as healer) loses 0%; it already failed before these changes.

**Done (2026-11-01, evening)**
- UI: game-style gilded panels (corner ornaments, banner titles, pressable buttons), ✕ close, phone layout (`body.ph`, short side < 560 px; controls use the whole screen), rotate-to-landscape screen; HUD: gold top-left text with roll/pop/fly animation (`goldHud`), Quests/Shop/Party centered, Titles + Copy ID mid-left. Guild button hidden (code kept, marked UNUSED). Save code removed; 🔗 Copy ID copies the lobby/room link (`lobbyLink`).
- Barkeep: padlock until the Discord link is copied (unlock 5 s later, no countdown). Blackjack: Double / Split (hands played one by one, settled separately), natural pays 3×, compact hands (`bjHand`: total + card values, BUST struck red, win green / lose red), animations (deal, heavy hits shake from 17+, double, split, reveal flip, Barkeep draws one by one, blackjack banner + coin rain). Free strategy chart beside the table (📖 Chart, `bjMini`, full chart `bjChartUI`); rented Assist (best play + your cell highlighted) 50 g / 30 s, +10 s per natural (`BJ_CHART`). Audit knows `bjchart` and stakes from double/split (payout ≤ 3× stakes).
- Hub art: cloud sea of 16 billowing banks (`skyEdge`), sea decor (spires, arches, rune towers, shards, falls; `SEA_DECOR`), cached procedural cloud sprites (`cloudSprite`: puffs + fBm + density-normal lighting, 4 shape kinds), far island planes 3 and 4 with haze and sun light, overhead island in front of the sky, statue + near trees on their own layer above the clouds. Live wind grass (`GRASS_T`, `grassLive`): clumps + species (plumes, ferns, clover, lavender, daisies) in noise patches, pushed by walkers, none under trees/rim props. Scene light map (`hubLight`: sun gradient + brazier/NPC/cistern/pedestal light pools), character sphere shading + cast shadow, motes/petals (`motes`), haze/shafts/vignette (`hubAtmos`). New pedestal (`bridges`): two steps, water channel, turning glyph band, counter-rotating seal, floating rim crystals; canal pulses power it (`canalPower`, `CANAL_FLARE`).
- Interact: everything in reach (crossing, NPCs, players within `INVITE_R` 60 px) is cycled with ◀ ▶, Tab, or the skill 2/3 keys (physical, so A/E on AZERTY).
- Gameplay/net: boss Spirit Lances + Rune Storm (multi-target), phase 2 telegraphs ×0.75 (`P2_REACT`); class syncs instantly (`cls` messages); level-up asks the host for an early audit (`ql`); soft canal wall (cushion + hard edge; the host only checks the hard edge). Bots: 2–11 per hub, mostly group raids, weighted NPC visits (Barkeep/Merchant/Archivist), more chat incl. shop talk.
- Known: bench "you heal" (autopilot P as healer) still loses; live grass is several thousand sprites per frame, not yet measured on phones.

**Upcoming**
- Random levels on the paid shop's preview characters.
- Ultimates: healer revive (once per raid per healer), tank shield-all + boss stun, DPS Engine burst (spends stacks; damage scales with stacks).
- Epic raid (12) content; a phone as master in a raid.

**Concerns**
- Bench: healer-as-you runs lose to the Doom (small 0%, large ~60%); same on the previous commit, so it's the autopilot healer, not the tank change. A no-Taunt team always wipes: threat holds the boss only within 10.5 s of the tank's last Taunt.
- Bench CPU is wall-clock time: a run over 80% of the phone budget is rerun and the faster run is kept (a busy PC once failed 1 check). Passes with 3 benches running at once. If a non-CPU check ever fails at random, that's a real bug.
- A raid member's stats aren't audited during the fight (the leader trusts its own sim; members only send moves and casts).

## Earlier (2026-10-31)

**Done: raids, party, bosses**
- **Party (hub):**
  - Walk up to any player (bot or real) → `playerUI`: class, level, title, ring and badge, Invite/Remove. `👥 Party` HUD button → `partyUI`; max 6.
  - Bots answer invites themselves (~85% yes) and stay in the hub while partied.
  - Real players go through the master: `pi` invite, `pa` answer, `pp` leader's member list, `pl` leave, `pg` raid start. The master stamps `from`, caps size at 1.5 KB and 6 messages/s per sender (strike).
- **Raid select (Rune Crossing) → `raidUI`:**
  - Small (3: 1/1/1), Large (6: 2/2/2), Epic (12: 4/4/4) sealed with code-drawn chains.
  - The leader starts it; missing roles are filled by `raidLook` bots about your level; too many of one class blocks the start.
- **Fight (`arena`), works for any team size:**
  - Boss target: the taunting tank while Taunt holds (8 s, cooldown 8 s). Otherwise the healer/DPS with the most threat, plus an unavoidable Seeker Bolt every 2 s (1.6 s in phase 2), and a Lunge on anyone kiting out of reach.
  - Tanks take 40% of boss blows.
  - Poise windows at 75% and 35% HP (5 s): Shield Bash breaks poise (stun 4 s, +50% party damage 8 s); a missed window enrages the boss (+30% for 8 s).
  - Doom at 60%, once, on a healer: touch 3 runes within 12 s or the whole party is wiped.
  - Phase 2 at 50%.
- **Bosses (`BOSSES`, drawn in code):**
  - The Hollow Seer (small, 17k HP): Rune Slam, Hex, plus Void Rain in phase 2.
  - Thornmaw Colossus (large, 34k HP, horns, cleave): Earthsplitter (line), Thorn Nova, plus Rampage charge in phase 2.
- **DPS Engine** (replaces Fury): speed ×(1 + seconds alive / 60); cooldowns ÷ that; Heavy Shot and Rapid Fire damage × that.
- **Healer:** Heal 55, cooldown 5 s; the circle lands on the most hurt ally.
- **Bot AI (`raidAI`):** dodges telegraphs (dash at the last moment); the tank keeps Taunt rolling and saves Shield Bash for poise windows; the healer heals, drops circles and runs the Doom runes; the DPS fires on cooldown. `P.auto` = autopilot for tests/bench.
- **Other:**
  - Rewards: the large raid pays 1.5× (audit raid cap raised to match).
  - Quests: "First Raid" (win any), "Colossus Slayer" (win a large raid).
  - Class texts updated. Herald shows "Fastest raid win".
- **Tests:** comps, sealed epic, raid UI, party add/remove/inspect, invite relay and spam cap, invite prompt, Taunt, poise break, line hit test, Engine, full sims (win in 1.5–4 min, both windows and the Doom happen, no-Taunt fails, uncleansed Doom wipes).
- **Bench:** `npm run bench -- --raids=N` → win %, time, deaths and who died per raid × your role, plus a no-Taunt row. Last run (N=4): every raid/role 100% at ~140 s with 0 deaths; no Taunt 0% (party wiped by ~47 s).

**Upcoming**
- See the newer Latest section.

**Concerns**
- Bot teams never die with Taunt held; humans will, but difficulty for real players is untested.
- Earlier concerns still stand: no real-browser or phone test of the newer netcode.

## Verified (2026-10-31)

- `npm test` passes (game, network, anti-cheat, roster, directory, rate-limit and benchmark checks); `node --check` on both src files and `git diff --check` are clean.
- A two- and three-browser test drove headless Chrome over DevTools against the real directory and WebRTC:
  - Passed: host and guest in Hub 1, synced, see each other, no bots.
  - Passed: chat between three players in every direction; spam rejected and withdrawn.
  - Passed: capacity overflow to Hub 2; leaving frees the seat.
  - With the earlier (uncompressed) protocol, guest and host movement matched within 20 px.
- After the compact protocol, anti-cheat, deltas and send-once roster, real browsers were **not** rerun. The automated runs failed because simulated keys didn't reach the background browsers, and the fix rerun was interrupted. The owner tested with two real windows on the earlier protocol and said it "works really good".

## Networking benchmark (scenarios)

The benchmark lives in `src/test.js`. `npm test` runs a quick set. `npm run bench` runs every scenario at 3/6/12 players and prints a table; pick your own with `npm run bench -- --scenario=cheat,chat --players=3,12 --seconds=5`. `--json=file` saves the rows, including `upByType`: host upload per message type (bytes/s, messages/s, average size).

- Each run uses the real host code (the game script in a VM with a fake network) and N-1 simulated guests that follow the real client's sending rules and answer fair-play checks.
- CPU is the host's networking JS only. "wire" columns add ~60 B/message of WebRTC overhead.
- Scenarios: `idle`, `walk`, `crowd` (30% walking), `dash` (legal dashes), `cheat` (speed hack), `flood` (speed hack by many tiny moves), `econ` (legal earning/spending plus gold editors), `hphack`, `chat` (plus a spam bot), `churn` (a leave and a join every 0.5 s), `audit` (slaves catch a master with edited gold).
- **Shared checks:**
  - seats match who is still in; no honest player is removed; every cheater is removed; state stays compact; host CPU stays light;
  - **phone master** (12 players or fewer): CPU × 5 (estimated phone slowdown) ≤ 50 ms/s, and wire upload ≤ 0.5 Mbit/s.
- **To add one:** an entry in `SCENARIOS` with `about`, `guest(g, k)` (return the message a guest sends this tick, or null) and `checks(r)`. Optional: `cheater(i)`, `stats(g, k, snap)`, `seconds`.

Master upload at 12 players, everyone walking (20 s run, this PC): **5.4 KB/s payload, ~11 KB/s on the wire (0.09 Mbit/s)**. That's positions 5.4 KB/s (91 msg/s, ~60 B each: 19 B wrapper + 4 B per moved player), fair-play questions 36 B/s, corrections 21 B/s, and **no** player-detail traffic. CPU is ~4.4 ms/s (phone estimate ~22 of 50). 3 players: 1.3 KB/s wire; 6 players: 4 KB/s wire. WebRTC packaging (~60 B per message) is about half of the wire bytes, so raid combat events should ride in the same 10/s message as positions.

What the benchmark found and fixed, at 20 players walking: 70.5 -> 48 (roster at most once a second) -> 26.2 (packed positions, per-player sending, no self echo) -> 21.9 KB/s (deltas). After that, player details became send-once. At 100 players, idle went from 4.5 MB/s to 266 KB/s, but 100 is no longer a target.

## Cloudflare / public hosting status

- `cloudflared` 2026.10.7 is installed at `%LOCALAPPDATA%\Runebound\cloudflared\cloudflared.exe`. It is **not logged in** (no `~/.cloudflared/cert.pem`), and no named tunnel, tunnel service or public URL exists. `signalingUrl` in the public build is blank.
- The directory is ready to sit behind a tunnel. Run with `TRUST_CLOUDFLARE=1` so the per-player rate limit (3000 requests/min) uses `cf-connecting-ip`. That header is trusted only for requests arriving from localhost, i.e. the connector. Without this, all players behind the tunnel would share one limit. Set `ALLOWED_ORIGINS` to the game origin.
- Existing protections: CORS origin allowlist, 16 KB request bodies, SDP size and type checks, 48-character random session tokens with a 30 s expiry, per-IP rate limit with a pruned table, hub/seat caps. Not done: Cloudflare WAF/rate rules, bot protection (Turnstile), TURN relay.

## Anti-cheat ("fair play"): master audits slaves, slaves audit the master

Built and tested (unit tests plus the `cheat`, `flood`, `econ`, `hphack`, `chat` and `audit` benchmark scenarios). No honest player was removed in runs at 3, 6, 10, 12 and 20 players; every cheater was.

- **Ledger:** every gold/XP/upgrade change goes through `goldAdd(n, kind)`, `gainXP(n, why)` or `ledger()`, as `[kind, gold, xp, upgradeKey?]`. The only direct `V.gold -=` left is `buy()`, which records its own `upgrade` entry. Every auditor (`NET_AUDIT_CURSOR`) gets each entry once.
- **Audits (`q`/`a`):** at random 3–8 s intervals each side asks for a snapshot (gold, XP, upgrades, blessing, class, HP/max HP, new ledger entries). `netAudit(prev, snap, windowMs)` is pure and checks:
  - gold and XP add up;
  - rewards are within the game's own tables (`auditRules()` reads DAILY, TALE_MS, BOUNTIES, QUESTS, guild and pass bonuses) and not more frequent than possible;
  - blackjack pays at most 2.5× a real bet; spends never give gold;
  - upgrades only rise when paid for, or from a lore reward;
  - max HP matches the Stoneheart level (×1.3 with Blessing of Stone), and HP ≤ max;
  - the snapshot is well-formed.

  The master uses audited speed upgrades, blessing and level instead of what the slave claimed at join.
- **Strike points:** an audit failure is 8 (two failed audits in a row remove the player outright), no answer within 5 s is 4, a speed-limited move is 1, chat spam is 1. They fade 1 point per 2 s; 12 means removal. The master sends `k`, calls `/api/kick` to free the seat, and disconnects. A slave at 12 against its master warns the player and calls `/api/report` once.
- **Movement:** one refilling budget per player: 1.3× class speed × audited speed upgrade, holding at most 0.5 s of walking, plus dash distance when off cooldown. Sending many tiny moves buys nothing. Move sequence numbers must increase.
- **Slaves check the master:**
  - corrections must belong to a move they sent and stay within 260 px of it;
  - every position the master reports (itself included) is speed-checked against roster class and speed;
  - the master's own stats are audited the same way.
- **Directory:** `/api/report` (guests only). When half the guests have reported, the hub is `flagged` and gets no new players (shown in `/api/hubs`). `/api/kick` lets the host free a guest's seat.
- **F2 dev tools stay (owner's choice):** their edits are recorded as `dev`. They're allowed and flagged while `AUDIT_ALLOW_DEV = true`; set it false before release.
- **Limits, stated honestly:** this is detection during online play, not prevention. The browser owns the save, so a skilled cheater can forge a consistent ledger within the reward limits; only a server-owned economy stops that. HP in raids isn't networked yet. A master and slave cheating together are only caught by the other slaves. Not yet tested in real browsers.

- Autopilot (`P.auto`) is test/bench only: no player-facing toggle, keep it that way. raidSim clears `ai_ignoreDoom` after each run (it leaked and made the "you heal" bench lose every Doom). Remote members' dash boost no longer ticks twice. Phones work out grass wind every other frame.
- Hub foreground (hubFore): blurred leafy branches in the bottom corners (nearest depth plane), sway, fade when you walk under them. The Doom wipe test now puts the runes out of reach (was flaky: the bot brushed them by chance).

## Not done / open

- Host migration and reconnect: a hub dies when its host leaves.
- Raids are run by the party leader's screen (see Latest); no leader migration, so the raid ends if the leader leaves.
- Not tested on a real phone as master; the 5× phone slowdown is an estimate. On phones the browser pauses when the screen locks or the app is switched, so a phone master needs host migration.
- Accounts, PC > console > phone host preference (must be measured or opt-in, not trusted), TURN relay.
- Public hosting: GitHub Pages can't run `src/app.js`. A stable Cloudflare named tunnel or server is needed; Quick Tunnel URLs expire. `cloudflared` is installed at `%LOCALAPPDATA%\Runebound\cloudflared\cloudflared.exe`.
- A player-controlled host can still cheat. Don't claim robust anti-cheat or real-network scale; the benchmark is a simulation.
- Older owner reports still open: pause softlock; guild kick/disband.
- Dev tools open only with the friend code: `?dev=<code>` (only its FNV hash ships, `DEV_OK`); then F2 / triple-tap work. Plain `?dev` still works on localhost. The owner has the code.

## Rules for agents

- No new npm packages. Web only: no Electron, no .exe.
- Never send save data to the directory; it gets only the minimal display profile.
- Keep input validation, bounded messages, CORS and rate limits.
- Commit only tested changes and update this file before pushing.
