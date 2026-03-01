/**
 * Fitness Tracker PWA - Photo Upload Component
 * Handles photo capture/upload and macro estimation
 */

import { estimateMacrosFromPhoto } from '../api.js';
import * as ui from '../ui.js';
import { showMacroForm } from './macro-form.js';

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
 * Set up photo upload event listeners
 * @param {HTMLElement} modal - Modal element
 */
function setupPhotoUploadListeners(modal) {
    const photoInput = modal.querySelector('#photo-input');
    const takePhotoBtn = modal.querySelector('#btn-take-photo');
    const choosePhotoBtn = modal.querySelector('#btn-choose-photo');
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
}
