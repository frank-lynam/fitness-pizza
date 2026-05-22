# iOS Distribution

iOS requires either the App Store or TestFlight — there is no sideload-from-URL option.

## TestFlight (recommended — free, no public App Store listing)

1. Enrol in the Apple Developer Program ($99/yr): https://developer.apple.com/programs/
2. Build the iOS app (see `BUILD.md`) and upload via Xcode Organizer → Distribute App → TestFlight.
3. In App Store Connect, create a Public Link for TestFlight.
4. Replace the placeholder URL in `js/app.js` (`setupHelpButtons`) with your TestFlight link.

TestFlight links look like: `https://testflight.apple.com/join/XXXXXXXX`
