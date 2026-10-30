![Runebound](assets/banner.png)

**Play in your browser:** https://aurakingstudio.github.io/Runebound/

# Runebound (solo prototype)

- **Quickest:** double-click `index.html` (works offline, everything is embedded).
- **Windows .exe:** double-click `build-exe.bat` (needs Node.js). The .exe appears in `dist/`.
- **Desktop app / .exe (manual):** install Node.js, then in this folder run `npm install` and `npm start`.
  For a Windows portable .exe run `npm run dist` (build it on Windows; the file appears in `dist/`).
- Progress (gold, upgrades, quests) is saved in the browser/app storage.
- Press **Esc** or **P** (or use Pause) to pause. The optional, compact AdSense slot appears only in this menu.
- For web release, edit `ads-config.js` with the approved AdSense publisher and pause-slot IDs, set `enabled: true`, and deploy over HTTPS. Finish AdSense site approval and consent-message setup first. Ads are intentionally disabled in the offline file and Electron app.
- Upload `Runebound-itchio.zip` to itch.io as an HTML5 game. Its files are at the ZIP root.
