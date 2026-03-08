/**
 * Fitness Tracker PWA - Macro Entry Form Component
 * Handles manual macro entry with fiber support and auto-calculated calories
 */

import { db } from '../db.js';
import { calculateMacroCalories } from '../utils/calorie-calc.js';
import { validateMacros, showFieldError, clearFieldError, clearFormErrors } from '../utils/validation.js';
import * as ui from '../ui.js';
import { formatDateTime, getTodayDate } from '../utils/date-utils.js';

// Module-level interval ID so it can be cleared when the screen is re-entered
let _reverseDietIntervalId = null;

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
    const btnPhotoMacro = document.getElementById('btn-photo-macro');
    const btnTextAIMacro = document.getElementById('btn-text-ai-macro');
    const reverseDietToggle = document.getElementById('reverse-diet-toggle');
    const formContainer = document.getElementById('macro-form-container');

    if (btnAddMacro) {
        btnAddMacro.addEventListener('click', () => {
            showMacroForm();
        });
    }

    if (btnPhotoMacro) {
        btnPhotoMacro.addEventListener('click', async () => {
            const { showPhotoUploadModal } = await import('./photo-upload.js');
            showPhotoUploadModal();
        });
    }

    if (btnTextAIMacro) {
        btnTextAIMacro.addEventListener('click', () => {
            showTextAIModal();
        });
    }

    // Load and setup reverse diet toggle for current day
    if (reverseDietToggle) {
        setupReverseDietToggle(reverseDietToggle);
    }
}

/**
 * Setup reverse diet toggle for current day
 */
async function setupReverseDietToggle(toggle) {
    const { getTodayDate } = await import('../utils/date-utils.js');
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();

    // Load current state from settings (stored per date)
    const reverseDietDates = JSON.parse(await db.getSetting('reverse_diet_dates') || '{}');
    toggle.checked = reverseDietDates[currentDate] === true;

    toggle.addEventListener('change', async () => {
        // Update state for this date
        const reverseDietDates = JSON.parse(await db.getSetting('reverse_diet_dates') || '{}');
        if (toggle.checked) {
            reverseDietDates[currentDate] = true;
        } else {
            delete reverseDietDates[currentDate];
        }
        await db.setSetting('reverse_diet_dates', JSON.stringify(reverseDietDates));

        // Reload dashboard if visible to update targets
        if (window.fitnessApp && window.fitnessApp.currentScreen === 'dashboard') {
            await window.fitnessApp.loadDashboard();
        }
    });

    // Re-check state when date changes (if fitnessApp is available)
    if (window.fitnessApp) {
        let lastDate = currentDate;

        // Clear any previous poll before starting a new one
        if (_reverseDietIntervalId !== null) {
            clearInterval(_reverseDietIntervalId);
        }

        // Poll for date changes and store the ID so it can be cleared later
        _reverseDietIntervalId = setInterval(async () => {
            const newDate = window.fitnessApp.getCurrentDate();
            if (newDate !== lastDate) {
                lastDate = newDate;
                const reverseDietDates = JSON.parse(await db.getSetting('reverse_diet_dates') || '{}');
                toggle.checked = reverseDietDates[newDate] === true;
            }
        }, 1000);
    }
}

/**
 * Show the macro entry form
 * @param {Object} existingEntry - Existing entry to edit (optional)
 */
export function showMacroForm(existingEntry = null) {
    const formContainer = document.getElementById('macro-form-container');
    if (!formContainer) return;

    const isEdit = existingEntry !== null && existingEntry.id != null;
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
    const entry = existingEntry || {
        protein: '',
        carbs: '',
        fat: '',
        fiber: '',
        meal_name: '',
        food_description: '',
        date: currentDate
    };

    formContainer.innerHTML = `
        <div class="macro-form-card">
            <form id="macro-entry-form">
                <div class="form-actions" style="margin-bottom: 8px;">
                    <button type="submit" class="btn-primary">
                        ${isEdit ? 'Update' : 'Save'} Entry
                    </button>
                    <button type="button" id="btn-cancel-macro" class="btn-secondary">Cancel</button>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="meal-planned" ${entry.status === 'planned' ? 'checked' : ''}>
                        <span>Mark as planned (not yet eaten)</span>
                    </label>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="skip-library-save" ${isEdit ? 'checked' : ''}>
                        <span>Don't save to food library</span>
                    </label>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <input type="text" id="meal-name" placeholder="Meal Name"
                           value="${entry.meal_name}">
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <textarea id="food-description" placeholder="Food Description (optional)"
                    >${entry.food_description}</textarea>
                </div>

                <div class="form-group" style="margin-bottom: 4px;">
                    <label class="checkbox-label">
                        <input type="checkbox" id="is-batch-recipe" ${entry.is_batch ? 'checked' : ''}>
                        <span>This is a batch recipe (I made multiple servings)</span>
                    </label>
                </div>

                <div id="batch-fields" style="display: ${entry.is_batch ? 'block' : 'none'}; margin-bottom: 8px; padding: 8px; background: var(--bg-secondary); border-radius: var(--radius-md);">
                    <p style="font-size: 0.9em; color: var(--text-secondary); margin-bottom: 8px;">
                        Enter the <strong>total macros for the entire batch</strong> below, then specify how many servings the batch makes and how many you ate.
                    </p>
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

                <div class="macros-grid" style="gap: 4px; margin-bottom: 4px;">
                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="fat" style="min-width: 60px;">Fat (g)</label>
                        <input type="number" id="fat" step="0.001" min="0"
                               value="${entry.fat}">
                    </div>

                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="carbs" style="min-width: 60px;">Carbs (g)</label>
                        <input type="number" id="carbs" step="0.001" min="0"
                               value="${entry.carbs}">
                    </div>

                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="protein" style="min-width: 60px;">Protein (g)</label>
                        <input type="number" id="protein" step="0.001" min="0"
                               value="${entry.protein}">
                    </div>

                    <div class="form-group-inline" style="margin-bottom: 0;">
                        <label for="fiber" style="min-width: 60px;">Fiber (g)</label>
                        <input type="number" id="fiber" step="0.001" min="0"
                               value="${entry.fiber}">
                    </div>
                </div>

                <div class="calories-display">
                    <div class="calories-label">Calculated Calories:</div>
                    <div class="calories-value" id="calculated-calories">0 cal</div>
                </div>
            </form>
        </div>
    `;

    formContainer.classList.remove('hidden');

    // Set up event listeners
    setupMacroFormListeners(isEdit, existingEntry);

    // Calculate initial calories
    updateCalculatedCalories();

    // Scroll to form
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

    // Input listeners for auto-calculating calories
    const proteinInput = document.getElementById('protein');
    const carbsInput = document.getElementById('carbs');
    const fatInput = document.getElementById('fat');
    const fiberInput = document.getElementById('fiber');

    [proteinInput, carbsInput, fatInput, fiberInput].forEach(input => {
        if (input) {
            input.addEventListener('input', updateCalculatedCalories);
            input.addEventListener('input', () => clearFieldError(input));
        }
    });

    // Batch recipe checkbox
    if (batchCheckbox && batchFields) {
        batchCheckbox.addEventListener('change', () => {
            batchFields.style.display = batchCheckbox.checked ? 'block' : 'none';
            updateCalculatedCalories();
        });
    }

    // Batch servings inputs
    const batchServingsInput = document.getElementById('batch-servings');
    const servingsEatenInput = document.getElementById('servings-eaten');
    if (batchServingsInput) {
        batchServingsInput.addEventListener('input', updateCalculatedCalories);
    }
    if (servingsEatenInput) {
        servingsEatenInput.addEventListener('input', updateCalculatedCalories);
    }

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideMacroForm();
        });
    }

    // Form submission
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
    const protein = parseFloat(document.getElementById('protein')?.value || 0);
    const carbs = parseFloat(document.getElementById('carbs')?.value || 0);
    const fat = parseFloat(document.getElementById('fat')?.value || 0);
    const fiber = parseFloat(document.getElementById('fiber')?.value || 0);
    const isBatch = document.getElementById('is-batch-recipe')?.checked || false;
    const batchServings = parseFloat(document.getElementById('batch-servings')?.value || 1);
    const servingsEaten = parseFloat(document.getElementById('servings-eaten')?.value || 1);

    let displayProtein = protein;
    let displayCarbs = carbs;
    let displayFat = fat;
    let displayFiber = fiber;

    // If batch recipe, calculate actual consumed macros
    if (isBatch && batchServings > 0) {
        const perServing = {
            protein: protein / batchServings,
            carbs: carbs / batchServings,
            fat: fat / batchServings,
            fiber: fiber / batchServings
        };
        displayProtein = perServing.protein * servingsEaten;
        displayCarbs = perServing.carbs * servingsEaten;
        displayFat = perServing.fat * servingsEaten;
        displayFiber = perServing.fiber * servingsEaten;
    }

    const calories = calculateMacroCalories(displayProtein, displayCarbs, displayFat, displayFiber);

    const caloriesDisplay = document.getElementById('calculated-calories');
    if (caloriesDisplay) {
        if (isBatch) {
            caloriesDisplay.textContent = `${Math.round(calories)} cal (from ${servingsEaten} of ${batchServings} servings)`;
        } else {
            caloriesDisplay.textContent = `${calories} cal`;
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
        // Clear previous errors
        const form = document.getElementById('macro-entry-form');
        clearFormErrors(form);

        // Get form values
        let protein = parseFloat(document.getElementById('protein').value || 0);
        let carbs = parseFloat(document.getElementById('carbs').value || 0);
        let fat = parseFloat(document.getElementById('fat').value || 0);
        let fiber = parseFloat(document.getElementById('fiber').value || 0);
        const mealName = document.getElementById('meal-name').value.trim();
        const foodDescription = document.getElementById('food-description').value.trim();
        const isPlanned = document.getElementById('meal-planned').checked;
        const skipLibrarySave = document.getElementById('skip-library-save').checked;
        const isBatch = document.getElementById('is-batch-recipe').checked;
        const batchServings = parseFloat(document.getElementById('batch-servings').value || 1);
        const servingsEaten = parseFloat(document.getElementById('servings-eaten').value || 1);

        // If batch recipe, adjust macros to actual consumed amount
        if (isBatch && batchServings > 0) {
            const perServing = {
                protein: protein / batchServings,
                carbs: carbs / batchServings,
                fat: fat / batchServings,
                fiber: fiber / batchServings
            };
            protein = perServing.protein * servingsEaten;
            carbs = perServing.carbs * servingsEaten;
            fat = perServing.fat * servingsEaten;
            fiber = perServing.fiber * servingsEaten;
        }

        // Validate macros
        const validation = validateMacros({ protein, carbs, fat, fiber });
        if (!validation.valid) {
            // Show validation errors
            Object.keys(validation.errors).forEach(field => {
                const input = document.getElementById(field);
                if (input) {
                    showFieldError(input, validation.errors[field]);
                }
            });
            return;
        }

        // Calculate calories
        const calories = calculateMacroCalories(protein, carbs, fat, fiber);

        // Prepare entry data
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const entryData = {
            protein,
            carbs,
            fat,
            fiber,
            calories,
            meal_name: mealName,
            food_description: foodDescription,
            servings: 1, // Default to 1 serving for manual entries
            date: currentDate,
            // timestamp will be derived from date in db.addMacroEntry
            status: isPlanned ? 'planned' : 'completed'
        };

        // Save to database
        ui.showLoading(isEdit ? 'Updating entry...' : 'Saving entry...');

        if (isEdit && existingEntry) {
            // Update existing entry
            entryData.id = existingEntry.id;
            // Preserve servings if editing
            if (existingEntry.servings) {
                entryData.servings = existingEntry.servings;
            }
            await db.updateMacroEntry(entryData);
        } else {
            // Add new entry
            const entryId = await db.addMacroEntry(entryData);

            // Auto-add to food library if it has a name and user didn't skip library save
            if (mealName && !skipLibrarySave) {
                const existingFoods = await db.getAllNamedFoods();
                const foodExists = existingFoods.some(f =>
                    f.name.toLowerCase() === mealName.toLowerCase()
                );

                if (!foodExists) {
                    await db.addNamedFood({
                        name: mealName,
                        format_type: 'per_serving',
                        protein,
                        carbs,
                        fat,
                        fiber,
                        calories,
                        serving_size: '1 serving',
                        notes: foodDescription
                    });
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
        { label: 'Fat',  key: 'fat',     dec: 1, color: 'var(--accent-warning)' },
        { label: 'Carb', key: 'carbs',   dec: 1, color: 'var(--accent-success)' },
        { label: 'Prot', key: 'protein', dec: 1, color: 'var(--accent-primary)' },
    ];

    const barsHtml = rows.map(({ label, key, dec, color }) => {
        const g     = goals[key] || 1;
        const d     = done[key];
        const p     = pln[key];
        const total = d + p;
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
        fat:     Math.max(0, total.fat     - goals.fat),
        protein: Math.max(0, total.protein - goals.protein),
        carbs:   Math.max(0, total.carbs   - goals.carbs),
    };

    if (ov.fat === 0 && ov.protein === 0 && ov.carbs === 0) return {};

    // Scale factor: 0 when overage ≤5g, ramps linearly to 1 at 10g+
    const scale = (x) => Math.min(1, Math.max(0, (x - 5) / 5));
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
                const food = await db.getNamedFood(fid);
                if (food) namedFoodsMap[fid] = food;
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

            const planIntensities = computePlanIntensities(macros, _dailyGoals);
            html += macros.map(macro => {
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
                                ${macro.starred ? '⭐ ' : ''}${macro.meal_name || 'Meal'} ${servingBadge(macro)}
                            </span>
                        </label>
                        <div class="entry-item-actions">
                            <button class="btn-star-macro ${macro.starred ? 'starred' : ''}" data-id="${macro.id}" title="${macro.starred ? 'Unstar' : 'Star'}">
                                ${macro.starred ? '⭐' : '☆'}
                            </button>
                            <button class="btn-edit-macro btn-secondary btn-small" data-id="${macro.id}">Edit</button>
                            <button class="btn-delete-macro btn-danger btn-small" data-id="${macro.id}">×</button>
                        </div>
                    </div>
                    <div class="entry-item-content">
                        <div class="entry-macros">
                            F: ${macro.fat.toFixed(1)}g | C: ${macro.carbs.toFixed(1)}g | P: ${macro.protein.toFixed(1)}g | ${macro.calories.toFixed(0)} cal
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
        if (entry) {
            entry.starred = !entry.starred;
            entry.starred_at = entry.starred ? Date.now() : null;
            await db.updateMacroEntry(entry);
            await loadTodaysMacros();
        }
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
            food_description: original.food_description,
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
    ui.confirm(
        'Are you sure you want to delete this entry?',
        async () => {
            try {
                ui.showLoading('Deleting entry...');
                await db.deleteMacroEntry(id);
                ui.hideLoading();
                await loadTodaysMacros();
            } catch (error) {
                console.error('Error deleting entry:', error);
                ui.hideLoading();
                ui.showError('Failed to delete entry: ' + error.message);
            }
        }
    );
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

        // Take the minimum and floor to integer
        const maxServings = Math.floor(Math.min(maxServingsFat, maxServingsCarbs, maxServingsProtein));

        // Ensure at least 1 serving
        const finalServings = Math.max(1, maxServings);

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
    const modal = ui.createModal('AI Macro Estimation', `
        <div class="photo-upload-container">
            <p class="help-text" style="margin-bottom: 12px;">Describe what you ate and AI will estimate the macros:</p>

            <div class="form-group">
                <label for="food-description-ai" style="display: block; margin-bottom: 4px;">Food Description</label>
                <textarea id="food-description-ai"
                          placeholder="e.g., Large chicken breast with broccoli and rice, glass of milk"
                          rows="4"
                          style="width: 100%; resize: vertical;"></textarea>
            </div>

            <div class="button-group" style="margin-top: 12px;">
                <button id="btn-analyze-text" class="btn-primary">Analyze</button>
                <button id="btn-cancel-text" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `, []);

    const textArea = modal.querySelector('#food-description-ai');
    const analyzeBtn = modal.querySelector('#btn-analyze-text');
    const cancelBtn = modal.querySelector('#btn-cancel-text');

    // Cancel button
    cancelBtn.addEventListener('click', () => {
        ui.closeModal(modal);
    });

    // Analyze button
    analyzeBtn.addEventListener('click', async () => {
        const description = textArea.value.trim();
        if (!description) {
            ui.showError('Please enter a food description');
            return;
        }

        try {
            // Show loading immediately
            ui.showLoading('Analyzing food description...');

            // Use setTimeout to ensure loading UI renders
            await new Promise(resolve => setTimeout(resolve, 50));

            const { estimateMacrosFromText } = await import('../api.js');
            const estimates = await estimateMacrosFromText(description);

            ui.hideLoading();

            // Close modal
            ui.closeModal(modal);

            // Open macro form with AI estimates pre-filled
            showMacroForm({
                ...estimates,
                food_description: description,
                status: 'completed'
            });

        } catch (error) {
            ui.hideLoading();
            console.error('Analysis error:', error);
            ui.showError(error.message);
        }
    });
}
