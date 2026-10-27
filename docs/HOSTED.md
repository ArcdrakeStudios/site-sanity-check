# Hosted architecture

The hosted edition uses the same bounded scanner as the local edition. The
browser sends POST JSON to its own origin, `/api/site-check/scan` or `/demo`.
The private hosting gateway checks Origin, method, content type and request size,
applies a platform limiter, strips browser identity headers, and calls a private
Worker through a service binding. No public scanner endpoint is exposed.

The gateway signs a daily client key from the platform IP using a server-only
HMAC key. The scanner receives that key and a separate authentication secret;
it does not receive the browser IP, cookies or browser authorization. Secrets
must be distinct randomly generated values of at least 32 bytes.

The private Worker uses one Cloudflare Container with Node 24, pinned by image
digest in Dockerfile. It runs as an unprivileged user. The scanner validates every
DNS answer and redirect, pins a validated address for each actual connection,
and keeps TLS certificate verification. Workers' node:http does not support
the lookup callback required by this transport, so it must not replace Node.

One Durable Object admits at most 100 attempts per UTC day and ten per minute,
persisting one aggregate record across restarts. The record contains no visitor,
hostname or scan data and is replaced on the first request of a new UTC day.
Rejected/failed scans consume an admitted slot. Inside the single container,
limits are two concurrent scans and three attempts per client and target per
minute. Those in-memory keys expire within 65 seconds. Demo consumes admission
capacity but does not fetch a target. The container sleeps after one idle minute.

Each scan has six requests, three redirects per fetch, 256 KiB per response and
25 seconds total. The gateway bounds both request and response sizes and aborts
after 28 seconds. No application logging of input, output or credentials is
implemented. Provider connection data and recovery facilities remain subject to
Cloudflare's separate processing. Masking is heuristic, not a guarantee that
arbitrary private information can be safely submitted or shared.

The hosted static build includes a prior-consent privacy window and optional
product/action totals. Rejection leaves the checker usable; GPC/DNT override
permission, and withdrawal stops subsequent events. No URLs or results are sent
to measurement. Language and yes/no choices use browser storage without a
visitor identifier. The local edition has no measurement integration.

Build static assets with `node scripts/build-hosted.mjs .runtime/hosted-<name>`.
Deployments need the matching private gateway, service bindings, rate limits,
secrets and the published privacy notice. `wrangler.hosted.json` has no public
route. Cloudflare Containers require an eligible paid Workers account; this
repository does not create a subscription or authorize spending. Never expose
the local `server.mjs` as the hosted service.
