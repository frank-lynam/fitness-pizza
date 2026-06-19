/**
 * Fitness Tracker PWA - Macro Entry Form Component
 * Handles manual macro entry with fiber support and auto-calculated calories
 */

import { db } from '../db.js';
import { calculateMacroCalories } from '../utils/calorie-calc.js';
import { validateMacros, showFieldError, clearFieldError, clearFormErrors } from '../utils/validation.js';
import * as ui from '../ui.js';
import { formatDateTime, getTodayDate } from '../utils/date-utils.js';
import { MACRO_INTENSITY_LOW_G, MACRO_INTENSITY_HIGH_G } from '../constants.js';

// One-shot timeout (fires at next midnight) for date-change detection
let _cheatDayTimeoutId = null;

// Cached effective daily goals (set by app.js before calling loadTodaysMacros)
let _dailyGoals = null;

/**
 * Inject effective goals (including PI controller adjustments) from the caller.
 * Called by app.js loadMacros() so the progress summary reflects the same goals
 * shown on the dashboard.
 */
export function setDailyGoals(goals) {
    _dailyGoals = goals;
}

/**
 * Initialize the macro form component
 */
export function initMacroForm() {
    const btnAddMacro = document.getElementById('btn-add-macro');
    const btnSnapMeal = document.getElementById('btn-snap-meal');
    const btnScanLabel = document.getElementById('btn-scan-label');
    const btnTextAIMacro = document.getElementById('btn-text-ai-macro');
    const reverseDietToggle = document.getElementById('cheat-day-toggle');
    const formContainer = document.getElementById('macro-form-container');

    if (btnAddMacro) {
        btnAddMacro.addEventListener('click', () => {
            showMacroForm();
        });
    }

    if (btnSnapMeal) {
        btnSnapMeal.addEventListener('click', async () => {
            const { snapMealAndDescribe } = await import('./photo-upload.js');
            snapMealAndDescribe();
        });
    }

    if (btnScanLabel) {
        btnScanLabel.addEventListener('click', async () => {
            const { scanLabelDirect } = await import('./photo-upload.js');
            scanLabelDirect();
        });
    }

    if (btnTextAIMacro) {
        btnTextAIMacro.addEventListener('click', () => {
            showTextAIModal();
        });
    }

    // Load and setup reverse diet toggle for current day
    if (reverseDietToggle) {
        setupCheatDayToggle(reverseDietToggle);
    }

    // Reschedule date check if app was backgrounded past midnight
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible' || !window.fitnessApp) return;
        const toggle = document.getElementById('cheat-day-toggle');
        if (!toggle) return;
        const newDate = window.fitnessApp.getCurrentDate();
        const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');
        toggle.checked = cheatDayDates[newDate] === true;
        updateCheatDayLabel(toggle, newDate);
        scheduleCheatDayAtMidnight();
    });
}

/**
 * Setup cheat day toggle for current day
 */
async function setupCheatDayToggle(toggle) {
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();

    // Load current state from settings (stored per date)
    const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');
    toggle.checked = cheatDayDates[currentDate] === true;
    updateCheatDayLabel(toggle, currentDate);

    toggle.addEventListener('change', async () => {
        // Update state for this date
        const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');
        if (toggle.checked) {
            cheatDayDates[currentDate] = true;
        } else {
            delete cheatDayDates[currentDate];
        }
        await db.setSetting('cheat_day_dates', JSON.stringify(cheatDayDates));

        // Reload dashboard if visible to update targets
        if (window.fitnessApp && window.fitnessApp.currentScreen === 'dashboard') {
            await window.fitnessApp.loadDashboard();
        }
    });

    // Schedule a one-shot timeout to fire at next midnight so we update when the date rolls over
    if (window.fitnessApp) {
        scheduleCheatDayAtMidnight();
    }
}

function scheduleCheatDayAtMidnight() {
    clearTimeout(_cheatDayTimeoutId);
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    _cheatDayTimeoutId = setTimeout(async () => {
        _cheatDayTimeoutId = null;
        const toggle = document.getElementById('cheat-day-toggle');
        if (toggle && window.fitnessApp) {
            const newDate = window.fitnessApp.getCurrentDate();
            const cheatDayDates = JSON.parse(await db.getSetting('cheat_day_dates') || '{}');
            toggle.checked = cheatDayDates[newDate] === true;
            updateCheatDayLabel(toggle, newDate);
        }
        scheduleCheatDayAtMidnight();
    }, tomorrow - now);
}

function updateCheatDayLabel(toggle, date) {
    const span = toggle ? toggle.nextElementSibling : null;
    if (!span) return;
    const today = getTodayDate();
    const dateLabel = date === today
        ? 'Today'
        : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    span.textContent = `🎉 Cheat Day (${dateLabel})`;
}

/**
 * Show the macro entry form
 * @param {Object} existingEntry - Existing entry to edit (optional)
 */
export async function showMacroForm(existingEntry = null) {
    const formContainer = document.getElementById('macro-form-container');
    if (!formContainer) return;

    const isEdit = existingEntry !== null && existingEntry.id != null;
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();

    const entry = existingEntry || {
        protein: '', carbs: '', fat: '', fiber: '', calories: '',
        meal_name: '', serving_label: '', date: currentDate
    };

    // Initial calories display: for calorie-only entries show their stored calories, otherwise blank (auto-fills from macros)
    const initCalDisplay = entry.entry_mode === 'calories' && entry.calories
        ? Math.round(entry.calories) : '';

    formContainer.innerHTML = `
        <div class="macro-form-card">
            <form id="macro-entry-form">
                <div class="form-actions" style="margin-bottom: 8px;">
                    <button type="submit" class="btn-primary">${isEdit ? 'Update' : 'Save'} Entry</button>
                    <button type="button" id="btn-cancel-macro" class="btn-secondary">Cancel</button>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="meal-eaten" ${entry.status === 'completed' ? 'checked' : ''}>
                        <span>Mark as eaten</span>
                    </label>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="add-to-library" ${entry._addToLibrary ? 'checked' : ''}>
                        <span>Add to food library</span>
                    </label>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="is-batch-recipe" ${entry.is_batch ? 'checked' : ''}>
                        <span>This is a batch recipe (I made multiple servings)</span>
                    </label>
                </div>

                <div id="batch-fields" style="display: ${entry.is_batch ? 'block' : 'none'}; margin-bottom: 8px; padding: 8px; background: var(--bg-secondary); border-radius: var(--radius-md);">
                    <div class="form-group-inline" style="margin-bottom: 4px;">
                        <label for="batch-servings">Batch makes:</label>
                        <input type="number" id="batch-servings" step="1" min="1" value="${entry.batch_servings || 1}">
                        <span>servings</span>
                    </div>
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="servings-eaten">I ate:</label>
                        <input type="number" id="servings-eaten" step="0.1" min="0.1" value="${entry.servings_eaten || 1}">
                        <span>servings</span>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <input type="text" id="meal-name" placeholder="Meal Name"
                           value="${entry.meal_name || ''}">
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <input type="text" id="serving-label" placeholder="Serving (e.g. 1 cup, 200g, 1 apple)"
                           value="${entry.serving_label || ''}">
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="per-100g" ${entry._per100gMode ? 'checked' : ''}>
                        <span>Enter macros by grams</span>
                    </label>
                </div>

                <div id="per-100g-weight" style="display:${entry._per100gMode ? 'block' : 'none'}; margin-bottom: 4px;">
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="weight-grams" style="min-width: 60px;">Grams</label>
                        <input type="number" id="weight-grams" step="1" min="1" placeholder="100" value="${entry._weightGrams || ''}">
                    </div>
                </div>

                <div class="macros-grid" style="gap: 4px; margin-bottom: 4px;">
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="fat" style="min-width: 60px;">Fat (g)</label>
                        <input type="number" id="fat" step="0.001" min="0" value="${entry.fat}">
                    </div>
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="carbs" style="min-width: 60px;">Carbs (g)</label>
                        <input type="number" id="carbs" step="0.001" min="0" value="${entry.carbs}">
                    </div>
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="protein" style="min-width: 60px;">Protein (g)</label>
                        <input type="number" id="protein" step="0.001" min="0" value="${entry.protein}">
                    </div>
                </div>

                <div class="form-group-inline" style="margin-bottom: 0;">
                    <label for="calories-field" style="min-width: 60px;">Calories</label>
                    <input type="number" id="calories-field" step="1" min="0" placeholder="auto"
                           value="${initCalDisplay}">
                </div>
                <small id="cal-per-gram-note" style="color:var(--text-secondary);font-size:0.8em;display:none;margin-left:8px;"></small>
            </form>
        </div>
    `;

    formContainer.classList.remove('hidden');
    setupMacroFormListeners(isEdit, existingEntry);
    updateCalculatedCalories();
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Hide the macro entry form
 */
export function hideMacroForm() {
    const formContainer = document.getElementById('macro-form-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
    }
}

/**
 * Set up form event listeners
 * @param {boolean} isEdit - Whether this is an edit operation
 * @param {Object} existingEntry - Existing entry being edited
 */
function setupMacroFormListeners(isEdit, existingEntry) {
    const form = document.getElementById('macro-entry-form');
    const cancelBtn = document.getElementById('btn-cancel-macro');
    const batchCheckbox = document.getElementById('is-batch-recipe');
    const batchFields = document.getElementById('batch-fields');
    const proteinInput = document.getElementById('protein');
    const carbsInput = document.getElementById('carbs');
    const fatInput = document.getElementById('fat');
    const caloriesField = document.getElementById('calories-field');
    const per100gCheckbox = document.getElementById('per-100g');
    const per100gWeightSection = document.getElementById('per-100g-weight');
    const weightInput = document.getElementById('weight-grams');

    // When macros or weight change, auto-populate calories field
    [proteinInput, carbsInput, fatInput, weightInput].forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                if (input !== weightInput) clearFieldError(input);
                updateCalculatedCalories();
            });
        }
    });

    // Per-100g toggle
    if (per100gCheckbox && per100gWeightSection) {
        per100gCheckbox.addEventListener('change', () => {
            per100gWeightSection.style.display = per100gCheckbox.checked ? 'block' : 'none';
            updateCalculatedCalories();
        });
    }

    // Batch recipe checkbox
    if (batchCheckbox && batchFields) {
        batchCheckbox.addEventListener('change', () => {
            batchFields.style.display = batchCheckbox.checked ? 'block' : 'none';
            updateCalculatedCalories();
        });
    }

    const batchServingsInput = document.getElementById('batch-servings');
    const servingsEatenInput = document.getElementById('servings-eaten');
    if (batchServingsInput) batchServingsInput.addEventListener('input', updateCalculatedCalories);
    if (servingsEatenInput) servingsEatenInput.addEventListener('input', updateCalculatedCalories);

    // Mark calories field as manually set when the user edits it directly
    if (caloriesField) {
        caloriesField.addEventListener('input', () => {
            caloriesField.dataset.manuallySet = '1';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideMacroForm();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleMacroFormSubmit(isEdit, existingEntry);
        });
    }
}

/**
 * Update the calculated calories display
 */
function updateCalculatedCalories() {
    let protein = parseFloat(document.getElementById('protein')?.value || 0);
    let carbs   = parseFloat(document.getElementById('carbs')?.value   || 0);
    let fat     = parseFloat(document.getElementById('fat')?.value     || 0);

    // per-gram mode: macros are entered for the reference gram amount — no scaling needed.
    const isPer100g = document.getElementById('per-100g')?.checked || false;
    const refG = isPer100g
        ? (parseFloat(document.getElementById('weight-grams')?.value) || 100)
        : null;

    const isBatch = document.getElementById('is-batch-recipe')?.checked || false;
    const batchServings = parseFloat(document.getElementById('batch-servings')?.value || 1);
    const servingsEaten = parseFloat(document.getElementById('servings-eaten')?.value || 1);
    if (isBatch && batchServings > 0) {
        protein = (protein / batchServings) * servingsEaten;
        carbs   = (carbs   / batchServings) * servingsEaten;
        fat     = (fat     / batchServings) * servingsEaten;
    }

    const calories = calculateMacroCalories(protein, carbs, fat, 0);

    const caloriesField = document.getElementById('calories-field');
    if (caloriesField && !caloriesField.dataset.manuallySet) {
        const hasMacros = (protein + carbs + fat) > 0;
        caloriesField.value = hasMacros ? Math.round(calories) : '';
    }

    const note = document.getElementById('cal-per-gram-note');
    if (note) {
        if (isPer100g && refG && refG !== 100 && (protein + carbs + fat) > 0) {
            const per100 = Math.round(calculateMacroCalories(
                protein * (100 / refG), carbs * (100 / refG), fat * (100 / refG), 0));
            note.textContent = `for ${refG}g  (${per100} per 100g)`;
            note.style.display = 'inline';
        } else {
            note.style.display = 'none';
        }
    }
}

/**
 * Handle form submission
 * @param {boolean} isEdit - Whether this is an edit operation
 * @param {Object} existingEntry - Existing entry being edited
 */
async function handleMacroFormSubmit(isEdit, existingEntry) {
    try {
        const form = document.getElementById('macro-entry-form');
        clearFormErrors(form);

        const mealName = document.getElementById('meal-name').value.trim();
        const servingLabel = document.getElementById('serving-label')?.value.trim() || '';
        const isEaten = document.getElementById('meal-eaten')?.checked || false;
        const addToLibrary = document.getElementById('add-to-library')?.checked || false;
        const isPer100g = document.getElementById('per-100g')?.checked || false;

        let protein = parseFloat(document.getElementById('protein')?.value || 0);
        let carbs   = parseFloat(document.getElementById('carbs')?.value   || 0);
        let fat     = parseFloat(document.getElementById('fat')?.value     || 0);

        // per-gram mode: macros are entered for the reference gram amount — save as-is.
        const refG = isPer100g
            ? (parseFloat(document.getElementById('weight-grams')?.value) || 100)
            : null;

        const isBatch = document.getElementById('is-batch-recipe')?.checked || false;
        const batchServings = parseFloat(document.getElementById('batch-servings')?.value || 1);
        const servingsEaten = parseFloat(document.getElementById('servings-eaten')?.value || 1);

        if (isBatch && batchServings > 0) {
            protein = (protein / batchServings) * servingsEaten;
            carbs   = (carbs   / batchServings) * servingsEaten;
            fat     = (fat     / batchServings) * servingsEaten;
        }

        // Per-100g mode: macros were entered for refG grams — normalize the day-plan
        // entry to 100g so it matches what the library stores.
        if (isPer100g && refG && refG !== 100) {
            const scale = 100 / refG;
            protein *= scale;
            carbs   *= scale;
            fat     *= scale;
        }

        // Determine mode: if all macros are zero AND user entered calories → calorie-only
        const caloriesField = document.getElementById('calories-field');
        const caloriesFieldVal = parseFloat(caloriesField?.value || 0);
        const hasMacros = (protein + carbs + fat) > 0;
        const isCalMode = !hasMacros && caloriesFieldVal > 0;

        let calories;
        if (isCalMode) {
            calories = caloriesFieldVal;
        } else {
            if (!hasMacros) {
                ui.showError('Please enter macros or a calorie amount');
                return;
            }
            calories = calculateMacroCalories(protein, carbs, fat, 0);
        }

        // Prepare entry data
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const entryData = {
            protein: isCalMode ? 0 : protein,
            carbs:   isCalMode ? 0 : carbs,
            fat:     isCalMode ? 0 : fat,
            fiber:   0,
            calories,
            entry_mode: isCalMode ? 'calories' : 'macros',
            meal_name: mealName,
            serving_label: servingLabel,
            servings: 1,
            date: currentDate,
            status: isEaten ? 'completed' : 'planned'
        };

        // Save to database
        ui.showLoading(isEdit ? 'Updating entry...' : 'Saving entry...');

        if (isEdit && existingEntry) {
            entryData.id = existingEntry.id;
            if (existingEntry.servings) entryData.servings = existingEntry.servings;
            if (existingEntry.food_id) entryData.food_id = existingEntry.food_id;
            await db.updateMacroEntry(entryData);
        } else {
            const entryId = await db.addMacroEntry(entryData);

            // Add to food library if requested
            if (mealName && addToLibrary && !isCalMode) {
                const existingFoods = await db.getAllNamedFoods();
                const existingFood = existingFoods.find(f =>
                    f.name.toLowerCase() === mealName.toLowerCase()
                );

                let foodId;
                if (!existingFood) {
                    if (isPer100g) {
                        // Macros were entered for refG grams; normalize to per-100g for library storage
                        const rawProtein = parseFloat(document.getElementById('protein')?.value || 0);
                        const rawCarbs   = parseFloat(document.getElementById('carbs')?.value   || 0);
                        const rawFat     = parseFloat(document.getElementById('fat')?.value     || 0);
                        const normScale  = 100 / (refG || 100);
                        const libProtein = rawProtein * normScale;
                        const libCarbs   = rawCarbs   * normScale;
                        const libFat     = rawFat     * normScale;
                        foodId = await db.addNamedFood({
                            name: mealName,
                            format_type: 'per_gram',
                            protein: libProtein,
                            carbs:   libCarbs,
                            fat:     libFat,
                            fiber: 0,
                            calories: calculateMacroCalories(libProtein, libCarbs, libFat, 0)
                        });
                    } else {
                        foodId = await db.addNamedFood({
                            name: mealName,
                            format_type: 'per_serving',
                            protein,
                            carbs,
                            fat,
                            fiber: 0,
                            calories,
                            serving_size: servingLabel || '1 serving',
                        });
                    }
                } else {
                    foodId = existingFood.id;
                }

                // Backfill food_id on the entry so starring stays in sync
                if (foodId) {
                    const saved = await db.get('macros', entryId);
                    if (saved) { saved.food_id = foodId; await db.updateMacroEntry(saved); }
                }
            }
        }

        ui.hideLoading();

        // Hide form
        hideMacroForm();

        // Reload macro list
        await loadTodaysMacros();

    } catch (error) {
        console.error('Error saving macro entry:', error);
        ui.hideLoading();
        ui.showError('Failed to save entry: ' + error.message);
    }
}

/**
 * Render the mini macro progress summary bar above the entry list.
 * Shows Fat / Carbs / Protein / Calories progress vs today's effective goals.
 * Completed entries shown solid; planned entries shown as a lighter overlay.
 */
async function renderProgressSummary(macros) {
    const el = document.getElementById('macro-progress-summary');
    if (!el) return;

    // Use injected goals (PI-adjusted) or fall back to base settings
    let goals = _dailyGoals;
    if (!goals) {
        const fat      = parseFloat(await db.getSetting('goal_fat')     || 70);
        const protein  = parseFloat(await db.getSetting('goal_protein') || 150);
        const carbs    = parseFloat(await db.getSetting('goal_carbs')   || 200);
        goals = { fat, protein, carbs, calories: fat * 9 + protein * 4 + carbs * 4 };
    }

    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
    const isCheatDay = (JSON.parse(await db.getSetting('cheat_day_dates') || '{}'))[currentDate] === true;

    const completed = macros.filter(m => m.status === 'completed');
    const planned   = macros.filter(m => m.status === 'planned');

    const done = {
        fat:      completed.reduce((s, m) => s + (parseFloat(m.fat)      || 0), 0),
        carbs:    completed.reduce((s, m) => s + (parseFloat(m.carbs)    || 0), 0),
        protein:  completed.reduce((s, m) => s + (parseFloat(m.protein)  || 0), 0),
        calories: completed.reduce((s, m) => s + (parseFloat(m.calories) || 0), 0),
    };
    const pln = {
        fat:      planned.reduce((s, m) => s + (parseFloat(m.fat)      || 0), 0),
        carbs:    planned.reduce((s, m) => s + (parseFloat(m.carbs)    || 0), 0),
        protein:  planned.reduce((s, m) => s + (parseFloat(m.protein)  || 0), 0),
        calories: planned.reduce((s, m) => s + (parseFloat(m.calories) || 0), 0),
    };

    const rows = [
        { label: 'Fat',  key: 'fat',     woKey: 'plannedWorkoutCreditFat_g',     dec: 1, color: 'var(--accent-warning)' },
        { label: 'Carb', key: 'carbs',   woKey: 'plannedWorkoutCreditCarbs_g',   dec: 1, color: 'var(--accent-success)' },
        { label: 'Prot', key: 'protein', woKey: 'plannedWorkoutCreditProtein_g', dec: 1, color: 'var(--accent-primary)' },
    ];

    const barsHtml = rows.map(({ label, key, woKey, dec, color }) => {
        const g     = (goals[key] || 1) + (goals[woKey] || 0);
        const d     = done[key];
        const p     = pln[key];
        const total = d + p;

        // Cheat day: always show full bar, no red, label shows "Cheat Day"
        if (isCheatDay) {
            return `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;min-width:30px;color:var(--text-secondary);">${label}</span>
                <div style="flex:1;height:12px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;position:relative;">
                    <div style="width:100%;height:100%;position:absolute;left:0;top:0;background:${color};border-radius:4px;"></div>
                </div>
                <span style="font-size:11px;min-width:56px;text-align:right;white-space:nowrap;color:var(--text-secondary);">Cheat Day</span>
            </div>`;
        }

        const over  = total > g;
        const hasPlan = p > 0.05;

        // Bar fills: red when over (full width), otherwise normal color
        const fillColor = over ? 'var(--accent-danger)' : color;
        const doneW = over ? 100 : Math.min(100, (d / g) * 100);
        const planW = over ? 0   : Math.min(100 - doneW, (p / g) * 100);

        // Right label: net delta vs goal (+over / -under)
        const net = total - g;
        const labelText = (net >= 0 ? '+' : '') + net.toFixed(dec) + 'g';
        const labelColor = over ? 'var(--accent-danger)' : 'var(--text-secondary)';

        return `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;min-width:30px;color:var(--text-secondary);">${label}</span>
                <div style="flex:1;height:12px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;position:relative;">
                    <div style="width:${doneW}%;height:100%;position:absolute;left:0;top:0;background:${fillColor};border-radius:4px;transition:width 0.3s,background 0.3s;"></div>
                    ${hasPlan && !over ? `<div style="width:${planW}%;height:100%;position:absolute;left:${doneW}%;top:0;background:${fillColor};opacity:0.35;border-radius:4px;transition:width 0.3s;"></div>` : ''}
                </div>
                <span style="font-size:11px;min-width:56px;text-align:right;white-space:nowrap;color:${labelColor};">${labelText}</span>
            </div>`;
    }).join('');

    el.innerHTML = `<div style="padding:6px 10px;background:var(--bg-secondary);border-radius:var(--radius-md);display:flex;flex-direction:column;gap:2px;">${barsHtml}</div>`;
}

/**
 * For each planned macro entry, compute a danger highlight intensity [0, 1]
 * based on how much it contributes to resolving a macro overage.
 *   intensity = 1 → this item alone covers the full overage (removing 1 serving fixes it)
 *   intensity = 0 → removing this item entirely has no effect on the overage
 */
function computePlanIntensities(macros, goals) {
    if (!goals) return {};

    const total = { fat: 0, protein: 0, carbs: 0 };
    for (const m of macros) {
        total.fat     += parseFloat(m.fat)     || 0;
        total.protein += parseFloat(m.protein) || 0;
        total.carbs   += parseFloat(m.carbs)   || 0;
    }

    const ov = {
        fat:     Math.max(0, total.fat     - (goals.fat     + (goals.plannedWorkoutCreditFat_g     || 0))),
        protein: Math.max(0, total.protein - (goals.protein + (goals.plannedWorkoutCreditProtein_g || 0))),
        carbs:   Math.max(0, total.carbs   - (goals.carbs   + (goals.plannedWorkoutCreditCarbs_g   || 0))),
    };

    if (ov.fat === 0 && ov.protein === 0 && ov.carbs === 0) return {};

    // Scale factor: 0 when overage ≤ low threshold, ramps linearly to 1 at high threshold
    const scale = (x) => Math.min(1, Math.max(0, (x - MACRO_INTENSITY_LOW_G) / (MACRO_INTENSITY_HIGH_G - MACRO_INTENSITY_LOW_G)));
    const fs = scale(ov.fat);
    const ps = scale(ov.protein);
    const cs = scale(ov.carbs);

    const result = {};
    for (const m of macros) {
        if (m.status !== 'planned') continue;
        const fi = ov.fat     > 0 ? Math.min(1, (parseFloat(m.fat)     || 0) / ov.fat)     * fs : 0;
        const pi = ov.protein > 0 ? Math.min(1, (parseFloat(m.protein) || 0) / ov.protein) * ps : 0;
        const ci = ov.carbs   > 0 ? Math.min(1, (parseFloat(m.carbs)   || 0) / ov.carbs)   * cs : 0;
        result[m.id] = Math.max(fi, pi, ci);
    }
    return result;
}

/**
 * Load and display today's macro entries
 */
export async function loadTodaysMacros() {
    try {
        const today = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const macros = await db.getMacrosByDate(today);
        const starred = await db.getStarredMacros();

        const macroEntries = document.getElementById('macro-entries');
        if (!macroEntries) return;

        let html = '';

        // Show today's entries

        if (macros.length === 0) {
            html += '<p class="text-muted">Add your first meal!</p>';
        } else {
            // Sort by timestamp (most recent first)
            macros.sort((a, b) => b.timestamp - a.timestamp);

            // Pre-fetch named foods for library-linked entries so we can show serving badges
            const foodIds = [...new Set(macros.filter(m => m.food_id).map(m => m.food_id))];
            const namedFoodsMap = {};
            await Promise.all(foodIds.map(async fid => {
                try {
                    const food = await db.getNamedFood(fid);
                    if (food) namedFoodsMap[fid] = food;
                } catch (e) {
                    // Silently skip if a single food lookup fails — badge simply won't show
                }
            }));
            const servingBadge = (macro) => {
                const food = macro.food_id ? namedFoodsMap[macro.food_id] : null;
                if (!food) return '';
                let label;
                switch (food.format_type) {
                    case 'per_gram':    label = 'per 100g'; break;
                    case 'per_serving': label = food.serving_size || 'serving'; break;
                    case 'per_batch':   label = `${food.batch_servings} servings/batch`; break;
                    default: return '';
                }
                return `<span class="food-format-badge">${label}</span>`;
            };

            // For library-linked entries, starred status follows the food's flag
            const entryStarred = (macro) => macro.food_id
                ? (namedFoodsMap[macro.food_id]?.starred || false)
                : (macro.starred || false);

            const planIntensities = computePlanIntensities(macros, _dailyGoals);
            html += macros.map(macro => {
                const starred = entryStarred(macro);
                let itemStyle = '';
                if (macro.status === 'planned') {
                    const intensity = planIntensities[macro.id] || 0;
                    if (intensity > 0.02) {
                        const pct = Math.round(intensity * 50);
                        itemStyle = `background:color-mix(in srgb,var(--accent-danger) ${pct}%,var(--bg-card));opacity:1;`;
                    }
                }
                return `
                <div class="entry-item ${macro.status === 'planned' ? 'planned' : ''}" data-id="${macro.id}"${itemStyle ? ` style="${itemStyle}"` : ''}>
                    <div class="entry-item-header">
                        <label class="checkbox-inline">
                            <input type="checkbox" class="entry-checkbox" data-id="${macro.id}"
                                   ${macro.status === 'completed' ? 'checked' : ''}>
                            <span class="entry-item-title">
                                ${starred ? '⭐ ' : ''}${macro.meal_name || 'Meal'} ${servingBadge(macro)}
                            </span>
                        </label>
                        <div class="entry-item-actions">
                            <button class="btn-star-macro ${starred ? 'starred' : ''}" data-id="${macro.id}" title="${starred ? 'Unstar' : 'Star'}">
                                ${starred ? '⭐' : '☆'}
                            </button>
                            <button class="btn-edit-macro btn-secondary btn-small" data-id="${macro.id}">Edit</button>
                            <button class="btn-delete-macro btn-danger btn-small" data-id="${macro.id}">×</button>
                        </div>
                    </div>
                    <div class="entry-item-content">
                        ${macro.serving_label ? `<div style="font-size:0.82em;color:var(--text-secondary);margin-bottom:2px;">${macro.serving_label}</div>` : ''}
                        <div class="entry-macros">
                            ${macro.entry_mode === 'calories'
                                ? `${macro.calories.toFixed(0)} cal`
                                : `F: ${macro.fat.toFixed(1)}g | C: ${macro.carbs.toFixed(1)}g | P: ${macro.protein.toFixed(1)}g | ${macro.calories.toFixed(0)} cal`}
                            <span class="servings-stepper">
                                <button class="servings-btn-minus" data-id="${macro.id}">−</button>
                                <input type="number" class="servings-input" data-id="${macro.id}" value="${(macro.servings || 1).toFixed(2)}" step="0.01" min="0.01">
                                <button class="servings-btn-plus" data-id="${macro.id}">+</button>
                                <button class="servings-btn-max" data-id="${macro.id}" title="Max servings before exceeding any macro">>></button>
                            </span>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        }

        macroEntries.innerHTML = html;

        // Render mini progress bars above the entry list
        await renderProgressSummary(macros);

        // Set up button handlers
        const allMacros = [...starred, ...macros];

        // Completion checkboxes
        document.querySelectorAll('.entry-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleToggleCompletion(id, e.target.checked);
            });
        });

        // Star buttons
        document.querySelectorAll('.btn-star-macro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleStarMacro(id);
            });
        });

        // Edit buttons
        document.querySelectorAll('.btn-edit-macro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const entry = allMacros.find(m => m.id === id);
                if (entry) {
                    showMacroForm(entry);
                }
            });
        });

        // Delete buttons
        document.querySelectorAll('.btn-delete-macro').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleDeleteMacro(id);
            });
        });

        // Servings input fields
        document.querySelectorAll('.servings-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const newServings = parseFloat(e.target.value);
                if (!isNaN(newServings) && newServings > 0) {
                    await handleSetServings(id, newServings);
                }
            });
        });

        // Servings plus buttons
        document.querySelectorAll('.servings-btn-plus').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = parseInt(e.target.dataset.id);
                const input = document.querySelector(`.servings-input[data-id="${id}"]`);
                if (input) {
                    const currentServings = parseFloat(input.value) || 1;
                    const newServings = currentServings + 1.0;
                    await handleSetServings(id, newServings);
                }
            });
        });

        // Servings minus buttons
        document.querySelectorAll('.servings-btn-minus').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = parseInt(e.target.dataset.id);
                const input = document.querySelector(`.servings-input[data-id="${id}"]`);
                if (input) {
                    const currentServings = parseFloat(input.value) || 1;
                    const newServings = Math.max(0.1, currentServings - 1.0);
                    await handleSetServings(id, newServings);
                }
            });
        });

        // Servings max buttons
        document.querySelectorAll('.servings-btn-max').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = parseInt(e.target.dataset.id);
                await handleMaxServings(id);
            });
        });

    } catch (error) {
        console.error('Error loading macros:', error);
        const macroEntries = document.getElementById('macro-entries');
        if (macroEntries) {
            macroEntries.innerHTML = '<p class="text-danger">Error loading entries</p>';
        }
    }
}

/**
 * Handle toggling completion status
 * @param {number} id - Entry ID
 * @param {boolean} completed - New completion status
 */
async function handleToggleCompletion(id, completed) {
    try {
        const entry = await db.get('macros', id);
        if (!entry) return;
        // On the macro tab, checking off marks the entire entry (all servings) at once
        entry.status = completed ? 'completed' : 'planned';
        await db.updateMacroEntry(entry);
        await loadTodaysMacros();
    } catch (error) {
        console.error('Error toggling completion:', error);
        ui.showError('Failed to update status: ' + error.message);
    }
}

/**
 * Handle starring/unstarring a macro entry
 * @param {number} id - Entry ID
 */
async function handleStarMacro(id) {
    try {
        const entry = await db.get('macros', id);
        if (!entry) return;

        if (entry.food_id) {
            // Star state is owned by the food library entry
            const food = await db.getNamedFood(entry.food_id);
            if (food) {
                food.starred = !food.starred;
                food.starred_at = food.starred ? Date.now() : null;
                await db.updateNamedFood(food);
                entry.starred = food.starred;
                entry.starred_at = food.starred_at;
            } else {
                entry.starred = !entry.starred;
                entry.starred_at = entry.starred ? Date.now() : null;
            }
        } else {
            entry.starred = !entry.starred;
            entry.starred_at = entry.starred ? Date.now() : null;
        }

        await db.updateMacroEntry(entry);
        await loadTodaysMacros();
    } catch (error) {
        console.error('Error starring macro:', error);
        ui.showError('Failed to star entry: ' + error.message);
    }
}

/**
 * Handle duplicating a macro entry
 * @param {number} id - Entry ID
 * @param {Array} allMacros - All macro entries
 */
async function handleDuplicateMacro(id, allMacros) {
    try {
        const original = allMacros.find(m => m.id === id);
        if (!original) return;

        ui.showLoading('Duplicating entry...');

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const duplicateData = {
            protein: original.protein,
            carbs: original.carbs,
            fat: original.fat,
            fiber: original.fiber,
            calories: original.calories,
            meal_name: original.meal_name,
            serving_label: original.serving_label,
            food_id: original.food_id,
            servings: original.servings,
            date: currentDate,
            // timestamp will be derived from date in db.addMacroEntry
            starred: original.starred
        };

        await db.addMacroEntry(duplicateData);
        ui.hideLoading();
        await loadTodaysMacros();
    } catch (error) {
        console.error('Error duplicating macro:', error);
        ui.hideLoading();
        ui.showError('Failed to duplicate entry: ' + error.message);
    }
}

/**
 * Handle deleting a macro entry
 * @param {number} id - Entry ID
 */
async function handleDeleteMacro(id) {
    try {
        const entry = await db.get('macros', id);
        if (!entry) return;
        await db.deleteMacroEntry(id);
        await loadTodaysMacros();
        ui.showUndoToast('Entry deleted', async () => {
            const { id: _id, ...restoreData } = entry;
            await db.addMacroEntry(restoreData);
            await loadTodaysMacros();
        });
    } catch (error) {
        console.error('Error deleting entry:', error);
        ui.showError('Failed to delete entry: ' + error.message);
    }
}

/**
 * Handle setting servings to a specific value for a macro entry
 * @param {number} id - Entry ID
 * @param {number} newServings - New servings value
 */
async function handleSetServings(id, newServings) {
    try {
        const entry = await db.get('macros', id);
        if (!entry) return;

        const currentServings = entry.servings || 1;

        if (newServings === currentServings) return;

        // Calculate the multiplier
        const multiplier = newServings / currentServings;

        // Update all macro values proportionally
        entry.servings = newServings;
        entry.fat = entry.fat * multiplier;
        entry.protein = entry.protein * multiplier;
        entry.carbs = entry.carbs * multiplier;
        if (entry.fiber) entry.fiber = entry.fiber * multiplier;

        // Recalculate calories
        const { calculateMacroCalories } = await import('../utils/calorie-calc.js');
        entry.calories = calculateMacroCalories(entry.protein, entry.carbs, entry.fat, entry.fiber || 0);

        await db.updateMacroEntry(entry);
        await loadTodaysMacros();

        // Update dashboard if visible
        if (window.fitnessApp && window.fitnessApp.currentScreen === 'dashboard') {
            await window.fitnessApp.loadDashboard();
        }

    } catch (error) {
        console.error('Error setting servings:', error);
        ui.showError('Failed to adjust servings');
    }
}

/**
 * Handle setting servings to maximum before exceeding any macro target
 * @param {number} id - Entry ID
 */
async function handleMaxServings(id) {
    try {
        const entry = await db.get('macros', id);
        if (!entry) return;

        const currentServings = entry.servings || 1;

        // Calculate per-serving macros
        const perServingFat = entry.fat / currentServings;
        const perServingCarbs = entry.carbs / currentServings;
        const perServingProtein = entry.protein / currentServings;

        // Get effective goals (includes reverse diet, PI controller, workout credit)
        const today = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        let goalFat, goalCarbs, goalProtein;
        if (window.fitnessApp) {
            const goals = await window.fitnessApp.calculateEffectiveGoals(today);
            goalFat = goals.fat;
            goalCarbs = goals.carbs;
            goalProtein = goals.protein;
        } else {
            goalFat = parseFloat(await db.getSetting('goal_fat') || 70);
            goalCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);
            goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
        }

        // Get today's macros (excluding this entry, including planned)
        const allMacros = await db.getMacrosByDate(today);
        const otherMacros = allMacros.filter(m => m.id !== id &&
            (m.status === 'completed' || m.status === 'planned'));

        // Calculate current totals (excluding this entry)
        const totalFat = otherMacros.reduce((sum, m) => sum + (m.fat || 0), 0);
        const totalCarbs = otherMacros.reduce((sum, m) => sum + (m.carbs || 0), 0);
        const totalProtein = otherMacros.reduce((sum, m) => sum + (m.protein || 0), 0);

        // Calculate remaining for each macro
        const remainingFat = goalFat - totalFat;
        const remainingCarbs = goalCarbs - totalCarbs;
        const remainingProtein = goalProtein - totalProtein;

        // Calculate max servings for each macro
        const maxServingsFat = perServingFat > 0 ? remainingFat / perServingFat : Infinity;
        const maxServingsCarbs = perServingCarbs > 0 ? remainingCarbs / perServingCarbs : Infinity;
        const maxServingsProtein = perServingProtein > 0 ? remainingProtein / perServingProtein : Infinity;

        const rawMax = Math.min(maxServingsFat, maxServingsCarbs, maxServingsProtein);

        // For per-gram foods the serving unit is grams — floor to 2 decimal places
        // (nearest 0.01g) so the user gets precise gram amounts.
        // For all other formats floor to whole servings.
        let finalServings;
        const namedFood = entry.food_id ? await db.getNamedFood(entry.food_id) : null;
        if (namedFood && namedFood.format_type === 'per_gram') {
            finalServings = Math.max(0.01, Math.floor(rawMax * 100) / 100);
        } else {
            finalServings = Math.max(1, Math.floor(rawMax));
        }

        await handleSetServings(id, finalServings);

    } catch (error) {
        console.error('Error calculating max servings:', error);
        ui.showError('Failed to calculate max servings');
    }
}

/**
 * Show text-based AI macro estimation modal
 */
function showTextAIModal() {
    // Buttons go in the footer (outside the scrolling body) so they stay
    // visible when the virtual keyboard pushes the viewport up.
    let modal;
    modal = ui.createModal('What did you eat?', `
        <textarea id="food-description-ai"
                  placeholder="e.g., large chicken breast with broccoli and rice, glass of milk"
                  rows="3"
                  style="width:100%;resize:vertical;"></textarea>
    `, [
        { text: 'Cancel', className: 'btn-secondary' },
        {
            text: 'Analyze →',
            className: 'btn-primary',
            onClick: () => analyzeTextDescription(modal)
        }
    ]);
    setTimeout(() => modal.querySelector('#food-description-ai')?.focus(), 50);
}

async function analyzeTextDescription(modal) {
    const description = modal.querySelector('#food-description-ai')?.value.trim();
    if (!description) {
        ui.showError('Please enter a food description');
        return;
    }
    try {
        ui.showLoading('Analyzing food description...');
        await new Promise(resolve => setTimeout(resolve, 50));
        const { estimateMacrosFromText } = await import('../api.js');
        const estimates = await estimateMacrosFromText(description);
        ui.hideLoading();
        showMacroForm({ ...estimates, serving_label: description, status: 'completed' });
    } catch (error) {
        ui.hideLoading();
        console.error('Analysis error:', error);
        ui.showError(error.message);
    }
}
