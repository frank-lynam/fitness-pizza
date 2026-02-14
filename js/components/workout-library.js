/**
 * Fitness Tracker PWA - Workout Library Component
 * Shows past workouts for quick one-click adding
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { getTodayDate } from '../utils/date-utils.js';

/**
 * Show the workout library modal
 */
export async function showWorkoutLibraryModal() {
    const allWorkouts = await db.getAllWorkouts();

    // Dedupe by exercise name - keep most recent of each exercise
    const uniqueWorkouts = [];
    const seenNames = new Set();

    // Sort by timestamp (most recent first)
    allWorkouts.sort((a, b) => b.timestamp - a.timestamp);

    allWorkouts.forEach(w => {
        const key = w.exercise_name;
        if (key && !seenNames.has(key)) {
            seenNames.add(key);
            uniqueWorkouts.push(w);
        }
    });

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'workout-library-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Workout Library</h3>
                <button class="modal-close" id="close-workout-library">&times;</button>
            </div>
            <div class="modal-body">
                ${uniqueWorkouts.length === 0 ? `
                    <p class="text-muted text-center">No workouts yet. Log your first workout!</p>
                ` : `
                    <div class="workout-library-content">
                        ${uniqueWorkouts.map(workout => createWorkoutLibraryItemHTML(workout)).join('')}
                    </div>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('#close-workout-library').addEventListener('click', () => {
        ui.closeModal(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            ui.closeModal(modal);
        }
    });

    // Add workout buttons
    modal.querySelectorAll('.btn-add-workout-from-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const workoutId = parseInt(e.target.dataset.id);
            await handleAddWorkoutFromLibrary(workoutId);
            ui.closeModal(modal);
        });
    });
}

/**
 * Create HTML for a workout library item
 * @param {Object} workout - Workout data
 * @returns {string} HTML string
 */
function createWorkoutLibraryItemHTML(workout) {
    const typeBadge = workout.exercise_type || 'Workout';
    const name = workout.exercise_name || typeBadge;
    const details = [];

    if (workout.exercise_type === 'Cardio' && workout.duration_minutes > 0) {
        details.push(`${workout.duration_minutes} min`);
    } else if (workout.reps > 0) {
        details.push(`${workout.reps} reps`);
    }

    details.push(`${workout.estimated_calories_burned || 0} cal`);

    return `
        <div class="workout-library-item">
            <div class="workout-library-item-header">
                <strong>${name}</strong>
                <button class="btn-add-workout-from-library btn-primary btn-small" data-id="${workout.id}">
                    Add
                </button>
            </div>
            <div class="workout-library-item-details">
                <span class="workout-type-badge">${typeBadge}</span> • ${details.join(' • ')}
            </div>
        </div>
    `;
}

/**
 * Handle adding a workout from the library
 * @param {number} workoutId - ID of workout to duplicate
 */
async function handleAddWorkoutFromLibrary(workoutId) {
    try {
        const workouts = await db.getAllWorkouts();
        const sourceWorkout = workouts.find(w => w.id === workoutId);

        if (!sourceWorkout) {
            ui.showError('Workout not found');
            return;
        }

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();

        // Create new workout with today's date
        const newWorkout = {
            exercise_name: sourceWorkout.exercise_name,
            exercise_type: sourceWorkout.exercise_type,
            reps: sourceWorkout.reps || 0,
            duration_minutes: sourceWorkout.duration_minutes || 0,
            estimated_calories_burned: sourceWorkout.estimated_calories_burned || 0,
            date: currentDate,
            timestamp: Date.now(),
            status: 'completed'
        };

        await db.addWorkout(newWorkout);

        // Reload the workout list
        const { loadWorkouts } = await import('./workout-form.js');
        await loadWorkouts();

        // Update dashboard if on that screen
        if (window.fitnessApp && window.fitnessApp.updateDashboard) {
            await window.fitnessApp.updateDashboard();
        }

    } catch (error) {
        console.error('Error adding workout from library:', error);
        ui.showError('Failed to add workout: ' + error.message);
    }
}
