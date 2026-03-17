/**
 * Fitness Tracker PWA - Workout Library Component
 * Shows past workouts + exercise library + templates in a tabbed modal
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { getTodayDate } from '../utils/date-utils.js';

/**
 * Render library items into the exercises tab
 */
async function refreshExercisesTab(modal) {
    const container = modal.querySelector('#tab-exercises');
    if (!container) return;

    const allExercises = await db.getAllExercises();

    let html = '';
    html += `<div id="lib-exercise-rows">`;
    if (allExercises.length === 0) {
        html += '<p class="text-muted" style="font-size:13px;padding:8px 0;">No exercises in library yet. Add one to get started!</p>';
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

    container.innerHTML = html;

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

