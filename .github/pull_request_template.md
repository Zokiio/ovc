## Summary

Describe what changed and why.

## Validation

- [ ] `bash scripts/docs/check-docs.sh`
- [ ] `cd hytale-plugin && ./gradlew build test`
- [ ] `cd voice-app && npm ci && npm run lint && npm run build && npm run test:e2e:ci`

## Checklist

- [ ] Scope is focused and intentional
- [ ] Docs updated (if behavior/config changed)
- [ ] Tests added/updated (if behavior changed)
- [ ] No secrets/credentials added
- [ ] Changelog updated (if release-relevant)
