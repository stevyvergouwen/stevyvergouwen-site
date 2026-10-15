# Request form: the Worker

Mails requests from /event, /brand and /artist to info@stevyvergouwen.com. No API keys.

1. Cloudflare > stevyvergouwen.com > Email > Email Routing: enable it, and add + verify the destination address info@stevyvergouwen.com.
2. Workers & Pages > Create > Worker. Paste `index.js`. Deploy.
3. Worker > Settings > Bindings > Add > Send Email. Variable name `MAIL`. Destination: info@stevyvergouwen.com.
4. Copy the Worker's address (https://aanvraag-stevyvergouwen.<account>.workers.dev) into `ENDPOINT` at the top of `aanvraag.js`.
