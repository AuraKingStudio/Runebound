# Runebound – recap for Copilot

**Project:** Runebound, a solo Electron/browser action prototype. Everything lives in `index.html` (one file: CSS, base64 art, game logic). `main.js` is the Electron wrapper. Tests: `npm test` (headless, plain Node).

**Already done (previous PR):** NaN max-HP fix from partial saves, save-data clamping, dev font-size clamp, Electron hardening (contextIsolation, sandbox, no nodeIntegration), 9 new save tests.

**This pass:**
- Art direction: UI switched to the dark arcane palette (bg #0b0f14, teal rune accent #3fd6c6 / #1d7f78) to match the hub and arena art. Light theme kept behind `data-theme=light`.
- Rune glow on headings, soft gradient overlays, panel fade/pop entrance, button hover/press feedback, all disabled under `prefers-reduced-motion`.
- Sharper art: high-quality image smoothing and HiDPI canvas (capped at 2x).
- All 31 tests pass. Committed on `fix/save-migration-and-hardening`.

**Open items:**
- Dev tools (F2, `?dev`, triple-tap) ship in the normal build. Gate them behind a build flag before public release.
- Movement is still raw input with no easing; consider acceleration/deceleration and hit-flash feedback next.
- Boss sprite is drawn procedurally over the arena image; a matching sprite would unify the art further.

**Please:** keep the single-file structure and the test harness working (tests parse the `<script>` block of `index.html`), and do not add browser-storage calls inside the artifact preview.


Recap
Game changes: blackjack NPC changed to a card emblem; Class Master got class icons and a ring; your player nameplate was highlighted; bot nameplates were distinguished from real players. The blackjack tutorial hand was also fixed.
Cleanup: six unused assets were deleted in the worktree. Those deletions were not included in the networking commits.
Networking pilot: automatic first-available hub assignment, up to 10 hubs × 10 players, browser WebRTC movement/chat, hub status, and a dependency-free Node signaling directory were added. Local save data is not sent. Raid networking, robust anti-cheat, reconnect, and host migration are not implemented.
Two-profile test: the directory did assign browser sessions to Hub 1 as host and guest, but movement wasn’t reliably verified—the guest sometimes stayed at “connecting” and you reported it couldn’t move. The Quick Tunnel then stopped, which is why the two windows later showed separate bot lobbies.
Cloudflare: the verified cloudflared executable remains installed on this PC. I stopped both the Node service and temporary tunnel as requested. Quick Tunnel URLs are temporary and not suitable as a lasting public host.
Latest push: commit 49a26bd was pushed to main. I blanked the now-dead tunnel URL so the game won’t try to connect to it. Tests passed before the push. I did not verify that this latest commit finished deploying to Pages.
Browser networking is already consolidated in index.html. The Node directory must remain separate because GitHub Pages cannot run Node. main.js and tests also serve separate Electron/Node roles.
The active networking implementation spans five surviving files: index.html, signaling-server.js, test/dev.test.js, README.md, and package.json. The earlier standalone browser transport and config files were folded into index.html and removed.

Handoff prompt for another agent
Continue Runebound multiplayer networking in C:\Users\Kiels\Documents\Runebound.

Current state:
- Latest pushed commit is 49a26bd on main.
- Browser game, config, WebRTC transport, and gameplay networking are all in index.html. Keep browser-side networking in this one file.
- signaling-server.js is a separate, dependency-free Node service; do not merge it into browser code.
- No npm package additions.
- The signaling URL is intentionally blank. The local Node service and temporary Cloudflare Quick Tunnel are stopped. cloudflared 2026.10.7 is installed at %LOCALAPPDATA%\Runebound\cloudflared\cloudflared.exe.
- A previous two-page test assigned host and guest roles in Hub 1, but did not reliably verify movement. The guest sometimes remained at CONNECTING and the user reported it could not move. The temporary Quick Tunnel expired, causing separate bot-only lobbies.
- User wants first available hub, 10 hubs × 10 players, no create/join button, automatic join, and a clear hub number/assignment reason. A later dedicated-server path should remain possible.
- User specifically wants the local player to be the first host when hubs are empty, and players 2–10 to join that host; player 11 should open Hub 2.
- PC > console > phone host preference is a desired future feature. Device detection is not trustworthy; design it as a measured/opt-in capability rather than a security guarantee.

Next tasks:
1. Inspect current source and worktree before editing; preserve unrelated asset deletions.
2. Diagnose and fix the guest movement/connection-state bug end-to-end. Trace key/touch input → P.dx/P.dy → netStep input send → host netReceive validation/simulation → hub-state snapshots → guest correction/rendering. Make the HUD accurately distinguish directory assignment, peer connection, and gameplay synchronization.
3. Start the local service and use a stable Cloudflare Named Tunnel if the user has configured/authenticated Cloudflare; otherwise explain that Quick Tunnel URLs expire and must not be left in the public build. Never claim the PC is publicly hosting when its service/tunnel is down.
4. Test with two isolated browser contexts (regular and incognito), distinct player identities: verify one host + one guest in Hub 1, data-channel connection, both players visible, and guest movement visibly updates on host and guest. Then test leaving and hub capacity/next-hub assignment. Record failures honestly.
5. Implement host migration/reconnect only after the current movement flow is reliable. Current server stores leases in memory and removes a hub when its host leaves; migration is not implemented. Define deterministic succession, re-signaling, state transfer and tests. Host peers are untrusted; client-side checks are not strong anti-cheat.
6. Do not send local save/profile secrets; directory should receive only the minimal display profile. Preserve input validation, bounded messages, CORS and rate limits. Do not claim robust anti-cheat, account identity, or 100-player scale.
7. Update README, run node --check signaling-server.js, node --check test/dev.test.js, node test/dev.test.js, git diff --check. Commit/push only tested changes and include the required Copilot co-author trailer.

Prior observations/limitations:
- GitHub Pages is static only and cannot run signaling-server.js.
- Quick Tunnel and the local service stopped after the last test. Current checked-in signalingUrl is blank.
- Movement and raids are not production-ready; raid synchronization is disabled.
- Previous local rendering FPS numbers were not network/load tests. No 100-player benchmark exists.
- User also previously reported a pause softlock and asked about guild kick/disband; those were not resolved in the networking work.