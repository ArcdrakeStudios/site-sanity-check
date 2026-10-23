# Architecture and verification

`server.mjs` serves static files and a small JSON API on loopback. It validates Host, Origin and content type, caps input size, limits concurrent scans to two and caps starts at ten per minute globally and three per hostname. Rate state is in memory for one process; restarting resets it.

`src/safety.mjs` normalizes HTTP(S) URLs, rejects credentials/custom ports and special-use targets, checks every DNS answer, and masks evidence. `src/network.mjs` pins the selected public address in the actual HTTP/TLS lookup while preserving Host/SNI. Every redirect goes through validation again. All fetches share a six-request/25-second budget; individual requests have a five-second budget, DNS two seconds, bodies 256 KiB, and redirects at most three. Compressed and unsupported-charset bodies fail closed. No test transport can be selected through request JSON.

`src/checks.mjs` samples content and returns structured findings with coverage notes. It never verifies suspected credentials, executes target JavaScript or probes private files. Text extraction preserves source offsets; masking occurs before excerpt slicing. Bounded detectors trade coverage for predictable work, including the 200-character shortcode attribute limit.

`public/app.mjs` renders untrusted content using textContent. `public/i18n.mjs` contains the EN/DE strings. No input/result persistence or analytics is implemented; language preference uses localStorage. The page's CSP restricts resources to the local app.

Tests cover address/DNS policy, redirect and rebinding cases, actual pinned HTTP, trusted/untrusted TLS, hostname validation, response/cancellation/time limits, local API controls, evidence masking, coverage semantics, hostile parser inputs and localization. Trusted TLS uses a separate child process with a disposable test CA; production verification is not disabled. Browser checks exercise both languages at 320/768/1440 widths, output overflow, focus and clear/cancel behavior. They are not a full accessibility audit. CPU assertions are regression guards, not a service-level promise.

Do not expose this development server to the public internet. Authentication, distributed abuse controls, operational logging/privacy, network egress isolation and deployment ownership require a separate service design.
