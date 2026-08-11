# Into the Breach for macOS

This directory contains the Electron desktop edition. It packages the existing
Vite game without changing the browser edition or duplicating its source files.

## Run locally

From this directory:

```sh
npm install
npm start
```

`npm start` rebuilds the game with package-safe relative asset paths, then opens
it in a native macOS window. Use `npm run start:fast` to reopen the last build.

## Build the macOS app

```sh
npm run dist:mac
```

The DMG and ZIP are written to `electron/release/`. The normal build targets the
architecture of the Mac performing the build. To create a combined Apple Silicon
and Intel package, run:

```sh
npm run dist:mac:universal
```

The generated app is intentionally unsigned so local development does not need
an Apple Developer certificate. Public distribution should add Developer ID
signing and Apple notarization.

## Desktop behavior

- Saves and settings remain in the game's browser storage, scoped to the app.
- Web links open in the default browser instead of navigating away from the game.
- The renderer is sandboxed and has no Node.js access.
- The native View menu provides zoom, reload, and macOS full-screen controls.
