# Building the Fitness Pizza Native App

This document covers building the Android APK and iOS app using Capacitor.

## Prerequisites

- Node.js 18+
- For Android: Android Studio with SDK 33+ and a Java 17 JDK
- For iOS: Xcode 15+ on macOS

## First-time setup

```bash
cd fitness-tracker-pwa
npm install
npx cap init          # only needed once; config already exists in capacitor.config.json
```

## Android APK

```bash
# 1. Copy web assets into www/ and sync to the native project
npm run sync:android

# 2. Open in Android Studio
npm run open:android

# 3. In Android Studio:
#    Build → Generate Signed Bundle / APK → APK → Release
#    (create a keystore the first time)

# 4. Copy the signed APK to the distribution directory
cp android/app/build/outputs/apk/release/app-release.apk app/android/fitness-pizza.apk

# 5. Commit and push — the APK is served at:
#    https://fitness-pizza.com/app/android/fitness-pizza.apk
```

### Android permissions added by Capacitor plugins

The following permissions are automatically injected into `AndroidManifest.xml` by the plugins:

- `ACCESS_FINE_LOCATION` — precise GPS
- `ACCESS_COARSE_LOCATION` — network location fallback
- `ACCESS_BACKGROUND_LOCATION` — keep GPS running while screen is locked (Android 10+)
- `FOREGROUND_SERVICE` — shows the persistent "Run in progress" notification

### Android 10+ background location note

Android 10 and above requires a separate `ACCESS_BACKGROUND_LOCATION` permission prompt.  
After the user grants foreground location, the app will prompt separately for "Allow all the time".  
This is mandatory for background GPS tracking to work while the screen is locked.

## iOS App

```bash
# 1. Copy web assets into www/ and sync to the native project
npm run sync:ios

# 2. Open in Xcode
npm run open:ios

# 3. In Xcode:
#    - Set your Team (Signing & Capabilities → Team)
#    - Add the "Background Modes" capability and tick "Location updates"
#    - Product → Archive → Distribute App → TestFlight
```

See `app/ios/README.md` for TestFlight distribution instructions.

## Bumping the app version

Update the version in **all four** files before building a release:

| File | Field |
|------|-------|
| `sw.js` | comment + `CACHE_NAME` constant |
| `manifest.json` | `version` field |
| `index.html` | version text inside `#secret-version` span |
| `README.md` | Version section |

Then run `npm run sync:android` (or `sync:ios`) to propagate the change into the native project.

## Live updates with Capgo (JS/CSS changes — no APK reinstall needed)

Capgo pushes new web bundles (JS + CSS + HTML) directly to installed apps. Users get
updates the next time they open the app, with no trip to the download link.

### First-time Capgo setup

1. Create a free account at https://capgo.app (free tier: 1 app, 500 devices)
2. Log in with the CLI:
   ```bash
   npx @capgo/cli login YOUR_API_KEY
   ```
3. Register the app (once only):
   ```bash
   npx @capgo/cli app add com.fitnesspizza.app
   ```

### Deploying a JS/CSS update

```bash
# Builds www/ and uploads the bundle to Capgo's production channel
npm run deploy:live
```

Installed apps will silently download the bundle in the background and apply it on next launch.

### When a new APK is also needed

A new APK is required when you add a new native plugin, change permissions, or bump
`@capacitor/core`. In that case:

1. Bump the version in all four files (see above), rebuild and re-upload the APK.
2. Upload the new web bundle with `--min-update-version` set to the new APK version:
   ```bash
   npm run prepare-web
   npx @capgo/cli bundle upload --channel production --min-update-version 2.3.9
   ```
3. Devices running the old APK will receive a **"App Update Required"** dialog (built into
   the app) directing them to download the new APK from `/app/android/fitness-pizza.apk`.
   Devices already on the new APK receive the bundle update silently as usual.

## Development workflow

For everyday web development, continue using:

```bash
python3 server.py   # or any static file server
```

Only run `npm run sync:*` when you need to build or test a native feature (background GPS, TTS, etc.).
The `www/` directory is gitignored — it is generated on demand by the prepare-web script.
