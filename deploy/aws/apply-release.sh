#!/bin/bash
set -euo pipefail
# Arguments contain public infrastructure identifiers only. Credentials are read
# through the instance role, never passed in SSM commands or release archives.
REGION="$1"
BUCKET="$2"
RELEASE="$3"
API_HOST="$4"
[[ "$REGION" == 'ap-southeast-2' ]]
[[ "$RELEASE" =~ ^[a-zA-Z0-9_-]+$ ]]
[[ "$API_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]
for attempt in {1..120}; do
  if test -f /var/lib/axis/bootstrap-ready; then break; fi
  sleep 5
done
test -f /var/lib/axis/bootstrap-ready
DEST="/srv/axis/releases/$RELEASE"
if [ "$(readlink -f /srv/axis/current 2>/dev/null || true)" = "$DEST" ]; then
  echo "Refusing to rebuild the active release; create a new release instead." >&2
  exit 1
fi
if [ ! -d "$DEST" ]; then
  install -d -o axis -g axis "$DEST"
  aws s3 cp "s3://$BUCKET/releases/$RELEASE.tar.gz" /var/lib/axis/release.tar.gz --region "$REGION" --only-show-errors
  tar -xzf /var/lib/axis/release.tar.gz -C "$DEST" --no-same-owner
  rm /var/lib/axis/release.tar.gz
fi
if [ -L "$DEST/.axis" ]; then
  test "$(readlink "$DEST/.axis")" = /var/lib/axis/state
  unlink "$DEST/.axis"
fi
chown -R axis:axis "$DEST"
cd "$DEST"
if [ ! -f node_modules/.package-lock.json ]; then runuser -u axis -- npm ci --no-audit --no-fund; fi
# Next 16 persists its build graph. An inactive failed release can retain paths
# from an earlier filesystem layout; rebuild only its disposable output.
if [ -d "$DEST/.next" ]; then
  test ! -L "$DEST/.next"
  test "$(realpath "$DEST/.next")" = "$DEST/.next"
  rm -rf -- "$DEST/.next"
fi
runuser -u axis -- env NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536 npm run build
ln -s /var/lib/axis/state "$DEST/.axis"
umask 077
aws ssm get-parameter --region "$REGION" --name /axis/production/api-env --with-decryption --query Parameter.Value --output text > /etc/axis/api.env
aws ssm get-parameter --region "$REGION" --name /axis/production/worker-env --with-decryption --query Parameter.Value --output text > /etc/axis/worker.env
chmod 600 /etc/axis/*.env
cat > /etc/systemd/system/axis-api.service <<'UNIT'
[Unit]
Description=AXIS persistent API
After=network-online.target
Wants=network-online.target
[Service]
User=axis
Group=axis
WorkingDirectory=/srv/axis/current
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
EnvironmentFile=/etc/axis/api.env
ExecStart=/usr/bin/node-22 node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001
Restart=always
RestartSec=5
TimeoutStopSec=60
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
IPAddressDeny=169.254.169.254
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/axis-worker.service <<'UNIT'
[Unit]
Description=AXIS ingestion worker
After=network-online.target axis-api.service
Wants=network-online.target
[Service]
User=axis
Group=axis
WorkingDirectory=/srv/axis/current
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
EnvironmentFile=/etc/axis/api.env
EnvironmentFile=/etc/axis/worker.env
ExecStart=/usr/bin/node-22 --import tsx scripts/axis-worker.ts
Restart=always
RestartSec=10
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
cat > /etc/caddy/Caddyfile <<CONFIG
$API_HOST {
  encode zstd gzip
  header -Server
  @api path /api/axis/* /api/health
  handle @api {
    request_body {
      max_size 1MB
    }
    reverse_proxy 127.0.0.1:3001
  }
  handle {
    respond "AXIS API" 404
  }
}
CONFIG
chown caddy:caddy /etc/caddy/Caddyfile
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl stop axis-worker.service 2>/dev/null || true
systemctl stop axis-api.service 2>/dev/null || true
ln -sfn "$DEST" /srv/axis/current
systemctl daemon-reload
systemctl enable axis-api.service caddy.service
systemctl restart axis-api.service caddy.service
# Worker activation is a separate handoff, after local writers are stopped and
# the final queue/checkpoint state has been transferred.
echo "API release installed; worker awaits single-writer handoff."
