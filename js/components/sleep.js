/**
 * Fitness Tracker PWA - Sleep: the Settings card's tracking switch.
 * Manual entry is in measurement-form.js, reading from Health Connect in health-connect.js,
 * and the charts in chart-renderer.js.
 *
 * Setting: sleep_tracking ('true' shows sleep everywhere).
 */

import { db } from '../db.js';
import * as ui from '../ui.js';

export async function isSleepTracked() {
    return (await db.getSetting('sleep_tracking')) === 'true';
}

export async function loadSleepSettings() {
    const track = document.getElementById('sleep-tracking');
    if (!track) return;
    track.checked = await isSleepTracked();
    track.onchange = async () => {
        await db.setSetting('sleep_tracking', track.checked ? 'true' : 'false');
        ui.showToast(track.checked ? 'Sleep tracking on' : 'Sleep tracking off');
    };
}
