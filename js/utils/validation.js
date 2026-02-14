/**
 * Fitness Tracker PWA - Form Validation Utilities
 * Helper functions for validating user input
 */

/**
 * Validate a number is within a range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {Object} {valid, error}
 */
export function validateNumber(value, min = 0, max = Infinity) {
    if (value === null || value === undefined || value === '') {
        return { valid: false, error: 'Value is required' };
    }

    const num = Number(value);

    if (isNaN(num)) {
        return { valid: false, error: 'Must be a valid number' };
    }

    if (num < min) {
        return { valid: false, error: `Must be at least ${min}` };
    }

    if (num > max) {
        return { valid: false, error: `Must not exceed ${max}` };
    }

    return { valid: true, error: null };
}

/**
 * Validate a required text field
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {Object} {valid, error}
 */
export function validateText(value, minLength = 1, maxLength = 255) {
    if (!value || value.trim() === '') {
        return { valid: false, error: 'This field is required' };
    }

    const trimmed = value.trim();

    if (trimmed.length < minLength) {
        return { valid: false, error: `Must be at least ${minLength} characters` };
    }

    if (trimmed.length > maxLength) {
        return { valid: false, error: `Must not exceed ${maxLength} characters` };
    }

    return { valid: true, error: null };
}

/**
 * Validate macro values (protein, carbs, fat, fiber)
 * @param {Object} macros - {protein, carbs, fat, fiber}
 * @returns {Object} {valid, errors}
 */
export function validateMacros(macros) {
    const errors = {};
    let valid = true;

    // Validate protein
    const proteinResult = validateNumber(macros.protein, 0, 1000);
    if (!proteinResult.valid) {
        errors.protein = proteinResult.error;
        valid = false;
    }

    // Validate carbs
    const carbsResult = validateNumber(macros.carbs, 0, 1000);
    if (!carbsResult.valid) {
        errors.carbs = carbsResult.error;
        valid = false;
    }

    // Validate fat
    const fatResult = validateNumber(macros.fat, 0, 500);
    if (!fatResult.valid) {
        errors.fat = fatResult.error;
        valid = false;
    }

    // Validate fiber
    const fiberResult = validateNumber(macros.fiber, 0, 200);
    if (!fiberResult.valid) {
        errors.fiber = fiberResult.error;
        valid = false;
    }

    // Fiber cannot exceed carbs
    if (valid && Number(macros.fiber) > Number(macros.carbs)) {
        errors.fiber = 'Fiber cannot exceed total carbs';
        valid = false;
    }

    return { valid, errors };
}

/**
 * Validate weight measurement
 * @param {number} value - Weight value
 * @param {string} unit - Unit ('lbs' or 'kg')
 * @returns {Object} {valid, error}
 */
export function validateWeight(value, unit = 'lbs') {
    const max = unit === 'lbs' ? 1000 : 450;
    const min = unit === 'lbs' ? 50 : 20;

    return validateNumber(value, min, max);
}

/**
 * Validate waist measurement
 * @param {number} value - Waist value
 * @param {string} unit - Unit ('in' or 'cm')
 * @returns {Object} {valid, error}
 */
export function validateWaist(value, unit = 'in') {
    const max = unit === 'in' ? 100 : 250;
    const min = unit === 'in' ? 10 : 25;

    return validateNumber(value, min, max);
}

/**
 * Validate workout data
 * @param {Object} workout - {exercise_name, duration_minutes, sets}
 * @returns {Object} {valid, errors}
 */
export function validateWorkout(workout) {
    const errors = {};
    let valid = true;

    // Validate exercise name
    const nameResult = validateText(workout.exercise_name, 2, 100);
    if (!nameResult.valid) {
        errors.exercise_name = nameResult.error;
        valid = false;
    }

    // Validate duration
    if (workout.duration_minutes) {
        const durationResult = validateNumber(workout.duration_minutes, 1, 600);
        if (!durationResult.valid) {
            errors.duration_minutes = durationResult.error;
            valid = false;
        }
    }

    // Validate sets
    if (workout.sets && workout.sets.length > 0) {
        workout.sets.forEach((set, index) => {
            if (set.reps !== undefined) {
                const repsResult = validateNumber(set.reps, 1, 1000);
                if (!repsResult.valid) {
                    errors[`set_${index}_reps`] = repsResult.error;
                    valid = false;
                }
            }

            if (set.weight !== undefined) {
                const weightResult = validateNumber(set.weight, 0, 2000);
                if (!weightResult.valid) {
                    errors[`set_${index}_weight`] = weightResult.error;
                    valid = false;
                }
            }
        });
    }

    return { valid, errors };
}

/**
 * Validate named food data
 * @param {Object} food - Food object
 * @returns {Object} {valid, errors}
 */
export function validateNamedFood(food) {
    const errors = {};
    let valid = true;

    // Validate name
    const nameResult = validateText(food.name, 2, 100);
    if (!nameResult.valid) {
        errors.name = nameResult.error;
        valid = false;
    }

    // Validate format type
    if (!['per_serving', 'per_gram', 'per_batch'].includes(food.format_type)) {
        errors.format_type = 'Invalid format type';
        valid = false;
    }

    // Validate macros
    const macrosResult = validateMacros({
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber
    });

    if (!macrosResult.valid) {
        Object.assign(errors, macrosResult.errors);
        valid = false;
    }

    // Validate format-specific fields
    if (food.format_type === 'per_batch') {
        const servingsResult = validateNumber(food.batch_servings, 1, 100);
        if (!servingsResult.valid) {
            errors.batch_servings = servingsResult.error;
            valid = false;
        }
    }

    return { valid, errors };
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {Object} {valid, error}
 */
export function validateEmail(email) {
    if (!email || email.trim() === '') {
        return { valid: false, error: 'Email is required' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true, error: null };
}

/**
 * Validate API key format (basic check)
 * @param {string} apiKey - API key
 * @returns {Object} {valid, error}
 */
export function validateApiKey(apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        return { valid: false, error: 'API key is required' };
    }

    if (apiKey.length < 10) {
        return { valid: false, error: 'API key seems too short' };
    }

    return { valid: true, error: null };
}

/**
 * Show validation error on a form field
 * @param {HTMLElement} field - Form field element
 * @param {string} error - Error message
 */
export function showFieldError(field, error) {
    // Remove existing error
    clearFieldError(field);

    // Add error class
    field.classList.add('error');

    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = error;

    // Insert after field
    field.parentNode.insertBefore(errorElement, field.nextSibling);
}

/**
 * Clear validation error from a form field
 * @param {HTMLElement} field - Form field element
 */
export function clearFieldError(field) {
    field.classList.remove('error');

    const errorElement = field.parentNode.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

/**
 * Clear all validation errors in a form
 * @param {HTMLElement} form - Form element
 */
export function clearFormErrors(form) {
    const fields = form.querySelectorAll('.error');
    fields.forEach(field => clearFieldError(field));
}
