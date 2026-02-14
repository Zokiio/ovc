# Documentation Hub

This repository uses a structured, operator-first documentation layout.

## Operator Guides

- [Host quickstart](operations/host-quickstart.md): Server-host onboarding from install to first live validation.
- [Configuration reference](operations/configuration.md): Full `ovc.conf` key reference and defaults.
- [Reverse proxy deployment (recommended)](operations/reverse-proxy.md): Production setup with SSL termination.
- [Direct SSL deployment (advanced)](operations/direct-ssl.md): Plugin-managed TLS.
- [Troubleshooting](operations/troubleshooting.md): Common deployment and runtime failures.
- [Support policy](operations/support.md): Scope and support channel policy.

## Release and Contribution Guides

- [Release process](releases.md): Tagging, artifacts, and release checklist.
- [Contributing](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)

## Project-Local Docs

- [Voice app README](../voice-app/README.md)
- [Voice app theming system](../voice-app/THEMING.md)

## Source of Truth for Config Keys

The configuration documentation is validated against these files:

- `hytale-plugin/src/main/resources/ovc.conf.example`
- `hytale-plugin/common/src/main/java/com/zottik/ovc/common/network/NetworkConfig.java`
