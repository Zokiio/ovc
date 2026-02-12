# Release Process

This project uses Semantic Versioning (`vX.Y.Z`) and GitHub Releases.

## Release artifacts

Each tagged release publishes:

- Plugin JAR(s) from `hytale-plugin/build/libs/`
- SHA-256 checksum files for each JAR

## Release checklist

1. CI is green on `main`.
2. Documentation updates are merged.
3. `CHANGELOG.md` includes the target version section.
4. Tag is created as `vX.Y.Z`.
5. GitHub Release notes are generated from changelog content.

## How to release

1. Update `CHANGELOG.md` for the version.
2. Create and push the tag:

```bash
git tag v0.4.0
git push origin v0.4.0
```

3. Verify workflow output in Actions and validate attached assets.

## Version compatibility notes

- Java runtime requirement: 25
- Client/server compatibility should be stated per release notes when protocol behavior changes.
