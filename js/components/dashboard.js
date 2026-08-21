/**
 * Fitness Tracker PWA - Dashboard Component
 * Extracted from app.js loadDashboard() method
 */

import { db } from '../db.js';
import * as ui from '../ui.js';

/**
 * Load dashboard screen
 * @param {string} date - Date to display (YYYY-MM-DD), i.e. this.currentDate
 * @param {Function} getGoals - Returns effective goals (replaces this.calculateEffectiveGoals())
 * @param {Function} loadRecentActivity - Loads recent activity (replaces this.loadRecentActivity())
 */
export async function loadDashboard(date, getGoals, loadRecentActivity) {
    console.log('Loading dashboard...');

    try {
        const today = date;
        const isCheatDay = (JSON.parse(await db.getSetting('cheat_day_dates') || '{}'))[today] === true;

        // Load today's macros (completed and planned separately)
        const macros = await db.getMacrosByDate(today);
        const completedMacros = macros.filter(m => m.status === 'completed');
        const plannedMacros = macros.filter(m => m.status === 'planned');

        const totalProtein = completedMacros.reduce((sum, m) => sum + m.protein, 0);
        const totalCarbs = completedMacros.reduce((sum, m) => sum + m.carbs, 0);
        const totalFat = completedMacros.reduce((sum, m) => sum + m.fat, 0);
        const totalCalories = completedMacros.reduce((sum, m) => sum + m.calories, 0);

        // Calories from calorie-only entries (no macro breakdown) — shown as grey "unallocated" segment
        const calOnlyCalories = completedMacros
            .filter(m => m.entry_mode === 'calories')
            .reduce((sum, m) => sum + m.calories, 0);

        const plannedProtein = plannedMacros.reduce((sum, m) => sum + m.protein, 0);
        const plannedCarbs = plannedMacros.reduce((sum, m) => sum + m.carbs, 0);
        const plannedFat = plannedMacros.reduce((sum, m) => sum + m.fat, 0);
        const plannedCalories = plannedMacros.reduce((sum, m) => sum + m.calories, 0);

        // Load today's workouts — only completed ones count toward calorie burn
        const workouts = await db.getWorkoutsByDate(today);
        const totalCaloriesBurned = workouts
            .filter(w => w.status !== 'planned')
            .reduce((sum, w) => sum + w.estimated_calories_burned, 0);

        // Calculate calorie balance
        const calorieBalance = totalCalories - totalCaloriesBurned;

        // Get daily goals with reverse diet and running average adjustments
        const goals = await getGoals();
        const goalFat = goals.fat;
        const goalProtein = goals.protein;
        const goalCarbs = goals.carbs;
        const goalCalories = goals.calories;
        const calOnlyCaloriesPercent = goalCalories > 0 ? (calOnlyCalories / goalCalories) * 100 : 0;

        // Calculate RAW percentages for completed (can exceed 100%)
        let fatPercent = (totalFat / goalFat) * 100;
        let proteinPercent = (totalProtein / goalProtein) * 100;
        let carbsPercent = (totalCarbs / goalCarbs) * 100;

        // Calculate RAW percentages for planned
        let plannedFatPercent = (plannedFat / goalFat) * 100;
        let plannedProteinPercent = (plannedProtein / goalProtein) * 100;
        let plannedCarbsPercent = (plannedCarbs / goalCarbs) * 100;
        let plannedCaloriesPercent = (plannedCalories / goalCalories) * 100;

        // Calculate total percentages including planned
        let totalFatPercent = fatPercent + plannedFatPercent;
        let totalCarbsPercent = carbsPercent + plannedCarbsPercent;
        let totalProteinPercent = proteinPercent + plannedProteinPercent;

        // Calculate calorie contributions from each macro for stacked bar
        const fatCalories = totalFat * 9;
        const carbsCalories = totalCarbs * 4;
        const proteinCalories = totalProtein * 4;
        const totalMacroCalories = fatCalories + carbsCalories + proteinCalories;

        // Calculate individual widths as percentage of goal calories
        let fatCaloriesPercent = (fatCalories / goalCalories) * 100;
        let carbsCaloriesPercent = (carbsCalories / goalCalories) * 100;
        let proteinCaloriesPercent = (proteinCalories / goalCalories) * 100;

        // If total exceeds 100%, scale down proportionally
        const totalPercent = fatCaloriesPercent + carbsCaloriesPercent + proteinCaloriesPercent;
        if (totalPercent > 100) {
            const scale = 100 / totalPercent;
            fatCaloriesPercent *= scale;
            carbsCaloriesPercent *= scale;
            proteinCaloriesPercent *= scale;
        }

        // Calculate left positions for horizontal stacking
        const fatLeft = 0;
        const carbsLeft = fatCaloriesPercent;
        const proteinLeft = fatCaloriesPercent + carbsCaloriesPercent;

        // Calculate planned calorie contributions from each macro
        const plannedFatCalories = plannedFat * 9;
        const plannedCarbsCalories = plannedCarbs * 4;
        const plannedProteinCalories = plannedProtein * 4;

        // Calculate planned widths as percentage of goal calories
        const plannedFatCaloriesPercent = (plannedFatCalories / goalCalories) * 100;
        const plannedCarbsCaloriesPercent = (plannedCarbsCalories / goalCalories) * 100;
        const plannedProteinCaloriesPercent = (plannedProteinCalories / goalCalories) * 100;

        // Calculate total calorie percent (intake + planned)
        let totalCaloriesPercent = (totalCalories / goalCalories) * 100;
        let totalWithPlannedCaloriesPercent = totalCaloriesPercent + plannedCaloriesPercent;

        // Cheat day: force all bars to exactly 100% full, no planned overlay, no overflow
        if (isCheatDay) {
            fatPercent = 100; carbsPercent = 100; proteinPercent = 100;
            plannedFatPercent = 0; plannedCarbsPercent = 0; plannedProteinPercent = 0; plannedCaloriesPercent = 0;
            totalFatPercent = 100; totalCarbsPercent = 100; totalProteinPercent = 100;
            // Scale calorie stacked bar to fill 100%, preserving macro ratios
            const cfs = fatCaloriesPercent + carbsCaloriesPercent + proteinCaloriesPercent;
            if (cfs > 0) {
                const s = 100 / cfs;
                fatCaloriesPercent *= s; carbsCaloriesPercent *= s; proteinCaloriesPercent *= s;
            } else {
                fatCaloriesPercent = 100; carbsCaloriesPercent = 0; proteinCaloriesPercent = 0;
            }
            totalCaloriesPercent = 100; totalWithPlannedCaloriesPercent = 100;
        }

        // Per-macro workout credit marker positions (only shown on bars that received credit).
        // Position = (credit grams / goal grams) — the fraction of the bar that is "workout bonus".
        const workoutCreditFat_g     = goals.workoutCreditFat_g     || 0;
        const workoutCreditProtein_g = goals.workoutCreditProtein_g || 0;
        const workoutCreditCarbs_g   = goals.workoutCreditCarbs_g   || 0;

        // Planned workout credit (right-side extension showing potential budget if planned workouts complete)
        const plannedWOCreditFat_g     = goals.plannedWorkoutCreditFat_g     || 0;
        const plannedWOCreditProtein_g = goals.plannedWorkoutCreditProtein_g || 0;
        const plannedWOCreditCarbs_g   = goals.plannedWorkoutCreditCarbs_g   || 0;
        const plannedWOCalCredited     = goals.plannedCaloriesCreditedFromPlanned || 0;
        const plannedWOFatPct     = goalFat     > 0 ? (plannedWOCreditFat_g     / goalFat    ) * 100 : 0;
        const plannedWOProteinPct = goalProtein > 0 ? (plannedWOCreditProtein_g / goalProtein) * 100 : 0;
        const plannedWOCarbsPct   = goalCarbs   > 0 ? (plannedWOCreditCarbs_g   / goalCarbs  ) * 100 : 0;
        const plannedWOCalPct     = goalCalories > 0 ? (plannedWOCalCredited      / goalCalories) * 100 : 0;
        const maxPlannedWOPct     = Math.max(plannedWOFatPct, plannedWOProteinPct, plannedWOCarbsPct, plannedWOCalPct);

        // Find the maximum percentage across ALL bars (to determine if scaling is needed)
        const maxPercent = Math.max(
            totalFatPercent,
            totalCarbsPercent,
            totalProteinPercent,
            totalWithPlannedCaloriesPercent
        );

        // Determine scale factor: if any bar exceeds 100%, extend for overflow; always extend right for planned workout credit
        // Scale = whichever is larger: overflow content OR (100% + planned workout credit extension)
        // They don't compound — the bigger one wins so bars only shrink once
        const scale = Math.max(maxPercent, 100 + maxPlannedWOPct);
        const needsScaling = maxPercent > 100;
        const hasPlanWOCredit = maxPlannedWOPct > 0;

        // Calculate the position of the 100% marker (as percentage of bar width)
        const marker100Percent = (needsScaling || hasPlanWOCredit) ? (100 / scale) * 100 : 100;

        // Scaled per-macro workout credit marker positions (0 = no marker for that bar)
        const scaledFatWorkoutCredit     = workoutCreditFat_g     > 0 && goalFat     > 0 ? (workoutCreditFat_g     / goalFat     * 100 / scale) * 100 : 0;
        const scaledProteinWorkoutCredit = workoutCreditProtein_g > 0 && goalProtein > 0 ? (workoutCreditProtein_g / goalProtein * 100 / scale) * 100 : 0;
        const scaledCarbsWorkoutCredit   = workoutCreditCarbs_g   > 0 && goalCarbs   > 0 ? (workoutCreditCarbs_g   / goalCarbs   * 100 / scale) * 100 : 0;
        // Calories bar uses total credited calories (sum of all macro contributions)
        const scaledCaloriesWorkoutCredit = goals.caloriesCredited > 0 && goalCalories > 0 ? (goals.caloriesCredited / goalCalories * 100 / scale) * 100 : 0;

        // Scaled planned workout credit widths for right-side extension
        const scaledFatPlanWO     = plannedWOFatPct     > 0 ? (plannedWOFatPct     / scale) * 100 : 0;
        const scaledProteinPlanWO = plannedWOProteinPct > 0 ? (plannedWOProteinPct / scale) * 100 : 0;
        const scaledCarbsPlanWO   = plannedWOCarbsPct   > 0 ? (plannedWOCarbsPct   / scale) * 100 : 0;
        const scaledCalPlanWO     = plannedWOCalPct     > 0 ? (plannedWOCalPct     / scale) * 100 : 0;

        // Helper function to calculate bar dimensions with scaling
        function calculateBarDimensions(completedPercent, plannedPercent) {
            const total = completedPercent + plannedPercent;
            const scaledCompleted = (completedPercent / scale) * 100;
            const scaledPlanned = (plannedPercent / scale) * 100;
            const scaledTotal = (total / scale) * 100;

            // Split into normal (up to 100%) and overflow (past 100%) portions
            const completedNormal = Math.min(completedPercent, 100);
            const completedOverflow = Math.max(0, completedPercent - 100);
            const totalOverflow = Math.max(0, total - 100);

            return {
                scaledCompleted,
                scaledPlanned,
                scaledTotal,
                completedNormal: (completedNormal / scale) * 100,
                completedOverflow: (completedOverflow / scale) * 100,
                plannedOverflow: (Math.max(0, total - Math.max(completedPercent, 100)) / scale) * 100,
                hasOverflow: total > 100
            };
        }

        // Calculate dimensions for each bar
        const fatDim = calculateBarDimensions(fatPercent, plannedFatPercent);
        const carbsDim = calculateBarDimensions(carbsPercent, plannedCarbsPercent);
        const proteinDim = calculateBarDimensions(proteinPercent, plannedProteinPercent);
        const caloriesDim = calculateBarDimensions(totalCaloriesPercent, plannedCaloriesPercent);

        // Pre-compute right-side label text for each bar
        const fatRightLabel = isCheatDay ? 'Cheat Day'
            : ((goalFat + plannedWOCreditFat_g) - totalFat - plannedFat >= 0
                ? Math.max(0, (goalFat + plannedWOCreditFat_g) - totalFat - plannedFat).toFixed(0) + 'g left'
                : '+' + Math.abs((goalFat + plannedWOCreditFat_g) - totalFat - plannedFat).toFixed(0) + 'g over');
        const fatRightClass = !isCheatDay && (goalFat + plannedWOCreditFat_g) - totalFat - plannedFat < 0 ? 'over-target' : '';
        const carbsRightLabel = isCheatDay ? 'Cheat Day'
            : ((goalCarbs + plannedWOCreditCarbs_g) - totalCarbs - plannedCarbs >= 0
                ? Math.max(0, (goalCarbs + plannedWOCreditCarbs_g) - totalCarbs - plannedCarbs).toFixed(0) + 'g left'
                : '+' + Math.abs((goalCarbs + plannedWOCreditCarbs_g) - totalCarbs - plannedCarbs).toFixed(0) + 'g over');
        const carbsRightClass = !isCheatDay && (goalCarbs + plannedWOCreditCarbs_g) - totalCarbs - plannedCarbs < 0 ? 'over-target' : '';
        const proteinRightLabel = isCheatDay ? 'Cheat Day'
            : ((goalProtein + plannedWOCreditProtein_g) - totalProtein - plannedProtein >= 0
                ? Math.max(0, (goalProtein + plannedWOCreditProtein_g) - totalProtein - plannedProtein).toFixed(0) + 'g left'
                : '+' + Math.abs((goalProtein + plannedWOCreditProtein_g) - totalProtein - plannedProtein).toFixed(0) + 'g over');
        const proteinRightClass = !isCheatDay && (goalProtein + plannedWOCreditProtein_g) - totalProtein - plannedProtein < 0 ? 'over-target' : '';
        const calRightLabel = isCheatDay ? 'Cheat Day'
            : ((goalCalories + plannedWOCalCredited) - totalCalories - plannedCalories >= 0
                ? Math.max(0, (goalCalories + plannedWOCalCredited) - totalCalories - plannedCalories).toFixed(0) + ' left'
                : '+' + Math.abs((goalCalories + plannedWOCalCredited) - totalCalories - plannedCalories).toFixed(0) + ' over');
        const calRightClass = !isCheatDay && (goalCalories + plannedWOCalCredited) - totalCalories - plannedCalories < 0 ? 'over-target' : '';

        // Display today's macros (Fat → Protein → Carbs order, no fiber on dashboard)
        const macrosSummary = document.getElementById('today-macros-summary');
        if (macrosSummary) {
            macrosSummary.innerHTML = `
                <div class="macro-summary-compact">
                    <!-- Fat Progress Bar -->
                    <div class="macro-progress-item">
                        <div class="progress-bar-wide">
                            <!-- Planned ghost -->
                            ${fatDim.scaledPlanned > 0 ? `<div class="progress-fill fat-planned" style="width: ${fatDim.scaledTotal}%; z-index: 1;"></div>` : ''}
                            <!-- Normal portion (up to 100%) -->
                            ${fatDim.completedNormal > 0 ? `<div class="progress-fill fat" style="width: ${fatDim.completedNormal}%; z-index: 2;"></div>` : ''}
                            <!-- Overflow portion (past 100%) -->
                            ${fatDim.hasOverflow ? `<div class="progress-fill-overflow fat" style="left: ${marker100Percent}%; width: ${fatDim.scaledTotal - marker100Percent}%; z-index: 2;"></div>` : ''}
                            <!-- Planned workout credit (right-side extension) -->
                            ${scaledFatPlanWO > 0 ? `<div class="progress-planned-wo-credit" style="left: ${marker100Percent}%; width: ${scaledFatPlanWO}%; z-index: 1;"></div>` : ''}
                            <!-- 100% marker line -->
                            ${(needsScaling || hasPlanWOCredit) ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                            <!-- Workout credit marker (only shown if fat receives workout credit) -->
                            ${scaledFatWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledFatWorkoutCredit}%;"></div>` : ''}
                            <!-- Labels (always visible) -->
                            <span class="progress-label">Fat: ${plannedFat > 0 ? totalFat.toFixed(0) + ' / ' : ''}${(totalFat + plannedFat).toFixed(0)}g</span>
                            <span class="progress-value ${fatRightClass}">${fatRightLabel}</span>
                        </div>
                    </div>
                    <!-- Carbs Progress Bar -->
                    <div class="macro-progress-item">
                        <div class="progress-bar-wide">
                            <!-- Planned ghost -->
                            ${carbsDim.scaledPlanned > 0 ? `<div class="progress-fill carbs-planned" style="width: ${carbsDim.scaledTotal}%; z-index: 1;"></div>` : ''}
                            <!-- Normal portion -->
                            ${carbsDim.completedNormal > 0 ? `<div class="progress-fill carbs" style="width: ${carbsDim.completedNormal}%; z-index: 2;"></div>` : ''}
                            <!-- Overflow portion -->
                            ${carbsDim.hasOverflow ? `<div class="progress-fill-overflow carbs" style="left: ${marker100Percent}%; width: ${carbsDim.scaledTotal - marker100Percent}%; z-index: 2;"></div>` : ''}
                            <!-- Planned workout credit (right-side extension) -->
                            ${scaledCarbsPlanWO > 0 ? `<div class="progress-planned-wo-credit" style="left: ${marker100Percent}%; width: ${scaledCarbsPlanWO}%; z-index: 1;"></div>` : ''}
                            <!-- 100% marker -->
                            ${(needsScaling || hasPlanWOCredit) ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                            <!-- Workout credit marker (only shown if carbs receives workout credit) -->
                            ${scaledCarbsWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledCarbsWorkoutCredit}%;"></div>` : ''}
                            <!-- Labels (always visible) -->
                            <span class="progress-label">Carbs: ${plannedCarbs > 0 ? totalCarbs.toFixed(0) + ' / ' : ''}${(totalCarbs + plannedCarbs).toFixed(0)}g</span>
                            <span class="progress-value ${carbsRightClass}">${carbsRightLabel}</span>
                        </div>
                    </div>
                    <!-- Protein Progress Bar -->
                    <div class="macro-progress-item">
                        <div class="progress-bar-wide">
                            <!-- Planned ghost -->
                            ${proteinDim.scaledPlanned > 0 ? `<div class="progress-fill protein-planned" style="width: ${proteinDim.scaledTotal}%; z-index: 1;"></div>` : ''}
                            <!-- Normal portion -->
                            ${proteinDim.completedNormal > 0 ? `<div class="progress-fill protein" style="width: ${proteinDim.completedNormal}%; z-index: 2;"></div>` : ''}
                            <!-- Overflow portion -->
                            ${proteinDim.hasOverflow ? `<div class="progress-fill-overflow protein" style="left: ${marker100Percent}%; width: ${proteinDim.scaledTotal - marker100Percent}%; z-index: 2;"></div>` : ''}
                            <!-- Planned workout credit (right-side extension) -->
                            ${scaledProteinPlanWO > 0 ? `<div class="progress-planned-wo-credit" style="left: ${marker100Percent}%; width: ${scaledProteinPlanWO}%; z-index: 1;"></div>` : ''}
                            <!-- 100% marker -->
                            ${(needsScaling || hasPlanWOCredit) ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                            <!-- Workout credit marker (only shown if protein receives workout credit) -->
                            ${scaledProteinWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledProteinWorkoutCredit}%;"></div>` : ''}
                            <!-- Labels (always visible) -->
                            <span class="progress-label">Protein: ${plannedProtein > 0 ? totalProtein.toFixed(0) + ' / ' : ''}${(totalProtein + plannedProtein).toFixed(0)}g</span>
                            <span class="progress-value ${proteinRightClass}">${proteinRightLabel}</span>
                        </div>
                    </div>
                    <!-- Calorie Progress Bar (stacked macro composition) -->
                    <div class="macro-progress-item total">
                        <div class="progress-bar-wide calorie-balance-bar">
                            <!-- Stacked macro bars (fat, carbs, protein) with scaling -->
                            ${(() => {
                                // Scale the calorie macro percentages
                                const scaledFatCal = (fatCaloriesPercent / scale) * 100;
                                const scaledCarbsCal = (carbsCaloriesPercent / scale) * 100;
                                const scaledProteinCal = (proteinCaloriesPercent / scale) * 100;

                                // Calculate positions
                                const fatStart = 0;
                                const carbsStart = scaledFatCal;
                                const proteinStart = scaledFatCal + scaledCarbsCal;

                                // Calorie-only (unallocated) segment: appended after macro segments
                                const unallocatedPct = (calOnlyCaloriesPercent / scale) * 100;
                                const unallocatedStart = scaledFatCal + scaledCarbsCal + scaledProteinCal;
                                return `
                                    <!-- Planned layers -->
                                    ${plannedCalories > 0 ? `<div class="progress-fill calories-planned" style="position: absolute; left: 0%; width: ${caloriesDim.scaledTotal}%; z-index: 1;"></div>` : ''}

                                    <!-- Completed macro segments (no border-radius to avoid gaps) -->
                                    ${scaledFatCal > 0 ? `<div class="progress-fill fat" style="position: absolute; left: ${fatStart}%; width: ${scaledFatCal}%; z-index: 2;"></div>` : ''}
                                    ${scaledCarbsCal > 0 ? `<div class="progress-fill carbs" style="position: absolute; left: ${carbsStart}%; width: ${scaledCarbsCal}%; z-index: 2;"></div>` : ''}
                                    ${scaledProteinCal > 0 ? `<div class="progress-fill protein" style="position: absolute; left: ${proteinStart}%; width: ${scaledProteinCal}%; z-index: 2;"></div>` : ''}
                                    <!-- Calorie-only (unallocated) segment — grey -->
                                    ${unallocatedPct > 0 ? `<div style="position:absolute;left:${unallocatedStart}%;width:${unallocatedPct}%;height:100%;background:var(--text-secondary);opacity:0.4;z-index:2;"></div>` : ''}

                                    <!-- Overflow portion if calories exceed 100% -->
                                    ${caloriesDim.hasOverflow ? `<div class="progress-fill-overflow calories" style="position: absolute; left: ${marker100Percent}%; width: ${caloriesDim.scaledTotal - marker100Percent}%; z-index: 3;"></div>` : ''}

                                    <!-- Workout credit marker (total credited calories vs total goal) -->
                                    ${scaledCaloriesWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledCaloriesWorkoutCredit}%;"></div>` : ''}
                                    <!-- Planned workout credit (right-side extension) -->
                                    ${scaledCalPlanWO > 0 ? `<div class="progress-planned-wo-credit" style="left: ${marker100Percent}%; width: ${scaledCalPlanWO}%; z-index: 1;"></div>` : ''}
                                `;
                            })()}
                            <!-- 100% marker -->
                            ${(needsScaling || hasPlanWOCredit) ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                            <!-- Labels (always visible) -->
                            <span class="progress-label">Calories: ${plannedCalories > 0 ? totalCalories.toFixed(0) + ' / ' : ''}${(totalCalories + plannedCalories).toFixed(0)}</span>
                            <span class="progress-value ${calRightClass}">${calRightLabel}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Measurements — loaded once, used for streak badge and latest measurement display
        const measurements = await db.getAllMeasurements();

        // Streak counter
        const streakEl = document.getElementById('streak-counter');
        if (streakEl) {
            const allMacros = await db.getAllMacros();
            const baseGoalCal = parseFloat(await db.getSetting('goal_calories') || goalCalories);
            const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');
            // pi_goal_history stores {fat,protein,carbs} per date — use it for per-day calorie targets
            const goalHistory = JSON.parse(await db.getSetting('pi_goal_history') || '{}');

            // Effective calorie goal for a given date:
            // today → use already-computed goalCalories (includes workout credit + PI)
            // past  → pi_goal_history calories if stored (PI-adjusted), else base goal
            function effectiveGoalForDate(ds) {
                if (ds === today) return goalCalories;
                const h = goalHistory[ds];
                if (h && h.fat != null) return (h.fat * 9) + (h.protein * 4) + (h.carbs * 4);
                return baseGoalCal;
            }

            // Group completed calories by date
            const calByDate = {};
            for (const m of allMacros) {
                if (m.status === 'planned') continue;
                calByDate[m.date] = (calByDate[m.date] || 0) + (parseFloat(m.calories) || 0);
            }

            // Walk back from yesterday counting consecutive on-target days
            let streak = 0;
            const d = new Date(today + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            for (let i = 0; i < 365; i++) {
                const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if (cheatDayDates[ds]) { d.setDate(d.getDate() - 1); continue; }
                const cal = calByDate[ds];
                if (cal == null) break;
                const pct = cal / effectiveGoalForDate(ds);
                if (pct < 0.9 || pct > 1.1) break;
                streak++;
                d.setDate(d.getDate() - 1);
            }

            // Today's planned intake vs streak zone using effective goal (includes workout credit)
            const todayTotal = totalCalories + plannedCalories;
            const todayEffective = goalCalories; // already includes PI + workout credit
            const todayPct = todayEffective > 0 ? todayTotal / todayEffective : 0;
            const isTodayCheat = cheatDayDates[today];
            let todayBadge = '';
            if (!isTodayCheat && todayEffective > 0 && todayTotal > 0) {
                if (todayPct < 0.9) todayBadge = `<span style="color:var(--accent-warning);font-size:0.8em;margin-left:6px;">↓ under (${Math.round(todayPct*100)}%)</span>`;
                else if (todayPct > 1.1) todayBadge = `<span style="color:var(--accent-danger);font-size:0.8em;margin-left:6px;">↑ over (${Math.round(todayPct*100)}%)</span>`;
                else todayBadge = `<span style="color:var(--accent-success);font-size:0.8em;margin-left:6px;">✓ on track (${Math.round(todayPct*100)}%)</span>`;
            }

            let deficitBadge = '';
            const cycleEnabled  = (await db.getSetting('cycle_enabled'))  === 'true';
            const deficitModeOn = cycleEnabled || (await db.getSetting('deficit_mode')) === 'true';
            if (deficitModeOn) {
                if (cycleEnabled) {
                    const phase  = await db.getSetting('cycle_phase') || 'cut';
                    const isBulk = phase === 'bulk';
                    const rateCal = isBulk
                        ? parseFloat(await db.getSetting('cycle_bulk_surplus_cal') || 250)
                        : parseFloat(await db.getSetting('cycle_cut_deficit_cal')  || 250);
                    const lbsWk = (rateCal / 500).toFixed(1);
                    const delta  = rateCal / 500; // lbs/week
                    const color = isBulk ? 'var(--accent-success)' : 'var(--accent-primary)';
                    const label = isBulk ? `Bulking +${lbsWk}/wk` : `Cutting −${lbsWk}/wk`;

                    // Inline SVG progress bar: current 7-day avg between cut floor and bulk ceiling
                    // Highlight shows actual week-over-week change: blue = gained, red = lost
                    const floor   = parseFloat(await db.getSetting('cycle_cut_floor')    || 0);
                    const ceiling = parseFloat(await db.getSetting('cycle_bulk_ceiling') || 0);
                    let progressBar = '';
                    if (floor > 0 && ceiling > 0 && ceiling > floor) {
                        const weightByDate = {};
                        measurements.filter(m => m.type === 'weight')
                            .forEach(r => { weightByDate[r.date] = r.unit === 'kg' ? r.value * 2.20462 : r.value; });
                        const now7 = new Date();
                        let wSum = 0, wCount = 0;
                        for (let back = 0; back < 7; back++) {
                            const dd = new Date(now7); dd.setDate(dd.getDate() - back);
                            const ds2 = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
                            if (weightByDate[ds2] !== undefined) { wSum += weightByDate[ds2]; wCount++; }
                        }
                        let prevSum = 0, prevCount = 0;
                        for (let back = 7; back < 14; back++) {
                            const dd = new Date(now7); dd.setDate(dd.getDate() - back);
                            const ds2 = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
                            if (weightByDate[ds2] !== undefined) { prevSum += weightByDate[ds2]; prevCount++; }
                        }
                        if (wCount > 0) {
                            const avg   = wSum / wCount;
                            const range = ceiling - floor;
                            const W     = 44;
                            const H     = 7;
                            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
                            const fillW = clamp((avg - floor) / range * W, 0, W);
                            let spRect = '';
                            if (prevCount > 0) {
                                const prevAvg   = prevSum / prevCount;
                                const prevFillW = clamp((prevAvg - floor) / range * W, 0, W);
                                const actualDelta = avg - prevAvg;
                                if (actualDelta > 0.02) {
                                    // Gained weight: blue highlight from prevAvg pos to current pos (within fill)
                                    const spL = prevFillW;
                                    const spW = Math.max(1, fillW - prevFillW);
                                    spRect = `<rect x="${spL.toFixed(1)}" y="0" width="${spW.toFixed(1)}" height="${H}" fill="rgba(59,130,246,0.9)" rx="0"/>`;
                                } else if (actualDelta < -0.02) {
                                    // Lost weight: red highlight from current pos to prevAvg pos (in empty area)
                                    const spL = fillW;
                                    const spW = Math.max(1, prevFillW - fillW);
                                    spRect = `<rect x="${spL.toFixed(1)}" y="0" width="${spW.toFixed(1)}" height="${H}" fill="rgba(239,68,68,0.85)" rx="0"/>`;
                                }
                            }
                            progressBar = `<svg width="${W}" height="${H}" style="vertical-align:middle;margin-left:5px;border-radius:2px;" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${W}" height="${H}" fill="var(--bg-tertiary)" rx="2"/><rect x="0" y="0" width="${fillW.toFixed(1)}" height="${H}" fill="var(--accent-primary)" rx="2"/>${spRect}<rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="none" stroke="rgba(128,128,128,0.3)" stroke-width="1" rx="1.5"/></svg>`;
                        }
                    }
                    deficitBadge = `<span style="font-size:0.78em;color:${color};margin-left:5px;">${label}${progressBar}</span>`;
                } else {
                    const deficitCal = parseFloat(await db.getSetting('deficit_cal_per_day') || 0);
                    if (deficitCal !== 0) {
                        const lbsWk = (deficitCal / 500).toFixed(1);
                        const sign = deficitCal > 0 ? '−' : '+';
                        deficitBadge = `<span style="font-size:0.78em;color:var(--text-secondary);margin-left:5px;">${sign}${Math.abs(parseFloat(lbsWk))} lb/wk</span>`;
                    }
                }
            }

            streakEl.innerHTML = streak > 0
                ? `🔥 ${streak} day streak${deficitBadge}${todayBadge}`
                : todayBadge ? `Today${deficitBadge}${todayBadge}` : '';
        }

        // Load latest measurement (measurements already fetched above)
        const latestMeasurement = [...measurements].sort((a, b) => b.timestamp - a.timestamp)[0];

        const latestMeasurementEl = document.getElementById('latest-measurement');
        if (latestMeasurementEl) {
            if (latestMeasurement) {
                latestMeasurementEl.innerHTML = `
                    <div class="measurement-display">
                        <span class="measurement-type">${latestMeasurement.type}:</span>
                        <span class="measurement-value">${latestMeasurement.value} ${latestMeasurement.unit}</span>
                    </div>
                `;
            } else {
                latestMeasurementEl.textContent = 'No measurements yet';
            }
        }

        // Display recent activity
        await loadRecentActivity();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        throw error;
    }
}
