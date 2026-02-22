/**
 * Fitness Tracker PWA - Workout Form Component
 * Handles workout logging with dynamic sets and calorie burn estimates
 */

import { db } from '../db.js';
import { estimateWorkoutCalories } from '../utils/calorie-calc.js';
import { validateWorkout, showFieldError, clearFieldError, clearFormErrors } from '../utils/validation.js';
import * as ui from '../ui.js';
import { formatDateTime, getTodayDate } from '../utils/date-utils.js';

/**
 * Initialize the workout form component
 */
export function initWorkoutForm() {
    const btnAddWorkout = document.getElementById('btn-add-workout');
    const btnManageWorkouts = document.getElementById('btn-manage-workouts');

    if (btnAddWorkout) {
        btnAddWorkout.addEventListener('click', () => {
            showWorkoutForm();
        });
    }

    if (btnManageWorkouts) {
        btnManageWorkouts.addEventListener('click', async () => {
            const { showWorkoutLibraryModal } = await import('./workout-library.js');
            showWorkoutLibraryModal();
        });
    }

    // Quick exercise buttons
    document.querySelectorAll('.btn-quick-exercise').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const exerciseName = e.target.dataset.exercise;
            showWorkoutForm(null, exerciseName);
        });
    });
}

/**
 * Show the workout entry form
 * @param {Object} existingEntry - Existing entry to edit (optional)
 * @param {string} quickExercise - Pre-filled exercise name from quick-add (optional)
 */
export function showWorkoutForm(existingEntry = null, quickExercise = null) {
    const formContainer = document.getElementById('workout-form-container');
    if (!formContainer) return;

    const isEdit = existingEntry !== null;
    const entry = existingEntry || {
        exercise_name: quickExercise || '',
        exercise_type: 'Lifting',
        reps: '',
        duration_minutes: '',
        date: getTodayDate()
    };

    formContainer.innerHTML = `
        <div class="workout-form-card">
            <div class="form-header">
                <h3>${isEdit ? 'Edit' : 'Add'} Workout</h3>
                <button id="btn-cancel-workout" class="btn-secondary btn-small">Cancel</button>
            </div>

            <form id="workout-entry-form">
                <div class="form-actions" style="margin-bottom: 8px;">
                    <button type="submit" class="btn-primary">
                        ${isEdit ? 'Update' : 'Save'} Workout
                    </button>
                </div>

                <div class="form-group">
                    <label for="exercise-name">Exercise Name *</label>
                    <input type="text" id="exercise-name" placeholder="e.g., Squat, Running, Planks"
                           value="${entry.exercise_name}" required>
                </div>

                <div class="form-group">
                    <label for="exercise-type">Exercise Type *</label>
                    <select id="exercise-type" required>
                        <option value="Cardio" ${entry.exercise_type === 'Cardio' ? 'selected' : ''}>Cardio</option>
                        <option value="Core" ${entry.exercise_type === 'Core' ? 'selected' : ''}>Core</option>
                        <option value="Lifting" ${entry.exercise_type === 'Lifting' ? 'selected' : ''}>Lifting</option>
                    </select>
                </div>

                <div id="cardio-field" class="form-group ${entry.exercise_type === 'Cardio' ? '' : 'hidden'}">
                    <label for="duration-minutes">Duration (minutes) *</label>
                    <input type="number" id="duration-minutes" step="1" min="1"
                           placeholder="30" value="${entry.duration_minutes || ''}">
                </div>

                <div id="pace-field" class="form-group ${entry.exercise_type === 'Cardio' ? '' : 'hidden'}">
                    <label for="pace">Pace (min/mile, optional)</label>
                    <input type="number" id="pace" step="0.1" min="0"
                           placeholder="e.g., 8.5" value="${entry.pace || ''}">
                    <p class="help-text">Average pace in minutes per mile</p>
                </div>

                <div id="reps-field" class="form-group ${entry.exercise_type !== 'Cardio' ? '' : 'hidden'}">
                    <label for="exercise-reps">Total Reps *</label>
                    <input type="number" id="exercise-reps" step="1" min="1"
                           placeholder="e.g., 50" value="${entry.reps || ''}">
                    <p class="help-text">Total reps across all sets</p>
                </div>

                <div class="calories-display">
                    <span class="calories-label">Estimated:</span>
                    <span class="calories-value" id="estimated-calories">0 cal</span>
                </div>
            </form>
        </div>
    `;

    formContainer.classList.remove('hidden');

    // Set up event listeners
    setupWorkoutFormListeners(isEdit, existingEntry);

    // Calculate initial calories
    updateEstimatedCalories();

    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Create HTML for a set entry
 * @param {Object} set - Set data
 * @param {number} index - Set index
 * @returns {string} HTML string
 */
function createSetHTML(set, index) {
    return `
        <div class="set-row" data-set-index="${index}">
            <div class="set-number">Set ${index + 1}</div>
            <div class="set-inputs">
                <input type="number" class="set-reps" placeholder="Reps" step="1" min="1"
                       value="${set.reps}" data-set-index="${index}">
                <input type="number" class="set-weight" placeholder="Weight" step="0.5" min="0"
                       value="${set.weight}" data-set-index="${index}">
                <select class="set-unit" data-set-index="${index}">
                    <option value="lbs" ${set.unit === 'lbs' ? 'selected' : ''}>lbs</option>
                    <option value="kg" ${set.unit === 'kg' ? 'selected' : ''}>kg</option>
                </select>
                <input type="number" class="set-rpe" placeholder="RPE" step="0.5" min="1" max="10"
                       value="${set.rpe}" data-set-index="${index}" title="Rate of Perceived Exertion (1-10)">
                <button type="button" class="btn-remove-set btn-danger btn-small" data-set-index="${index}">×</button>
            </div>
        </div>
    `;
}

/**
 * Hide the workout entry form
 */
export function hideWorkoutForm() {
    const formContainer = document.getElementById('workout-form-container');
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
function setupWorkoutFormListeners(isEdit, existingEntry) {
    const form = document.getElementById('workout-entry-form');
    const cancelBtn = document.getElementById('btn-cancel-workout');
    const exerciseTypeSelect = document.getElementById('exercise-type');
    const cardioField = document.getElementById('cardio-field');
    const paceField = document.getElementById('pace-field');
    const repsField = document.getElementById('reps-field');

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideWorkoutForm();
        });
    }

    // Exercise type change
    if (exerciseTypeSelect) {
        exerciseTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            cardioField.classList.toggle('hidden', type !== 'Cardio');
            if (paceField) paceField.classList.toggle('hidden', type !== 'Cardio');
            repsField.classList.toggle('hidden', type === 'Cardio');
            updateEstimatedCalories();
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleWorkoutFormSubmit(isEdit, existingEntry);
        });
    }

    // Input listeners for calorie estimation
    const exerciseInput = document.getElementById('exercise-name');
    const durationInput = document.getElementById('duration-minutes');
    const repsInput = document.getElementById('exercise-reps');
    const paceInput = document.getElementById('pace');

    if (exerciseInput) {
        exerciseInput.addEventListener('input', () => { updateEstimatedCalories(); });
        exerciseInput.addEventListener('input', () => clearFieldError(exerciseInput));
    }

    if (durationInput) {
        durationInput.addEventListener('input', () => { updateEstimatedCalories(); });
    }

    if (repsInput) {
        repsInput.addEventListener('input', () => { updateEstimatedCalories(); });
    }

    if (paceInput) {
        paceInput.addEventListener('input', () => { updateEstimatedCalories(); });
    }
}

/**
 * Set up listeners for set inputs
 */
function setupSetListeners() {
    // Remove set buttons
    document.querySelectorAll('.btn-remove-set').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.dataset.setIndex;
            const setRow = document.querySelector(`.set-row[data-set-index="${index}"]`);
            if (setRow) {
                setRow.remove();
                // Renumber remaining sets
                document.querySelectorAll('.set-row').forEach((row, i) => {
                    row.dataset.setIndex = i;
                    row.querySelector('.set-number').textContent = `Set ${i + 1}`;
                    row.querySelectorAll('[data-set-index]').forEach(el => {
                        el.dataset.setIndex = i;
                    });
                });
                updateEstimatedCalories();
            }
        });
    });

    // Set input listeners for calorie update
    document.querySelectorAll('.set-reps, .set-weight').forEach(input => {
        input.addEventListener('input', updateEstimatedCalories);
    });
}

/**
 * Update the estimated calories display
 */
async function updateEstimatedCalories() {
    const exerciseType = document.getElementById('exercise-type')?.value || 'Lifting';
    const durationMinutes = parseInt(document.getElementById('duration-minutes')?.value || 0);
    const reps = parseInt(document.getElementById('exercise-reps')?.value || 0);
    const pace = parseFloat(document.getElementById('pace')?.value || 0);

    let calories = 0;

    if (exerciseType === 'Cardio' && durationMinutes > 0) {
        if (pace > 0) {
            // Continuous MET from pace: speed (mph) = 60/pace, MET rises linearly with speed
            const speedMph = 60 / pace;
            const met = Math.min(20, Math.max(3.5, 1.5 * speedMph + 1.0));
            const weightLbs = parseFloat(await db.getSetting('user_weight_lbs') || 154);
            const weightKg = weightLbs * 0.453592;
            calories = (met * 3.5 * weightKg / 200) * durationMinutes;
        } else {
            // Fallback when no pace provided
            calories = durationMinutes * 3;
        }
    } else if (exerciseType === 'Core' && reps > 0) {
        calories = reps * 0.5;
    } else if (exerciseType === 'Lifting' && reps > 0) {
        calories = reps * 1;
    }

    const caloriesDisplay = document.getElementById('estimated-calories');
    if (caloriesDisplay) {
        caloriesDisplay.textContent = `${Math.round(calories)} cal`;
    }
}

/**
 * Handle form submission
 * @param {boolean} isEdit - Whether this is an edit operation
 * @param {Object} existingEntry - Existing entry being edited
 */
async function handleWorkoutFormSubmit(isEdit, existingEntry) {
    try {
        // Clear previous errors
        const form = document.getElementById('workout-entry-form');
        clearFormErrors(form);

        // Get form values
        const exerciseName = document.getElementById('exercise-name').value.trim();
        const exerciseType = document.getElementById('exercise-type').value;
        const durationMinutes = parseInt(document.getElementById('duration-minutes')?.value || 0);
        const pace = parseFloat(document.getElementById('pace')?.value || 0);
        const reps = parseInt(document.getElementById('exercise-reps')?.value || 0);

        // Validate
        if (!exerciseName) {
            const input = document.getElementById('exercise-name');
            showFieldError(input, 'Exercise name is required');
            return;
        }

        if (exerciseType === 'Cardio' && !durationMinutes) {
            const input = document.getElementById('duration-minutes');
            showFieldError(input, 'Duration is required for cardio');
            return;
        }

        if (exerciseType !== 'Cardio' && !reps) {
            const input = document.getElementById('exercise-reps');
            showFieldError(input, 'Reps are required');
            return;
        }

        // Calculate calories
        let estimatedCalories = 0;
        if (exerciseType === 'Cardio') {
            if (pace > 0) {
                const speedMph = 60 / pace;
                const met = Math.min(20, Math.max(3.5, 1.5 * speedMph + 1.0));
                const weightLbs = parseFloat(await db.getSetting('user_weight_lbs') || 154);
                const weightKg = weightLbs * 0.453592;
                estimatedCalories = (met * 3.5 * weightKg / 200) * durationMinutes;
            } else {
                estimatedCalories = durationMinutes * 3;
            }
        } else if (exerciseType === 'Core') {
            estimatedCalories = reps * 0.3;
        } else if (exerciseType === 'Lifting') {
            estimatedCalories = reps * 0.5;
        }

        // Prepare entry data
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const entryData = {
            exercise_name: exerciseName,
            exercise_type: exerciseType,
            reps: exerciseType !== 'Cardio' ? reps : 0,
            duration_minutes: exerciseType === 'Cardio' ? durationMinutes : 0,
            pace: exerciseType === 'Cardio' && pace > 0 ? pace : null,
            estimated_calories_burned: Math.round(estimatedCalories),
            date: currentDate,
            timestamp: Date.now(),
            status: 'completed'
        };

        // Save to database
        ui.showLoading(isEdit ? 'Updating workout...' : 'Saving workout...');

        if (isEdit && existingEntry) {
            entryData.id = existingEntry.id;
            await db.updateWorkout(entryData);
        } else {
            await db.addWorkout(entryData);
        }

        ui.hideLoading();

        // Hide form
        hideWorkoutForm();

        // Reload workout list
        await loadWorkouts();

    } catch (error) {
        console.error('Error saving workout:', error);
        ui.hideLoading();
        ui.showError('Failed to save workout: ' + error.message);
    }
}

/**
 * Load and display workouts for the current date
 */
export async function loadWorkouts() {
    try {
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const allWorkouts = await db.getAllWorkouts();

        // Filter by current date
        const workouts = allWorkouts.filter(w => w.date === currentDate);

        const workoutEntries = document.getElementById('workout-entries');
        if (!workoutEntries) return;

        if (workouts.length === 0) {
            workoutEntries.innerHTML = '<p class="text-muted">No workouts for this day. Log a workout!</p>';
            return;
        }

        // Sort by starred (starred first), then by timestamp (most recent first)
        workouts.sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return b.timestamp - a.timestamp;
        });

        workoutEntries.innerHTML = workouts.slice(0, 20).map(workout => {
            const details = [];
            if (workout.exercise_type === 'Cardio' && workout.duration_minutes > 0) {
                details.push(`${workout.duration_minutes} min${workout.pace ? ` @ ${workout.pace} min/mi` : ''}`);
            } else if (workout.reps > 0) {
                details.push(`${workout.reps} reps`);
            }
            const detailsStr = details.length > 0 ? details.join(' | ') + ' | ' : '';

            return `
            <div class="entry-item" data-id="${workout.id}">
                <div class="entry-item-header">
                    <span class="entry-item-title">${workout.starred ? '⭐ ' : ''}${workout.exercise_name}</span>
                    <div class="entry-item-actions">
                        <button class="btn-star-workout ${workout.starred ? 'starred' : ''}" data-id="${workout.id}" title="${workout.starred ? 'Unstar' : 'Star'}">
                            ${workout.starred ? '⭐' : '☆'}
                        </button>
                        <button class="btn-edit-workout btn-secondary btn-small" data-id="${workout.id}">Edit</button>
                        <button class="btn-delete-workout btn-danger btn-small" data-id="${workout.id}">×</button>
                    </div>
                </div>
                <div class="entry-item-content">
                    <span class="workout-type-badge">${workout.exercise_type || 'Workout'}</span>
                    ${detailsStr}${workout.estimated_calories_burned} cal | ${formatDateTime(workout.timestamp)}
                </div>
            </div>
        `;
        }).join('');

        // Set up edit/delete buttons
        document.querySelectorAll('.btn-edit-workout').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const entry = workouts.find(w => w.id === id);
                if (entry) {
                    showWorkoutForm(entry);
                }
            });
        });

        document.querySelectorAll('.btn-delete-workout').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleDeleteWorkout(id);
            });
        });

        // Set up star buttons
        document.querySelectorAll('.btn-star-workout').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const entry = workouts.find(w => w.id === id);
                if (entry) {
                    entry.starred = !entry.starred;
                    await db.updateWorkout(entry);
                    await loadWorkouts();
                }
            });
        });

    } catch (error) {
        console.error('Error loading workouts:', error);
        const workoutEntries = document.getElementById('workout-entries');
        if (workoutEntries) {
            workoutEntries.innerHTML = '<p class="text-danger">Error loading workouts</p>';
        }
    }
}

/**
 * Handle deleting a workout
 * @param {number} id - Entry ID
 */
async function handleDeleteWorkout(id) {
    ui.confirm(
        'Are you sure you want to delete this workout?',
        async () => {
            try {
                ui.showLoading('Deleting workout...');
                await db.deleteWorkout(id);
                ui.hideLoading();
                await loadWorkouts();
            } catch (error) {
                console.error('Error deleting workout:', error);
                ui.hideLoading();
                ui.showError('Failed to delete workout: ' + error.message);
            }
        }
    );
}
