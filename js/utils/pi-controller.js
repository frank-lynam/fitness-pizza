/**
 * Fitness Tracker PWA - PI Controller for Running Average Mode
 *
 * Computes daily macro goal adjustments using a Proportional-Integral controller.
 * Extracted from app.js calculateEffectiveGoals() for independent testability.
 *
 * Design notes:
 * - The PI controller operates on BASE goals only (not reverse-diet-inflated goals)
 * - Reverse diet multiplier must be applied AFTER PI adjustments by the caller
 * - This prevents the controller from seeing inflated goals as "under-eating"
 */

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
 * @param {Array}  params.allWorkouts  - All workout entries from the DB (for workout credit in error signal)
 * @param {number} params.Kp           - Proportional gain (default 0.5)
 * @param {number} params.Ki           - Integral gain (default 0.1)
 * @param {number} params.Ialpha       - Exponential decay rate for I-term (default 0.25)
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
    Kp = 0.5,
    Ki = 0.1,
    Ialpha = 0.25
}) {
    const dateObj = new Date(date + 'T12:00:00');

    // Collect errors for past 10 days (actual intake − effective_goal for each day)
    const errors = { fat: [], protein: [], carbs: [] };
    const dayData = [];

    for (let i = 1; i <= 10; i++) {
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

        // Effective base goal for that past day (respects its own reverse diet, but at base level)
        // NOTE: We use BASE goals here so the error signal is not inflated by reverse diet
        let eFat = baseFat, eProtein = baseProtein, eCarbs = baseCarbs;
        if (reverseDietDates[pastDateStr] === true) {
            eFat *= 1.2; eProtein *= 1.2; eCarbs *= 1.2;
        }

        // Add workout credit for this past day so error is relative to the full
        // workout-adjusted goal, not just the base goal
        const dayWorkouts = allWorkouts.filter(w => w.date === pastDateStr);
        const dayCalsBurned = dayWorkouts.reduce((sum, w) => sum + (w.estimated_calories_burned || 0), 0);
        const dayCalsCredited = dayCalsBurned / 2;
        if (dayCalsCredited > 0) {
            const baseGoalCal = eFat * 9 + eProtein * 4 + eCarbs * 4;
            if (baseGoalCal > 0) {
                eFat     += (dayCalsCredited * (eFat     * 9 / baseGoalCal)) / 9;
                eProtein += (dayCalsCredited * (eProtein * 4 / baseGoalCal)) / 4;
                eCarbs   += (dayCalsCredited * (eCarbs   * 4 / baseGoalCal)) / 4;
            }
        }

        const errFat = dayFat - eFat;
        const errProtein = dayProtein - eProtein;
        const errCarbs = dayCarbs - eCarbs;

        // Exponential decay: weight = (1-α)^(i-1), so yesterday (i=1) has weight 1.0
        const decayWeight = Math.pow(1 - Ialpha, i - 1);
        errors.fat.push(errFat * decayWeight);
        errors.protein.push(errProtein * decayWeight);
        errors.carbs.push(errCarbs * decayWeight);
        dayData.push({ date: pastDateStr, fat: dayFat, protein: dayProtein, carbs: dayCarbs,
                       eFat, eProtein, eCarbs, workoutCalsCredited: dayCalsCredited,
                       errFat, errProtein, errCarbs, decayWeight, daysBack: i });
    }

    // P terms (yesterday = errors[0], raw unweighted)
    const p_fat     = Kp * errors.fat[0];
    const p_protein = Kp * errors.protein[0];
    const p_carbs   = Kp * errors.carbs[0];

    // I terms: exponentially weighted sum (errors array is already weighted)
    const i_sum_fat     = errors.fat.reduce((a, b) => a + b, 0);
    const i_sum_protein = errors.protein.reduce((a, b) => a + b, 0);
    const i_sum_carbs   = errors.carbs.reduce((a, b) => a + b, 0);
    const i_fat     = Ki * i_sum_fat;
    const i_protein = Ki * i_sum_protein;
    const i_carbs   = Ki * i_sum_carbs;

    // Raw adjustment (subtracted from goal)
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
        fat:     { p_err: errors.fat[0],     p_adj: p_fat,     i_sum: i_sum_fat,     i_adj: i_fat,     raw_adj: rawAdj_fat,     final_adj: adj_fat,     clamped: Math.abs(rawAdj_fat)     > baseFat     * cap },
        protein: { p_err: errors.protein[0], p_adj: p_protein, i_sum: i_sum_protein, i_adj: i_protein, raw_adj: rawAdj_protein, final_adj: adj_protein, clamped: Math.abs(rawAdj_protein) > baseProtein * cap },
        carbs:   { p_err: errors.carbs[0],   p_adj: p_carbs,   i_sum: i_sum_carbs,   i_adj: i_carbs,   raw_adj: rawAdj_carbs,   final_adj: adj_carbs,   clamped: Math.abs(rawAdj_carbs)   > baseCarbs   * cap },
        dayData, Kp, Ki, Ialpha, cap
    };

    return { goalFat, goalProtein, goalCarbs, piDebug };
}
