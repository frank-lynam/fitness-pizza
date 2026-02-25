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
    const btnAddBodyFat = document.getElementById('btn-add-bodyfat');
    const btnEstimateNavy = document.getElementById('btn-estimate-navy');
    const btnEstimateCalipers = document.getElementById('btn-estimate-calipers');

    if (btnAddWeight) {
        btnAddWeight.addEventListener('click', () => showMeasurementForm('weight'));
    }
    if (btnAddWaist) {
        btnAddWaist.addEventListener('click', () => showMeasurementForm('waist'));
    }
    if (btnAddBodyFat) {
        btnAddBodyFat.addEventListener('click', () => showMeasurementForm('body_fat'));
    }
    if (btnEstimateNavy) {
        btnEstimateNavy.addEventListener('click', () => showNavyEstimatorForm());
    }
    if (btnEstimateCalipers) {
        btnEstimateCalipers.addEventListener('click', () => showCaliperEstimatorForm());
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

    const title = type === 'weight' ? 'Weight' : type === 'waist' ? 'Waist' : 'Body Fat %';
    const units = type === 'weight' ? ['lbs', 'kg'] : type === 'waist' ? ['in', 'cm'] : ['%'];
    const placeholder = type === 'weight' ? '150' : type === 'waist' ? '32' : '20';

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

        if (type === 'body_fat') {
            if (isNaN(value) || value <= 0 || value >= 70) {
                showFieldError(document.getElementById('measurement-value'), 'Enter a body fat % between 1 and 70');
                return;
            }
        } else if (!validation.valid) {
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
        const historyList = document.getElementById('measurement-history-list');

        // Render history grouped by date
        if (historyList) {
            if (measurements.length === 0) {
                historyList.innerHTML = '<p class="text-muted">No measurements yet. Add your first measurement!</p>';
            } else {
                const sorted = [...measurements].sort((a, b) => b.timestamp - a.timestamp);

                // Group by date
                const byDate = {};
                for (const m of sorted) {
                    if (!byDate[m.date]) byDate[m.date] = [];
                    byDate[m.date].push(m);
                }

                const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                let html = '';
                for (const date of dates) {
                    html += `<div class="history-date-header" style="font-size:0.85em;color:var(--text-secondary);margin:8px 0 4px;">${date}</div>`;
                    for (const m of byDate[date]) {
                        const time = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        html += `
                            <div class="entry-item" data-id="${m.id}" style="margin-bottom:4px;">
                                <div class="entry-item-header">
                                    <span class="entry-item-title">${m.type}: ${m.value} ${m.unit}</span>
                                    <div class="entry-item-actions">
                                        <span style="font-size:0.8em;color:var(--text-secondary);margin-right:8px;">${time}</span>
                                        <button class="btn-delete btn-danger btn-small history-delete-btn" data-id="${m.id}">×</button>
                                    </div>
                                </div>
                                ${m.notes ? `<div class="entry-item-content" style="font-size:0.85em;color:var(--text-secondary);">${m.notes}</div>` : ''}
                            </div>
                        `;
                    }
                }
                historyList.innerHTML = html;

                // Set up delete buttons in history
                historyList.querySelectorAll('.history-delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = parseInt(e.target.dataset.id);
                        await handleDeleteMeasurement(id);
                    });
                });
            }
        }

        // Keep measurement-entries for backward compat (hidden or empty)
        if (measurementEntries) {
            measurementEntries.innerHTML = '';
        }

        // Set up legacy edit/delete buttons (no longer rendered but kept for safety)
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
        const historyList = document.getElementById('measurement-history-list');
        if (historyList) {
            historyList.innerHTML = '<p class="text-danger">Error loading measurements</p>';
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

/**
 * Show Navy method body fat estimator form.
 * Men:   %BF = 86.010×log10(waist−neck) − 70.041×log10(height) + 36.76
 * Women: %BF = 163.205×log10(waist+hip−neck) − 97.684×log10(height) − 78.387
 * All measurements in inches, height in inches.
 */
async function showNavyEstimatorForm() {
    const formContainer = document.getElementById('measurement-form-container');
    if (!formContainer) return;

    // Pre-fill from Settings body stats and latest saved measurements
    let waistInches = '';
    let waistNote = '';
    let savedHeight = '';
    let savedSex = 'male';
    try {
        const waistMeasurements = await db.getMeasurementsByType('waist');
        if (waistMeasurements.length > 0) {
            waistMeasurements.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = waistMeasurements[0];
            const val = parseFloat(latest.value);
            if (!isNaN(val)) {
                waistInches = latest.unit === 'cm' ? (val * 0.3937).toFixed(1) : val.toString();
                waistNote = ` <span style="font-size:0.8em;color:var(--text-secondary);">(from ${latest.date})</span>`;
            }
        }
        savedHeight = await db.getSetting('user_height_in') || '';
        savedSex    = await db.getSetting('user_sex') || 'male';
    } catch (e) { /* ignore — form still works without pre-fill */ }

    formContainer.innerHTML = `
        <div class="measurement-form-card">
            <div class="form-header">
                <h3>Navy Body Fat Estimator</h3>
                <button id="btn-cancel-bf-estimator" class="btn-secondary btn-small">Cancel</button>
            </div>
            <div class="form-group">
                <label>Sex</label>
                <div style="display:flex;gap:12px;">
                    <label style="display:flex;align-items:center;gap:4px;font-weight:normal;">
                        <input type="radio" name="navy-sex" value="male" ${savedSex !== 'female' ? 'checked' : ''}> Male
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;font-weight:normal;">
                        <input type="radio" name="navy-sex" value="female" ${savedSex === 'female' ? 'checked' : ''}> Female
                    </label>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="navy-height">Height (in)</label>
                    <input type="number" id="navy-height" step="0.1" min="48" max="96" placeholder="70" value="${savedHeight}">
                </div>
                <div class="form-group">
                    <label for="navy-neck">Neck (in)</label>
                    <input type="number" id="navy-neck" step="0.1" min="8" max="24" placeholder="15">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="navy-waist">Waist (in)${waistNote}</label>
                    <input type="number" id="navy-waist" step="0.1" min="20" max="80" placeholder="34" value="${waistInches}">
                </div>
                <div class="form-group" id="navy-hip-group" style="display:none;">
                    <label for="navy-hip">Hip (in) <span style="color:var(--text-secondary);font-size:0.85em;">Women only</span></label>
                    <input type="number" id="navy-hip" step="0.1" min="20" max="80" placeholder="38">
                </div>
            </div>
            <div id="navy-result" style="margin:8px 0;font-size:1.1em;font-weight:600;color:var(--accent-primary);min-height:1.5em;"></div>
            <div class="form-actions">
                <button id="btn-navy-calculate" class="btn-secondary">Calculate</button>
                <button id="btn-navy-save" class="btn-primary" disabled>Save Result</button>
            </div>
        </div>
    `;
    formContainer.classList.remove('hidden');
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.getElementById('btn-cancel-bf-estimator').addEventListener('click', () => {
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
    });

    // Show/hide hip field based on sex (and apply initial state from saved setting)
    const applyNavySexVisibility = () => {
        const isFemale = document.querySelector('input[name="navy-sex"]:checked').value === 'female';
        document.getElementById('navy-hip-group').style.display = isFemale ? '' : 'none';
    };
    document.querySelectorAll('input[name="navy-sex"]').forEach(r => {
        r.addEventListener('change', applyNavySexVisibility);
    });
    applyNavySexVisibility();

    let estimatedBF = null;

    document.getElementById('btn-navy-calculate').addEventListener('click', () => {
        const sex    = document.querySelector('input[name="navy-sex"]:checked').value;
        const height = parseFloat(document.getElementById('navy-height').value);
        const neck   = parseFloat(document.getElementById('navy-neck').value);
        const waist  = parseFloat(document.getElementById('navy-waist').value);
        const hip    = parseFloat(document.getElementById('navy-hip').value) || 0;
        const result = document.getElementById('navy-result');
        const saveBtn = document.getElementById('btn-navy-save');

        if (!height || !neck || !waist || (sex === 'female' && !hip)) {
            result.textContent = 'Please fill in all required fields.';
            result.style.color = 'var(--danger-color)';
            saveBtn.disabled = true;
            return;
        }

        let bf;
        if (sex === 'male') {
            bf = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
        } else {
            bf = 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(height) - 78.387;
        }

        if (isNaN(bf) || bf <= 0 || bf >= 70) {
            result.textContent = 'Invalid inputs — check measurements and try again.';
            result.style.color = 'var(--danger-color)';
            saveBtn.disabled = true;
            return;
        }

        estimatedBF = Math.round(bf * 10) / 10;
        result.textContent = `Estimated body fat: ${estimatedBF}%`;
        result.style.color = 'var(--accent-primary)';
        saveBtn.disabled = false;
    });

    document.getElementById('btn-navy-save').addEventListener('click', async () => {
        if (estimatedBF === null) return;
        await db.addMeasurement({
            type: 'body_fat', value: estimatedBF, unit: '%',
            date: getTodayDate(), notes: 'Navy formula estimate', timestamp: Date.now()
        });
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
        await loadMeasurements();
        ui.showSuccess(`Body fat ${estimatedBF}% saved`);
    });
}

/**
 * Show Jackson-Pollock 3-site caliper estimator form.
 * Men (chest, abdomen, thigh):
 *   D = 1.10938 - 0.0008267×S + 0.0000016×S² - 0.0002574×age
 * Women (tricep, suprailiac, thigh):
 *   D = 1.0994921 - 0.0009929×S + 0.0000023×S² - 0.0001392×age
 * %BF = (495 / D) - 450  (Siri equation)
 * Skinfold measurements in mm.
 */
async function showCaliperEstimatorForm() {
    const formContainer = document.getElementById('measurement-form-container');
    if (!formContainer) return;

    // Pre-fill age and sex from Settings
    let savedAge = '';
    let savedSex = 'male';
    try {
        savedAge = await db.getSetting('user_age') || '';
        savedSex = await db.getSetting('user_sex') || 'male';
    } catch (e) { /* ignore */ }

    formContainer.innerHTML = `
        <div class="measurement-form-card">
            <div class="form-header">
                <h3>Caliper Estimator (Jackson-Pollock 3-site)</h3>
                <button id="btn-cancel-caliper" class="btn-secondary btn-small">Cancel</button>
            </div>
            <div class="form-group">
                <label>Sex</label>
                <div style="display:flex;gap:12px;">
                    <label style="display:flex;align-items:center;gap:4px;font-weight:normal;">
                        <input type="radio" name="caliper-sex" value="male" ${savedSex !== 'female' ? 'checked' : ''}> Male
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;font-weight:normal;">
                        <input type="radio" name="caliper-sex" value="female" ${savedSex === 'female' ? 'checked' : ''}> Female
                    </label>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="caliper-age">Age</label>
                    <input type="number" id="caliper-age" step="1" min="18" max="99" placeholder="30" value="${savedAge}">
                </div>
            </div>
            <div id="caliper-sites-male">
                <div class="form-row">
                    <div class="form-group">
                        <label for="caliper-chest">Chest (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Diagonal pinch, center of pec — halfway between nipple and front armpit crease</p>
                        <input type="number" id="caliper-chest" step="0.5" min="1" max="80" placeholder="10">
                    </div>
                    <div class="form-group">
                        <label for="caliper-abdomen">Abdomen (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Vertical pinch, 1 in (2.5 cm) to the right of the navel</p>
                        <input type="number" id="caliper-abdomen" step="0.5" min="1" max="80" placeholder="15">
                    </div>
                    <div class="form-group">
                        <label for="caliper-thigh-m">Thigh (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Vertical pinch, midpoint of front thigh between hip crease and kneecap</p>
                        <input type="number" id="caliper-thigh-m" step="0.5" min="1" max="80" placeholder="12">
                    </div>
                </div>
            </div>
            <div id="caliper-sites-female" style="display:none;">
                <div class="form-row">
                    <div class="form-group">
                        <label for="caliper-tricep">Tricep (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Vertical pinch, midpoint of back of upper arm — shoulder to elbow, arm hanging relaxed</p>
                        <input type="number" id="caliper-tricep" step="0.5" min="1" max="80" placeholder="15">
                    </div>
                    <div class="form-group">
                        <label for="caliper-suprailiac">Suprailiac (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Diagonal pinch following skin fold, just above the hip bone (iliac crest) at the side</p>
                        <input type="number" id="caliper-suprailiac" step="0.5" min="1" max="80" placeholder="12">
                    </div>
                    <div class="form-group">
                        <label for="caliper-thigh-f">Thigh (mm)</label>
                        <p class="help-text" style="margin:1px 0 4px;font-size:11px;">Vertical pinch, midpoint of front thigh between hip crease and kneecap</p>
                        <input type="number" id="caliper-thigh-f" step="0.5" min="1" max="80" placeholder="20">
                    </div>
                </div>
            </div>
            <div id="caliper-result" style="margin:8px 0;font-size:1.1em;font-weight:600;color:var(--accent-primary);min-height:1.5em;"></div>
            <div class="form-actions">
                <button id="btn-caliper-calculate" class="btn-secondary">Calculate</button>
                <button id="btn-caliper-save" class="btn-primary" disabled>Save Result</button>
            </div>
        </div>
    `;
    formContainer.classList.remove('hidden');
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.getElementById('btn-cancel-caliper').addEventListener('click', () => {
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
    });

    const applyCaliperSexVisibility = () => {
        const isFemale = document.querySelector('input[name="caliper-sex"]:checked').value === 'female';
        document.getElementById('caliper-sites-male').style.display = isFemale ? 'none' : '';
        document.getElementById('caliper-sites-female').style.display = isFemale ? '' : 'none';
    };
    document.querySelectorAll('input[name="caliper-sex"]').forEach(r => {
        r.addEventListener('change', applyCaliperSexVisibility);
    });
    applyCaliperSexVisibility();

    let estimatedBF = null;

    document.getElementById('btn-caliper-calculate').addEventListener('click', () => {
        const sex = document.querySelector('input[name="caliper-sex"]:checked').value;
        const age = parseFloat(document.getElementById('caliper-age').value);
        const result  = document.getElementById('caliper-result');
        const saveBtn = document.getElementById('btn-caliper-save');

        let S, density;
        if (sex === 'male') {
            const chest   = parseFloat(document.getElementById('caliper-chest').value);
            const abdomen = parseFloat(document.getElementById('caliper-abdomen').value);
            const thigh   = parseFloat(document.getElementById('caliper-thigh-m').value);
            S = chest + abdomen + thigh;
            density = 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * age;
        } else {
            const tricep     = parseFloat(document.getElementById('caliper-tricep').value);
            const suprailiac = parseFloat(document.getElementById('caliper-suprailiac').value);
            const thigh      = parseFloat(document.getElementById('caliper-thigh-f').value);
            S = tricep + suprailiac + thigh;
            density = 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * age;
        }

        if (isNaN(S) || isNaN(age) || density <= 0) {
            result.textContent = 'Please fill in all fields.';
            result.style.color = 'var(--danger-color)';
            saveBtn.disabled = true;
            return;
        }

        const bf = (495 / density) - 450;
        if (isNaN(bf) || bf <= 0 || bf >= 70) {
            result.textContent = 'Invalid result — check inputs.';
            result.style.color = 'var(--danger-color)';
            saveBtn.disabled = true;
            return;
        }

        estimatedBF = Math.round(bf * 10) / 10;
        result.textContent = `Estimated body fat: ${estimatedBF}%  (sum of skinfolds: ${S.toFixed(1)} mm)`;
        result.style.color = 'var(--accent-primary)';
        saveBtn.disabled = false;
    });

    document.getElementById('btn-caliper-save').addEventListener('click', async () => {
        if (estimatedBF === null) return;
        await db.addMeasurement({
            type: 'body_fat', value: estimatedBF, unit: '%',
            date: getTodayDate(), notes: 'JP3 caliper estimate', timestamp: Date.now()
        });
        formContainer.classList.add('hidden');
        formContainer.innerHTML = '';
        await loadMeasurements();
        ui.showSuccess(`Body fat ${estimatedBF}% saved`);
    });
}
