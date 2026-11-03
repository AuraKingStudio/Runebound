# Hosting Runebound: local, LAN, online

| Mode | Who can join | Start it |
|---|---|---|
| **Local** | only this PC | `npm run local` + `npm run dev`, open `http://localhost:8080` |
| **LAN** | same Wi-Fi | `npm run playtest`: it prints the link for other PCs |
| **Online** | anyone, anywhere | your VPS behind Cloudflare (below) |

## Online on your VPS (one-time, about 10 minutes)

You need: the VPS (Ubuntu), a domain on Cloudflare (orange cloud), SSH access.

1. **Log in to the VPS:**
   ```
   ssh root@YOUR-VPS-IP
   ```
2. **Get the game code:**
   ```
   git clone https://github.com/aurakingstudio/Runebound.git /opt/runebound
   cd /opt/runebound
   ```
3. **Run the setup.** Pick a hub address on your domain:
   ```
   bash deploy/setup-vps.sh hub.yourdomain.com
   ```
   - A Cloudflare link appears: open it, log in, click your domain.
   - When it prints **DONE**, it works. The VPS restarts it by itself after crashes or reboots.
4. **Point the game at it.** In `index.html`, find `onlineHubUrl: ""` and set:
   ```
   onlineHubUrl: "https://hub.yourdomain.com",
   ```
   Commit and push. The public page now uses your VPS.

## The shield (DDoS)

- **Hidden VPS:** the game port is never opened on the VPS. Everything passes through Cloudflare's tunnel, so attackers can't reach the server directly.
- **Firewall:** it allows SSH only.
- **Server limits:** 600 requests per minute per player, a server-wide cap per second, a cap on sessions, and slow connections are dropped.
- **Extra (Cloudflare dashboard):** Security → WAF → Rate limiting rule: path starts with `/api/`, 300 requests per minute per IP → Block. Also turn on **Bot Fight Mode**.

## Update the VPS later

```
ssh root@YOUR-VPS-IP
cd /opt/runebound && git pull && systemctl restart runebound-hub
```

## Is it working?

Open `https://hub.yourdomain.com/health`. It should say `"ok":true`.
