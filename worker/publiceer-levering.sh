#!/bin/bash
# Zet de Worker live en publiceert alleen de leverings- en uploadpagina's. Andere wijzigingen in deze map blijven ongemoeid.
set -e
cd "$(dirname "$0")/.."
echo "== Worker uitrollen"; (cd worker && npx --yes wrangler@latest deploy)
echo "== Site: alleen d/, u/, robots.txt en de worker-bestanden"
git add d u robots.txt worker/delivery.js worker/upload.js worker/index.js worker/README.md worker/zet-dropbox-op.sh worker/publiceer-levering.sh
git status --short | grep '^[AM]' || true
git commit -m "Delivery and upload pages: personal email-code access, albums, selection, feedback, chunked uploads" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
echo "Klaar. GitHub Pages heeft ongeveer een minuut nodig. Test: https://stevyvergouwen.com/d/?demo=1"
