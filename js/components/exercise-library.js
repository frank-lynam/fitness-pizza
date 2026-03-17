/**
 * Fitness Tracker PWA - Exercise Library Component
 * Manage and pick exercises from the library
 */

import { db } from '../db.js';
import * as ui from '../ui.js';

/**
 * Show the exercise library management modal (standalone view)
 */
export async function showExerciseLibraryModal() {
    const modal = ui.createModal('Exercise Library', '<div id="exercise-library-list">Loading...</div>', []);

    // Add "Add Exercise" button to footer
    const footer = modal.querySelector('.modal-footer');
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Exercise';
    addBtn.className = 'btn-primary';
    addBtn.onclick = async () => {
        await showExerciseForm(null, () => refreshExerciseList(modal));
    };
    footer.appendChild(addBtn);

    await refreshExerciseList(modal);
}

/**
 * Refresh the exercise list inside the manage modal
 */
async function refreshExerciseList(modal) {
    const listEl = modal.querySelector('#exercise-library-list');
    if (!listEl) return;

    const exercises = await db.getAllExercises();
    if (exercises.length === 0) {
        listEl.innerHTML = '<p class="text-muted text-center">No exercises yet. Add your first exercise!</p>';
        return;
    }

    listEl.innerHTML = exercises.map(ex => `
        <div class="workout-library-item" data-id="${ex.id}">
            <div class="workout-library-item-header">
                <strong>${ex.name}</strong>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn-edit-exercise btn-secondary btn-small" data-id="${ex.id}">Edit</button>
                    <button class="btn-delete-exercise btn-danger btn-small" data-id="${ex.id}">×</button>
                </div>
            </div>
            <div class="workout-library-item-details">
                <span class="workout-type-badge">${ex.type}</span>
                ${ex.default_sets ? ` • ${ex.default_sets}×${ex.default_reps}` : ''}
                ${ex.default_weight ? ` @ ${ex.default_weight}${ex.default_weight_unit}` : ''}
                ${ex.notes ? ` • ${ex.notes}` : ''}
            </div>
        </div>
    `).join('');

    // Attach listeners
    listEl.querySelectorAll('.btn-edit-exercise').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            const ex = await db.getExercise(id);
            if (ex) await showExerciseForm(ex, () => refreshExerciseList(modal));
        });
    });

    listEl.querySelectorAll('.btn-delete-exercise').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = parseInt(e.currentTarget.dataset.id);
            ui.confirm('Delete this exercise from the library?', async () => {
                try {
                    await db.deleteExercise(id);
                    await refreshExerciseList(modal);
                } catch (err) {
                    ui.showError('Failed to delete: ' + err.message);
                }
            });
        });
    });
}

/**
 * Show a picker modal for selecting an exercise
 * @param {Function} onSelect - Callback called with the selected exercise object
 */
export async function pickExerciseFromLibrary(onSelect) {
    let currentFilter = 'All';
    let searchQuery = '';

    const modal = ui.createModal('Pick Exercise', `
        <div>
            <input type="text" id="exercise-search" placeholder="Search exercises..." style="width:100%;margin-bottom:8px;">
            <div class="exercise-type-tabs">
                <button class="btn-secondary btn-small active-filter" data-filter="All">All</button>
                <button class="btn-secondary btn-small" data-filter="Lifting">Lifting</button>
                <button class="btn-secondary btn-small" data-filter="Cardio">Cardio</button>
                <button class="btn-secondary btn-small" data-filter="Core">Core</button>
            </div>
            <div id="exercise-picker-list"></div>
        </div>
    `, []);

    // Add "Ad-hoc" footer button
    const footer = modal.querySelector('.modal-footer');
    const adHocBtn = document.createElement('button');
    adHocBtn.textContent = '+ Ad-hoc (custom)';
    adHocBtn.className = 'btn-secondary';
    adHocBtn.onclick = () => {
        ui.closeModal(modal);
        onSelect(null); // null signals ad-hoc entry
    };
    footer.appendChild(adHocBtn);

    async function refreshPickerList() {
        const listEl = modal.querySelector('#exercise-picker-list');
        if (!listEl) return;

        let exercises = await db.getAllExercises();
        if (currentFilter !== 'All') {
            exercises = exercises.filter(ex => ex.type === currentFilter);
        }
        if (searchQuery) {
            exercises = exercises.filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        if (exercises.length === 0) {
            listEl.innerHTML = '<p class="text-muted text-center" style="padding:16px;">No exercises found.</p>';
            return;
        }

        listEl.innerHTML = exercises.map(ex => `
            <div class="exercise-picker-item" data-id="${ex.id}" style="cursor:pointer;">
                <div>
                    <strong>${ex.name}</strong>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        <span class="workout-type-badge">${ex.type}</span>
                        ${ex.default_sets ? ` ${ex.default_sets}×${ex.default_reps}` : ''}
                        ${ex.default_weight ? ` @ ${ex.default_weight}${ex.default_weight_unit}` : ''}
                    </div>
                </div>
                <button class="btn-primary btn-small btn-pick-exercise" data-id="${ex.id}">Select</button>
            </div>
        `).join('');

        listEl.querySelectorAll('.btn-pick-exercise').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const ex = await db.getExercise(id);
                ui.closeModal(modal);
                if (ex) onSelect(ex);
            });
        });
    }

    // Search listener
    const searchInput = modal.querySelector('#exercise-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            refreshPickerList();
        });
    }

    // Filter tab listeners
    modal.querySelectorAll('.exercise-type-tabs button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentFilter = e.currentTarget.dataset.filter;
            modal.querySelectorAll('.exercise-type-tabs button').forEach(b => b.classList.remove('active-filter'));
            e.currentTarget.classList.add('active-filter');
            refreshPickerList();
        });
    });

    await refreshPickerList();
}

/**
 * Show add/edit form for an exercise
 * @param {Object|null} existing - Existing exercise to edit, or null to add
 * @param {Function} onSave - Callback after save
 */
export async function showExerciseForm(existing = null, onSave = null) {
    const isEdit = existing !== null;
    const ex = existing || { name: '', type: 'Lifting', default_sets: 3, default_reps: 10, default_weight: 0, default_weight_unit: 'lbs', default_calories: 0, notes: '' };

    const formModal = ui.createModal(isEdit ? 'Edit Exercise' : 'Add Exercise', `
        <form id="exercise-form">
            <div class="form-group">
                <label for="ex-name">Name *</label>
                <input type="text" id="ex-name" value="${ex.name}" placeholder="e.g., Squat" required>
            </div>
            <div class="form-group">
                <label for="ex-type">Type *</label>
                <select id="ex-type">
                    <option value="Lifting" ${ex.type === 'Lifting' ? 'selected' : ''}>Lifting</option>
                    <option value="Cardio" ${ex.type === 'Cardio' ? 'selected' : ''}>Cardio</option>
                    <option value="Core" ${ex.type === 'Core' ? 'selected' : ''}>Core</option>
                </select>
            </div>
            <div class="form-group">
                <label for="ex-sets">Default Sets</label>
                <input type="number" id="ex-sets" value="${ex.default_sets || 3}" min="1" step="1">
            </div>
            <div class="form-group">
                <label for="ex-reps">Default Reps</label>
                <input type="number" id="ex-reps" value="${ex.default_reps || 10}" min="1" step="1">
            </div>
            <div class="form-group">
                <label for="ex-weight">Default Weight</label>
                <div style="display:flex;gap:8px;">
                    <input type="number" id="ex-weight" value="${ex.default_weight || 0}" min="0" step="0.5" style="flex:1;">
                    <select id="ex-weight-unit" style="width:70px;">
                        <option value="lbs" ${ex.default_weight_unit === 'lbs' ? 'selected' : ''}>lbs</option>
                        <option value="kg" ${ex.default_weight_unit === 'kg' ? 'selected' : ''}>kg</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label for="ex-calories">Default Calories Burned</label>
                <input type="number" id="ex-calories" value="${ex.default_calories || 0}" min="0" step="1">
            </div>
            <div class="form-group">
                <label for="ex-notes">Notes</label>
                <input type="text" id="ex-notes" value="${ex.notes || ''}" placeholder="Optional notes">
            </div>
        </form>
    `, [
        { text: 'Cancel', className: 'btn-secondary', onClick: null }
    ]);

    // Add Save button manually so we can control close on validation failure
    const footer = formModal.querySelector('.modal-footer');
    const saveBtn = document.createElement('button');
    saveBtn.textContent = isEdit ? 'Update' : 'Save';
    saveBtn.className = 'btn-primary';
    saveBtn.addEventListener('click', async () => {
        const name = formModal.querySelector('#ex-name').value.trim();
        if (!name) { ui.showError('Name is required'); return; }
        const data = {
            name,
            type: formModal.querySelector('#ex-type').value,
            default_sets: parseInt(formModal.querySelector('#ex-sets').value) || 3,
            default_reps: parseInt(formModal.querySelector('#ex-reps').value) || 10,
            default_weight: parseFloat(formModal.querySelector('#ex-weight').value) || 0,
            default_weight_unit: formModal.querySelector('#ex-weight-unit').value,
            default_calories: parseInt(formModal.querySelector('#ex-calories').value) || 0,
            notes: formModal.querySelector('#ex-notes').value.trim()
        };
        try {
            if (isEdit) {
                data.id = existing.id;
                await db.updateExercise(data);
            } else {
                await db.addExercise(data);
            }
            ui.closeModal(formModal);
            if (onSave) await onSave();
        } catch (err) {
            ui.showError('Failed to save exercise: ' + err.message);
        }
    });
    footer.appendChild(saveBtn);
}
