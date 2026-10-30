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
