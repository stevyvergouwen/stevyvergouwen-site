# Request form: the Worker

Mails requests from /event, /brand and /artist to info@stevyvergouwen.com. No API keys.

1. Cloudflare > stevyvergouwen.com > Email > Email Routing: enable it, and add + verify the destination address info@stevyvergouwen.com.
2. Workers & Pages > Create > Worker. Paste `index.js`. Deploy.
3. Worker > Settings > Bindings > Add > Send Email. Variable name `MAIL`. Destination: info@stevyvergouwen.com.
4. Copy the Worker's address (https://aanvraag-stevyvergouwen.<account>.workers.dev) into `ENDPOINT` at the top of `aanvraag.js`.

## Delivery pages (`/d/?c=<code>`, Worker `/delivery/...`)

A private page per job with the finished files straight from Dropbox: photo album, video player, downloads, favourites, feedback and approval.
No accounts: a visitor leaves an email (or enters a code) and gets a personal link by mail, valid 30 days. Emails on the allow list (a full address or a domain such as `@client.nl`) get it at once; any other address is approved by Stevy with one link in his mail.

One-time setup (Stevy does these, they involve secrets):
1. Dropbox App Console: create an app, scoped access, permissions `files.metadata.read` and `files.content.read` only. Do the OAuth flow once with `token_access_type=offline` to get a refresh token.
2. In `worker/`: `npx wrangler secret put DBX_APP_KEY`, `DBX_APP_SECRET`, `DBX_REFRESH`. (`PRICE_CODE`, `IG` KV and Brevo are already there.)
3. Deploy the Worker (`npx wrangler@latest deploy`), then publish the `d/` folder with the site.

Register a delivery (the Projecten app does this): `POST /delivery-register` with header `x-key: <PRICE_CODE>` and JSON `{slug (10-40 chars a-z0-9), path ("/01_MEDIA/01_EVENTS/..."), title, client, date, note, mode ("email"|"code"|"open"), pass, allow: ["@client.nl"], exp (ms)}`.
Preview locally with sample photos: `python3 serve.py`, then open `/d/?demo=1` (gate: `/d/?c=abcdefghij&demogate=1`).

## Upload pages (`/u/?c=<code>`, Worker `/upload/...`)

For people who shot for Stevy: upload a whole folder (camera angles as subfolders, recordings) straight into his Dropbox, with a stable chunked uploader that shows speed and time left, resumes after a dropped connection or a reload, and keeps the screen awake. Files land in `<job folder>/UPLOADS/<uploader name>/<same folder structure>`; Stevy gets a mail with the summary when it is complete.

Uses a SECOND Dropbox app with write access, kept apart from the read-only one: scope `files.content.write`, offline refresh token, then `npx wrangler secret put DBXW_APP_KEY`, `DBXW_APP_SECRET`, `DBXW_REFRESH`.
Register one: `POST /upload-register` with header `x-key: <PRICE_CODE>` and `{slug, path ("/01_MEDIA/01_EVENTS/..."), title, pass (access code), exp (ms, optional)}`. The link is `https://stevyvergouwen.com/d`-style: `https://stevyvergouwen.com/u/?c=<slug>`.
Preview: `python3 serve.py`, open `/u/?demo=1&t=Some%20Shoot`, then add fake files with the console (see `window.__test`).
