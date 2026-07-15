# Security Policy

specpasa is a self-hosted application that stores user accounts and encrypted AI-provider API keys, so we take vulnerability reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/worldofpasa/specpasa/security/advisories/new) ("Report a vulnerability" on the repository's Security tab).

Include what you can: affected version/commit, reproduction steps, and impact. You'll get an acknowledgement within a few days, and we'll keep you informed as we triage and fix.

## Supported versions

specpasa is pre-1.0; only the latest release (and `main`) receives security fixes.

## Scope notes for self-hosters

- `SPECPASA_SECRET` encrypts stored provider API keys at rest — treat it like a database credential and never commit it.
- The local-CLI and Ollama providers execute on the host running the server; only grant provider configuration to users you trust.
- Reports about misconfigured individual deployments (e.g. an instance exposed without TLS) are out of scope unless caused by an insecure default in specpasa itself.
