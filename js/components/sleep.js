/**
 * Fitness Tracker PWA - Sleep: the Settings card and reading from Health Connect.
 * Manual entry is in measurement-form.js; the charts are in chart-renderer.js.
 *
 * Settings: sleep_tracking ('true' shows sleep everywhere), sleep_health_connect ('true' reads
 * from Health Connect in the Android app), sleep_hc_last_read (ms).
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { sleepEntryFromSession, formatClock } from '../utils/sleep.js';
import { logDebug } from '../utils/debug-log.js';

const plugin = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.HealthSleep : null;

// Health Connect lets an app read about 30 days back from when access was granted
const FIRST_READ_DAYS = 30;
// Re-read a few days each time: a watch can sync late, and a night can be corrected afterwards
const OVERLAP_DAYS = 3;
// Coming back to the app re-reads at most this often
const MIN_GAP_MS = 2 * 60 * 1000;

export async function isSleepTracked() {
    return (await db.getSetting('sleep_tracking')) === 'true';
}

/**
 * Read new nights from Health Connect into the measurements store.
 * @returns {Promise<number>} how many nights were added or changed
 */
export async function syncSleep({ force = false } = {}) {
    const hs = plugin();
    if (!hs || (await db.getSetting('sleep_health_connect')) !== 'true') return 0;
    const last = parseInt(await db.getSetting('sleep_hc_last_read') || '0');
    if (!force && Date.now() - last < MIN_GAP_MS) return 0;
    const since = last ? last - OVERLAP_DAYS * 86400000 : Date.now() - FIRST_READ_DAYS * 86400000;

    let sessions;
    try {
        sessions = (await hs.readSleep({ since })).sessions || [];
    } catch (e) {
        logDebug(`[sleep] read failed: ${e.message || e}`);
        return 0;
    }

    const known = new Map((await db.getMeasurementsByType('sleep')).filter(m => m.hc_id).map(m => [m.hc_id, m]));
    let changed = 0;
    for (const s of sessions) {
        const entry = sleepEntryFromSession(s);
        if (!(entry.value > 0)) continue;
        const old = known.get(s.id);
        if (!old) {
            await db.addMeasurement(entry);
            changed++;
        } else if (old.sleep_start !== entry.sleep_start || old.sleep_end !== entry.sleep_end
                   || JSON.stringify(old.stages) !== JSON.stringify(entry.stages)) {
            await db.updateMeasurement({ ...old, ...entry, id: old.id });
            changed++;
        }
    }
    await db.setSetting('sleep_hc_last_read', String(Date.now()));
    logDebug(`[sleep] read ${sessions.length} session(s), ${changed} new or changed`);
    return changed;
}

/** The Settings card: the tracking switch, and Health Connect in the Android app. */
export async function loadSleepSettings(onChanged) {
    const track = document.getElementById('sleep-tracking');
    if (!track) return;
    track.checked = await isSleepTracked();
    track.onchange = async () => {
        await db.setSetting('sleep_tracking', track.checked ? 'true' : 'false');
        ui.showSuccess(track.checked ? 'Sleep tracking on' : 'Sleep tracking off');
        onChanged?.();
    };

    const box = document.getElementById('sleep-hc');
    const hs = plugin();
    box?.classList.toggle('hidden', !hs);
    if (!hs) return;
    await renderHealthConnect(hs, onChanged);
}

async function renderHealthConnect(hs, onChanged) {
    const status = document.getElementById('sleep-hc-status');
    const connect = document.getElementById('btn-sleep-hc-connect');
    const readNow = document.getElementById('btn-sleep-hc-read');
    const stop = document.getElementById('btn-sleep-hc-disconnect');
    const show = (el, on) => el?.classList.toggle('hidden', !on);

    let st = { status: 'unsupported', granted: false };
    try { st = await hs.status(); } catch (e) { logDebug(`[sleep] status failed: ${e.message || e}`); }
    const on = (await db.getSetting('sleep_health_connect')) === 'true';

    if (st.status !== 'available') {
        status.textContent = {
            unsupported: 'Reading sleep from Health Connect needs Android 8 or later.',
            needs_update: 'Health Connect needs an update from the Play Store first.',
            not_installed: "Health Connect isn't on this phone. It's built into Android 14 and later; on older phones, install it from the Play Store."
        }[st.status] || "Health Connect isn't available.";
        show(connect, false); show(readNow, false); show(stop, false);
        return;
    }

    if (on && st.granted) {
        const last = parseInt(await db.getSetting('sleep_hc_last_read') || '0');
        const nights = (await db.getMeasurementsByType('sleep')).filter(m => m.hc_id).length;
        status.textContent = `Reading sleep from Health Connect · ${nights} night${nights === 1 ? '' : 's'}`
            + (last ? ` · last read ${formatClock(last)}` : '');
    } else {
        status.textContent = on
            ? 'Health Connect access was turned off. Connect again to keep reading sleep.'
            : 'Read sleep from Google Health (Fitbit), Samsung Health and other apps that share it with Health Connect. Read only: nothing is written back.';
    }
    show(connect, !(on && st.granted));
    show(readNow, on && st.granted);
    show(stop, on);

    connect.onclick = async () => {
        let res = { granted: false };
        try { res = await hs.requestPermission(); } catch (e) { logDebug(`[sleep] permission failed: ${e.message || e}`); }
        if (!res.granted) {
            ui.showError("Health Connect didn't allow reading sleep");
            return;
        }
        await db.setSetting('sleep_health_connect', 'true');
        await db.setSetting('sleep_tracking', 'true');
        const track = document.getElementById('sleep-tracking');
        if (track) track.checked = true;
        ui.showLoading('Reading sleep...');
        const n = await syncSleep({ force: true });
        ui.hideLoading();
        ui.showSuccess(n ? `Read ${n} night${n === 1 ? '' : 's'} of sleep` : 'Connected: no sleep in Health Connect yet');
        await renderHealthConnect(hs, onChanged);
        onChanged?.();
    };
    readNow.onclick = async () => {
        ui.showLoading('Reading sleep...');
        const n = await syncSleep({ force: true });
        ui.hideLoading();
        ui.showSuccess(n ? `${n} new or changed night${n === 1 ? '' : 's'}` : 'Nothing new');
        await renderHealthConnect(hs, onChanged);
        if (n) onChanged?.();
    };
    stop.onclick = async () => {
        await db.setSetting('sleep_health_connect', 'false');
        ui.showSuccess('Stopped reading. Nights already read stay; Health Connect\'s settings can remove access.');
        try { await hs.openSettings(); } catch (e) { /* the message above still says where */ }
        await renderHealthConnect(hs, onChanged);
    };
}
