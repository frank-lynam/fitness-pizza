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

        try {
            // Show loading immediately
            ui.showLoading('Analyzing photo...');

            // Get optional context from user
            const contextInput = modal.querySelector('#food-context');
            const context = contextInput ? contextInput.value.trim() : '';

            // Use setTimeout to ensure loading UI renders before blocking fetch
            await new Promise(resolve => setTimeout(resolve, 50));

            const estimates = await estimateMacrosFromPhoto(currentImageData, context);

            ui.hideLoading();

            // Close modal
            ui.closeModal(modal);

            // Open macro form with AI estimates pre-filled
            showMacroForm({
                ...estimates,
                status: 'completed'
            });

        } catch (error) {
            ui.hideLoading();
            console.error('Analysis error:', error);
            ui.showError(error.message);
        }
    });
}
