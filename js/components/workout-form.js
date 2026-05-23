/**
 * Fitness Tracker PWA - Workout Form Component
 * Handles workout logging with dynamic sets and calorie burn estimates
 */

import { db } from '../db.js';

// User's preferred pace unit — loaded from db each time the form opens
let _paceUnit = 'mi';
const KM_PER_MI = 1.60934;

/**
 * Parse the flexible pace/speed/distance text field.
 * Accepts:  8:30  8.5  6.5 mph  10 km/h  5 km  3.1 mi  (and variants)
 * Returns { paceMi } for pace/speed inputs, or { distKm } / { distMi } for distance inputs.
 * paceMi is always in min/mile (storage unit).
 */
function parsePaceInput(raw) {
    const s = (raw || '').trim();
    if (!s) return {};
    const lo = s.toLowerCase();

    // Colon → time format MM:SS or H:MM:SS, interpreted as pace in current unit
    if (s.includes(':')) {
        const parts = s.replace(/[^0-9:]/g, '').split(':');
        let min = 0;
        if (parts.length === 2) min = Number(parts[0]) + Number(parts[1]) / 60;
        else if (parts.length === 3) min = Number(parts[0]) * 60 + Number(parts[1]) + Number(parts[2]) / 60;
        if (!(min > 0)) return {};
        const isKmPace = _paceUnit === 'km' || _paceUnit === 'kmh';
        return { paceMi: isKmPace ? min * KM_PER_MI : min };
    }

    // mph → min/mile
    if (lo.includes('mph')) {
        const v = parseFloat(s);
        return v > 0 ? { paceMi: 60 / v } : {};
    }

    // km/h variants → min/mile
    if (lo.includes('km/h') || lo.includes('km/hr') || /\bkph\b/.test(lo) || /\bkmh\b/.test(lo)) {
        const v = parseFloat(s);
        const mph = v / KM_PER_MI;
        return mph > 0 ? { paceMi: 60 / mph } : {};
    }

    // Distance in km — must have "km" not followed by /h
    if (/\d\s*km\b/.test(lo) && !lo.includes('km/h') && !lo.includes('kmh')) {
        const v = parseFloat(s);
        return v > 0 ? { distKm: v } : {};
    }

    // Distance in miles/mi (but not "min")
    if (/\d\s*mi/.test(lo) && !lo.includes('min')) {
        const v = parseFloat(s);
        return v > 0 ? { distMi: v } : {};
    }

    // Bare number → interpreted in current mode
    const v = parseFloat(s);
    if (!(v > 0)) return {};
    if (_paceUnit === 'km')  return { paceMi: v * KM_PER_MI };
    if (_paceUnit === 'mph') return { paceMi: 60 / v };
    if (_paceUnit === 'kmh') return { paceMi: 60 / (v / KM_PER_MI) };
    return { paceMi: v };
}

/**
 * Parse a duration text field that accepts plain minutes ("30") or MM:SS / H:MM:SS.
 * Returns decimal minutes.
 */
function parseDuration(raw) {
    const s = (raw || '').trim();
    if (!s) return 0;
    if (s.includes(':')) {
        const parts = s.split(':').map(p => Number(p) || 0);
        if (parts.length === 2) return parts[0] + parts[1] / 60;
        if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    }
    return parseFloat(s) || 0;
}

/** Format decimal minutes back to display string (30 → "30", 5.9167 → "5:55"). */
function formatDuration(minutes) {
    if (!(minutes > 0)) return '';
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    if (secs === 0) return String(mins);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Resolve a parsePaceInput result to min/mile, using duration to convert distances. */
function resolvePaceMi(parsed, durationMin) {
    if (parsed.paceMi != null) return parsed.paceMi;
    if (parsed.distKm > 0 && durationMin > 0) return durationMin / (parsed.distKm / KM_PER_MI);
    if (parsed.distMi > 0 && durationMin > 0) return durationMin / parsed.distMi;
    return null;
}

function paceUnitLabel(u) {
    if (u === 'km')  return 'min/km';
    if (u === 'mph') return 'mph';
    if (u === 'kmh') return 'km/h';
    return 'min/mi';
}

function paceUnitNext(u) {
    const cycle = ['mi', 'km', 'mph', 'kmh'];
    return cycle[(cycle.indexOf(u) + 1) % cycle.length];
}

function pacePlaceholder(u) {
    if (u === 'km')  return '5:00 or 5.0, or 5 km';
    if (u === 'mph') return '6.5, or 3.1 mi';
    if (u === 'kmh') return '10.5, or 5 km';
    return '8:30 or 8.5, or 3.1 mi';
}

function paceHelpText(u) {
    if (u === 'km')  return 'min/km (5:00 or 5.0), mph, km/h, or distance (5 km, 3 mi)';
    if (u === 'mph') return 'mph (6.5), min/mi, min/km, or distance (5 km, 3 mi)';
    if (u === 'kmh') return 'km/h (10.5), min/mi, min/km, or distance (5 km, 3 mi)';
    return 'min/mi (8:30 or 8.5), mph, km/h, or distance (5 km, 3 mi)';
}

/** Convert stored min/mile value to display string for the given unit mode. */
function paceToDisplay(paceMi, u) {
    if (!(paceMi > 0)) return '';
    let v;
    if (u === 'km')  v = paceMi / KM_PER_MI;
    else if (u === 'mph') v = 60 / paceMi;
    else if (u === 'kmh') v = (60 / paceMi) * KM_PER_MI;
    else v = paceMi;
    return v.toFixed(4).replace(/\.?0+$/, '');
}
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
export async function showWorkoutForm(existingEntry = null, quickExercise = null) {
    const formContainer = document.getElementById('workout-form-container');
    if (!formContainer) return;

    // Load user's pace unit preference
    _paceUnit = (await db.getSetting('pace_unit')) || 'mi';

    const isEdit = existingEntry !== null;
    const entry = existingEntry || {
        exercise_name: quickExercise || '',
        exercise_type: 'Lifting',
        reps: '',
        duration_minutes: '',
        pace: '',
        date: getTodayDate()
    };

    // Convert stored min/mi pace to display unit for edit mode
    const paceStoredMi = entry.pace || '';
    const paceDisplay = paceStoredMi ? paceToDisplay(paceStoredMi, _paceUnit) : '';

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
                    <label for="duration-minutes">Duration *</label>
                    <input type="text" id="duration-minutes" inputmode="text"
                           placeholder="30 or 5:55"
                           value="${entry.duration_minutes ? formatDuration(entry.duration_minutes) : ''}">
                    <p class="help-text">minutes, or MM:SS / H:MM:SS</p>
                </div>

                <div id="pace-field" class="form-group ${entry.exercise_type === 'Cardio' ? '' : 'hidden'}">
                    <label id="pace-label" for="pace">Pace / Speed / Distance (optional)</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" id="pace" inputmode="text"
                               placeholder="${pacePlaceholder(_paceUnit)}"
                               value="${paceDisplay}" style="flex: 1;">
                        <button type="button" id="pace-unit-toggle" class="btn-secondary btn-small" style="white-space: nowrap;">${paceUnitLabel(_paceUnit)}</button>
                    </div>
                    <p class="help-text" id="pace-help-text">${paceHelpText(_paceUnit)}</p>
                </div>

                <div id="reps-field" class="form-group ${entry.exercise_type !== 'Cardio' ? '' : 'hidden'}">
                    <label for="exercise-reps">Total Reps *</label>
                    <input type="number" id="exercise-reps" step="any" min="0"
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
            const raw = paceInput?.value || '';
            const hasExplicitUnit = /mph|km\/h|km\/hr|kph|kmh|\bkm\b|\bmi\b|\bmiles\b/i.test(raw);
            const newUnit = paceUnitNext(_paceUnit);
            // Convert unit-ambiguous (bare number / colon) values when cycling mode
            if (!hasExplicitUnit && raw.trim()) {
                const parsed = parsePaceInput(raw);
                if (parsed.paceMi > 0 && paceInput) {
                    paceInput.value = paceToDisplay(parsed.paceMi, newUnit);
                }
            }
            _paceUnit = newUnit;
            paceUnitToggle.textContent = paceUnitLabel(_paceUnit);
            const paceEl = document.getElementById('pace');
            if (paceEl) paceEl.placeholder = pacePlaceholder(_paceUnit);
            const help = document.getElementById('pace-help-text');
            if (help) help.textContent = paceHelpText(_paceUnit);
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
    const durationMinutes = parseDuration(document.getElementById('duration-minutes')?.value);
    const reps    = parseInt(document.getElementById('exercise-reps')?.value || 0);
    const paceMi  = resolvePaceMi(parsePaceInput(document.getElementById('pace')?.value || ''), durationMinutes);

    const calories = await computeWorkoutCalories(exerciseType, exerciseName, durationMinutes, reps, paceMi || 0);

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
        const durationMinutes = parseDuration(document.getElementById('duration-minutes')?.value);
        const pace = resolvePaceMi(parsePaceInput(document.getElementById('pace')?.value || ''), durationMinutes);
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
                details.push(`${parseFloat(workout.duration_minutes.toFixed(2))} min${paceStr}`);
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
