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

## <u>Cloudflare full protection: switch ALL of these on</u>

In the Cloudflare dashboard, open your domain and tick each one:

1. **SSL/TLS → Overview:** set **Full (strict)**.
2. **SSL/TLS → Edge Certificates:** turn on **Always Use HTTPS**, **HSTS** and **Minimum TLS 1.2**.
3. **Security → WAF → Managed rules:** turn on the **Cloudflare Managed Ruleset** and the **OWASP Core Ruleset**.
4. **Security → WAF → Rate limiting rules:** create a rule. If the URI path starts with `/api/` and one IP sends more than **300 requests per minute**, **Block** it for 10 minutes.
5. **Security → WAF → Custom rules:** **Block** any `/api/` request whose method is not GET, POST or OPTIONS.
6. **Security → Bots:** turn on **Bot Fight Mode**.
7. **Security → DDoS:** leave the HTTP DDoS rules on **High**.
8. **Security → Settings:** set Security Level to **Medium** (switch to **I'm Under Attack** during an attack).
9. **Zero Trust → Access:** protect `hub.yourdomain.com/api/brain/admin` so only your email can reach it.
10. **Turnstile:** create a widget for your domain and keep the site key. Next step: the game will check it when a player joins.

## Update the VPS later

```
ssh root@YOUR-VPS-IP
cd /opt/runebound && git pull && systemctl restart runebound-hub
```

## Is it working?

Open `https://hub.yourdomain.com/health`. It should say `"ok":true`.
