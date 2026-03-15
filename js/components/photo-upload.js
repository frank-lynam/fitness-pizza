/**
 * Fitness Tracker PWA - Photo Upload Component
 * Handles photo capture/upload and macro estimation
 */

import { estimateMacrosFromPhoto, estimateMacrosFromLabel } from '../api.js';
import * as ui from '../ui.js';
import { showMacroForm } from './macro-form.js';
import { db } from '../db.js';
import { calculateMacroCalories } from '../utils/calorie-calc.js';

/**
 * Show photo upload modal
 */
export function showPhotoUploadModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'photo-upload-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>📸 Estimate Macros from Photo</h3>
                <button class="modal-close" id="close-photo-upload">&times;</button>
            </div>
            <div class="modal-body">
                <div class="photo-upload-options">
                    <input type="file" id="photo-input" accept="image/*" capture="environment" style="display: none;">
                    <button id="btn-take-photo" class="btn-primary btn-large">
                        📷 Take Photo
                    </button>
                    <button id="btn-choose-photo" class="btn-secondary btn-large">
                        🖼️ Choose from Gallery
                    </button>
                    <input type="file" id="label-input" accept="image/*" style="display: none;">
                    <button id="btn-take-label-photo" class="btn-secondary btn-large">📋 Take Label Photo</button>
                    <button id="btn-scan-label" class="btn-secondary btn-large">🖼️ Label from Gallery</button>
                </div>

                <div id="photo-preview" class="photo-preview hidden">
                    <img id="preview-image" alt="Food preview">
                    <div class="form-group" style="margin-top: 12px;">
                        <input type="text" id="food-context" placeholder="Add context (optional, e.g., 'restaurant meal', 'homemade')" style="width: 100%;">
                        <p class="help-text" style="margin-top: 4px; font-size: 13px;">Adding context helps improve macro estimation accuracy</p>
                    </div>
                    <div class="photo-actions">
                        <button id="btn-analyze-photo" class="btn-primary">Analyze Photo</button>
                        <button id="btn-cancel-photo" class="btn-secondary">Cancel</button>
                    </div>
                </div>

                <div id="analysis-result" class="analysis-result hidden">
                    <h4>Estimated Macros:</h4>
                    <div id="macro-estimates"></div>
                    <p class="help-text">Review and edit these estimates before saving</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    setupPhotoUploadListeners(modal);
}

/**
 * Show a full-screen loading overlay with spinner and cancel button.
 * Returns the overlay element; caller removes it when done.
 * @param {Function} onCancel - Called when the user taps Cancel
 */
function showAnalysisLoadingModal(onCancel) {
    if (!document.getElementById('spinner-keyframes')) {
        const style = document.createElement('style');
        style.id = 'spinner-keyframes';
        style.textContent = '@keyframes fp-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'analysis-loading-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:var(--bg-secondary);border-radius:var(--radius-lg);padding:32px 28px;text-align:center;max-width:280px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <div style="width:48px;height:48px;border:4px solid var(--bg-tertiary);border-top-color:var(--accent-primary);border-radius:50%;animation:fp-spin 0.8s linear infinite;margin:0 auto 18px;"></div>
            <p style="color:var(--text-primary);font-size:15px;font-weight:600;margin:0 0 6px;">Analyzing photo…</p>
            <p style="color:var(--text-secondary);font-size:13px;margin:0 0 22px;">Sending to AI · this may take a few seconds</p>
            <button id="btn-cancel-analysis" style="background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:8px 24px;font-size:14px;cursor:pointer;">Cancel</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#btn-cancel-analysis').addEventListener('click', onCancel);
    return overlay;
}

/**
 * Run photo analysis and handle success/failure.
 * Extracted so the retry modal can call it with the same data.
 * @param {string} imageData - base64 data-URL of the image
 * @param {string} context   - optional text context from the user
 */
async function runPhotoAnalysis(imageData, context) {
    let cancelled = false;
    const loadingOverlay = showAnalysisLoadingModal(() => {
        cancelled = true;
        loadingOverlay.remove();
    });

    try {
        const estimates = await estimateMacrosFromPhoto(imageData, context);
        loadingOverlay.remove();
        if (cancelled) return;
        showMacroForm({ ...estimates, status: 'completed' });
    } catch (error) {
        loadingOverlay.remove();
        if (cancelled) return;
        console.error('Analysis error:', error);
        showPhotoRetryModal(error.message, imageData, context);
    }
}

/**
 * Show an error modal that lets the user retry the same photo analysis.
 * @param {string} errorMessage - Human-readable error from the API
 * @param {string} imageData    - base64 data-URL kept for retry
 * @param {string} context      - optional text context kept for retry
 */
function showPhotoRetryModal(errorMessage, imageData, context) {
    ui.createModal('Analysis Failed', `
        <p style="margin-bottom:10px;color:var(--text-primary);">${errorMessage}</p>
        <p style="font-size:13px;color:var(--text-secondary);">Would you like to retry with the same photo?</p>
    `, [
        {
            text: 'Retry',
            className: 'btn-primary',
            onClick: () => runPhotoAnalysis(imageData, context)
        },
        {
            text: 'Cancel',
            className: 'btn-secondary'
        }
    ]);
}

/**
 * Run label analysis and handle success/failure.
 * @param {string} imageData - base64 data-URL of the label image
 */
async function runLabelAnalysis(imageData) {
    let cancelled = false;
    const loadingOverlay = showAnalysisLoadingModal(() => {
        cancelled = true;
        loadingOverlay.remove();
    });

    try {
        const result = await estimateMacrosFromLabel(imageData);
        loadingOverlay.remove();
        if (cancelled) return;

        if (result.is_per_100g) {
            showGramsPrompt(result);
        } else {
            showLabelReviewModal(result);
        }
    } catch (error) {
        loadingOverlay.remove();
        if (cancelled) return;
        console.error('Label analysis error:', error);
        showLabelRetryModal(error.message, imageData);
    }
}

/**
 * Show a prompt asking how many grams the user ate, for per-100g labels.
 * Scales all macros by grams/100 before calling showMacroForm.
 * @param {Object} labelResult - Result from estimateMacrosFromLabel
 */
function showGramsPrompt(labelResult) {
    const defaultGrams = labelResult.serving_size_grams || 100;
    ui.createModal('How many grams did you eat?', `
        <p style="margin-bottom:10px;color:var(--text-secondary);font-size:13px;">
            This label shows per-100g values. Enter the amount you ate to scale the macros.
        </p>
        <div class="form-group">
            <label>Grams eaten</label>
            <input type="number" id="grams-eaten-input" min="1" max="9999" step="1"
                value="${defaultGrams}" style="width:100%;">
        </div>
    `, [
        {
            text: 'Confirm',
            className: 'btn-primary',
            onClick: () => {
                const gramsInput = document.getElementById('grams-eaten-input');
                const grams = parseFloat(gramsInput ? gramsInput.value : defaultGrams) || defaultGrams;
                const factor = grams / 100;
                const servingNote = `${grams}g of ${labelResult.product_name}`;
                showMacroForm({
                    meal_name: labelResult.product_name,
                    protein: Math.round(labelResult.protein * factor * 10) / 10,
                    carbs: Math.round(labelResult.carbs * factor * 10) / 10,
                    fat: Math.round(labelResult.fat * factor * 10) / 10,
                    fiber: Math.round(labelResult.fiber * factor * 10) / 10,
                    notes: servingNote,
                    status: 'completed',
                    ai_estimated: true
                });
            }
        },
        {
            text: 'Cancel',
            className: 'btn-secondary'
        }
    ]);
}

/**
 * Show a review modal for a per-serving label scan result, with a checkbox to
 * normalise the values to per-100g and save to the food library.
 * @param {Object} result - Result from estimateMacrosFromLabel
 */
function showLabelReviewModal(result) {
    const hasServingGrams = result.serving_size_grams && result.serving_size_grams > 0;
    const servingNote = result.serving_size ? `Serving size: ${result.serving_size}` : 'Serving size not detected';
    const disabledNote = hasServingGrams ? '' : '<br><em style="font-size:12px;">(serving size in grams not detected)</em>';

    ui.createModal('Label Scan Results', `
        <div style="margin-bottom:14px;">
            <p style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">${result.product_name || 'Unknown Product'}</p>
            <p style="font-size:13px;color:var(--text-secondary);">${servingNote}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:14px;font-size:14px;">
            <span style="color:var(--text-secondary);">Calories</span><strong style="color:var(--text-primary);">${result.calories} kcal</strong>
            <span style="color:var(--text-secondary);">Protein</span><strong style="color:var(--accent-success);">${result.protein}g</strong>
            <span style="color:var(--text-secondary);">Carbs</span><strong style="color:var(--accent-warning);">${result.carbs}g</strong>
            <span style="color:var(--text-secondary);">Fat</span><strong style="color:var(--accent-danger);">${result.fat}g</strong>
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:${hasServingGrams ? 'pointer' : 'default'};padding:10px;background:var(--bg-tertiary);border-radius:var(--radius-md);">
            <input type="checkbox" id="normalize-100g" ${hasServingGrams ? '' : 'disabled'} style="margin-top:2px;flex-shrink:0;">
            <span style="font-size:13px;color:${hasServingGrams ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                Normalize to per-100g and save to food library${disabledNote}
            </span>
        </label>
    `, [
        {
            text: 'Log Food',
            className: 'btn-primary',
            onClick: async () => {
                const checkbox = document.getElementById('normalize-100g');
                if (checkbox && checkbox.checked && hasServingGrams) {
                    await normalizeAndLog(result);
                } else {
                    const note = result.serving_size ? `Serving: ${result.serving_size}` : '';
                    showMacroForm({
                        meal_name: result.product_name,
                        protein: result.protein,
                        carbs: result.carbs,
                        fat: result.fat,
                        fiber: result.fiber,
                        notes: note,
                        status: 'completed',
                        ai_estimated: true
                    });
                }
            }
        },
        {
            text: 'Cancel',
            className: 'btn-secondary'
        }
    ]);
}

/**
 * Normalize a per-serving label result to per-100g, save to food library,
 * then prompt for grams eaten and log the macro entry.
 * @param {Object} result - Result from estimateMacrosFromLabel
 */
async function normalizeAndLog(result) {
    try {
        const scale = 100 / result.serving_size_grams;
        const p100   = Math.round(result.protein * scale * 10) / 10;
        const c100   = Math.round(result.carbs   * scale * 10) / 10;
        const f100   = Math.round(result.fat     * scale * 10) / 10;
        const cal100 = Math.round(calculateMacroCalories(p100, c100, f100, 0) * 10) / 10;

        const foodId = await db.addNamedFood({
            name: result.product_name || 'Scanned Label',
            format_type: 'per_gram',
            protein: p100,
            carbs: c100,
            fat: f100,
            fiber: 0,
            calories: cal100
        });

        showNormalizedGramsPrompt(result, foodId, { p100, c100, f100 });
    } catch (error) {
        console.error('Failed to save food to library:', error);
        ui.showError('Failed to save to food library. Logging as one-off entry.');
        const note = result.serving_size ? `Serving: ${result.serving_size}` : '';
        showMacroForm({
            meal_name: result.product_name,
            protein: result.protein,
            carbs: result.carbs,
            fat: result.fat,
            fiber: result.fiber,
            notes: note,
            status: 'completed',
            ai_estimated: true
        });
    }
}

/**
 * After normalizing to per-100g and saving to food library, prompt the user
 * for grams eaten and log the scaled macro entry linked to the food library item.
 * @param {Object} labelResult - Original label scan result
 * @param {number} foodId      - ID of the newly saved named food
 * @param {Object} per100g     - { p100, c100, f100 } macros per 100g
 */
function showNormalizedGramsPrompt(labelResult, foodId, per100g) {
    const defaultGrams = labelResult.serving_size_grams || 100;
    ui.createModal('How many grams did you eat?', `
        <p style="margin-bottom:10px;color:var(--text-secondary);font-size:13px;">
            Saved to food library as per-100g. Enter the amount you ate.
        </p>
        <div class="form-group">
            <label>Grams eaten</label>
            <input type="number" id="grams-eaten-input" min="0.01" max="9999" step="0.01"
                value="${defaultGrams}" style="width:100%;">
        </div>
    `, [
        {
            text: 'Log',
            className: 'btn-primary',
            onClick: () => {
                const gramsInput = document.getElementById('grams-eaten-input');
                const grams = parseFloat(gramsInput ? gramsInput.value : defaultGrams) || defaultGrams;
                const factor = grams / 100;
                showMacroForm({
                    meal_name: labelResult.product_name,
                    protein: Math.round(per100g.p100 * factor * 10) / 10,
                    carbs:   Math.round(per100g.c100 * factor * 10) / 10,
                    fat:     Math.round(per100g.f100 * factor * 10) / 10,
                    fiber: 0,
                    notes: `${grams}g of ${labelResult.product_name}`,
                    status: 'completed',
                    ai_estimated: true,
                    food_id: foodId,
                    servings: grams
                });
            }
        },
        {
            text: 'Cancel',
            className: 'btn-secondary'
        }
    ]);
}

/**
 * Show an error modal that lets the user retry the same label scan.
 * @param {string} errorMessage - Human-readable error from the API
 * @param {string} imageData    - base64 data-URL kept for retry
 */
function showLabelRetryModal(errorMessage, imageData) {
    ui.createModal('Label Scan Failed', `
        <p style="margin-bottom:10px;color:var(--text-primary);">${errorMessage}</p>
        <p style="font-size:13px;color:var(--text-secondary);">Would you like to retry with the same image?</p>
    `, [
        {
            text: 'Retry',
            className: 'btn-primary',
            onClick: () => runLabelAnalysis(imageData)
        },
        {
            text: 'Cancel',
            className: 'btn-secondary'
        }
    ]);
}

/**
 * Set up photo upload event listeners
 * @param {HTMLElement} modal - Modal element
 */
function setupPhotoUploadListeners(modal) {
    const photoInput = modal.querySelector('#photo-input');
    const takePhotoBtn = modal.querySelector('#btn-take-photo');
    const choosePhotoBtn = modal.querySelector('#btn-choose-photo');
    const takeLabelPhotoBtn = modal.querySelector('#btn-take-label-photo');
    const scanLabelBtn = modal.querySelector('#btn-scan-label');
    const labelInput = modal.querySelector('#label-input');
    const closeBtn = modal.querySelector('#close-photo-upload');
    const previewSection = modal.querySelector('#photo-preview');
    const previewImage = modal.querySelector('#preview-image');
    const analyzeBtn = modal.querySelector('#btn-analyze-photo');
    const cancelPhotoBtn = modal.querySelector('#btn-cancel-photo');

    let currentImageData = null;

    // Close button
    closeBtn.addEventListener('click', () => {
        ui.closeModal(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            ui.closeModal(modal);
        }
    });

    // Take photo (mobile camera)
    takePhotoBtn.addEventListener('click', () => {
        photoInput.setAttribute('capture', 'environment');
        photoInput.click();
    });

    // Choose from gallery
    choosePhotoBtn.addEventListener('click', () => {
        photoInput.removeAttribute('capture');
        photoInput.click();
    });

    // Photo selected
    photoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                ui.showError('Image too large. Please choose an image under 5MB.');
                return;
            }

            // Validate file type
            if (!file.type.startsWith('image/')) {
                ui.showError('Please select an image file.');
                return;
            }

            // Read and display preview
            const reader = new FileReader();
            reader.onload = (event) => {
                currentImageData = event.target.result;
                previewImage.src = currentImageData;
                previewSection.classList.remove('hidden');
            };
            reader.readAsDataURL(file);

        } catch (error) {
            console.error('Error loading image:', error);
            ui.showError('Failed to load image');
        }
    });

    // Cancel photo
    cancelPhotoBtn.addEventListener('click', () => {
        previewSection.classList.add('hidden');
        currentImageData = null;
        photoInput.value = '';
    });

    // Analyze photo
    analyzeBtn.addEventListener('click', async () => {
        if (!currentImageData) return;

        // Capture context before closing the photo modal
        const contextInput = modal.querySelector('#food-context');
        const context = contextInput ? contextInput.value.trim() : '';

        // Close the photo modal immediately, then run analysis
        ui.closeModal(modal);
        await runPhotoAnalysis(currentImageData, context);
    });

    // Scan Label buttons — camera and gallery
    if (takeLabelPhotoBtn && labelInput) {
        takeLabelPhotoBtn.addEventListener('click', () => {
            labelInput.setAttribute('capture', 'environment');
            labelInput.click();
        });
    }
    if (scanLabelBtn && labelInput) {
        scanLabelBtn.addEventListener('click', () => {
            labelInput.removeAttribute('capture');
            labelInput.click();
        });

        labelInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                ui.showError('Image too large. Please choose an image under 5MB.');
                return;
            }

            if (!file.type.startsWith('image/')) {
                ui.showError('Please select an image file.');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                ui.closeModal(modal);
                await runLabelAnalysis(event.target.result);
            };
            reader.readAsDataURL(file);
        });
    }
}
