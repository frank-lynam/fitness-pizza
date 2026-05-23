/**
 * Run Tracker — Capacitor native component
 * Uses @capacitor-community/background-geolocation so GPS keeps running
 * when the screen is locked. Only active inside the native app.
 */

import { db } from '../db.js';

const KM_PER_MI = 1.60934;
const MET_RUNNING = 9.0;

function haversineKm(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function fmtPace(minPerKm) {
    if (!isFinite(minPerKm) || minPerKm <= 0 || minPerKm > 60) return '--:--';
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDuration(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function calcCalories(durationMinutes, weightKg) {
    return Math.round((MET_RUNNING * 3.5 * weightKg / 200) * durationMinutes);
}

async function tts(text) {
    try {
        await window.Capacitor?.Plugins?.TextToSpeech?.speak({ text, rate: 1.0, locale: 'en-US' });
    } catch (_) {}
}

export function initRunTracker() {
    const btn = document.getElementById('btn-go-for-run');
    if (!btn) return;
    btn.addEventListener('click', () => launchRunOverlay());
}

function launchRunOverlay() {
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
                    <span id="run-pace" class="run-stat-value">--:--</span>
                    <span class="run-stat-label">min/km</span>
                </div>
                <div class="run-stat-box">
                    <span id="run-calories" class="run-stat-value">0</span>
                    <span class="run-stat-label">kcal</span>
                </div>
            </div>
        </div>
        <div id="run-controls" class="run-controls">
            <button id="run-start" class="btn-primary run-action-btn" disabled>Waiting for GPS…</button>
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
    let kmAnnounced = 0;
    let weightKg = 70;
    let tickInterval = null;

    // Use most recent weight measurement for calorie accuracy
    db.getAllMeasurements()
        .then(ms => {
            const wm = ms.filter(m => m.type === 'weight').sort((a, b) => b.timestamp - a.timestamp);
            if (wm.length) weightKg = (wm[0].value || 0) * 0.453592 || 70;
        })
        .catch(() => {});

    const BGL = window.Capacitor?.Plugins?.BackgroundGeolocation;

    function getElapsedMs() {
        return totalElapsedMs + (segmentStart ? Date.now() - segmentStart : 0);
    }

    function refreshDisplay() {
        const sec = getElapsedMs() / 1000;
        const dMin = sec / 60;
        const pace = dMin > 0 && totalDistKm > 0 ? dMin / totalDistKm : 0;
        document.getElementById('run-distance').textContent = totalDistKm.toFixed(2);
        document.getElementById('run-time').textContent = fmtDuration(sec);
        document.getElementById('run-pace').textContent = fmtPace(pace);
        document.getElementById('run-calories').textContent = calcCalories(dMin, weightKg);
    }

    function startTick() {
        stopTick();
        tickInterval = setInterval(refreshDisplay, 500);
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
        startTick();
        tts('Run started.');
        setControls(`
            <button id="run-pause" class="btn-secondary run-action-btn">Pause</button>
            <button id="run-finish" class="btn-danger run-action-btn">Finish</button>
        `);
        wireRunControls();
    }

    async function startGpsAcquisition() {
        if (!BGL) {
            document.getElementById('run-status').textContent = 'GPS unavailable — native app required';
            document.getElementById('run-gps-badge').textContent = '';
            return;
        }

        try {
            watcherId = await BGL.addWatcher(
                {
                    backgroundMessage: 'Fitness Pizza is tracking your run.',
                    backgroundTitle: 'Run in progress',
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 0,
                },
                (loc, err) => {
                    if (err) {
                        if (err.code === 'NOT_AUTHORIZED') {
                            setPhase('acquiring');
                            document.getElementById('run-status').textContent = 'Location permission denied';
                            document.getElementById('run-gps-badge').textContent = '';
                            if (confirm('Location permission required. Open settings?')) BGL.openSettings?.();
                        } else {
                            document.getElementById('run-gps-badge').textContent = `GPS error: ${err.message}`;
                        }
                        return;
                    }

                    const { latitude: lat, longitude: lon, accuracy } = loc;
                    const acc = Math.round(accuracy);
                    const badge = document.getElementById('run-gps-badge');

                    if (phase === 'acquiring') {
                        badge.textContent = `GPS ±${acc} m — waiting for lock…`;
                        badge.style.color = '';
                        if (accuracy <= 30) {
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
                        badge.textContent = `GPS ±${acc} m ✓`;
                    } else if (phase === 'running' || phase === 'paused') {
                        badge.textContent = `GPS ±${acc} m`;
                    }

                    if (phase === 'running' && lastLat !== null) {
                        const d = haversineKm(lastLat, lastLon, lat, lon);
                        if (d < 0.5) {
                            totalDistKm += d;
                            const km = Math.floor(totalDistKm);
                            if (km > kmAnnounced && km > 0) {
                                kmAnnounced = km;
                                const elapsed = getElapsedMs() / 60000;
                                const pace = elapsed > 0 && totalDistKm > 0 ? elapsed / totalDistKm : 0;
                                const pMin = Math.floor(pace);
                                const pSec = Math.round((pace - pMin) * 60);
                                tts(`${km} kilometer${km !== 1 ? 's' : ''}. Pace: ${pMin} minutes ${pSec} seconds.`);
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
            document.getElementById('run-status').textContent = `Failed to start GPS: ${e.message}`;
            document.getElementById('run-gps-badge').textContent = '';
        }
    }

    async function finishRun() {
        if (segmentStart) { totalElapsedMs += Date.now() - segmentStart; segmentStart = null; }
        stopTick();
        if (watcherId && BGL) {
            try { await BGL.removeWatcher({ id: watcherId }); } catch (_) {}
            watcherId = null;
        }
        setPhase('done');
        refreshDisplay();

        const dMin = totalElapsedMs / 60000;
        const paceMi = totalDistKm > 0 ? (dMin / totalDistKm) * KM_PER_MI : 0;
        const calories = calcCalories(dMin, weightKg);
        const paceStr = totalDistKm > 0 ? fmtPace(dMin / totalDistKm) : '--:--';

        tts(`Run finished. ${totalDistKm.toFixed(1)} kilometers. Average pace: ${paceStr} per kilometer.`);

        let saved = false;
        if (totalDistKm > 0.05) {
            try {
                await db.addWorkout({
                    exercise_name: 'Outdoor Run',
                    exercise_type: 'Cardio',
                    duration_minutes: dMin,
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
                <div class="run-summary-grid">
                    <span>Distance</span><strong>${totalDistKm.toFixed(2)} km</strong>
                    <span>Duration</span><strong>${fmtDuration(totalElapsedMs / 1000)}</strong>
                    <span>Avg Pace</span><strong>${paceStr} /km</strong>
                    <span>Calories</span><strong>~${calories} kcal</strong>
                </div>
                <button id="run-done" class="btn-primary run-action-btn" style="margin-top:16px;">Done</button>
            </div>
        `);
        document.getElementById('run-done').addEventListener('click', () => overlay.remove());
    }

    document.getElementById('run-start').addEventListener('click', beginRun);

    document.getElementById('run-close').addEventListener('click', async () => {
        if ((phase === 'running' || phase === 'paused') && !confirm('Stop the run and close?')) return;
        stopTick();
        if (watcherId && BGL) { try { await BGL.removeWatcher({ id: watcherId }); } catch (_) {} }
        overlay.remove();
    });

    // Begin GPS acquisition immediately on overlay open
    startGpsAcquisition();
}
