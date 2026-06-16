/**
 * Run Tracker — Capacitor native component
 * Uses @capacitor-community/background-geolocation so GPS keeps running
 * when the screen is locked. Only active inside the native app.
 */

import { db } from '../db.js';
import { GPS_WEAK_SIGNAL_TIMEOUT_MS, GPS_MAX_POINT_JUMP_KM, MIN_RUN_FINISH_DIST_KM } from '../constants.js';

const KM_PER_MI = 1.60934;
const MET_RUNNING = 9.0;
// Altitude delta below this threshold is treated as GPS noise and ignored.
const ELEV_NOISE_M = 3.0;

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

// ACSM running formula with uphill grade correction.
// elevGainM / (distKm * 1000) gives average grade fraction.
function calcCalories(durationMinutes, weightKg, distKm, elevGainM = 0) {
    let met = MET_RUNNING;
    if (distKm > 0 && durationMinutes > 0) {
        const speedMPerMin = (distKm * 1000) / durationMinutes;
        const grade = elevGainM > 0 ? elevGainM / (distKm * 1000) : 0;
        const vo2 = 0.2 * speedMPerMin + 0.9 * grade * speedMPerMin + 3.5;
        met = vo2 / 3.5;
        met = Math.max(5, Math.min(22, met));
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
            <h2 class="run-title">🏃 Run Tracker</h2>
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
        document.getElementById('run-calories').textContent = calcCalories(dMin, weightKg, totalDistKm, elevGainM);
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
        const pacingBtn = document.getElementById('run-pacing-toggle');
        const silentBtn = document.getElementById('run-silent-toggle');
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
    function startTick() {
        stopTick();
        tickInterval = setInterval(() => {
            refreshDisplay();
            if (++tickCount % 60 === 0) {
                saveRunState(phase, totalDistKm, getElapsedMs, segmentStart, halfKmsAnnounced, weightKg, elevGainM, elevLossM);
            }
        }, 500);
    }

    function stopTick() {
        if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
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
            tts('Run paused.');
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
        tts('Run started.');
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
                if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Start Run (weak GPS)'; }
            }
        }, GPS_WEAK_SIGNAL_TIMEOUT_MS);

        try {
            watcherId = await BGL.addWatcher(
                {
                    backgroundMessage: 'Fitness Pizza is tracking your run.',
                    backgroundTitle: 'Run in progress',
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
                                startBtn.textContent = 'Start Run';
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
        const calories = calcCalories(dMin, weightKg, totalDistKm, finalElevGainM);

        tts(`Run finished. ${totalDistKm.toFixed(1)} kilometers. ${speedMph.toFixed(1)} miles per hour.`);

        let saved = false;
        if (totalDistKm > MIN_RUN_FINISH_DIST_KM) {
            try {
                await db.addWorkout({
                    exercise_name: 'Outdoor Run',
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

        setControls(`
            <div class="run-summary">
                ${saved ? '<p class="run-saved-notice">✓ Workout saved</p>' : ''}
                <button id="run-done" class="btn-primary run-action-btn">Done</button>
            </div>
        `);
        document.getElementById('run-done').addEventListener('click', () => {
            overlay.remove();
        });
    }

    // Wire toggle buttons
    updateToggleButtons();

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
        if ((phase === 'running' || phase === 'paused') && !confirm('Stop the run and close?')) return;
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
