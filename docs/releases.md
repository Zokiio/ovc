# Release Process

This project uses Semantic Versioning (`vX.Y.Z`) and GitHub Releases.
Pre-releases are supported with standard SemVer suffixes (for example `v0.4.0-alpha.1`).

## Release artifacts

Each tagged release publishes:

- Plugin artifact as `ovc-plugin-<version>.jar`
- Website bundle archive from `voice-app/dist/` as `ovc-webapp-<version>.tar.gz`
- SHA-256 checksum files for each JAR and archive

## Release checklist

1. CI is green on `main`.
2. Documentation updates are merged.
3. `CHANGELOG.md` includes the target version section.
4. Tag is created as `vX.Y.Z` or `vX.Y.Z-<channel>.<n>` for pre-releases.
5. GitHub Release notes are generated from changelog content.

## How to release

1. Update `CHANGELOG.md` for the version.
2. Create and push the tag:

```bash
git tag v0.4.0-alpha.1
git push origin v0.4.0-alpha.1
```

3. Verify workflow output in Actions and validate attached assets.

## Version compatibility notes

- Java runtime requirement: 25
- Client/server compatibility should be stated per release notes when protocol behavior changes.
