# 🍕 Fitness Pizza

Track your macros like slices of pizza! A lightweight, privacy-focused Progressive Web App for tracking macros, measurements, and workouts. **Entirely vibe-coded** with Claude Code.

## ✨ Features

### 📊 Macro Tracking
- Log food with detailed macros (protein, carbs, fat, fiber)
- AI-powered estimation from food photos via Claude API
- Food library with 130+ imported foods
- Search and smart macro-match sorting
- Plan vs. completed meals
- Adjust servings after logging

### 📈 Body Measurements
- Track weight and waist measurements
- Timestamp precision for trends
- Visual charts for progress

### 💪 Workout Logging
- Log exercises by type (Cardio, Core, Lifting)
- Conservative calorie burn estimates
- Workout library for quick re-logging
- Star your favorite exercises

### 📉 Dashboard & Trends
- Real-time macro progress bars
- Calorie balance (intake - burn)
- Planned items always shown first
- Comprehensive trending charts

### 🤖 AI Integration
- Claude Sonnet 4.5 for food photo analysis
- Menu text estimation
- Automatic macro calculations

### 🔒 Data Persistence
- **Persistent Storage API** - browser won't auto-clear your data
- **Weekly auto-backup** to Downloads (`fitness-tracker-backup.json`)
- Overwrites same file - no clutter
- Full import/export support

## 🎨 Design Philosophy

- **Dark mode by default** - easier on the eyes
- **Mobile-first** - optimized for thumb-friendly touch targets
- **Offline-capable** - full PWA with service worker
- **Privacy-focused** - all data stored locally in IndexedDB
- **No server required** - pure client-side app

## 🚀 Installation

### Live App:

**[fitness-pizza.com](https://fitness-pizza.com)**

### On Your Phone (PWA Install):

1. **Android (Chrome/Edge)**:
   - Visit [fitness-pizza.com](https://fitness-pizza.com)
   - Tap menu (⋮) → "Add to Home screen"
   - App appears on home screen

2. **iPhone (Safari)**:
   - Visit [fitness-pizza.com](https://fitness-pizza.com)
   - Tap Share (□↑) → "Add to Home Screen"
   - App appears on home screen

### Deployment:

Upload the entire folder to any static web host:
- GitHub Pages
- Vercel
- Netlify
- Your own domain via SFTP

**Requirements**: HTTPS is required for PWA features (service worker, camera access).

## 📱 Usage

### Quick Start:

1. **Set Daily Goals**: ⚙️ Settings → Daily Goals (Fat, Protein, Carbs)
2. **Log Food**: 📊 Macros → Food Library or + Add
3. **Track Measurements**: 📏 Add weight/waist measurements
4. **Log Workouts**: 💪 Workouts → + Add or Workout Library
5. **View Progress**: 📈 Dashboard & Trends tabs

### Food Library Tips:

- **Search** to find foods quickly
- **Sort by Macro Match** to see foods that fit your remaining macros
- Foods are stored per-100g or per-serving for accuracy

### Data Safety:

- App auto-backs up weekly to `fitness-tracker-backup.json` in Downloads
- Keep this file safe - it's your data recovery!
- Import via ⚙️ Settings → Import Data

## 🛠️ Technical Stack

- **Frontend**: Vanilla JavaScript (no frameworks)
- **Storage**: IndexedDB (client-side)
- **Charts**: Chart.js
- **AI**: Claude API (user's API key)
- **Offline**: Service Worker with cache-first strategy
- **Mobile**: PWA manifest with standalone display

## 📦 Project Structure

```
fitness-tracker-pwa/
├── index.html              # App shell (SPA)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/                    # Styles (dark mode default)
├── js/
│   ├── app.js              # Main controller
│   ├── db.js               # IndexedDB wrapper
│   ├── api.js              # Claude API integration
│   ├── ui.js               # UI utilities
│   ├── components/         # UI components
│   └── utils/              # Helper functions
└── img/icons/              # PWA icons
```

## 🎯 Data Import

Includes `foodyou-import.json` with 413 food entries converted from FoodYou app. Import via Settings to populate your food library with your history.

## 🧪 Vibe-Coded

This entire app was built through conversational coding with **Claude Code** - no traditional planning docs, just vibes and iteration. Features were added organically based on real usage needs:

- Started with basic macro tracking
- Added measurements when needed
- Workouts came next
- AI integration for convenience
- Search & sorting for usability
- Data persistence after discovering clearing history wiped everything

The result? A fully-featured fitness PWA built entirely through natural language prompts. No frameworks, no boilerplate, just pure vibe-driven development. ✨

## 📝 Version

**Current**: v2.7.9
- **Fix pacing mode stopping after 2 announcements**: pacing announcements now run in the native Java `onLocationChanged()` callback (same as km milestones) via a new `setPacingMode()` JavascriptInterface — JS `setInterval` was getting suspended by Android when the screen locked, which is why the 3rd announcement only appeared on unlock

**v2.7.8**
- **Fix run showing 0 km**: `finishRun()` now falls back to native GPS distance (`nativeTotalDistKm`) when JS BGL distance is 0 — happens when the screen stays locked during a run and the background geolocation plugin doesn't update the JS-side counter; native `getNativeElevation()` now also returns `distKm` in its JSON payload

**v2.7.7**
- **Fix pacing mode stops after 2 updates**: replaced the sliding-window `recentPoints` array approach with a simple distance-delta snapshot — records `totalDistKm` at the start of each 30 s window and divides the delta by elapsed time; no array filtering or stale-reference issues
- **Fix Updates button color**: "Updates: On" now shows highlighted (active color) and "Updates: Off" shows dim, matching the pacing button convention

**v2.7.6**
- **Fix label scan flow**: label photos now open the macro form directly in per-100g mode with the AI's per-100g macros pre-filled; "Add to library" is pre-checked and "Mark as eaten" is unchecked (added as planned/not eaten); grams field defaults to 100 for per-100g labels or the serving size for per-serving labels so the library normalises correctly; product name left blank if AI couldn't identify the food; the intermediate "how many grams did you eat?" prompt has been removed

**v2.7.5**
- **Run elevation tracking**: GPS altitude accumulated with 3 m noise filter during run; ↑ gain / ↓ loss displayed in run overlay when non-zero; ACSM calorie formula extended with grade correction (uphill gain increases calorie burn); native GPS listener also tracks elevation screen-off and exposes it via `getNativeElevation()` for accurate final calorie save
- **Pacing mode**: toggle button in run overlay; when on, announces current windowed speed (last 30 s of GPS fixes) every 30 s via TTS (vs. overall average); persists across runs in `localStorage`
- **Silent mode**: toggle button to suppress 500 m milestone announcements; persists across runs; flag propagated to native side via `setSilentMode()` so screen-off announcements are also suppressed
- **Earpiece tap → on-demand update**: volume UP or DOWN key press during a run (including with screen off) triggers an immediate position/pace/time announcement instead of changing volume; implemented via `onKeyDown()` override in `MainActivity.java`

**v2.7.4**
- **Fix live bundle updates**: eliminated the unreliable "Restart & Update" dialog — updates now auto-apply immediately after download (CU.set + window.location.reload); if a GPS run is active the bundle is queued via CU.next() for next launch; a "✨ Updated to vX.Y.Z" toast confirms the reload; re-checks on app foreground (at most once per 10 min)
- **Fix version display**: settings version string now reads from APP_VERSION constant (was hardcoded "v2.7.0" in HTML regardless of actual bundle)

**v2.7.3**
- **Fix Groq model**: updated from decommissioned `llama-3.2-11b-vision-preview` to `meta-llama/llama-4-scout-17b-16e-instruct` (Llama 4 Scout); display name updated to "Llama 4 Scout (Groq)"
- **iOS build scripts**: added `scripts/ios-setup.sh` (one-time MacBook setup), `scripts/ios-build.sh` (Xcode archive + IPA export), `scripts/ios-server.py` (local HTTP build server: POST /build, GET /status, GET /download), `scripts/trigger-ios-build.sh` (trigger remote build and download IPA from dev machine), `scripts/ExportOptions.plist.template`

**v2.7.2**
- **Setup wizard: weight goal step**: added step 4 (of 5) with a slider from −2 to +2 lbs/week in 0.5-lb increments; each lb/week = ±500 kcal/day deficit or surplus applied to TDEE; the targets screen shows the adjusted goal calories and the reasoning (e.g. "Lose 1 lb/week — TDEE 2450 − 500 = 1950 kcal/day")

**v2.7.1**
- **TTS audio clipping fix**: native Android layer now holds audio focus and plays a silent AudioTrack for the entire run duration, keeping the hardware DAC warm; TTS announcements are issued immediately (50ms safety margin) instead of the previous 500ms pre-warm delay; APK rebuild required
- **Macro entry per-gram mode**: "per 100g" mode renamed to "Enter macros by grams" — enter the macro values for whatever gram amount your label shows (e.g. 75g), then type that gram count in the "Grams" field; calories auto-calc shows context ("for 75g / 200 per 100g"); no pre-scaling on save; library add normalises to per-100g correctly
- **Food library form**: removed fiber field; calorie field is now editable with auto-fill from macros (same pattern as main macro entry form); manual override is preserved on save

**v2.7.0**
- **Multi-provider AI**: Settings → AI Provider lets you pick Gemini Flash (Google, free), GPT-4o mini (OpenAI, paid), Claude Haiku (Anthropic, paid), or Llama Vision (Groq, free); each provider's API key is stored separately so switching doesn't require re-entry; existing Gemini key migrates automatically
- Anthropic note: Claude.ai Pro/Max subscriptions do not include API access — a separate Anthropic API account is required

**v2.6.10**
- **Run workout display**: Outdoor Runs now show "10.5 km at 7.4 mph (54:15)" instead of raw decimal minutes and min/mile pace; distance_km is now stored on the workout entry; all other Cardio workouts also switch to mm:ss duration format

**v2.6.9**
- **Fix streak/indicator ignoring workout credit**: today's indicator now uses the effective calorie goal (already computed, includes workout credit + PI adjustments) instead of the raw stored base goal; past-day streak uses pi_goal_history per-date goals where available

**v2.6.8**
- **Streak indicator for planned day**: dashboard now shows "✓ on track / ↓ under / ↑ over" next to streak counter based on completed + planned calorie total vs goal
- **Food library: merge duplicate adds**: tapping Use on the same food twice increments servings on the existing planned entry instead of creating a duplicate; undo toast shows "×N" count
- **Settings slider scroll fix**: touching a range slider blurs any focused text input, preventing the page from scrolling back to it
- **Run recovery after WebView reload**: run state is persisted to localStorage every 30s and on pause/resume; on app load a "Resume run in progress" banner appears if a recent run is detected; tapping it restores the overlay with correct distance/time and reconnects JS GPS without disturbing native tracking

**v2.6.7**
- **Auto-backup off by default**: removed the legacy "default on if prior backup exists" logic; toggle is now strictly opt-in
- **APK update download button fixed**: was using a relative `<a href download>` which resolves to `capacitor://localhost/...` inside the WebView and does nothing; replaced with `window.open(absoluteUrl, '_system')` which hands off to the system browser

**v2.6.6**
- **Fix TTS clipping (take 2)**: replace `playSilentUtterance` (unreliable — Google TTS treats it as a timer, never wakes hardware) with `postDelayed(500ms)` after `requestAudioFocus`; also fix `onDone` releasing audio focus after the prewarm silence instead of after real speech

**v2.6.5**
- **Fix TTS clipping on cold audio** (native): prepend 300ms silent utterance before each TTS announcement so the audio hardware stream is open before speech starts — fixes first word being cut off when screen is locked and no music is playing

**v2.6.4**
- **Library UX overhaul**: food and workout library modals stay open after adding — tap Use/Add multiple times without reopening; stacking fade-out undo toasts appear bottom-of-screen for each add
- **Star workouts**: star button on workout library items; starred workouts sort to top; uses `starred_exercises` setting
- **Wider Use/Add buttons**: min-width 72px (~2× previous)
- **Fix entry_mode/serving_label not persisted**: db.js was dropping these fields from macro entries

**v2.6.3**
- **Macro form**: "Mark as planned"→"Mark as eaten" (default planned); "Don't save to library"→"Add to food library" (default off); added "Macros are per 100g" checkbox with weight input that scales macros on save and stores as per_gram in library

**v2.6.2**
- **Macro form**: serving moved below meal name; fiber field removed

**v2.6.1**
- **Macro form redesign**: removed mode toggle and More options collapsible; checkboxes now always visible above meal name; description box removed; serving label added (free text like "1 cup", "200g"); calories field auto-populates from macros, manual entry switches to calorie-only mode
- **Fix goalCalories ReferenceError** on dashboard first load

**v2.6.0**
- **Calorie-only mode** (Phase 5): new "Tracking mode" setting; macro form has Macros/Calories-only toggle; calorie-only entries show as grey "unallocated" segment in dashboard calorie bar; calorie-only badge in food library
- **Undo toast on delete** (Phase 3): all delete operations now immediately delete + show 5-second Undo toast instead of confirm dialog
- **Collapsible settings sections** (Phase 3): each settings section h3 is now a clickable toggle; state persisted in localStorage
- **Auto-adjust daily targets rename** (Phase 3): "PI Controller" label renamed to "Auto-adjust daily targets" with plain-english description
- **Cheat-day label shows date** (Phase 3): toggle label shows "(Today)" or "(May 30)" so it's clear which date it applies to
- **Macro form: "More options" disclosure** (Phase 3): "Don't save to library", "Save as per-100g", "batch recipe" collapsed behind ▸ More options
- **Trend chart annotations** (Phase 4): tap any date on the weight or calorie chart to add/edit a note; shown as yellow dotted vertical line with label
- **Streak counter** (Phase 4): "🔥 X day streak" shown on dashboard for consecutive on-target days (90–110% of calorie goal)
- **Recent food sort** (Phase 4): food library has new "Recent" sort option (by last used date)
- **Auto-backup toggle** (Phase 2): Data Management settings section now has an "Auto-backup weekly" toggle; default on for existing users, off for new
- **Magic numbers → constants.js** (Phase 2): extracted GOAL_HISTORY_DAYS, GPS_WEAK_SIGNAL_TIMEOUT_MS, GPS_MAX_POINT_JUMP_KM, MIN_RUN_FINISH_DIST_KM, KCAL_PER_LB_FAT, MACRO_INTENSITY thresholds
- **Cheat-day interval fix** (Phase 2): replaced 1s polling with one-shot setTimeout to next midnight + visibilitychange reschedule
- **onerror filter** (Phase 2): global error modal now only fires for app's own script errors, not third-party/image-load errors

**v2.5.16**
- **Fix workout credit in macro delta chart and dashboard** (`chart-renderer.js`, `app.js`): both were reading `workout_credit_fat/protein/carbs` as boolean flags (old setting names) instead of `workout_credit_*_weight` as numeric weights — caused the macro delta chart and planned-credit preview to compute a different distribution than the actual effective goal
- **Remove duplicate `validateMacros`** (`calorie-calc.js`): dead positional-arg version deleted; the object-arg version in `validation.js` is the only one used
- **Debounce `pi_goal_history` DB writes**: `calculateEffectiveGoals` was writing goal history on every screen navigation; now skips the write when the serialised history hasn't changed

**v2.5.15**
- **Run display/TTS consistency**: During-run display now shows mph (matching the mid-run voice announcements); finish TTS says mph instead of min/km pace

**v2.5.14**
- **Run finish display**: After finishing, the middle stat switches from min/km pace to mph speed, matching the during-run layout (distance, duration, speed, calories) and dropping the redundant summary grid

**v2.5.13**
- **Setup Wizard**: New guided walkthrough (Settings → Help) collects sex, age, height, and weight; calculates TDEE via Mifflin-St Jeor BMR × 1.2; recommends protein (1.0 g/lb male, 0.8 g/lb female), fat (25% TDEE male, 30% female), carbs to fill remaining calories; saves macro goals and a weight measurement; replaces Quick Start Guide as the first-visit prompt for new users

**v2.5.12**
- **Accurate run calories**: Switch from fixed MET=9 to ACSM speed-dependent formula (MET = (0.2 × speed_m_per_min + 3.5) / 3.5); fixed MET was systematically low for any pace faster than ~7 min/km
- **TTS audio ducking**: Request `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` before each announcement so music/podcasts lower while the coach speaks, then restore; volume set to 1.0 (APK rebuild)
- **TTS on screen lock**: Add `onStop()` override alongside `onPause()` — Android 9+ calls both when screen locks (APK rebuild)
- **Run time display**: Round `duration_minutes` to 2 decimal places in workout history list

**v2.5.1**
- **Fix run calorie calculation**: Use `db.getLatestWeight()` (which respects lbs/kg unit preference) instead of blindly applying a lbs→kg conversion; previously treating a kg weight as lbs halved the calorie estimate

**v2.5.0**
- **TTS while screen locked**: Override `MainActivity.onPause()` to keep the WebView running during active runs so GPS callbacks and TTS fire while the screen is locked (APK rebuild)

**v2.4.15**
- **Fix update loop / mid-session flash**: APP_VERSION constant in JS replaces CU.current().bundle.version (which unreliably returned 'builtin' causing false version detection); "Restart & Update" now uses CU.next() + App.exitApp() instead of CU.set(), preventing mid-session webview reloads during GPS acquisition

**v2.4.14**
- **Run tracker GPS robustness**: distanceFilter changed from 0 to 1 m (avoids plugin edge case); 30-second fallback enables Start with "weak GPS" warning if accuracy never reaches ±30 m; weakSignalTimer cleared cleanly on finish/close

**v2.4.13**
- **Run tracker TTS at 500 m intervals**: announces distance (km), elapsed time, and speed in mph at every 0.5 km; replaces per-km-only announcements

**v2.4.12**
- **Run tracker GPS pre-acquisition**: GPS starts immediately when "Go for a Run" is tapped; "Start Run" button stays disabled until signal reaches ±30 m accuracy, then enables for manual start

**v2.4.11**
- **Fix infinite update loop**: localStorage guard (`fp_update_handled`) prevents re-downloading a bundle that's already been queued; cleared automatically when a newer version appears; APK rebuild required to escape the 2.4.9↔2.4.10 loop

**v2.4.10**
- **Remove iOS coming-soon note**: Settings now only shows Android APK download

**v2.4.9**
- **Default food library**: 36 common foods seeded on first launch (eggs, egg whites, chicken, salmon, oats, fruits, vegetables, nuts, etc.); existing users unaffected
- **Healthy Tips modal**: populated with actual content (permanent diet change, tracking, exercise vs weight loss, no ultra-processed foods)

**v2.4.8**
- **Fix update check CORS**: manifest fetch now uses CapacitorHttp (native) on Android, bypassing the CORS block that caused "Failed to fetch" for fitness-pizza.com; live bundle — no APK reinstall needed

**v2.4.7**
- **Native camera fix**: "Take Photo" and "Take Label Photo" now use @capacitor/camera on Android instead of `<input capture>` (which only opened the gallery); APK reinstall required

**v2.4.6**
- **Better update check error message**: "Failed to fetch" now shows "Could not reach server — check your connection" instead of the raw JS error

**v2.4.5**
- **Fix native version**: build.gradle versionName now matches JS version (was stuck at "1.0", causing update checks to always compare against wrong baseline)
- **Update check visible errors**: failures now surface as errors when triggered manually; logs native/current/latest versions to console
- **"Check for Updates" button**: added to Settings → About (native only) so update check can be triggered manually and failures are shown

**v2.4.4**
- **Export**: gzip-compressed (.json.gz); native APK uses @capacitor/filesystem + @capacitor/share to open the Android share sheet (Save to Downloads, Drive, email, etc.); browser triggers a direct .gz download

**v2.4.3**
- **Live update prompt**: after silently downloading a JS bundle, shows "Update Available — Restart & Update / Later" modal; restart applies immediately via CU.set(), Later queues for next launch

**v2.4.2**
- **Export fixed**: loading spinner while exporting; toast confirmation on success; `<a>` appended to DOM before click (browser download fix); native path now checks `canShare({files})` and falls back to text share then clipboard

**v2.4.1**
- **Feedback email**: updated to Frank@fitness-pizza.com

**v2.4.0**
- **Icon rescaled**: pizza slice scaled to 75% so it fits cleanly inside the circular launcher icon mask
- **Swipe animation**: finger-following slide transition with ghost preview of the next tab; vertical scroll is no longer mis-detected as a swipe
- **Feedback button**: opens a mailto: link directly to the domain owner's email

**v2.3.9**
- **Export fixed on native**: uses `navigator.share()` with a file on Android/iOS instead of `<a download>` which is silently ignored in WebViews
- **Android launcher icon**: all mipmap icon sizes regenerated from new logo SVG (fig & prosciutto pizza)

**v2.3.8**
- **Status bar overlap fixed**: `viewport-fit=cover` + `env(safe-area-inset-top)` padding on header so content no longer hides behind the Android/iOS status bar
- **Import loading modal**: shows "Reading file…" / "Importing…" spinner during data import
- **Swipe navigation**: swipe left/right on main content to switch between tabs
- **Auto-refresh tabs**: any save (food log, workout, measurement, run finish) now dispatches `fp:data-changed` which refreshes the current tab immediately — no more manual refresh needed
- **Run tracker centred**: stats now vertically centred on screen with larger fonts (distance 7.5em, stats 2.2em); updates every 500ms
- **Native app logo**: redesigned as a fig & prosciutto pizza with arugula garnish — richer colour palette with purple figs, rose prosciutto, and golden cheese

**Previous**: v2.3.7
- **Capacitor native app**: wraps the PWA in a native Android/iOS shell so GPS keeps running while the screen is locked — the limitation that caused the run tracker to be removed in v2.3.0
- **Run Tracker**: new "Go for a Run" button appears in the Workouts tab when running inside the native app; tracks distance, duration, pace, and calories in real-time; announces each kilometre via text-to-speech; auto-saves the run as a Cardio workout on finish
- **Native app download**: Settings → Help & Feedback now shows an Android APK download link and an iOS TestFlight placeholder; see `BUILD.md` for build instructions
- **Capacitor setup**: `package.json`, `capacitor.config.json`, and `BUILD.md` added; `www/` directory generated on demand by `npm run prepare-web` (gitignored)

**Previous**: v2.3.6
- **Fix Easter egg long-press (#3/#4)**: 12px drift tolerance so natural finger wobble no longer cancels the hold; suppress the click that fires on release so the form does not open; `-webkit-touch-callout:none` on FABs so iOS callout does not steal the event
- **Fix Easter egg unicorn typer (#7)**: replaced deprecated `keypress` with `keydown`, broadened input selector to match all `input`/`textarea` elements

**Previous**: v2.3.5
- **Easter eggs**: 7 hidden surprises involving bunnies, rainbows, and unicorns (try the Konami code, long-press the FABs, tap Today 4×, triple-click the 🍕, ...)

**Previous**: v2.3.4
- **Duration accepts MM:SS**: cardio duration field is now free-text; accepts `30` (minutes), `5:55` (MM:SS), or `1:05:30` (H:MM:SS); stored as decimal minutes; edit mode displays back as MM:SS
- **Help & Feedback section in Settings**: new top section with Quick Start Guide, Healthy Tips (TBD), and Submit Feedback button (Tally.so)
- **Quick Start Guide modal**: auto-shows on first ever visit; covers goals, food logging, workouts, measurements, trends, and PWA install

**Previous**: v2.3.3
- **Redesigned logo**: tip-down pizza slice with cheese drip, 3-pepperoni triangle arrangement, clean crust arc with blisters/bubbles, bold gradients — no displacement-map filters so it looks sharp at all sizes
- **Fix pace input keyboard**: changed `inputmode` from `decimal` to `text` so the mobile keyboard includes the colon key for `5:30` format entry

**Previous**: v2.3.2
- **Pace unit toggle cycles through all modes**: button now cycles `min/mi → min/km → mph → km/h`; bare-number values in the field are converted to the equivalent in the new mode when toggling

**Previous**: v2.3.1
- **New pizza slice logo**: redesigned icon to show a realistic pepperoni pizza slice with layered crust, sauce, melted cheese, and pepperoni; rendered as SVG and exported to PNG icons
- **Domain**: app is now live at [fitness-pizza.com](https://fitness-pizza.com)

**Previous**: v2.3.0
- **Remove GPS run tracker**: removed "Go for a Run" feature; `speechSynthesis` cannot work when screen is locked in mobile browsers, making the feature unusable
- **Flexible cardio input**: pace field now accepts multiple formats — `8:30` (MM:SS colon format), `6.5 mph`, `10 km/h`, `5 km`, `3.1 mi`; bare numbers are interpreted in your current pace unit (min/mi or min/km); distance inputs use duration to compute pace automatically
- **Arbitrary precision**: removed step constraints on duration and reps inputs; accepts any floating-point value

**Previous**: v2.2.6
- **Notification vibration**: lock-screen notifications now include a haptic vibration pattern so you feel the update even on silent mode
- **Zero-stats handling**: notification body shows "GPS acquiring…" instead of "0 km · 0 mph" when no movement has been detected yet

**Previous**: v2.2.5
- **Lock-screen notifications for run announcements**: requests Notification permission on first Start tap; when screen is locked sends a service-worker notification to the lock screen ("🏃 3 mins · 0.48 km · 5.9 mph avg"); TTS still used when screen is on

**Previous**: v2.2.4
- **Screen Wake Lock for TTS**: requests screen wake lock on Start tap so the screen stays on and speech synthesis is never suspended by the OS; shows "🔆 Screen kept on" / "⚠ Keep screen on for audio" status; re-requests on tab visibility restore

**Previous**: v2.2.3
- **TTS audio fix**: replaced intermittent silent-ping AudioContext with a continuous silent oscillator (gain 0.001, freq 0) — audio pipeline never drops between pings; AudioContext is also resumed in _speak for extra resilience
- **Run started confirmation**: "Run started." is spoken when Start is tapped, priming the speech engine and confirming audio is working before you lock the screen
- **GPS runs saved as completed**: runs from the tracker are now marked completed (not planned) when saved

**Previous**: v2.2.2
- **TTS with screen locked**: AudioContext silent-ping loop started on first Start tap maintains audio session so speech announcements continue when screen is off (Android Chrome; best-effort on iOS)
- **TTS clipping fix**: announcements now begin with "Update." so the first real word isn't cut off by the speech engine spin-up

**Previous**: v2.2.1
- **GPS runs excluded from workout library**: run-tracker entries (identified by distance_km field) are filtered out of the library listing

**Previous**: v2.2.0
- **Run tracker calorie accuracy**: replaced lookup-table MET with the same linear formula (`1.5×mph + 1.0`) used by the workout form — live display and logged calories now agree; ~15% more accurate at typical running speeds
- **Decimal duration**: run durations now stored with seconds precision (e.g. 5:30 → 5.5 min); duration input accepts decimals; calorie formula uses full precision

**Previous**: v2.1.80
- **Fix SW cache**: added run-tracker.js to STATIC_ASSETS so the service worker installs cleanly and triggers the update prompt

**Previous**: v2.1.79
- **GPS Run Tracker**: "Go for a Run" button on the workout tab opens a full-screen GPS run tracker with real-time distance (km + mi), avg speed (mph), avg pace (min/km), and calorie estimate; TTS announces stats every minute; pause/resume support; auto-fills workout form on finish with GPS-derived pace and distance

**Previous**: v2.1.78
- **Pace unit preference**: cardio pace field now supports min/km via a toggle button; preference is saved and remembered across sessions (internally always stored as min/mi)

**Previous**: v2.1.77
- **Workout credit macro weighting**: replaced binary checkboxes with weight sliders (0–100) per macro; a live stacked bar shows the proportional split; calories are distributed according to the weights rather than proportional to base goals

**Previous**: v2.1.76
- **Body fat trend line draws on top**: trend line now renders above scatter dots on body composition chart
- **Body composition chart 60% taller**: aspectRatio changed from 2 to 1.25
- **PI controller insulated from setting changes**: both P-term and I-term now use stored displayed goals for past days, so changing workout credit settings no longer retroactively alters past error signals

**Previous**: v2.1.75
- **Body fat dot plot on weight/lean mass chart**: TDEE/BMR line replaced with body fat % scatter (colored by method: Manual/orange, Navy/blue, JP3 Caliper/green) plus a dashed linear trend line fit over the last 14 days of measurements

**Previous**: v2.1.74
- **Fix PI workout credit for past days**: completing a planned workout no longer moves it to today's date, so the PI controller correctly attributes workout credit to the day the workout was on; PI controller now only counts completed (not planned) workouts when computing past-day reference goals

**Previous**: v2.1.73
- **Cheat day progress bars**: all macro and calorie bars show exactly 100% full on cheat days; calorie bar preserves macro ratios; right labels read "Cheat Day" instead of Xg left/over

**Previous**: v2.1.72
- **Cheat day** replaces reverse diet: marking a day as cheat day zeroes its contribution to the PI controller (goal = actual intake, error = 0) instead of inflating goals by 20%; TDEE and calorie display unaffected

**Previous**: v2.1.71
- **Normalize-to-100g daily entry fix**: 100g mode now correctly logs the normalized (per-100g) values to the plan, not the raw scan weight values
- **Plan intensity respects planned workout credit**: macro items no longer turn red prematurely when planned workout credit expands the macro budget

**Previous**: v2.1.70
- **Macros vs Next-Day Weight Change chart**: added fat, carbs, and calories datasets alongside protein as separate colored scatter series

**Previous**: v2.1.66
- **Workout check-off stamps current time/date**: completing a planned workout from dashboard updates its timestamp to now
- **Planned workout credit on progress bars**: bars compress left to show potential macro budget extension (right of 100% mark) when there are planned workouts; disappears when workouts are completed

**Previous**: v2.1.64
- **Fix import data loss**: body_fat measurements were rejected by import validation (only weight/waist were accepted); exercise_library and workout_templates were excluded from the validation pass and silently dropped on partial imports

**Previous**: v2.1.63
- **Library workouts default to planned**: workouts added from the library are now saved as planned, consistent with manual entry

**Previous**: v2.1.62
- **Workouts default to planned**: new workouts are saved as planned (unchecked) and must be checked off to earn calorie/macro credit
- **Dashboard check button matches food style**: workout ✓ button is now the same green circle as food items
- **Planned workout preview**: incomplete workouts on dashboard show estimated calorie burn and expected macro credit gains

**Previous**: v2.1.61
- **No macro credit for incomplete workouts**: workout calorie credit toward macro goals now only counts completed workouts

**Previous**: v2.1.60
- **Fix workout check button on dashboard**: button now matches food item style (only shown on planned items, same ✓ appearance); completed workouts cannot be unchecked from dashboard — use the Workouts tab

**Previous**: v2.1.59
- **Workout check-off on dashboard**: workout items show ✓ button on dashboard; planned workouts appear dimmed; only completed workouts count toward calories burned

**Previous**: v2.1.58
- **Revert workout system to simple form + add check-off**: restored original exercise name/type/reps/duration form with MET-based calorie estimate; workout entries now have a checkbox to mark completed/planned like food items; removed sets, templates, and exercise library

**Previous**: v2.1.57
- **Fix exercise edit from library**: Edit button now opens the exercise form directly instead of reloading the full list; exercise form now has a Default Calories Burned field; picking from library pre-fills calories

**Previous**: v2.1.56
- **Template calories + daily backup**: each exercise in a template now has a calories field that carries through when the template is applied; auto-backup changed from weekly to daily

**Previous**: v2.1.55
- **Fix edit form calories**: calories input now pre-fills with stored value when editing; auto-estimate only runs for new entries

**Previous**: v2.1.54
- **Fix import duplication**: import now clears all existing data first (restore semantics, not merge) — importing a backup no longer creates duplicate entries

**Previous**: v2.1.53
- **Workout calories input**: calories burned field is now an editable number input that auto-estimates from sets but can be manually overridden; calories shown on every workout card; removed old-style quick-add past workouts from Library (exercises and templates only)

**Previous**: v2.1.52
- **Workout Tab Revamp — Sets, Templates & Exercise Library**: added per-set tracking with circular check-off buttons showing N/M progress; exercise library with type-filtered picker; workout templates to apply a set of exercises at once; revamped workout form with "From Library" button, per-set rows for Lifting/Core (reps+weight) and Cardio (duration+pace), and backward-compatible legacy display for old entries; tabbed Workout Library modal showing both exercise library and templates; DB upgraded to version 2 with `exercise_library` and `workout_templates` stores

**Previous**: v2.1.51
- **TDEE inference: longer windows, prefer farthest valid pairing**: minimum window raised from 5 → 14 days; maximum from 60 → 90 days; algorithm now picks the *longest* valid window per endpoint rather than the shortest — this dramatically reduces water-weight noise (which is ~constant regardless of window length) relative to the real fat-change signal (which grows linearly with time)

**Previous**: v2.1.50
- **Label scan: normalize checkbox in macro form**: the per-100g normalize checkbox now appears in the editable macro form after a label scan (not a separate read-only review modal), so name and values can be edited before saving; when checked, the food is saved to the library as a per-100g `per_gram` item instead of per-serving

**Previous**: v2.1.49
- Initial normalize-to-100g checkbox (in a separate review modal, now replaced by v2.1.50)

**Previous**: v2.1.48
- **Label scan: derive carbs from calorie balance**: instead of using the label's reported total carbohydrates (which can be skewed by rounding and fibre subtraction), carbs are computed as `(calories − fat×9 − protein×4) / 4`; dietary fibre is no longer recorded from label scans
- **Max ">>" button: gram-precision for per-100g foods**: for food library items stored in per-100g format the max button now floors to 2 decimal places (nearest 0.01g) rather than whole servings, with a 0.01g minimum

**Previous**: v2.1.47
- **Fix: calorie balance averages exclude today**: today is still in progress so including it skewed the averages; stats row now only averages completed past days

**Previous**: v2.1.46
- **Calorie balance chart: period averages**: text row below the chart shows avg intake, avg burned, avg net, and goal over the displayed period
- **Food library per-100g entry: reference grams**: when entering a food in per-100g format, a "Ref. grams" field lets you input macros for a different serving size (e.g. 25g) and the system auto-normalises to per-100g on save; calorie display previews both the reference-serving calories and the resulting per-100g calories

**Previous**: v2.1.45
- **Fix: date navigation reliability**: prev/next-day buttons now use local-noon date arithmetic (T12:00:00 pattern) so month/timezone boundaries are handled correctly; screen title date display now correctly shows the local calendar day instead of the UTC day (which was off by one in UTC-N timezones, making navigation look broken)
- **Fix: macro list resilience**: individual named-food lookups in the serving-badge pre-fetch are now wrapped in try/catch so a single lookup failure no longer aborts the entire macro list render

**Previous**: v2.1.44
- **Fix: macro tab serving badges now actually visible**: previously used unreliable food_description field; now looks up the named food via food_id at render time and shows a proper food-format-badge (same colored label as the food library) — "per 100g", "1 scoop", "12 servings/batch" etc.

**Previous**: v2.1.43
- **Macro tab: check off all servings at once**: tapping the checkbox now marks the entire entry as complete regardless of serving count (previously peeled off one serving at a time)
- **Macro tab: show serving size info**: food entries now display their serving description (e.g. "150 g", "2 1 scoop", "3 servings") as a small subtitle next to the meal name when the field is present (set automatically when logging from the food library)

**Previous**: v2.1.42
- **Chart height increases**: Inferred TDEE chart is 60% taller (aspectRatio 1.25 vs default 2); macro delta and macro correlation scatter charts are 33% taller (aspectRatio 1.5); simpler charts (calorie balance, weight trend, workout volume) unchanged

**Previous**: v2.1.41
- **Fix: inferred BMR always ≤ inferred TDEE**: BMR rolling avg and overall mean are now computed over the exact same window as TDEE (BMR = TDEE − workout contribution at each window), eliminating the apples-to-oranges comparison that occurred when averaging BMR and TDEE over different subsets of estimates

**Previous**: v2.1.40
- **Inferred BMR from workout data**: the Inferred TDEE chart now also plots an inferred BMR line computed as `BMR = TDEE − avg_workout_cals_per_day` for each measurement window; the 14-window weighted rolling average and overall mean BMR are displayed; tooltip shows per-window BMR alongside TDEE; stats block shows both inferred TDEE and inferred BMR (with comparison to formula BMR); no activity factor is used — the BMR/TDEE split is derived purely from logged workout data

**Previous**: v2.1.39
- **Inferred TDEE chart tweaks**: rolling average widened from 4-window to 14-window for a smoother trend line; formula BMR is now always plotted as a separate reference line (red dashed); formula TDEE shown additionally when activity factor is set (orange dashed)

**Previous**: v2.1.38
- **Inferred TDEE chart in Trends**: empirically estimates your TDEE from energy balance — for each consecutive pair of weight readings ≥5 days apart, computes `TDEE = (scaled_intake − ΔW_lbs × 3500) / days`; plots individual estimates sized by window length, 4-window weighted rolling average, overall weighted mean, and formula TDEE reference line; stats block shows mean ± std-dev, avg window length, % days logged, and weight trend rate

**Previous**: v2.1.37
- **Fix: workout credit marker on dashboard now per-macro**: the cyan dashed line only appears on progress bars for macros that actually receive workout credit; the marker position is computed per-macro from the credit grams returned by calculateEffectiveGoals

**Previous**: v2.1.36
- **Workout Credit settings**: new Settings section lets you set what fraction of workout calories to apply (0–100% slider, default 50%) and choose which macros receive the credit (Protein / Carbs / Fat checkboxes, all on by default); credit is distributed proportionally among selected macros only; PI controller and macro over/under chart both honor the same settings

**Previous**: v2.1.35
- **Fix: macro over/under chart now accounts for workout credit**: `renderMacroDelta` previously used static goal values; now builds a per-day workout-calories map and adjusts goals the same way `calculateEffectiveGoals` does, so bars reflect your actual workout-credited targets
- **Label scan: add camera option**: "📋 Take Label Photo" button now captures directly from camera alongside the existing "🖼️ Label from Gallery" option

**Previous**: v2.1.34
- **Fix: past-day dashboard showed today's data**: dashboard.js used `getTodayDate()` instead of `this.currentDate`, so navigating to a past date always showed today's macros/workouts in the progress bars; now passes the selected date as an explicit parameter

**Previous**: v2.1.33
- **Fix: activity slider now updates "Fill carbs to" target**: moving the slider always pushes the new TDEE into the target kcal input; typing a custom value still works as before

**Previous**: v2.1.32
- **Fix phantom user_weight_lbs**: `user_weight_lbs` setting was never written anywhere — TDEE display and workout calorie estimator both read it but it was always 0/154; TDEE now uses 7-day rolling average of logged weight measurements (same source as the chart); workout calorie estimator uses most recent logged weight with 154 lb fallback

**Previous**: v2.1.31
- **Activity factor slider + macro planner**: Settings → Body Stats now has an activity factor slider (1.2–1.9) replacing the old 5-row TDEE table; shows BMR and TDEE on one line; stored as `tdee_activity_factor`
- **Fill-carbs helper in Daily Goals**: "Fill carbs to [kcal] Apply" row appears in the Goals section once TDEE is computable; protein and fat are fixed, carbs auto-computed as remainder and saved directly to goals; shows error if protein+fat exceed target
- **Chart axis**: body composition chart third axis auto-labels as "TDEE (kcal)" when activity factor is set, "BMR (kcal)" otherwise

**Previous**: v2.1.30
- **BMR chart: remove activity factor**: body composition chart third axis now shows raw Mifflin-St Jeor BMR (kcal) instead of TDEE × 1.55; label updated from "TDEE (kcal, moderate)" to "BMR (kcal)"

**Previous**: v2.1.29
- **TDEE + BMI trends on body composition chart**: the Weight & Lean Mass chart now has three Y-axes — lbs (left), BMI (right, dashed amber), BMR/TDEE (right, dashed red); computed from Mifflin-St Jeor using height/age/sex from Settings; axes hidden when body stats not yet entered

**Previous**: v2.1.28
- **Fix workout credit bug**: `calculateEffectiveGoals` was called without a date argument, causing `getWorkoutsByDate(undefined)` to return all workouts ever logged — inflating the calorie credit by an arbitrary factor

**Previous**: v2.1.27
- **Label OCR**: new "📋 Scan Label" button in the photo modal — takes a photo of any nutrition label and pre-fills the macro form with transcribed values; per-100g labels prompt for grams eaten before scaling; error modal with Retry on failure
- **Macro correlation chart**: new "Protein vs Next-Day Weight Change" scatter chart in the Trends tab; plots daily protein intake against overnight weight delta; shows "Need more data" until 3+ consecutive weight days exist
- **Dashboard component extract**: `loadDashboard()` extracted to `js/components/dashboard.js` for better code organization

**Previous**: v2.1.26
- **Planned item highlight threshold**: no tinting when overage ≤5g; ramps linearly from transparent to full highlight intensity as overage goes from 5g to 10g; full behavior above 10g

**Previous**: v2.1.25
- **Mini macro bars**: labels simplified to net delta only (`+4.2g` over / `-7.1g` under), wider bar area
- **Planned item danger highlighting**: when any macro is over target, planned food items are tinted in `--accent-danger` with intensity proportional to how much that item alone covers the overage (full saturation = removing 1 serving resolves it; no tint = removing it entirely has no effect)
- **Contrast fix**: dashboard over-target labels now use `var(--accent-danger)` instead of hardcoded `#ff4444` so all themes render correctly

**Previous**: v2.1.24
- **Macro bars actually turn red**: `--danger-color` → `--accent-danger` (the correct CSS variable name); bars now visibly go red when completed + planned total exceeds the goal
- **Photo AI retry modal**: when the API call fails, a modal now appears with the error message and a Retry button to re-run the same photo/context without re-selecting the image; Cancel dismisses

**Previous**: v2.1.23
- **Photo AI loading modal**: "Analyze Photo" now closes the photo modal immediately and shows a full-screen loading overlay (spinner, "Analyzing photo…", Cancel button, grey backdrop at z-index 10000) while the API call is in flight; Cancel stops the flow cleanly before the macro form opens
- **Macro bars red when planned goes over**: fixed string-coercion bug in `reduce` (changed `m.fat || 0` to `parseFloat(m.fat) || 0`) so planned entries reliably trigger red bars when total exceeds goal

**Previous**: v2.1.22
- **Photo AI fixes**: AI estimates now open a "Save Entry" form instead of "Update Entry" — fixed by gating edit mode on `existingEntry.id != null` rather than just `existingEntry !== null`

**Previous**: v2.1.21
- **Macro progress bars**: uniform length (fixed right-label width), bar fill turns red when over goal, taller bars (12px), tighter row gap

**Previous**: v2.1.20
- **Macro tab progress bars**: tightened row spacing, removed calorie bar (Fat / Carb / Prot only)

**Previous**: v2.1.19
- **Mini macro progress bar on macros tab**: compact 4-row bar (Fat / Carb / Prot / Cal) sits between the form and the entry list, always visible. Completed entries shown solid, planned entries as a lighter overlay. Values show `done+plannedp / goal  (X left)` or `(X over)` in red. Goals reflect PI controller adjustments (same source as dashboard).

**Previous**: v2.1.18
- **PI Controller label + UI polish**: renamed "Running Average Mode" to "PI Controller" throughout; moved the controller logic explanation inside the history accordion (below the per-day table, hidden by default); defined W (sum of exponential decay weights) in the explanation; α slider note now live-computes half-life and derived Ki from the current slider value instead of a hardcoded example.

**Previous**: v2.1.17
- **PI controller: limit-cycle fix + Ki derived from α**: I-term now references your stored displayed goal (what was actually shown to you each day) instead of the base+workout goal — eliminates the theoretical limit cycle where the controller raises your goal, you eat near base, I-memory fades, goal returns to base, and the cycle repeats. Ki is now derived from α automatically (Ki = α/(1-(1-α)^10)) guaranteeing Ki×W=1 (zero steady-state error) regardless of your α setting — one fewer knob to tune. Goals are stored daily (14-day rolling window) after all adjustments are applied. Per-day debug table shows ● (stored goal used) or ○ (base+workout fallback, before history exists).

**Previous**: v2.1.16
- **PI table: intuitive sign convention**: "P err" and "I sum" columns replaced with "P corr" and "I corr" — values shown in goal-space (positive = goal raised because you under-ate, negative = goal lowered because you over-ate); P corr + I corr = PI adj exactly; colors updated to match (green = goal raised, red = goal lowered)

**Previous**: v2.1.15
- **Servings input: two decimal places**: serving size stepper on the macros tab now shows and accepts `0.01` increments instead of `0.1`
- **PI controller: include workout credit in historical error**: when computing the Pd/Pi error for past days, the effective goal for each day now includes that day's workout calorie credit (50% of burned, distributed proportionally across macros) — previously the error was computed against the base goal only, making workout days look like under-eating and incorrectly biasing the controller

**Previous**: v2.1.14
- **Fix AI from text error**: `showTextAIModal` was calling `ui.showModal()` which doesn't exist — the exported function is `ui.createModal()`; caused a TypeError before the modal could open

**Previous**: v2.1.13
- **Fix macro-form.js import order**: moved `_reverseDietIntervalId` declaration to after all import statements (linter had inserted it between imports, invalid ES module syntax)

**Previous**: v2.1.12
- **Body fat forms pre-fill from Settings**: Navy and Caliper estimators now default height, age, and sex from the Body Stats section in Settings
- **Caliper technique hints**: each measurement site now shows a brief inline technique note (pinch direction, anatomical landmark)

**Previous**: v2.1.11
- **Remove workout volume chart**: removed from Trends tab
- **Add macro over/under chart**: new line chart on Trends showing daily (actual − goal) in grams for fat, protein, and carbs; y-axis labelled with +/− g, zero = goal met
- **Fix calorie balance timezone bug**: date range calculation now uses local dates instead of `toISOString()` (UTC), which was shifting the most recent data point by one day for users west of UTC

**Previous**: v2.1.10
- **Remove water tracker**: removed water intake tracking from dashboard and settings

**Previous**: v2.1.9
- **Fix Core calorie inconsistency**: preview and saved calorie values for Core/Lifting workouts now use the same shared `computeWorkoutCalories()` helper (was 0.5 vs 0.3 for Core)
- **Fix service worker offline cache**: all 8 component JS files, `api.js`, and icon paths now included in `STATIC_ASSETS` — app works fully offline
- **Fix setInterval leak**: `setupReverseDietToggle` now stores and clears its polling interval ID, preventing accumulating background timers
- **Calorie formula dedup**: 5 inline `(fat*9)+(protein*4)+(carbs*4)` expressions in `app.js` replaced with `calculateMacroCalories()` from the shared utility
- **PI controller extracted**: `calculateEffectiveGoals()` PI logic moved to `js/utils/pi-controller.js` for independent testability
- **Fix reverse diet / PI interaction**: reverse diet multiplier is now applied AFTER PI adjustment so the controller's error signal and clamp cap are based on unmodified base goals
- **TDEE display in Settings**: new Body Stats section with sex/age/height inputs shows Mifflin-St Jeor BMR and TDEE at 5 activity levels
- **Water intake tracker**: dashboard now shows a daily water counter (+8 oz / −8 oz buttons) with a progress bar and configurable goal in Settings

**Previous**: v2.1.8
- (See git history)

**Previous**: v2.1.3
- **Fix Ialpha initialization**: moved PI gain constants above the error loop to fix temporal dead zone crash
- **Ialpha settings slider**: α decay rate is now configurable in Settings alongside Kp/Ki

**Previous**: v2.1.2
- **PI I-term exponential decay**: older errors now weighted by `(1-α)^k` (α=0.25, half-life ~2.4 days) — eliminates the cliff when a large-error day falls off the 10-day window
- **Dashboard serving check-off**: ticking one serving of a multi-serving planned item now increments an existing matching completed entry instead of always creating a new one

**Previous**: v2.1.1
- **Fix Macro Match Sort**: Use effective goals, include planned meals, remove starred priority from sort order

**Previous**: v2.1.0
- **Max Button Fix**: Fixed 3 bugs in the >> (max servings) button on macro entries
  - Now reads goals via `calculateEffectiveGoals()` (respects PI controller, reverse diet, workout credit)
  - Now includes planned meals when calculating remaining macro budget
- **Measurement History**: Measurements screen now shows full history grouped by date with delete buttons
- **Workout Calorie Estimation**: Cardio workouts with pace now use MET-based formula for more accurate calorie estimates
- **Import Validation**: Import now validates entries before writing; shows errors and offers to import valid entries only

**Previous**: v1.9.9
- **Fix Planned Servings Macro Calculation**: Properly divide macros when checking off multiple servings
  - Now calculates per-serving macros correctly
  - Example: 2 servings of 50g protein → checking off creates 1 serving of 25g, leaves 1 serving of 25g
  - Previously was creating two entries of 50g each (incorrect)
  - Applies to both dashboard and macros tab

**Previous**: v1.9.8
- **Dashboard Planned Servings Fix**: Fixed dashboard checkbox to properly handle multiple servings
  - Dashboard now uses same logic as Macros tab
  - Checking off a planned item with multiple servings creates 1 completed serving
  - Reduces planned servings by 1 instead of marking all as complete
  - Both tabs now work consistently

**Previous**: v1.9.7
- **Smart Planned Servings Checkbox**: Checking off planned items with multiple servings now works properly
  - Checking off a planned item with 3 servings creates 1 completed serving and leaves 2 planned
  - Only consumes one serving at a time instead of marking all servings as eaten
  - Perfect for meal planning when you prep multiple servings
- **Calorie Chart Fix**: Fixed missing entries in chart caused by missing timestamps
  - Updated entries now get timestamps assigned if they don't have one
  - Ensures all completed food entries appear in trend charts
  - Fixes issue where chart showed wrong total calories
- **Export Filename Updated**: Export files now named "fitness-pizza" instead of "fitness-tracker"
  - Manual exports: `fitness-pizza-export-[timestamp].json`
  - Auto-backups: `fitness-pizza-backup.json`

**Previous**: v1.9.6
- **Batch Recipe Support**: Macro form now supports batch recipes
  - New checkbox: "This is a batch recipe (I made multiple servings)"
  - Enter total macros for entire batch, specify servings made and servings eaten
  - Automatically calculates consumed macros: (total / batch servings) × servings eaten
  - Perfect for home-cooked meals and meal prep
- **Starred Foods Always First**: Food library now consistently shows starred items at top
  - Works with both alphabetical and macro-match sorting
  - Starred items always appear first, then sorted by selected method
- **Search Clear Button**: Added X button to food library search field
  - One-click to clear search text
  - Shows/hides automatically based on search field content
- **Calorie Balance Chart Goal Line**: Chart now shows daily calorie goal
  - Dashed line shows your target calorie intake
  - Easy to see if you're over or under goal
  - Helps visualize daily calorie balance vs target

**Previous**: v1.9.5
- **Calorie Trend Chart Date Range Fixed**: Chart now shows correct date range for selected period
  - "7 Days" now shows exactly 7 days from today backward, not from first data point
  - "30 Days" shows exactly 30 days from today backward
  - Each period shows all dates in range, even dates without data (displayed as 0)
  - "All Time" still uses actual data range
  - Fixes issue where chart showed wrong values for past days and today

**Previous**: v1.9.4
- **Starred Foods Show First**: Food library now sorts starred items to the top
  - Makes frequently used foods easier to find
  - Starred items appear first, then alphabetically by name
- **Option to Skip Library Save**: New checkbox on macro form
  - "Don't save to food library"
  - Allows adding one-off meals without cluttering your food library
  - Unchecked by default (still saves to library)
  - Useful for restaurant meals or special occasions
- **Fixed Calorie Trend Chart**: Chart now shows all dates in range
  - Previously only showed dates with data (missing days showed as gaps)
  - Now fills in missing dates with 0 values for accurate visualization
  - Correctly displays 7-day, 14-day, 30-day ranges
  - Today's value now matches actual consumption

**Previous**: v1.9.3
- **Progress Bar Labels Enhanced**: Now show consumed values on the left
  - Fat: XXg, Carbs: XXg, Protein: XXg, Calories: XXXX
  - Remainder/overage values stay on the right as before
  - Better visibility of actual consumption at a glance
- **Running Average Calculation Fixed**: Properly accounts for reverse diet days
  - Reverse diet day consumption is discounted by 20% of target
  - Formula: `discounted = consumed - (target × 0.2)`
  - Prevents reverse diet days from skewing running average upward
  - Ensures running average mode works correctly with reverse dieting

**Previous**: v1.9.2
- **Reverse Diet Redesign**: Moved from permanent setting to per-day toggle
  - Now a toggle on the Macro tab that applies to single day only
  - Increases macros by 20% for that specific day
  - State saved per date, so you can enable it different days
  - Removed the button from settings (was applying permanently, which was wrong)
- **Running Average Mode**: New intelligent macro targeting system
  - Toggle in Settings > Daily Goals section
  - Adjusts daily targets to help you average exactly at your goals over time
  - Calculates: target = (goal + compensation) / 2
  - Where compensation = what you'd need to make past week average to goal
  - Helps you stay on track even after occasional over/under days
  - Works alongside reverse diet (if both enabled, reverse diet applies first, then running average)

**Previous**: v1.9.1
- **Fixed Logo**: Redesigned pizza pie chart with clearly visible pulled-out slice
  - Removed text from logo (doesn't work with circular icons)
  - Better cheese/crust layers for realistic pizza look
  - Dark background matching app theme
- **App Name**: Changed from "FitPizza" to "Fitness Pizza"
- **Theme Colors**: Top bar now matches dark theme (#0f172a) instead of red
- **Smart Remove Buttons**: Remove button only shows for planned items on dashboard
  - Completed items don't have remove button (prevents accidental deletion)
  - Can still delete from macro tab
- **Reverse Diet Feature**: New button in settings to increase all macros by 20%
  - Useful for gradually increasing calories (reverse dieting)
  - Updates all goals at once with one click
- **AI Improvements**:
  - Photo analysis now shows loading animation immediately
  - Added labels to macro input boxes (Fat, Carbs, Protein, Fiber)
  - New text-based AI estimation (🤖 AI from Text button)
  - Estimate macros from text description without photo
- **Bug Fixes**:
  - Fixed calorie overflow red segment not showing
  - Improved loading feedback timing

**Previous**: v1.9.0
- **Rebranding: Fitness Pizza 🍕**: Fresh new identity!
  - Fun pizza pie chart logo with one slice pulled out
  - Track your macros like slices of a delicious pizza
  - Pepperoni-themed design with macro colors
- **UX Improvements**:
  - Removed duplicate button from macro tab (unused)
  - Removed delete button from dashboard food entries (use macro tab instead)
  - Fixed border-radius gaps on segmented calorie progress bar
- **Bug Fix: Food Library Double-Add**: Fixed clicking "Use" sometimes adding food twice
  - Event listeners no longer stack on modal re-render
  - Added preventDefault to avoid double-triggers

**Previous**: v1.8.9
- **Rebranding: MacroMate**: App renamed from "Fitness Tracker" to "MacroMate"
  - Friendly, memorable name that's easy to say
  - Emphasizes the core macro tracking feature
  - New colorful logo with "MM" design
- **Bug Fix: Labels Always Visible**: Progress bar labels now show even with 0 progress
- **Bug Fix: Calorie Overflow Accurate**: Fixed disproportionate red excess on calorie bar

**Previous**: v1.8.8
- **Dynamic Progress Bar Scaling**: All bars now scale together when any macro exceeds 100%
  - If any macro goes over (e.g., 150% of fat goal), ALL bars shrink proportionally
  - Dotted line indicator shows where the original 100% mark was
  - Excess portion past 100% shown in red for easy identification
  - Maintains visual consistency across all progress bars
  - Helps you see relative proportions even when over goals
- **Workout Deficit Visualization**: Calorie bar now shows workout burn as red ghost
  - Red transparent portion at the end represents calories burned from workouts
  - Visually shows the deficit created by exercise
  - Helps you see total calorie balance at a glance
  - Positioned after macro composition (fat, carbs, protein)

**Previous**: v1.8.7
- **Progress Bars Show Over/Under**: Progress bars now indicate when you exceed targets
  - Shows "+Xg over" in red when you've exceeded a macro goal
  - Shows "Xg left" in white when under target
  - Helps you quickly see when you've gone over your daily goals
- **Max Serving Button**: Added ">>" button next to "+" on food servings
  - Automatically calculates maximum integer servings before exceeding ANY macro target
  - Considers remaining fat, carbs, and protein and takes the minimum
  - Helps optimize serving sizes to stay within macro goals
  - Green color indicates it's a smart helper button

**Previous**: v1.8.6
- **Progress Bars Include Planned**: Remaining amounts now account for planned meals
  - Shows what's left after both completed AND planned food
  - More accurate planning view

**Previous**: v1.8.5
- **Enhanced Loading Modal**: Improved photo analysis loading visibility
  - Larger spinner (60px)
  - Darker overlay (90% opacity)
  - Bigger, bolder loading message
- **Dashboard Simplification**: Progress bars now show remaining amounts only
  - "80g left" instead of "70/150g"
  - Cleaner, easier to read at a glance
  - Calories show remaining after workout burn
- **Improved Text Contrast**: Better readability on progress bars
  - Bolder font weight (700)
  - Stronger text shadow for better visibility
  - Consistent color usage

**Previous**: v1.8.4
- **Using gemini-flash-latest**: Changed to user-specified model name
  - Endpoint: v1beta/models/gemini-flash-latest:generateContent
  - API key in x-goog-api-key header

**Previous**: v1.8.3
- **Fixed API Implementation**: Corrected Gemini API format
  - API key now in header (`x-goog-api-key`) instead of URL query param
  - Using v1beta endpoint (correct version)
  - Model: gemini-2.0-flash-exp (stable experimental model)
  - Matches official Google documentation

**Previous**: v1.8.2
- **Model Update**: Using gemini-flash-latest
  - Simplified model name format

**Previous**: v1.8.1
- **Fixed Model Endpoint**: Changed to v1 API with gemini-1.5-flash-latest
  - Fixed "model not found" error
  - Using stable v1 API instead of v1beta

**Previous**: v1.8.0 - **BREAKING CHANGE: Switched to Google Gemini API**
- **Google Gemini API Integration**: Replaced Claude API with Gemini 1.5 Flash
  - ✅ **CORS-enabled** - works directly from PWA on mobile!
  - Free tier: 15 requests/min, 1500 requests/day
  - Get API key from: https://aistudio.google.com/apikey
  - Can restrict keys to your domain for security
  - Better suited for browser-based apps
- **Settings Updated**: Now asks for Gemini API key instead of Claude
  - Old Claude keys won't work - you need a new Gemini key
  - Placeholder updated to show Gemini key format (AIza...)
  - Help link points to Google AI Studio

**Previous**: v1.7.6
- **Detailed API Error Messages**: Test button now shows actual error details
  - Displays HTTP status code (401, 403, 429, etc.)
  - Shows exact error message from Claude API
  - Multi-line error display for better readability
  - No need to check console - error shown directly in UI

**Previous**: v1.7.5
- **API Key Input Fix**: Changed from password to text input
  - Fixes issues with copy/paste on mobile
  - Monospace font for better readability
  - Shows actual characters being entered
- **Enhanced API Debugging**: Added detailed console logging
  - Shows key length and preview (first/last chars)
  - Logs network request details
  - Displays response status codes
  - Check browser console (Settings → inspect) for details

**Previous**: v1.7.4
- **API Key Test Button**: Added "Test API Key" button in Settings
  - Validates API key with actual Claude API call
  - Shows ✅/❌ status with clear error messages
  - Helps diagnose API connection issues
  - Auto-saves key before testing

**Previous**: v1.7.3
- **Photo Context Field**: Added text input to photo upload for user context
  - Help Claude make better estimates with info like "restaurant meal" or "homemade"
  - Optional field appears below photo preview
  - Context included in API prompt for improved accuracy
- **Improved API Error Messages**: Better diagnostics for photo macro feature failures
  - Specific messages for 401 (invalid API key), 429 (rate limit), 400 (bad request)
  - "Failed to fetch" now explains HTTPS requirement and network issues
  - Clearer guidance for troubleshooting API problems

**Previous**: v1.7.2
- **Servings Stepper Control**: Macro tab now has [-] [input] [+] buttons for serving adjustments
  - Plus/minus buttons increment/decrement by exactly 1.0
  - Text input allows manual decimal entry (e.g., 1.5, 2.75)
  - Touch-friendly 28x28px buttons with dark mode styling
- **Dashboard Serving Display**: Activity list now shows serving counts for all entries
  - Format: "Meal Name - 1.0x", "Meal Name - 2.5x", etc.
  - Always visible for clarity

**Previous**: v1.7.1
- **Critical Bugfix**: Fixed syntax error that prevented app from loading
  - Extra opening parenthesis in dashboard calories display
  - App now loads correctly

**Previous**: v1.7.0
- **Servings Text Input**: Macro tab servings now uses text input instead of +/- buttons
- **Dashboard Calories Precision**: Activity list now shows calories rounded to 2 decimal places
- **Food Library Auto-Search**: After adding new food, library automatically searches for it

**Previous**: v1.6.9
- **Fixed Planned Calories Ghost Bar Rendering**: Completely redesigned to match fat/carbs/protein overlay approach
- **Calories Precision Fix**: Macro tab entries now show calories as whole numbers
- **Food Library Search Persistence**: Search term and sort option now retained when editing items
- **Food Library "Use" Button Default**: Items added from food library now default to "planned" status
  - Better workflow for meal planning

**Previous**: v1.6.8
- **Fixed Planned Calories Ghost Bar Size**: Removed incorrect scaling that made planned bars too small

**Previous**: v1.6.7
- **Planned Calories Ghost Bar**: Calories progress bar now shows planned meals broken down by macro
- **Starred Foods in Library**: Star functionality moved from macro tab to food library
- **Condensed Food Library**: Food library entries now match simplified macro tab style

**Previous**: v1.6.6
- **Calorie Bar Stacking Fix**: Fixed horizontal positioning of macro segments in calories progress bar
- **Chart Smoothing Removed**: Calorie balance chart now uses straight lines (tension: 0) for clearer data reading
- **Critical Date/Timestamp Fix**: Resolved inconsistency between date field and timestamp

**Previous**: v1.6.5
- **Stacked Calories Bar**: Calories progress bar now shows macro composition with color-coded segments
- **Trend Chart Date Range Fix**: Charts now display last N days from today backward, not first N days from oldest data
- **Today Button Contrast**: Fixed text color to use theme-aware `var(--bg-primary)` instead of hardcoded white

**Previous**: v1.6.4
- **Critical Color Fix**: Removed all hardcoded progress bar gradient colors (CSS specificity issue)
- **Dashboard/Trends Consistency**: Progress bars now perfectly match chart colors across all themes
- **Eliminated Legacy CSS**: Replaced `linear-gradient(90deg, #b8884f, ...)` with `var(--accent-warning)`
- All progress bars (fat/carbs/protein/calories) now use CSS variables exclusively
- Colors dynamically adapt to theme: Dark (pale bone), TRS-80 (green shades), Pink (pink), etc.

## 📄 License

Built for personal use. Use, modify, and distribute as you wish. No warranties.

---

**Calorie Calculations**:
- Protein: 4 cal/g
- Carbs: 4 cal/g
- Fat: 9 cal/g
- Fiber: 2 cal/g (net impact)

**Workout Estimates** (conservative):
- Cardio: 3 cal/min
- Core: 0.3 cal/rep
- Lifting: 0.5 cal/rep

Stay healthy! 💪
