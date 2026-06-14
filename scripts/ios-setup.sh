#!/bin/bash
# One-time iOS setup — run this on the MacBook after cloning the repo.
# Requires: Xcode (App Store), Node.js, CocoaPods (`sudo gem install cocoapods`)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== Installing JS dependencies ==="
npm ci

echo "=== Adding iOS Capacitor platform ==="
if [ -d "ios/App/App.xcworkspace" ]; then
    echo "  iOS platform already added, skipping."
else
    npx cap add ios
fi

echo "=== Syncing web assets to iOS ==="
npx cap sync ios

echo "=== Installing CocoaPods ==="
cd ios/App && pod install
cd "$PROJECT_DIR"

echo "=== Placing ExportOptions.plist ==="
if [ ! -f "ios/ExportOptions.plist" ]; then
    cp "$PROJECT_DIR/scripts/ExportOptions.plist.template" ios/ExportOptions.plist
    echo "  Created ios/ExportOptions.plist — fill in your Team ID before building."
else
    echo "  ios/ExportOptions.plist already exists, skipping."
fi

echo ""
echo "=== iOS setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Open ios/App/App.xcworkspace in Xcode"
echo "  2. Select the App target → Signing & Capabilities"
echo "  3. Set your Team and enable automatic signing"
echo "  4. Note your Team ID (10-char string like ABC123XYZ9)"
echo "  5. Edit ios/ExportOptions.plist: replace REPLACE_WITH_YOUR_TEAM_ID"
echo "  6. Run: python3 scripts/ios-server.py"
