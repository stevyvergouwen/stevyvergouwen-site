#!/bin/bash
# Zet de Dropbox-koppeling voor de leverings- en uploadpagina's op (twee apps, elk met eigen geheimen).
# Gebruik:  ./zet-dropbox-op.sh lezen     (leveringspagina's: alleen lezen)
#           ./zet-dropbox-op.sh schrijven (uploadpagina: schrijven)
# Alle waarden typ of plak je hier zelf; ze gaan rechtstreeks naar Cloudflare en staan nergens in een bestand.
set -e
cd "$(dirname "$0")"
case "$1" in
  lezen)     PRE=DBX;  SCOPES="files.metadata.read files.content.read";;
  schrijven) PRE=DBXW; SCOPES="files.content.write";;
  *) echo "Gebruik: $0 lezen|schrijven"; exit 1;;
esac
cat <<TXT

1. Dropbox App Console (https://www.dropbox.com/developers/apps/create):
   Scoped access  >  Full Dropbox  >  naam bijvoorbeeld "SV $1".
2. Tab Permissions: vink aan: $SCOPES  >  Submit.
3. Tab Settings: kopieer de App key en App secret.
TXT
read -r -p "App key: " KEY
read -r -s -p "App secret (blijft onzichtbaar, plak met Cmd+V en druk Return): " SECRET; echo
KEY=$(printf '%s' "$KEY" | tr -d '[:space:]'); SECRET=$(printf '%s' "$SECRET" | tr -d '[:space:]')
echo "   ontvangen: key = ${#KEY} tekens, secret = ${#SECRET} tekens (een Dropbox-geheim heeft er meestal 15)"
[ "${#SECRET}" -ge 10 ] || { echo "Het geheim is leeg of te kort. Klik in Dropbox op App-geheim tonen, kopieer het en probeer opnieuw."; exit 1; }
URL="https://www.dropbox.com/oauth2/authorize?client_id=$KEY&token_access_type=offline&response_type=code"
echo; echo "4. Open deze link, kies Toestaan en kopieer de code:"; echo "   $URL"; open "$URL" 2>/dev/null || true
read -r -p "Code: " CODE
RESP=$(curl -s -u "$KEY:$SECRET" -d "code=$CODE" -d grant_type=authorization_code https://api.dropbox.com/oauth2/token)
REFRESH=$(printf '%s' "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("refresh_token",""))')
[ -n "$REFRESH" ] || { echo "Geen refresh token gekregen. Antwoord van Dropbox: $RESP" | cut -c1-200; exit 1; }
printf '%s' "$KEY"     | npx --yes wrangler@latest secret put "${PRE}_APP_KEY"
printf '%s' "$SECRET"  | npx --yes wrangler@latest secret put "${PRE}_APP_SECRET"
printf '%s' "$REFRESH" | npx --yes wrangler@latest secret put "${PRE}_REFRESH"
echo; echo "Klaar: ${PRE}_APP_KEY, ${PRE}_APP_SECRET en ${PRE}_REFRESH staan in de Worker."
