/**
 * Fitness Tracker PWA - IndexedDB Wrapper
 * Manages all database operations with 5 object stores:
 * - macros: Macro tracking entries
 * - measurements: Weight and waist measurements
 * - workouts: Workout sessions
 * - named_foods: Reusable food items with flexible formats
 * - settings: User preferences
 */

const DEFAULT_FOODS = [
    // --- Eggs & Dairy ---
    { name: 'Egg', format_type: 'per_serving', serving_size: '1 egg', protein: 6.3, carbs: 0.7, fat: 4.5, fiber: 0, calories: 69 },
    { name: 'Egg White', format_type: 'per_serving', serving_size: '1 white', protein: 3.6, carbs: 0.2, fat: 0, fiber: 0, calories: 15 },
    { name: 'Egg Yolk', format_type: 'per_serving', serving_size: '1 yolk', protein: 2.7, carbs: 0.6, fat: 4.5, fiber: 0, calories: 54 },
    { name: 'Greek Yogurt, Non-fat', format_type: 'per_gram', protein: 10.2, carbs: 3.6, fat: 0.4, fiber: 0, calories: 59 },
    { name: 'Cottage Cheese, Non-fat', format_type: 'per_gram', protein: 10.6, carbs: 5.3, fat: 0, fiber: 0, calories: 64 },
    { name: 'Cheddar Cheese', format_type: 'per_gram', protein: 24.9, carbs: 1.3, fat: 33.1, fiber: 0, calories: 403 },
    { name: 'Milk, 2%', format_type: 'per_gram', protein: 3.4, carbs: 5, fat: 2, fiber: 0, calories: 52 },
    { name: 'Almond Milk, Unsweetened', format_type: 'per_gram', protein: 1.11, carbs: 0.56, fat: 1.39, fiber: 0.56, calories: 14 },
    { name: 'Butter', format_type: 'per_serving', serving_size: '1 tbsp', protein: 0, carbs: 0, fat: 11, fiber: 0, calories: 99 },
    // --- Meat & Fish ---
    { name: 'Chicken Breast, Raw', format_type: 'per_gram', protein: 31, carbs: 0, fat: 3.6, fiber: 0, calories: 156 },
    { name: 'Ground Beef, 92% Lean', format_type: 'per_gram', protein: 23.4, carbs: 0, fat: 8.5, fiber: 0, calories: 170 },
    { name: 'Salmon, Raw', format_type: 'per_gram', protein: 20, carbs: 0, fat: 13, fiber: 0, calories: 208 },
    { name: 'Tuna, Canned in Water', format_type: 'per_gram', protein: 23.6, carbs: 0, fat: 0.8, fiber: 0, calories: 101 },
    // --- Grains & Legumes ---
    { name: 'Oats, Rolled', format_type: 'per_gram', protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6, calories: 389 },
    { name: 'White Rice, Cooked', format_type: 'per_serving', serving_size: '1 cup', protein: 4, carbs: 40, fat: 1, fiber: 0, calories: 185 },
    { name: 'All-Purpose Flour', format_type: 'per_serving', serving_size: '1 tbsp', protein: 1, carbs: 6, fat: 0, fiber: 0, calories: 28 },
    { name: 'Black Beans, Cooked', format_type: 'per_serving', serving_size: '1/2 cup', protein: 7, carbs: 20, fat: 4.5, fiber: 7.5, calories: 114 },
    { name: 'Lentils, Cooked', format_type: 'per_gram', protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, calories: 116 },
    // --- Vegetables ---
    { name: 'Broccoli, Raw', format_type: 'per_gram', protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6, calories: 34 },
    { name: 'Spinach, Raw', format_type: 'per_gram', protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, calories: 23 },
    { name: 'Sweet Potato', format_type: 'per_gram', protein: 1.6, carbs: 20.1, fat: 0.1, fiber: 3, calories: 86 },
    // --- Fruits ---
    { name: 'Banana', format_type: 'per_serving', serving_size: '1 medium', protein: 1, carbs: 24, fat: 0, fiber: 2.6, calories: 100 },
    { name: 'Apple', format_type: 'per_gram', protein: 0.1, carbs: 14.7, fat: 0.1, fiber: 1.7, calories: 60 },
    { name: 'Strawberries', format_type: 'per_gram', protein: 0.7, carbs: 4.9, fat: 0.3, fiber: 2, calories: 25 },
    { name: 'Blueberries', format_type: 'per_gram', protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4, calories: 57 },
    { name: 'Orange', format_type: 'per_serving', serving_size: '1 medium', protein: 1, carbs: 15, fat: 0, fiber: 3.1, calories: 64 },
    { name: 'Mango', format_type: 'per_gram', protein: 0.8, carbs: 15, fat: 0.4, fiber: 1.6, calories: 60 },
    { name: 'Avocado', format_type: 'per_gram', protein: 2, carbs: 5, fat: 14.7, fiber: 6.7, calories: 160 },
    // --- Nuts, Seeds & Oils ---
    { name: 'Almonds', format_type: 'per_gram', protein: 21.2, carbs: 21.7, fat: 49.9, fiber: 12.5, calories: 579 },
    { name: 'Cashews', format_type: 'per_gram', protein: 17.9, carbs: 28.6, fat: 42.8, fiber: 3.3, calories: 571 },
    { name: 'Peanut Butter', format_type: 'per_serving', serving_size: '2 tbsp', protein: 8, carbs: 7, fat: 16, fiber: 2, calories: 188 },
    { name: 'Powdered Peanut Butter', format_type: 'per_serving', serving_size: '1 tbsp', protein: 3, carbs: 2.5, fat: 0.75, fiber: 0, calories: 29 },
    { name: 'Olive Oil', format_type: 'per_serving', serving_size: '1 tbsp', protein: 0, carbs: 0, fat: 14, fiber: 0, calories: 119 },
    // --- Other ---
    { name: 'Protein Powder', format_type: 'per_serving', serving_size: '1 scoop', protein: 25, carbs: 0, fat: 0, fiber: 0, calories: 100 },
    { name: 'Honey', format_type: 'per_serving', serving_size: '1 tbsp', protein: 0, carbs: 17, fat: 0, fiber: 0, calories: 68 },
    { name: 'Tofu, Firm', format_type: 'per_gram', protein: 8.1, carbs: 1.9, fat: 4.8, fiber: 0.3, calories: 76 },
];

class DatabaseManager {
    constructor() {
        this.db = null;
        this.DB_NAME = 'fitness-tracker-db';
        this.DB_VERSION = 3;
    }

    /**
     * Initialize the database and create object stores
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('Database failed to open:', request.error);
                reject(new Error('Failed to open database: ' + request.error));
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('Database upgrade needed');
                const db = event.target.result;

                // 1. Macros Object Store
                if (!db.objectStoreNames.contains('macros')) {
                    const macrosStore = db.createObjectStore('macros', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    macrosStore.createIndex('date', 'date', { unique: false });
                    macrosStore.createIndex('timestamp', 'timestamp', { unique: false });
                    macrosStore.createIndex('food_id', 'food_id', { unique: false });
                    console.log('Created macros object store');
                }

                // 2. Measurements Object Store
                if (!db.objectStoreNames.contains('measurements')) {
                    const measurementsStore = db.createObjectStore('measurements', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    measurementsStore.createIndex('date', 'date', { unique: false });
                    measurementsStore.createIndex('type', 'type', { unique: false });
                    console.log('Created measurements object store');
                }

                // 3. Workouts Object Store
                if (!db.objectStoreNames.contains('workouts')) {
                    const workoutsStore = db.createObjectStore('workouts', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    workoutsStore.createIndex('date', 'date', { unique: false });
                    workoutsStore.createIndex('exercise_name', 'exercise_name', { unique: false });
                    console.log('Created workouts object store');
                }

                // 4. Named Foods Object Store
                if (!db.objectStoreNames.contains('named_foods')) {
                    const namedFoodsStore = db.createObjectStore('named_foods', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    namedFoodsStore.createIndex('name', 'name', { unique: false });
                    namedFoodsStore.createIndex('created_at', 'created_at', { unique: false });
                    console.log('Created named_foods object store');
                }

                // 5. Settings Object Store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                    console.log('Created settings object store');
                }

                // Version 2: Exercise Library and Workout Templates
                if (event.oldVersion < 2) {
                    // 6. Exercise Library Object Store
                    if (!db.objectStoreNames.contains('exercise_library')) {
                        const exerciseStore = db.createObjectStore('exercise_library', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        exerciseStore.createIndex('name', 'name', { unique: false });
                        exerciseStore.createIndex('type', 'type', { unique: false });
                        console.log('Created exercise_library object store');
                    }

                    // 7. Workout Templates Object Store
                    if (!db.objectStoreNames.contains('workout_templates')) {
                        const templatesStore = db.createObjectStore('workout_templates', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        templatesStore.createIndex('name', 'name', { unique: false });
                        console.log('Created workout_templates object store');
                    }
                }

                // Version 3: Chart Annotations
                if (event.oldVersion < 3) {
                    if (!db.objectStoreNames.contains('annotations')) {
                        const annotationsStore = db.createObjectStore('annotations', {
                            keyPath: 'id',
                            autoIncrement: true
                        });
                        annotationsStore.createIndex('date', 'date', { unique: true });
                        console.log('Created annotations object store');
                    }
                }
            };
        });
    }

    /**
     * Generic add operation
     */
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(data);

                request.onsuccess = () => {
                    resolve(request.result); // Returns the new ID
                };

                request.onerror = () => {
                    console.error(`Error adding to ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in add operation for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Generic get operation by ID
     */
    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(id);

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error(`Error getting from ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in get operation for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Generic get all operation
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error(`Error getting all from ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in getAll operation for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Generic update operation
     */
    async update(storeName, data) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error(`Error updating ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in update operation for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Generic delete operation
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(id);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = () => {
                    console.error(`Error deleting from ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in delete operation for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Query by index
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error(`Error querying ${storeName} by ${indexName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in getByIndex for ${storeName}:`, error);
                reject(error);
            }
        });
    }

    // ==================== MACROS OPERATIONS ====================

    /**
     * Add a macro entry
     */
    async addMacroEntry(data) {
        // Ensure date and timestamp are consistent
        let date, timestamp;
        if (data.date && !data.timestamp) {
            // Date provided, derive timestamp (use noon to avoid timezone issues)
            date = data.date;
            timestamp = new Date(date + 'T12:00:00').getTime();
        } else if (data.timestamp && !data.date) {
            // Timestamp provided, derive date
            timestamp = data.timestamp;
            date = new Date(timestamp).toISOString().split('T')[0];
        } else if (data.date && data.timestamp) {
            // Both provided, use as-is
            date = data.date;
            timestamp = data.timestamp;
        } else {
            // Neither provided, use current date/time
            const now = new Date();
            date = now.toISOString().split('T')[0];
            timestamp = now.getTime();
        }

        const entry = {
            date,
            timestamp,
            protein: data.protein || 0,
            carbs: data.carbs || 0,
            fat: data.fat || 0,
            fiber: data.fiber || 0,
            calories: data.calories || 0,
            meal_name: data.meal_name || '',
            food_description: data.food_description || '',
            food_id: data.food_id || null,
            servings: data.servings || null,
            photo_dataurl: data.photo_dataurl || null,
            ai_estimated: data.ai_estimated || false,
            starred: data.starred || false,
            status: data.status || 'completed', // 'planned' or 'completed'
            synced: data.synced || false
        };
        return this.add('macros', entry);
    }

    /**
     * Get all starred macro entries
     */
    async getStarredMacros() {
        const allMacros = await this.getAll('macros');
        return allMacros.filter(m => m.starred);
    }

    /**
     * Get all macro entries for a specific date
     */
    async getMacrosByDate(date) {
        return this.getByIndex('macros', 'date', date);
    }

    /**
     * Get all macro entries
     */
    async getAllMacros() {
        return this.getAll('macros');
    }

    /**
     * Update a macro entry
     */
    async updateMacroEntry(data) {
        // Ensure timestamp is set for entries that might not have one
        if (!data.timestamp && data.date) {
            data.timestamp = new Date(data.date + 'T12:00:00').getTime();
        } else if (!data.timestamp) {
            data.timestamp = Date.now();
        }
        return this.update('macros', data);
    }

    /**
     * Delete a macro entry
     */
    async deleteMacroEntry(id) {
        return this.delete('macros', id);
    }

    // ==================== MEASUREMENTS OPERATIONS ====================

    /**
     * Add a measurement
     */
    async addMeasurement(data) {
        // Ensure date and timestamp are consistent
        let date, timestamp;
        if (data.date && !data.timestamp) {
            date = data.date;
            timestamp = new Date(date + 'T12:00:00').getTime();
        } else if (data.timestamp && !data.date) {
            timestamp = data.timestamp;
            date = new Date(timestamp).toISOString().split('T')[0];
        } else if (data.date && data.timestamp) {
            date = data.date;
            timestamp = data.timestamp;
        } else {
            const now = new Date();
            date = now.toISOString().split('T')[0];
            timestamp = now.getTime();
        }

        const entry = {
            date,
            timestamp,
            type: data.type, // 'weight' or 'waist'
            value: data.value,
            unit: data.unit || 'lbs',
            notes: data.notes || ''
        };
        return this.add('measurements', entry);
    }

    /**
     * Get measurements by type
     */
    async getMeasurementsByType(type) {
        return this.getByIndex('measurements', 'type', type);
    }

    /**
     * Get all measurements
     */
    async getAllMeasurements() {
        return this.getAll('measurements');
    }

    /**
     * Update a measurement
     */
    async updateMeasurement(data) {
        return this.update('measurements', data);
    }

    /**
     * Delete a measurement
     */
    async deleteMeasurement(id) {
        return this.delete('measurements', id);
    }

    // ==================== WORKOUTS OPERATIONS ====================

    /**
     * Add a workout
     */
    async addWorkout(data) {
        // Ensure date and timestamp are consistent
        let date, timestamp;
        if (data.date && !data.timestamp) {
            date = data.date;
            timestamp = new Date(date + 'T12:00:00').getTime();
        } else if (data.timestamp && !data.date) {
            timestamp = data.timestamp;
            date = new Date(timestamp).toISOString().split('T')[0];
        } else if (data.date && data.timestamp) {
            date = data.date;
            timestamp = data.timestamp;
        } else {
            const now = new Date();
            date = now.toISOString().split('T')[0];
            timestamp = now.getTime();
        }

        const entry = {
            date,
            timestamp,
            exercise_name: data.exercise_name,
            sets: data.sets || [], // Array of {set_number, reps, weight, weight_unit, duration_minutes, pace, checked, notes}
            workout_notes: data.workout_notes || '',
            duration_minutes: data.duration_minutes || 0,
            estimated_calories_burned: data.estimated_calories_burned || 0,
            status: data.status || 'completed', // 'planned' or 'completed'
            starred: data.starred || false,
            exercise_type: data.exercise_type || '',
            reps: data.reps || 0,
            pace: data.pace || null,
            exercise_id: data.exercise_id || null,
            template_id: data.template_id || null
        };
        return this.add('workouts', entry);
    }

    /**
     * Get workouts by date
     */
    async getWorkoutsByDate(date) {
        return this.getByIndex('workouts', 'date', date);
    }

    /**
     * Get all workouts
     */
    async getAllWorkouts() {
        return this.getAll('workouts');
    }

    /**
     * Update a workout
     */
    async updateWorkout(data) {
        return this.update('workouts', data);
    }

    /**
     * Delete a workout
     */
    async deleteWorkout(id) {
        return this.delete('workouts', id);
    }

    /**
     * Get latest weight from measurements (for workout calorie calculations)
     * @returns {number} Latest weight in lbs, or 150 as default
     */
    async getLatestWeight() {
        const measurements = await this.getAllMeasurements();
        const weightMeasurements = measurements
            .filter(m => m.type === 'weight')
            .sort((a, b) => b.timestamp - a.timestamp);

        if (weightMeasurements.length === 0) {
            return 150; // Default weight if no measurements
        }

        const latest = weightMeasurements[0];
        // Convert to lbs if needed
        if (latest.unit === 'kg') {
            return latest.value * 2.20462;
        }
        return latest.value;
    }

    // ==================== NAMED FOODS OPERATIONS ====================

    /**
     * Add a named food
     */
    async addNamedFood(data) {
        const entry = {
            name: data.name,
            format_type: data.format_type, // 'per_serving' | 'per_gram' | 'per_batch'
            protein: data.protein || 0,
            carbs: data.carbs || 0,
            fat: data.fat || 0,
            fiber: data.fiber || 0,
            calories: data.calories || 0,
            serving_size: data.serving_size || null, // For per_serving
            grams: data.grams || null, // For per_gram
            batch_servings: data.batch_servings || null, // For per_batch
            notes: data.notes || '',
            starred: data.starred || false,
            starred_at: data.starred_at || null,
            created_at: data.created_at || Date.now(),
            updated_at: data.updated_at || Date.now()
        };
        return this.add('named_foods', entry);
    }

    /**
     * Get all named foods
     */
    async getAllNamedFoods() {
        const foods = await this.getAll('named_foods');
        // Sort alphabetically by name
        return foods.sort((a, b) => a.name.localeCompare(b.name));
    }

    async seedDefaultFoodsIfEmpty() {
        const existing = await this.getAll('named_foods');
        if (existing.length > 0) return;
        const now = Date.now();
        for (const food of DEFAULT_FOODS) {
            await this.addNamedFood({ ...food, created_at: now, updated_at: now });
        }
        console.log(`[db] Seeded ${DEFAULT_FOODS.length} default foods`);
    }

    /**
     * Get a named food by ID
     */
    async getNamedFood(id) {
        return this.get('named_foods', id);
    }

    /**
     * Update a named food
     */
    async updateNamedFood(data) {
        data.updated_at = Date.now();
        return this.update('named_foods', data);
    }

    /**
     * Delete a named food
     */
    async deleteNamedFood(id) {
        return this.delete('named_foods', id);
    }

    /**
     * Calculate macros from named food based on quantity
     */
    calculateMacrosFromNamedFood(food, quantity) {
        let multiplier = 1;

        switch (food.format_type) {
            case 'per_serving':
                // quantity = number of servings
                multiplier = quantity;
                break;
            case 'per_gram':
                // Food values are per 100g, quantity is in grams
                multiplier = quantity / 100;
                break;
            case 'per_batch':
                // quantity = number of servings from batch
                // Total batch macros divided by batch_servings, then multiplied by quantity
                multiplier = quantity / food.batch_servings;
                break;
        }

        return {
            protein: food.protein * multiplier,
            carbs: food.carbs * multiplier,
            fat: food.fat * multiplier,
            fiber: food.fiber * multiplier,
            calories: food.calories * multiplier
        };
    }

    // ==================== SETTINGS OPERATIONS ====================

    /**
     * Set a setting
     */
    async setSetting(key, value) {
        const setting = {
            key: key,
            value: value,
            updated_at: Date.now()
        };
        return this.update('settings', setting);
    }

    /**
     * Get a setting
     */
    async getSetting(key) {
        const result = await this.get('settings', key);
        return result ? result.value : null;
    }

    /**
     * Get all settings
     */
    async getAllSettings() {
        return this.getAll('settings');
    }

    /**
     * Delete a setting
     */
    async deleteSetting(key) {
        return this.delete('settings', key);
    }

    // ==================== UTILITY OPERATIONS ====================

    /**
     * Get today's date in YYYY-MM-DD format
     */
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Get date range for queries
     */
    getDateRange(days) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    /**
     * Clear all data (for testing or reset)
     */
    async getAllAnnotations() { return this.getAll('annotations'); }
    async getAnnotationByDate(date) {
        const all = await this.getAllAnnotations();
        return all.find(a => a.date === date) || null;
    }
    async upsertAnnotation(date, label) {
        const existing = await this.getAnnotationByDate(date);
        if (existing) {
            existing.label = label;
            return this.update('annotations', existing);
        }
        return this.add('annotations', { date, label });
    }
    async deleteAnnotation(id) { return this.delete('annotations', id); }

    async clearAllData() {
        const stores = ['macros', 'measurements', 'workouts', 'named_foods', 'settings', 'exercise_library', 'workout_templates'];
        const promises = stores.map(storeName => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        });

        return Promise.all(promises);
    }

    /**
     * Export all data to JSON
     */
    async exportAllData() {
        const data = {
            version: this.DB_VERSION,
            exported_at: new Date().toISOString(),
            macros: await this.getAllMacros(),
            measurements: await this.getAllMeasurements(),
            workouts: await this.getAllWorkouts(),
            named_foods: await this.getAllNamedFoods(),
            settings: await this.getAllSettings(),
            exercise_library: await this.getAllExercises(),
            workout_templates: await this.getAllWorkoutTemplates()
        };
        return data;
    }

    /**
     * Import data from JSON
     */
    async importData(data) {
        try {
            // Clear all existing data first so import is a restore, not a merge
            await this.clearAllData();

            // Import each store
            if (data.macros) {
                for (const entry of data.macros) {
                    delete entry.id; // Remove old ID to let autoIncrement assign new one
                    await this.addMacroEntry(entry);
                }
            }

            if (data.measurements) {
                for (const entry of data.measurements) {
                    delete entry.id;
                    await this.addMeasurement(entry);
                }
            }

            if (data.workouts) {
                for (const entry of data.workouts) {
                    delete entry.id;
                    await this.addWorkout(entry);
                }
            }

            if (data.named_foods) {
                for (const entry of data.named_foods) {
                    delete entry.id;
                    await this.addNamedFood(entry);
                }
            }

            if (data.settings) {
                // Handle settings as object or array
                if (Array.isArray(data.settings)) {
                    for (const entry of data.settings) {
                        await this.setSetting(entry.key, entry.value);
                    }
                } else if (typeof data.settings === 'object') {
                    for (const [key, value] of Object.entries(data.settings)) {
                        await this.setSetting(key, value);
                    }
                }
            }

            if (data.exercise_library) {
                for (const entry of data.exercise_library) {
                    delete entry.id;
                    await this.addExercise(entry);
                }
            }

            if (data.workout_templates) {
                for (const entry of data.workout_templates) {
                    delete entry.id;
                    await this.addWorkoutTemplate(entry);
                }
            }

            console.log('Data import completed successfully');
            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            throw error;
        }
    }

    // ==================== EXERCISE LIBRARY OPERATIONS ====================

    /**
     * Add an exercise to the library
     */
    async addExercise(data) {
        const entry = {
            name: data.name,
            type: data.type || 'Lifting', // 'Cardio' | 'Core' | 'Lifting'
            default_sets: data.default_sets || 3,
            default_reps: data.default_reps || 10,
            default_weight: data.default_weight || 0,
            default_weight_unit: data.default_weight_unit || 'lbs',
            notes: data.notes || '',
            created_at: data.created_at || Date.now(),
            updated_at: data.updated_at || Date.now()
        };
        return this.add('exercise_library', entry);
    }

    /**
     * Get all exercises
     */
    async getAllExercises() {
        const exercises = await this.getAll('exercise_library');
        return exercises.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get exercises by type
     */
    async getExercisesByType(type) {
        return this.getByIndex('exercise_library', 'type', type);
    }

    /**
     * Get an exercise by ID
     */
    async getExercise(id) {
        return this.get('exercise_library', id);
    }

    /**
     * Update an exercise
     */
    async updateExercise(data) {
        data.updated_at = Date.now();
        return this.update('exercise_library', data);
    }

    /**
     * Delete an exercise
     */
    async deleteExercise(id) {
        return this.delete('exercise_library', id);
    }

    // ==================== WORKOUT TEMPLATES OPERATIONS ====================

    /**
     * Add a workout template
     */
    async addWorkoutTemplate(data) {
        const entry = {
            name: data.name,
            description: data.description || '',
            exercises: data.exercises || [], // Array of exercise rows
            created_at: data.created_at || Date.now(),
            updated_at: data.updated_at || Date.now()
        };
        return this.add('workout_templates', entry);
    }

    /**
     * Get all workout templates
     */
    async getAllWorkoutTemplates() {
        const templates = await this.getAll('workout_templates');
        return templates.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Get a workout template by ID
     */
    async getWorkoutTemplate(id) {
        return this.get('workout_templates', id);
    }

    /**
     * Update a workout template
     */
    async updateWorkoutTemplate(data) {
        data.updated_at = Date.now();
        return this.update('workout_templates', data);
    }

    /**
     * Delete a workout template
     */
    async deleteWorkoutTemplate(id) {
        return this.delete('workout_templates', id);
    }
}

// Create and export singleton instance
export const db = new DatabaseManager();
