# Play Runebound online with Cloudflare (super simple)

Your PC runs the "hub phone book" (it tells players who to connect to).
Cloudflare gives it a public web address so friends anywhere can reach it.
The game itself still runs from the public page.

## One-time setup

1. Open **PowerShell**.
2. Check that Cloudflare's tool works:
   ```
   cloudflared --version
   ```
   If it says "not recognized", install it:
   ```
   winget install --id Cloudflare.cloudflared
   ```
   Then **close and reopen** PowerShell.

## Every time you want to play online

You need **2 PowerShell windows**. Both start in the game folder:
```
cd C:\Users\Kiels\Documents\Runebound
```

**Window 1: start the hub phone book**
```
npm run online
```
Wait for: `Runebound signaling directory listening on 8787`. Leave it open.

**Window 2: open the Cloudflare tunnel**
```
npm run tunnel
```
Wait a few seconds. Find a line with an address like:
```
https://some-random-words.trycloudflare.com
```
Copy that address. Leave this window open too.

**Make the game link.** Put your address after `?hub=`:
```
https://aurakingstudio.github.io/Runebound/?hub=https://some-random-words.trycloudflare.com
```
Open it yourself, then send the same link to your friends. Everyone who opens it joins the same hubs.

## Good to know

- **Closing either window** stops online play: new players can't join until you start both again.
- **The address changes** each time you run `npm run tunnel`, so send the new link each session.
- **Your PC must stay on and awake** while people play.
- **Some strict networks** (school or work Wi-Fi) may still fail to connect. That needs a TURN server, which isn't set up yet.
- **Stop:** click each window and press `Ctrl + C`.
