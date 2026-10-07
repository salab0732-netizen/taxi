#!/usr/bin/env bash
# نسخة فورية من قاعدة البيانات (لتنزيلها إلى حاسوبك)
set -e
OUT="/opt/taxi/backups/manual_$(date +%F_%H%M).db"
sudo -u taxi sqlite3 /opt/taxi/backend/registrations.db ".backup '$OUT'"
echo "النسخة: $OUT"
