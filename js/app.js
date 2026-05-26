/**
 * Fitness Tracker PWA - Main Application
 * Initializes the app, sets up routing, and coordinates all modules
 */

import { db } from './db.js';
import * as ui from './ui.js';
import { getTodayDate } from './utils/date-utils.js';
import { calculateMacroCalories, applyWorkoutCredit } from './utils/calorie-calc.js';
import { computeGoalAdjustments } from './utils/pi-controller.js';
import { initMacroForm, loadTodaysMacros, setDailyGoals } from './components/macro-form.js';
import { initMeasurementForm, loadMeasurements as loadMeasurementsList } from './components/measurement-form.js';
import { initWorkoutForm, loadWorkouts as loadWorkoutsList } from './components/workout-form.js';
import { initFoodLibrary } from './components/food-library.js';
import { initEasterEggs } from './easter-eggs.js';
import { initRunTracker } from './components/run-tracker.js';

// Authoritative running version — baked in at build time so we never rely
// on CU.current().bundle.version, which unreliably returns 'builtin' after
// CU.set() reloads the webview.
const APP_VERSION = '2.5.7';

function activityFactorLabel(f) {
    if (f <= 1.2)    return 'Sedentary (desk job)';
    if (f <= 1.375)  return 'Lightly active (1–3 days/wk)';
    if (f <= 1.55)   return 'Moderately active (3–5 days/wk)';
    if (f <= 1.725)  return 'Very active (6–7 days/wk)';
    return 'Extra active (2×/day)';
}

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
            await db.seedDefaultFoodsIfEmpty();

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

            // Set up help & feedback buttons (static HTML, set up once)
            this.setupHelpButtons();

            // 🐰🌈🦄 Easter eggs
            initEasterEggs();

            // Native Capacitor features (background GPS run tracking)
            if (window.Capacitor?.isNativePlatform?.()) {
                document.body.classList.add('is-native');
                this.initCapgoUpdater();
                initRunTracker();
            }

            // Load initial screen (dashboard)
            await this.loadScreen('dashboard');

            this.initialized = true;
            ui.hideLoading();

            // Show quick start on first ever visit
            if (!localStorage.getItem('fp_visited')) {
                localStorage.setItem('fp_visited', '1');
                setTimeout(() => this.showQuickStartModal(), 600);
            }

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
        const SCREENS = ['dashboard', 'macros', 'measurements', 'workouts', 'trends', 'settings'];

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

        // Horizontal swipe with sliding animation
        const content = document.getElementById('main-content');
        if (content) {
            let startX = 0, startY = 0, dirLocked = null, dragging = false;
            let swipeDir = 0, activeEl = null, ghostEl = null;

            content.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                dirLocked = null;
                dragging = false;
            }, { passive: true });

            content.addEventListener('touchmove', e => {
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;

                if (!dirLocked) {
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                    dirLocked = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'h' : 'v';
                }
                if (dirLocked !== 'h') return;
                e.preventDefault();

                const idx = SCREENS.indexOf(this.currentScreen);
                const dir = dx < 0 ? -1 : 1;
                if (dir === -1 && idx >= SCREENS.length - 1) return;
                if (dir === 1 && idx <= 0) return;

                if (!dragging) {
                    dragging = true;
                    swipeDir = dir;
                    activeEl = document.getElementById(`screen-${this.currentScreen}`);
                    ghostEl = document.getElementById(`screen-${SCREENS[idx - dir]}`);
                    if (activeEl) activeEl.style.transition = 'none';
                    if (ghostEl) {
                        const w = content.offsetWidth;
                        ghostEl.style.cssText = `display:block;transition:none;transform:translateX(${dir === -1 ? w : -w}px)`;
                    }
                }

                const w = content.offsetWidth;
                const cx = Math.max(-w, Math.min(w, dx));
                if (activeEl) activeEl.style.transform = `translateX(${cx}px)`;
                if (ghostEl) ghostEl.style.transform = `translateX(${(swipeDir === -1 ? w : -w) + cx}px)`;
            }, { passive: false });

            const finishSwipe = async (e) => {
                if (!dragging) return;
                const dx = (e.changedTouches?.[0]?.clientX ?? startX) - startX;
                const w = content.offsetWidth || 1;
                const THRESHOLD = w * 0.3;
                const complete = (swipeDir === -1 && dx < -THRESHOLD) || (swipeDir === 1 && dx > THRESHOLD);
                const idx = SCREENS.indexOf(this.currentScreen);
                const target = SCREENS[idx - swipeDir];

                dragging = false; dirLocked = null;
                const ae = activeEl, ge = ghostEl;
                activeEl = null; ghostEl = null;

                if (complete && target) {
                    if (ae) { ae.style.transition = 'transform 0.25s ease-out'; ae.style.transform = `translateX(${swipeDir === -1 ? -w : w}px)`; }
                    if (ge) { ge.style.transition = 'transform 0.25s ease-out'; ge.style.transform = 'translateX(0)'; }
                    setTimeout(async () => {
                        await this.navigateTo(target, false);
                        if (ae) ae.style.cssText = '';
                        if (ge) ge.style.cssText = '';
                    }, 250);
                } else {
                    if (ae) { ae.style.transition = 'transform 0.25s ease-out'; ae.style.transform = ''; setTimeout(() => { ae.style.cssText = ''; }, 250); }
                    if (ge) { ge.style.transition = 'transform 0.25s ease-out'; ge.style.transform = `translateX(${swipeDir === -1 ? w : -w}px)`; setTimeout(() => { ge.style.cssText = ''; }, 250); }
                }
            };

            const cancelSwipe = () => {
                if (!dragging) return;
                dragging = false; dirLocked = null;
                if (activeEl) { activeEl.style.cssText = ''; activeEl = null; }
                if (ghostEl) { ghostEl.style.cssText = ''; ghostEl = null; }
            };

            content.addEventListener('touchend', finishSwipe, { passive: true });
            content.addEventListener('touchcancel', cancelSwipe, { passive: true });
        }

        // Auto-refresh current tab whenever any component saves data
        window.addEventListener('fp:data-changed', () => {
            if (this.initialized) this.loadScreen(this.currentScreen);
        });
    }

    /**
     * Navigate to a screen
     * @param {string} screenName
     * @param {boolean} animate - whether to play the fade-in animation (false when swipe already animated)
     */
    async navigateTo(screenName, animate = true) {
        if (this.currentScreen === screenName) return;
        history.pushState({ screen: screenName }, '', `#${screenName}`);
        await this.loadScreen(screenName, animate);
    }

    /**
     * Load a screen and its data
     * @param {string} screenName
     * @param {boolean} animate
     */
    async loadScreen(screenName, animate = true) {
        try {
            this.currentScreen = screenName;
            if (!animate) {
                const el = document.getElementById(`screen-${screenName}`);
                el?.classList.add('no-anim');
                ui.showScreen(screenName);
                requestAnimationFrame(() => el?.classList.remove('no-anim'));
            } else {
                ui.showScreen(screenName);
            }

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
        const today = getTodayDate(); // local date, not UTC

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

        const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');

        // Workout credit settings (used in PI controller and final goal calc)
        const workoutCreditFraction = parseFloat(await db.getSetting('workout_credit_fraction') || '0.5');
        const workoutCreditMacros = {
            fat:     parseFloat(await db.getSetting('workout_credit_fat_weight')     || '34'),
            protein: parseFloat(await db.getSetting('workout_credit_protein_weight') || '33'),
            carbs:   parseFloat(await db.getSetting('workout_credit_carbs_weight')   || '33'),
        };

        // Check if running average mode is enabled
        const runningAvgEnabled = await db.getSetting('running_average_mode') === 'true';

        let goalFat = baseFat;
        let goalProtein = baseProtein;
        let goalCarbs = baseCarbs;
        let piDebug = null;
        let goalHistory = {};

        if (runningAvgEnabled) {
            // PI controller gains (Kp is user-configurable; Ki is derived from Ialpha)
            const Kp = parseFloat(await db.getSetting('pi_kp') || '0.5');
            const Ialpha = parseFloat(await db.getSetting('pi_ialpha') || '0.25');

            const allMacros = await db.getAllMacros();
            const allWorkouts = await db.getAllWorkouts();

            // Stored displayed goals for I-term reference (prevents limit cycles)
            goalHistory = JSON.parse(await db.getSetting('pi_goal_history') || '{}');

            const result = computeGoalAdjustments({
                allMacros, date, today,
                baseFat, baseProtein, baseCarbs,
                cheatDayDates,
                allWorkouts,
                goalHistory,
                Kp, Ialpha,
                workoutCreditFraction, workoutCreditMacros
            });

            goalFat     = result.goalFat;
            goalProtein = result.goalProtein;
            goalCarbs   = result.goalCarbs;
            piDebug     = result.piDebug;
        }

        // Add workout credit: distribute burned calories as additional macro allowance
        // using the user-configured fraction and macro selection
        const workouts = await db.getWorkoutsByDate(date);
        const caloriesBurned = workouts
            .filter(w => w.status !== 'planned')
            .reduce((sum, w) => sum + (w.estimated_calories_burned || 0), 0);
        const caloriesCredited = caloriesBurned * workoutCreditFraction;

        const goalFatBeforeCredit     = goalFat;
        const goalProteinBeforeCredit = goalProtein;
        const goalCarbsBeforeCredit   = goalCarbs;

        if (caloriesBurned > 0) {
            const credited = applyWorkoutCredit(goalFat, goalProtein, goalCarbs, caloriesBurned, workoutCreditFraction, workoutCreditMacros);
            goalFat     = credited.fat;
            goalProtein = credited.protein;
            goalCarbs   = credited.carbs;
        }

        // Planned workout credit (preview only — not applied to effective goals)
        const plannedWorkoutBurn = workouts
            .filter(w => w.status === 'planned')
            .reduce((sum, w) => sum + (w.estimated_calories_burned || 0), 0);
        let plannedWorkoutCreditFat_g = 0, plannedWorkoutCreditProtein_g = 0, plannedWorkoutCreditCarbs_g = 0;
        let plannedCaloriesCreditedFromPlanned = 0;
        if (plannedWorkoutBurn > 0) {
            const pc = applyWorkoutCredit(goalFat, goalProtein, goalCarbs, plannedWorkoutBurn, workoutCreditFraction, workoutCreditMacros);
            plannedWorkoutCreditFat_g     = pc.fat     - goalFat;
            plannedWorkoutCreditProtein_g = pc.protein - goalProtein;
            plannedWorkoutCreditCarbs_g   = pc.carbs   - goalCarbs;
            plannedCaloriesCreditedFromPlanned = plannedWorkoutBurn * workoutCreditFraction;
        }

        const goalCalories = calculateMacroCalories(goalProtein, goalCarbs, goalFat, 0);

        // Store today's fully-adjusted displayed goal for future I-term lookback.
        // The stored goal (base + RD + PI adj + workout credit) is used by the
        // I-term as the reference, preventing the limit cycle where the controller
        // raises the goal high enough that the person eats near base, fading I-memory
        // and returning the goal to base indefinitely.
        // Only saved when computing today's goal, not when querying historical dates.
        if (runningAvgEnabled && date === today) {
            goalHistory[today] = { fat: goalFat, protein: goalProtein, carbs: goalCarbs };
            // Trim to last 14 days to bound storage size
            const cutoff = new Date(today + 'T12:00:00');
            cutoff.setDate(cutoff.getDate() - 14);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            Object.keys(goalHistory).forEach(k => { if (k < cutoffStr) delete goalHistory[k]; });
            await db.setSetting('pi_goal_history', JSON.stringify(goalHistory));
        }

        return {
            fat: goalFat,
            protein: goalProtein,
            carbs: goalCarbs,
            calories: goalCalories,
            caloriesBurned,
            caloriesCredited,
            // Per-macro workout credit in grams (for display in PI debug table)
            workoutCreditFat_g:     goalFat     - goalFatBeforeCredit,
            workoutCreditProtein_g: goalProtein - goalProteinBeforeCredit,
            workoutCreditCarbs_g:   goalCarbs   - goalCarbsBeforeCredit,
            workoutCreditFraction,
            plannedWorkoutCreditFat_g,
            plannedWorkoutCreditProtein_g,
            plannedWorkoutCreditCarbs_g,
            plannedCaloriesCreditedFromPlanned,
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
        const { loadDashboard } = await import('./components/dashboard.js');
        await loadDashboard(
            this.currentDate,
            () => this.calculateEffectiveGoals(this.currentDate),
            () => this.loadRecentActivity()
        );
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
                // Planned items always come first
                const aPlanned = a.data.status === 'planned';
                const bPlanned = b.data.status === 'planned';
                if (aPlanned && !bPlanned) return -1;
                if (!aPlanned && bPlanned) return 1;
                // Otherwise sort by timestamp (most recent first)
                return b.timestamp - a.timestamp;
            });

            if (activities.length === 0) {
                activityList.innerHTML = '<p class="text-muted">No activity today</p>';
                return;
            }

            // Read workout credit settings for planned workout preview
            const workoutCreditFraction = parseFloat(await db.getSetting('workout_credit_fraction') || '0.5');
            const workoutCreditMacros = {
                fat:     (await db.getSetting('workout_credit_fat'))     !== 'false',
                protein: (await db.getSetting('workout_credit_protein')) !== 'false',
                carbs:   (await db.getSetting('workout_credit_carbs'))   !== 'false',
            };
            const baseFat     = parseFloat(await db.getSetting('goal_fat') || 70);
            const baseProtein = parseFloat(await db.getSetting('goal_protein') || 150);
            const baseCarbs   = parseFloat(await db.getSetting('goal_carbs') || 200);

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
                        const workoutCal = activity.data.estimated_calories_burned;
                        const workoutDone = activity.data.status !== 'planned';
                        let workoutSubtitle = '';
                        if (workoutDone && workoutCal > 0) {
                            workoutSubtitle = `~${workoutCal} cal burned • `;
                        } else if (!workoutDone && workoutCal > 0) {
                            const credited = applyWorkoutCredit(baseFat, baseProtein, baseCarbs, workoutCal, workoutCreditFraction, workoutCreditMacros);
                            const parts = [];
                            if (credited.fat > baseFat)         parts.push(`+${(credited.fat     - baseFat    ).toFixed(1)}f`);
                            if (credited.carbs > baseCarbs)     parts.push(`+${(credited.carbs   - baseCarbs  ).toFixed(1)}c`);
                            if (credited.protein > baseProtein) parts.push(`+${(credited.protein - baseProtein).toFixed(1)}p`);
                            const creditStr = parts.length > 0 ? ` · ${parts.join(' / ')} if done` : '';
                            workoutSubtitle = `~${workoutCal} cal${creditStr} • `;
                        }
                        return `
                            <div class="activity-item ${workoutDone ? '' : 'planned'}">
                                ${!workoutDone ? `
                                    <button class="btn-complete-workout" data-id="${activity.data.id}" title="Complete">✓</button>
                                ` : ''}
                                <span class="activity-icon">💪</span>
                                <div class="activity-content">
                                    <div class="activity-title">${activity.data.exercise_name}</div>
                                    <div class="activity-time">${workoutSubtitle}${date} at ${time}</div>
                                </div>
                                ${!workoutDone ? `
                                    <button class="btn-remove-activity" data-id="${activity.data.id}" data-type="workout" title="Remove">×</button>
                                ` : ''}
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
                            if (entry.status === 'planned') {
                                // Find any matching completed entry to stack with (shared by all branches)
                                const todayMacros = await db.getMacrosByDate(entry.date);
                                const existingCompleted = todayMacros.find(m =>
                                    m.status === 'completed' &&
                                    m.id !== entry.id &&
                                    (
                                        (entry.food_id && m.food_id === entry.food_id) ||
                                        (entry.meal_name && m.meal_name === entry.meal_name)
                                    )
                                );

                                if (entry.servings > 1) {
                                    // Multi-serving: confirm exactly 1 serving, leave the rest planned
                                    const perServing = {
                                        protein: entry.protein / entry.servings,
                                        carbs: entry.carbs / entry.servings,
                                        fat: entry.fat / entry.servings,
                                        fiber: entry.fiber / entry.servings,
                                        calories: entry.calories / entry.servings
                                    };

                                    if (existingCompleted) {
                                        // Add 1 serving to existing completed entry
                                        existingCompleted.servings = (existingCompleted.servings || 1) + 1;
                                        existingCompleted.protein += perServing.protein;
                                        existingCompleted.carbs += perServing.carbs;
                                        existingCompleted.fat += perServing.fat;
                                        existingCompleted.fiber = (existingCompleted.fiber || 0) + (perServing.fiber || 0);
                                        existingCompleted.calories += perServing.calories;
                                        await db.updateMacroEntry(existingCompleted);
                                    } else {
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
                                        delete completedEntry.id;
                                        await db.addMacroEntry(completedEntry);
                                    }

                                    // Reduce the planned entry by 1 serving
                                    const remainingServings = entry.servings - 1;
                                    entry.servings = remainingServings;
                                    entry.protein = perServing.protein * remainingServings;
                                    entry.carbs = perServing.carbs * remainingServings;
                                    entry.fat = perServing.fat * remainingServings;
                                    entry.fiber = perServing.fiber * remainingServings;
                                    entry.calories = perServing.calories * remainingServings;
                                    await db.updateMacroEntry(entry);
                                } else {
                                    // Final serving (1.0 or a fractional remainder like 0.5)
                                    if (existingCompleted) {
                                        // Stack with existing completed entry
                                        existingCompleted.servings = (existingCompleted.servings || 1) + (entry.servings || 1);
                                        existingCompleted.protein += entry.protein;
                                        existingCompleted.carbs += entry.carbs;
                                        existingCompleted.fat += entry.fat;
                                        existingCompleted.fiber = (existingCompleted.fiber || 0) + (entry.fiber || 0);
                                        existingCompleted.calories += entry.calories;
                                        await db.updateMacroEntry(existingCompleted);
                                        await db.deleteMacroEntry(entry.id);
                                    } else {
                                        // No existing stack — convert planned to completed in-place
                                        entry.status = 'completed';
                                        entry.timestamp = Date.now();
                                        await db.updateMacroEntry(entry);
                                    }
                                }
                            } else {
                                // Already completed entry — ensure status is set
                                entry.status = 'completed';
                                entry.timestamp = Date.now();
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

            // Workout complete buttons (one-way: planned → completed only)
            activityList.querySelectorAll('.btn-complete-workout').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id);
                    try {
                        const entry = await db.get('workouts', id);
                        if (entry && entry.status === 'planned') {
                            entry.status = 'completed';
                            entry.timestamp = Date.now();
                            // Keep entry.date as-is so the workout stays on the day it was
                            // planned for — moving it to today would lose PI workout credit
                            await db.updateWorkout(entry);
                            await this.loadDashboard();
                        }
                    } catch (error) {
                        console.error('Error completing workout:', error);
                        ui.showError('Failed to update workout');
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
                        } else if (type === 'workout') {
                            await db.deleteWorkout(id);
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
        // Inject PI-adjusted goals so the progress summary matches the dashboard
        const goals = await this.calculateEffectiveGoals(this.currentDate);
        setDailyGoals(goals);
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
        const fmtAdj = (n) => n === 0 ? '0g' : fmt(-n); // final_adj is subtracted from base, so invert for display

        // Per-macro workout credit in grams (returned directly by calculateEffectiveGoals)
        const caloriesCredited = goals.caloriesCredited || 0;
        const workoutCreditFat_g     = goals.workoutCreditFat_g     || 0;
        const workoutCreditProtein_g = goals.workoutCreditProtein_g || 0;
        const workoutCreditCarbs_g   = goals.workoutCreditCarbs_g   || 0;

        const macros = [
            { key: 'fat',     label: 'Fat',     base: baseFat,     goal: goals.fat,     d: piDebug.fat,     workoutG: workoutCreditFat_g },
            { key: 'carbs',   label: 'Carbs',   base: baseCarbs,   goal: goals.carbs,   d: piDebug.carbs,   workoutG: workoutCreditCarbs_g },
            { key: 'protein', label: 'Protein', base: baseProtein, goal: goals.protein, d: piDebug.protein, workoutG: workoutCreditProtein_g },
        ];

        const rows = macros.map(({ label, base, goal, d, workoutG }) => {
            // P corr and I corr are expressed in goal-space: positive = goal raised (under-eating), negative = goal lowered (over-eating)
            const pCorr = -d.p_adj;
            const iCorr = -d.i_adj;
            const clampNote = d.clamped ? ` <span style="color:var(--warning-color);" title="Raw adjustment ${fmtAdj(d.raw_adj)} was clamped to ±${(piDebug.cap * 100).toFixed(0)}% cap">⚠ capped</span>` : '';
            const workoutCell = workoutG > 0.05
                ? `<span style="color:var(--accent-color);">+${workoutG.toFixed(1)}g</span>`
                : `<span style="color:var(--text-secondary);">—</span>`;
            return `
                <tr>
                    <td style="padding:4px 8px;font-weight:600;">${label}</td>
                    <td style="padding:4px 8px;text-align:right;">${base.toFixed(0)}g</td>
                    <td style="padding:4px 8px;text-align:right;color:${pCorr >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${fmt(pCorr)}</td>
                    <td style="padding:4px 8px;text-align:right;color:${iCorr >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${fmt(iCorr)}</td>
                    <td style="padding:4px 8px;text-align:right;">${fmtAdj(d.final_adj)}${clampNote}</td>
                    <td style="padding:4px 8px;text-align:right;">${workoutCell}</td>
                    <td style="padding:4px 8px;text-align:right;font-weight:600;">${goal.toFixed(0)}g</td>
                </tr>`;
        }).join('');

        // Calories row (calorie equivalents of all macro adjustments)
        const fmtCal = (n) => (n >= 0 ? '+' : '') + Math.round(n) + 'cal';
        const calBase = calculateMacroCalories(baseProtein, baseCarbs, baseFat, 0);
        // P corr / I corr in calorie space: positive = goal raised (under-eating)
        const calPCorr = -(piDebug.fat.p_adj * 9 + piDebug.protein.p_adj * 4 + piDebug.carbs.p_adj * 4);
        const calICorr = -(piDebug.fat.i_adj * 9 + piDebug.protein.i_adj * 4 + piDebug.carbs.i_adj * 4);
        const calAdj  = piDebug.fat.final_adj * 9 + piDebug.protein.final_adj * 4 + piDebug.carbs.final_adj * 4;
        const calClamped = piDebug.fat.clamped || piDebug.protein.clamped || piDebug.carbs.clamped;
        const calClampNote = calClamped ? ` <span style="color:var(--warning-color);">⚠ capped</span>` : '';
        const calWorkoutCell = caloriesCredited > 0.5
            ? `<span style="color:var(--accent-color);">+${Math.round(caloriesCredited)}cal</span>`
            : `<span style="color:var(--text-secondary);">—</span>`;
        const caloriesRow = `
                <tr style="border-top:1px solid var(--border-color);">
                    <td style="padding:4px 8px;font-weight:600;font-style:italic;">Calories</td>
                    <td style="padding:4px 8px;text-align:right;font-style:italic;">${Math.round(calBase)}cal</td>
                    <td style="padding:4px 8px;text-align:right;font-style:italic;color:${calPCorr >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${fmtCal(calPCorr)}</td>
                    <td style="padding:4px 8px;text-align:right;font-style:italic;color:${calICorr >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">${fmtCal(calICorr)}</td>
                    <td style="padding:4px 8px;text-align:right;font-style:italic;">${calAdj === 0 ? '0cal' : fmtCal(-calAdj)}${calClampNote}</td>
                    <td style="padding:4px 8px;text-align:right;font-style:italic;">${calWorkoutCell}</td>
                    <td style="padding:4px 8px;text-align:right;font-weight:600;font-style:italic;">${Math.round(goals.calories)}cal</td>
                </tr>`;

        // Per-day breakdown
        const dayRows = piDebug.dayData.map(d => {
            const errFmt = (e) => `<span style="color:${e >= 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmt(e)}</span>`;
            // ● = I-err vs stored displayed goal; ○ = fallback to base+workout (no history yet)
            const refDot = d.hasStoredGoal
                ? `<span style="color:var(--accent-color);font-size:10px;" title="I-error vs stored displayed goal">●</span>`
                : `<span style="color:var(--text-secondary);font-size:10px;" title="I-error vs base+workout (no stored goal yet)">○</span>`;
            return `<tr>
                <td style="padding:3px 6px;">${d.date} ${refDot}</td>
                <td style="padding:3px 6px;text-align:right;color:var(--text-secondary);">${(d.decayWeight * 100).toFixed(0)}%</td>
                <td style="padding:3px 6px;text-align:right;">${d.fat.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errFat)}</td>
                <td style="padding:3px 6px;text-align:right;">${d.protein.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errProtein)}</td>
                <td style="padding:3px 6px;text-align:right;">${d.carbs.toFixed(0)}g</td>
                <td style="padding:3px 6px;text-align:right;">${errFmt(d.errCarbs)}</td>
            </tr>`;
        }).join('');

        content.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color);color:var(--text-secondary);">
                            <th style="padding:4px 8px;text-align:left;">Macro</th>
                            <th style="padding:4px 8px;text-align:right;">Base</th>
                            <th style="padding:4px 8px;text-align:right;">P corr (yday)</th>
                            <th style="padding:4px 8px;text-align:right;">I corr (10d)</th>
                            <th style="padding:4px 8px;text-align:right;">PI adj</th>
                            <th style="padding:4px 8px;text-align:right;">Workout+</th>
                            <th style="padding:4px 8px;text-align:right;">Today's goal</th>
                        </tr>
                    </thead>
                    <tbody>${rows}${caloriesRow}</tbody>
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
                                <th style="padding:3px 6px;text-align:right;">Wt</th>
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
                <p style="font-size:11px;color:var(--text-secondary);margin-top:10px;line-height:1.5;">
                    <strong>Parameters:</strong> Kp=${piDebug.Kp.toFixed(2)}, Ki=${piDebug.Ki.toFixed(3)} (auto-derived), α=${piDebug.Ialpha.toFixed(2)}, cap ±${(piDebug.cap * 100).toFixed(0)}%.${goals.caloriesBurned > 0 ? ` Workout: ${goals.caloriesBurned.toFixed(0)} cal burned → ${goals.caloriesCredited.toFixed(0)} cal credited (${Math.round((goals.workoutCreditFraction || 0.5) * 100)}%).` : ''}<br>
                    <strong>W</strong> = Σ(1−α)<sup>i−1</sup> for i=1..10 = sum of exponential decay weights over the 10-day window = ${piDebug.W.toFixed(2)} (with current α). Ki is set to 1/W so that Ki×W=1, guaranteeing zero steady-state error regardless of α.<br>
                    <strong>P corr</strong> = Kp × yesterday's deviation from base+workout goal (fast reaction to yesterday's intake).<br>
                    <strong>I corr</strong> = Ki × 10-day weighted sum of deviations from your displayed goal (● stored history; ○ base+workout fallback before history exists). Using displayed goal prevents the limit cycle where a raised goal causes I-memory to fade once the person eats near base.<br>
                    Positive = goal raised (under-eating). Negative = goal lowered (over-eating). P corr + I corr = PI adj.
                </p>
            </details>
        `;
    }

    /**
     * Self-hosted live updates via @capgo/capacitor-updater (manual mode).
     * Fetches fitness-pizza.com/updates/latest.json, compares versions, and
     * silently downloads + queues the new bundle for the next app launch.
     * No Capgo cloud account needed — just static files on the website.
     */
    initCapgoUpdater() {
        const CU = window.Capacitor?.Plugins?.CapacitorUpdater;
        if (!CU) {
            console.warn('[updater] CapacitorUpdater plugin not found');
            return;
        }

        // Tell the plugin this bundle loaded successfully — prevents rollback timeout
        CU.notifyAppReady();

        // Run update check in background after startup settles
        setTimeout(() => this.checkLiveUpdate(CU), 5000);
    }

    async _fetchJson(url) {
        // On native, use CapacitorHttp to bypass CORS (WebView origin is
        // capacitor://localhost so servers without CORS headers block fetch()).
        if (window.Capacitor?.isNativePlatform?.()) {
            const Http = window.Capacitor?.Plugins?.CapacitorHttp;
            if (Http) {
                const r = await Http.request({ method: 'GET', url });
                return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
            }
        }
        return fetch(url).then(r => r.json());
    }

    async checkLiveUpdate(CU, silent = true) {
        const MANIFEST = 'https://fitness-pizza.com/updates/latest.json';
        try {
            const [current, latest] = await Promise.all([
                CU.current(),
                this._fetchJson(`${MANIFEST}?t=${Date.now()}`),
            ]);

            const nativeVersion = current.native;
            // Use APP_VERSION (baked into this JS file) as the authoritative current
            // version — CU.current().bundle.version unreliably returns 'builtin' after
            // CU.set() reloads the webview, which caused false update loops.
            const currentVersion = APP_VERSION;
            const handledVersion = localStorage.getItem('fp_update_handled');

            console.log(`[updater] native=${nativeVersion} current=${currentVersion} latest=${latest.version} handled=${handledVersion}`);

            if (!this._semverGt(latest.version, currentVersion)) {
                // Clear stale guard if we're genuinely on the latest version
                if (handledVersion && !this._semverGt(latest.version, handledVersion)) {
                    localStorage.removeItem('fp_update_handled');
                }
                if (!silent) ui.showToast('Already up to date');
                return;
            }

            // Bundle requires a newer native binary than what's installed
            if (this._semverGt(latest.minNativeVersion, nativeVersion)) {
                this.showApkUpdateDialog(latest.minNativeVersion);
                return;
            }

            // Already downloaded/queued this version — capgo will apply on next launch
            if (handledVersion === latest.version) {
                if (!silent) ui.showToast('Update pending — restart the app to apply');
                return;
            }

            // Mark as handled before downloading to prevent concurrent/repeated downloads
            localStorage.setItem('fp_update_handled', latest.version);

            const newBundle = await CU.download({ url: latest.url, version: latest.version });
            this.showLiveBundleUpdateDialog(CU, newBundle.id, latest.version);
        } catch (e) {
            localStorage.removeItem('fp_update_handled'); // allow retry on error
            console.warn('[updater] Update check failed:', e.message);
            if (!silent) {
                const msg = (e.message === 'Failed to fetch' || e.name === 'TypeError')
                    ? 'Could not reach server — check your connection and try again'
                    : 'Update check failed: ' + e.message;
                ui.showError(msg);
            }
        }
    }

    _semverGt(a, b) {
        const pa = (a || '0.0.0').split('.').map(n => parseInt(n) || 0);
        const pb = (b || '0.0.0').split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < 3; i++) {
            if (pa[i] > pb[i]) return true;
            if (pa[i] < pb[i]) return false;
        }
        return false;
    }

    /**
     * Show a dialog prompting the user to download a new APK.
     * Triggered when a live update bundle requires a newer native binary
     * than the currently installed APK provides.
     */
    showApkUpdateDialog(version) {
        if (document.getElementById('apk-update-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'apk-update-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3>📲 App Update Required</h3>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <p>Version <strong>${version}</strong> of Fitness Pizza includes changes that need a fresh install of the native app.</p>
                    <p style="color:var(--text-secondary);font-size:0.88em;margin-top:8px;">
                        Your data won't be affected — only the app itself is updated.
                    </p>
                    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
                        <a href="/app/android/fitness-pizza.apk" download
                           class="btn-primary" style="text-align:center;text-decoration:none;padding:14px;">
                            📥 Download New APK
                        </a>
                        <button id="apk-update-later" class="btn-secondary">Remind me later</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('apk-update-later').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    showLiveBundleUpdateDialog(CU, bundleId, version) {
        if (document.getElementById('live-update-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'live-update-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3>✨ Update Available</h3>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <p>Version <strong>${version}</strong> is ready to install. The app will restart instantly — your data is safe.</p>
                    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
                        <button id="live-update-now" class="btn-primary">Restart &amp; Update</button>
                        <button id="live-update-later" class="btn-secondary">Later</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('live-update-now').addEventListener('click', async () => {
            modal.remove();
            ui.showLoading('Closing app to apply update…');
            await CU.next({ id: bundleId });
            // exitApp gives a clean close so the OS relaunches with the new bundle.
            // CU.set() was avoided here because it triggers an in-session webview
            // reload that can fire mid-activity (e.g. during GPS acquisition).
            window.Capacitor?.Plugins?.App?.exitApp?.();
        });

        document.getElementById('live-update-later').addEventListener('click', async () => {
            modal.remove();
            await CU.next({ id: bundleId });
        });

        modal.addEventListener('click', async e => {
            if (e.target === modal) {
                modal.remove();
                await CU.next({ id: bundleId });
            }
        });
    }

    /**
     * Wire up the help & feedback buttons in the settings tab.
     * Called once from init() since the buttons are in static HTML.
     */
    setupHelpButtons() {
        document.getElementById('btn-quick-start-guide')?.addEventListener('click', () => {
            this.showQuickStartModal();
        });
        document.getElementById('btn-healthy-tips')?.addEventListener('click', () => {
            this.showHealthyTipsModal();
        });
        document.getElementById('btn-submit-feedback')?.addEventListener('click', () => {
            window.location.href = 'mailto:Frank@fitness-pizza.com?subject=Fitness%20Pizza%20Feedback';
        });

        document.getElementById('btn-check-updates')?.addEventListener('click', () => {
            const CU = window.Capacitor?.Plugins?.CapacitorUpdater;
            if (!CU) { ui.showError('Updater plugin not available'); return; }
            ui.showToast('Checking for updates…');
            this.checkLiveUpdate(CU, false);
        });
    }

    /** Quick Start Guide modal */
    showQuickStartModal() {
        const existing = document.getElementById('quick-start-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'quick-start-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:480px;">
                <div class="modal-header">
                    <h3>🍕 Welcome to Fitness Pizza</h3>
                    <button class="modal-close" id="qs-close-top">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;overflow-y:auto;">
                    <p style="color:var(--text-secondary);margin:0 0 20px;">
                        Track your macros like slices of a pizza pie. Here's everything you need to know:
                    </p>

                    <div class="qs-step">
                        <div class="qs-icon">🎯</div>
                        <div>
                            <strong>Set Your Daily Goals</strong>
                            <p>Go to <em>Settings → Daily Goals</em>. Enter your fat, protein, and carb targets — calories are calculated automatically. The app adjusts tomorrow's carb target each day using a feedback controller based on how close you hit your goals.</p>
                        </div>
                    </div>

                    <div class="qs-step">
                        <div class="qs-icon">🍽️</div>
                        <div>
                            <strong>Log Your Food</strong>
                            <p>Open the <em>Macros</em> tab. Tap <em>+ Add Macro Entry</em> to log fat, protein, carbs, and fiber manually. Build a <em>Food Library</em> of your common foods for one-tap logging. Use <em>📷 From Photo</em> or <em>🤖 AI from Text</em> for instant AI-powered estimates (requires a free Gemini API key in Settings).</p>
                        </div>
                    </div>

                    <div class="qs-step">
                        <div class="qs-icon">💪</div>
                        <div>
                            <strong>Log Workouts</strong>
                            <p>Open the <em>Workouts</em> tab. Add <em>Cardio</em> with duration and pace/speed/distance, or <em>Lifting</em>/<em>Core</em> with reps. Calorie burn is estimated automatically. Save frequent exercises to your <em>Workout Library</em> for one-tap re-logging.</p>
                        </div>
                    </div>

                    <div class="qs-step">
                        <div class="qs-icon">📏</div>
                        <div>
                            <strong>Track Your Body</strong>
                            <p>Log weight, waist, and body fat % in the <em>Measurements</em> tab. Use the Navy or Calipers estimators if you don't have a direct reading. The app builds a trend over time.</p>
                        </div>
                    </div>

                    <div class="qs-step">
                        <div class="qs-icon">📈</div>
                        <div>
                            <strong>See Your Progress</strong>
                            <p>The <em>Dashboard</em> shows today's macro breakdown at a glance. The <em>Trends</em> tab shows weight, lean mass, calorie balance, and macro charts over 7, 30, 90 days, or all time.</p>
                        </div>
                    </div>

                    <div class="qs-step">
                        <div class="qs-icon">📱</div>
                        <div>
                            <strong>Install as an App</strong>
                            <p>In Chrome, tap the menu (⋮) → <em>Add to Home Screen</em>. In Safari, tap Share (□↑) → <em>Add to Home Screen</em>. Once installed, the app works fully offline.</p>
                        </div>
                    </div>

                    <button id="qs-close-bottom" class="btn-primary" style="width:100%;margin-top:8px;">Got it — let's go! 🍕</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => { modal.remove(); };
        document.getElementById('qs-close-top').addEventListener('click', close);
        document.getElementById('qs-close-bottom').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
    }

    showHealthyTipsModal() {
        const existing = document.getElementById('healthy-tips-modal');
        if (existing) existing.remove();

        const tips = [
            {
                title: 'Permanent Change of Diet',
                body: `You need to find a way to make permanent changes, to change what you eat every day, forever. Find things you like that also won't harm you! There's so many options, maybe you love passion fruit, who knows if you don't try it?
                <br><br>Don't think in the back of your head that you're going to start eating cookies every day again, learn to look forward to something new. Fried chicken used to be my fave, now salad is! Yum 🥗!`
            },
            {
                title: 'Track Your Intake',
                body: `This sounds a little self-serving for a food tracking app, but most people just don't realize what they eat. Always try to track your real intake, every extra cookie, when you binge 10,000 calories, everything.
                <br><br>Some people say not to worry about the occasional binge or missed meal, but I'm always worried one will turn into two will turn into many. This app has a responsive target system, a "PI controller", which will help you rebalance variances over time, to help you keep your overall average on target.
                <br><br>It's ultimately about being healthy and eating what your body needs. You can't do that by lying to yourself about what you eat. 🙂‍↔️`
            },
            {
                title: 'Exercise Isn\'t Weight Loss',
                body: `I love to work out! Check out these guns 💪! But, realistically, workouts burn far less calories then you think they do. Work out to be healthy. Are you tired all the time? Can't walk upstairs without getting winded? You need to work out.
                <br><br>But it won't make you thin. Only eating right will.`
            },
            {
                title: 'No Sugar, No Ultra-Processed Foods',
                body: `Just stop eating them. Made by a billion dollar corporation, comes in a box with flashy advertising? It's almost certainly designed to addict you, not feed you, not satiate you. Stop eating them, they're made by the same people who got kids addicted to cigarettes, <a href="https://onlinelibrary.wiley.com/doi/10.1111/1468-0009.70066" target="_blank" style="color:var(--accent-primary)">I'm not even joking</a>. 💀
                <br><br>Learn to cook! It's fun! And yummy! And cheaper, omg, so cheap! I recommend zero sugar meringues, literally just egg whites and powdered erithrytol, whip it until it's stiff, dollop it onto parchment paper, 45 minutes at 225F, let it cool in the oven and then on the counter. So easy! Dust them with zero sugar pudding mix before baking for delicious flavors!`
            },
        ];

        const tipsHtml = tips.map(t => `
            <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:16px 18px;margin-bottom:14px;">
                <h4 style="color:var(--accent-primary);margin:0 0 10px;font-size:15px;">${t.title}</h4>
                <p style="color:var(--text-primary);font-size:14px;line-height:1.6;margin:0;">${t.body}</p>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'healthy-tips-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3>🥗 Healthy Tips</h3>
                    <button class="modal-close" id="tips-close">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;max-height:70vh;overflow-y:auto;">
                    ${tipsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        const close = () => modal.remove();
        document.getElementById('tips-close').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
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
            const calories = calculateMacroCalories(protein, carbs, fat, 0);
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
                const calories = calculateMacroCalories(protein, carbs, fat, 0);

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
                    'PI Controller enabled' : 'PI Controller disabled');
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

        // Ialpha slider
        const ialphaSlider = document.getElementById('pi-ialpha');
        const ialphaValue = document.getElementById('pi-ialpha-value');
        const savedIalpha = parseFloat(await db.getSetting('pi_ialpha') || '0.25');
        const updateIalphaHelp = (alpha) => {
            const helpEl = document.getElementById('pi-ialpha-help');
            const halfLife = (Math.log(0.5) / Math.log(1 - alpha)).toFixed(1);
            const W = (1 - Math.pow(1 - alpha, 10)) / alpha;
            const Ki = (1 / W).toFixed(3);
            if (helpEl) helpEl.textContent = `Memory decay rate — Ki is auto-derived from α (currently Ki=${Ki}, Ki×W=1 guaranteed). Higher α = shorter memory (current: ~${halfLife}d half-life).`;
        };
        if (ialphaSlider) {
            ialphaSlider.value = savedIalpha;
            if (ialphaValue) ialphaValue.textContent = savedIalpha.toFixed(2);
            updateIalphaHelp(savedIalpha);
            ialphaSlider.addEventListener('input', async () => {
                const alpha = parseFloat(ialphaSlider.value);
                if (ialphaValue) ialphaValue.textContent = alpha.toFixed(2);
                updateIalphaHelp(alpha);
                await db.setSetting('pi_ialpha', ialphaSlider.value);
            });
        }

        // Workout credit fraction slider
        const workoutCreditFractionSlider = document.getElementById('workout-credit-fraction');
        const workoutCreditFractionValueEl = document.getElementById('workout-credit-fraction-value');
        const savedCreditFraction = parseFloat(await db.getSetting('workout_credit_fraction') || '0.5');
        if (workoutCreditFractionSlider) {
            workoutCreditFractionSlider.value = savedCreditFraction;
            if (workoutCreditFractionValueEl) workoutCreditFractionValueEl.textContent = `${Math.round(savedCreditFraction * 100)}%`;
            workoutCreditFractionSlider.addEventListener('input', async () => {
                const v = parseFloat(workoutCreditFractionSlider.value);
                if (workoutCreditFractionValueEl) workoutCreditFractionValueEl.textContent = `${Math.round(v * 100)}%`;
                await db.setSetting('workout_credit_fraction', String(v));
                if (this.currentScreen === 'dashboard') await this.loadDashboard();
            });
        }

        // Workout credit macro weight sliders
        const _wcDefaults = { protein: 33, carbs: 33, fat: 34 };
        const _wcEls = {};
        for (const macro of ['protein', 'carbs', 'fat']) {
            const sl = document.getElementById(`workout-credit-${macro}-weight`);
            if (!sl) continue;
            const saved = parseFloat(await db.getSetting(`workout_credit_${macro}_weight`) || String(_wcDefaults[macro]));
            sl.value = saved;
            _wcEls[macro] = sl;
        }

        const _updateCreditSplit = async (save = true) => {
            const vals = {
                protein: parseFloat(_wcEls.protein?.value ?? _wcDefaults.protein),
                carbs:   parseFloat(_wcEls.carbs?.value   ?? _wcDefaults.carbs),
                fat:     parseFloat(_wcEls.fat?.value     ?? _wcDefaults.fat),
            };
            const total = vals.protein + vals.carbs + vals.fat;
            for (const [macro, val] of Object.entries(vals)) {
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                const pctEl = document.getElementById(`workout-credit-${macro}-weight-pct`);
                if (pctEl) pctEl.textContent = `${pct}%`;
                const barEl = document.getElementById(`workout-credit-${macro}-bar`);
                if (barEl) barEl.style.width = `${pct}%`;
            }
            if (save) {
                for (const [macro, val] of Object.entries(vals)) {
                    await db.setSetting(`workout_credit_${macro}_weight`, String(val));
                }
                if (this.currentScreen === 'dashboard') await this.loadDashboard();
            }
        };

        await _updateCreditSplit(false);

        for (const macro of ['protein', 'carbs', 'fat']) {
            if (!_wcEls[macro]) continue;
            _wcEls[macro].addEventListener('input', () => _updateCreditSplit(true));
        }

        // Body stats, activity factor & TDEE display
        const userSexSelect = document.getElementById('user-sex');
        const userAgeInput = document.getElementById('user-age');
        const userHeightInput = document.getElementById('user-height');
        const tdeeActivitySlider = document.getElementById('tdee-activity-factor');
        const tdeeActivityValueEl = document.getElementById('tdee-activity-value');
        const tdeeActivityLabelEl = document.getElementById('tdee-activity-label');
        const tdeeSummary = document.getElementById('tdee-summary');
        const tdeeBmrValueEl = document.getElementById('tdee-bmr-value');
        const tdeeTdeeValueEl = document.getElementById('tdee-value');
        const tdeeComputeHelper = document.getElementById('tdee-compute-helper');
        const goalTargetKcalInput = document.getElementById('goal-target-kcal');
        const btnComputeCarbs = document.getElementById('btn-compute-carbs');
        const computeCarbsError = document.getElementById('compute-carbs-error');

        const savedSex = await db.getSetting('user_sex') || 'male';
        const savedAge = await db.getSetting('user_age') || '';
        const savedHeight = await db.getSetting('user_height_in') || '';
        const savedActivityFactor = parseFloat(await db.getSetting('tdee_activity_factor') || 0) || 1.55;

        if (userSexSelect) userSexSelect.value = savedSex;
        if (userAgeInput) userAgeInput.value = savedAge;
        if (userHeightInput) userHeightInput.value = savedHeight;
        if (tdeeActivitySlider) {
            tdeeActivitySlider.value = savedActivityFactor;
            if (tdeeActivityValueEl) tdeeActivityValueEl.textContent = savedActivityFactor.toFixed(2);
            if (tdeeActivityLabelEl) tdeeActivityLabelEl.textContent = activityFactorLabel(savedActivityFactor);
        }

        const updateTDEE = async (updateTarget = false) => {
            const sex = userSexSelect ? userSexSelect.value : savedSex;
            const age = parseFloat(userAgeInput ? userAgeInput.value : savedAge);
            const heightIn = parseFloat(userHeightInput ? userHeightInput.value : savedHeight);
            // 7-day rolling average weight from measurements (same source as the chart)
            const allMeasurements = await db.getAllMeasurements();
            const weightReadings = allMeasurements
                .filter(m => m.type === 'weight')
                .sort((a, b) => b.timestamp - a.timestamp);
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const recentWeights = weightReadings.filter(m => m.timestamp >= sevenDaysAgo);
            const weightSample = recentWeights.length > 0 ? recentWeights : weightReadings.slice(0, 1);
            const weightLbs = weightSample.length > 0
                ? weightSample.reduce((s, m) => s + (m.unit === 'kg' ? m.value * 2.20462 : m.value), 0) / weightSample.length
                : 0;

            const factor = parseFloat(tdeeActivitySlider ? tdeeActivitySlider.value : savedActivityFactor);

            const canCompute = age > 0 && heightIn > 0 && weightLbs > 0;
            if (!canCompute) {
                if (tdeeSummary) tdeeSummary.style.display = 'none';
                if (tdeeComputeHelper) tdeeComputeHelper.style.display = 'none';
                return;
            }

            const weightKg = weightLbs * 0.453592;
            const heightCm = heightIn * 2.54;
            const bmr = sex === 'female'
                ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
                : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
            const tdee = Math.round(bmr * factor);

            if (tdeeSummary) tdeeSummary.style.display = 'block';
            if (tdeeBmrValueEl) tdeeBmrValueEl.textContent = `${Math.round(bmr)} kcal/day`;
            if (tdeeTdeeValueEl) tdeeTdeeValueEl.textContent = `${tdee} kcal/day`;

            if (tdeeComputeHelper) {
                tdeeComputeHelper.style.display = 'block';
                // Set target to TDEE on first show, or whenever the slider moves
                if (goalTargetKcalInput && (!goalTargetKcalInput.value || updateTarget)) {
                    goalTargetKcalInput.value = tdee;
                }
            }
        };

        const saveBodyStats = async () => {
            if (userSexSelect) await db.setSetting('user_sex', userSexSelect.value);
            if (userAgeInput && userAgeInput.value) await db.setSetting('user_age', userAgeInput.value);
            if (userHeightInput && userHeightInput.value) await db.setSetting('user_height_in', userHeightInput.value);
            await updateTDEE();
        };

        if (userSexSelect) userSexSelect.addEventListener('change', saveBodyStats);
        if (userAgeInput) userAgeInput.addEventListener('change', saveBodyStats);
        if (userHeightInput) userHeightInput.addEventListener('change', saveBodyStats);

        if (tdeeActivitySlider) {
            tdeeActivitySlider.addEventListener('input', async () => {
                const factor = parseFloat(tdeeActivitySlider.value);
                if (tdeeActivityValueEl) tdeeActivityValueEl.textContent = factor.toFixed(2);
                if (tdeeActivityLabelEl) tdeeActivityLabelEl.textContent = activityFactorLabel(factor);
                await db.setSetting('tdee_activity_factor', factor);
                await updateTDEE(true);
            });
        }

        if (btnComputeCarbs && goalTargetKcalInput) {
            btnComputeCarbs.addEventListener('click', () => {
                const targetKcal = parseFloat(goalTargetKcalInput.value);
                const protein = parseFloat(proteinInput ? proteinInput.value : 0) || 0;
                const fat = parseFloat(fatInput ? fatInput.value : 0) || 0;
                if (!targetKcal) return;
                const carbs = Math.round((targetKcal - (protein * 4) - (fat * 9)) / 4);
                if (computeCarbsError) computeCarbsError.style.display = 'none';
                if (carbs < 0) {
                    if (computeCarbsError) {
                        computeCarbsError.textContent = 'Protein + fat exceed target — lower protein/fat or raise the target.';
                        computeCarbsError.style.display = 'block';
                    }
                    return;
                }
                if (carbsInput) {
                    carbsInput.value = carbs;
                    carbsInput.dispatchEvent(new Event('input'));  // update calorie display
                    carbsInput.dispatchEvent(new Event('change')); // trigger autoSaveGoals
                }
            });
        }

        await updateTDEE();

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
                ui.showLoading('Exporting data…');
                try {
                    const data = await db.exportAllData();
                    const dataStr = JSON.stringify(data, null, 2);
                    const date = new Date().toISOString().slice(0, 10);

                    // Compress with gzip if available (modern WebViews and browsers support this)
                    let exportBuffer, filename;
                    if (typeof CompressionStream !== 'undefined') {
                        const cs = new CompressionStream('gzip');
                        const writer = cs.writable.getWriter();
                        writer.write(new TextEncoder().encode(dataStr));
                        writer.close();
                        exportBuffer = await new Response(cs.readable).arrayBuffer();
                        filename = `fitness-pizza-export-${date}.json.gz`;
                    } else {
                        exportBuffer = new TextEncoder().encode(dataStr).buffer;
                        filename = `fitness-pizza-export-${date}.json`;
                    }

                    if (window.Capacitor?.isNativePlatform?.()) {
                        const FS = window.Capacitor.Plugins.Filesystem;
                        const SharePlugin = window.Capacitor.Plugins.Share;

                        // Convert ArrayBuffer → base64 in chunks to avoid stack overflow
                        const bytes = new Uint8Array(exportBuffer);
                        let binary = '';
                        for (let i = 0; i < bytes.length; i += 8192) {
                            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                        }
                        const base64 = btoa(binary);

                        // Write to cache dir so Share plugin can hand it to the OS
                        await FS.writeFile({ path: filename, data: base64, directory: 'CACHE' });
                        const { uri } = await FS.getUri({ path: filename, directory: 'CACHE' });

                        ui.hideLoading();
                        await SharePlugin.share({
                            title: filename,
                            files: [uri],
                            dialogTitle: 'Save or share your Fitness Pizza backup',
                        });
                    } else {
                        // Browser: trigger download
                        const blob = new Blob([exportBuffer], { type: filename.endsWith('.gz') ? 'application/gzip' : 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        ui.hideLoading();
                        ui.showToast(`✓ Exported ${filename}`);
                    }
                } catch (error) {
                    ui.hideLoading();
                    if (error.name !== 'AbortError') {
                        console.error('Export error:', error);
                        ui.showError('Failed to export data: ' + error.message);
                    }
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

                ui.showLoading('Reading file…');
                try {
                    const text = await file.text();
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        ui.hideLoading();
                        ui.showError('Invalid JSON file: ' + e.message);
                        importFile.value = '';
                        return;
                    }

                    // Validate: must be a plain object (not array/null)
                    if (!data || typeof data !== 'object' || Array.isArray(data)) {
                        ui.showError('Import file must be a JSON object, not an array or null.');
                        importFile.value = '';
                        return;
                    }

                    const knownStores = ['macros', 'measurements', 'workouts', 'named_foods', 'settings', 'exercise_library', 'workout_templates'];
                    const errors = [];
                    const validEntries = { macros: [], measurements: [], workouts: [], named_foods: [], settings: [], exercise_library: [], workout_templates: [] };

                    // Validate each known store
                    for (const store of knownStores) {
                        if (data[store] === undefined) continue;
                        if (!Array.isArray(data[store])) {
                            errors.push(`"${store}" must be an array`);
                            continue;
                        }
                        for (let i = 0; i < data[store].length; i++) {
                            const entry = data[store][i];
                            let entryErrors = [];
                            if (store === 'macros') {
                                if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date))
                                    entryErrors.push('missing or invalid date');
                                if (typeof entry.protein !== 'number' || isNaN(entry.protein))
                                    entryErrors.push('protein must be a number');
                                if (typeof entry.carbs !== 'number' || isNaN(entry.carbs))
                                    entryErrors.push('carbs must be a number');
                                if (typeof entry.fat !== 'number' || isNaN(entry.fat))
                                    entryErrors.push('fat must be a number');
                            } else if (store === 'measurements') {
                                if (!['weight', 'waist', 'body_fat'].includes(entry.type))
                                    entryErrors.push('type must be "weight", "waist", or "body_fat"');
                                if (typeof entry.value !== 'number' || isNaN(entry.value))
                                    entryErrors.push('value must be a number');
                            } else if (store === 'workouts') {
                                if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date))
                                    entryErrors.push('missing or invalid date');
                                if (!entry.exercise_name)
                                    entryErrors.push('exercise_name is required');
                            }
                            if (entryErrors.length > 0) {
                                errors.push(`${store}[${i}]: ${entryErrors.join(', ')}`);
                            } else {
                                validEntries[store].push(entry);
                            }
                        }
                    }

                    const totalValid = Object.values(validEntries).reduce((s, arr) => s + arr.length, 0);
                    const totalAll = knownStores.reduce((s, k) => s + (Array.isArray(data[k]) ? data[k].length : 0), 0);

                    ui.hideLoading();

                    if (errors.length > 0) {
                        // Show modal with errors and offer to import valid entries only
                        const errorList = errors.slice(0, 20).map(e => `<li style="font-size:0.85em;">${e}</li>`).join('');
                        const moreNote = errors.length > 20 ? `<p style="font-size:0.85em;color:var(--text-secondary);">...and ${errors.length - 20} more issues</p>` : '';
                        ui.createModal('Import Validation Errors', `
                            <p style="margin-bottom:8px;">${errors.length} validation issue(s) found. ${totalValid} of ${totalAll} entries are valid.</p>
                            <ul style="max-height:200px;overflow-y:auto;margin:0 0 8px;padding-left:20px;">${errorList}</ul>
                            ${moreNote}
                            <p>Import ${totalValid} valid entries and skip ${totalAll - totalValid} invalid ones?</p>
                        `, [
                            {
                                text: 'Cancel',
                                className: 'btn-secondary'
                            },
                            {
                                text: `Import ${totalValid} Valid Entries`,
                                className: 'btn-primary',
                                onClick: async () => {
                                    try {
                                        ui.showLoading('Importing…');
                                        await db.importData(validEntries);
                                        ui.hideLoading();
                                        importFile.value = '';
                                        ui.createModal('Import Successful', `
                                            <div style="text-align:center;padding:var(--spacing-md);">
                                                <p style="font-size:1.2em;margin-bottom:var(--spacing-sm);">✓ Import complete</p>
                                                <p>Imported ${totalValid} entries (${totalAll - totalValid} skipped due to validation errors)</p>
                                            </div>
                                        `, [{ text: 'OK', className: 'btn-primary' }]);
                                        await this.loadScreen(this.currentScreen);
                                    } catch (err) {
                                        ui.hideLoading();
                                        console.error('Import error:', err);
                                        ui.showError('Failed to import data: ' + err.message);
                                    }
                                }
                            }
                        ]);
                        importFile.value = '';
                        return;
                    }

                    // No errors — import everything
                    ui.showLoading('Importing…');
                    await db.importData(data);
                    ui.hideLoading();
                    importFile.value = '';
                    ui.createModal('Import Successful', `
                        <div style="text-align: center; padding: var(--spacing-md);">
                            <p style="font-size: 1.2em; margin-bottom: var(--spacing-sm);">✓ Data imported successfully!</p>
                            <p>Imported ${totalAll} total items</p>
                        </div>
                    `, [{ text: 'OK', className: 'btn-primary' }]);
                    await this.loadScreen(this.currentScreen);
                } catch (error) {
                    ui.hideLoading();
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
                // Use T12:00:00 (local noon) so getDate()/setDate() always operate
                // on the correct local calendar day regardless of UTC offset
                const date = new Date(this.currentDate + 'T12:00:00');
                date.setDate(date.getDate() - 1);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                await this.setDate(`${y}-${m}-${d}`);
            });
        }

        // Next day button
        if (btnNextDay) {
            btnNextDay.addEventListener('click', async () => {
                // Use T12:00:00 (local noon) so getDate()/setDate() always operate
                // on the correct local calendar day regardless of UTC offset
                const date = new Date(this.currentDate + 'T12:00:00');
                date.setDate(date.getDate() + 1);
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                await this.setDate(`${y}-${m}-${d}`);
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
        // Use T12:00:00 (local noon) to ensure toLocaleDateString shows the
        // correct local calendar day in all UTC offsets
        const today = getTodayDate();
        const screenTitle = document.getElementById('screen-title');
        if (screenTitle && date !== today) {
            const dateObj = new Date(date + 'T12:00:00');
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
            const oneDay = 24 * 60 * 60 * 1000;

            if (!lastBackup) {
                // First visit — start the clock but don't download empty data.
                localStorage.setItem('last_auto_backup', now.toString());
                return;
            }

            if ((now - parseInt(lastBackup)) > oneDay) {
                console.log('Performing daily auto-backup...');
                await this.performAutoBackup();
                localStorage.setItem('last_auto_backup', now.toString());
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
