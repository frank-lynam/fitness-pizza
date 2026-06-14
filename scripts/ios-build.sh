#!/bin/bash
# iOS build script — called by ios-server.py, or run manually on the MacBook.
# Syncs web assets, archives the Xcode project, and exports an IPA.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_PATH="$PROJECT_DIR/build/ios/FitnessPizza.xcarchive"
EXPORT_PATH="$PROJECT_DIR/build/ios/export"
IPA_DEST="$PROJECT_DIR/build/ios/FitnessPizza.ipa"
EXPORT_OPTIONS="$PROJECT_DIR/ios/ExportOptions.plist"

cd "$PROJECT_DIR"

if [ ! -f "$EXPORT_OPTIONS" ]; then
    echo "ERROR: $EXPORT_OPTIONS not found."
    echo "Copy ios/ExportOptions.plist.template to ios/ExportOptions.plist and fill in your Team ID."
    exit 1
fi

echo "=== Syncing web assets → iOS ==="
npx cap sync ios

echo "=== Archiving ==="
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
mkdir -p "$(dirname "$ARCHIVE_PATH")"

xcodebuild \
    -workspace ios/App/App.xcworkspace \
    -scheme App \
    -configuration Release \
    -destination "generic/platform=iOS" \
    archive \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGN_STYLE=Automatic \
    2>&1

echo "=== Exporting IPA ==="
mkdir -p "$EXPORT_PATH"
xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    2>&1

IPA=$(find "$EXPORT_PATH" -name "*.ipa" | head -1)
if [ -z "$IPA" ]; then
    echo "ERROR: No IPA found in $EXPORT_PATH"
    exit 1
fi

cp "$IPA" "$IPA_DEST"
echo "=== IPA ready: $IPA_DEST ($(du -h "$IPA_DEST" | cut -f1)) ==="
