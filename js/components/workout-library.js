/**
 * Fitness Tracker PWA - Workout Library Component
 * Shows past workouts for quick one-click adding, with starring, edit and delete support
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { getTodayDate } from '../utils/date-utils.js';

async function getStarredExercises() {
    const raw = await db.getSetting('starred_exercises');
    return new Set(raw ? JSON.parse(raw) : []);
}

async function toggleStarExercise(name) {
    const starred = await getStarredExercises();
    if (starred.has(name)) starred.delete(name);
    else starred.add(name);
    await db.setSetting('starred_exercises', JSON.stringify([...starred]));
}

async function getUniqueWorkouts() {
    const allWorkouts = await db.getAllWorkouts();
    const starred = await getStarredExercises();
    allWorkouts.sort((a, b) => b.timestamp - a.timestamp);
    const seen = new Set();
    const unique = [];
    for (const w of allWorkouts) {
        if (w.exercise_name && !seen.has(w.exercise_name)) {
            seen.add(w.exercise_name);
            unique.push({ ...w, _starred: starred.has(w.exercise_name) });
        }
    }
    unique.sort((a, b) => (b._starred ? 1 : 0) - (a._starred ? 1 : 0));
    return unique;
}

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

function attachLibraryListeners(modal) {
    // Add — stays open, shows undo toast
    modal.querySelectorAll('.btn-add-workout-from-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            await handleAddWorkoutFromLibrary(id);
        });
    });

    // Star toggle
    modal.querySelectorAll('.btn-star-workout').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const name = e.currentTarget.dataset.name;
            await toggleStarExercise(name);
            await refreshLibraryBody(modal);
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

    // Delete — immediate with undo toast
    modal.querySelectorAll('.btn-delete-workout-library').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const allWorkouts = await db.getAllWorkouts();
            const entry = allWorkouts.find(w => w.id === id);
            if (!entry) return;
            try {
                await db.deleteWorkout(id);
                await refreshLibraryBody(modal);
                ui.showUndoToast('Workout removed from library', async () => {
                    const { id: _id, ...restoreData } = entry;
                    await db.addWorkout(restoreData);
                    await refreshLibraryBody(modal);
                });
            } catch (err) {
                ui.showError('Failed to delete: ' + err.message);
            }
        });
    });
}

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
                <strong>${workout._starred ? '⭐ ' : ''}${name}</strong>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn-star-workout btn-small ${workout._starred ? 'starred' : ''}"
                            data-name="${name}" title="${workout._starred ? 'Unstar' : 'Star'}"
                            style="padding:0 8px;">
                        ${workout._starred ? '⭐' : '☆'}
                    </button>
                    <button class="btn-add-workout-from-library btn-primary btn-small"
                            data-id="${workout.id}" style="min-width:72px;">Add</button>
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

async function handleAddWorkoutFromLibrary(workoutId) {
    try {
        const allWorkouts = await db.getAllWorkouts();
        const sourceWorkout = allWorkouts.find(w => w.id === workoutId);
        if (!sourceWorkout) { ui.showError('Workout not found'); return; }

        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        const newId = await db.addWorkout({
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
        window.dispatchEvent(new CustomEvent('fp:data-changed'));

        ui.showAddToast(`Added ${sourceWorkout.exercise_name}`, async () => {
            await db.deleteWorkout(newId);
            await loadWorkouts();
            window.dispatchEvent(new CustomEvent('fp:data-changed'));
        });
    } catch (error) {
        console.error('Error adding workout from library:', error);
        ui.showError('Failed to add workout: ' + error.message);
    }
}
