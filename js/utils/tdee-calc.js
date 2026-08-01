import { KCAL_PER_LB_FAT } from '../constants.js';

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

// Build per-window energy-balance estimates.
// Each estimate's `tdee` field is the REST-DAY MAINTENANCE baseline:
// logged workout calories are subtracted from the intake side so they are
// not double-counted when the caller adds today's actual workout back in.
export function buildTDEEEstimates(allCompletedMacros, allMeasurements, allWorkouts) {
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

        let totalIntake = 0, daysWithData = 0, totalWorkoutCals = 0;
        const cur = new Date(startDt);
        while (cur < endDt) {
            const d = _localDate(cur);
            if (caloriesByDate[d] !== undefined) { totalIntake += caloriesByDate[d]; daysWithData++; }
            if (workoutCalsByDate[d] !== undefined) { totalWorkoutCals += workoutCalsByDate[d]; }
            cur.setDate(cur.getDate() + 1);
        }

        if (daysWithData < Math.max(1, Math.ceil(daysGap * 0.4))) continue;

        const scaledIntake = totalIntake * daysGap / daysWithData;
        const deltaW = endW.lbs - startW.lbs;
        // Subtract logged workout cals from intake to get rest-day maintenance.
        // Workout cals affect weight via deltaW — subtracting here separates
        // "what the body needs at rest" from "what exercise adds on top."
        const baseline = (scaledIntake - totalWorkoutCals - deltaW * KCAL_PER_LB_FAT) / daysGap;
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
export function computeInferredTDEE(allCompletedMacros, allMeasurements, allWorkouts) {
    const estimates = buildTDEEEstimates(allCompletedMacros, allMeasurements, allWorkouts);
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
