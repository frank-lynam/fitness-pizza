/**
 * Fitness Tracker PWA - Measurement Form Component
 * Handles weight and waist measurements
 */

import { db } from '../db.js';
import { validateWeight, validateWaist, showFieldError, clearFieldError, clearFormErrors } from '../utils/validation.js';
import * as ui from '../ui.js';
import { formatDate, formatDateTime, getTodayDate } from '../utils/date-utils.js';

/**
 * Initialize the measurement form component
 */
export function initMeasurementForm() {
    const btnAddWeight = document.getElementById('btn-add-weight');
    const btnAddWaist = document.getElementById('btn-add-waist');

    if (btnAddWeight) {
        btnAddWeight.addEventListener('click', () => {
            showMeasurementForm('weight');
        });
    }

    if (btnAddWaist) {
        btnAddWaist.addEventListener('click', () => {
            showMeasurementForm('waist');
        });
    }
}

/**
 * Show the measurement entry form
 * @param {string} type - 'weight' or 'waist'
 * @param {Object} existingEntry - Existing entry to edit (optional)
 */
export function showMeasurementForm(type, existingEntry = null) {
    const formContainer = document.getElementById('measurement-form-container');
    if (!formContainer) return;

    const isEdit = existingEntry !== null;
    const entry = existingEntry || {
        value: '',
        unit: type === 'weight' ? 'lbs' : 'in',
        notes: '',
        date: getTodayDate()
    };

    const title = type === 'weight' ? 'Weight' : 'Waist';
    const units = type === 'weight' ? ['lbs', 'kg'] : ['in', 'cm'];
    const placeholder = type === 'weight' ? '150' : '32';

    formContainer.innerHTML = `
        <div class="measurement-form-card">
            <div class="form-header">
                <h3>${isEdit ? 'Edit' : 'Add'} ${title} Measurement</h3>
                <button id="btn-cancel-measurement" class="btn-secondary btn-small">Cancel</button>
            </div>

            <form id="measurement-entry-form">
                <div class="form-actions" style="margin-bottom: 8px;">
                    <button type="submit" class="btn-primary">
                        ${isEdit ? 'Update' : 'Save'} Measurement
                    </button>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 2;">
                        <label for="measurement-value">${title} *</label>
                        <input type="number" id="measurement-value" step="0.001" min="0" required
                               placeholder="${placeholder}" value="${entry.value}">
                    </div>

                    <div class="form-group" style="flex: 1;">
                        <label for="measurement-unit">Unit</label>
                        <select id="measurement-unit">
                            ${units.map(u => `
                                <option value="${u}" ${entry.unit === u ? 'selected' : ''}>${u}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="measurement-date">Date</label>
                    <input type="date" id="measurement-date" value="${entry.date}" required>
                </div>

                <div class="form-group">
                    <label for="measurement-notes">Notes (optional)</label>
                    <textarea id="measurement-notes" placeholder="e.g., Morning weight, before breakfast"
                    >${entry.notes}</textarea>
                </div>
            </form>
        </div>
    `;

    formContainer.classList.remove('hidden');

    // Set up event listeners
    setupMeasurementFormListeners(type, isEdit, existingEntry);

    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Hide the measurement entry form
 */
export function hideMeasurementForm() {
    const formContainer = document.getElementById('measurement-form-container');
    if (formContainer) {
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
    }
}

/**
 * Set up form event listeners
 * @param {string} type - 'weight' or 'waist'
 * @param {boolean} isEdit - Whether this is an edit operation
 * @param {Object} existingEntry - Existing entry being edited
 */
function setupMeasurementFormListeners(type, isEdit, existingEntry) {
    const form = document.getElementById('measurement-entry-form');
    const cancelBtn = document.getElementById('btn-cancel-measurement');

    // Cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideMeasurementForm();
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleMeasurementFormSubmit(type, isEdit, existingEntry);
        });
    }

    // Clear error on input
    const valueInput = document.getElementById('measurement-value');
    if (valueInput) {
        valueInput.addEventListener('input', () => clearFieldError(valueInput));
    }
}

/**
 * Handle form submission
 * @param {string} type - 'weight' or 'waist'
 * @param {boolean} isEdit - Whether this is an edit operation
 * @param {Object} existingEntry - Existing entry being edited
 */
async function handleMeasurementFormSubmit(type, isEdit, existingEntry) {
    try {
        // Clear previous errors
        const form = document.getElementById('measurement-entry-form');
        clearFormErrors(form);

        // Get form values
        const value = parseFloat(document.getElementById('measurement-value').value);
        const unit = document.getElementById('measurement-unit').value;
        const date = document.getElementById('measurement-date').value;
        const notes = document.getElementById('measurement-notes').value.trim();

        // Validate value
        const validation = type === 'weight' ?
            validateWeight(value, unit) :
            validateWaist(value, unit);

        if (!validation.valid) {
            const input = document.getElementById('measurement-value');
            showFieldError(input, validation.error);
            return;
        }

        // Prepare entry data
        const entryData = {
            type,
            value,
            unit,
            date,
            notes,
            timestamp: Date.now()
        };

        // Save to database
        ui.showLoading(isEdit ? 'Updating measurement...' : 'Saving measurement...');

        if (isEdit && existingEntry) {
            // Update existing entry
            entryData.id = existingEntry.id;
            await db.updateMeasurement(entryData);
        } else {
            // Add new entry
            await db.addMeasurement(entryData);
        }

        ui.hideLoading();

        // Hide form
        hideMeasurementForm();

        // Reload measurements list
        await loadMeasurements();

    } catch (error) {
        console.error('Error saving measurement:', error);
        ui.hideLoading();
        ui.showError('Failed to save measurement: ' + error.message);
    }
}

/**
 * Load and display measurements
 */
export async function loadMeasurements() {
    try {
        const measurements = await db.getAllMeasurements();

        const measurementEntries = document.getElementById('measurement-entries');
        if (!measurementEntries) return;

        if (measurements.length === 0) {
            measurementEntries.innerHTML = '<p class="text-muted">No measurements yet. Add your first measurement!</p>';
            return;
        }

        // Sort by timestamp (most recent first)
        measurements.sort((a, b) => b.timestamp - a.timestamp);

        // Group by type
        const weights = measurements.filter(m => m.type === 'weight');
        const waists = measurements.filter(m => m.type === 'waist');

        let html = '';

        if (weights.length > 0) {
            html += weights.slice(0, 10).map(m => createMeasurementHTML(m)).join('');
        }

        if (waists.length > 0) {
            html += waists.slice(0, 10).map(m => createMeasurementHTML(m)).join('');
        }

        measurementEntries.innerHTML = html;

        // Set up edit/delete buttons
        document.querySelectorAll('.btn-edit-measurement').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const entry = measurements.find(m => m.id === id);
                if (entry) {
                    showMeasurementForm(entry.type, entry);
                }
            });
        });

        document.querySelectorAll('.btn-delete-measurement').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                await handleDeleteMeasurement(id);
            });
        });

    } catch (error) {
        console.error('Error loading measurements:', error);
        const measurementEntries = document.getElementById('measurement-entries');
        if (measurementEntries) {
            measurementEntries.innerHTML = '<p class="text-danger">Error loading measurements</p>';
        }
    }
}

/**
 * Create HTML for a measurement entry
 * @param {Object} measurement - Measurement entry
 * @returns {string} HTML string
 */
function createMeasurementHTML(measurement) {
    return `
        <div class="entry-item" data-id="${measurement.id}">
            <div class="entry-item-header">
                <span class="entry-item-title">${measurement.type}: ${measurement.value} ${measurement.unit}</span>
                <div class="entry-item-actions">
                    <button class="btn-edit-measurement btn-secondary btn-small" data-id="${measurement.id}">Edit</button>
                    <button class="btn-delete-measurement btn-danger btn-small" data-id="${measurement.id}">×</button>
                </div>
            </div>
            <div class="entry-item-content">
                <span class="entry-item-time">${formatDateTime(measurement.timestamp)}</span>
            </div>
        </div>
    `;
}

/**
 * Handle deleting a measurement
 * @param {number} id - Entry ID
 */
async function handleDeleteMeasurement(id) {
    ui.confirm(
        'Are you sure you want to delete this measurement?',
        async () => {
            try {
                ui.showLoading('Deleting measurement...');
                await db.deleteMeasurement(id);
                ui.hideLoading();
                await loadMeasurements();
            } catch (error) {
                console.error('Error deleting measurement:', error);
                ui.hideLoading();
                ui.showError('Failed to delete measurement: ' + error.message);
            }
        }
    );
}
