import { KCAL_PER_LB_FAT, KCAL_PER_LB_MIN, KCAL_PER_LB_MAX } from '../constants.js';

function _localDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
}

const MIN_DAYS   = 14;
const MAX_DAYS   = 90;
const EPOCH_MS   = new Date('2020-01-01T12:00:00').getTime();
export const MS_PER_DAY = 86400000;

export function _toX(dateStr) {
    return (new Date(dateStr + 'T12:00:00').getTime() - EPOCH_MS) / MS_PER_DAY;
}

export function _linreg(points) {
    const n = points.length;
    if (n < 2) return null;
    const mx = points.reduce((s, p) => s + p[0], 0) / n;
    const my = points.reduce((s, p) => s + p[1], 0) / n;
    const denom = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    if (denom === 0) return { slope: 0, intercept: my };
    const slope = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / denom;
    return { slope, intercept: my - slope * mx };
}

// Daily logged intake, logged workout burn, and weigh-ins (lbs, last reading per date, sorted).
function _dailySeries(allCompletedMacros, allMeasurements, allWorkouts) {
    const caloriesByDate = {};
    (allCompletedMacros||[]).forEach(m => {
        const cal = (m.protein||0)*4 + (m.carbs||0)*4 + (m.fat||0)*9;
        caloriesByDate[m.date] = (caloriesByDate[m.date] || 0) + cal;
    });

    const workoutCalsByDate = {};
    (allWorkouts||[]).forEach(w => {
        if (w.estimated_calories_burned > 0)
            workoutCalsByDate[w.date] = (workoutCalsByDate[w.date]||0) + w.estimated_calories_burned;
    });

    const weightByDate = {};
    (allMeasurements||[]).filter(m => m.type === 'weight')
        .sort((a,b) => a.timestamp - b.timestamp)
        .forEach(r => { weightByDate[r.date] = r.unit === 'kg' ? r.value * 2.20462 : r.value; });
    const weights = Object.keys(weightByDate).sort().map(d => ({ date: d, lbs: weightByDate[d] }));
    return { caloriesByDate, workoutCalsByDate, weights };
}

// Logged intake and workout burn between two dates (end exclusive).
function _windowEnergy(series, startDate, endDate) {
    let totalIntake = 0, daysWithData = 0, totalWorkoutCals = 0;
    const cur = new Date(startDate + 'T12:00:00');
    const endDt = new Date(endDate + 'T12:00:00');
    while (cur < endDt) {
        const d = _localDate(cur);
        if (series.caloriesByDate[d] !== undefined) { totalIntake += series.caloriesByDate[d]; daysWithData++; }
        if (series.workoutCalsByDate[d] !== undefined) totalWorkoutCals += series.workoutCalsByDate[d];
        cur.setDate(cur.getDate() + 1);
    }
    return { totalIntake, daysWithData, totalWorkoutCals };
}

// Build per-window energy-balance estimates.
// Each estimate's `tdee` field is the REST-DAY MAINTENANCE baseline:
// logged workout calories are subtracted from the intake side so they are
// not double-counted when the caller adds today's actual workout back in.
// kcalPerLb converts weight change to calories (the learned value when there is one).
export function buildTDEEEstimates(allCompletedMacros, allMeasurements, allWorkouts, kcalPerLb = KCAL_PER_LB_FAT) {
    const series = _dailySeries(allCompletedMacros, allMeasurements, allWorkouts);
    const { weights } = series;
    if (weights.length < 2) return [];

    const estimates = [];
    for (let j = 1; j < weights.length; j++) {
        let bestI = -1;
        for (let i = j-1; i >= 0; i--) {
            const gap = Math.round((new Date(weights[j].date+'T12:00:00') - new Date(weights[i].date+'T12:00:00')) / MS_PER_DAY);
            if (gap > MAX_DAYS) break;
            if (gap >= MIN_DAYS) bestI = i;
        }
        if (bestI === -1) continue;

        const startW = weights[bestI], endW = weights[j];
        const startDt = new Date(startW.date+'T12:00:00');
        const endDt   = new Date(endW.date+'T12:00:00');
        const daysGap = Math.round((endDt - startDt) / MS_PER_DAY);

        const { totalIntake, daysWithData, totalWorkoutCals } = _windowEnergy(series, startW.date, endW.date);

        if (daysWithData < Math.max(1, Math.ceil(daysGap * 0.4))) continue;

        const scaledIntake = totalIntake * daysGap / daysWithData;
        const deltaW = endW.lbs - startW.lbs;
        // Subtract logged workout cals from intake to get rest-day maintenance.
        // Workout cals affect weight via deltaW — subtracting here separates
        // "what the body needs at rest" from "what exercise adds on top."
        const baseline = (scaledIntake - totalWorkoutCals - deltaW * kcalPerLb) / daysGap;
        if (baseline < 800 || baseline > 6000) continue;

        estimates.push({
            date: endW.date,
            tdee: Math.round(baseline),          // rest-day maintenance baseline
            avgWorkoutCals: Math.round(totalWorkoutCals / daysGap),
            daysGap,
            daysWithData,
            pctLogged: Math.round(daysWithData / daysGap * 100),
            deltaW: Math.round(deltaW * 100) / 100,
            avgIntake: Math.round(scaledIntake / daysGap),
        });
    }
    return estimates;
}

// 60-day linear regression on window end-dates → rest-day maintenance at today.
// Falls back to all estimates if fewer than 2 fall in the 60-day window.
export function computeInferredTDEE(allCompletedMacros, allMeasurements, allWorkouts, kcalPerLb = KCAL_PER_LB_FAT) {
    const estimates = buildTDEEEstimates(allCompletedMacros, allMeasurements, allWorkouts, kcalPerLb);
    if (estimates.length === 0) return null;

    const sixtyDaysAgo = _localDate(new Date(Date.now() - 60 * MS_PER_DAY));
    const pool = estimates.filter(e => e.date >= sixtyDaysAgo);
    const regPoints = (pool.length >= 2 ? pool : estimates).map(e => [_toX(e.date), e.tdee]);

    const reg = _linreg(regPoints);
    if (!reg) return null;

    const todayX = _toX(_localDate(new Date()));
    const value = Math.round(reg.slope * todayX + reg.intercept);
    return (value >= 800 && value <= 6000) ? value : null;
}

// Weighted least squares for a small model, via the normal equations.
function _wls(X, y, w) {
    const k = X[0].length;
    const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) =>
        X.reduce((s, row, i) => s + w[i] * row[a] * row[b], 0)));
    const v = Array.from({ length: k }, (_, a) => X.reduce((s, row, i) => s + w[i] * row[a] * y[i], 0));
    for (let c = 0; c < k; c++) {
        let piv = c;
        for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        [A[c], A[piv]] = [A[piv], A[c]]; [v[c], v[piv]] = [v[piv], v[c]];
        if (Math.abs(A[c][c]) < 1e-12) return null;
        for (let r = 0; r < k; r++) {
            if (r === c) continue;
            const f = A[r][c] / A[c][c];
            for (let j = 0; j < k; j++) A[r][j] -= f * A[c][j];
            v[r] -= f * v[c];
        }
    }
    return v.map((x, i) => x / A[i][i]);
}

const LEARN_DAYS = 365;          // history used for the fit
const LEARN_MIN_WINDOWS = 6;     // e.g. ~3 months of 2-week windows
const LEARN_MIN_SPREAD = 150;    // kcal/day: intake must have varied (bulk vs cut) to separate the unknowns

/**
 * Learn this person's calories per pound of weight change from their own data.
 *
 * One period of eating can't separate maintenance from calories-per-pound (one equation,
 * two unknowns); periods of clearly different intake (bulk vs cut) can. The history is cut
 * into consecutive, non-overlapping windows between weigh-ins (14-45 days, 60%+ of days
 * logged), and each gives (energy/day = intake - workouts, weight rate/day). Fit:
 *
 *     rate = c0 + c1 * (time) + energy / kcalPerLb
 *
 * i.e. weight changes by (energy - maintenance) / kcalPerLb, with maintenance allowed to
 * drift linearly over the year. Weight is the dependent variable on purpose: day-to-day
 * water-weight noise is in the weigh-ins, and regressing the other way (energy on rate)
 * would drag the answer toward zero. Clamped to physical limits.
 *
 * @returns {{kcalPerLb:number|null, raw?:number, windows:number, spread:number, reason?:string}}
 */
export function learnKcalPerLb(allCompletedMacros, allMeasurements, allWorkouts) {
    const series = _dailySeries(allCompletedMacros, allMeasurements, allWorkouts);
    const since = _localDate(new Date(Date.now() - LEARN_DAYS * MS_PER_DAY));
    const ws = series.weights.filter(w => w.date >= since);
    const gapDays = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / MS_PER_DAY);

    const rows = [];
    let s = 0;
    for (let e = 1; e < ws.length; e++) {
        const gap = gapDays(ws[s].date, ws[e].date);
        if (gap < MIN_DAYS) continue;
        if (gap > 45) { s = e; continue; }          // too long without a weigh-in: start again here
        const { totalIntake, daysWithData, totalWorkoutCals } = _windowEnergy(series, ws[s].date, ws[e].date);
        if (daysWithData >= Math.ceil(gap * 0.6)) {
            rows.push({
                t: (_toX(ws[s].date) + _toX(ws[e].date)) / 2,
                energy: (totalIntake * gap / daysWithData - totalWorkoutCals) / gap,
                rate: (ws[e].lbs - ws[s].lbs) / gap,
                gap,
            });
        }
        s = e;
    }

    const n = rows.length;
    const wSum = rows.reduce((a, r) => a + r.gap, 0);
    const eMean = n ? rows.reduce((a, r) => a + r.energy * r.gap, 0) / wSum : 0;
    const spread = n ? Math.round(Math.sqrt(rows.reduce((a, r) => a + r.gap * (r.energy - eMean) ** 2, 0) / wSum)) : 0;
    if (n < LEARN_MIN_WINDOWS) return { kcalPerLb: null, windows: n, spread, reason: 'not enough history yet' };
    if (spread < LEARN_MIN_SPREAD) return { kcalPerLb: null, windows: n, spread, reason: 'intake hasn\'t varied enough yet (needs a bulk and a cut)' };

    const tMean = rows.reduce((a, r) => a + r.t * r.gap, 0) / wSum;
    const c = _wls(rows.map(r => [1, r.t - tMean, r.energy]), rows.map(r => r.rate), rows.map(r => r.gap));
    if (!c || !(c[2] > 0)) return { kcalPerLb: null, windows: n, spread, reason: 'weight didn\'t follow intake yet' };
    const raw = 1 / c[2];
    const kcalPerLb = Math.round(Math.min(KCAL_PER_LB_MAX, Math.max(KCAL_PER_LB_MIN, raw)));
    return { kcalPerLb, raw: Math.round(raw), windows: n, spread };
}
