#!/usr/bin/env pwsh
# Check for new Hytale Server API versions

$ErrorActionPreference = "Stop"

Write-Host "Checking for Hytale Server API updates..." -ForegroundColor Cyan
Write-Host ""

# Get current version from gradle.properties
$currentVersion = Get-Content "gradle.properties" | Select-String -Pattern "hytale_server_version\s*=\s*(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() }

if (-not $currentVersion) {
    Write-Host "ERROR: Could not find hytale_server_version in gradle.properties" -ForegroundColor Red
    exit 1
}

Write-Host "Current version: $currentVersion" -ForegroundColor Yellow
Write-Host ""

# Try to fetch versions from Maven
Write-Host "Note: Checking Maven repository requires it to be publicly accessible." -ForegroundColor Gray
Write-Host "If this fails, check manually at: https://maven.hytale.com/release/com/hypixel/hytale/Server/" -ForegroundColor Gray
Write-Host ""

# Alternative: Check with Gradle
Write-Host "Checking dependencies with Gradle..." -ForegroundColor Cyan
Write-Host ""

$gradleCheck = & ./gradlew dependencyInsight --dependency Server --configuration compileClasspath 2>&1 | Out-String

if ($gradleCheck -match "Server:(\d{4}\.\d{2}\.\d{2}-[a-f0-9]+)") {
    $resolvedVersion = $Matches[1]
    Write-Host "Gradle resolved version: $resolvedVersion" -ForegroundColor Green
    
    if ($resolvedVersion -eq $currentVersion) {
        Write-Host "✓ Dependency is resolving correctly!" -ForegroundColor Green
    } else {
        Write-Host "⚠ Gradle is resolving a different version than configured" -ForegroundColor Yellow
    }
} else {
    Write-Host "Could not determine resolved version from Gradle" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Current configuration:" -ForegroundColor Cyan
Write-Host "  Version: $currentVersion" -ForegroundColor White
Write-Host "  Maven: https://maven.hytale.com/release" -ForegroundColor White
Write-Host "  Artifact: com.hypixel.hytale:Server:$currentVersion" -ForegroundColor White
Write-Host ""
Write-Host "To update to a new version:" -ForegroundColor Cyan
Write-Host "  1. Check for versions: https://maven.hytale.com/release/com/hypixel/hytale/Server/" -ForegroundColor White
Write-Host "  2. Edit gradle.properties: hytale_server_version=<new-version>" -ForegroundColor White
Write-Host "  3. Test build: ./gradlew clean build --refresh-dependencies" -ForegroundColor White
Write-Host ""
Write-Host "See docs/HYTALE_VERSION_MANAGEMENT.md for more details" -ForegroundColor Gray

