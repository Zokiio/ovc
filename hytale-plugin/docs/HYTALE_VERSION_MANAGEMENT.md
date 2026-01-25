# Hytale Server API Version Management

## Current Version
The project currently uses: **2026.01.24-6e2d4fc36**

This version is managed in `gradle.properties` under the `hytale_server_version` property.

## Checking for Updates

### Option 1: Browse Maven Repository (Recommended)
Visit the Hytale Maven repository to see all available versions:
- **URL:** https://maven.hytale.com/release/com/hypixel/hytale/Server/
- Look for the latest version directory
- Versions follow the format: `YYYY.MM.DD-<commit-hash>`

### Option 2: Using curl (Command Line)
```bash
# List available versions
curl -s https://maven.hytale.com/release/com/hypixel/hytale/Server/ | grep -oP '(?<=href=")[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-f0-9]+(?=/")' | sort -r | head -5

# Or on Windows PowerShell:
(Invoke-WebRequest -Uri "https://maven.hytale.com/release/com/hypixel/hytale/Server/").Content | Select-String -Pattern '\d{4}\.\d{2}\.\d{2}-[a-f0-9]+' -AllMatches | ForEach-Object { $_.Matches.Value } | Sort-Object -Descending | Select-Object -First 5
```

### Option 3: Check Gradle Dependencies
```bash
# Show resolved dependencies (shows if there's a newer version)
./gradlew dependencies --configuration compileClasspath | grep -i hytale

# Or get dependency insight
./gradlew dependencyInsight --dependency Server --configuration compileClasspath
```

## Updating the Version

1. **Update `gradle.properties`:**
   ```properties
   hytale_server_version=2026.01.24-6e2d4fc36  # Update this line
   ```

2. **Test the build:**
   ```bash
   cd hytale-plugin
   ./gradlew clean build --refresh-dependencies
   ```

3. **Commit the change:**
   ```bash
   git add gradle.properties
   git commit -m "chore: update Hytale Server API to version X.X.X"
   git push
   ```

## Update Frequency

The Hytale Server API version should be updated:
- ✅ **When Hytale releases a new version** - Check after game updates
- ✅ **When compilation errors occur** - May indicate API changes
- ✅ **Periodically** - Check weekly or bi-weekly for active development
- ⚠️ **Before major releases** - Ensure compatibility with latest API

## Breaking Changes

When updating to a new version, be aware:
1. **API changes** may cause compilation errors
2. **Deprecated methods** may be removed
3. **New features** may be available
4. Always test thoroughly after updating

### Update Checklist
- [ ] Check Maven repository for new version
- [ ] Update `hytale_server_version` in `gradle.properties`
- [ ] Run `./gradlew clean build --refresh-dependencies`
- [ ] Fix any compilation errors (document in `COMPILATION_ISSUES.md`)
- [ ] Test the plugin on a Hytale server
- [ ] Update `COMPILATION_ISSUES.md` if API changes are needed
- [ ] Commit and push changes

## Automated Update Checking

### GitHub Actions (Future Enhancement)
You could add a GitHub Action to check for new versions weekly:

```yaml
# .github/workflows/check-hytale-version.yml
name: Check Hytale Version
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  check-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check for new version
        run: |
          LATEST=$(curl -s https://maven.hytale.com/release/com/hypixel/hytale/Server/ | grep -oP '(?<=href=")[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-f0-9]+(?=/")' | sort -r | head -1)
          CURRENT=$(grep 'hytale_server_version=' gradle.properties | cut -d'=' -f2)
          if [ "$LATEST" != "$CURRENT" ]; then
            echo "New version available: $LATEST (current: $CURRENT)"
            # Create an issue or PR
          fi
```

## Version History

| Date       | Version                    | Notes                                    |
|------------|----------------------------|------------------------------------------|
| 2026-01-25 | 2026.01.24-6e2d4fc36      | Initial Maven migration                  |

## Troubleshooting

### Build fails after update
1. Clear Gradle cache: `./gradlew clean --refresh-dependencies`
2. Check `COMPILATION_ISSUES.md` for known API incompatibilities
3. Review Hytale changelog for breaking changes

### Cannot download new version
1. Verify the version exists in the Maven repository
2. Check your internet connection
3. Clear Gradle cache: `rm -rf ~/.gradle/caches/modules-2/files-2.1/com.hypixel.hytale`

### Conflicts with other dependencies
1. Check dependency tree: `./gradlew dependencies`
2. Use dependency insight: `./gradlew dependencyInsight --dependency <name>`
