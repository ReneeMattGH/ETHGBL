#!/bin/bash
set -euo pipefail
REGION="$1"
BUCKET="$2"
KEY="$3"
SHA="$4"
[[ "$REGION" == ap-southeast-2 ]]
[[ "$KEY" =~ ^state/[a-zA-Z0-9._-]+\.tar\.gz$ ]]
[[ "$SHA" =~ ^[a-f0-9]{64}$ ]]
test ! -f /var/lib/axis/state/jobs.json
systemctl stop axis-worker.service 2>/dev/null || true
systemctl stop axis-api.service
trap 'systemctl start axis-api.service' EXIT
aws s3 cp "s3://$BUCKET/$KEY" /var/lib/axis/state-transfer.tar.gz --region "$REGION" --only-show-errors
printf '%s  %s\n' "$SHA" /var/lib/axis/state-transfer.tar.gz | sha256sum --check --status
tar -xzf /var/lib/axis/state-transfer.tar.gz -C /var/lib/axis/state --no-same-owner
rm /var/lib/axis/state-transfer.tar.gz
chown -R axis:axis /var/lib/axis/state
find /var/lib/axis/state -type d -exec chmod 700 {} +
find /var/lib/axis/state -type f -exec chmod 600 {} +
cat > /etc/systemd/system/axis-bulk-import.service <<'UNIT'
[Unit]
Description=AXIS resumable Polygon bulk import
After=network-online.target axis-api.service
Wants=network-online.target
[Service]
User=axis
Group=axis
WorkingDirectory=/srv/axis/current
Environment=NODE_ENV=production
EnvironmentFile=/etc/axis/api.env
EnvironmentFile=/etc/axis/worker.env
ExecStart=/usr/bin/node-22 --import tsx scripts/axis-bulk-job.ts --run polygon-bulk-1000-v1 --max-spend 1
Restart=no
Nice=10
CPUWeight=25
KillSignal=SIGTERM
TimeoutStopSec=300
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
IPAddressDeny=169.254.169.254
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl start axis-api.service
systemctl enable --now axis-worker.service axis-bulk-import.service
echo "State checksum verified; hosted ingestion and bulk import started in Sydney."
