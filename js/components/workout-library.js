/**
 * Fitness Tracker PWA - Workout Library Component
 * Shows past workouts + exercise library + templates in a tabbed modal
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
 * Render library items into the exercises tab
 */
async function refreshExercisesTab(modal) {
    const container = modal.querySelector('#tab-exercises');
    if (!container) return;

    // Show past workouts (quick-add) + manage exercise library button
    const uniqueWorkouts = await getUniqueWorkouts();
    const allExercises = await db.getAllExercises();

    let html = '';

    // Exercise library management section
    html += `<div style="padding:8px 0 4px;font-weight:600;font-size:13px;color:var(--text-secondary);">Exercise Library (${allExercises.length})</div>`;
    html += `<div id="lib-exercise-rows">`;
    if (allExercises.length === 0) {
        html += '<p class="text-muted" style="font-size:13px;">No exercises in library yet.</p>';
    } else {
        html += allExercises.map(ex => `
            <div class="workout-library-item">
                <div class="workout-library-item-header">
                    <strong>${ex.name}</strong>
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                        <button class="btn-edit-lib-exercise btn-secondary btn-small" data-id="${ex.id}">Edit</button>
                        <button class="btn-delete-lib-exercise btn-danger btn-small" data-id="${ex.id}">×</button>
                    </div>
                </div>
                <div class="workout-library-item-details">
                    <span class="workout-type-badge">${ex.type}</span>
                    ${ex.default_sets ? ` • ${ex.default_sets}×${ex.default_reps}` : ''}
                    ${ex.default_weight ? ` @ ${ex.default_weight}${ex.default_weight_unit}` : ''}
                </div>
            </div>
        `).join('');
    }
    html += `</div>`;
    html += `<button id="btn-add-lib-exercise" class="btn-secondary" style="width:100%;margin:8px 0;">+ Add Exercise to Library</button>`;

    // Divider
    if (uniqueWorkouts.length > 0) {
        html += `<div style="padding:8px 0 4px;font-weight:600;font-size:13px;color:var(--text-secondary);">Quick-Add Past Workouts</div>`;
        html += `<div class="workout-library-content">`;
        html += uniqueWorkouts.map(w => createWorkoutLibraryItemHTML(w)).join('');
        html += `</div>`;
    }

    container.innerHTML = html;

    // Attach exercise library listeners
    container.querySelector('#btn-add-lib-exercise')?.addEventListener('click', async () => {
        const { showExerciseLibraryModal } = await import('./exercise-library.js');
        await showExerciseLibraryModal();
        await refreshExercisesTab(modal);
    });

    container.querySelectorAll('.btn-edit-lib-exercise').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const ex = await db.getExercise(id);
            if (ex) {
                const { showExerciseLibraryModal } = await import('./exercise-library.js');
                // Open library modal (will allow editing from there)
                await showExerciseLibraryModal();
                await refreshExercisesTab(modal);
            }
        });
    });

    container.querySelectorAll('.btn-delete-lib-exercise').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.confirm('Remove this exercise from the library?', async () => {
                try {
                    await db.deleteExercise(id);
                    await refreshExercisesTab(modal);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });

    // Quick-add listeners
    attachLibraryListeners(modal);
}

/**
 * Render templates tab
 */
async function refreshTemplatesTab(modal) {
    const container = modal.querySelector('#tab-templates');
    if (!container) return;

    const templates = await db.getAllWorkoutTemplates();

    let html = '';
    if (templates.length === 0) {
        html = '<p class="text-muted text-center" style="padding:16px;">No templates yet. Create your first template!</p>';
    } else {
        html = templates.map(t => `
            <div class="workout-library-item" data-id="${t.id}">
                <div class="workout-library-item-header">
                    <strong>${t.name}</strong>
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                        <button class="btn-edit-template btn-secondary btn-small" data-id="${t.id}">Edit</button>
                        <button class="btn-delete-template btn-danger btn-small" data-id="${t.id}">×</button>
                    </div>
                </div>
                <div class="workout-library-item-details">
                    ${t.description ? `<em>${t.description}</em> • ` : ''}
                    ${t.exercises.length} exercise${t.exercises.length !== 1 ? 's' : ''}
                </div>
            </div>
        `).join('');
    }
    html += `<button id="btn-add-template" class="btn-secondary" style="width:100%;margin:8px 0;">+ New Template</button>`;

    container.innerHTML = html;

    container.querySelector('#btn-add-template')?.addEventListener('click', async () => {
        const { showTemplateManager } = await import('./workout-templates.js');
        const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
        await showTemplateManager(currentDate, async () => {
            const { loadWorkouts } = await import('./workout-form.js');
            await loadWorkouts();
            await refreshTemplatesTab(modal);
        });
    });

    container.querySelectorAll('.btn-edit-template').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const { showTemplateManager } = await import('./workout-templates.js');
            const currentDate = window.fitnessApp ? window.fitnessApp.getCurrentDate() : getTodayDate();
            await showTemplateManager(currentDate, async () => {
                const { loadWorkouts } = await import('./workout-form.js');
                await loadWorkouts();
                await refreshTemplatesTab(modal);
            });
        });
    });

    container.querySelectorAll('.btn-delete-template').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.confirm('Delete this template?', async () => {
                try {
                    await db.deleteWorkoutTemplate(id);
                    await refreshTemplatesTab(modal);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });
}

/**
 * Show the workout library modal with tabs
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
            <div class="modal-tabs">
                <button class="modal-tab active" data-tab="exercises">Exercises</button>
                <button class="modal-tab" data-tab="templates">Templates</button>
            </div>
            <div class="modal-body" style="padding-top:0;">
                <div id="tab-exercises"></div>
                <div id="tab-templates" class="hidden"></div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-workout-library').addEventListener('click', () => {
        ui.closeModal(modal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) ui.closeModal(modal);
    });

    // Tab switching
    modal.querySelectorAll('.modal-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            modal.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            modal.querySelector('#tab-exercises').classList.toggle('hidden', tabName !== 'exercises');
            modal.querySelector('#tab-templates').classList.toggle('hidden', tabName !== 'templates');
        });
    });

    await refreshExercisesTab(modal);
    await refreshTemplatesTab(modal);
}

/**
 * Attach event listeners for Add / Edit / Delete buttons on quick-add workout items
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
                    await refreshExercisesTab(modal);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });
}

/**
 * Create HTML for a workout library item (quick-add past workouts)
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
            status: 'completed',
            sets: sourceWorkout.sets ? sourceWorkout.sets.map(s => ({ ...s, checked: false })) : [],
            exercise_id: sourceWorkout.exercise_id || null,
            template_id: null
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
