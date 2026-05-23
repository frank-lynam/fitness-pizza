# Fitbit Integration Plan — Fitness Pizza

## Context

The user wants to integrate Fitbit data into the app covering sleep tracking, workout tracking, and historical data import. This requires OAuth 2.0 authentication with Fitbit, paginated API calls, a new `sleep_logs` DB store, and UI surface area in both settings (connect/sync) and trends (sleep visualization).

**Critical timing note:** The Fitbit Web API is being deprecated in **September 2026** (~4 months away). Google is replacing it with the Google Health API. The plan builds for Fitbit now but structures the API client as a swappable module so migrating to Google Health API later is isolated to one file.

---

## PWA vs APK Capability Matrix

| Feature | PWA (browser) | APK (native) |
|---|---|---|
| OAuth authorization redirect | ✅ popup window | ✅ @capacitor/browser |
| Token exchange (CORS-blocked endpoint) | ⚠️ fetch() — CORS likely blocks | ✅ CapacitorHttp bypasses CORS |
| API calls (sleep/activity/body) | ✅ CORS allowed | ✅ CapacitorHttp |
| Token storage | ✅ IndexedDB | ✅ IndexedDB |
| Auto-refresh on app open | ✅ | ✅ |

**PWA token exchange**: Fitbit's `/oauth2/token` endpoint has no CORS headers. On APK, `CapacitorHttp` (already in the app) bypasses this. On PWA, fetch() will likely fail. We attempt it anyway — if it works (some PKCE public clients are allowed), great. If not, the connect flow fails gracefully with "Full Fitbit sync requires the Android app."

**No new native plugin required**: `@capacitor/browser` is optional. We'll use `window.open()` popup + `postMessage` for both PWA and native initially — this avoids an APK rebuild. If the in-app browser experience is poor on Android we can add `@capacitor/browser` in a follow-up.

---

## Architecture

### New Files

**`js/api-fitbit.js`** — Fitbit API client
```
FitbitClient class:
  generatePKCE()               → { codeVerifier, codeChallenge }
  buildAuthURL(codeChallenge)  → OAuth URL with scopes: sleep activity weight heartrate
  exchangeCode(code, verifier) → POST /oauth2/token, returns { access_token, refresh_token, expires_in, user_id }
  refreshIfNeeded()            → checks expires_at vs Date.now(), calls refresh if within 15min
  get(path)                    → _fetchJson() wrapper with auto-refresh + Bearer header
  fetchSleep(start, end)       → /1.2/user/-/sleep/date/{start}/{end}.json (100-day max chunks)
  fetchActivities(beforeDate)  → /1/user/-/activities/list.json paginated (100/request)
  fetchWeight(start, end)      → /1/user/-/body/weight/date/{start}/{end}.json
  fetchBodyFat(start, end)     → /1/user/-/body/fat/date/{start}/{end}.json
```

Uses the existing `_fetchJson()` method pattern from `app.js` — will call `CapacitorHttp` on native (CORS bypass), `fetch()` on PWA.

**`js/components/fitbit-sync.js`** — connect/sync UI
```
showFitbitConnectFlow()    → launches OAuth popup, listens for postMessage
showFitbitSyncModal()      → date range picker + import progress bar
showFitbitStatus()         → renders connected user/last sync in settings section
importSleepRange(start, end, onProgress)
importActivitiesRange(start, end, onProgress)
importWeightRange(start, end, onProgress)
```

**`fitbit-callback.html`** (static, served from fitness-pizza.com root)
```html
Receives ?code=...&state=... from Fitbit redirect
Validates state matches sessionStorage value (CSRF)
window.opener.postMessage({ type: 'fitbit_callback', code, state })
window.close()
```

### Modified Files

**`js/db.js`**
- Bump `DB_VERSION` to `3`
- Add `sleep_logs` object store in version upgrade handler:
  ```
  keyPath: 'id', autoIncrement: true
  fields: date, start_time, end_time, duration_minutes, minutes_asleep,
          minutes_awake, minutes_in_bed, efficiency, stages (JSON),
          fitbit_log_id, sync_source
  indexes: date, fitbit_log_id
  ```
- Add `seedDefaultFoodsIfEmpty()` already handles old version gracefully — no change needed there
- Add `addSleepLog()`, `getSleepLogsByDateRange()`, `getAllSleepLogs()`, `deleteSleepLog(id)` methods
- Export/import to include `sleep_logs` store

**`js/app.js`**
- Import `FitbitClient` from `api-fitbit.js`
- On startup: call `fitbit.refreshIfNeeded()` silently (8hr token expiry)
- `initFitbit()` method: check for stored token, wire up sync button

**`index.html`**
- New settings section "Fitbit" (between Data Management and Gemini API):
  ```html
  <div class="settings-section" id="fitbit-settings">
    <h3>Fitbit</h3>
    <div id="fitbit-status">...</div>  <!-- connected/disconnected state -->
    <button id="btn-fitbit-connect" class="btn-primary">Connect Fitbit</button>
    <button id="btn-fitbit-sync" class="btn-secondary hidden">Sync Now</button>
    <button id="btn-fitbit-disconnect" class="btn-tertiary btn-small hidden">Disconnect</button>
    <p class="help-text">Imports sleep, workouts, and weight from your Fitbit account</p>
  </div>
  ```
- New Sleep section in Trends tab (below body composition chart):
  ```html
  <div class="chart-container" id="sleep-chart-section">
    <h3>Sleep</h3>
    <canvas id="sleep-chart"></canvas>
    <div id="sleep-summary"></div>
  </div>
  ```

**`css/styles.css`**
- Sleep stage color palette (deep=indigo, light=blue, rem=purple, wake=orange)
- Sleep chart legend styles

---

## OAuth Flow (both platforms)

```
1. User clicks "Connect Fitbit"
2. Generate PKCE pair; store codeVerifier in sessionStorage; store state nonce
3. window.open(authURL, 'fitbit_auth', 'width=500,height=700')
4. User logs in → Fitbit redirects to https://fitness-pizza.com/fitbit-callback
5. fitbit-callback.html postMessages { type:'fitbit_callback', code, state } to window.opener
6. Main app receives message, validates state, closes popup reference
7. exchangeCode(code, codeVerifier) → POST /oauth2/token via _fetchJson()
   - APK: CapacitorHttp handles it ✅
   - PWA: fetch() — if CORS blocks → show "use the Android app" message
8. Store { access_token, refresh_token, expires_at, user_id } in db.setSetting()
9. Show connected state with "Sync Now" button
```

---

## Historical Import Flow

```
showFitbitSyncModal():
  - Date range picker (default: last 90 days, max: all available)
  - Checkboxes: ☑ Sleep  ☑ Workouts  ☑ Weight & Body Fat
  - "Start Import" → shows progress bar

importSleepRange(start, end, onProgress):
  - Chunk into 100-day windows
  - For each window: fetchSleep() → map → db.addSleepLog() (skip if fitbit_log_id exists)
  - Respect 150 req/hr rate limit: if remaining < 10, pause 60s with countdown

importActivitiesRange(start, end, onProgress):
  - Paginate via beforeDate + sort=desc until past start date
  - Map Fitbit activity → workouts schema:
      exercise_name = activityName
      duration_minutes = duration/60000
      estimated_calories_burned = calories
      date = startTime.split('T')[0]
      sync_source = 'fitbit'
      fitbit_log_id = logId (stored in notes or new field for dedup)
  - Skip if same date+exercise+duration already exists

importWeightRange(start, end, onProgress):
  - fetchWeight() + fetchBodyFat() for range
  - Map to measurements store (type: 'weight' or 'body_fat', sync_source: 'fitbit')
  - Skip if same date+type already exists
```

---

## Data Mapping

### Fitbit Sleep → sleep_logs
| Fitbit field | App field |
|---|---|
| `dateOfSleep` | `date` |
| `startTime` | `start_time` |
| `endTime` | `end_time` |
| `minutesAsleep` | `minutes_asleep` |
| `minutesAwake` | `minutes_awake` |
| `timeInBed` | `minutes_in_bed` |
| `efficiency` | `efficiency` |
| `levels.summary` | `stages` (JSON) |
| `logId` | `fitbit_log_id` |

### Fitbit Activity → workouts
| Fitbit field | App field |
|---|---|
| `activityName` | `exercise_name` |
| `duration / 60000` | `duration_minutes` |
| `calories` | `estimated_calories_burned` |
| `startTime.split('T')[0]` | `date` |
| `'fitbit'` | `sync_source` |

### Fitbit Weight → measurements
| Fitbit field | App field |
|---|---|
| `date` | `date` |
| `weight` | `value` (type: 'weight') |
| Fitbit user unit pref | `unit` (lbs or kg) |
| `'fitbit'` | `sync_source` |

---

## Sleep Visualization

Add a bar chart (Chart.js stacked bar, reusing existing chart patterns from `chart-renderer.js`) in the Trends tab:
- X-axis: dates
- Y-axis: hours
- Stacked segments: deep (indigo), REM (purple), light (blue), wake (orange)
- Tooltip: total sleep, each stage breakdown
- Below chart: weekly average sleep time + most recent night summary card

---

## Critical Files
- `js/db.js` — DB version 3, sleep_logs store, new CRUD methods
- `js/app.js` — startup token refresh, init Fitbit
- `js/api-fitbit.js` — new Fitbit API client (NEW)
- `js/components/fitbit-sync.js` — connect/sync UI (NEW)
- `js/components/chart-renderer.js` — add sleep chart rendering
- `index.html` — Fitbit settings section, sleep chart section in Trends
- `css/styles.css` — sleep chart colors
- `fitbit-callback.html` — OAuth callback page (NEW, served from fitness-pizza.com)

---

## Version & Deploy

- Bump to **v2.5.0** (minor bump — significant new feature)
- No new native plugins → live bundle delivery (no APK rebuild required)
- `minNativeVersion` stays at `2.4.7`
- APK rebuild only needed if we later add `@capacitor/browser`

---

## Migration Note (September 2026)

When Fitbit API sunsets, the migration to Google Health API is isolated to `js/api-fitbit.js`:
- Different base URL and endpoint paths
- Same OAuth 2.0 + PKCE pattern (Google OAuth)
- Same data mapping layer — field names may differ but the DB schema stays the same
- All UI, DB, and sync logic is reusable unchanged

---

## Verification

1. Register a Fitbit developer app at dev.fitbit.com (free), get `client_id`
2. Store `client_id` as a setting (or hardcode in `api-fitbit.js`)
3. Register `https://fitness-pizza.com/fitbit-callback` as redirect URI
4. Test OAuth popup flow in PWA (browser) — verify postMessage received
5. Test token exchange — if CORS blocks on PWA, confirm error message shows correctly
6. Test token exchange on APK — should succeed via CapacitorHttp
7. Import 30 days of sleep data — verify sleep_logs populated, chart renders
8. Import 30 days of activities — verify workouts added with sync_source='fitbit'
9. Import weight — verify measurements populated, no duplicates on re-sync
10. Kill and reopen app — verify token auto-refresh fires silently
11. Export data — verify sleep_logs included in JSON export
