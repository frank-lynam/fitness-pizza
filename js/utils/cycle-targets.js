/**
 * Bulk/cut, target-weight and plain-deficit calorie targets: the base macro goals before
 * the daily PI adjustment and workout credit. Shared by calculateEffectiveGoals() (app.js),
 * the dashboard badge and the Trends over/under chart, so they all agree.
 *
 *   target calories = rest-day maintenance + rate (lb/wk) × kcal-per-lb / 7 + weight-trend correction
 *   base carbs      = (target calories − protein × 4 − fat × 9) / 4
 */

import { KCAL_PER_LB_FAT, TARGET_CLOSE_WEEKS } from '../constants.js';
import { formulaRestDayMaintenance } from './tdee-calc.js';
import { getTodayDate } from './date-utils.js';

const lbs = (m) => (m.unit === 'kg' ? m.value * 2.20462 : m.value);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Average weigh-in (lbs) over `days` days ending `offset` days before today; {avg, n}. */
export function avgWeight(measurements, days = 7, offset = 0) {
    const byDate = {};
    measurements.filter(m => m.type === 'weight').forEach(m => { byDate[m.date] = lbs(m); });
    let sum = 0, n = 0;
    for (let back = offset; back < offset + days; back++) {
        const d = new Date(); d.setDate(d.getDate() - back);
        const w = byDate[ymd(d)];
        if (w !== undefined) { sum += w; n++; }
    }
    return { avg: n ? sum / n : null, n };
}

/** Target-weight mode: lb/week toward the target, tapering as it gets close (no on/off switching). */
export function targetModeRate(targetWeight, currentLbs, maxRateLbs) {
    const r = (targetWeight - currentLbs) / TARGET_CLOSE_WEEKS;
    return Math.max(-maxRateLbs, Math.min(maxRateLbs, r));
}

/** The bulk/cut max rate (lb/wk), reading the old per-phase setting if that's all there is. */
export async function maxRateLbs(db) {
    return parseFloat(await db.getSetting('cycle_max_rate_lbs') ||
        String(parseFloat(await db.getSetting('cycle_bulk_surplus_cal') || 250) / 500));
}

/** Calories per pound in use: learned from the user's data, or the default. */
export async function kcalPerLb(db) {
    return parseFloat(await db.getSetting('kcal_per_lb')) || KCAL_PER_LB_FAT;
}

/**
 * Signed weight-change target in lb/week (negative = lose), or null when bulk/cut is off.
 * Bulk/cut: ± the max rate by phase. Target weight: tapered toward the target; 0 without data.
 */
export async function cycleRate(db, measurements) {
    if ((await db.getSetting('cycle_enabled')) !== 'true') return null;
    const max = await maxRateLbs(db);
    if ((await db.getSetting('cycle_mode') || 'cycle') === 'target') {
        const target = parseFloat(await db.getSetting('cycle_target_weight') || '0');
        const { avg } = avgWeight(measurements);
        return target > 0 && avg !== null ? targetModeRate(target, avg, max) : 0;
    }
    return (await db.getSetting('cycle_phase') || 'cut') === 'bulk' ? max : -max;
}

/**
 * Rest-day maintenance to build targets on: the estimate inferred from the user's data when
 * there is one, otherwise the formula from Body Stats. {kcal, source: 'data'|'formula'|null, date}
 */
export async function maintenanceEstimate(db, measurements, workouts = []) {
    const cached = parseFloat(await db.getSetting('inferred_maintenance_cached') || 0);
    if (cached > 0) return { kcal: cached, source: 'data', date: await db.getSetting('inferred_maintenance_date') || null };
    const weights = measurements.filter(m => m.type === 'weight').sort((a, b) => b.timestamp - a.timestamp);
    const since = new Date(); since.setDate(since.getDate() - 28);
    const recentBurn = workouts.filter(w => w.status !== 'planned' && w.date >= ymd(since))
        .reduce((s, w) => s + (w.estimated_calories_burned || 0), 0);
    const kcal = formulaRestDayMaintenance({
        sex: await db.getSetting('user_sex') || 'male',
        age: parseFloat(await db.getSetting('user_age') || 0),
        heightIn: parseFloat(await db.getSetting('user_height_in') || 0),
        weightLbs: weights.length ? lbs(weights[0]) : 0,
        activityFactor: parseFloat(await db.getSetting('tdee_activity_factor') || 0) || 1.55,
        avgWorkoutCals: recentBurn / 28,
    });
    return { kcal, source: kcal ? 'formula' : null, date: null };
}

/**
 * Base macro goals for today: the user's fat/protein/carbs, with carbs derived from the calorie
 * target when bulk/cut or deficit mode is on.
 */
export async function baseMacroGoals(db, measurements, workouts) {
    const baseFat = parseFloat(await db.getSetting('goal_fat') || 70);
    const baseProtein = parseFloat(await db.getSetting('goal_protein') || 150);
    let baseCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);
    const cycleEnabled = (await db.getSetting('cycle_enabled')) === 'true';
    const deficitMode = cycleEnabled || (await db.getSetting('deficit_mode')) === 'true';
    let maintenance = null, rate = null, targetCal = null;
    if (deficitMode) {
        maintenance = await maintenanceEstimate(db, measurements, workouts);
        if (maintenance.kcal > 0) {
            if (cycleEnabled) {
                rate = await cycleRate(db, measurements);
                // Weight-trend correction: closes the gap between actual and target rate (evaluated daily)
                const weightCorr = parseFloat(await db.getSetting('cycle_weight_correction_cal') || '0');
                targetCal = maintenance.kcal + rate * (await kcalPerLb(db)) / 7 + weightCorr;
            } else {
                targetCal = maintenance.kcal - parseFloat(await db.getSetting('deficit_cal_per_day') || 0);
            }
            baseCarbs = Math.max(0, (targetCal - baseProtein * 4 - baseFat * 9) / 4);
        }
    }
    return { baseFat, baseProtein, baseCarbs, deficitMode, cycleEnabled, maintenance, rate, targetCal };
}

/** Remember today's base goals so the Trends chart can compare past days against what they were. */
export async function recordBaseGoals(db, goals) {
    const today = getTodayDate();
    const hist = JSON.parse(await db.getSetting('base_goal_history') || '{}');
    const entry = { fat: goals.baseFat, protein: goals.baseProtein, carbs: Math.round(goals.baseCarbs * 10) / 10 };
    const prev = hist[today];
    if (prev && prev.fat === entry.fat && prev.protein === entry.protein && prev.carbs === entry.carbs) return;
    hist[today] = entry;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 400);
    Object.keys(hist).forEach(k => { if (k < ymd(cutoff)) delete hist[k]; });
    await db.setSetting('base_goal_history', JSON.stringify(hist));
}
