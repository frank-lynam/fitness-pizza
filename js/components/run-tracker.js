/**
 * Fitness Pizza – GPS Run Tracker
 * Full-screen overlay that tracks a run via geolocation, provides real-time
 * stats + TTS lap announcements, and hands off to the workout form on finish.
 */

import { db } from '../db.js';
import { showWorkoutForm } from './workout-form.js';

const KM_PER_MI      = 1.60934;
const MAX_ACCURACY_M = 50;   // reject positions worse than this
const MAX_SPEED_MPS  = 13;   // ~47 km/h – filter GPS teleports
const MIN_DIST_KM    = 0.003; // ignore sub-3 m segments (GPS jitter)

// ─── Module state ────────────────────────────────────────────────────────────
const _s = {
    open:              false,
    running:           false,  // actively accumulating time & distance
    everStarted:       false,  // has the user pressed Start at least once?
    watchId:           null,
    ticker:            null,
    elapsedMs:         0,      // accumulated running time (not counting pauses)
    runStart:          null,   // Date.now() when last resumed
    totalKm:           0,
    lastPos:           null,   // { lat, lng, ts }
    gpsReady:          false,
    lastAccuracy:      null,
    lastMinuteAnnounced: 0,
    weightLbs:         150,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _elapsed() {
    if (_s.running && _s.runStart) return _s.elapsedMs + (Date.now() - _s.runStart);
    return _s.elapsedMs;
}

function _fmtTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

function _fmtPace(minPerUnit) {
    if (!isFinite(minPerUnit) || minPerUnit <= 0) return '--';
    const m = Math.floor(minPerUnit);
    const s = Math.round((minPerUnit - m) * 60);
    return `${m}:${String(s).padStart(2,'0')}`;
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = d => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _calories(km, ms) {
    if (ms < 5000 || km < 0.01) return 0;
    const kg = _s.weightLbs * 0.453592;
    const elapsedMin = ms / 60000;
    const avgMph = (km / KM_PER_MI) / (ms / 3600000);
    // Same linear MET formula used by computeWorkoutCalories — keeps live display
    // and the workout-form estimate in sync (MET ≈ 10.2 at 6 mph, per Compendium)
    const met = Math.min(20, Math.max(3.5, 1.5 * avgMph + 1.0));
    return Math.round((met * 3.5 * kg / 200) * elapsedMin);
}

// ─── Screen Wake Lock (keeps screen on so TTS works) ─────────────────────────
let _wakeLock = null;

async function _requestWakeLock() {
    if (!('wakeLock' in navigator)) { _setWakeLockStatus(false); return; }
    try {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', () => { _wakeLock = null; _setWakeLockStatus(false); });
        _setWakeLockStatus(true);
    } catch (_) { _setWakeLockStatus(false); }
}

function _releaseWakeLock() {
    if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
}

function _setWakeLockStatus(on) {
    const el = _el('rt-wakelock');
    if (!el) return;
    if (on) {
        el.textContent = '🔆 Screen kept on';
        el.style.color = 'var(--accent-success)';
    } else {
        el.textContent = '⚠ Keep screen on for audio';
        el.style.color = 'var(--accent-warning)';
    }
}

// Re-request wake lock if page regains visibility (e.g. user switches back)
document.addEventListener('visibilitychange', () => {
    if (_s.running && !_wakeLock && document.visibilityState === 'visible') {
        _requestWakeLock();
    }
});

// ─── Audio session (belt-and-suspenders alongside wake lock) ─────────────────
// Must be started inside a user-gesture handler (button tap).
// A continuous silent oscillator at gain ~0 keeps the audio pipeline active
// so the OS doesn't suspend the audio session when the screen locks.
let _audioCtx  = null;
let _silentOsc = null;

function _startAudioSession() {
    if (_audioCtx) return;
    try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        // Inaudible continuous oscillator — never stops while run is active
        const osc  = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        gain.gain.value   = 0.001; // ~60 dB below audible; non-zero keeps pipeline active
        osc.frequency.value = 0;
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.start();
        _silentOsc = osc;
    } catch (e) { /* AudioContext unavailable */ }
}

function _stopAudioSession() {
    try { if (_silentOsc) { _silentOsc.stop(); _silentOsc = null; } } catch (_) {}
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }
}

function _speak(text) {
    if (!window.speechSynthesis) return;
    // Re-resume AudioContext if the OS suspended it (e.g. brief screen lock)
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
}

function _el(id) { return document.getElementById(id); }

// ─── Display update ───────────────────────────────────────────────────────────

function _tick() {
    if (!_s.open || !_el('rt-time')) return;

    const ms    = _elapsed();
    const elMin = ms / 60000;
    const km    = _s.totalKm;
    const mi    = km / KM_PER_MI;
    const cal   = _calories(km, ms);

    const avgMph  = elMin > 0.05 && mi > 0   ? mi  / (ms / 3600000) : 0;
    const avgPaceKm = elMin > 0.05 && km > 0 ? elMin / km            : 0;

    _el('rt-time').textContent     = _fmtTime(ms);
    _el('rt-km').textContent       = km.toFixed(2) + ' km';
    _el('rt-mi').textContent       = mi.toFixed(2) + ' mi';
    _el('rt-mph').textContent      = avgMph  > 0 ? avgMph.toFixed(1)  + ' mph'  : '--';
    _el('rt-pace').textContent     = avgPaceKm > 0 ? _fmtPace(avgPaceKm) + ' /km' : '--';
    _el('rt-cal').textContent      = cal + ' cal';

    // GPS badge
    const acc = _s.lastAccuracy;
    const gpsEl = _el('rt-gps');
    if (gpsEl && acc !== null) {
        if (acc <= 15) {
            gpsEl.textContent = '● GPS excellent (' + Math.round(acc) + ' m)';
            gpsEl.style.color = 'var(--accent-success)';
        } else if (acc <= 40) {
            gpsEl.textContent = '● GPS good (' + Math.round(acc) + ' m)';
            gpsEl.style.color = 'var(--accent-success)';
        } else {
            gpsEl.textContent = '◐ GPS poor (' + Math.round(acc) + ' m)';
            gpsEl.style.color = 'var(--accent-warning)';
        }
    }

    // TTS every completed minute while running (not on minute 0)
    if (_s.running && elMin >= 1) {
        const mark = Math.floor(elMin);
        if (mark > _s.lastMinuteAnnounced) {
            _s.lastMinuteAnnounced = mark;
            const kmText  = km.toFixed(2);
            const spdText = avgMph > 0 ? avgMph.toFixed(1) : '0';
            _speak(`Update. ${mark} ${mark === 1 ? 'minute' : 'minutes'}. ${kmText} kilometers. ${spdText} miles per hour average.`);
        }
    }
}

// ─── GPS callbacks ────────────────────────────────────────────────────────────

function _onPosition(pos) {
    _s.gpsReady      = true;
    _s.lastAccuracy  = pos.coords.accuracy;

    // Enable Start button once we have a fix
    const btn = _el('rt-start-btn');
    if (btn && btn.disabled) {
        btn.disabled = false;
        btn.style.opacity = '1';
    }

    // Only accumulate distance when actively running
    if (!_s.running) { _tick(); return; }

    if (pos.coords.accuracy > MAX_ACCURACY_M) return;

    const { latitude: lat, longitude: lng } = pos.coords;
    const now = Date.now();

    if (_s.lastPos) {
        const d  = haversine(_s.lastPos.lat, _s.lastPos.lng, lat, lng);
        const dt = (now - _s.lastPos.ts) / 1000;
        if (dt > 0) {
            const spd = (d * 1000) / dt;           // m/s
            if (spd < MAX_SPEED_MPS && d > MIN_DIST_KM) {
                _s.totalKm += d;
            }
        }
    }
    _s.lastPos = { lat, lng, ts: now };
    _tick();
}

function _onError(err) {
    const gpsEl = _el('rt-gps');
    if (!gpsEl) return;
    gpsEl.textContent = '✕ GPS error: ' + err.message;
    gpsEl.style.color = 'var(--accent-error)';
    // Let user start anyway (distance won't accumulate without GPS)
    const btn = _el('rt-start-btn');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function _toggleRunning() {
    const btn = _el('rt-start-btn');
    if (!btn) return;
    if (!_s.running) {
        _startAudioSession(); // must be called inside user gesture to unlock AudioContext
        _requestWakeLock();   // keep screen on so TTS works (also a user-gesture context)
        _s.running      = true;
        _s.everStarted  = true;
        _s.runStart     = Date.now();
        btn.textContent = '⏸ Pause';
        btn.style.background = 'var(--accent-warning)';
        // Confirmation speech: primes the engine and tells user audio is working
        setTimeout(() => _speak('Run started.'), 150);
    } else {
        _s.elapsedMs += Date.now() - _s.runStart;
        _s.running    = false;
        _s.runStart   = null;
        btn.textContent = '▶ Resume';
        btn.style.background = 'var(--accent-success)';
    }
}

function _cleanup() {
    if (_s.watchId !== null) {
        navigator.geolocation.clearWatch(_s.watchId);
        _s.watchId = null;
    }
    if (_s.ticker) { clearInterval(_s.ticker); _s.ticker = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    _stopAudioSession();
    _releaseWakeLock();
    _s.running = false;
    _s.open    = false;
}

function _closeModal() {
    _cleanup();
    const m = _el('rt-modal');
    if (m) m.remove();
}

async function _finish() {
    // Finalise elapsed time
    if (_s.running) {
        _s.elapsedMs += Date.now() - _s.runStart;
        _s.running = false;
    }

    const ms      = _s.elapsedMs;
    const km      = _s.totalKm;
    const mi      = km / KM_PER_MI;
    const elMin   = ms / 60000;
    const cal     = _calories(km, ms);
    const paceMi  = mi > 0.01 && elMin > 0 ? elMin / mi : 0; // min/mile for storage

    _cleanup();
    const m = _el('rt-modal');
    if (m) m.remove();

    // Suggest turning off high-accuracy GPS
    if (_s.gpsReady && _s.everStarted) {
        const toast = document.createElement('div');
        toast.style.cssText = [
            'position:fixed', 'bottom:76px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:1000', 'max-width:320px', 'width:calc(100% - 32px)',
            'background:var(--bg-secondary)', 'border:1px solid var(--border-primary)',
            'border-radius:12px', 'padding:12px 16px', 'font-size:13px',
            'color:var(--text-secondary)', 'text-align:center',
            'box-shadow:0 4px 20px rgba(0,0,0,.35)',
        ].join(';');
        toast.textContent = 'Run complete! Consider turning off "high-accuracy location" in your device settings to save battery.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 7000);
    }

    // Hand off to workout form with GPS-derived prefill
    await showWorkoutForm(null, null, {
        exercise_name:    'Running',
        exercise_type:    'Cardio',
        duration_minutes: Math.max(0.1, Math.round(elMin * 10) / 10),
        pace:             paceMi > 0 ? Math.round(paceMi * 10) / 10 : null,
        distance_km:      Math.round(km * 1000) / 1000,
        status:           'completed',
    });
}

// ─── Open ─────────────────────────────────────────────────────────────────────

export function initRunTracker() {
    const btn = document.getElementById('btn-go-for-run');
    if (btn) btn.addEventListener('click', _open);
}

async function _open() {
    if (_s.open) return;

    // Load latest bodyweight for calorie formula
    try {
        const allM = await db.getAllMeasurements();
        const w = allM.filter(m => m.type === 'weight').sort((a, b) => b.timestamp - a.timestamp)[0];
        if (w) _s.weightLbs = w.unit === 'kg' ? w.value * 2.20462 : w.value;
    } catch (_) { /* use default */ }

    // Reset state
    Object.assign(_s, {
        open: true, running: false, everStarted: false,
        elapsedMs: 0, runStart: null, totalKm: 0, lastPos: null,
        gpsReady: false, lastAccuracy: null, lastMinuteAnnounced: 0,
    });

    // Build overlay
    const modal = document.createElement('div');
    modal.id = 'rt-modal';
    modal.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:900',
        'background:var(--bg-primary)',
        'display:flex', 'flex-direction:column',
        'overflow:hidden', 'overscroll-behavior:contain',
    ].join(';');

    modal.innerHTML = `
<div style="display:flex;align-items:center;padding:14px 16px 12px;border-bottom:1px solid var(--border-primary);flex-shrink:0;">
  <span style="font-size:22px;margin-right:8px;">🏃</span>
  <h2 style="margin:0;font-size:18px;font-weight:700;flex:1;">Run Tracker</h2>
  <button id="rt-close-btn" style="background:none;border:none;color:var(--text-secondary);font-size:26px;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>
</div>

<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;gap:18px;overflow:auto;">

  <!-- Timer -->
  <div style="text-align:center;">
    <div id="rt-time" style="font-size:60px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:2px;color:var(--text-primary);line-height:1;">0:00</div>
    <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">elapsed time</div>
  </div>

  <!-- Stats grid -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:380px;">
    <div class="rt-stat-card">
      <div id="rt-km"   class="rt-stat-val" style="color:var(--accent-primary);">0.00 km</div>
      <div id="rt-mi"   class="rt-stat-sub">0.00 mi</div>
      <div class="rt-stat-lbl">distance</div>
    </div>
    <div class="rt-stat-card">
      <div id="rt-mph"  class="rt-stat-val" style="color:var(--accent-success);">--</div>
      <div class="rt-stat-lbl">avg speed</div>
    </div>
    <div class="rt-stat-card">
      <div id="rt-pace" class="rt-stat-val" style="color:var(--accent-warning);">--</div>
      <div class="rt-stat-lbl">avg min/km</div>
    </div>
    <div class="rt-stat-card">
      <div id="rt-cal"  class="rt-stat-val">0 cal</div>
      <div class="rt-stat-lbl">estimated</div>
    </div>
  </div>

  <!-- GPS status -->
  <div id="rt-gps" style="font-size:13px;color:var(--text-secondary);">◌ Acquiring GPS…</div>
  <!-- Wake lock status (shown after Start is tapped) -->
  <div id="rt-wakelock" style="font-size:12px;color:var(--text-secondary);"></div>

</div>

<!-- Controls -->
<div style="padding:14px 16px 20px;border-top:1px solid var(--border-primary);display:flex;flex-direction:column;gap:10px;flex-shrink:0;">
  <button id="rt-start-btn" disabled style="
    width:100%;padding:20px;font-size:24px;font-weight:800;
    background:var(--accent-success);color:#fff;
    border:none;border-radius:16px;cursor:pointer;
    opacity:0.45;transition:opacity .2s,background .2s;
  ">▶ Start Run</button>
  <button id="rt-finish-btn" style="
    width:100%;padding:13px;font-size:15px;font-weight:600;
    background:var(--bg-secondary);color:var(--text-secondary);
    border:1px solid var(--border-primary);border-radius:12px;cursor:pointer;
  ">Finish &amp; Log Workout</button>
</div>

<style>
.rt-stat-card{background:var(--bg-secondary);border-radius:12px;padding:14px;text-align:center;}
.rt-stat-val{font-size:24px;font-weight:700;line-height:1.15;}
.rt-stat-sub{font-size:13px;color:var(--text-secondary);line-height:1.2;}
.rt-stat-lbl{font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
</style>
    `;

    document.body.appendChild(modal);

    _el('rt-close-btn').addEventListener('click',  _closeModal);
    _el('rt-start-btn').addEventListener('click',  _toggleRunning);
    _el('rt-finish-btn').addEventListener('click', _finish);

    // Start GPS immediately so we have a fix before user hits Start
    if ('geolocation' in navigator) {
        _s.watchId = navigator.geolocation.watchPosition(_onPosition, _onError, {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
        });
    } else {
        const gpsEl = _el('rt-gps');
        if (gpsEl) {
            gpsEl.textContent = '✕ Geolocation not supported on this device';
            gpsEl.style.color = 'var(--accent-error)';
        }
        const btn = _el('rt-start-btn');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }

    // 1-second tick for the clock and TTS
    _s.ticker = setInterval(_tick, 1000);
}
