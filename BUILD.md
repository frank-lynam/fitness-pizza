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

## Live updates (JS/CSS changes — no APK reinstall needed)

The app uses `@capgo/capacitor-updater` in **manual mode** pointed at a self-hosted
`updates/latest.json` on `fitness-pizza.com`. No Capgo account needed — bundles are
just static files committed alongside the rest of the repo.

On every launch the app fetches `latest.json`, compares the version against what's
currently running, and silently downloads + queues any newer bundle. It applies on
the user's next app open.

### Deploy a JS/CSS update

```bash
# Bump versions in the four standard files, then:
npm run deploy:live   # builds www/, zips it, updates updates/latest.json
git add updates/ && git commit -m "Deploy live bundle 2.3.9" && git push
curl http://localhost:12345/invalidate
```

That's it. Installed apps pick it up automatically on next launch.

### When a new APK is also needed

Required when adding a native plugin, changing Android permissions, or bumping
`@capacitor/core`. In that case:

1. Bump the version, rebuild and commit the new APK (see Android APK section above).
2. Deploy the live bundle with a **higher** `minNativeVersion`:
   ```bash
   bash scripts/bundle.sh 2.3.9 2.3.9   # version=2.3.9, minNativeVersion=2.3.9
   git add updates/ && git commit -m "Deploy live bundle 2.3.9 (requires new APK)" && git push
   curl http://localhost:12345/invalidate
   ```
3. Devices running the old APK get an **"App Update Required"** dialog linking to the
   new APK. Devices already on the new APK silently receive the bundle as usual.

## Development workflow

For everyday web development, continue using:

```bash
python3 server.py   # or any static file server
```

Only run `npm run sync:*` when you need to build or test a native feature (background GPS, TTS, etc.).
The `www/` directory is gitignored — it is generated on demand by the prepare-web script.
