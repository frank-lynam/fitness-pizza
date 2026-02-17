/**
 * Fitness Tracker PWA - Main Application
 * Initializes the app, sets up routing, and coordinates all modules
 */

import { db } from './db.js';
import * as ui from './ui.js';
import { getTodayDate } from './utils/date-utils.js';
import { initMacroForm, loadTodaysMacros } from './components/macro-form.js';
import { initMeasurementForm, loadMeasurements as loadMeasurementsList } from './components/measurement-form.js';
import { initWorkoutForm, loadWorkouts as loadWorkoutsList } from './components/workout-form.js';
import { initFoodLibrary } from './components/food-library.js';

class FitnessTrackerApp {
    constructor() {
        this.currentScreen = 'dashboard';
        this.currentDate = getTodayDate(); // Track selected date
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            ui.showLoading('Initializing app...');

            // Initialize database
            console.log('Initializing database...');
            await db.init();
            console.log('Database initialized successfully');

            // Apply saved theme
            const savedTheme = await db.getSetting('theme') || 'dark';
            this.applyTheme(savedTheme);

            // Request persistent storage
            await this.requestPersistentStorage();

            // Check and perform auto-backup
            await this.checkAutoBackup();

            // Set up navigation
            this.setupNavigation();

            // Set up error dismiss button
            this.setupErrorHandling();

            // Set up connectivity listeners
            this.setupConnectivityMonitoring();

            // Set up quick actions
            this.setupQuickActions();

            // Set up date navigation
            this.setupDateNavigation();

            // Initialize components
            initMacroForm();
            initMeasurementForm();
            initWorkoutForm();
            initFoodLibrary();

            // Load initial screen (dashboard)
            await this.loadScreen('dashboard');

            this.initialized = true;
            ui.hideLoading();

            console.log('Fitness Tracker PWA initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            ui.hideLoading();
            ui.showError(`Failed to initialize app: ${error.message}`, 0);
        }
    }

    /**
     * Set up navigation between screens
     */
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                const screen = item.dataset.screen;
                if (screen) {
                    await this.navigateTo(screen);
                }
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.screen) {
                this.loadScreen(e.state.screen);
            }
        });

        // Set initial history state
        history.replaceState({ screen: 'dashboard' }, '', '#dashboard');
    }

    /**
     * Navigate to a screen
     * @param {string} screenName - Name of the screen
     */
    async navigateTo(screenName) {
        if (this.currentScreen === screenName) return;

        // Update history
        history.pushState({ screen: screenName }, '', `#${screenName}`);

        // Load screen
        await this.loadScreen(screenName);
    }

    /**
     * Load a screen and its data
     * @param {string} screenName - Name of the screen
     */
    async loadScreen(screenName) {
        try {
            this.currentScreen = screenName;
            ui.showScreen(screenName);

            // Load screen-specific data
            switch (screenName) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'macros':
                    await this.loadMacros();
                    break;
                case 'measurements':
                    await this.loadMeasurements();
                    break;
                case 'workouts':
                    await this.loadWorkouts();
                    break;
                case 'trends':
                    await this.loadTrends();
                    break;
                case 'settings':
                    await this.loadSettings();
                    break;
            }
        } catch (error) {
            console.error(`Error loading screen ${screenName}:`, error);
            ui.showError(`Failed to load ${screenName}: ${error.message}`);
        }
    }

    /**
     * Calculate effective goals for a given date
     * Applies reverse diet and running average adjustments
     * @param {string} date - Date in YYYY-MM-DD format
     * @returns {Object} Effective goals {fat, protein, carbs, calories}
     */
    async calculateEffectiveGoals(date) {
        const today = new Date().toISOString().split('T')[0];

        // Clean up past planned meals once per day
        const lastCleanup = await db.getSetting('last_planned_cleanup');
        if (lastCleanup !== today) {
            await this.cleanUpPastPlannedMeals(today);
            await db.setSetting('last_planned_cleanup', today);
        }

        // Get base goals from settings
        const baseFat = parseFloat(await db.getSetting('goal_fat') || 70);
        const baseProtein = parseFloat(await db.getSetting('goal_protein') || 150);
        const baseCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);

        let goalFat = baseFat;
        let goalProtein = baseProtein;
        let goalCarbs = baseCarbs;

        // Check if reverse diet is enabled for this date
        const reverseDietDates = JSON.parse(await db.getSetting('reverse_diet_dates') || '{}');
        if (reverseDietDates[date] === true) {
            goalFat *= 1.2;
            goalProtein *= 1.2;
            goalCarbs *= 1.2;
        }

        // Check if running average mode is enabled
        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';

        let piDebug = null;

        if (runningAvgEnabled) {
            const allMacros = await db.getAllMacros();
            const dateObj = new Date(date + 'T12:00:00');

            // Collect errors for past 10 days (actual - effective_goal for each day)
            const errors = { fat: [], protein: [], carbs: [] };
            const dayData = [];

            for (let i = 1; i <= 10; i++) {
                const pastDate = new Date(dateObj);
                pastDate.setDate(pastDate.getDate() - i);
                const pastDateStr = pastDate.toISOString().split('T')[0];

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

                // Effective goal for that day (respects its own reverse diet)
                let eFat = baseFat, eProtein = baseProtein, eCarbs = baseCarbs;
                if (reverseDietDates[pastDateStr] === true) {
                    eFat *= 1.2; eProtein *= 1.2; eCarbs *= 1.2;
                }

                const errFat = dayFat - eFat;
                const errProtein = dayProtein - eProtein;
                const errCarbs = dayCarbs - eCarbs;

                errors.fat.push(errFat);
                errors.protein.push(errProtein);
                errors.carbs.push(errCarbs);
                dayData.push({ date: pastDateStr, fat: dayFat, protein: dayProtein, carbs: dayCarbs,
                               errFat, errProtein, errCarbs, daysBack: i });
            }

            // PI controller gains (user-configurable in settings)
            const Kp = parseFloat(await db.getSetting('pi_kp') || '0.5');
            const Ki = parseFloat(await db.getSetting('pi_ki') || '0.1');

            // P terms (yesterday = errors[0])
            const p_fat     = Kp * errors.fat[0];
            const p_protein = Kp * errors.protein[0];
            const p_carbs   = Kp * errors.carbs[0];

            // I terms (sum over all 10 days)
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

            // Clamp to ±33% of base goal
            const cap = 0.33;
            const adj_fat     = Math.max(-goalFat     * cap, Math.min(goalFat     * cap, rawAdj_fat));
            const adj_protein = Math.max(-goalProtein * cap, Math.min(goalProtein * cap, rawAdj_protein));
            const adj_carbs   = Math.max(-goalCarbs   * cap, Math.min(goalCarbs   * cap, rawAdj_carbs));

            goalFat     -= adj_fat;
            goalProtein -= adj_protein;
            goalCarbs   -= adj_carbs;

            piDebug = {
                fat:     { p_err: errors.fat[0],     p_adj: p_fat,     i_sum: i_sum_fat,     i_adj: i_fat,     raw_adj: rawAdj_fat,     final_adj: adj_fat,     clamped: Math.abs(rawAdj_fat)     > goalFat     * cap },
                protein: { p_err: errors.protein[0], p_adj: p_protein, i_sum: i_sum_protein, i_adj: i_protein, raw_adj: rawAdj_protein, final_adj: adj_protein, clamped: Math.abs(rawAdj_protein) > goalProtein * cap },
                carbs:   { p_err: errors.carbs[0],   p_adj: p_carbs,   i_sum: i_sum_carbs,   i_adj: i_carbs,   raw_adj: rawAdj_carbs,   final_adj: adj_carbs,   clamped: Math.abs(rawAdj_carbs)   > goalCarbs   * cap },
                dayData, Kp, Ki, cap
            };
        }

        // Add workout credit: distribute burned calories as additional macro allowance
        // proportional to each macro's caloric contribution to the goal
        const workouts = await db.getWorkoutsByDate(date);
        const caloriesBurned = workouts.reduce((sum, w) => sum + (w.estimated_calories_burned || 0), 0);

        // Only credit 50% of calories burned (conservative — accounts for estimation error,
        // and prevents over-eating from overestimated workout burns)
        const caloriesCredited = caloriesBurned / 2;

        if (caloriesCredited > 0) {
            const baseGoalCal = (goalFat * 9) + (goalProtein * 4) + (goalCarbs * 4);
            if (baseGoalCal > 0) {
                goalFat     += (caloriesCredited * (goalFat * 9 / baseGoalCal)) / 9;
                goalProtein += (caloriesCredited * (goalProtein * 4 / baseGoalCal)) / 4;
                goalCarbs   += (caloriesCredited * (goalCarbs * 4 / baseGoalCal)) / 4;
            }
        }

        const goalCalories = (goalFat * 9) + (goalProtein * 4) + (goalCarbs * 4);

        return {
            fat: goalFat,
            protein: goalProtein,
            carbs: goalCarbs,
            calories: goalCalories,
            caloriesBurned,       // actual estimated burn
            caloriesCredited,     // 50% of burned — what was actually added to goals
            piDebug
        };
    }

    /**
     * Remove planned entries from dates before today (they were never eaten)
     */
    async cleanUpPastPlannedMeals(today) {
        const allMacros = await db.getAllMacros();
        const pastPlanned = allMacros.filter(m => m.status === 'planned' && m.date < today);
        for (const entry of pastPlanned) {
            await db.deleteMacroEntry(entry.id);
        }
    }

    /**
     * Load dashboard screen
     */
    async loadDashboard() {
        console.log('Loading dashboard...');

        try {
            const today = this.currentDate;

            // Load today's macros (completed and planned separately)
            const macros = await db.getMacrosByDate(today);
            const completedMacros = macros.filter(m => m.status === 'completed');
            const plannedMacros = macros.filter(m => m.status === 'planned');

            const totalProtein = completedMacros.reduce((sum, m) => sum + m.protein, 0);
            const totalCarbs = completedMacros.reduce((sum, m) => sum + m.carbs, 0);
            const totalFat = completedMacros.reduce((sum, m) => sum + m.fat, 0);
            const totalCalories = completedMacros.reduce((sum, m) => sum + m.calories, 0);

            const plannedProtein = plannedMacros.reduce((sum, m) => sum + m.protein, 0);
            const plannedCarbs = plannedMacros.reduce((sum, m) => sum + m.carbs, 0);
            const plannedFat = plannedMacros.reduce((sum, m) => sum + m.fat, 0);
            const plannedCalories = plannedMacros.reduce((sum, m) => sum + m.calories, 0);

            // Load today's workouts
            const workouts = await db.getWorkoutsByDate(today);
            const totalCaloriesBurned = workouts.reduce((sum, w) => sum + w.estimated_calories_burned, 0);

            // Calculate calorie balance
            const calorieBalance = totalCalories - totalCaloriesBurned;

            // Get daily goals with reverse diet and running average adjustments
            const goals = await this.calculateEffectiveGoals(today);
            const goalFat = goals.fat;
            const goalProtein = goals.protein;
            const goalCarbs = goals.carbs;
            const goalCalories = goals.calories;

            // Calculate RAW percentages for completed (can exceed 100%)
            const fatPercent = (totalFat / goalFat) * 100;
            const proteinPercent = (totalProtein / goalProtein) * 100;
            const carbsPercent = (totalCarbs / goalCarbs) * 100;

            // Calculate RAW percentages for planned
            const plannedFatPercent = (plannedFat / goalFat) * 100;
            const plannedProteinPercent = (plannedProtein / goalProtein) * 100;
            const plannedCarbsPercent = (plannedCarbs / goalCarbs) * 100;
            const plannedCaloriesPercent = (plannedCalories / goalCalories) * 100;

            // Calculate total percentages including planned
            const totalFatPercent = fatPercent + plannedFatPercent;
            const totalCarbsPercent = carbsPercent + plannedCarbsPercent;
            const totalProteinPercent = proteinPercent + plannedProteinPercent;

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
            const totalCaloriesPercent = (totalCalories / goalCalories) * 100;
            const totalWithPlannedCaloriesPercent = totalCaloriesPercent + plannedCaloriesPercent;

            // Workout credit marker: left dashed line showing how much of the goal
            // was earned by the workout. Appears at caloriesBurned/goalCalories from the left.
            // Same fractional position applies to all macro bars (credit is proportional).
            const workoutCreditPercent = goals.caloriesCredited > 0 && goalCalories > 0
                ? (goals.caloriesCredited / goalCalories) * 100
                : 0;
            console.log('[WorkoutCredit] burned:', goals.caloriesBurned, 'credited (50%):', goals.caloriesCredited, 'goalCal:', goalCalories, 'creditPct:', workoutCreditPercent);

            // Find the maximum percentage across ALL bars (to determine if scaling is needed)
            const maxPercent = Math.max(
                totalFatPercent,
                totalCarbsPercent,
                totalProteinPercent,
                totalWithPlannedCaloriesPercent
            );

            // Determine scale factor: if any bar exceeds 100%, that becomes the new scale
            const scale = maxPercent > 100 ? maxPercent : 100;
            const needsScaling = maxPercent > 100;

            // Calculate the position of the 100% marker (as percentage of bar width)
            const marker100Percent = needsScaling ? (100 / scale) * 100 : 100;

            // Scaled workout credit marker position (same fraction applies to all bars)
            const scaledWorkoutCredit = (workoutCreditPercent / scale) * 100;

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
                                <!-- 100% marker line -->
                                ${needsScaling ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                                <!-- Workout credit marker -->
                                ${scaledWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledWorkoutCredit}%;"></div>` : ''}
                                <!-- Labels (always visible) -->
                                <span class="progress-label">Fat: ${(totalFat + plannedFat).toFixed(0)}g</span>
                                <span class="progress-value ${goalFat - totalFat - plannedFat < 0 ? 'over-target' : ''}">${
                                    goalFat - totalFat - plannedFat >= 0
                                        ? Math.max(0, goalFat - totalFat - plannedFat).toFixed(0) + 'g left'
                                        : '+' + Math.abs(goalFat - totalFat - plannedFat).toFixed(0) + 'g over'
                                }</span>
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
                                <!-- 100% marker -->
                                ${needsScaling ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                                <!-- Workout credit marker -->
                                ${scaledWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledWorkoutCredit}%;"></div>` : ''}
                                <!-- Labels (always visible) -->
                                <span class="progress-label">Carbs: ${(totalCarbs + plannedCarbs).toFixed(0)}g</span>
                                <span class="progress-value ${goalCarbs - totalCarbs - plannedCarbs < 0 ? 'over-target' : ''}">${
                                    goalCarbs - totalCarbs - plannedCarbs >= 0
                                        ? Math.max(0, goalCarbs - totalCarbs - plannedCarbs).toFixed(0) + 'g left'
                                        : '+' + Math.abs(goalCarbs - totalCarbs - plannedCarbs).toFixed(0) + 'g over'
                                }</span>
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
                                <!-- 100% marker -->
                                ${needsScaling ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                                <!-- Workout credit marker -->
                                ${scaledWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledWorkoutCredit}%;"></div>` : ''}
                                <!-- Labels (always visible) -->
                                <span class="progress-label">Protein: ${(totalProtein + plannedProtein).toFixed(0)}g</span>
                                <span class="progress-value ${goalProtein - totalProtein - plannedProtein < 0 ? 'over-target' : ''}">${
                                    goalProtein - totalProtein - plannedProtein >= 0
                                        ? Math.max(0, goalProtein - totalProtein - plannedProtein).toFixed(0) + 'g left'
                                        : '+' + Math.abs(goalProtein - totalProtein - plannedProtein).toFixed(0) + 'g over'
                                }</span>
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

                                    return `
                                        <!-- Planned layers -->
                                        ${plannedCalories > 0 ? `<div class="progress-fill calories-planned" style="position: absolute; left: 0%; width: ${caloriesDim.scaledTotal}%; z-index: 1;"></div>` : ''}

                                        <!-- Completed macro segments (no border-radius to avoid gaps) -->
                                        ${scaledFatCal > 0 ? `<div class="progress-fill fat" style="position: absolute; left: ${fatStart}%; width: ${scaledFatCal}%; z-index: 2;"></div>` : ''}
                                        ${scaledCarbsCal > 0 ? `<div class="progress-fill carbs" style="position: absolute; left: ${carbsStart}%; width: ${scaledCarbsCal}%; z-index: 2;"></div>` : ''}
                                        ${scaledProteinCal > 0 ? `<div class="progress-fill protein" style="position: absolute; left: ${proteinStart}%; width: ${scaledProteinCal}%; z-index: 2;"></div>` : ''}

                                        <!-- Overflow portion if calories exceed 100% -->
                                        ${caloriesDim.hasOverflow ? `<div class="progress-fill-overflow calories" style="position: absolute; left: ${marker100Percent}%; width: ${caloriesDim.scaledTotal - marker100Percent}%; z-index: 3;"></div>` : ''}

                                        <!-- Workout credit marker (same scaledWorkoutCredit as other bars) -->
                                        ${scaledWorkoutCredit > 0 ? `<div class="progress-marker-left" style="left: ${scaledWorkoutCredit}%;"></div>` : ''}
                                    `;
                                })()}
                                <!-- 100% marker -->
                                ${needsScaling ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                                <!-- Labels (always visible) -->
                                <span class="progress-label">Calories: ${(totalCalories + plannedCalories).toFixed(0)}</span>
                                <span class="progress-value ${goalCalories - totalCalories - plannedCalories < 0 ? 'over-target' : ''}">${
                                    goalCalories - totalCalories - plannedCalories >= 0
                                        ? Math.max(0, goalCalories - totalCalories - plannedCalories).toFixed(0) + ' left'
                                        : '+' + Math.abs(goalCalories - totalCalories - plannedCalories).toFixed(0) + ' over'
                                }</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Load latest measurement
            const measurements = await db.getAllMeasurements();
            const latestMeasurement = measurements.sort((a, b) => b.timestamp - a.timestamp)[0];

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
            await this.loadRecentActivity();

        } catch (error) {
            console.error('Error loading dashboard:', error);
            throw error;
        }
    }

    /**
     * Load today's activity for dashboard
     */
    async loadRecentActivity() {
        try {
            const activityList = document.getElementById('recent-activity-list');
            if (!activityList) return;

            const today = this.currentDate;

            // Get today's entries from all sources
            const todayMacros = await db.getMacrosByDate(today);
            const todayWorkouts = await db.getWorkoutsByDate(today);
            const allMeasurements = await db.getAllMeasurements();
            const todayMeasurements = allMeasurements.filter(m => m.date === today);

            // Include all macros (both planned and completed)
            const allMacros = todayMacros;

            // Combine and sort: planned items first, then by timestamp
            const activities = [
                ...allMacros.map(m => ({ type: 'macro', data: m, timestamp: m.timestamp })),
                ...todayWorkouts.map(w => ({ type: 'workout', data: w, timestamp: w.timestamp })),
                ...todayMeasurements.map(m => ({ type: 'measurement', data: m, timestamp: m.timestamp }))
            ].sort((a, b) => {
                // Planned macros always come first
                const aPlanned = a.type === 'macro' && a.data.status === 'planned';
                const bPlanned = b.type === 'macro' && b.data.status === 'planned';
                if (aPlanned && !bPlanned) return -1;
                if (!aPlanned && bPlanned) return 1;
                // Otherwise sort by timestamp (most recent first)
                return b.timestamp - a.timestamp;
            });

            if (activities.length === 0) {
                activityList.innerHTML = '<p class="text-muted">No activity today</p>';
                return;
            }

            activityList.innerHTML = activities.map(activity => {
                const date = new Date(activity.timestamp).toLocaleDateString();
                const time = new Date(activity.timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                });

                switch (activity.type) {
                    case 'macro':
                        const isCompleted = activity.data.status === 'completed';
                        const itemClass = isCompleted ? '' : 'planned';
                        const macroSummary = `${(activity.data.fat || 0).toFixed(2)}f / ${(activity.data.carbs || 0).toFixed(2)}c / ${(activity.data.protein || 0).toFixed(2)}p`;
                        const servings = activity.data.servings || 1;
                        const servingsDisplay = ` - ${servings.toFixed(1)}x`;
                        return `
                            <div class="activity-item ${itemClass}">
                                ${!isCompleted ? `
                                    <button class="btn-complete-activity" data-id="${activity.data.id}" title="Complete">✓</button>
                                ` : ''}
                                <span class="activity-icon">🍽️</span>
                                <div class="activity-content">
                                    <div class="activity-title">${activity.data.meal_name || 'Macro entry'}${servingsDisplay}</div>
                                    <div class="activity-macros">${macroSummary} (${(activity.data.calories || 0).toFixed(2)} cal)</div>
                                </div>
                                ${!isCompleted ? `
                                    <button class="btn-remove-activity" data-id="${activity.data.id}" data-type="macro" title="Remove">×</button>
                                ` : ''}
                            </div>
                        `;
                    case 'workout':
                        return `
                            <div class="activity-item">
                                <span class="activity-icon">💪</span>
                                <div class="activity-content">
                                    <div class="activity-title">${activity.data.exercise_name}</div>
                                    <div class="activity-time">${date} at ${time}</div>
                                </div>
                            </div>
                        `;
                    case 'measurement':
                        return `
                            <div class="activity-item">
                                <span class="activity-icon">📊</span>
                                <div class="activity-content">
                                    <div class="activity-title">${activity.data.type}: ${activity.data.value} ${activity.data.unit}</div>
                                    <div class="activity-time">${date} at ${time}</div>
                                </div>
                            </div>
                        `;
                }
            }).join('');

            // Add event listeners for complete buttons
            activityList.querySelectorAll('.btn-complete-activity').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id);

                    try {
                        const macros = await db.getAllMacros();
                        const entry = macros.find(m => m.id === id);

                        if (entry) {
                            // If planned item with multiple servings, only complete 1 serving
                            if (entry.status === 'planned' && entry.servings > 1) {
                                // Calculate macros per serving
                                const perServing = {
                                    protein: entry.protein / entry.servings,
                                    carbs: entry.carbs / entry.servings,
                                    fat: entry.fat / entry.servings,
                                    fiber: entry.fiber / entry.servings,
                                    calories: entry.calories / entry.servings
                                };

                                // Create a new completed entry with 1 serving
                                const completedEntry = {
                                    ...entry,
                                    servings: 1,
                                    protein: perServing.protein,
                                    carbs: perServing.carbs,
                                    fat: perServing.fat,
                                    fiber: perServing.fiber,
                                    calories: perServing.calories,
                                    status: 'completed',
                                    timestamp: Date.now()
                                };
                                delete completedEntry.id; // Remove id so it creates a new entry
                                await db.addMacroEntry(completedEntry);

                                // Update the planned entry: reduce servings and adjust macros
                                const remainingServings = entry.servings - 1;
                                entry.servings = remainingServings;
                                entry.protein = perServing.protein * remainingServings;
                                entry.carbs = perServing.carbs * remainingServings;
                                entry.fat = perServing.fat * remainingServings;
                                entry.fiber = perServing.fiber * remainingServings;
                                entry.calories = perServing.calories * remainingServings;
                                await db.updateMacroEntry(entry);
                            } else {
                                // For single serving or already completed items, just toggle status
                                entry.status = 'completed';
                                entry.timestamp = Date.now(); // Update timestamp to now
                                await db.updateMacroEntry(entry);
                            }

                            // Refresh dashboard
                            await this.loadDashboard();
                        }
                    } catch (error) {
                        console.error('Error completing macro:', error);
                        ui.showError('Failed to complete item');
                    }
                });
            });

            // Add event listeners for remove buttons (planned items only)
            activityList.querySelectorAll('.btn-remove-activity').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id);
                    const type = e.target.dataset.type;

                    try {
                        if (type === 'macro') {
                            await db.deleteMacroEntry(id);
                        }

                        // Refresh dashboard
                        await this.loadDashboard();
                    } catch (error) {
                        console.error('Error removing activity:', error);
                        ui.showError('Failed to remove item');
                    }
                });
            });

        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    /**
     * Load macros screen
     */
    async loadMacros() {
        console.log('Loading macros screen...');
        await loadTodaysMacros();
    }

    /**
     * Load measurements screen
     */
    async loadMeasurements() {
        console.log('Loading measurements screen...');
        await loadMeasurementsList();
    }

    /**
     * Load workouts screen
     */
    async loadWorkouts() {
        console.log('Loading workouts screen...');
        await loadWorkoutsList();
    }

    /**
     * Load trends screen
     */
    async loadTrends() {
        console.log('Loading trends screen...');
        const { initCharts } = await import('./components/chart-renderer.js');
        await initCharts();

        // Show PI controller explanation if running average mode is on
        const panel = document.getElementById('pi-controller-panel');
        const content = document.getElementById('pi-explanation-content');
        const panelDate = document.getElementById('pi-panel-date');
        if (!panel || !content) return;

        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';
        if (!runningAvgEnabled) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');
        const date = this.currentDate;
        if (panelDate) panelDate.textContent = date;

        const goals = await this.calculateEffectiveGoals(date);
        const { piDebug } = goals;
        if (!piDebug) {
            content.innerHTML = '<p>No data yet.</p>';
            return;
        }

        const baseFat     = parseFloat(await db.getSetting('goal_fat')     || 70);
        const baseProtein = parseFloat(await db.getSetting('goal_protein') || 150);
        const baseCarbs   = parseFloat(await db.getSetting('goal_carbs')   || 200);

        const fmt = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + 'g';
        const fmtAdj = (n) => n === 0 ? '0g' : fmt(-n); // adjustment is subtracted, so display inverted

        // Workout credit in grams per macro: credit is proportional to each macro's share of total goal
        // goals.caloriesCredited = 50% of burned (what was actually added to goals)
        const caloriesCredited = goals.caloriesCredited || 0;
        const workoutCreditFat_g     = caloriesCredited > 0 && goals.calories > 0 ? goals.fat     * caloriesCredited / goals.calories : 0;
        const workoutCreditProtein_g = caloriesCredited > 0 && goals.calories > 0 ? goals.protein * caloriesCredited / goals.calories : 0;
        const workoutCreditCarbs_g   = caloriesCredited > 0 && goals.calories > 0 ? goals.carbs   * caloriesCredited / goals.calories : 0;

        const macros = [
            { key: 'fat',     label: 'Fat',     base: baseFat,     goal: goals.fat,     d: piDebug.fat,     workoutG: workoutCreditFat_g },
            { key: 'carbs',   label: 'Carbs',   base: baseCarbs,   goal: goals.carbs,   d: piDebug.carbs,   workoutG: workoutCreditCarbs_g },
            { key: 'protein', label: 'Protein', base: baseProtein, goal: goals.protein, d: piDebug.protein, workoutG: workoutCreditProtein_g },
        ];

        const rows = macros.map(({ label, base, goal, d, workoutG }) => {
            const clampNote = d.clamped ? ` <span style="color:var(--warning-color);" title="Raw adjustment ${fmt(-d.raw_adj)} was clamped to ±${(piDebug.cap * 100).toFixed(0)}% cap">⚠ capped</span>` : '';
            const workoutCell = workoutG > 0.05
                ? `<span style="color:var(--accent-color);">+${workoutG.toFixed(1)}g</span>`
                : `<span style="color:var(--text-secondary);">—</span>`;
            return `
                <tr>
                    <td style="padding:4px 8px;font-weight:600;">${label}</td>
                    <td style="padding:4px 8px;text-align:right;">${base.toFixed(0)}g</td>
                    <td style="padding:4px 8px;text-align:right;color:${d.p_err >= 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmt(d.p_err)}</td>
                    <td style="padding:4px 8px;text-align:right;color:${d.i_sum >= 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmt(d.i_sum)}</td>
                    <td style="padding:4px 8px;text-align:right;">${fmtAdj(d.final_adj)}${clampNote}</td>
                    <td style="padding:4px 8px;text-align:right;">${workoutCell}</td>
                    <td style="padding:4px 8px;text-align:right;font-weight:600;">${goal.toFixed(0)}g</td>
                </tr>`;
        }).join('');

        // Per-day breakdown
        const dayRows = piDebug.dayData.map(d => {
            const errFmt = (e) => `<span style="color:${e >= 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmt(e)}</span>`;
            return `<tr>
                <td style="padding:3px 6px;">${d.date}</td>
                <td style="padding:3px 6px;text-align:right;">${d.fat.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errFat)}</td>
                <td style="padding:3px 6px;text-align:right;">${d.protein.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errProtein)}</td>
                <td style="padding:3px 6px;text-align:right;">${d.carbs.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errCarbs)}</td>
            </tr>`;
        }).join('');

        content.innerHTML = `
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
                PI controller: Kp=${piDebug.Kp.toFixed(2)} (correct ${(piDebug.Kp * 100).toFixed(0)}% of yesterday's error today),
                Ki=${piDebug.Ki.toFixed(2)} (correct ${(piDebug.Ki * 100).toFixed(0)}% of 10-day accumulated error per day).
                Adjustments capped at ±${(piDebug.cap * 100).toFixed(0)}% of base target.${goals.caloriesBurned > 0 ? ` Workout: ${goals.caloriesBurned.toFixed(0)} cal burned → ${goals.caloriesCredited.toFixed(0)} cal credited (50%).` : ''}
            </p>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color);color:var(--text-secondary);">
                            <th style="padding:4px 8px;text-align:left;">Macro</th>
                            <th style="padding:4px 8px;text-align:right;">Base</th>
                            <th style="padding:4px 8px;text-align:right;">P err (yday)</th>
                            <th style="padding:4px 8px;text-align:right;">I sum (10d)</th>
                            <th style="padding:4px 8px;text-align:right;">PI adj</th>
                            <th style="padding:4px 8px;text-align:right;">Workout+</th>
                            <th style="padding:4px 8px;text-align:right;">Today's goal</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <details style="margin-top:4px;">
                <summary style="cursor:pointer;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
                    10-day history (tap to expand)
                </summary>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead>
                            <tr style="border-bottom:1px solid var(--border-color);color:var(--text-secondary);">
                                <th style="padding:3px 6px;text-align:left;">Date</th>
                                <th style="padding:3px 6px;text-align:right;">Fat</th>
                                <th style="padding:3px 6px;text-align:right;">Err</th>
                                <th style="padding:3px 6px;text-align:right;">Protein</th>
                                <th style="padding:3px 6px;text-align:right;">Err</th>
                                <th style="padding:3px 6px;text-align:right;">Carbs</th>
                                <th style="padding:3px 6px;text-align:right;">Err</th>
                            </tr>
                        </thead>
                        <tbody>${dayRows}</tbody>
                    </table>
                </div>
            </details>
        `;
    }

    /**
     * Load settings screen
     */
    async loadSettings() {
        console.log('Loading settings screen...');

        // Load API key
        const apiKey = localStorage.getItem('gemini_api_key');
        const apiKeyInput = document.getElementById('gemini-api-key');
        if (apiKeyInput && apiKey) {
            apiKeyInput.value = apiKey;
        }

        // Load daily goals
        const goalFat = await db.getSetting('goal_fat') || 70;
        const goalProtein = await db.getSetting('goal_protein') || 150;
        const goalCarbs = await db.getSetting('goal_carbs') || 200;

        const fatInput = document.getElementById('goal-fat');
        const proteinInput = document.getElementById('goal-protein');
        const carbsInput = document.getElementById('goal-carbs');
        const computedCaloriesEl = document.getElementById('computed-calories');

        if (fatInput) fatInput.value = goalFat;
        if (proteinInput) proteinInput.value = goalProtein;
        if (carbsInput) carbsInput.value = goalCarbs;

        // Update computed calories
        const updateComputedCalories = () => {
            const fat = parseFloat(fatInput.value || 0);
            const protein = parseFloat(proteinInput.value || 0);
            const carbs = parseFloat(carbsInput.value || 0);
            const calories = (fat * 9) + (protein * 4) + (carbs * 4);
            if (computedCaloriesEl) {
                computedCaloriesEl.textContent = `${calories.toFixed(0)} cal`;
            }
        };

        // Add input listeners
        if (fatInput) fatInput.addEventListener('input', updateComputedCalories);
        if (proteinInput) proteinInput.addEventListener('input', updateComputedCalories);
        if (carbsInput) carbsInput.addEventListener('input', updateComputedCalories);

        updateComputedCalories();

        // Auto-save API key on change
        if (apiKeyInput) {
            apiKeyInput.addEventListener('change', () => {
                const key = apiKeyInput.value.trim();
                if (key) {
                    localStorage.setItem('gemini_api_key', key);
                }
            });
        }

        // Test API key button
        const testApiKeyBtn = document.getElementById('btn-test-api-key');
        const apiKeyStatus = document.getElementById('api-key-status');
        if (testApiKeyBtn) {
            testApiKeyBtn.addEventListener('click', async () => {
                try {
                    // Save current key first
                    if (apiKeyInput) {
                        const key = apiKeyInput.value.trim();
                        if (key) {
                            localStorage.setItem('gemini_api_key', key);

                            // Show what key we're testing (first/last chars for debugging)
                            const keyPreview = key.length > 12 ?
                                `${key.substring(0, 8)}...${key.substring(key.length - 4)}` :
                                key.substring(0, 12) + '...';

                            console.log('Testing API key:', keyPreview);
                            console.log('Key length:', key.length);
                        } else {
                            if (apiKeyStatus) {
                                apiKeyStatus.style.display = 'block';
                                apiKeyStatus.className = 'text-danger';
                                apiKeyStatus.textContent = '❌ Please enter an API key first';
                            }
                            return;
                        }
                    }

                    ui.showLoading('Testing API key...');

                    const { testAPIKey } = await import('./api.js');
                    const result = await testAPIKey();

                    ui.hideLoading();

                    if (apiKeyStatus) {
                        apiKeyStatus.style.display = 'block';
                        if (result.valid) {
                            apiKeyStatus.className = 'text-success';
                            apiKeyStatus.textContent = '✅ API key is valid!';
                        } else {
                            apiKeyStatus.className = 'text-danger';
                            const storedKey = localStorage.getItem('gemini_api_key');
                            const keyLength = storedKey ? storedKey.length : 0;
                            let errorMsg = `❌ Invalid (length: ${keyLength})`;

                            if (result.status) {
                                errorMsg += `\nHTTP ${result.status}`;
                            }
                            if (result.error) {
                                errorMsg += `\n${result.error}`;
                            }

                            apiKeyStatus.textContent = errorMsg;
                            apiKeyStatus.style.whiteSpace = 'pre-line';
                        }
                    }
                } catch (error) {
                    ui.hideLoading();
                    console.error('API test error:', error);
                    if (apiKeyStatus) {
                        apiKeyStatus.style.display = 'block';
                        apiKeyStatus.className = 'text-danger';
                        apiKeyStatus.textContent = `❌ Error: ${error.message}`;
                    }
                }
            });
        }

        // Auto-save goals on change
        const autoSaveGoals = async () => {
            try {
                const fat = parseFloat(fatInput.value) || 70;
                const protein = parseFloat(proteinInput.value) || 150;
                const carbs = parseFloat(carbsInput.value) || 200;
                const calories = (fat * 9) + (protein * 4) + (carbs * 4);

                await db.setSetting('goal_fat', fat);
                await db.setSetting('goal_protein', protein);
                await db.setSetting('goal_carbs', carbs);
                await db.setSetting('goal_calories', calories);

                // Reload dashboard if it's the current screen
                if (this.currentScreen === 'dashboard') {
                    await this.loadDashboard();
                }
            } catch (error) {
                console.error('Error saving goals:', error);
            }
        };

        if (fatInput) fatInput.addEventListener('change', autoSaveGoals);
        if (proteinInput) proteinInput.addEventListener('change', autoSaveGoals);
        if (carbsInput) carbsInput.addEventListener('change', autoSaveGoals);

        // Running average mode toggle + PI gains
        const runningAvgCheckbox = document.getElementById('running-average-mode');
        const piGainsSection = document.getElementById('pi-gains-section');
        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';

        const updatePiGainsVisibility = (enabled) => {
            if (piGainsSection) piGainsSection.classList.toggle('hidden', !enabled);
        };

        if (runningAvgCheckbox) {
            runningAvgCheckbox.checked = runningAvgEnabled;
            updatePiGainsVisibility(runningAvgEnabled);
            runningAvgCheckbox.addEventListener('change', async () => {
                await db.setSetting('running_average_mode', runningAvgCheckbox.checked ? 'true' : 'false');
                updatePiGainsVisibility(runningAvgCheckbox.checked);
                if (this.currentScreen === 'dashboard') await this.loadDashboard();
                ui.showSuccess(runningAvgCheckbox.checked ?
                    'Running Average Mode enabled' : 'Running Average Mode disabled');
            });
        }

        // Kp slider
        const kpSlider = document.getElementById('pi-kp');
        const kpValue = document.getElementById('pi-kp-value');
        const savedKp = parseFloat(await db.getSetting('pi_kp') || '0.5');
        if (kpSlider) {
            kpSlider.value = savedKp;
            if (kpValue) kpValue.textContent = savedKp.toFixed(2);
            kpSlider.addEventListener('input', async () => {
                if (kpValue) kpValue.textContent = parseFloat(kpSlider.value).toFixed(2);
                await db.setSetting('pi_kp', kpSlider.value);
            });
        }

        // Ki slider
        const kiSlider = document.getElementById('pi-ki');
        const kiValue = document.getElementById('pi-ki-value');
        const savedKi = parseFloat(await db.getSetting('pi_ki') || '0.1');
        if (kiSlider) {
            kiSlider.value = savedKi;
            if (kiValue) kiValue.textContent = savedKi.toFixed(2);
            kiSlider.addEventListener('input', async () => {
                if (kiValue) kiValue.textContent = parseFloat(kiSlider.value).toFixed(2);
                await db.setSetting('pi_ki', kiSlider.value);
            });
        }

        // Set up theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            // Load current theme
            const currentTheme = await db.getSetting('theme') || 'dark';
            themeToggle.value = currentTheme;

            // Apply theme immediately
            this.applyTheme(currentTheme);

            // Handle theme change
            themeToggle.addEventListener('change', async (e) => {
                const theme = e.target.value;
                await db.setSetting('theme', theme);
                this.applyTheme(theme);
            });
        }

        // Set up export data button
        const exportBtn = document.getElementById('btn-export-data');
        if (exportBtn) {
            exportBtn.onclick = async () => {
                try {
                    const data = await db.exportAllData();
                    const dataStr = JSON.stringify(data, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `fitness-pizza-export-${new Date().toISOString()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Export error:', error);
                    ui.showError('Failed to export data: ' + error.message);
                }
            };
        }

        // Set up import data button
        const importBtn = document.getElementById('btn-import-data');
        const importFile = document.getElementById('import-data-file');
        if (importBtn && importFile) {
            // Trigger file input when button is clicked
            importBtn.onclick = () => {
                importFile.click();
            };

            // Handle file selection
            importFile.onchange = async () => {
                const file = importFile.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    await db.importData(data);

                    // Show success modal
                    const totalItems =
                        (data.macros?.length || 0) +
                        (data.measurements?.length || 0) +
                        (data.workouts?.length || 0) +
                        (data.named_foods?.length || 0);

                    ui.createModal('Import Successful', `
                        <div style="text-align: center; padding: var(--spacing-md);">
                            <p style="font-size: 1.2em; margin-bottom: var(--spacing-sm);">✓ Data imported successfully!</p>
                            <p>Imported ${totalItems} total items</p>
                        </div>
                    `, [{ text: 'OK', className: 'btn-primary' }]);

                    // Clear file input
                    importFile.value = '';

                    // Reload current screen
                    await this.loadScreen(this.currentScreen);
                } catch (error) {
                    console.error('Import error:', error);
                    ui.showError('Failed to import data: ' + error.message);
                    importFile.value = '';
                }
            };
        }

        // Set up clear cache button
        const clearCacheBtn = document.getElementById('btn-clear-cache');
        if (clearCacheBtn) {
            clearCacheBtn.onclick = () => {
                ui.confirm(
                    'Are you sure you want to clear the cache? This will not delete your data.',
                    async () => {
                        if ('caches' in window) {
                            const cacheNames = await caches.keys();
                            await Promise.all(cacheNames.map(name => caches.delete(name)));
                        }
                    }
                );
            };
        }
    }

    /**
     * Set up error handling
     */
    setupErrorHandling() {
        const dismissBtn = document.getElementById('error-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                ui.hideError();
            });
        }

        // Global error handler
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            ui.showError('An unexpected error occurred. Check console for details.');
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            ui.showError('An unexpected error occurred. Check console for details.');
        });
    }

    /**
     * Set up connectivity monitoring
     */
    setupConnectivityMonitoring() {
        ui.setupConnectivityListeners(
            () => {
                console.log('App is online');
                ui.hideOfflineIndicator();
            },
            () => {
                console.log('App is offline');
                ui.showOfflineIndicator();
            }
        );
    }

    /**
     * Set up quick action buttons
     */
    setupQuickActions() {
        // Floating action buttons
        const fabFood = document.getElementById('fab-add-food');
        const fabWorkout = document.getElementById('fab-add-workout');

        if (fabFood) {
            fabFood.addEventListener('click', async () => {
                // Open food library directly
                const { showFoodLibraryModal } = await import('./components/food-library.js');
                showFoodLibraryModal();
            });
        }

        if (fabWorkout) {
            fabWorkout.addEventListener('click', async () => {
                // Open workout library directly
                const { showWorkoutLibraryModal } = await import('./components/workout-library.js');
                showWorkoutLibraryModal();
            });
        }

        // Legacy quick action buttons
        document.querySelectorAll('.btn-quick-action, .btn-quick-action-small').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.target.dataset.action;
                switch (action) {
                    case 'add-macro':
                        await this.navigateTo('macros');
                        break;
                    case 'add-workout':
                        await this.navigateTo('workouts');
                        break;
                }
            });
        });
    }

    /**
     * Set up date navigation
     */
    setupDateNavigation() {
        const datePicker = document.getElementById('current-date');
        const btnPrevDay = document.getElementById('btn-prev-day');
        const btnNextDay = document.getElementById('btn-next-day');
        const btnToday = document.getElementById('btn-today');

        // Initialize date picker with current date
        if (datePicker) {
            datePicker.value = this.currentDate;

            // Date picker change
            datePicker.addEventListener('change', async (e) => {
                await this.setDate(e.target.value);
            });
        }

        // Previous day button
        if (btnPrevDay) {
            btnPrevDay.addEventListener('click', async () => {
                const date = new Date(this.currentDate);
                date.setDate(date.getDate() - 1);
                await this.setDate(date.toISOString().split('T')[0]);
            });
        }

        // Next day button
        if (btnNextDay) {
            btnNextDay.addEventListener('click', async () => {
                const date = new Date(this.currentDate);
                date.setDate(date.getDate() + 1);
                await this.setDate(date.toISOString().split('T')[0]);
            });
        }

        // Today button
        if (btnToday) {
            btnToday.addEventListener('click', async () => {
                await this.setDate(getTodayDate());
            });
        }
    }

    /**
     * Set the current date and reload screen
     * @param {string} date - Date in YYYY-MM-DD format
     */
    async setDate(date) {
        this.currentDate = date;

        // Update date picker
        const datePicker = document.getElementById('current-date');
        if (datePicker) {
            datePicker.value = date;
        }

        // Update screen title to show date if not today
        const today = getTodayDate();
        const screenTitle = document.getElementById('screen-title');
        if (screenTitle && date !== today) {
            const dateObj = new Date(date);
            const dateStr = dateObj.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            screenTitle.textContent = `Fitness Tracker - ${dateStr}`;
        } else if (screenTitle) {
            screenTitle.textContent = 'Fitness Tracker';
        }

        // Reload current screen with new date
        await this.loadScreen(this.currentScreen);
    }

    /**
     * Get current selected date
     * @returns {string} Date in YYYY-MM-DD format
     */
    getCurrentDate() {
        return this.currentDate;
    }

    /**
     * Request persistent storage to prevent data loss
     */
    async requestPersistentStorage() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                const isPersisted = await navigator.storage.persist();
                if (isPersisted) {
                    console.log('Storage persisted: data will not be cleared automatically');
                } else {
                    console.log('Storage not persisted: data may be cleared by browser');
                }
            } else {
                console.log('Persistent storage API not supported');
            }
        } catch (error) {
            console.error('Error requesting persistent storage:', error);
        }
    }

    /**
     * Check if auto-backup is needed and perform it
     */
    async checkAutoBackup() {
        try {
            const lastBackup = localStorage.getItem('last_auto_backup');
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

            if (!lastBackup || (now - parseInt(lastBackup)) > oneWeek) {
                console.log('Performing weekly auto-backup...');
                await this.performAutoBackup();
                localStorage.setItem('last_auto_backup', now.toString());
            } else {
                const daysUntilNext = Math.ceil((oneWeek - (now - parseInt(lastBackup))) / (24 * 60 * 60 * 1000));
                console.log(`Next auto-backup in ${daysUntilNext} days`);
            }
        } catch (error) {
            console.error('Error checking auto-backup:', error);
        }
    }

    /**
     * Perform automatic backup to Downloads folder
     */
    async performAutoBackup() {
        try {
            const data = await db.exportAllData();
            const dataStr = JSON.stringify(data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Create download with fixed filename
            const a = document.createElement('a');
            a.href = url;
            a.download = 'fitness-pizza-backup.json'; // Fixed filename - will overwrite

            // Trigger download silently
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Auto-backup completed: fitness-pizza-backup.json');
        } catch (error) {
            console.error('Auto-backup failed:', error);
        }
    }

    /**
     * Apply a theme to the app
     * @param {string} theme - Theme name (dark, light, white-on-black, goth-rave, psychedelic, pink, trs-80)
     */
    applyTheme(theme) {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);
        console.log(`Theme applied: ${theme}`);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new FitnessTrackerApp();
    app.init();

    // Make app instance globally available for debugging
    window.fitnessApp = app;
});
