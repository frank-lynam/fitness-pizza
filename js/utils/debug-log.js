/**
 * Fitness Tracker PWA - Debug Log
 * Persists diagnostic lines (currently: live-updater events) to localStorage so they
 * survive the app reloads that are themselves the thing being diagnosed, and can be
 * pulled off the device without native debugging tools via Settings → About.
 */

const LOG_KEY = 'fp_debug_log';
const MAX_ENTRIES = 300;

/**
 * Record a diagnostic line. Delegates to the inline head-script logger (window.__fpLog,
 * defined at the very top of index.html, before any module loads) when present, so both
 * the earliest pre-module boot code and the rest of the app share one log and one cap.
 */
export function logDebug(msg) {
    if (typeof window.__fpLog === 'function') {
        window.__fpLog(msg);
        return;
    }
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    try {
        const log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
        log.push(line);
        while (log.length > MAX_ENTRIES) log.shift();
        localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch (e) {
        // Storage unavailable — the console.log above still happened.
    }
}

export function getDebugLog() {
    try {
        return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

export function clearDebugLog() {
    try {
        localStorage.removeItem(LOG_KEY);
    } catch (e) {
        // Ignore
    }
}
