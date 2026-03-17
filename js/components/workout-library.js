/**
 * Fitness Tracker PWA - Workout Library Component
 * Shows past workouts for quick one-click adding, with edit and delete support
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { getTodayDate } from '../utils/date-utils.js';

/**
 * Deduplicate all workouts by exercise name, keeping most recent of each
 */
async function getUniqueWorkouts() {
    const allWorkouts = await db.getAllWorkouts();
    allWorkouts.sort((a, b) => b.timestamp - a.timestamp);
    const seen = new Set();
    const unique = [];
    for (const w of allWorkouts) {
        if (w.exercise_name && !seen.has(w.exercise_name)) {
            seen.add(w.exercise_name);
            unique.push(w);
        }
    }
    return unique;
}

/**
 * Render library items into the modal body
 */
async function refreshLibraryBody(modal) {
    const uniqueWorkouts = await getUniqueWorkouts();
    const body = modal.querySelector('.modal-body');
    body.innerHTML = uniqueWorkouts.length === 0
        ? `<p class="text-muted text-center">No workouts yet. Log your first workout!</p>`
        : `<div class="workout-library-content">
               ${uniqueWorkouts.map(w => createWorkoutLibraryItemHTML(w)).join('')}
           </div>`;
    attachLibraryListeners(modal);
}

/**
 * Show the workout library modal
 */
export async function showWorkoutLibraryModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'workout-library-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Workout Library</h3>
                <button class="modal-close" id="close-workout-library">&times;</button>
            </div>
            <div class="modal-body"></div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-workout-library').addEventListener('click', () => {
        ui.closeModal(modal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) ui.closeModal(modal);
    });

    await refreshLibraryBody(modal);
}

/**
 * Attach event listeners for Add / Edit / Delete buttons
 */
function attachLibraryListeners(modal) {
    // Add
    modal.querySelectorAll('.btn-add-workout-from-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            await handleAddWorkoutFromLibrary(id);
            ui.closeModal(modal);
        });
    });

    // Edit — close library, open workout form pre-filled
    modal.querySelectorAll('.btn-edit-workout-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const allWorkouts = await db.getAllWorkouts();
            const entry = allWorkouts.find(w => w.id === id);
            if (entry) {
                ui.closeModal(modal);
                const { showWorkoutForm } = await import('./workout-form.js');
                showWorkoutForm(entry);
            }
        });
    });

    // Delete — confirm, remove, refresh list in-place
    modal.querySelectorAll('.btn-delete-workout-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.confirm('Remove this exercise from the library?', async () => {
                try {
                    await db.deleteWorkout(id);
                    await refreshLibraryBody(modal);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });
}

/**
 * Create HTML for a workout library item
 */
function createWorkoutLibraryItemHTML(workout) {
    const typeBadge = workout.exercise_type || 'Workout';
    const name = workout.exercise_name || typeBadge;
    const details = [];

    if (workout.exercise_type === 'Cardio' && workout.duration_minutes > 0) {
        details.push(`${workout.duration_minutes} min${workout.pace ? ` @ ${workout.pace} min/mi` : ''}`);
    } else if (workout.reps > 0) {
        details.push(`${workout.reps} reps`);
    }
    details.push(`${workout.estimated_calories_burned || 0} cal`);

    return `
        <div class="workout-library-item">
            <div class="workout-library-item-header">
                <strong>${name}</strong>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn-add-workout-from-library btn-primary btn-small" data-id="${workout.id}">Add</button>
                    <button class="btn-edit-workout-library btn-secondary btn-small" data-id="${workout.id}">Edit</button>
                    <button class="btn-delete-workout-library btn-danger btn-small" data-id="${workout.id}">×</button>
                </div>
            </div>
            <div class="workout-library-item-details">
                <span class="workout-type-badge">${typeBadge}</span> • ${details.join(' • ')}
            </div>
        </div>
    `;
}

/**
 * Handle adding a workout from the library (duplicates entry to today)
 */
async function handleAddWorkoutFromLibrary(workoutId) {
    try {
        const allWorkouts = await db.getAllWorkouts();
        const sourceWorkout = allWorkouts.find(w => w.id === workoutId);
        if (!sourceWorkout) { ui.showError('Workout not found'); return; }

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        await db.addWorkout({
            exercise_name: sourceWorkout.exercise_name,
            exercise_type: sourceWorkout.exercise_type,
            reps: sourceWorkout.reps || 0,
            duration_minutes: sourceWorkout.duration_minutes || 0,
            pace: sourceWorkout.pace || null,
            estimated_calories_burned: sourceWorkout.estimated_calories_burned || 0,
            date: currentDate,
            timestamp: Date.now(),
            status: 'planned'
        });

        const { loadWorkouts } = await import('./workout-form.js');
        await loadWorkouts();

        if (window.fitnessApp && window.fitnessApp.updateDashboard) {
            await window.fitnessApp.updateDashboard();
        }
    } catch (error) {
        console.error('Error adding workout from library:', error);
        ui.showError('Failed to add workout: ' + error.message);
    }
}
