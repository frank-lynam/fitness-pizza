/**
 * Fitness Tracker PWA - Workout Templates Component
 * Create and apply workout templates
 */

import { db } from '../db.js';
import * as ui from '../ui.js';
import { pickExerciseFromLibrary } from './exercise-library.js';
import { getTodayDate } from '../utils/date-utils.js';

/**
 * Show template manager modal with Apply / Edit / Delete per template
 * @param {string} date - Current date string YYYY-MM-DD
 * @param {Function} onApply - Callback to refresh workout list after applying
 */
export async function showTemplateManager(date, onApply) {
    const modal = ui.createModal('Workout Templates', '<div id="template-manager-list">Loading...</div>', []);

    const footer = modal.querySelector('.modal-footer');
    const newBtn = document.createElement('button');
    newBtn.textContent = '+ New Template';
    newBtn.className = 'btn-primary';
    newBtn.onclick = async () => {
        await showTemplateForm(null, () => refreshTemplateList(modal, date, onApply));
    };
    footer.appendChild(newBtn);

    await refreshTemplateList(modal, date, onApply);
}

/**
 * Refresh the template list inside the manager modal
 */
async function refreshTemplateList(modal, date, onApply) {
    const listEl = modal.querySelector('#template-manager-list');
    if (!listEl) return;

    const templates = await db.getAllWorkoutTemplates();
    if (templates.length === 0) {
        listEl.innerHTML = '<p class="text-muted text-center">No templates yet. Create your first template!</p>';
        return;
    }

    listEl.innerHTML = templates.map(t => `
        <div class="workout-library-item" data-id="${t.id}">
            <div class="workout-library-item-header">
                <strong>${t.name}</strong>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn-apply-template btn-primary btn-small" data-id="${t.id}">Apply</button>
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

    listEl.querySelectorAll('.btn-apply-template').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.closeModal(modal);
            await applyTemplateToDay(id, date || getTodayDate(), onApply);
        });
    });

    listEl.querySelectorAll('.btn-edit-template').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const t = await db.getWorkoutTemplate(id);
            if (t) await showTemplateForm(t, () => refreshTemplateList(modal, date, onApply));
        });
    });

    listEl.querySelectorAll('.btn-delete-template').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.confirm('Delete this template?', async () => {
                try {
                    await db.deleteWorkoutTemplate(id);
                    await refreshTemplateList(modal, date, onApply);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });
}

/**
 * Apply a template to a given date — adds one workout entry per template exercise
 * @param {number} templateId
 * @param {string} date
 * @param {Function|null} onDone - Callback after workouts are added
 */
export async function applyTemplateToDay(templateId, date, onDone = null) {
    const template = await db.getWorkoutTemplate(templateId);
    if (!template) { ui.showError('Template not found'); return; }

    async function doApply() {
        try {
            ui.showLoading('Applying template...');
            for (const ex of template.exercises) {
                const sets = [];
                const numSets = ex.target_sets || 3;
                for (let i = 0; i < numSets; i++) {
                    sets.push({
                        set_number: i + 1,
                        reps: ex.target_reps || 0,
                        weight: ex.target_weight || 0,
                        weight_unit: ex.target_weight_unit || 'lbs',
                        duration_minutes: ex.target_duration_minutes || 0,
                        pace: ex.target_pace || null,
                        checked: false,
                        notes: ''
                    });
                }
                await db.addWorkout({
                    date,
                    exercise_name: ex.exercise_name,
                    exercise_type: ex.exercise_type || 'Lifting',
                    exercise_id: ex.exercise_id || null,
                    template_id: templateId,
                    sets,
                    reps: (ex.target_reps || 0) * numSets,
                    duration_minutes: ex.target_duration_minutes || 0,
                    estimated_calories_burned: 0,
                    status: 'planned'
                });
            }
            ui.hideLoading();
            if (onDone) onDone();
        } catch (err) {
            ui.hideLoading();
            ui.showError('Failed to apply template: ' + err.message);
        }
    }

    // Check if day already has workouts
    const existing = await db.getWorkoutsByDate(date);
    if (existing.length > 0) {
        ui.confirm(
            `${existing.length} workout(s) already logged for this day. Add template on top?`,
            doApply
        );
    } else {
        await doApply();
    }
}

/**
 * Show the template create/edit form
 * @param {Object|null} existing - Existing template to edit, or null for new
 * @param {Function} onSave - Callback after save
 */
async function showTemplateForm(existing = null, onSave = null) {
    const isEdit = existing !== null;
    const tmpl = existing || { name: '', description: '', exercises: [] };

    // We use a mutable exercises array
    let exerciseRows = (tmpl.exercises || []).map(ex => ({ ...ex }));

    function renderExerciseRows() {
        const container = document.getElementById('template-exercise-rows');
        if (!container) return;

        if (exerciseRows.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px 0;">No exercises added yet.</p>';
            return;
        }

        container.innerHTML = exerciseRows.map((ex, idx) => `
            <div class="template-exercise-row" data-idx="${idx}">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:14px;">${ex.exercise_name || 'Unknown'}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        <span class="workout-type-badge">${ex.exercise_type || 'Lifting'}</span>
                    </div>
                </div>
                <div class="template-exercise-defaults">
                    <input type="number" class="ex-sets" data-idx="${idx}" value="${ex.target_sets || 3}" min="1" step="1" placeholder="Sets" title="Sets">
                    <input type="number" class="ex-reps" data-idx="${idx}" value="${ex.target_reps || 10}" min="0" step="1" placeholder="Reps" title="Reps">
                    <input type="number" class="ex-weight" data-idx="${idx}" value="${ex.target_weight || 0}" min="0" step="0.5" placeholder="Wt" title="Weight">
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                    <button type="button" class="btn-secondary btn-small btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="btn-secondary btn-small btn-move-down" data-idx="${idx}" ${idx === exerciseRows.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
                <button type="button" class="btn-danger btn-small btn-remove-ex" data-idx="${idx}">×</button>
            </div>
        `).join('');

        // Wire reorder/remove
        container.querySelectorAll('.btn-move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.dataset.idx);
                if (i > 0) {
                    [exerciseRows[i - 1], exerciseRows[i]] = [exerciseRows[i], exerciseRows[i - 1]];
                    renderExerciseRows();
                }
            });
        });
        container.querySelectorAll('.btn-move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.dataset.idx);
                if (i < exerciseRows.length - 1) {
                    [exerciseRows[i], exerciseRows[i + 1]] = [exerciseRows[i + 1], exerciseRows[i]];
                    renderExerciseRows();
                }
            });
        });
        container.querySelectorAll('.btn-remove-ex').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.dataset.idx);
                exerciseRows.splice(i, 1);
                renderExerciseRows();
            });
        });
    }

    function collectExerciseRowValues() {
        const container = document.getElementById('template-exercise-rows');
        if (!container) return;
        container.querySelectorAll('.template-exercise-row').forEach(row => {
            const idx = parseInt(row.dataset.idx);
            if (exerciseRows[idx]) {
                exerciseRows[idx].target_sets = parseInt(row.querySelector('.ex-sets').value) || 3;
                exerciseRows[idx].target_reps = parseInt(row.querySelector('.ex-reps').value) || 0;
                exerciseRows[idx].target_weight = parseFloat(row.querySelector('.ex-weight').value) || 0;
            }
        });
    }

    const formModal = ui.createModal(isEdit ? 'Edit Template' : 'New Template', `
        <form id="template-form">
            <div class="form-group">
                <label for="tmpl-name">Template Name *</label>
                <input type="text" id="tmpl-name" value="${tmpl.name}" placeholder="e.g., Push Day" required>
            </div>
            <div class="form-group">
                <label for="tmpl-desc">Description</label>
                <input type="text" id="tmpl-desc" value="${tmpl.description || ''}" placeholder="Optional description">
            </div>
            <div style="margin:12px 0 4px;font-weight:600;">Exercises</div>
            <div id="template-exercise-rows"></div>
            <button type="button" id="btn-add-template-exercise" class="btn-secondary" style="margin-top:8px;width:100%;">+ Add Exercise</button>
        </form>
    `, [
        { text: 'Cancel', className: 'btn-secondary', onClick: null }
    ]);

    // Add Save button manually to control close on validation failure
    const tmplFooter = formModal.querySelector('.modal-footer');
    const tmplSaveBtn = document.createElement('button');
    tmplSaveBtn.textContent = isEdit ? 'Update' : 'Save';
    tmplSaveBtn.className = 'btn-primary';
    tmplSaveBtn.addEventListener('click', async () => {
        const name = formModal.querySelector('#tmpl-name').value.trim();
        if (!name) { ui.showError('Template name is required'); return; }
        collectExerciseRowValues();
        const data = {
            name,
            description: formModal.querySelector('#tmpl-desc').value.trim(),
            exercises: exerciseRows.map((ex, i) => ({ ...ex, order: i }))
        };
        try {
            if (isEdit) {
                data.id = existing.id;
                await db.updateWorkoutTemplate(data);
            } else {
                await db.addWorkoutTemplate(data);
            }
            ui.closeModal(formModal);
            if (onSave) await onSave();
        } catch (err) {
            ui.showError('Failed to save template: ' + err.message);
        }
    });
    tmplFooter.appendChild(tmplSaveBtn);

    // Initial render
    renderExerciseRows();

    // Wire "Add Exercise" button
    const addExBtn = formModal.querySelector('#btn-add-template-exercise');
    if (addExBtn) {
        addExBtn.addEventListener('click', () => {
            collectExerciseRowValues();
            pickExerciseFromLibrary((ex) => {
                if (ex) {
                    exerciseRows.push({
                        exercise_id: ex.id,
                        exercise_name: ex.name,
                        exercise_type: ex.type,
                        order: exerciseRows.length,
                        target_sets: ex.default_sets || 3,
                        target_reps: ex.default_reps || 10,
                        target_weight: ex.default_weight || 0,
                        target_weight_unit: ex.default_weight_unit || 'lbs',
                        target_duration_minutes: 0,
                        target_pace: null
                    });
                } else {
                    // Ad-hoc exercise
                    const name = prompt('Exercise name:');
                    if (name) {
                        exerciseRows.push({
                            exercise_id: null,
                            exercise_name: name,
                            exercise_type: 'Lifting',
                            order: exerciseRows.length,
                            target_sets: 3,
                            target_reps: 10,
                            target_weight: 0,
                            target_weight_unit: 'lbs',
                            target_duration_minutes: 0,
                            target_pace: null
                        });
                    }
                }
                renderExerciseRows();
            });
        });
    }
}
