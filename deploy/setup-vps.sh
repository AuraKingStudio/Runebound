#!/usr/bin/env bash
# Runebound ONLINE hub on a VPS (Ubuntu/Debian), protected by Cloudflare.
# The hub listens only on 127.0.0.1; a Cloudflare Tunnel carries players' requests to it, so the VPS opens no game port
# and floods are filtered by Cloudflare before they reach it. The firewall allows SSH only.
# Usage (as root, in the cloned repo):  bash deploy/setup-vps.sh hub.example.com
set -euo pipefail
HOST="${1:?Give your hub address, e.g. bash deploy/setup-vps.sh hub.example.com}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "== Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== cloudflared"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb
fi

echo "== service user"
id runebound >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin runebound
chown -R runebound "$DIR"

echo "== hub service"
sed "s#__DIR__#$DIR#g" "$DIR/deploy/runebound-hub.service" > /etc/systemd/system/runebound-hub.service
systemctl daemon-reload
systemctl enable --now runebound-hub

echo "== firewall: SSH only (players come through the tunnel)"
apt-get install -y ufw >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

echo "== Cloudflare tunnel"
if [ ! -f /root/.cloudflared/cert.pem ]; then
  echo "A browser link will appear: open it, log in to Cloudflare, pick your domain."
  cloudflared tunnel login
fi
cloudflared tunnel list | grep -q ' runebound ' || cloudflared tunnel create runebound
TID="$(cloudflared tunnel list | awk '$2=="runebound"{print $1}')"
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TID
credentials-file: /root/.cloudflared/$TID.json
ingress:
  - hostname: $HOST
    service: http://127.0.0.1:8787
  - service: http_status:404
EOF
cloudflared tunnel route dns runebound "$HOST" || true
cloudflared service install 2>/dev/null || true
systemctl enable --now cloudflared
systemctl restart cloudflared

sleep 3
echo "== check"
curl -fsS "https://$HOST/health" && echo && echo "DONE. Put https://$HOST into onlineHubUrl in index.html."
