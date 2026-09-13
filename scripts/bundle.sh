#!/usr/bin/env bash
# Create a self-hosted live-update bundle and update updates/latest.json
#
# Usage:
#   npm run deploy:live           — use version from package.json
#   bash scripts/bundle.sh 2.3.9  — explicit version
#
# minNativeVersion is NEVER taken as a manual argument — it is read straight from
# android/app/build.gradle's versionName, which is the single source of truth for
# "what APK is actually installed." A human/agent guessing this value wrong (e.g.
# assuming it's the same as the last JS deploy version, when no APK was actually
# rebuilt since an earlier version) is exactly what caused a real production
# incident: the updater refused to install and demanded a fresh APK. See CLAUDE.md
# Deploy Checklist step 2.
#
# After running, commit the new bundle + latest.json, push, and invalidate:
#   git add updates/ && git commit -m "Deploy live bundle $VERSION" && git push
#   curl http://localhost:12345/invalidate
set -e
cd "$(dirname "$0")/.."

if [ -n "$2" ]; then
    echo "ERROR: bundle.sh no longer accepts a manual minNativeVersion argument."
    echo "It is always read from android/app/build.gradle's versionName so it can't be guessed wrong."
    echo "If you just rebuilt the APK, bump versionName in build.gradle FIRST, then re-run with just the version arg."
    exit 1
fi

VERSION=${1:-$(node -e "process.stdout.write(require('./package.json').version)")}
MIN_NATIVE=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle)

if [ -z "$MIN_NATIVE" ]; then
    echo "ERROR: could not read versionName from android/app/build.gradle"
    exit 1
fi

echo "Building bundle v${VERSION} (minNativeVersion: ${MIN_NATIVE}, read from android/app/build.gradle)..."

npm run prepare-web

mkdir -p updates
cd www && zip -r "../updates/bundle-${VERSION}.zip" . && cd ..

cat > updates/latest.json << JSONEOF
{
  "version": "${VERSION}",
  "url": "https://fitness-pizza.com/updates/bundle-${VERSION}.zip",
  "minNativeVersion": "${MIN_NATIVE}"
}
JSONEOF

echo ""
echo "Done. Bundle size: $(du -sh updates/bundle-${VERSION}.zip | cut -f1)"
echo ""
echo "Deploy with:"
echo "  git add updates/ && git commit -m 'Deploy live bundle ${VERSION}' && git push && curl http://localhost:12345/invalidate"
