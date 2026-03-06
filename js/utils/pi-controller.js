/**
 * Fitness Tracker PWA - PI Controller for Running Average Mode
 *
 * Computes daily macro goal adjustments using a Proportional-Integral controller.
 * Extracted from app.js calculateEffectiveGoals() for independent testability.
 *
 * Design notes:
 * - P-term operates on BASE+WORKOUT goals (raw performance: did you hit base today?)
 * - I-term operates on STORED DISPLAYED goals (prevents limit cycles: did you hit what
 *   was shown to you?) — falls back to base+workout before history exists.
 * - Ki is derived from Ialpha to guarantee Ki × W = 1 (zero steady-state error).
 *   Users only tune Kp and Ialpha; Ki is never a free parameter.
 * - Reverse diet multiplier must be applied AFTER PI adjustments by the caller.
 * - workoutCreditFraction and workoutCreditMacros must match calculateEffectiveGoals
 *   so that the PI error signals are relative to the same adjusted goals the user saw.
 */

import { applyWorkoutCredit } from './calorie-calc.js';

/**
 * Compute PI-controller macro adjustments for a given target date.
 *
 * @param {Object} params
 * @param {Array}  params.allMacros    - All macro entries from the DB
 * @param {string} params.date         - Target date (YYYY-MM-DD)
 * @param {string} params.today        - Today's local date (YYYY-MM-DD)
 * @param {number} params.baseFat      - Base fat goal (g)
 * @param {number} params.baseProtein  - Base protein goal (g)
 * @param {number} params.baseCarbs    - Base carb goal (g)
 * @param {Object} params.reverseDietDates - Map of {date: true} for reverse-diet days
 * @param {Array}  params.allWorkouts  - All workout entries from the DB
 * @param {Object} params.goalHistory  - Stored displayed goals: {date: {fat, protein, carbs}}
 *                                       Used as I-term reference to prevent limit cycles.
 *                                       Falls back to base+workout for dates without history.
 * @param {number} params.Kp           - Proportional gain (default 0.5). P-term uses
 *                                       base+workout reference to react to yesterday's intake.
 * @param {number} params.Ialpha       - Exponential decay rate for I-term (default 0.25).
 *                                       Ki is derived: Ki = α/(1-(1-α)^N), guaranteeing
 *                                       Ki × W = 1 (zero steady-state error regardless of α).
 * @param {number} params.workoutCreditFraction - Fraction of burned calories credited (default 0.5).
 *                                               Must match calculateEffectiveGoals.
 * @param {Object} params.workoutCreditMacros   - Which macros receive credit (default all true).
 *                                               Must match calculateEffectiveGoals.
 * @returns {Object} { goalFat, goalProtein, goalCarbs, piDebug }
 */
export function computeGoalAdjustments({
    allMacros,
    date,
    today,
    baseFat,
    baseProtein,
    baseCarbs,
    reverseDietDates,
    allWorkouts = [],
    goalHistory = {},
    Kp = 0.5,
    Ialpha = 0.25,
    workoutCreditFraction = 0.5,
    workoutCreditMacros = { fat: true, protein: true, carbs: true }
}) {
    const N = 10; // history window (days)

    // Ki derived from Ialpha to guarantee Ki × W = 1 (zero steady-state error).
    // W = sum of decay weights over N days = (1 - (1-α)^N) / α
    const W = Ialpha > 0 ? (1 - Math.pow(1 - Ialpha, N)) / Ialpha : N;
    const Ki = 1 / W;

    const dateObj = new Date(date + 'T12:00:00');

    // P-term: yesterday's error vs base+workout (raw performance signal)
    const p_err = { fat: 0, protein: 0, carbs: 0 };

    // I-term: weighted errors vs stored displayed goal (limit-cycle prevention)
    const i_errors = { fat: [], protein: [], carbs: [] };

    const dayData = [];

    for (let i = 1; i <= N; i++) {
        const pastDate = new Date(dateObj);
        pastDate.setDate(pastDate.getDate() - i);
        const pastDateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;

        let dayFat, dayProtein, dayCarbs;

        if (pastDateStr > today) {
            // Future day between today and target: assume goal met exactly
            dayFat = baseFat; dayProtein = baseProtein; dayCarbs = baseCarbs;
        } else if (pastDateStr === today) {
            // Today: completed + planned (forward projection)
            const dayMacros = allMacros.filter(m => m.date === pastDateStr);
            dayFat = dayMacros.reduce((sum, m) => sum + (m.fat || 0), 0);
            dayProtein = dayMacros.reduce((sum, m) => sum + (m.protein || 0), 0);
            dayCarbs = dayMacros.reduce((sum, m) => sum + (m.carbs || 0), 0);
        } else {
            // Past day: completed only
            const dayMacros = allMacros.filter(m => m.date === pastDateStr && m.status === 'completed');
            dayFat = dayMacros.reduce((sum, m) => sum + (m.fat || 0), 0);
            dayProtein = dayMacros.reduce((sum, m) => sum + (m.protein || 0), 0);
            dayCarbs = dayMacros.reduce((sum, m) => sum + (m.carbs || 0), 0);
        }

        // Effective base+workout goal for this past day (P-term reference and I-term fallback).
        // NOTE: We use BASE goals here so the error signal is not inflated by reverse diet.
        let eFat = baseFat, eProtein = baseProtein, eCarbs = baseCarbs;
        if (reverseDietDates[pastDateStr] === true) {
            eFat *= 1.2; eProtein *= 1.2; eCarbs *= 1.2;
        }

        // Add workout credit for this past day so error is relative to the full
        // workout-adjusted goal, not just the base goal.
        // Uses the same fraction and macro selection as calculateEffectiveGoals.
        const dayWorkouts = allWorkouts.filter(w => w.date === pastDateStr);
        const dayCalsBurned = dayWorkouts.reduce((sum, w) => sum + (w.estimated_calories_burned || 0), 0);
        if (dayCalsBurned > 0) {
            const creditedGoals = applyWorkoutCredit(eFat, eProtein, eCarbs, dayCalsBurned, workoutCreditFraction, workoutCreditMacros);
            eFat     = creditedGoals.fat;
            eProtein = creditedGoals.protein;
            eCarbs   = creditedGoals.carbs;
        }

        // P-term: yesterday only, base+workout reference
        if (i === 1) {
            p_err.fat     = dayFat - eFat;
            p_err.protein = dayProtein - eProtein;
            p_err.carbs   = dayCarbs - eCarbs;
        }

        // I-term: use stored displayed goal if available, else fall back to base+workout.
        // Using the displayed goal prevents the limit cycle where the controller raises the
        // goal high enough that the person eats near base, fading the I-term memory and
        // returning the goal to base, which restarts the cycle indefinitely.
        const stored = goalHistory[pastDateStr];
        const iErrFat     = stored ? dayFat     - stored.fat     : dayFat     - eFat;
        const iErrProtein = stored ? dayProtein - stored.protein : dayProtein - eProtein;
        const iErrCarbs   = stored ? dayCarbs   - stored.carbs   : dayCarbs   - eCarbs;

        // Exponential decay: weight = (1-α)^(i-1), so yesterday (i=1) has weight 1.0
        const decayWeight = Math.pow(1 - Ialpha, i - 1);
        i_errors.fat.push(iErrFat * decayWeight);
        i_errors.protein.push(iErrProtein * decayWeight);
        i_errors.carbs.push(iErrCarbs * decayWeight);

        dayData.push({
            date: pastDateStr, fat: dayFat, protein: dayProtein, carbs: dayCarbs,
            eFat, eProtein, eCarbs, workoutCalsBurned: dayCalsBurned,
            hasStoredGoal: !!stored,
            errFat: iErrFat, errProtein: iErrProtein, errCarbs: iErrCarbs,
            decayWeight, daysBack: i
        });
    }

    // P terms (yesterday, base+workout reference)
    const p_fat     = Kp * p_err.fat;
    const p_protein = Kp * p_err.protein;
    const p_carbs   = Kp * p_err.carbs;

    // I terms: exponentially weighted sum of stored-goal errors
    const i_sum_fat     = i_errors.fat.reduce((a, b) => a + b, 0);
    const i_sum_protein = i_errors.protein.reduce((a, b) => a + b, 0);
    const i_sum_carbs   = i_errors.carbs.reduce((a, b) => a + b, 0);
    const i_fat     = Ki * i_sum_fat;
    const i_protein = Ki * i_sum_protein;
    const i_carbs   = Ki * i_sum_carbs;

    // Raw adjustment (subtracted from goal — negative rawAdj = goal raised)
    const rawAdj_fat     = p_fat + i_fat;
    const rawAdj_protein = p_protein + i_protein;
    const rawAdj_carbs   = p_carbs + i_carbs;

    // Clamp to ±33% of BASE goal (not the reverse-diet-inflated goal)
    const cap = 0.33;
    const adj_fat     = Math.max(-baseFat     * cap, Math.min(baseFat     * cap, rawAdj_fat));
    const adj_protein = Math.max(-baseProtein * cap, Math.min(baseProtein * cap, rawAdj_protein));
    const adj_carbs   = Math.max(-baseCarbs   * cap, Math.min(baseCarbs   * cap, rawAdj_carbs));

    // Apply adjustments to base goals
    const goalFat     = baseFat     - adj_fat;
    const goalProtein = baseProtein - adj_protein;
    const goalCarbs   = baseCarbs   - adj_carbs;

    const piDebug = {
        fat:     { p_err: p_err.fat,     p_adj: p_fat,     i_sum: i_sum_fat,     i_adj: i_fat,     raw_adj: rawAdj_fat,     final_adj: adj_fat,     clamped: Math.abs(rawAdj_fat)     > baseFat     * cap },
        protein: { p_err: p_err.protein, p_adj: p_protein, i_sum: i_sum_protein, i_adj: i_protein, raw_adj: rawAdj_protein, final_adj: adj_protein, clamped: Math.abs(rawAdj_protein) > baseProtein * cap },
        carbs:   { p_err: p_err.carbs,   p_adj: p_carbs,   i_sum: i_sum_carbs,   i_adj: i_carbs,   raw_adj: rawAdj_carbs,   final_adj: adj_carbs,   clamped: Math.abs(rawAdj_carbs)   > baseCarbs   * cap },
        dayData, Kp, Ki, W, Ialpha, cap
    };

    return { goalFat, goalProtein, goalCarbs, piDebug };
}
