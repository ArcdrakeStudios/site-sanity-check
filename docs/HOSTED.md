# Hosted Workers edition

The static frontend at tools.arcdrake.com/site-check/ calls a same-origin gateway.
The gateway sends authenticated requests to the private arcdrake-site-check Worker,
which delegates scans to one SQLite-backed Scanner Durable Object. Workers Free
supports this architecture. No Container, Stripe account or new subscription is
required. Local Node mode is retained separately; hosted mode does not run it.

## Security and resource bounds

- Private service binding only; no workers.dev, previews or public scanner route.
- The only binding is the Scanner object. No private-network, VPC or origin binding.
- global_fetch_strictly_public is required, including for the account's own sites.
  The platform public egress boundary is part of the security model. DNS-over-HTTPS
  preflight rejects mixed/nonpublic answers on every redirect. It is NOT IP pinning:
  DNS may change after preflight; public-only routing remains the platform boundary.
- Fixed Cloudflare DoH endpoint, manual redirects, fresh outbound headers; no user
  cookies, authentication, client IP or arbitrary request headers sent to targets.
- Standard HTTP/S hostnames only. Six target GETs (including redirects), at most
  twelve DNS requests, three redirects per fetch, 16 KiB headers, 256 KiB body,
  five seconds per target response, two seconds per DNS preflight, 25 seconds total.
- Two concurrent requests, ten admitted attempts/minute and 100/day (UTC), including
  demo and failed attempts. The aggregate is persisted and survives isolate restarts.
  Additional per-client/target throttles use expiring memory, cleared on requests
  and a 65-second alarm. No input/result storage or application logging.
- DNS queries and target connections are processed by Cloudflare. A daily HMAC of
  the trusted client IP is generated in the Tools gateway. Raw IP is not forwarded.
- Free account quotas are shared with other products. Quota exhaustion fails closed
  with unavailable/inconclusive feedback; 100/day is an application cap, not an SLA.

## Explicit limitations

The hosted edition does not inspect certificate expiry or certificate-chain details.
Cloudflare fetch validates HTTPS connections, but failures are not always diagnosable
as a particular TLS problem. HTTPS results never imply a complete certificate audit.
Numeric IP URLs, JavaScript execution, login/challenge bypass, compressed/unsupported
encodings, crawling and credential verification are unsupported. EN/DE text explains
these limits before a scan and in results. Local Node mode retains certificate checks.

## Verification and deployment

npm test includes real local workerd/SQLite execution with synthetic outbound
responses, plus transport, malicious redirect/DNS, byte limit, cancellation and
concurrency tests. Test-only quota injection exists only in the runtime test bundle,
never the shipped worker. Local emulation does not establish production quota use
or Cloudflare's network policy; verify both during the approved backend-first rollout.
Use wrangler.hosted.json, preserve its strict-public flag and private bindings, install
SCANNER_SECRET via stdin, then bind the existing Tools gateway. Do not deploy without
release authorization. The independent production action remains held.

References checked 27 October 2026:
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

The per-target throttle keys the submitted hostname; redirected destinations share the global limits but not a separate hostname bucket. Structured result.limitations codes supplement the visible bilingual notes; the UI uses certificate_unavailable for the certificate limitation.
