/**
 * Fitness Tracker PWA - Workout Form Component
 * Handles workout logging with dynamic sets and calorie burn estimates
 */

import { db } from '../db.js';

// User's preferred pace unit — loaded from db each time the form opens
let _paceUnit = 'mi';
const KM_PER_MI = 1.60934;
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
export async function showWorkoutForm(existingEntry = null, quickExercise = null, prefill = null) {
    const formContainer = document.getElementById('workout-form-container');
    if (!formContainer) return;

    // Load user's pace unit preference
    _paceUnit = (await db.getSetting('pace_unit')) || 'mi';

    const isEdit = existingEntry !== null;
    const entry = existingEntry || {
        exercise_name: quickExercise || (prefill?.exercise_name || ''),
        exercise_type: prefill?.exercise_type || 'Lifting',
        reps: '',
        duration_minutes: prefill?.duration_minutes || '',
        pace: prefill?.pace || '',
        date: getTodayDate()
    };

    // Convert stored min/mi pace to display unit
    const paceStoredMi = entry.pace || '';
    const paceDisplay = paceStoredMi && _paceUnit === 'km'
        ? Math.round((paceStoredMi / KM_PER_MI) * 10) / 10
        : paceStoredMi;

    // GPS distance banner (only when coming from run tracker)
    const distanceKm = !isEdit && prefill?.distance_km > 0 ? prefill.distance_km : null;
    const distanceBanner = distanceKm ? `
        <div style="background:var(--accent-primary-dim,rgba(99,102,241,.15));border:1px solid var(--accent-primary);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:13px;color:var(--accent-primary);display:flex;align-items:center;gap:6px;">
            <span>📍</span>
            <span>GPS tracked: <strong>${distanceKm.toFixed(2)} km</strong> (${(distanceKm / 1.60934).toFixed(2)} mi)</span>
            <input type="hidden" id="run-distance-km" value="${distanceKm}">
        </div>` : '';

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

                ${distanceBanner}

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
                    <input type="number" id="duration-minutes" step="0.1" min="0.1"
                           placeholder="30" value="${entry.duration_minutes || ''}">
                </div>

                <div id="pace-field" class="form-group ${entry.exercise_type === 'Cardio' ? '' : 'hidden'}">
                    <label id="pace-label" for="pace">Pace (min/${_paceUnit}, optional)</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="pace" step="0.1" min="0"
                               placeholder="${_paceUnit === 'km' ? '5.0' : '8.5'}" value="${paceDisplay}" style="flex: 1;">
                        <button type="button" id="pace-unit-toggle" class="btn-secondary btn-small" style="white-space: nowrap;">${_paceUnit === 'km' ? 'min/km' : 'min/mi'}</button>
                    </div>
                    <p class="help-text" id="pace-help-text">Average pace in minutes per ${_paceUnit === 'km' ? 'kilometer' : 'mile'}</p>
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
 */
function setupWorkoutFormListeners(isEdit, existingEntry) {
    const form = document.getElementById('workout-entry-form');
    const cancelBtn = document.getElementById('btn-cancel-workout');
    const exerciseTypeSelect = document.getElementById('exercise-type');
    const cardioField = document.getElementById('cardio-field');
    const paceField = document.getElementById('pace-field');
    const repsField = document.getElementById('reps-field');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideWorkoutForm();
        });
    }

    if (exerciseTypeSelect) {
        exerciseTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            cardioField.classList.toggle('hidden', type !== 'Cardio');
            if (paceField) paceField.classList.toggle('hidden', type !== 'Cardio');
            repsField.classList.toggle('hidden', type === 'Cardio');
            updateEstimatedCalories();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleWorkoutFormSubmit(isEdit, existingEntry);
        });
    }

    const exerciseInput = document.getElementById('exercise-name');
    const durationInput = document.getElementById('duration-minutes');
    const repsInput = document.getElementById('exercise-reps');
    const paceInput = document.getElementById('pace');

    if (exerciseInput) {
        exerciseInput.addEventListener('input', () => { updateEstimatedCalories(); });
        exerciseInput.addEventListener('input', () => clearFieldError(exerciseInput));
    }
    if (durationInput) durationInput.addEventListener('input', updateEstimatedCalories);
    if (repsInput) repsInput.addEventListener('input', updateEstimatedCalories);
    if (paceInput) paceInput.addEventListener('input', updateEstimatedCalories);

    const paceUnitToggle = document.getElementById('pace-unit-toggle');
    if (paceUnitToggle) {
        paceUnitToggle.addEventListener('click', async () => {
            const currentPace = parseFloat(paceInput?.value || 0);
            if (_paceUnit === 'mi') {
                _paceUnit = 'km';
                if (currentPace > 0 && paceInput) paceInput.value = Math.round((currentPace / KM_PER_MI) * 10) / 10;
            } else {
                _paceUnit = 'mi';
                if (currentPace > 0 && paceInput) paceInput.value = Math.round((currentPace * KM_PER_MI) * 10) / 10;
            }
            paceUnitToggle.textContent = _paceUnit === 'km' ? 'min/km' : 'min/mi';
            const label = document.getElementById('pace-label');
            if (label) label.textContent = `Pace (min/${_paceUnit}, optional)`;
            const help = document.getElementById('pace-help-text');
            if (help) help.textContent = `Average pace in minutes per ${_paceUnit === 'km' ? 'kilometer' : 'mile'}`;
            await db.setSetting('pace_unit', _paceUnit);
            await updateEstimatedCalories();
        });
    }
}

/**
 * Shared calorie computation — single source of truth for preview and save.
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
        return reps * 0.5;
    }
}

/**
 * Update the estimated calories display
 */
async function updateEstimatedCalories() {
    const exerciseType = document.getElementById('exercise-type')?.value || 'Lifting';
    const exerciseName = document.getElementById('exercise-name')?.value || '';
    const durationMinutes = parseFloat(document.getElementById('duration-minutes')?.value || 0);
    const reps = parseInt(document.getElementById('exercise-reps')?.value || 0);
    const paceRaw = parseFloat(document.getElementById('pace')?.value || 0);
    const paceMi = paceRaw > 0 && _paceUnit === 'km' ? paceRaw * KM_PER_MI : paceRaw;

    const calories = await computeWorkoutCalories(exerciseType, exerciseName, durationMinutes, reps, paceMi);

    const caloriesDisplay = document.getElementById('estimated-calories');
    if (caloriesDisplay) {
        caloriesDisplay.textContent = `${Math.round(calories)} cal`;
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
        const durationMinutes = parseFloat(document.getElementById('duration-minutes')?.value || 0);
        const paceRaw = parseFloat(document.getElementById('pace')?.value || 0);
        const pace = paceRaw > 0 && _paceUnit === 'km' ? paceRaw * KM_PER_MI : paceRaw; // always store as min/mi
        const reps = parseInt(document.getElementById('exercise-reps')?.value || 0);

        if (!exerciseName) {
            showFieldError(document.getElementById('exercise-name'), 'Exercise name is required');
            return;
        }
        if (exerciseType === 'Cardio' && !durationMinutes) {
            showFieldError(document.getElementById('duration-minutes'), 'Duration is required for cardio');
            return;
        }
        if (exerciseType !== 'Cardio' && !reps) {
            showFieldError(document.getElementById('exercise-reps'), 'Reps are required');
            return;
        }

        const estimatedCalories = await computeWorkoutCalories(exerciseType, exerciseName, durationMinutes, reps, pace);

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const distKmEl = document.getElementById('run-distance-km');
        const entryData = {
            exercise_name: exerciseName,
            exercise_type: exerciseType,
            reps: exerciseType !== 'Cardio' ? reps : 0,
            duration_minutes: exerciseType === 'Cardio' ? durationMinutes : 0,
            pace: exerciseType === 'Cardio' && pace > 0 ? pace : null,
            estimated_calories_burned: Math.round(estimatedCalories),
            date: currentDate,
            timestamp: Date.now(),
            status: isEdit ? (existingEntry.status || 'completed') : 'planned',
            ...(distKmEl ? { distance_km: parseFloat(distKmEl.value) } : {}),
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
 * Toggle completion status for a workout entry
 */
async function handleToggleCompletion(id, completed) {
    try {
        const entry = await db.get('workouts', id);
        if (!entry) return;
        entry.status = completed ? 'completed' : 'planned';
        await db.updateWorkout(entry);
        await loadWorkouts();
    } catch (error) {
        console.error('Error toggling completion:', error);
        ui.showError('Failed to update status: ' + error.message);
    }
}

/**
 * Load and display workouts for the current date
 */
export async function loadWorkouts() {
    try {
        _paceUnit = (await db.getSetting('pace_unit')) || 'mi';
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const allWorkouts = await db.getAllWorkouts();
        const workouts = allWorkouts.filter(w => w.date === currentDate);

        const workoutEntries = document.getElementById('workout-entries');
        if (!workoutEntries) return;

        if (workouts.length === 0) {
            workoutEntries.innerHTML = '<p class="text-muted">No workouts for this day. Log a workout!</p>';
            return;
        }

        workouts.sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return b.timestamp - a.timestamp;
        });

        workoutEntries.innerHTML = workouts.slice(0, 20).map(workout => {
            const isCompleted = workout.status !== 'planned';
            const details = [];
            if (workout.exercise_type === 'Cardio' && workout.duration_minutes > 0) {
                let paceStr = '';
                if (workout.pace) {
                    const displayPace = _paceUnit === 'km'
                        ? Math.round((workout.pace / KM_PER_MI) * 10) / 10
                        : workout.pace;
                    paceStr = ` @ ${displayPace} min/${_paceUnit}`;
                }
                const distStr = workout.distance_km > 0
                    ? ` · ${workout.distance_km.toFixed(2)} km`
                    : '';
                details.push(`${workout.duration_minutes} min${paceStr}${distStr}`);
            } else if (workout.reps > 0) {
                details.push(`${workout.reps} reps`);
            }
            const detailsStr = details.length > 0 ? details.join(' | ') + ' | ' : '';

            return `
            <div class="entry-item ${isCompleted ? '' : 'entry-planned'}" data-id="${workout.id}">
                <div class="entry-item-header">
                    <label class="checkbox-inline">
                        <input type="checkbox" class="workout-checkbox" data-id="${workout.id}"
                               ${isCompleted ? 'checked' : ''}>
                    </label>
                    <span class="entry-item-title ${isCompleted ? '' : 'entry-title-planned'}">${workout.starred ? '⭐ ' : ''}${workout.exercise_name}</span>
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

        // Completion checkboxes
        document.querySelectorAll('.workout-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleToggleCompletion(id, e.target.checked);
            });
        });

        document.querySelectorAll('.btn-edit-workout').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const entry = workouts.find(w => w.id === id);
                if (entry) showWorkoutForm(entry);
            });
        });

        document.querySelectorAll('.btn-delete-workout').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleDeleteWorkout(id);
            });
        });

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
