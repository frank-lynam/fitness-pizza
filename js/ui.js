/**
 * Fitness Tracker PWA - UI State Management
 * Helper functions for managing UI state and interactions
 */

/**
 * Show a screen and hide others
 * @param {string} screenName - Name of the screen to show
 */
export function showScreen(screenName) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });

    // Show the requested screen
    const targetScreen = document.getElementById(`screen-${screenName}`);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }

    // Update screen title
    const title = document.getElementById('screen-title');
    if (title) {
        title.textContent = screenName.charAt(0).toUpperCase() + screenName.slice(1);
    }

    // Update active nav item
    updateActiveNav(screenName);

    // Scroll to top
    window.scrollTo(0, 0);
}

/**
 * Update active navigation item
 * @param {string} screenName - Name of the active screen
 */
export function updateActiveNav(screenName) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.screen === screenName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
export function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');

    if (messageEl) {
        messageEl.textContent = message;
    }

    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Show error message
 * @param {string} message - Error message
 * @param {number} duration - Duration in ms (0 = manual dismiss only)
 */
export function showError(message, duration = 5000) {
    const errorDisplay = document.getElementById('error-display');
    const errorMessage = document.getElementById('error-message');

    if (errorMessage) {
        errorMessage.textContent = message;
    }

    if (errorDisplay) {
        errorDisplay.classList.remove('hidden');

        // Auto-dismiss after duration
        if (duration > 0) {
            setTimeout(() => {
                hideError();
            }, duration);
        }
    }

    console.error('Error shown to user:', message);
}

/**
 * Hide error message
 */
export function hideError() {
    const errorDisplay = document.getElementById('error-display');
    if (errorDisplay) {
        errorDisplay.classList.add('hidden');
    }
}

/**
 * Show offline indicator
 */
export function showOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
    }
}

/**
 * Hide offline indicator
 */
export function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
    }
}

/**
 * Toggle element visibility
 * @param {HTMLElement|string} element - Element or ID
 * @param {boolean} show - True to show, false to hide
 */
export function toggleElement(element, show) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (!el) return;

    if (show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

/**
 * Create a simple modal/dialog
 * @param {string} title - Modal title
 * @param {string} content - Modal content (HTML)
 * @param {Array} buttons - Array of {text, onClick, className}
 * @returns {HTMLElement} Modal element
 */
export function createModal(title, content, buttons = []) {
    // Create modal structure
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            <div class="modal-footer">
            </div>
        </div>
    `;

    // Add buttons
    const footer = modal.querySelector('.modal-footer');
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.className = btn.className || 'btn-secondary';
        button.onclick = () => {
            if (btn.onClick) btn.onClick();
            closeModal(modal);
        };
        footer.appendChild(button);
    });

    // Close on X button
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.onclick = () => closeModal(modal);

    // Close on overlay click
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    };

    // Add to document
    document.body.appendChild(modal);

    return modal;
}

/**
 * Close and remove a modal
 * @param {HTMLElement} modal - Modal element
 */
export function closeModal(modal) {
    if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
    }
}

/**
 * Confirm dialog
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback when confirmed
 * @param {Function} onCancel - Callback when cancelled
 */
export function confirm(message, onConfirm, onCancel = null) {
    createModal('Confirm', `<p>${message}</p>`, [
        {
            text: 'Cancel',
            className: 'btn-secondary',
            onClick: onCancel
        },
        {
            text: 'Confirm',
            className: 'btn-primary',
            onClick: onConfirm
        }
    ]);
}

/**
 * Animate element entrance
 * @param {HTMLElement} element - Element to animate
 */
export function animateIn(element) {
    element.style.animation = 'fadeIn 0.3s ease-in-out';
}

/**
 * Format number for display
 * @param {number} value - Number value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 1) {
    return Number(value).toFixed(decimals);
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit time in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 300) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Check if user is online
 * @returns {boolean}
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Set up online/offline event listeners
 * @param {Function} onOnline - Callback when online
 * @param {Function} onOffline - Callback when offline
 */
export function setupConnectivityListeners(onOnline, onOffline) {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Check initial state
    if (isOnline()) {
        onOnline();
    } else {
        onOffline();
    }
}

/**
 * Show a toast with an Undo button. Immediately calls onDelete, then gives the
 * user 5 seconds to undo by calling onUndo. Use instead of confirm() dialogs.
 * @param {string} message - Text shown in the toast
 * @param {Function} onUndo - Called if the user taps Undo before the toast dismisses
 * @param {number} duration - ms before the toast auto-dismisses
 */
export function showUndoToast(message, onUndo, duration = 5000) {
    const existing = document.getElementById('fp-undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'fp-undo-toast';
    toast.style.cssText = [
        'position:fixed',
        'bottom:calc(var(--bottom-nav-height,60px) + 16px)',
        'left:50%',
        'transform:translateX(-50%)',
        'background:var(--bg-secondary)',
        'color:var(--text-primary)',
        'padding:10px 16px',
        'border-radius:20px',
        'border:1px solid var(--border-color)',
        'z-index:9999',
        'font-size:0.9em',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
        'display:flex',
        'align-items:center',
        'gap:12px',
        'white-space:nowrap',
    ].join(';');

    const msg = document.createElement('span');
    msg.textContent = message;

    const btn = document.createElement('button');
    btn.textContent = 'Undo';
    btn.style.cssText = 'background:var(--accent-primary);color:#fff;border:none;padding:4px 12px;border-radius:12px;cursor:pointer;font-size:0.9em;font-weight:600;pointer-events:auto;';
    btn.addEventListener('click', () => {
        clearTimeout(timer);
        toast.remove();
        onUndo();
    });

    toast.appendChild(msg);
    toast.appendChild(btn);
    document.body.appendChild(toast);

    const timer = setTimeout(() => toast.remove(), duration);
}

/**
 * Show a stacking add-confirmation toast with an Undo button.
 * Multiple calls stack vertically; each fades independently.
 */
export function showAddToast(message, onUndo, duration = 4000) {
    let container = document.getElementById('fp-add-toasts');
    if (!container) {
        container = document.createElement('div');
        container.id = 'fp-add-toasts';
        container.style.cssText = [
            'position:fixed',
            'bottom:calc(var(--bottom-nav-height,60px) + 10px)',
            'left:50%',
            'transform:translateX(-50%)',
            'display:flex',
            'flex-direction:column',
            'gap:6px',
            'z-index:9998',
            'pointer-events:none',
            'align-items:center',
        ].join(';');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = [
        'background:var(--bg-secondary)',
        'color:var(--text-primary)',
        'padding:8px 14px',
        'border-radius:20px',
        'border:1px solid var(--border-color)',
        'font-size:0.85em',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'pointer-events:auto',
        'opacity:1',
        'transition:opacity 0.4s',
        'white-space:nowrap',
    ].join(';');

    const msg = document.createElement('span');
    msg.textContent = message;

    const btn = document.createElement('button');
    btn.textContent = 'Undo';
    btn.style.cssText = 'background:var(--accent-primary);color:#fff;border:none;padding:3px 10px;border-radius:10px;cursor:pointer;font-size:0.85em;font-weight:600;';

    const dismiss = () => {
        clearTimeout(timer);
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
            if (container && container.children.length === 0) container.remove();
        }, 400);
    };

    btn.addEventListener('click', () => { dismiss(); onUndo(); });
    toast.appendChild(msg);
    toast.appendChild(btn);
    container.insertBefore(toast, container.firstChild); // newest on top
    const timer = setTimeout(dismiss, duration);
}

/**
 * Show a brief toast notification at the bottom of the screen
 * @param {string} message
 * @param {number} duration - ms before auto-dismiss
 */
export function showToast(message, duration = 3500) {
    const existing = document.getElementById('fp-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'fp-toast';
    toast.textContent = message;
    toast.style.cssText = [
        'position:fixed',
        'bottom:calc(var(--bottom-nav-height,60px) + 16px)',
        'left:50%',
        'transform:translateX(-50%)',
        'background:var(--bg-secondary)',
        'color:var(--text-primary)',
        'padding:10px 20px',
        'border-radius:20px',
        'border:1px solid var(--border-color)',
        'z-index:9999',
        'font-size:0.9em',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
        'white-space:nowrap',
        'pointer-events:none',
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}
