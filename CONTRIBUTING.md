# Contributing

Small, focused improvements are welcome. Discuss substantial changes in an issue first, then fork the repository and submit a pull request against `main`.

Use Node.js 24 or newer. Run the development commands in [README.md](README.md): install locked dependencies, install Chromium, then run `npm test`, `npm run check` and `npm run test:browser`. Linux browser tests also need Playwright's system dependencies. Keep test ports 43146/43147 free.

Explain the user-visible problem, your change and the checks you ran. Add a regression for behavior changes. Keep English/German messages aligned. Preserve the public-address, DNS/redirect, TLS, request-budget and redaction boundaries. Test adverse behavior with synthetic local fixtures, not unsolicited scans of real websites.

Use fictional data in issues, logs and screenshots. Do not submit private URLs, real tokens or client data. Report security vulnerabilities through [SECURITY.md](SECURITY.md).

Maintainers review contributions; CI checks are defined in `.github/workflows/ci.yml`. A maintainer may need to approve a contributor's workflow before it runs. A code change does not deploy a hosted service.

Contributions are provided under the MIT license. Be respectful and constructive.
