#!/usr/bin/env bash
# Create a self-hosted live-update bundle and update updates/latest.json
#
# Usage:
#   npm run deploy:live                  — use version from package.json, same minNativeVersion
#   bash scripts/bundle.sh 2.3.9        — explicit version
#   bash scripts/bundle.sh 2.3.9 2.3.8  — explicit version + lower minNativeVersion
#
# After running, commit the new bundle + latest.json, push, and invalidate:
#   git add updates/ && git commit -m "Deploy live bundle $VERSION" && git push
#   curl http://localhost:12345/invalidate
set -e
cd "$(dirname "$0")/.."

VERSION=${1:-$(node -e "process.stdout.write(require('./package.json').version)")}
MIN_NATIVE=${2:-$VERSION}

echo "Building bundle v${VERSION} (minNativeVersion: ${MIN_NATIVE})..."

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
