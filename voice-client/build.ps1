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
$ResourcesDir = "internal\\client\\resources"
$IconPng = Join-Path $ResourcesDir "Icon.png"
$IconIco = Join-Path $ResourcesDir "icon.ico"

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
New-Item -ItemType Directory -Force -Path (Join-Path $OutDir "resources") | Out-Null

# Prepare build resources in cmd/voice-client
Write-Host "Preparing build resources..."
Copy-Item "versioninfo.json" "cmd\voice-client\" -Force
if (Test-Path $IconPng) {
    $magick = Get-Command magick -ErrorAction SilentlyContinue
    if ($magick) {
        Write-Host "Regenerating icon.ico from Icon.png..."
        magick $IconPng -background none -alpha on -define icon:auto-resize=256,128,64,48,32,16 -colors 256 $IconIco
    }
}
Copy-Item $IconIco "cmd\voice-client\" -Force
Copy-Item $IconPng "cmd\voice-client\" -Force

# Generate resource file
Write-Host "Generating Windows resource file..."
$env:PATH = "$env:USERPROFILE\go\bin;$env:PATH"
Push-Location "cmd\voice-client"
Remove-Item "resource.syso" -Force -ErrorAction SilentlyContinue
goversioninfo -64 -o resource.syso
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to generate resource file"
    Pop-Location
    exit $LASTEXITCODE
}
Pop-Location

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

# Copy icon assets for runtime window icon
Copy-Item $IconPng (Join-Path $OutDir "Icon.png") -Force
Copy-Item $IconPng (Join-Path $OutDir "resources\Icon.png") -Force

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


