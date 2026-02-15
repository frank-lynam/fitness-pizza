/**
 * Fitness Tracker PWA - Chart Renderer Component
 * Renders charts on the Trends screen using Chart.js
 */

import { db } from '../db.js';

let charts = {};

/**
 * Initialize all charts on the trends screen
 */
export async function initCharts() {
    // Default to 30 days
    await renderCharts(30);

    // Set up date range buttons
    const rangeButtons = document.querySelectorAll('.btn-range');
    rangeButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // Remove active class from all buttons
            rangeButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            e.target.classList.add('active');

            const range = e.target.dataset.range;
            const days = range === 'all' ? null : parseInt(range);
            await renderCharts(days);
        });
    });

    // Remove active class from all buttons first, then set 30 days as active
    rangeButtons.forEach(b => b.classList.remove('active'));
    const thirtyDayButton = Array.from(rangeButtons).find(b => b.dataset.range === '30');
    if (thirtyDayButton) {
        thirtyDayButton.classList.add('active');
    }
}

/**
 * Render all charts with the specified date range
 * @param {number|null} days - Number of days to show, or null for all time
 */
async function renderCharts(days) {
    try {
        // Get data
        const macros = await db.getAllMacros();
        const workouts = await db.getAllWorkouts();
        const measurements = await db.getAllMeasurements();

        // Filter by date range - from today backward
        const now = Date.now();
        const cutoff = days ? now - (days * 24 * 60 * 60 * 1000) : 0;

        // Filter to only include data from cutoff date to today (not from cutoff forward indefinitely)
        const filteredMacros = macros.filter(m => m.timestamp >= cutoff && m.timestamp <= now && m.status === 'completed');
        const filteredWorkouts = workouts.filter(w => w.timestamp >= cutoff && w.timestamp <= now);
        const filteredMeasurements = measurements.filter(m => m.timestamp >= cutoff && m.timestamp <= now);

        // Render individual charts
        await renderMacroDistribution(filteredMacros);
        await renderCalorieBalance(filteredMacros, filteredWorkouts);
        await renderWeightTrend(filteredMeasurements);
        await renderWorkoutVolume(filteredWorkouts);

    } catch (error) {
        console.error('Error rendering charts:', error);
    }
}

/**
 * Get theme-aware colors from CSS variables
 */
function getThemeColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const theme = root.getAttribute('data-theme');

    // TRS-80 uses different shades of green
    if (theme === 'trs-80') {
        return {
            primary: '#00ff00',
            secondary: '#00dd00',
            success: '#00bb00',
            warning: '#009900',
            danger: '#007700',
            text: '#00ff00',
            textSecondary: '#00dd00',
            border: '#003300'
        };
    }

    return {
        primary: style.getPropertyValue('--accent-primary').trim() || '#d4c5b0',
        secondary: style.getPropertyValue('--accent-secondary').trim() || '#7a6b9f',
        success: style.getPropertyValue('--accent-success').trim() || '#5f9b7a',
        warning: style.getPropertyValue('--accent-warning').trim() || '#b8884f',
        danger: style.getPropertyValue('--accent-danger').trim() || '#b66a6a',
        text: style.getPropertyValue('--text-primary').trim() || '#f1f5f9',
        textSecondary: style.getPropertyValue('--text-secondary').trim() || '#cbd5e1',
        border: style.getPropertyValue('--border-color').trim() || '#475569'
    };
}

/**
 * Render macro distribution pie chart
 */
async function renderMacroDistribution(macros) {
    const ctx = document.getElementById('macro-distribution-chart');
    if (!ctx) return;

    // Calculate totals
    const totalFat = macros.reduce((sum, m) => sum + (m.fat || 0), 0);
    const totalProtein = macros.reduce((sum, m) => sum + (m.protein || 0), 0);
    const totalCarbs = macros.reduce((sum, m) => sum + (m.carbs || 0), 0);

    // Destroy existing chart
    if (charts.macroDistribution) {
        charts.macroDistribution.destroy();
    }

    const colors = getThemeColors();

    // Create new chart
    charts.macroDistribution = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Fat', 'Carbs', 'Protein'],
            datasets: [{
                data: [totalFat, totalCarbs, totalProtein],
                backgroundColor: [colors.warning, colors.success, colors.primary]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text
                    }
                }
            }
        }
    });
}

/**
 * Render calorie balance line chart
 */
async function renderCalorieBalance(macros, workouts) {
    const ctx = document.getElementById('calorie-balance-chart');
    if (!ctx) return;

    // Determine date range from the filtered data
    let minDate = null;
    let maxDate = null;

    // Find earliest and latest dates from macros and workouts
    [...macros, ...workouts].forEach(item => {
        if (!minDate || item.date < minDate) minDate = item.date;
        if (!maxDate || item.date > maxDate) maxDate = item.date;
    });

    // If no data, use today
    if (!minDate || !maxDate) {
        const today = new Date().toISOString().split('T')[0];
        minDate = maxDate = today;
    }

    // Initialize dates object with all dates in range
    const dates = {};
    const currentDate = new Date(minDate);
    const endDate = new Date(maxDate);

    while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        dates[dateStr] = { intake: 0, burned: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill in actual data
    macros.forEach(m => {
        if (dates[m.date]) {
            dates[m.date].intake += m.calories || 0;
        }
    });

    workouts.forEach(w => {
        if (dates[w.date]) {
            dates[w.date].burned += w.estimated_calories_burned || 0;
        }
    });

    // Sort dates and prepare chart data
    const sortedDates = Object.keys(dates).sort();
    const labels = sortedDates;
    const intakeData = sortedDates.map(d => dates[d].intake);
    const burnedData = sortedDates.map(d => dates[d].burned);
    const netData = sortedDates.map(d => dates[d].intake - dates[d].burned);

    // Destroy existing chart
    if (charts.calorieBalance) {
        charts.calorieBalance.destroy();
    }

    const colors = getThemeColors();

    // Create new chart
    charts.calorieBalance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Intake',
                    data: intakeData,
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + '20',
                    tension: 0
                },
                {
                    label: 'Burned',
                    data: burnedData,
                    borderColor: colors.danger,
                    backgroundColor: colors.danger + '20',
                    tension: 0
                },
                {
                    label: 'Net',
                    data: netData,
                    borderColor: colors.success,
                    backgroundColor: colors.success + '20',
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                },
                y: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                }
            }
        }
    });
}

/**
 * Render weight trend line chart
 */
async function renderWeightTrend(measurements) {
    const ctx = document.getElementById('weight-trend-chart');
    if (!ctx) return;

    // Filter weight measurements
    const weightData = measurements
        .filter(m => m.type === 'weight')
        .sort((a, b) => a.timestamp - b.timestamp);

    const labels = weightData.map(m => m.date);
    const data = weightData.map(m => m.value);

    // Destroy existing chart
    if (charts.weightTrend) {
        charts.weightTrend.destroy();
    }

    const colors = getThemeColors();

    // Create new chart
    charts.weightTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (lbs)',
                data: data,
                borderColor: colors.secondary,
                backgroundColor: colors.secondary + '20',
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                },
                y: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                }
            }
        }
    });
}

/**
 * Render workout volume bar chart
 */
async function renderWorkoutVolume(workouts) {
    const ctx = document.getElementById('workout-volume-chart');
    if (!ctx) return;

    // Group by date
    const dates = {};

    workouts.forEach(w => {
        if (!dates[w.date]) {
            dates[w.date] = 0;
        }
        dates[w.date] += w.estimated_calories_burned || 0;
    });

    // Sort dates
    const sortedDates = Object.keys(dates).sort();
    const labels = sortedDates;
    const data = sortedDates.map(d => dates[d]);

    // Destroy existing chart
    if (charts.workoutVolume) {
        charts.workoutVolume.destroy();
    }

    const colors = getThemeColors();

    // Create new chart
    charts.workoutVolume = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Calories Burned',
                data: data,
                backgroundColor: colors.warning
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                },
                y: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' },
                    beginAtZero: true
                }
            }
        }
    });
}
