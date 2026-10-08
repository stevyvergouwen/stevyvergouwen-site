# Request form: the Worker

Mails requests from /event, /brand and /artist to info@shotbystevy.com. No API keys.

1. Cloudflare > stevyvergouwen.com > Email > Email Routing: enable it, and add + verify the destination address info@shotbystevy.com.
2. Workers & Pages > Create > Worker. Paste `index.js`. Deploy.
3. Worker > Settings > Bindings > Add > Send Email. Variable name `MAIL`. Destination: info@shotbystevy.com.
4. Copy the Worker's address (https://aanvraag-stevyvergouwen.<account>.workers.dev) into `ENDPOINT` at the top of `aanvraag.js`.
