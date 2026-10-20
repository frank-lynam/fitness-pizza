/**
 * Fitness Pizza - Health Connect (Android app only): reads sleep and workouts written there by
 * Google Health (Fitbit), Samsung Health and others. Read only; nothing is written back.
 *
 * Settings: sleep_health_connect / workouts_health_connect ('true' = read it),
 * sleep_hc_last_read / workouts_hc_last_read (ms). Entries read from Health Connect carry
 * source 'health_connect' and hc_id (its record id), so nothing is ever added twice.
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { sleepEntryFromSession, formatClock, localDate } from '../utils/sleep.js';
import { estimateWorkoutCalories } from '../utils/calorie-calc.js';
import { logDebug } from '../utils/debug-log.js';

const KM_PER_MI = 1.60934;
const plugin = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.HealthSleep : null;

// Health Connect lets an app read about 30 days back from when access was granted
const FIRST_READ_DAYS = 30;
// Re-read a few days each time: a watch can sync late, and entries can be corrected afterwards
const OVERLAP_DAYS = 3;
// Coming back to the app re-reads at most this often
const MIN_GAP_MS = 2 * 60 * 1000;

const KINDS = {
    sleep: {
        setting: 'sleep_health_connect', lastRead: 'sleep_hc_last_read', label: 'sleep',
        read: (hs, since) => hs.readSleep({ since }).then(r => r.sessions || []),
        existing: async () => (await db.getMeasurementsByType('sleep')).filter(m => m.hc_id),
        toEntry: async (s) => sleepEntryFromSession(s),
        same: (a, b) => a.sleep_start === b.sleep_start && a.sleep_end === b.sleep_end
            && JSON.stringify(a.stages) === JSON.stringify(b.stages),
        add: (e) => db.addMeasurement(e),
        update: (e) => db.updateMeasurement(e)
    },
    workouts: {
        setting: 'workouts_health_connect', lastRead: 'workouts_hc_last_read', label: 'workouts',
        read: (hs, since) => hs.readWorkouts({ since }).then(r => r.workouts || []),
        existing: async () => (await db.getAllWorkouts()).filter(w => w.hc_id),
        toEntry: workoutEntryFromSession,
        same: (a, b) => a.timestamp === b.timestamp && a.duration_minutes === b.duration_minutes
            && a.estimated_calories_burned === b.estimated_calories_burned && a.distance_km === b.distance_km,
        add: (e) => db.addWorkout(e),
        update: (e) => db.updateWorkout(e)
    }
};

let _weightLbs = null;      // for estimating calories when a workout comes without any

/**
 * A Health Connect workout as a workout entry. Calories are what the watch recorded during it
 * (total, like the app's own estimates; else active); with neither, the app estimates them.
 */
async function workoutEntryFromSession(w) {
    const name = (w.title || '').trim() || w.name;
    const minutes = Math.round((w.end - w.start) / 6000) / 10;
    const km = w.distanceM > 0 ? Math.round(w.distanceM) / 1000 : null;
    let kcal = w.totalKcal > 0 ? w.totalKcal : w.activeKcal > 0 ? w.activeKcal : null;
    if (kcal == null) {
        _weightLbs ??= await db.getLatestWeight();
        kcal = estimateWorkoutCalories(name, minutes, [], _weightLbs);
    }
    logDebug(`[hc] workout ${name} ${minutes}min total=${w.totalKcal ?? '-'} active=${w.activeKcal ?? '-'} m=${w.distanceM ?? '-'} from ${w.source}`);
    return {
        exercise_name: name,
        exercise_type: w.kind,
        duration_minutes: minutes,
        distance_km: km,
        pace: km && w.kind === 'Cardio' ? Math.round(minutes / (km / KM_PER_MI) * 100) / 100 : null,
        estimated_calories_burned: Math.round(kcal),
        date: localDate(w.start),
        timestamp: w.start,
        status: 'completed',
        sets: [],
        source: 'health_connect',
        hc_id: w.id
    };
}

async function syncKind(hs, kind, force) {
    const k = KINDS[kind];
    if ((await db.getSetting(k.setting)) !== 'true') return 0;
    const last = parseInt(await db.getSetting(k.lastRead) || '0');
    if (!force && Date.now() - last < MIN_GAP_MS) return 0;
    const since = last ? last - OVERLAP_DAYS * 86400000 : Date.now() - FIRST_READ_DAYS * 86400000;

    let items;
    try {
        items = await k.read(hs, since);
    } catch (e) {
        logDebug(`[hc] ${kind} read failed: ${e.message || e}`);
        return 0;
    }
    const known = new Map((await k.existing()).map(m => [m.hc_id, m]));
    let changed = 0;
    for (const item of items) {
        const entry = await k.toEntry(item);
        if (kind === 'sleep' && !(entry.value > 0)) continue;
        const old = known.get(item.id);
        if (!old) {
            await k.add(entry);
            changed++;
        } else if (!k.same(old, entry)) {
            // Keep what was changed by hand in the app (a star, a planned/completed tick)
            await k.update({ ...old, ...entry, id: old.id, starred: old.starred, status: old.status ?? entry.status });
            changed++;
        }
    }
    await db.setSetting(k.lastRead, String(Date.now()));
    logDebug(`[hc] read ${items.length} ${k.label}, ${changed} new or changed`);
    return changed;
}

/**
 * Read new sleep and workouts from Health Connect (whichever are switched on). Screens refresh
 * when anything changed.
 * @returns {Promise<{sleep:number, workouts:number}>}
 */
export async function syncHealthConnect({ force = false } = {}) {
    const hs = plugin();
    const out = { sleep: 0, workouts: 0 };
    if (!hs) return out;
    _weightLbs = null;
    for (const kind of Object.keys(KINDS)) out[kind] = await syncKind(hs, kind, force);
    if (out.sleep || out.workouts) window.dispatchEvent(new CustomEvent('fp:data-changed'));
    return out;
}

/** The Settings card: a switch per kind, the status, Read Now, and Health Connect's own settings. */
export async function loadHealthConnectSettings() {
    const card = document.getElementById('health-connect-settings');
    const hs = plugin();
    card?.classList.toggle('hidden', !hs);
    if (!card || !hs) return;

    const status = document.getElementById('hc-status');
    const kindsBox = document.getElementById('hc-kinds');
    const readNow = document.getElementById('btn-hc-read');
    const openSettings = document.getElementById('btn-hc-settings');
    const boxes = { sleep: document.getElementById('hc-sleep'), workouts: document.getElementById('hc-workouts') };
    const show = (el, on) => el?.classList.toggle('hidden', !on);

    let st = { status: 'unsupported' };
    try { st = await hs.status(); } catch (e) { logDebug(`[hc] status failed: ${e.message || e}`); }
    if (st.status !== 'available') {
        status.textContent = {
            unsupported: 'Reading from Health Connect needs Android 8 or later.',
            needs_update: 'Health Connect needs an update from the Play Store first.',
            not_installed: "Health Connect isn't on this phone. It's built into Android 14 and later; on older phones, install it from the Play Store."
        }[st.status] || "Health Connect isn't available.";
        show(kindsBox, false); show(readNow, false); show(openSettings, false);
        return;
    }
    show(kindsBox, true);

    // A switch is on when it's turned on here and Health Connect still allows it
    const on = {};
    const revoked = [];
    for (const kind of Object.keys(KINDS)) {
        const wanted = (await db.getSetting(KINDS[kind].setting)) === 'true';
        on[kind] = wanted && !!st[kind];
        if (wanted && !st[kind]) revoked.push(KINDS[kind].label);
        boxes[kind].checked = on[kind];
    }
    const any = on.sleep || on.workouts;

    if (revoked.length) {
        status.textContent = `Health Connect access to ${revoked.join(' and ')} was turned off. Switch it on again to keep reading.`;
    } else if (any) {
        const nights = on.sleep ? (await db.getMeasurementsByType('sleep')).filter(m => m.hc_id).length : 0;
        const workouts = on.workouts ? (await db.getAllWorkouts()).filter(w => w.hc_id).length : 0;
        const last = Math.max(parseInt(await db.getSetting('sleep_hc_last_read') || '0'),
                              parseInt(await db.getSetting('workouts_hc_last_read') || '0'));
        status.textContent = ['Reading from Health Connect',
            on.sleep && `${nights} night${nights === 1 ? '' : 's'}`,
            on.workouts && `${workouts} workout${workouts === 1 ? '' : 's'}`,
            last && `last read ${formatClock(last)}`].filter(Boolean).join(' · ');
    } else {
        status.textContent = 'Read sleep and workouts from Google Health (Fitbit), Samsung Health and other apps that share them with Health Connect. Read only: nothing is written back.';
    }
    show(readNow, any);
    show(openSettings, true);

    for (const kind of Object.keys(KINDS)) {
        boxes[kind].onchange = async () => {
            const k = KINDS[kind];
            if (!boxes[kind].checked) {
                await db.setSetting(k.setting, 'false');
                ui.showToast(`Stopped reading ${k.label}. What's already here stays.`);
                return loadHealthConnectSettings();
            }
            let res = {};
            try { res = await hs.requestPermission({ kinds: [kind] }); } catch (e) { logDebug(`[hc] permission failed: ${e.message || e}`); }
            if (!res[kind]) {
                boxes[kind].checked = false;
                ui.showError(`Health Connect didn't allow reading ${k.label}`);
                return;
            }
            await db.setSetting(k.setting, 'true');
            if (kind === 'sleep') {
                await db.setSetting('sleep_tracking', 'true');
                const track = document.getElementById('sleep-tracking');
                if (track) track.checked = true;
            }
            ui.showLoading(`Reading ${k.label}...`);
            const n = await syncKind(hs, kind, true);
            ui.hideLoading();
            ui.showToast(n ? `Read ${n} ${kind === 'sleep' ? `night${n === 1 ? '' : 's'}` : `workout${n === 1 ? '' : 's'}`}`
                             : `Connected: no ${k.label} in Health Connect yet`);
            if (n) window.dispatchEvent(new CustomEvent('fp:data-changed'));
            await loadHealthConnectSettings();
        };
    }
    readNow.onclick = async () => {
        ui.showLoading('Reading from Health Connect...');
        const n = await syncHealthConnect({ force: true });
        ui.hideLoading();
        const parts = [n.sleep && `${n.sleep} night${n.sleep === 1 ? '' : 's'}`,
                       n.workouts && `${n.workouts} workout${n.workouts === 1 ? '' : 's'}`].filter(Boolean);
        ui.showToast(parts.length ? `New or changed: ${parts.join(', ')}` : 'Nothing new');
        await loadHealthConnectSettings();
    };
    openSettings.onclick = async () => {
        try { await hs.openSettings(); } catch (e) { ui.showError("Couldn't open Health Connect"); }
    };
}
