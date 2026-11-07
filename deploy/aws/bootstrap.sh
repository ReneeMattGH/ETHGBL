#!/bin/bash
set -euo pipefail
dnf install -y nodejs22 nodejs22-npm tar gzip
alternatives --set node /usr/bin/node-22
id axis >/dev/null 2>&1 || useradd --system --home-dir /var/lib/axis --create-home --shell /sbin/nologin axis
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
install -d -o axis -g axis /srv/axis/releases /var/lib/axis/state
install -d -m 700 /etc/axis
install -d -o caddy -g caddy /etc/caddy /var/lib/caddy
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
curl --fail --silent --show-error --location --retry 3 'https://caddyserver.com/api/download?os=linux&arch=amd64' --output /usr/local/bin/caddy
chmod 755 /usr/local/bin/caddy
cat > /etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=AXIS HTTPS reverse proxy
After=network-online.target
Wants=network-online.target
[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
Restart=on-failure
TimeoutStopSec=10
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/axis.conf
systemctl restart systemd-journald
systemctl enable --now amazon-ssm-agent
touch /var/lib/axis/bootstrap-ready
