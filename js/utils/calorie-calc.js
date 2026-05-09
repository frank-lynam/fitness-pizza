/**
 * Fitness Tracker PWA - Calorie Calculation Utilities
 *
 * Provides functions for calculating calories from:
 * 1. Macronutrients (protein, carbs, fat, fiber)
 * 2. Workout activities using MET values
 */

/**
 * Calculate calories from macronutrients
 *
 * Standard values:
 * - Protein: 4 calories per gram
 * - Carbs: 4 calories per gram
 * - Fat: 9 calories per gram
 * - Fiber: 2 calories per gram (provides some energy but less than other carbs)
 *
 * @param {number} protein - Grams of protein
 * @param {number} carbs - Grams of carbohydrates
 * @param {number} fat - Grams of fat
 * @param {number} fiber - Grams of fiber (optional, defaults to 0)
 * @returns {number} Total calories
 */
export function calculateMacroCalories(protein, carbs, fat, fiber = 0) {
    const proteinCals = (protein || 0) * 4;
    const carbsCals = (carbs || 0) * 4;
    const fatCals = (fat || 0) * 9;
    const fiberCals = (fiber || 0) * 2;

    return Math.round(proteinCals + carbsCals + fatCals + fiberCals);
}

/**
 * Get MET (Metabolic Equivalent) value for an exercise
 *
 * MET values represent energy cost of physical activities as a multiple
 * of resting metabolic rate. Common ranges:
 * - Light activity: 1.5-3 METs
 * - Moderate activity: 3-6 METs
 * - Vigorous activity: 6-9 METs
 * - Very vigorous activity: 9+ METs
 *
 * @param {string} exerciseName - Name of the exercise
 * @param {Array} sets - Array of set objects (for strength training intensity)
 * @returns {number} MET value
 */
export function getMETForExercise(exerciseName, sets = []) {
    const exercise = exerciseName.toLowerCase();

    // High intensity cardio (8-12 METs)
    if (exercise.includes('run') || exercise.includes('running')) {
        if (exercise.includes('sprint')) return 12;
        if (exercise.includes('jog')) return 7;
        return 9; // General running
    }

    if (exercise.includes('hiit') || exercise.includes('burpee') ||
        exercise.includes('jump rope') || exercise.includes('jumping rope')) {
        return 10;
    }

    // Moderate cardio (6-8 METs)
    if (exercise.includes('bike') || exercise.includes('cycling') ||
        exercise.includes('bicycle')) {
        if (exercise.includes('vigorous') || exercise.includes('fast')) return 8;
        return 6; // Moderate cycling
    }

    if (exercise.includes('row') || exercise.includes('rowing')) {
        if (exercise.includes('vigorous')) return 10;
        return 7; // Moderate rowing
    }

    if (exercise.includes('swim') || exercise.includes('swimming')) {
        if (exercise.includes('vigorous') || exercise.includes('lap')) return 10;
        return 6; // Moderate swimming
    }

    if (exercise.includes('elliptical')) {
        return 5;
    }

    if (exercise.includes('walk') || exercise.includes('walking')) {
        if (exercise.includes('brisk') || exercise.includes('fast')) return 4.5;
        return 3.5; // Moderate walking
    }

    // Strength training (3-6 METs based on intensity)
    if (sets && sets.length > 0) {
        // Calculate average reps to estimate intensity
        const avgReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0) / sets.length;

        // Check if compound movement (higher MET)
        const isCompound = exercise.includes('squat') || exercise.includes('deadlift') ||
                          exercise.includes('bench') || exercise.includes('press') ||
                          exercise.includes('clean') || exercise.includes('snatch') ||
                          exercise.includes('pull up') || exercise.includes('pullup') ||
                          exercise.includes('chin up') || exercise.includes('chinup');

        // Heavy compound (low reps, high weight)
        if (isCompound && avgReps < 6) return 6;

        // Moderate compound or heavy isolation
        if (isCompound || avgReps < 8) return 5;

        // General strength training
        return 4;
    }

    // General strength/resistance training keywords
    if (exercise.includes('lift') || exercise.includes('weight') ||
        exercise.includes('squat') || exercise.includes('deadlift') ||
        exercise.includes('bench') || exercise.includes('press') ||
        exercise.includes('curl') || exercise.includes('extension') ||
        exercise.includes('raise') || exercise.includes('pull') ||
        exercise.includes('push') || exercise.includes('lunge')) {
        return 5; // General strength training
    }

    // Sports and activities
    if (exercise.includes('basketball')) return 6;
    if (exercise.includes('soccer') || exercise.includes('football')) return 7;
    if (exercise.includes('tennis')) return 7;
    if (exercise.includes('yoga')) return 3;
    if (exercise.includes('pilates')) return 3.5;

    // Default for unknown activities (moderate intensity)
    return 5;
}

/**
 * Estimate calories burned during a workout
 *
 * Formula: (MET × 3.5 × weight_kg / 200) × duration_minutes
 * This is the standard formula used by fitness trackers
 *
 * @param {string} exerciseName - Name of the exercise
 * @param {number} durationMinutes - Duration of the workout in minutes
 * @param {Array} sets - Array of set objects (optional, for strength training)
 * @param {number} userWeightLbs - User's weight in pounds
 * @returns {number} Estimated calories burned
 */
export function estimateWorkoutCalories(exerciseName, durationMinutes, sets = [], userWeightLbs = 150) {
    // Convert weight to kg
    const weightKg = userWeightLbs * 0.453592;

    // Get MET value for this exercise
    const met = getMETForExercise(exerciseName, sets);

    // Calculate calories using standard formula
    const calories = (met * 3.5 * weightKg / 200) * durationMinutes;

    return Math.round(calories);
}

/**
 * Calculate total workout volume (for strength training)
 * Volume = sets × reps × weight
 *
 * @param {Array} sets - Array of set objects with {reps, weight} properties
 * @returns {number} Total volume
 */
export function calculateWorkoutVolume(sets) {
    if (!sets || sets.length === 0) return 0;

    return sets.reduce((total, set) => {
        const reps = set.reps || 0;
        const weight = set.weight || 0;
        return total + (reps * weight);
    }, 0);
}

/**
 * Calculate calorie balance for a day
 * Balance = calories consumed - calories burned
 *
 * @param {number} caloriesIn - Total calories consumed (from macros)
 * @param {number} caloriesOut - Total calories burned (from workouts)
 * @returns {Object} Balance data {balance, status}
 */
export function calculateCalorieBalance(caloriesIn, caloriesOut) {
    const balance = caloriesIn - caloriesOut;
    let status = 'neutral';

    if (balance > 200) {
        status = 'surplus';
    } else if (balance < -200) {
        status = 'deficit';
    }

    return {
        balance: balance,
        status: status
    };
}

/**
 * Format calories for display
 *
 * @param {number} calories - Calorie value
 * @returns {string} Formatted string
 */
export function formatCalories(calories) {
    return `${Math.round(calories)} cal`;
}

/**
 * Validate macro values
 * Fiber should not exceed total carbs
 *
 * @param {number} protein - Grams of protein
 * @param {number} carbs - Grams of carbs
 * @param {number} fat - Grams of fat
 * @param {number} fiber - Grams of fiber
 * @returns {Object} Validation result {valid, errors}
 */
export function validateMacros(protein, carbs, fat, fiber) {
    const errors = [];

    if (protein < 0) errors.push('Protein cannot be negative');
    if (carbs < 0) errors.push('Carbs cannot be negative');
    if (fat < 0) errors.push('Fat cannot be negative');
    if (fiber < 0) errors.push('Fiber cannot be negative');

    if (fiber > carbs) {
        errors.push('Fiber cannot exceed total carbs');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Apply workout calorie credit to macro goals.
 * Distributes credited calories according to explicit per-macro weights.
 *
 * @param {number} fat      - Current fat goal (g)
 * @param {number} protein  - Current protein goal (g)
 * @param {number} carbs    - Current carbs goal (g)
 * @param {number} caloriesBurned - Calories burned from workouts
 * @param {number} fraction - Fraction of burned calories to credit (0–1, default 0.5)
 * @param {{fat:number, protein:number, carbs:number}} creditMacros - Per-macro weights (any scale, 0 = no credit)
 * @returns {{fat: number, protein: number, carbs: number}}
 */
export function applyWorkoutCredit(fat, protein, carbs, caloriesBurned, fraction = 0.5, creditMacros = { fat: 34, protein: 33, carbs: 33 }) {
    const credited = caloriesBurned * fraction;
    if (credited <= 0) return { fat, protein, carbs };
    const wFat     = Math.max(0, creditMacros.fat     || 0);
    const wProtein = Math.max(0, creditMacros.protein || 0);
    const wCarbs   = Math.max(0, creditMacros.carbs   || 0);
    const totalW   = wFat + wProtein + wCarbs;
    if (totalW <= 0) return { fat, protein, carbs };
    return {
        fat:     fat     + (credited * (wFat     / totalW)) / 9,
        protein: protein + (credited * (wProtein / totalW)) / 4,
        carbs:   carbs   + (credited * (wCarbs   / totalW)) / 4,
    };
}

/**
 * Get macro percentage breakdown
 *
 * @param {number} protein - Grams of protein
 * @param {number} carbs - Grams of carbs
 * @param {number} fat - Grams of fat
 * @returns {Object} Percentages {protein, carbs, fat}
 */
export function getMacroPercentages(protein, carbs, fat) {
    const proteinCals = protein * 4;
    const carbsCals = carbs * 4;
    const fatCals = fat * 9;
    const total = proteinCals + carbsCals + fatCals;

    if (total === 0) {
        return { protein: 0, carbs: 0, fat: 0 };
    }

    return {
        protein: Math.round((proteinCals / total) * 100),
        carbs: Math.round((carbsCals / total) * 100),
        fat: Math.round((fatCals / total) * 100)
    };
}
