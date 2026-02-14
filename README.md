![Obsolete Voice Chat Logo](.github/images/logo.png)

# Obsolete Voice Chat (OVC)

Proximity-based voice chat for Hytale using a Java SFU plugin and a browser client over WebRTC.

> Trademark notice: Hytale and Hypixel are trademarks of their respective owners. OVC is an unofficial community project and is not affiliated with or endorsed by Hypixel Studios.

## Supported components

- `hytale-plugin/`: Java plugin with signaling, routing, and game integration
- `voice-app/`: React + TypeScript web client
- `docs/`: canonical operator and contributor documentation

## Architecture

1. Web client authenticates to plugin signaling over WebSocket.
2. Plugin establishes WebRTC peer/data-channel transport.
3. Plugin routes audio using proximity/group rules.
4. Optional proximity metadata (`distance`, `maxRange`) is included when `USE_PROXIMITY_RADAR = true`.

## Prerequisites

- Java 25 (required for `hytale-plugin`)
- Node.js 22.x LTS
- npm 10+

## Quick start for operators

For full server-host onboarding, see [Host quickstart](docs/operations/host-quickstart.md).

### 1) Build the plugin

```bash
cd hytale-plugin
./gradlew build
```

Copy the generated JAR from `hytale-plugin/build/libs/` into your Hytale server `mods/` folder.

### 2) Configure the plugin

Create `ovc.conf` from `hytale-plugin/src/main/resources/ovc.conf.example` and update values for your environment.

Key docs:

- [Configuration reference](docs/operations/configuration.md)
- [Reverse proxy deployment (recommended)](docs/operations/reverse-proxy.md)
- [Direct SSL deployment (advanced)](docs/operations/direct-ssl.md)

### 3) Use the web client

Recommended: use the hosted client at `https://ovc.zottik.com`.

For custom deployments, self-host the client (build and serve `voice-app/dist/`) using the steps in [Host quickstart](docs/operations/host-quickstart.md).

## Quick start for contributors

```bash
bash scripts/docs/check-docs.sh
cd hytale-plugin && ./gradlew build test
cd ../voice-app && npm ci && npm run lint && npm run build && npm run test:e2e:ci
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full contribution workflow.

## Documentation

- [Documentation hub](docs/README.md)
- [Host quickstart](docs/operations/host-quickstart.md)
- [Configuration reference](docs/operations/configuration.md)
- [Troubleshooting](docs/operations/troubleshooting.md)
- [Support policy](docs/operations/support.md)
- [Release process](docs/releases.md)
- [Voice app README](voice-app/README.md)

## Releases

- Versioning model: Semantic Versioning (`vX.Y.Z` and pre-release tags like `vX.Y.Z-alpha.1`)
- Release artifacts: plugin JAR, website bundle archive, and SHA-256 checksums
- Process: [docs/releases.md](docs/releases.md)

## Support and security

- Support channel: [GitHub Issues](https://github.com/Zokiio/hytale-voicechat/issues)
- Security reporting: [GitHub Security Advisories](https://github.com/Zokiio/hytale-voicechat/security/advisories/new)

## License

This repository is licensed under the [MIT License](LICENSE).
