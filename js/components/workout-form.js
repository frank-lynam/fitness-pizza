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
    const btnApplyTemplate = document.getElementById('btn-apply-template');

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

    if (btnApplyTemplate) {
        btnApplyTemplate.addEventListener('click', async () => {
            const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
            const { showTemplateManager } = await import('./workout-templates.js');
            showTemplateManager(currentDate, () => loadWorkouts());
        });
    }

    // Quick exercise buttons
    document.querySelectorAll('.btn-quick-exercise').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const exerciseName = e.target.dataset.exercise;
            showWorkoutForm(null, exerciseName);
        });
    });

    // Delegated event listener on #workout-entries
    const workoutEntries = document.getElementById('workout-entries');
    if (workoutEntries) {
        workoutEntries.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.classList.contains('btn-check-set')) {
                const workoutId = parseInt(target.dataset.workoutId);
                const setIndex = parseInt(target.dataset.setIndex);
                await handleCheckSet(workoutId, setIndex);
            } else if (target.classList.contains('btn-edit-workout')) {
                const id = parseInt(target.dataset.id);
                const workout = await db.get('workouts', id);
                if (workout) showWorkoutForm(workout);
            } else if (target.classList.contains('btn-delete-workout')) {
                const id = parseInt(target.dataset.id);
                await handleDeleteWorkout(id);
            } else if (target.classList.contains('btn-star-workout')) {
                const id = parseInt(target.dataset.id);
                const workout = await db.get('workouts', id);
                if (workout) {
                    workout.starred = !workout.starred;
                    await db.updateWorkout(workout);
                    await loadWorkouts();
                }
            }
        });
    }
}

/**
 * Render sets table for a workout with checked state
 * @param {Object} workout
 * @returns {string} HTML string
 */
function renderSetsTable(workout) {
    const sets = workout.sets || [];
    const checkedCount = sets.filter(s => s.checked).length;
    const isCardio = workout.exercise_type === 'Cardio';

    return `
        <div class="sets-checklist">
            ${sets.map((set, i) => `
                <div class="set-checklist-row ${set.checked ? 'set-checked' : ''}">
                    <button class="btn-check-set ${set.checked ? 'checked' : ''}"
                        data-workout-id="${workout.id}" data-set-index="${i}"
                        title="${set.checked ? 'Uncheck' : 'Check off'}">
                        ${set.checked ? '✓' : ''}
                    </button>
                    <span class="set-detail">
                        Set ${set.set_number || (i + 1)}:
                        ${isCardio
                            ? `${set.duration_minutes || 0} min${set.pace ? ` @ ${set.pace} min/mi` : ''}`
                            : `${set.reps || 0} reps${set.weight ? ` × ${set.weight}${set.weight_unit || 'lbs'}` : ''}`
                        }
                    </span>
                </div>
            `).join('')}
        </div>
        <div class="sets-progress">${checkedCount}/${sets.length} sets</div>
    `;
}

/**
 * Render a single workout entry card
 * @param {Object} workout
 * @returns {string} HTML string
 */
function renderWorkoutEntry(workout) {
    const hasSets = workout.sets && workout.sets.length > 0;
    let detailsContent;

    if (hasSets) {
        detailsContent = renderSetsTable(workout);
    } else {
        // Legacy flat display
        const details = [];
        if (workout.exercise_type === 'Cardio' && workout.duration_minutes > 0) {
            details.push(`${workout.duration_minutes} min${workout.pace ? ` @ ${workout.pace} min/mi` : ''}`);
        } else if (workout.reps > 0) {
            details.push(`${workout.reps} reps`);
        }
        const detailsStr = details.length > 0 ? details.join(' | ') + ' | ' : '';
        detailsContent = `<span>${detailsStr}${workout.estimated_calories_burned} cal | ${formatDateTime(workout.timestamp)}</span>`;
    }

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
                ${hasSets ? '' : ` ${workout.estimated_calories_burned} cal | ${formatDateTime(workout.timestamp)}`}
            </div>
            ${detailsContent}
            ${hasSets ? `<div style="font-size:11px;color:var(--text-secondary);">${workout.estimated_calories_burned} cal | ${formatDateTime(workout.timestamp)}</div>` : ''}
        </div>
    `;
}

/**
 * Toggle checked state for a single set and re-render only that card
 * @param {number} workoutId
 * @param {number} setIndex
 */
async function handleCheckSet(workoutId, setIndex) {
    try {
        const workout = await db.get('workouts', workoutId);
        if (!workout || !workout.sets) return;
        workout.sets[setIndex].checked = !workout.sets[setIndex].checked;
        await db.updateWorkout(workout);

        // Re-render only this entry card
        const card = document.querySelector(`#workout-entries .entry-item[data-id="${workoutId}"]`);
        if (card) {
            const newCard = document.createElement('div');
            newCard.innerHTML = renderWorkoutEntry(workout);
            card.replaceWith(newCard.firstElementChild);
        }
    } catch (err) {
        console.error('Error toggling set:', err);
        ui.showError('Failed to update set: ' + err.message);
    }
}

/**
 * Create HTML for a set row in the add/edit form
 * @param {Object} set - Set data
 * @param {number} index - Set index
 * @param {string} exerciseType - 'Cardio' | 'Core' | 'Lifting'
 * @returns {string} HTML string
 */
function createSetHTML(set, index, exerciseType) {
    const isCardio = exerciseType === 'Cardio';
    return `
        <div class="set-row" data-set-index="${index}">
            <div class="set-number">Set ${index + 1}</div>
            <div class="set-inputs">
                ${isCardio ? `
                    <input type="number" class="set-duration" placeholder="Min" step="1" min="0"
                           value="${set.duration_minutes || ''}" data-set-index="${index}" title="Duration (minutes)">
                    <input type="number" class="set-pace" placeholder="Pace" step="0.1" min="0"
                           value="${set.pace || ''}" data-set-index="${index}" title="Pace (min/mile)">
                ` : `
                    <input type="number" class="set-reps" placeholder="Reps" step="1" min="1"
                           value="${set.reps || ''}" data-set-index="${index}">
                    <input type="number" class="set-weight" placeholder="Weight" step="0.5" min="0"
                           value="${set.weight || ''}" data-set-index="${index}">
                    <select class="set-unit" data-set-index="${index}">
                        <option value="lbs" ${(set.weight_unit || set.unit || 'lbs') === 'lbs' ? 'selected' : ''}>lbs</option>
                        <option value="kg" ${(set.weight_unit || set.unit) === 'kg' ? 'selected' : ''}>kg</option>
                    </select>
                `}
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
        sets: [],
        date: getTodayDate()
    };

    // Build initial sets rows HTML
    const currentType = entry.exercise_type || 'Lifting';
    const initialSets = (entry.sets && entry.sets.length > 0)
        ? entry.sets
        : [{ reps: '', weight: '', weight_unit: 'lbs', duration_minutes: '', pace: '' }];
    const setsHTML = initialSets.map((s, i) => createSetHTML(s, i, currentType)).join('');

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
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="exercise-name" placeholder="e.g., Squat, Running, Planks"
                               value="${entry.exercise_name}" required style="flex:1;">
                        <button type="button" id="btn-from-library" class="btn-secondary btn-small">From Library</button>
                    </div>
                </div>

                <div class="form-group">
                    <label for="exercise-type">Exercise Type *</label>
                    <select id="exercise-type" required>
                        <option value="Cardio" ${currentType === 'Cardio' ? 'selected' : ''}>Cardio</option>
                        <option value="Core" ${currentType === 'Core' ? 'selected' : ''}>Core</option>
                        <option value="Lifting" ${currentType === 'Lifting' ? 'selected' : ''}>Lifting</option>
                    </select>
                </div>

                <div class="sets-container">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                        <label>Sets</label>
                        <button type="button" id="btn-add-set" class="btn-secondary btn-small">+ Add Set</button>
                    </div>
                    <div id="sets-list">
                        ${setsHTML}
                    </div>
                </div>

                <div class="form-group">
                    <label for="calories-input">Calories Burned</label>
                    <input type="number" id="calories-input" placeholder="Estimated calories" min="0" step="1" value="0" style="width:100%;">
                </div>
            </form>
        </div>
    `;

    formContainer.classList.remove('hidden');

    // Set up event listeners
    setupWorkoutFormListeners(isEdit, existingEntry);
    setupSetListeners();

    // Calculate initial calories
    updateEstimatedCalories();

    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const fromLibraryBtn = document.getElementById('btn-from-library');
    const addSetBtn = document.getElementById('btn-add-set');

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideWorkoutForm();
        });
    }

    // Exercise type change — regenerate all set rows for new type
    if (exerciseTypeSelect) {
        exerciseTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            const setsList = document.getElementById('sets-list');
            if (setsList) {
                const currentRows = setsList.querySelectorAll('.set-row');
                const count = currentRows.length || 1;
                const emptySet = { reps: '', weight: '', weight_unit: 'lbs', duration_minutes: '', pace: '' };
                let newHTML = '';
                for (let i = 0; i < count; i++) {
                    newHTML += createSetHTML(emptySet, i, type);
                }
                setsList.innerHTML = newHTML;
                setupSetListeners();
            }
            updateEstimatedCalories();
        });
    }

    // From Library button
    if (fromLibraryBtn) {
        fromLibraryBtn.addEventListener('click', async () => {
            const { pickExerciseFromLibrary } = await import('./exercise-library.js');
            pickExerciseFromLibrary((ex) => {
                if (!ex) return; // Ad-hoc: user types manually
                const nameInput = document.getElementById('exercise-name');
                const typeSelect = document.getElementById('exercise-type');
                if (nameInput) nameInput.value = ex.name;
                if (typeSelect) {
                    typeSelect.value = ex.type;
                    // Regenerate sets based on defaults
                    const setsList = document.getElementById('sets-list');
                    if (setsList) {
                        let newHTML = '';
                        for (let i = 0; i < (ex.default_sets || 3); i++) {
                            newHTML += createSetHTML({
                                reps: ex.default_reps || '',
                                weight: ex.default_weight || '',
                                weight_unit: ex.default_weight_unit || 'lbs',
                                duration_minutes: '',
                                pace: ''
                            }, i, ex.type);
                        }
                        setsList.innerHTML = newHTML;
                        setupSetListeners();
                    }
                }
                updateEstimatedCalories();
            });
        });
    }

    // Add Set button
    if (addSetBtn) {
        addSetBtn.addEventListener('click', () => {
            const setsList = document.getElementById('sets-list');
            if (!setsList) return;
            const currentCount = setsList.querySelectorAll('.set-row').length;
            const type = document.getElementById('exercise-type')?.value || 'Lifting';
            const newRow = document.createElement('div');
            newRow.innerHTML = createSetHTML({ reps: '', weight: '', weight_unit: 'lbs', duration_minutes: '', pace: '' }, currentCount, type);
            setsList.appendChild(newRow.firstElementChild);
            setupSetListeners();
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
    if (exerciseInput) {
        exerciseInput.addEventListener('input', () => { updateEstimatedCalories(); });
        exerciseInput.addEventListener('input', () => clearFieldError(exerciseInput));
    }
}

/**
 * Set up listeners for set inputs
 */
function setupSetListeners() {
    // Remove set buttons
    document.querySelectorAll('.btn-remove-set').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.setIndex);
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
    document.querySelectorAll('.set-reps, .set-weight, .set-duration, .set-pace').forEach(input => {
        input.addEventListener('input', updateEstimatedCalories);
    });
}

/**
 * Shared calorie computation used by both the preview display and form submit.
 */
async function computeWorkoutCalories(exerciseType, exerciseName, durationMinutes, reps, pace) {
    if (exerciseType === 'Cardio') {
        const allMeasurements = await db.getAllMeasurements();
        const lastWeight = allMeasurements
            .filter(m => m.type === 'weight')
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        const weightLbs = lastWeight
            ? (lastWeight.unit === 'kg' ? lastWeight.value * 2.20462 : lastWeight.value)
            : 154;
        if (pace > 0 && durationMinutes > 0) {
            const speedMph = 60 / pace;
            const met = Math.min(20, Math.max(3.5, 1.5 * speedMph + 1.0));
            const weightKg = weightLbs * 0.453592;
            return (met * 3.5 * weightKg / 200) * durationMinutes;
        } else if (durationMinutes > 0) {
            return estimateWorkoutCalories(exerciseName, durationMinutes, [], weightLbs);
        }
        return 0;
    } else if (exerciseType === 'Core') {
        return reps * 0.3;
    } else {
        // Lifting
        return reps * 0.5;
    }
}

/**
 * Update the estimated calories display
 */
async function updateEstimatedCalories() {
    const exerciseType = document.getElementById('exercise-type')?.value || 'Lifting';
    const exerciseName = document.getElementById('exercise-name')?.value || '';

    // Collect from set rows
    let totalReps = 0;
    let totalDuration = 0;
    let totalPace = 0;
    let paceCount = 0;

    document.querySelectorAll('.set-row').forEach(row => {
        const repsEl = row.querySelector('.set-reps');
        const durationEl = row.querySelector('.set-duration');
        const paceEl = row.querySelector('.set-pace');
        if (repsEl) totalReps += parseInt(repsEl.value || 0);
        if (durationEl) totalDuration += parseInt(durationEl.value || 0);
        if (paceEl && paceEl.value) { totalPace += parseFloat(paceEl.value); paceCount++; }
    });
    const avgPace = paceCount > 0 ? totalPace / paceCount : 0;

    const calories = await computeWorkoutCalories(exerciseType, exerciseName, totalDuration, totalReps, avgPace);

    const caloriesInput = document.getElementById('calories-input');
    if (caloriesInput) {
        caloriesInput.value = Math.round(calories);
    }
}

/**
 * Handle form submission
 */
async function handleWorkoutFormSubmit(isEdit, existingEntry) {
    try {
        const form = document.getElementById('workout-entry-form');
        clearFormErrors(form);

        const exerciseName = document.getElementById('exercise-name').value.trim();
        const exerciseType = document.getElementById('exercise-type').value;

        // Validate
        if (!exerciseName) {
            const input = document.getElementById('exercise-name');
            showFieldError(input, 'Exercise name is required');
            return;
        }

        // Collect sets from set rows
        const sets = [];
        document.querySelectorAll('.set-row').forEach((row, i) => {
            const repsEl = row.querySelector('.set-reps');
            const weightEl = row.querySelector('.set-weight');
            const unitEl = row.querySelector('.set-unit');
            const durationEl = row.querySelector('.set-duration');
            const paceEl = row.querySelector('.set-pace');

            sets.push({
                set_number: i + 1,
                reps: repsEl ? (parseInt(repsEl.value) || 0) : 0,
                weight: weightEl ? (parseFloat(weightEl.value) || 0) : 0,
                weight_unit: unitEl ? unitEl.value : 'lbs',
                duration_minutes: durationEl ? (parseInt(durationEl.value) || 0) : 0,
                pace: paceEl ? (parseFloat(paceEl.value) || null) : null,
                checked: false,
                notes: ''
            });
        });

        // Compute totals from sets for legacy fields + calorie calc
        const totalReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0);
        const totalDuration = sets.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
        const paceSamples = sets.map(s => s.pace).filter(p => p != null && p > 0);
        const avgPace = paceSamples.length > 0 ? paceSamples.reduce((a, b) => a + b, 0) / paceSamples.length : 0;

        // Validate required fields based on type (only if no sets filled)
        if (exerciseType === 'Cardio' && totalDuration === 0) {
            const durationInput = sets[0] ? null : document.getElementById('duration-minutes');
            if (durationInput) showFieldError(durationInput, 'Duration is required for cardio');
            else if (sets.length > 0) { /* allow sets to handle it */ }
        }

        const caloriesInputEl = document.getElementById('calories-input');
        const estimatedCalories = caloriesInputEl ? (parseInt(caloriesInputEl.value) || 0) : await computeWorkoutCalories(exerciseType, exerciseName, totalDuration, totalReps, avgPace);

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const entryData = {
            exercise_name: exerciseName,
            exercise_type: exerciseType,
            reps: totalReps,
            duration_minutes: totalDuration,
            pace: avgPace > 0 ? avgPace : null,
            estimated_calories_burned: Math.round(estimatedCalories),
            date: currentDate,
            timestamp: Date.now(),
            status: 'completed',
            sets,
            exercise_id: existingEntry ? (existingEntry.exercise_id || null) : null,
            template_id: existingEntry ? (existingEntry.template_id || null) : null
        };

        ui.showLoading(isEdit ? 'Updating workout...' : 'Saving workout...');

        if (isEdit && existingEntry) {
            entryData.id = existingEntry.id;
            await db.updateWorkout(entryData);
        } else {
            await db.addWorkout(entryData);
        }

        ui.hideLoading();
        hideWorkoutForm();
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
        const workouts = await db.getWorkoutsByDate(currentDate);

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

        workoutEntries.innerHTML = workouts.slice(0, 20).map(workout => renderWorkoutEntry(workout)).join('');

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
