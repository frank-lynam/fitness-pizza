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
        // Get base goals from settings
        let goalFat = parseFloat(await db.getSetting('goal_fat') || 70);
        let goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
        let goalCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);

        // Check if reverse diet is enabled for this date
        const reverseDietDates = JSON.parse(await db.getSetting('reverse_diet_dates') || '{}');
        const isReverseDiet = reverseDietDates[date] === true;

        if (isReverseDiet) {
            goalFat *= 1.2;
            goalProtein *= 1.2;
            goalCarbs *= 1.2;
        }

        // Check if running average mode is enabled
        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';

        if (runningAvgEnabled) {
            // Get past 6 days of consumption (not including today)
            const allMacros = await db.getAllMacros();
            const dateObj = new Date(date);
            const past6Days = [];

            for (let i = 1; i <= 6; i++) {
                const pastDate = new Date(dateObj);
                pastDate.setDate(pastDate.getDate() - i);
                const pastDateStr = pastDate.toISOString().split('T')[0];
                past6Days.push(pastDateStr);
            }

            // Calculate totals for past 6 days (completed only)
            let totalPastFat = 0;
            let totalPastProtein = 0;
            let totalPastCarbs = 0;

            for (const pastDate of past6Days) {
                const dayMacros = allMacros.filter(m =>
                    m.date === pastDate && m.status === 'completed'
                );
                totalPastFat += dayMacros.reduce((sum, m) => sum + (m.fat || 0), 0);
                totalPastProtein += dayMacros.reduce((sum, m) => sum + (m.protein || 0), 0);
                totalPastCarbs += dayMacros.reduce((sum, m) => sum + (m.carbs || 0), 0);
            }

            // Calculate what we'd need today to make the week average to the base goal
            // Base goals (without reverse diet) for the calculation
            const baseFat = parseFloat(await db.getSetting('goal_fat') || 70);
            const baseProtein = parseFloat(await db.getSetting('goal_protein') || 150);
            const baseCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);

            const compensationFat = (baseFat * 7) - totalPastFat;
            const compensationProtein = (baseProtein * 7) - totalPastProtein;
            const compensationCarbs = (baseCarbs * 7) - totalPastCarbs;

            // Running average target = halfway between goal and compensation
            goalFat = (goalFat + compensationFat) / 2;
            goalProtein = (goalProtein + compensationProtein) / 2;
            goalCarbs = (goalCarbs + compensationCarbs) / 2;
        }

        const goalCalories = (goalFat * 9) + (goalProtein * 4) + (goalCarbs * 4);

        return {
            fat: goalFat,
            protein: goalProtein,
            carbs: goalCarbs,
            calories: goalCalories
        };
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

            // Calculate net calories (intake - half of burn)
            const halfBurn = totalCaloriesBurned / 2;
            const netCalories = totalCalories - halfBurn;
            const intakePercent = (totalCalories / goalCalories) * 100;
            const burnPercent = (halfBurn / goalCalories) * 100;

            // Clamp burnPercent to not exceed intakePercent for display
            const displayBurnPercent = Math.min(burnPercent, intakePercent);

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

            // Calculate workout burn as percentage
            const workoutBurnPercent = (totalCaloriesBurned / goalCalories) * 100;

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
                                <!-- Label (always visible) -->
                                <span class="progress-label">Fat</span>
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
                                <!-- Label (always visible) -->
                                <span class="progress-label">Carbs</span>
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
                                <!-- Label (always visible) -->
                                <span class="progress-label">Protein</span>
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
                                    const scaledWorkoutBurn = (workoutBurnPercent / scale) * 100;

                                    // Calculate positions
                                    const fatStart = 0;
                                    const carbsStart = scaledFatCal;
                                    const proteinStart = scaledFatCal + scaledCarbsCal;
                                    const totalMacroWidth = scaledFatCal + scaledCarbsCal + scaledProteinCal;

                                    return `
                                        <!-- Planned layers -->
                                        ${plannedCalories > 0 ? `<div class="progress-fill calories-planned" style="position: absolute; left: 0%; width: ${caloriesDim.scaledTotal}%; z-index: 1;"></div>` : ''}

                                        <!-- Completed macro segments (no border-radius to avoid gaps) -->
                                        ${scaledFatCal > 0 ? `<div class="progress-fill fat" style="position: absolute; left: ${fatStart}%; width: ${scaledFatCal}%; z-index: 2;"></div>` : ''}
                                        ${scaledCarbsCal > 0 ? `<div class="progress-fill carbs" style="position: absolute; left: ${carbsStart}%; width: ${scaledCarbsCal}%; z-index: 2;"></div>` : ''}
                                        ${scaledProteinCal > 0 ? `<div class="progress-fill protein" style="position: absolute; left: ${proteinStart}%; width: ${scaledProteinCal}%; z-index: 2;"></div>` : ''}

                                        <!-- Workout burn (red ghost at the end) -->
                                        ${workoutBurnPercent > 0 ? `<div class="progress-fill-burn" style="position: absolute; left: ${totalMacroWidth}%; width: ${scaledWorkoutBurn}%; z-index: 1;"></div>` : ''}

                                        <!-- Overflow portion if calories exceed 100% -->
                                        ${caloriesDim.hasOverflow ? `<div class="progress-fill-overflow calories" style="position: absolute; left: ${marker100Percent}%; width: ${caloriesDim.scaledTotal - marker100Percent}%; z-index: 3;"></div>` : ''}
                                    `;
                                })()}
                                <!-- 100% marker -->
                                ${needsScaling ? `<div class="progress-marker-100" style="left: ${marker100Percent}%;"></div>` : ''}
                                <!-- Label (always visible) -->
                                <span class="progress-label">Calories</span>
                                <span class="progress-value ${goalCalories - netCalories - plannedCalories < 0 ? 'over-target' : ''}">${
                                    goalCalories - netCalories - plannedCalories >= 0
                                        ? Math.max(0, goalCalories - netCalories - plannedCalories).toFixed(0) + ' left'
                                        : '+' + Math.abs(goalCalories - netCalories - plannedCalories).toFixed(0) + ' over'
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
                            entry.status = 'completed';
                            entry.timestamp = Date.now(); // Update timestamp to now
                            await db.updateMacroEntry(entry);

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

        // Running average mode toggle
        const runningAvgCheckbox = document.getElementById('running-average-mode');
        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';
        if (runningAvgCheckbox) {
            runningAvgCheckbox.checked = runningAvgEnabled;
            runningAvgCheckbox.addEventListener('change', async () => {
                await db.setSetting('running_average_mode', runningAvgCheckbox.checked ? 'true' : 'false');
                // Reload dashboard if visible to update targets
                if (this.currentScreen === 'dashboard') {
                    await this.loadDashboard();
                }
                ui.showSuccess(runningAvgCheckbox.checked ?
                    'Running Average Mode enabled' :
                    'Running Average Mode disabled');
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
                    a.download = `fitness-tracker-export-${new Date().toISOString()}.json`;
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
            a.download = 'fitness-tracker-backup.json'; // Fixed filename - will overwrite

            // Trigger download silently
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Auto-backup completed: fitness-tracker-backup.json');
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
