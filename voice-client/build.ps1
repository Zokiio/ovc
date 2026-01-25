# Build script for HytaleVoiceChat on Windows
# This script sets up the environment and builds the voice client with required DLLs

param(
    [switch]$NoWindow = $false,
    [switch]$Clean = $false
)

$ErrorActionPreference = "Stop"

# Paths
$OutDir = "dist"
$MSYS2Bin = "C:\msys64\mingw64\bin"
$AppName = "HytaleVoiceChat.exe"

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning build directory..."
    if (Test-Path $OutDir) {
        Remove-Item -Recurse -Force $OutDir
    }
}

# Create output directory
Write-Host "Creating output directory: $OutDir"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Set up build environment
Write-Host "Setting up build environment..."
$env:PATH = "C:\Program Files\Go\bin;$MSYS2Bin;$env:PATH"
$env:CGO_ENABLED = "1"

# Build the application
Write-Host "Building application..."
$buildFlags = @("-o", "$OutDir\$AppName", ".\cmd\voice-client")
if ($NoWindow) {
    Write-Host "Building with no console window..."
    $buildFlags = @("-ldflags=-H=windowsgui") + $buildFlags
}

& go build @buildFlags

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit $LASTEXITCODE
}

Write-Host "Build successful: $OutDir\$AppName"

# Copy required DLLs
Write-Host "Copying required DLLs from MSYS2..."
$dlls = @(
    "libportaudio.dll",
    "libopus-0.dll",
    "libopusfile-0.dll",
    "libogg-0.dll",
    "libgcc_s_seh-1.dll",
    "libstdc++-6.dll",
    "libwinpthread-1.dll"
)

foreach ($dll in $dlls) {
    $srcPath = Join-Path $MSYS2Bin $dll
    if (Test-Path $srcPath) {
        Copy-Item $srcPath $OutDir -Force
        Write-Host "  ✓ $dll"
    } else {
        Write-Warning "  ✗ $dll not found at $srcPath"
    }
}

Write-Host "`nBuild complete! Output in: $OutDir\"
Write-Host "Run with: .\$OutDir\$AppName"
