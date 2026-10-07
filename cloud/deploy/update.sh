#!/usr/bin/env bash
# تحديث الشيفرة لاحقاً (بعد رفع حزمة جديدة) — قاعدة البيانات الحيّة لا تُمسّ
set -euo pipefail
APP=/opt/taxi
PKG="$(cd "$(dirname "$0")/.." && pwd)"
sudo cp -a "$APP/backend/registrations.db" "$APP/backups/before_update_$(date +%F_%H%M).db"
sudo find "$PKG/backend" -maxdepth 1 -mindepth 1 ! -name registrations.db ! -name config.local.json -exec cp -a {} "$APP/backend/" \;
sudo rm -rf "$APP/frontend" && sudo mkdir -p "$APP/frontend" && sudo cp -a "$PKG/frontend/." "$APP/frontend/"
sudo chown -R taxi:taxi "$APP"
sudo -u taxi "$APP/venv/bin/pip" install -q -r "$APP/backend/requirements-cloud.txt"
sudo systemctl restart taxi
echo "✅ تم التحديث"
