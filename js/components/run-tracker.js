/**
 * Run Tracker — Capacitor native component
 * Uses @capacitor-community/background-geolocation so GPS keeps running
 * when the screen is locked. Only active inside the native app.
 */

import { db } from '../db.js';
import { GPS_WEAK_SIGNAL_TIMEOUT_MS, GPS_MAX_POINT_JUMP_KM, MIN_RUN_FINISH_DIST_KM } from '../constants.js';

const KM_PER_MI = 1.60934;
// Altitude delta below this threshold is treated as GPS noise and ignored.
const ELEV_NOISE_M = 3.0;

const ACTIVITIES = {
    run:  { label: 'Run',  emoji: '🏃', next: 'hike',
            exerciseName: 'Outdoor Run',
            startTts: 'Run started.', pauseTts: 'Run paused.',
            finishTts: (km, mph) => `Run finished. ${km} kilometers. ${mph} miles per hour.`,
            startBtn: 'Start Run', weakBtn: 'Start Run (weak GPS)',
            bgMsg: 'Fitness Pizza is tracking your run.', bgTitle: 'Run in progress',
            closeMsg: 'Stop the run and close?' },
    hike: { label: 'Hike', emoji: '🥾', next: 'bike',
            exerciseName: 'Hiking',
            startTts: 'Hike started.', pauseTts: 'Hike paused.',
            finishTts: (km)       => `Hike finished. ${km} kilometers.`,
            startBtn: 'Start Hike', weakBtn: 'Start Hike (weak GPS)',
            bgMsg: 'Fitness Pizza is tracking your hike.', bgTitle: 'Hike in progress',
            closeMsg: 'Stop the hike and close?' },
    bike: { label: 'Bike', emoji: '🚴', next: 'run',
            exerciseName: 'Cycling',
            startTts: 'Ride started.', pauseTts: 'Ride paused.',
            finishTts: (km, mph) => `Ride finished. ${km} kilometers. ${mph} miles per hour.`,
            startBtn: 'Start Ride', weakBtn: 'Start Ride (weak GPS)',
            bgMsg: 'Fitness Pizza is tracking your ride.', bgTitle: 'Ride in progress',
            closeMsg: 'Stop the ride and close?' },
};

function haversineKm(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function fmtDuration(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ACSM formulas with grade correction. Activity selects coefficients.
// Bike uses a speed-based MET estimate (no power data available).
function calcCalories(durationMinutes, weightKg, distKm, elevGainM = 0, activity = 'run') {
    if (durationMinutes <= 0) return 0;
    if (activity === 'bike') {
        const distMi = distKm / KM_PER_MI;
        const speedMph = distMi / (durationMinutes / 60);
        const met = Math.max(4, Math.min(16, speedMph * 0.7 + 2));
        return Math.round(met * 3.5 * weightKg / 200 * durationMinutes);
    }
    const horiz = activity === 'hike' ? 0.1 : 0.2;
    const vert  = activity === 'hike' ? 1.8 : 0.9;
    const metMin = activity === 'hike' ? 2 : 5;
    const metMax = activity === 'hike' ? 9 : 22;
    const metDefault = activity === 'hike' ? 4.0 : 9.0;
    let met = metDefault;
    if (distKm > 0) {
        const speedMPerMin = (distKm * 1000) / durationMinutes;
        const grade = elevGainM > 0 ? elevGainM / (distKm * 1000) : 0;
        const vo2 = horiz * speedMPerMin + vert * grade * speedMPerMin + 3.5;
        met = Math.max(metMin, Math.min(metMax, vo2 / 3.5));
    }
    return Math.round(met * 3.5 * weightKg / 200 * durationMinutes);
}

function spokenDuration(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const parts = [];
    if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
    if (m > 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
    if (h === 0 && s > 0) parts.push(`${s} second${s !== 1 ? 's' : ''}`);
    return parts.join(' ') || '0 seconds';
}

async function tts(text) {
    if (window.AndroidBridge) {
        window.AndroidBridge.speak(text);
        return;
    }
    const TTS = window.Capacitor?.Plugins?.TextToSpeech;
    if (!TTS) return;
    try {
        await TTS.speak({ text, rate: 1.0, locale: 'en-US', volume: 1.0 });
    } catch (_) {}
}

export function initRunTracker() {
    const btn = document.getElementById('btn-go-for-run');
    if (!btn) return;

    // Check for a run that was interrupted by a WebView reload
    try {
        const savedRaw = localStorage.getItem('active_run');
        if (savedRaw) {
            const saved = JSON.parse(savedRaw);
            const ageMs = Date.now() - (saved.savedAt || 0);
            if (ageMs < 4 * 60 * 60 * 1000 && (saved.phase === 'running' || saved.phase === 'paused')) {
                const banner = document.createElement('div');
                banner.id = 'run-recovery-banner';
                banner.style.cssText = 'background:var(--accent-primary);color:#fff;padding:10px 16px;border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;text-align:center;font-weight:600;';
                banner.textContent = `▶ Resume run in progress — ${saved.totalDistKm.toFixed(2)} km`;
                banner.addEventListener('click', () => {
                    banner.remove();
                    launchRunOverlay(saved);
                });
                const workoutsContent = document.getElementById('workouts-content');
                if (workoutsContent) workoutsContent.prepend(banner);
            }
        }
    } catch (_) {}

    btn.addEventListener('click', () => launchRunOverlay());
}

function saveRunState(phase, totalDistKm, getElapsedMs, segmentStart, halfKmsAnnounced, weightKg, elevGainM, elevLossM) {
    if (phase !== 'running' && phase !== 'paused') return;
    try {
        localStorage.setItem('active_run', JSON.stringify({
            phase,
            totalDistKm,
            totalElapsedMs: getElapsedMs(),
            segmentStart,
            halfKmsAnnounced,
            weightKg,
            elevGainM,
            elevLossM,
            savedAt: Date.now()
        }));
    } catch (_) {}
}

function clearRunState() {
    localStorage.removeItem('active_run');
    const banner = document.getElementById('run-recovery-banner');
    if (banner) banner.remove();
}

function launchRunOverlay(recoveredState = null) {
    if (document.getElementById('run-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'run-overlay';
    overlay.className = 'run-overlay';
    overlay.innerHTML = `
        <div class="run-header">
            <button id="run-close" class="run-close-btn" aria-label="Close">✕</button>
            <h2 class="run-title" id="run-title">🏃 Run Tracker</h2>
            <div id="run-status" class="run-status-badge">Acquiring GPS…</div>
        </div>
        <div class="run-main">
            <div class="run-big-stat">
                <span id="run-distance" class="run-big-value">0.00</span>
                <span class="run-big-unit">km</span>
            </div>
            <div class="run-stat-row">
                <div class="run-stat-box">
                    <span id="run-time" class="run-stat-value">0:00</span>
                    <span class="run-stat-label">time</span>
                </div>
                <div class="run-stat-box">
                    <span id="run-pace" class="run-stat-value">0.0</span>
                    <span class="run-stat-label">mph</span>
                </div>
                <div class="run-stat-box">
                    <span id="run-calories" class="run-stat-value">0</span>
                    <span class="run-stat-label">kcal</span>
                </div>
            </div>
            <div id="run-elev-row" class="run-elev-row" style="display:none;">
                <span id="run-elev-up" class="run-elev-stat">↑ 0m</span>
                <span id="run-elev-down" class="run-elev-stat">↓ 0m</span>
            </div>
        </div>
        <div id="run-controls" class="run-controls">
            <button id="run-start" class="btn-primary run-action-btn" disabled>Waiting for GPS…</button>
        </div>
        <div class="run-toggles">
            <button id="run-activity-toggle" class="run-toggle-btn active">🏃 Run</button>
            <button id="run-pacing-toggle" class="run-toggle-btn" aria-pressed="false">Pacing: Off</button>
            <button id="run-silent-toggle" class="run-toggle-btn" aria-pressed="false">Updates: On</button>
        </div>
        <div id="run-gps-badge" class="run-gps-badge">GPS: searching…</div>
    `;
    document.body.appendChild(overlay);

    // — state —
    let phase = 'acquiring';
    let watcherId = null;
    let totalDistKm = 0;
    let lastLat = null, lastLon = null;
    let totalElapsedMs = 0;
    let segmentStart = null;
    let halfKmsAnnounced = 0;
    let weightKg = 70;
    let tickInterval = null;
    let weakSignalTimer = null;

    // Elevation tracking — accumulated with noise filtering
    let elevGainM = 0;
    let elevLossM = 0;
    let lastAlt = null;

    // Pacing mode: snapshot totalDistKm at the start of each 30 s window
    let pacingWindowDistKm = 0;
    let pacingWindowTime = 0;
    let pacingTimer = null;

    // Mode settings — persist across runs
    let pacingMode = localStorage.getItem('run_pacing_mode') === 'true';
    let silentMode = localStorage.getItem('run_silent_mode') === 'true';
    let activityMode = localStorage.getItem('run_activity_mode') || 'run';
    if (!ACTIVITIES[activityMode]) activityMode = 'run';

    // Use most recent weight measurement for calorie accuracy
    db.getLatestWeight()
        .then(lbs => { weightKg = lbs / 2.20462; })
        .catch(() => {});

    const BGL = window.Capacitor?.Plugins?.BackgroundGeolocation;

    function getElapsedMs() {
        return totalElapsedMs + (segmentStart ? Date.now() - segmentStart : 0);
    }

    function refreshDisplay() {
        const sec = getElapsedMs() / 1000;
        const dMin = sec / 60;
        const distMi = totalDistKm / KM_PER_MI;
        const speedMph = sec > 0 && distMi > 0 ? distMi / (sec / 3600) : 0;
        document.getElementById('run-distance').textContent = totalDistKm.toFixed(2);
        document.getElementById('run-time').textContent = fmtDuration(sec);
        document.getElementById('run-pace').textContent = speedMph.toFixed(1);
        document.getElementById('run-calories').textContent = calcCalories(dMin, weightKg, totalDistKm, elevGainM, activityMode);
        if (elevGainM > 0 || elevLossM > 0) {
            const elevRow = document.getElementById('run-elev-row');
            if (elevRow) elevRow.style.display = '';
            const up = document.getElementById('run-elev-up');
            const dn = document.getElementById('run-elev-down');
            if (up) up.textContent = `↑ ${Math.round(elevGainM)}m`;
            if (dn) dn.textContent = `↓ ${Math.round(elevLossM)}m`;
        }
    }

    function updateToggleButtons() {
        const act = ACTIVITIES[activityMode];
        const actBtn    = document.getElementById('run-activity-toggle');
        const pacingBtn = document.getElementById('run-pacing-toggle');
        const silentBtn = document.getElementById('run-silent-toggle');
        const locked = phase === 'running' || phase === 'paused' || phase === 'done';
        if (actBtn) {
            actBtn.textContent = `${act.emoji} ${act.label}`;
            actBtn.classList.add('active');
            actBtn.disabled = locked;
        }
        if (pacingBtn) {
            pacingBtn.textContent = pacingMode ? 'Pacing: On' : 'Pacing: Off';
            pacingBtn.setAttribute('aria-pressed', String(pacingMode));
            pacingBtn.classList.toggle('active', pacingMode);
        }
        if (silentBtn) {
            silentBtn.textContent = silentMode ? 'Updates: Off' : 'Updates: On';
            silentBtn.setAttribute('aria-pressed', String(silentMode));
            silentBtn.classList.toggle('active', !silentMode);
        }
        // Keep title in sync
        const title = document.getElementById('run-title');
        if (title) title.textContent = `${act.emoji} ${act.label} Tracker`;
    }

    // Announces current 30 s windowed speed when pacing mode is enabled.
    // Snapshots totalDistKm at window start; computes delta on each fire.
    function startPacingTimer() {
        stopPacingTimer();
        // On Android the native GPS listener handles pacing announcements even
        // when the screen is locked — JS setInterval freezes in that state.
        if (!pacingMode || window.AndroidBridge) return;
        pacingWindowDistKm = totalDistKm;
        pacingWindowTime = Date.now();
        pacingTimer = setInterval(() => {
            if (phase !== 'running') return;
            const now = Date.now();
            const dtHours = (now - pacingWindowTime) / 3600000;
            const dMi = (totalDistKm - pacingWindowDistKm) / KM_PER_MI;
            const speedMph = dtHours > 0 ? dMi / dtHours : 0;
            pacingWindowDistKm = totalDistKm;
            pacingWindowTime = now;
            if (speedMph > 0.5) tts(`${speedMph.toFixed(1)} miles per hour.`);
        }, 30000);
    }

    function stopPacingTimer() {
        if (pacingTimer) { clearInterval(pacingTimer); pacingTimer = null; }
    }

    let tickCount = 0;
    function onRunVisibilityChange() {
        if (document.hidden) {
            if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
        } else if (phase === 'running') {
            startTick();
        }
    }

    function startTick() {
        stopTick();
        tickInterval = setInterval(() => {
            refreshDisplay();
            if (++tickCount % 60 === 0) {
                saveRunState(phase, totalDistKm, getElapsedMs, segmentStart, halfKmsAnnounced, weightKg, elevGainM, elevLossM);
            }
        }, 1000);
        document.addEventListener('visibilitychange', onRunVisibilityChange);
    }

    function stopTick() {
        if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
        document.removeEventListener('visibilitychange', onRunVisibilityChange);
    }

    function setPhase(p) {
        phase = p;
        const labels = { acquiring: 'Acquiring GPS…', ready: 'GPS Ready — tap Start', running: 'Running', paused: 'Paused', done: 'Finished!' };
        document.getElementById('run-status').textContent = labels[p] || p;
    }

    function setControls(html) {
        document.getElementById('run-controls').innerHTML = html;
    }

    function wireRunControls() {
        document.getElementById('run-pause')?.addEventListener('click', () => {
            totalElapsedMs += Date.now() - segmentStart;
            segmentStart = null;
            setPhase('paused');
            saveRunState('paused', totalDistKm, () => totalElapsedMs, null, halfKmsAnnounced, weightKg, elevGainM, elevLossM);
            window.AndroidBridge?.pauseNativeRun();
            stopPacingTimer();
            tts(ACTIVITIES[activityMode].pauseTts);
            setControls(`
                <button id="run-resume" class="btn-secondary run-action-btn">Resume</button>
                <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
            `);
            wireRunControls();
        });

        document.getElementById('run-resume')?.addEventListener('click', () => {
            segmentStart = Date.now();
            setPhase('running');
            saveRunState('running', totalDistKm, getElapsedMs, segmentStart, halfKmsAnnounced, weightKg, elevGainM, elevLossM);
            window.AndroidBridge?.resumeNativeRun();
            window.AndroidBridge?.setPacingMode(pacingMode);
            startPacingTimer();
            tts('Resuming.');
            setControls(`
                <button id="run-pause" class="btn-secondary run-action-btn">Pause</button>
                <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
            `);
            wireRunControls();
        });

        document.getElementById('run-finish')?.addEventListener('click', finishRun);
    }

    function beginRun() {
        if (phase !== 'ready') return;
        segmentStart = Date.now();
        setPhase('running');
        saveRunState('running', totalDistKm, getElapsedMs, segmentStart, halfKmsAnnounced, weightKg, elevGainM, elevLossM);
        startTick();
        window.AndroidBridge?.startNativeRun(weightKg);
        window.AndroidBridge?.setSilentMode(silentMode);
        window.AndroidBridge?.setPacingMode(pacingMode);
        startPacingTimer();
        tts(ACTIVITIES[activityMode].startTts);
        setControls(`
            <button id="run-pause" class="btn-secondary run-action-btn">Pause</button>
            <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
        `);
        wireRunControls();
    }

    async function startGpsAcquisition(recovering = false) {
        if (!BGL) {
            if (!recovering) {
                document.getElementById('run-status').textContent = 'GPS unavailable — native app required';
                document.getElementById('run-gps-badge').textContent = '';
            }
            return;
        }

        if (!recovering) setPhase('acquiring');

        let firstFixReceived = false;
        weakSignalTimer = setTimeout(() => {
            if (phase === 'acquiring' && firstFixReceived) {
                setPhase('ready');
                const badge = document.getElementById('run-gps-badge');
                if (badge) { badge.textContent = badge.textContent.replace('— waiting for lock…', '⚠ weak signal'); }
                const startBtn = document.getElementById('run-start');
                if (startBtn) { startBtn.disabled = false; startBtn.textContent = ACTIVITIES[activityMode].weakBtn; }
            }
        }, GPS_WEAK_SIGNAL_TIMEOUT_MS);

        try {
            watcherId = await BGL.addWatcher(
                {
                    backgroundMessage: ACTIVITIES[activityMode].bgMsg,
                    backgroundTitle: ACTIVITIES[activityMode].bgTitle,
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 1,
                },
                (loc, err) => {
                    if (err) {
                        if (err.code === 'NOT_AUTHORIZED') {
                            clearTimeout(weakSignalTimer);
                            setPhase('acquiring');
                            document.getElementById('run-status').textContent = 'Location permission denied';
                            document.getElementById('run-gps-badge').textContent = '';
                            if (confirm('Location permission required. Open settings?')) BGL.openSettings?.();
                        } else {
                            document.getElementById('run-gps-badge').textContent = `GPS error: ${err.message}`;
                        }
                        return;
                    }

                    firstFixReceived = true;
                    const { latitude: lat, longitude: lon, accuracy, altitude } = loc;
                    const acc = Math.round(accuracy);
                    const badge = document.getElementById('run-gps-badge');

                    if (phase === 'acquiring') {
                        badge.textContent = `GPS ±${acc} m — waiting for lock…`;
                        badge.style.color = '';
                        if (accuracy <= 30) {
                            clearTimeout(weakSignalTimer);
                            setPhase('ready');
                            badge.textContent = `GPS ±${acc} m ✓`;
                            badge.style.color = 'var(--accent-success)';
                            const startBtn = document.getElementById('run-start');
                            if (startBtn) {
                                startBtn.disabled = false;
                                startBtn.textContent = ACTIVITIES[activityMode].startBtn;
                            }
                        }
                    } else if (phase === 'ready') {
                        badge.textContent = accuracy <= 30
                            ? `GPS ±${acc} m ✓`
                            : `GPS ±${acc} m ⚠`;
                        badge.style.color = accuracy <= 30 ? 'var(--accent-success)' : '';
                    } else if (phase === 'running' || phase === 'paused') {
                        badge.textContent = `GPS ±${acc} m`;
                    }

                    if (phase === 'running' && lastLat !== null) {
                        const d = haversineKm(lastLat, lastLon, lat, lon);
                        if (d < GPS_MAX_POINT_JUMP_KM) {
                            totalDistKm += d;

                            // Elevation accumulation with noise filtering
                            if (altitude != null) {
                                if (lastAlt === null) {
                                    lastAlt = altitude;
                                } else {
                                    const delta = altitude - lastAlt;
                                    if (Math.abs(delta) >= ELEV_NOISE_M) {
                                        if (delta > 0) elevGainM += delta;
                                        else elevLossM += Math.abs(delta);
                                        lastAlt = altitude;
                                    }
                                }
                            }

                            // JS-side 500m announcements (non-native path, respects silentMode)
                            if (!window.AndroidBridge && !silentMode) {
                                const halfKms = Math.floor(totalDistKm * 2);
                                if (halfKms > halfKmsAnnounced && halfKms > 0) {
                                    halfKmsAnnounced = halfKms;
                                    const elapsedSec = getElapsedMs() / 1000;
                                    const elapsedHr = elapsedSec / 3600;
                                    const distMi = totalDistKm / KM_PER_MI;
                                    const speedMph = elapsedHr > 0 ? distMi / elapsedHr : 0;
                                    const distStr = (halfKms * 0.5).toFixed(1).replace(/\.0$/, '');
                                    tts(`${distStr} kilometer${halfKms === 2 ? '' : 's'}. ${spokenDuration(elapsedSec)}. ${speedMph.toFixed(1)} miles per hour.`);
                                }
                            }
                        }
                    }

                    if (phase !== 'done') {
                        lastLat = lat;
                        lastLon = lon;
                    }
                }
            );
        } catch (e) {
            clearTimeout(weakSignalTimer);
            document.getElementById('run-status').textContent = `Failed to start GPS: ${e.message}`;
            document.getElementById('run-gps-badge').textContent = '';
        }
    }

    async function finishRun() {
        clearRunState();
        clearTimeout(weakSignalTimer);
        if (segmentStart) { totalElapsedMs += Date.now() - segmentStart; segmentStart = null; }
        stopTick();
        stopPacingTimer();

        // Prefer native elevation (tracks screen-off) over JS elevation
        let finalElevGainM = elevGainM;
        let finalElevLossM = elevLossM;
        if (window.AndroidBridge) {
            try {
                const nElev = JSON.parse(window.AndroidBridge.getNativeElevation());
                if (nElev.gainM > 0 || nElev.lossM > 0) {
                    finalElevGainM = nElev.gainM;
                    finalElevLossM = nElev.lossM;
                    elevGainM = finalElevGainM;
                    elevLossM = finalElevLossM;
                }
                // Use native distance as fallback when BGL didn't track (screen locked)
                if (nElev.distKm > totalDistKm) {
                    totalDistKm = nElev.distKm;
                }
            } catch (_) {}
        }

        window.AndroidBridge?.stopNativeRun();
        if (watcherId && BGL) {
            try { await BGL.removeWatcher({ id: watcherId }); } catch (_) {}
            watcherId = null;
        }
        setPhase('done');
        refreshDisplay();

        const dMin = totalElapsedMs / 60000;
        const distMi = totalDistKm / KM_PER_MI;
        const speedMph = dMin > 0 && distMi > 0 ? distMi / (dMin / 60) : 0;
        const paceMi = totalDistKm > 0 ? (dMin / totalDistKm) * KM_PER_MI : 0;
        const baseCalories = calcCalories(dMin, weightKg, totalDistKm, finalElevGainM, activityMode);

        // Fetch local temperature from Open-Meteo and apply a corrective factor.
        // Hot weather: cardiovascular load from thermoregulation adds ~0.5% per °F above 75°F.
        // Cold weather: shivering / cold thermogenesis adds ~0.6% per °F below 45°F.
        // Capped at +20%. No network = no adjustment (silent fallback).
        let tempF = null;
        let tempFactor = 1.0;
        if (lastLat !== null && lastLon !== null) {
            try {
                const ctrl = new AbortController();
                const tid = setTimeout(() => ctrl.abort(), 5000);
                const resp = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${lastLat.toFixed(4)}&longitude=${lastLon.toFixed(4)}&current=temperature_2m&temperature_unit=fahrenheit`,
                    { signal: ctrl.signal }
                );
                clearTimeout(tid);
                if (resp.ok) {
                    const data = await resp.json();
                    const raw = data?.current?.temperature_2m;
                    if (typeof raw === 'number') {
                        tempF = raw;
                        if (tempF > 75) {
                            tempFactor = Math.min(1.20, 1 + (tempF - 75) * 0.005);
                        } else if (tempF < 45) {
                            tempFactor = Math.min(1.20, 1 + (45 - tempF) * 0.006);
                        }
                    }
                }
            } catch (_) {}
        }

        const calories = Math.round(baseCalories * tempFactor);
        // Sync the on-screen kcal stat to the temperature-corrected final value
        const runCalEl = document.getElementById('run-calories');
        if (runCalEl) runCalEl.textContent = calories;

        tts(ACTIVITIES[activityMode].finishTts(totalDistKm.toFixed(1), speedMph.toFixed(1)));

        let saved = false;
        if (totalDistKm > MIN_RUN_FINISH_DIST_KM) {
            try {
                await db.addWorkout({
                    exercise_name: ACTIVITIES[activityMode].exerciseName,
                    exercise_type: 'Cardio',
                    duration_minutes: dMin,
                    distance_km: totalDistKm,
                    pace: paceMi,
                    estimated_calories_burned: calories,
                    sets: [],
                });
                saved = true;
                window.dispatchEvent(new CustomEvent('fp:data-changed'));
            } catch (_) {}
        }

        let tempLine = '';
        if (tempF !== null) {
            const emoji = tempF >= 95 ? '🔥' : tempF >= 75 ? '☀️' : tempF <= 32 ? '🥶' : tempF <= 45 ? '❄️' : '🌡️';
            if (tempFactor > 1.005) {
                const adj = tempF > 75 ? 'heat' : 'cold';
                tempLine = `<p class="run-temp-note">${emoji} ${Math.round(tempF)}°F — +${Math.round((tempFactor - 1) * 100)}% ${adj} adjustment</p>`;
            } else {
                tempLine = `<p class="run-temp-note">${emoji} ${Math.round(tempF)}°F — no adjustment needed</p>`;
            }
        }

        setControls(`
            <div class="run-summary">
                ${saved ? '<p class="run-saved-notice">✓ Workout saved</p>' : ''}
                ${tempLine}
                <button id="run-done" class="btn-primary run-action-btn">Done</button>
            </div>
        `);
        document.getElementById('run-done').addEventListener('click', () => {
            overlay.remove();
        });
    }

    // Wire toggle buttons
    updateToggleButtons();

    document.getElementById('run-activity-toggle').addEventListener('click', () => {
        activityMode = ACTIVITIES[activityMode].next;
        localStorage.setItem('run_activity_mode', activityMode);
        updateToggleButtons();
        // Update start button label if still in pre-run state
        const startBtn = document.getElementById('run-start');
        if (startBtn && !startBtn.disabled && phase === 'ready') {
            startBtn.textContent = ACTIVITIES[activityMode].startBtn;
        }
    });

    document.getElementById('run-pacing-toggle').addEventListener('click', () => {
        pacingMode = !pacingMode;
        localStorage.setItem('run_pacing_mode', String(pacingMode));
        updateToggleButtons();
        if (phase === 'running') {
            if (window.AndroidBridge) {
                window.AndroidBridge.setPacingMode(pacingMode);
            } else {
                if (pacingMode) startPacingTimer();
                else stopPacingTimer();
            }
        }
    });

    document.getElementById('run-silent-toggle').addEventListener('click', () => {
        silentMode = !silentMode;
        localStorage.setItem('run_silent_mode', String(silentMode));
        updateToggleButtons();
        window.AndroidBridge?.setSilentMode(silentMode);
    });

    document.getElementById('run-start').addEventListener('click', beginRun);

    document.getElementById('run-close').addEventListener('click', async () => {
        if ((phase === 'running' || phase === 'paused') && !confirm(ACTIVITIES[activityMode].closeMsg)) return;
        clearRunState();
        clearTimeout(weakSignalTimer);
        stopTick();
        stopPacingTimer();
        if (watcherId && BGL) { try { await BGL.removeWatcher({ id: watcherId }); } catch (_) {} }
        window.AndroidBridge?.stopNativeRun();
        overlay.remove();
    });

    if (recoveredState) {
        totalDistKm      = recoveredState.totalDistKm;
        halfKmsAnnounced = recoveredState.halfKmsAnnounced;
        weightKg         = recoveredState.weightKg || weightKg;
        elevGainM        = recoveredState.elevGainM || 0;
        elevLossM        = recoveredState.elevLossM || 0;

        if (recoveredState.phase === 'running') {
            totalElapsedMs = recoveredState.totalElapsedMs + (Date.now() - recoveredState.savedAt);
            segmentStart = Date.now();
            setPhase('running');
            startTick();
            startPacingTimer();
            window.AndroidBridge?.setPacingMode(pacingMode);
            setControls(`
                <button id="run-pause" class="btn-secondary run-action-btn">Pause</button>
                <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
            `);
        } else {
            totalElapsedMs = recoveredState.totalElapsedMs;
            segmentStart = null;
            setPhase('paused');
            setControls(`
                <button id="run-resume" class="btn-secondary run-action-btn">Resume</button>
                <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
            `);
        }
        wireRunControls();
        refreshDisplay();
        document.getElementById('run-gps-badge').textContent = 'Reconnecting GPS…';
        startGpsAcquisition(true);
    } else {
        startGpsAcquisition(false);
    }
}
