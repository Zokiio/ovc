# Contributing to Obsolete Voice Chat (OVC)

Thanks for contributing.

## Scope and priorities

This repository is operator-first. Changes that improve deployability, runtime stability, and documentation clarity are prioritized.

## Prerequisites

- Java 25 (required for `hytale-plugin` builds)
- Node.js 22.x LTS
- npm 10+
- Git

## Repository layout

- `hytale-plugin/`: Java plugin and server-side voice routing/signaling
- `voice-app/`: React + TypeScript web client
- `docs/`: canonical operator and contributor documentation

## Local setup

### Plugin

```bash
cd hytale-plugin
./gradlew build
./gradlew test
```

### Web client

```bash
cd voice-app
npm ci
npm run lint
npm run build
npm run test:e2e:ci
```

## Required checks before opening a PR

Run all of the following from the repo root (or equivalent subdirectories):

```bash
bash scripts/docs/check-docs.sh
cd hytale-plugin && ./gradlew build test
cd ../voice-app && npm ci && npm run lint && npm run build && npm run test:e2e:ci
```

## Branch and PR conventions

- Keep changes focused and scoped.
- Use descriptive branch names (for example: `feature/proximity-radar-ui`, `fix/group-join-timeout`).
- Include tests/docs updates in the same PR when behavior changes.
- Use conventional, descriptive commit messages.

## Documentation policy

- Treat `docs/` as source-of-truth for operator behavior.
- For configuration updates, update:
- `hytale-plugin/src/main/resources/ovc.conf.example`
- `docs/operations/configuration.md`
- Keep key coverage green via `bash scripts/docs/check-docs.sh`.

## Pull request checklist

- [ ] Change is scoped and explained
- [ ] Tests added/updated where needed
- [ ] Docs updated where needed
- [ ] `bash scripts/docs/check-docs.sh` passes
- [ ] `./gradlew build test` passes (`hytale-plugin/`)
- [ ] `npm run lint`, `npm run build`, `npm run test:e2e:ci` pass (`voice-app/`)

## Reporting bugs and requesting features

Use GitHub Issues:

- Bug reports: include reproduction steps, logs, and config details
- Feature requests: include operator impact and expected behavior

## Security

Do not report vulnerabilities in public issues. See `SECURITY.md`.
