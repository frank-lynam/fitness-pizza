/**
 * Fitness Tracker PWA - Food Library Component
 * Manages named foods with flexible formats (per_serving, per_gram, per_batch)
 */

import { db } from '../db.js';
import { calculateMacroCalories } from '../utils/calorie-calc.js';
import { validateNamedFood, showFieldError, clearFieldError, clearFormErrors } from '../utils/validation.js';
import * as ui from '../ui.js';

// Retain search state across library sessions
let lastSearchTerm = '';
let lastSortBy = 'name';

/**
 * Initialize the food library component
 */
export function initFoodLibrary() {
    const btnManageFoods = document.getElementById('btn-manage-foods');

    if (btnManageFoods) {
        btnManageFoods.addEventListener('click', () => {
            showFoodLibrary();
        });
    }
}

/**
 * Show the food library modal
 */
export async function showFoodLibrary() {
    const foods = await db.getAllNamedFoods();

    // Sort foods: starred first, then by name
    foods.sort((a, b) => {
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        return a.name.localeCompare(b.name);
    });

    const modal = ui.createModal('Food Library', `
        <div class="food-library-content">
            <button id="btn-add-named-food" class="btn-primary" style="width: 100%; margin-bottom: 8px;">
                + Add New Food
            </button>

            <div class="form-group-inline" style="margin-bottom: 4px;">
                <label for="food-search">Search</label>
                <div style="position: relative; flex: 1;">
                    <input type="text" id="food-search" placeholder="Search foods..." value="${lastSearchTerm}" style="width: 100%; padding-right: 30px;">
                    <button id="clear-search" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 16px; display: ${lastSearchTerm ? 'block' : 'none'};" title="Clear search">×</button>
                </div>
            </div>

            <div class="form-group-inline" style="margin-bottom: 8px;">
                <label for="food-sort">Sort by</label>
                <select id="food-sort">
                    <option value="name" ${lastSortBy === 'name' ? 'selected' : ''}>Name</option>
                    <option value="macro-match" ${lastSortBy === 'macro-match' ? 'selected' : ''}>Macro Match</option>
                </select>
            </div>

            <div id="food-library-list">
                ${foods.length === 0 ? '<p class="text-muted">No saved foods yet. Add your frequently eaten meals!</p>' :
                    foods.map(food => createFoodItemHTML(food)).join('')}
            </div>
        </div>
    `, [
        { text: 'Close', className: 'btn-secondary' }
    ]);

    // Set up add food button
    const btnAddFood = modal.querySelector('#btn-add-named-food');
    if (btnAddFood) {
        btnAddFood.addEventListener('click', () => {
            ui.closeModal(modal);
            showFoodForm();
        });
    }

    // Set up search and sort
    const searchInput = modal.querySelector('#food-search');
    const clearSearchBtn = modal.querySelector('#clear-search');
    const sortSelect = modal.querySelector('#food-sort');
    const foodList = modal.querySelector('#food-library-list');

    const updateFoodList = async () => {
        const searchTerm = searchInput.value.toLowerCase();
        const sortBy = sortSelect.value;

        // Save search state
        lastSearchTerm = searchInput.value;
        lastSortBy = sortBy;

        let filteredFoods = foods.filter(food =>
            food.name.toLowerCase().includes(searchTerm)
        );

        if (sortBy === 'macro-match') {
            filteredFoods = await sortByMacroMatch(filteredFoods);
        } else {
            // Sort by starred first, then by name
            filteredFoods.sort((a, b) => {
                if (a.starred && !b.starred) return -1;
                if (!a.starred && b.starred) return 1;
                return a.name.localeCompare(b.name);
            });
        }

        foodList.innerHTML = filteredFoods.length === 0
            ? '<p class="text-muted">No foods found</p>'
            : filteredFoods.map(food => createFoodItemHTML(food)).join('');

        setupFoodLibraryButtons(modal, filteredFoods);
    };

    searchInput.addEventListener('input', () => {
        // Show/hide clear button
        clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
        updateFoodList();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        updateFoodList();
    });

    sortSelect.addEventListener('change', updateFoodList);

    // Apply initial filter if there's a saved search
    if (lastSearchTerm || lastSortBy !== 'name') {
        await updateFoodList();
    } else {
        // Set up buttons for initial load (updateFoodList handles it otherwise)
        setupFoodLibraryButtons(modal, foods);
    }
}

/**
 * Sort foods by how well they match remaining macros
 */
async function sortByMacroMatch(foods) {
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : new Date().toISOString().split('T')[0];
    const macros = await db.getMacrosByDate(currentDate);

    // Include both completed and planned meals in the consumed total
    const countedMacros = macros.filter(m => m.status === 'completed' || m.status === 'planned');

    // Use effective goals (respects reverse diet, PI controller, workout credit)
    let goalFat, goalProtein, goalCarbs;
    if (window.fitnessApp) {
        const goals = await window.fitnessApp.calculateEffectiveGoals(currentDate);
        goalFat = goals.fat;
        goalProtein = goals.protein;
        goalCarbs = goals.carbs;
    } else {
        goalFat = parseFloat(await db.getSetting('goal_fat') || 70);
        goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
        goalCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);
    }

    // Calculate remaining macros
    const totalFat = countedMacros.reduce((sum, m) => sum + m.fat, 0);
    const totalProtein = countedMacros.reduce((sum, m) => sum + m.protein, 0);
    const totalCarbs = countedMacros.reduce((sum, m) => sum + m.carbs, 0);

    const remainingFat = Math.max(0, goalFat - totalFat);
    const remainingProtein = Math.max(0, goalProtein - totalProtein);
    const remainingCarbs = Math.max(0, goalCarbs - totalCarbs);

    const totalRemaining = remainingFat + remainingProtein + remainingCarbs;

    if (totalRemaining === 0) {
        return foods.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Target ratios from remaining macro budget
    const targetFatRatio = remainingFat / totalRemaining;
    const targetProteinRatio = remainingProtein / totalRemaining;
    const targetCarbsRatio = remainingCarbs / totalRemaining;

    // Score each food purely by ratio closeness (lower = better match)
    const scoredFoods = foods.map(food => {
        const foodTotal = food.fat + food.protein + food.carbs;
        if (foodTotal === 0) {
            return { food, score: 999999 };
        }

        const score = Math.abs(food.fat / foodTotal - targetFatRatio) +
                      Math.abs(food.protein / foodTotal - targetProteinRatio) +
                      Math.abs(food.carbs / foodTotal - targetCarbsRatio);

        return { food, score };
    });

    scoredFoods.sort((a, b) => a.score - b.score);

    return scoredFoods.map(item => item.food);
}

/**
 * Create HTML for a food item (condensed format matching macro tab)
 */
function createFoodItemHTML(food) {
    let formatText = '';
    switch (food.format_type) {
        case 'per_serving':
            formatText = `${food.serving_size || 'serving'}`;
            break;
        case 'per_gram':
            formatText = 'per 100g';
            break;
        case 'per_batch':
            formatText = `${food.batch_servings} servings/batch`;
            break;
    }

    return `
        <div class="food-item" data-id="${food.id}">
            <div class="entry-item-header">
                <span class="entry-item-title">
                    ${food.starred ? '⭐ ' : ''}${food.name}
                    <span class="food-format-badge" style="font-size: 0.85em; color: var(--text-secondary); margin-left: 4px;">${formatText}</span>
                </span>
                <div class="entry-item-actions">
                    <button class="btn-star-food ${food.starred ? 'starred' : ''}" data-id="${food.id}" title="${food.starred ? 'Unstar' : 'Star'}">
                        ${food.starred ? '⭐' : '☆'}
                    </button>
                    <button class="btn-use-food btn-primary btn-small" data-id="${food.id}">Use</button>
                    <button class="btn-edit-food btn-secondary btn-small" data-id="${food.id}">Edit</button>
                    <button class="btn-delete-food btn-danger btn-small" data-id="${food.id}">×</button>
                </div>
            </div>
            <div class="entry-item-content">
                <div class="entry-macros">
                    F: ${food.fat.toFixed(1)}g | C: ${food.carbs.toFixed(1)}g | P: ${food.protein.toFixed(1)}g | ${food.calories} cal
                </div>
            </div>
        </div>
    `;
}

/**
 * Set up food library button handlers
 */
function setupFoodLibraryButtons(modal, foods) {
    modal.querySelectorAll('.btn-use-food').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(e.target.dataset.id);
            const food = foods.find(f => f.id === id);
            if (food) {
                // Add directly with 1 serving/100g/1 batch
                const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : new Date().toISOString().split('T')[0];
                const quantity = food.format_type === 'per_gram' ? 100 : 1;
                const macros = db.calculateMacrosFromNamedFood(food, quantity);

                await db.addMacroEntry({
                    ...macros,
                    meal_name: food.name,
                    food_id: food.id,
                    servings: 1, // Always 1 for display purposes (1 serving of this food)
                    date: currentDate,
                    status: 'planned'
                });

                ui.closeModal(modal);

                // Reload macros if on macros screen
                if (window.fitnessApp && window.fitnessApp.currentScreen === 'macros') {
                    const { loadTodaysMacros } = await import('./macro-form.js');
                    await loadTodaysMacros();
                }

                // Update dashboard if visible
                if (window.fitnessApp && window.fitnessApp.currentScreen === 'dashboard') {
                    await window.fitnessApp.loadDashboard();
                }
            }
        });
    });

    modal.querySelectorAll('.btn-edit-food').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            const food = foods.find(f => f.id === id);
            if (food) {
                ui.closeModal(modal);
                showFoodForm(food);
            }
        });
    });

    modal.querySelectorAll('.btn-delete-food').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            ui.confirm('Delete this food from your library?', async () => {
                await db.deleteNamedFood(id);
                ui.closeModal(modal);
                showFoodLibrary();
            });
        });
    });

    modal.querySelectorAll('.btn-star-food').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.target.dataset.id);
            const food = foods.find(f => f.id === id);
            if (food) {
                food.starred = !food.starred;
                food.starred_at = food.starred ? Date.now() : null;
                await db.updateNamedFood(food);
                ui.closeModal(modal);
                showFoodLibrary();
            }
        });
    });
}

/**
 * Show form to add/edit a named food
 */
function showFoodForm(existingFood = null) {
    const isEdit = existingFood !== null;
    const food = existingFood || {
        name: '',
        format_type: 'per_serving',
        protein: '',
        carbs: '',
        fat: '',
        fiber: '',
        serving_size: '1 serving',
        batch_servings: 1
    };

    const modal = ui.createModal(isEdit ? 'Edit Food' : 'Add Food', `
        <form id="food-form">
            <div class="form-actions" style="margin-bottom: 8px;">
                <button type="button" class="btn-primary" id="submit-food-form">${isEdit ? 'Update' : 'Add'}</button>
                <button type="button" class="btn-secondary" id="cancel-food-form">Cancel</button>
            </div>

            <div class="form-group-inline">
                <label for="food-name">Name</label>
                <input type="text" id="food-name" value="${food.name}" required placeholder="Food name">
            </div>

            <div class="form-group-inline">
                <label for="food-format">Format</label>
                <select id="food-format">
                    <option value="per_serving" ${food.format_type === 'per_serving' ? 'selected' : ''}>Per Serving</option>
                    <option value="per_gram" ${food.format_type === 'per_gram' ? 'selected' : ''}>Per 100g</option>
                    <option value="per_batch" ${food.format_type === 'per_batch' ? 'selected' : ''}>Per Batch</option>
                </select>
            </div>

            <div id="serving-size-field" class="form-group-inline ${food.format_type === 'per_serving' ? '' : 'hidden'}">
                <label for="serving-size">Serving</label>
                <input type="text" id="serving-size" value="${food.serving_size || '1 serving'}" placeholder="e.g., 1 scoop">
            </div>

            <div id="batch-servings-field" class="form-group-inline ${food.format_type === 'per_batch' ? '' : 'hidden'}">
                <label for="batch-servings">Servings</label>
                <input type="number" id="batch-servings" value="${food.batch_servings || 1}" min="1">
            </div>

            <div class="form-group-inline">
                <label for="food-fat">Fat (g)</label>
                <input type="number" id="food-fat" step="0.001" min="0" value="${food.fat}" required>
            </div>

            <div class="form-group-inline">
                <label for="food-carbs">Carbs (g)</label>
                <input type="number" id="food-carbs" step="0.001" min="0" value="${food.carbs}" required>
            </div>

            <div class="form-group-inline">
                <label for="food-protein">Protein (g)</label>
                <input type="number" id="food-protein" step="0.001" min="0" value="${food.protein}" required>
            </div>

            <div class="form-group-inline">
                <label for="food-fiber">Fiber (g)</label>
                <input type="number" id="food-fiber" step="0.001" min="0" value="${food.fiber || 0}">
            </div>

            <div class="calories-display">
                <span class="calories-label">Calories:</span>
                <span class="calories-value" id="food-calories">0 cal</span>
            </div>
        </form>
    `, []);

    // Set up button handlers
    const submitBtn = modal.querySelector('#submit-food-form');
    const cancelBtn = modal.querySelector('#cancel-food-form');

    if (submitBtn) {
        submitBtn.addEventListener('click', () => handleFoodFormSubmit(modal, isEdit, existingFood));
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => ui.closeModal(modal));
    }

    // Set up format type change handler
    const formatSelect = modal.querySelector('#food-format');
    const servingSizeField = modal.querySelector('#serving-size-field');
    const batchServingsField = modal.querySelector('#batch-servings-field');

    formatSelect.addEventListener('change', (e) => {
        const format = e.target.value;
        servingSizeField.classList.toggle('hidden', format !== 'per_serving');
        batchServingsField.classList.toggle('hidden', format !== 'per_batch');
    });

    // Set up calorie calculator
    const updateCalories = () => {
        const protein = parseFloat(modal.querySelector('#food-protein').value || 0);
        const carbs = parseFloat(modal.querySelector('#food-carbs').value || 0);
        const fat = parseFloat(modal.querySelector('#food-fat').value || 0);
        const fiber = parseFloat(modal.querySelector('#food-fiber').value || 0);
        const calories = calculateMacroCalories(protein, carbs, fat, fiber);
        modal.querySelector('#food-calories').textContent = `${calories} cal`;
    };

    modal.querySelectorAll('#food-protein, #food-carbs, #food-fat, #food-fiber').forEach(input => {
        input.addEventListener('input', updateCalories);
    });

    updateCalories();
}

/**
 * Handle food form submission
 */
async function handleFoodFormSubmit(modal, isEdit, existingFood) {
    try {
        const name = modal.querySelector('#food-name').value.trim();
        const format_type = modal.querySelector('#food-format').value;
        const protein = parseFloat(modal.querySelector('#food-protein').value || 0);
        const carbs = parseFloat(modal.querySelector('#food-carbs').value || 0);
        const fat = parseFloat(modal.querySelector('#food-fat').value || 0);
        const fiber = parseFloat(modal.querySelector('#food-fiber').value || 0);
        const calories = calculateMacroCalories(protein, carbs, fat, fiber);

        const foodData = {
            name,
            format_type,
            protein,
            carbs,
            fat,
            fiber,
            calories
        };

        if (format_type === 'per_serving') {
            foodData.serving_size = modal.querySelector('#serving-size').value.trim();
        } else if (format_type === 'per_batch') {
            foodData.batch_servings = parseInt(modal.querySelector('#batch-servings').value || 1);
        }

        if (isEdit && existingFood) {
            foodData.id = existingFood.id;
            await db.updateNamedFood(foodData);
        } else {
            await db.addNamedFood(foodData);
            // Set search to find the newly added food
            lastSearchTerm = foodData.name;
        }

        ui.closeModal(modal);
        showFoodLibrary();
    } catch (error) {
        console.error('Error saving food:', error);
        ui.showError('Failed to save food: ' + error.message);
    }
}

/**
 * Show quick add form for a named food
 */
function showQuickAddForm(food) {
    const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : new Date().toISOString().split('T')[0];

    let quantityLabel = 'Quantity';
    let quantityPlaceholder = '1';

    switch (food.format_type) {
        case 'per_serving':
            quantityLabel = 'Servings';
            break;
        case 'per_gram':
            quantityLabel = 'Grams';
            quantityPlaceholder = '100';
            break;
        case 'per_batch':
            quantityLabel = 'Servings from batch';
            break;
    }

    const modal = ui.createModal(`Add ${food.name}`, `
        <form id="quick-add-form">
            <div class="form-group">
                <label for="quick-quantity">${quantityLabel} *</label>
                <input type="number" id="quick-quantity" step="0.001" min="0.1" value="${quantityPlaceholder}" required>
            </div>

            <div class="form-group">
                <label for="quick-meal-name">Meal Name</label>
                <input type="text" id="quick-meal-name" value="${food.name}">
            </div>

            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="quick-planned">
                    <span>Mark as planned</span>
                </label>
            </div>

            <div id="quick-macros-preview" class="calories-display">
                <div class="calories-label">Macros:</div>
                <div class="calories-value" id="quick-preview-text"></div>
            </div>
        </form>
    `, [
        { text: 'Cancel', className: 'btn-secondary' },
        {
            text: 'Add to Log',
            className: 'btn-primary',
            onClick: async () => {
                const quantity = parseFloat(modal.querySelector('#quick-quantity').value || 1);
                const mealName = modal.querySelector('#quick-meal-name').value.trim();
                const isPlanned = modal.querySelector('#quick-planned').checked;

                const macros = db.calculateMacrosFromNamedFood(food, quantity);

                await db.addMacroEntry({
                    ...macros,
                    meal_name: mealName,
                    food_description: `${quantity} ${food.format_type === 'per_serving' ? food.serving_size : food.format_type === 'per_gram' ? 'g' : 'servings'}`,
                    food_id: food.id,
                    servings: quantity,
                    date: currentDate,
                    timestamp: Date.now(),
                    status: isPlanned ? 'planned' : 'completed'
                });

                ui.closeModal(modal);

                // Reload macros if on macros screen
                if (window.fitnessApp && window.fitnessApp.currentScreen === 'macros') {
                    const { loadTodaysMacros } = await import('./macro-form.js');
                    await loadTodaysMacros();
                } else if (window.fitnessApp && window.fitnessApp.currentScreen === 'dashboard') {
                    await window.fitnessApp.loadDashboard();
                }
            }
        }
    ]);

    // Update preview on quantity change
    const updatePreview = () => {
        const quantity = parseFloat(modal.querySelector('#quick-quantity').value || 1);
        const macros = db.calculateMacrosFromNamedFood(food, quantity);
        modal.querySelector('#quick-preview-text').textContent =
            `F: ${macros.fat.toFixed(1)}g | C: ${macros.carbs.toFixed(1)}g | P: ${macros.protein.toFixed(1)}g (${macros.calories} cal)`;
    };

    modal.querySelector('#quick-quantity').addEventListener('input', updatePreview);
    updatePreview();
}

/**
 * Export for use in macro form
 */
export { showFoodLibrary as showFoodLibraryModal };
