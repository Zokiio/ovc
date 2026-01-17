# Creating Windows Executable

The Windows EXE can be built using `jpackage` (requires JDK 17+).

## Option 1: Use the Pre-built ZIP (Recommended for Testing)

Download `voice-client-1.0.0-SNAPSHOT-windows.zip` and extract it. Run `run.bat`.

Requires Java 17+ to be installed on the system.

## Option 2: Build Windows Installer (MSI/EXE)

Run on Windows with JDK 17+:

```bash
gradle :voice-client:createWindowsExe
```

This creates a self-contained Windows MSI installer in `voice-client/build/windows-exe/`.

The MSI includes a bundled JVM, so Java doesn't need to be installed separately.

## Troubleshooting JavaFX Issues

If you get "No toolkit found" or graphics errors:

1. Ensure you're using the ZIP distribution with `run.bat`
2. Make sure Java 17+ is installed
3. Try setting JAVA_TOOL_OPTIONS: `set JAVA_TOOL_OPTIONS=-Djava.awt.headless=false`
4. Use the MSI installer once built (bundles everything)

## Creating Icon for Installer

Place a Windows icon file at `voice-client/src/main/resources/icon.ico` for a custom installer icon.
