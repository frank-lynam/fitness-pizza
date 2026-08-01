import { KCAL_PER_LB_FAT } from '../constants.js';

function _localDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
}

const MIN_DAYS = 14;
const MAX_DAYS = 90;

export function computeInferredTDEE(allCompletedMacros, allMeasurements, allWorkouts) {
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

    if (weights.length < 2) return null;

    const estimates = [];
    for (let j = 1; j < weights.length; j++) {
        let bestI = -1;
        for (let i = j-1; i >= 0; i--) {
            const gap = Math.round((new Date(weights[j].date+'T12:00:00') - new Date(weights[i].date+'T12:00:00')) / 86400000);
            if (gap > MAX_DAYS) break;
            if (gap >= MIN_DAYS) bestI = i;
        }
        if (bestI === -1) continue;

        const startW = weights[bestI], endW = weights[j];
        const startDt = new Date(startW.date+'T12:00:00');
        const endDt   = new Date(endW.date+'T12:00:00');
        const daysGap = Math.round((endDt - startDt) / 86400000);

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
        const tdee = (scaledIntake - deltaW * KCAL_PER_LB_FAT) / daysGap;
        if (tdee < 800 || tdee > 6000) continue;

        estimates.push({ date: endW.date, tdee: Math.round(tdee), daysGap });
    }

    if (estimates.length === 0) return null;

    const thirtyDaysAgo = _localDate(new Date(Date.now() - 30 * 86400000));
    const recentPool = estimates.filter(e => e.date >= thirtyDaysAgo);
    const pool = recentPool.length > 0 ? recentPool : estimates;
    const poolW = pool.reduce((s, e) => s + e.daysGap, 0);
    return Math.round(pool.reduce((s, e) => s + e.tdee * e.daysGap, 0) / poolW);
}
