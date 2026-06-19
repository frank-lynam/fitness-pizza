/**
 * Fitness Tracker PWA - Photo Upload Component
 * Handles photo capture/upload and macro estimation
 */

import { estimateMacrosFromPhoto, estimateMacrosFromLabel } from '../api.js';
import * as ui from '../ui.js';
import { showMacroForm } from './macro-form.js';

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Open camera, then show a compact context prompt before analyzing.
 * Used by the "Snap a Meal" button.
 */
export async function snapMealAndDescribe() {
    const imageData = await capturePhoto(true);
    if (!imageData) return;
    showContextModal(imageData);
}

/**
 * Open camera and run label analysis immediately — no intermediate step.
 * Used by the "Scan Label" button.
 */
export async function scanLabelDirect() {
    const imageData = await capturePhoto(true);
    if (!imageData) return;
    await runLabelAnalysis(imageData);
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Capture a photo via Capacitor Camera plugin (native) or file input (browser).
 * Returns a base64 data-URL, or null if the user cancelled.
 */
async function capturePhoto(useCapture = true) {
    if (window.Capacitor?.isNativePlatform?.()) {
        try {
            return await takeNativePhoto();
        } catch (err) {
            if (!isUserCancellation(err)) ui.showError('Failed to open camera: ' + err.message);
            return null;
        }
    }
    return pickPhotoFromInput(useCapture);
}

/** Compact "What did you eat?" modal shown after snapping a photo. */
function showContextModal(imageData) {
    const modal = ui.createModal('What did you eat?', `
        <input type="text" id="snap-context"
               placeholder="e.g. chicken salad, restaurant portion"
               autocomplete="off"
               style="width:100%;">
        <p style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">
            Optional — helps the AI be more accurate
        </p>
    `, [
        { text: 'Cancel', className: 'btn-secondary' },
        {
            text: 'Analyze →',
            className: 'btn-primary',
            onClick: () => {
                const ctx = modal.querySelector('#snap-context')?.value.trim() || '';
                runPhotoAnalysis(imageData, ctx);
            }
        }
    ]);
    setTimeout(() => modal.querySelector('#snap-context')?.focus(), 50);
}

/** Promise-based file input picker. Resolves to data-URL or null on cancel. */
function pickPhotoFromInput(useCapture) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (useCapture) input.setAttribute('capture', 'environment');
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            input.remove();
            if (!file) { resolve(null); return; }
            if (file.size > 5 * 1024 * 1024) {
                ui.showError('Image too large. Please choose an image under 5MB.');
                resolve(null); return;
            }
            if (!file.type.startsWith('image/')) {
                ui.showError('Please select an image file.');
                resolve(null); return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target.result);
            reader.readAsDataURL(file);
        });

        input.click();
    });
}

/**
 * Full-screen loading overlay with Cancel.
 * Returns the overlay element; caller removes it when done.
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

function showPhotoRetryModal(errorMessage, imageData, context) {
    ui.createModal('Analysis Failed', `
        <p style="margin-bottom:10px;color:var(--text-primary);">${errorMessage}</p>
        <p style="font-size:13px;color:var(--text-secondary);">Would you like to retry with the same photo?</p>
    `, [
        { text: 'Retry', className: 'btn-primary', onClick: () => runPhotoAnalysis(imageData, context) },
        { text: 'Cancel', className: 'btn-secondary' }
    ]);
}

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

        const servingGrams = result.serving_size_grams || 0;
        const use100gMode = result.is_per_100g || servingGrams > 0;
        const weightGrams = result.is_per_100g ? 100 : (servingGrams || 100);

        showMacroForm({
            meal_name: result.product_name || '',
            protein: result.protein,
            carbs: result.carbs,
            fat: result.fat,
            fiber: result.fiber,
            status: 'planned',
            serving_label: result.serving_size || '',
            ai_estimated: true,
            _per100gMode: use100gMode,
            _weightGrams: weightGrams,
            _addToLibrary: true,
        });
    } catch (error) {
        loadingOverlay.remove();
        if (cancelled) return;
        console.error('Label analysis error:', error);
        showLabelRetryModal(error.message, imageData);
    }
}

function showLabelRetryModal(errorMessage, imageData) {
    ui.createModal('Label Scan Failed', `
        <p style="margin-bottom:10px;color:var(--text-primary);">${errorMessage}</p>
        <p style="font-size:13px;color:var(--text-secondary);">Would you like to retry with the same image?</p>
    `, [
        { text: 'Retry', className: 'btn-primary', onClick: () => runLabelAnalysis(imageData) },
        { text: 'Cancel', className: 'btn-secondary' }
    ]);
}

async function takeNativePhoto() {
    const Camera = window.Capacitor?.Plugins?.Camera;
    if (!Camera) throw new Error('Camera plugin not available');
    const photo = await Camera.getPhoto({
        resultType: 'dataUrl',
        source: 'CAMERA',
        quality: 85,
        allowEditing: false,
        correctOrientation: true
    });
    return photo.dataUrl;
}

function isUserCancellation(err) {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('cancel') || msg.includes('no image') || msg.includes('denied');
}
