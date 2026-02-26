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

### On Your Phone (PWA Install):

1. **Android (Chrome/Edge)**:
   - Visit your hosted URL
   - Tap menu (⋮) → "Add to Home screen"
   - App appears on home screen

2. **iPhone (Safari)**:
   - Visit your hosted URL
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

**Current**: v2.1.15
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
