/**
 * Fitness Tracker PWA - Sleep Utilities
 * Sleep lives in the measurements store as type 'sleep': value = hours asleep, unit 'h',
 * date = the local date she woke up, plus sleep_start / sleep_end (ms), stages (minutes:
 * deep, light, rem, awake, asleep) when the source has them, source ('manual' or
 * 'health_connect') and hc_id (Health Connect's record id, so a night is never read twice).
 */

/** Local YYYY-MM-DD for a timestamp or Date. */
export function localDate(t) {
    const d = new Date(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The YYYY-MM-DD before or after a date string. */
export function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return localDate(d);
}

/** 7.2 → "7h 12m"; 0.75 → "45m" */
export function formatSleepHours(hours) {
    const total = Math.round((hours || 0) * 60);
    const h = Math.floor(total / 60), m = total % 60;
    if (!h) return `${m}m`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Clock time of a timestamp, "23:40". */
export function formatClock(t) {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One line for a night: "7h 12m · 23:40–07:05 · deep 1h 05m" */
export function sleepSummary(m) {
    const parts = [formatSleepHours(m.value)];
    if (m.sleep_start && m.sleep_end) parts.push(`${formatClock(m.sleep_start)}–${formatClock(m.sleep_end)}`);
    if (m.stages?.deep) parts.push(`deep ${formatSleepHours(m.stages.deep / 60)}`);
    return parts.join(' · ');
}

/** A Health Connect session as a measurement entry. Hours asleep leave out time awake. */
export function sleepEntryFromSession(s) {
    const inBedMin = (s.end - s.start) / 60000;
    const awakeMin = s.stages ? (s.stages.awake || 0) : 0;
    return {
        type: 'sleep',
        value: Math.round((inBedMin - awakeMin) / 60 * 100) / 100,
        unit: 'h',
        date: localDate(s.end),
        timestamp: s.end,
        sleep_start: s.start,
        sleep_end: s.end,
        stages: s.stages || null,
        source: 'health_connect',
        hc_id: s.id,
        notes: ''
    };
}

/**
 * One night per wake-up date: the longest session that ended that day. Naps and a second app
 * reporting the same night (say Samsung Health and Google Health) don't count twice.
 * @returns {Object} { 'YYYY-MM-DD': measurement }
 */
export function nightsByDate(measurements) {
    const nights = {};
    for (const m of measurements) {
        if (m.type !== 'sleep' || !(m.value > 0)) continue;
        if (!nights[m.date] || m.value > nights[m.date].value) nights[m.date] = m;
    }
    return nights;
}

/** Hours of a clock time, counted from noon so 23:30 → 23.5 and 00:30 → 24.5 (for bedtimes). */
export function bedtimeHour(t) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    return h < 12 ? h + 24 : h;
}

/** "23:30" / "00:30" from bedtimeHour's scale. */
export function formatBedtimeHour(h) {
    const total = Math.round(h * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Pearson's r, plus a least-squares line, for paired points.
 * @param {Array<{x:number,y:number}>} pts
 * @returns {{ r:number|null, n:number, slope:number, intercept:number }}
 */
export function correlate(pts) {
    const n = pts.length;
    if (n < 3) return { r: null, n, slope: 0, intercept: 0 };
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of pts) {
        sxy += (p.x - mx) * (p.y - my);
        sxx += (p.x - mx) ** 2;
        syy += (p.y - my) ** 2;
    }
    if (!sxx || !syy) return { r: null, n, slope: 0, intercept: my };
    const slope = sxy / sxx;
    return { r: sxy / Math.sqrt(sxx * syy), n, slope, intercept: my - slope * mx };
}

/** Fewer nights than this and a correlation is mostly noise. */
export const MIN_NIGHTS = 10;

/** How much to make of an r: plain words, honest about small samples. */
export function describeLink(r, n) {
    if (r === null || n < MIN_NIGHTS) return `need ${Math.max(0, MIN_NIGHTS - n)} more nights`;
    const a = Math.abs(r);
    const dir = r > 0 ? '↑ with ↑' : '↑ with ↓';
    if (a < 0.2) return 'no real link';
    if (a < 0.4) return `weak · ${dir}`;
    if (a < 0.6) return `moderate · ${dir}`;
    return `strong · ${dir}`;
}
