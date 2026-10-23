# Synthetic TLS fixture

key.pem is an intentionally public, disposable test key with no external use or authority. cert.pem is a self-signed certificate for fixture.example, expiring in 2036. Never trust or use this key in a real service. One test verifies rejection by the production TLS transport. A separate child process trusts this certificate only through its own NODE_EXTRA_CA_CERTS to verify trusted success, expiry observation and hostname mismatch rejection. Renew the synthetic fixture before expiry; never disable TLS validation to make a test pass.
