# Security

Report vulnerabilities privately to **[contact@arcdrake.com](mailto:contact@arcdrake.com)** with “Site Sanity Check security” in the subject. Do not open a public issue containing exploit details, credentials or personal data.

Include the affected version/commit, a minimal synthetic reproduction, expected versus observed behavior and impact. Do not send real credentials or private client data. There is no guaranteed response time.

Only the latest code on `main` is maintained; older branches do not have separate security support. This is a locally run checker, not a security audit or a public scanning service. Read the [privacy and limitations](README.md#privacy-and-limits) before use. In particular, secret detection and masking are heuristic: never enter private or signed URLs.

Tests contain an intentionally public self-signed TLS key/certificate for fixture.example. They have no authority outside isolated tests and must never be used in a real service.
