# Runebound — AI agent settings

## How to work

- **First action on every new task:** read the project code and map its structure, responsibilities, and important flows before editing or proposing changes. Inventory all source, tests, configuration, and assets; read large files in bounded sections. Keep the map concise and internal unless asked to share it.
- Then read `README.md` → **Current handoff**, check `git status`, and inspect the task-specific code/tests. Do not overwrite or revert other work.
- We are a team of AI agents and are evaluated against each other for maximum efficiency. Optimize for correct, complete results with minimal time, tokens, and unnecessary tool calls; efficiency never means skipping essential inspection or tests.
- Be concise. Report only changes, test results, blockers, and next steps.
- Implement the requested scope; do not turn old TODOs into authorization. Ask only when a consequential choice is unclear.
- Follow existing patterns. No new packages, generated art files, secrets, or unrelated cleanup. Browser code stays in `index.html`; service code stays in `src/`.
- Add/update tests for behavior changes. Run `npm test`; run `npm run bench` for gameplay/network/performance changes; finish with `git diff --check`.
- Work autonomously: decide and act without asking the owner; commit locally when work is tested. Push only when asked. Never say a test passed unless it ran and passed.

## Project

Runebound is a browser co-op action game: floating hub, quests/NPCs, parties, and raids. Public page: https://aurakingstudio.github.io/Runebound/

| File | Purpose |
|---|---|
| `index.html` | Game, UI, art, saves, WebRTC and browser networking |
| `src/app.js` | Signaling directory, feedback and opt-in market routes |
| `src/market.js` | Market escrow implementation; not enabled for release |
| `src/test.js` | Headless tests and performance/network benchmarks |
| `src/playtest.js` | Local game + signaling runner |
| `README.md` | Player/project documentation and the latest agent handoff |

## Game settings and constraints

- **Modes/group sizes:** small raid 3, large raid 6, Epic raid/hub max 12 (`HUB_MAX` in `index.html`; server capacity in `src/app.js`). Directory supports 10 hubs.
- **Network:** localhost uses the directory on port 8787; public build defaults to peer-hosted `?room=` using ntfy for WebRTC setup; `?hub=https://….trycloudflare.com` uses the owner's PC via `npm run online` + `npm run tunnel` (see `HOSTING.md`). STUN is configured; TURN is not.
- **Host migration:** hub and arena must never close on host loss. The host ranks successors (`hq`/`hr`, `netScore`); guests run `netMigrate` and the top successor reopens the room. Raids hand over via `raidFailover`. Keep the switch seamless: no join/leave spam, no rewards granted or lost.
- **Economy:** market is closed in the UI and disabled by default on the server. Keep disabled until item ownership and wallets are authoritative server-side. Market Day must not block quest progression while closed.
- **Player options:** Settings include volume, shake, effects, Low spec, damage numbers, FPS display/cap (30/60/144/Max), dash aim, and key bindings. Preserve keyboard, controller, touch, portrait/landscape behavior.
- **Targets:** 60 FPS on low-end hardware; validate UI/performance on desktop, tablet, and phone. Avoid per-frame allocations/heavy effects; honor Low spec and reduced motion.
- **Art:** code-drawn canvas/SVG only; `assets/icon.png` is the only permitted image asset.
- **Security target: bank-grade.** Assume every client, save and player host is hostile. Cloudflare (tunnel, WAF, rate limits) stops floods, not cheating. Anything valuable must be decided by a server, not a browser.
- **Anti-cheat by mode:** *Local:* single player, saves are the player's own; never share them online. *LAN:* the host audits guests and guests audit the host (`netAudit`, strikes, reports). *Online (VPS):* the server is the authority. Move wallets, items, XP, raid rewards and market trades onto the VPS with signed sessions, and validate every claim there. Until that ships, online progress is not trusted and the market stays closed.

## Notes, logs, handoff

- There is no separate changelog. Keep `README.md` **Current handoff** current: replace the old entry, do not append a diary. Record goal, changes, decisions, exact checks/results, untested areas, risks, and next action.
- Keep this file as stable AI/project guidance; do not copy long implementation history here.
- `feedback.log` is runtime playtest feedback and git-ignored—not a patch-note file. Do not add player data or secrets to docs/logs.
- In the final response, summarize the shipped changes and validation briefly. Separate local/simulated checks from real hosted/device/browser testing.

## TODO — release blockers, ordered

1. **Cross-network multiplayer:** test public `?room=` end-to-end from genuinely separate networks/devices; test invite, signaling, ICE, hub and raid chat, boss pings, disconnect/rejoin. Current local two-page testing is not cross-network validation.
2. **Hosted multiplayer:** stand up a stable HTTPS signaling service; configure allowed origins, rate limits, and TURN for restrictive networks; verify host-loss behavior. Never commit tunnel/TURN credentials.
3. **Device/browser matrix:** test current build on physical phone/tablet and separate Chrome, Firefox, Safari, and Edge; measure low-end frame time and touch controls.
4. **Save support:** consider player-facing save export/import and a deliberate progress-reset flow.
5. **Economy:** keep market disabled until server-owned wallets/items and purchase validation exist.
6. **Epic raid:** validate Echo Archon in a real browser against a hosted service.
7. **Hub music:** create an original AI-assisted hub theme using Incarnam only as a broad mood reference; do not remix or copy its protected track, and confirm usage rights.
8. **Update recap:** consider a small on-load dev/update recap with a sound effect; confirm display frequency and mute behavior before implementing.

## Before handoff

Update README **Current handoff** and list completed and remaining work. Include test commands/results and explicitly state anything not tested. Preserve unrelated work and leave the worktree state clear.
