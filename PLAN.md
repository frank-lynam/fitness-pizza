# Fitness Pizza — Improvements Plan

## Context

Full code review (Opus 4.7) identified bugs causing incorrect behaviour, UX friction points, and prioritised feature additions. The user has reviewed all findings and confirmed scope below.

Explicitly rejected: PCF macro display order (keeping FCF), making "Use" require more clicks (one-click stays), barcode scan, meal templates, Apple/Health Connect integration.

---

## Phase 1 — Bug Fixes

These cause incorrect data or silent failures. Ship first as a patch.

### 1. PI controller workout-credit reads wrong setting names

**Files:** `js/components/chart-renderer.js:552–556`, `js/app.js:490–495`

**Problem:** Both spots read `workout_credit_fat` / `workout_credit_protein` / `workout_credit_carbs` as booleans (old setting names) instead of `workout_credit_fat_weight` etc as numeric weights. `applyWorkoutCredit` (`js/utils/calorie-calc.js:247`) interprets them as numbers, so `true → 1` and `false → 0` — macro delta chart and dashboard planned-credit use a different distribution than the actual effective goal.

**Fix:** Replace the 3 setting-key lookups in each location with the correct `_weight` suffixed names and parse as floats.

### 2. Two validateMacros with incompatible signatures

**Files:** `js/utils/calorie-calc.js:217`, `js/utils/validation.js`

**Problem:** Two exports with the same name; one takes positional args and returns `{valid, errors[]}`, the other takes an object and returns `{valid, errors{}}`. `macro-form.js:8` imports the `validation.js` one.

**Fix:** Audit all callers, pick one canonical version (the `validation.js` object-arg form is more ergonomic), remove the other, update any imports.

### 3. pi_goal_history written on every screen navigation

**Files:** `js/app.js:397–405`

**Problem:** `calculateEffectiveGoals(today)` writes the goal history setting every call. Dashboard, macros tab, and trends tab each trigger it on navigation = 3+ IndexedDB writes per screen change, plus race conditions when PI mode is on.

**Fix:** Cache the last-written date + goals in memory; skip the write if both match.

---

## Phase 2 — Code Quality

### 4. _cheatDayIntervalId polls every 1 second forever

**File:** `js/components/macro-form.js:99–107`

**Fix:** Replace the `setInterval` with a one-shot `setTimeout` to next midnight; reschedule on `visibilitychange` if the app was backgrounded past midnight.

### 5. window.onerror catches third-party / image-load errors

**File:** `js/app.js:1892–1901`

**Fix:** Filter to errors whose filename originates from the app's own script path before showing the modal.

### 6. Magic numbers → js/constants.js

Pull out: 14-day goal history trim window, 30s GPS weak-signal timer, 0.5 km minimum run-save threshold, 3500 kcal/lb fat-mass conversion, 5/10 g macro intensity scale. One new file, imported where needed.

### 7. Auto-backup unconditional a.click()

**File:** `js/app.js:2105–2127`

**Problem:** Triggers a browser download dialog outside a user gesture — silently blocked on most browsers.

**Fix:** Add a settings toggle "Auto-backup weekly" (default on for users who already have `last_auto_backup` set, default off for new users). Only call `a.click()` when the toggle is on and a user gesture can be inferred from the page-load flow.

---

## Phase 3 — UX Improvements

### 8. Macro form: collapse advanced checkboxes

**File:** `js/components/macro-form.js:140–194`

"Mark as planned" stays visible. "Don't save to library", "Save as per-100g", "This is a batch recipe" move under a ▸ More options disclosure that expands inline. Reduces paralysis for new users without removing power.

### 9. Rename "PI Controller" → "Auto-adjust daily targets"

**Files:** `index.html:221–228`, `js/app.js` (label strings)

Add a one-line plain-english description. The current "Automatically adjusts daily macro targets…" help text is fine but the heading is opaque to non-engineers.

### 10. Servings stepper step size — rejected

### 11. Undo toast on delete

**Files:** `js/components/macro-form.js`, `js/components/food-library.js`, `js/components/workout-form.js`, `js/components/measurement-form.js`, `js/ui.js`

Replace `confirm()` dialogs with a committed delete + 5-second "Undo" toast. `ui.js` gets a `showUndoToast(message, onUndo)` helper. Undo re-inserts with `db.add()` using the original data.

### 12. Cheat-day toggle: show which date it applies to

**File:** `js/components/macro-form.js`, `index.html`

Label becomes "🎉 Cheat Day (Today)" / "🎉 Cheat Day (May 30)" so it's clear the toggle tracks the header date picker, not always today.

### 13. Settings: collapsible sections

**File:** `index.html:173–end-of-settings`, `css/styles.css`

Each settings-section h3 becomes a clickable toggle that collapses/expands its body. State persisted in localStorage. Default: all expanded. Cuts the scroll wall without restructuring markup.

---

## Phase 4 — Feature Additions

### 14. Daily calorie summary row — rejected (duplicate of macro bar info)

### 15. "Recently used" food sort (small)

**File:** `js/components/food-library.js`

New sort option "Recent" — orders by `updated_at` descending (already updated on Use). Persist selected sort in localStorage.

### 16. Water tracking — rejected

### 17. Streak counter on dashboard (small)

**Files:** `js/components/dashboard.js`

Count consecutive days where 90% ≤ logged calories ≤ 110% of goal (both under-eating and over-eating break the streak). Cheat days do not break the streak — they are excluded from evaluation. Show "🔥 X day streak" on dashboard.

### 18. Trend chart date annotations (medium)

**Files:** `js/db.js`, `js/components/chart-renderer.js`, `js/app.js`, `index.html`

New annotations store: `{ date, label }`
On trend charts: vertical dotted lines via `chartjs-plugin-annotation` (CDN).
Add a note by tapping a date label on any trend chart.

---

## Phase 5 — Calorie-Only Mode

**Strategy A (recommended):** `tracking_mode` is a hard per-user setting — no per-day mixing.

### DB changes (no version bump needed)

- `entry_mode: 'macros' | 'calories'` on macro entries (nullable → 'macros' for existing)
- Same field on `named_foods`
- New user setting: `tracking_mode: 'macros' | 'calories'` (existing users default 'macros')

### Macro entry form (`js/components/macro-form.js`)

- Mode toggle at top of form (defaults from `tracking_mode` setting, overridable per entry)
- Calories mode: hide F / C / P / Fiber grid; show single Calories input
- AI estimation paths already return calories — in calorie mode, use it directly
- "Save to library" still works — creates a calorie-only named food

### Food library (`js/components/food-library.js`)

- Calorie-only form: hide F/C/P fields when `mode = 'calories'`
- `cal only` badge on library items that lack macros
- `calculateMacrosFromNamedFood` (`js/db.js:629`) already returns zeros for missing macros — no change needed

### Dashboard (`js/components/dashboard.js`)

- Macro bars remain in both modes (calorie-only entries simply show 0g macros accurately)
- Macro mode with calorie-only entries: grey "unallocated" segment in stacked bar to represent calories without a macro breakdown

### Goals / Settings (`index.html`, `js/app.js:1252–1397`)

- "Goal mode" selector: Macro targets | Calorie target only
- Calorie-only mode shows a single daily calorie goal input; hides fat/carbs/protein goals
- Setup Wizard gets an early "How do you want to track?" question

### PI controller (`js/utils/pi-controller.js`, `js/app.js`)

- Calorie mode: replace 3 macro loops with 1 calorie loop — identical math, one scalar
- `applyWorkoutCredit` in calorie mode: add `caloriesBurned × fraction` directly to calorie goal
- Macro mode: calorie-only entries contribute to the calorie balance chart but their zero macros are excluded from per-macro PI loops

### Migration

- No data migration needed; existing users default to macro mode
- New users guided by Setup Wizard

**Estimated effort:** 2–3 days (PI calorie path ~half a day; rest is UI conditionals)

---

## Critical Files Summary

| File | Phases |
|---|---|
| `js/app.js` | 1, 2, 3, 4, 5 |
| `js/components/macro-form.js` | 1, 2, 3, 5 |
| `js/components/chart-renderer.js` | 1, 4 |
| `js/components/dashboard.js` | 4, 5 |
| `js/components/food-library.js` | 3, 5 |
| `js/utils/pi-controller.js` | 1, 5 |
| `js/utils/calorie-calc.js` | 1, 2, 5 |
| `js/utils/validation.js` | 1 |
| `js/db.js` | 5 |
| `js/ui.js` | 3 |
| `index.html` | 3, 4, 5 |
| `css/styles.css` | 3, 4 |
| `js/constants.js` | 2 (new file) |

---

## Suggested Ship Order

| Version | Contents |
|---|---|
| v2.5.x patches | Phase 1 bugs (workout-credit fix, validateMacros, pi_goal_history) |
| v2.6.0 | Phase 2 + 3 (code quality + UX improvements) |
| v2.7.0 | Phase 4 features (calorie tile, water, streaks, recent-food sort) |
| v2.8.0 | Phase 5 (calorie-only mode) |
