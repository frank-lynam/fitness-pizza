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
        await renderCalorieBalance(filteredMacros, filteredWorkouts, days);
        await renderWeightTrend(filteredMeasurements);
        await renderWorkoutVolume(filteredWorkouts);
        await renderContractileTissue(measurements, days); // uses all measurements for rolling avg

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
 * @param {Array} macros - Filtered macro entries
 * @param {Array} workouts - Filtered workout entries
 * @param {number|null} days - Number of days to show, or null for all time
 */
async function renderCalorieBalance(macros, workouts, days) {
    const ctx = document.getElementById('calorie-balance-chart');
    if (!ctx) return;

    // Determine date range based on days parameter
    let minDate, maxDate;

    if (days) {
        // For specific day ranges, calculate from today backward
        const today = new Date();
        maxDate = today.toISOString().split('T')[0];

        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (days - 1));
        minDate = startDate.toISOString().split('T')[0];
    } else {
        // For "All Time", use date range from the data
        [...macros, ...workouts].forEach(item => {
            if (!minDate || item.date < minDate) minDate = item.date;
            if (!maxDate || item.date > maxDate) maxDate = item.date;
        });

        // If no data, use today
        if (!minDate || !maxDate) {
            const today = new Date().toISOString().split('T')[0];
            minDate = maxDate = today;
        }
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

    // Get calorie goal
    const goalFat = parseFloat(await db.getSetting('goal_fat') || 70);
    const goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
    const goalCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);
    const goalCalories = (goalFat * 9) + (goalProtein * 4) + (goalCarbs * 4);

    // Sort dates and prepare chart data
    const sortedDates = Object.keys(dates).sort();
    const labels = sortedDates;
    const intakeData = sortedDates.map(d => dates[d].intake);
    const burnedData = sortedDates.map(d => dates[d].burned);
    const netData = sortedDates.map(d => dates[d].intake - dates[d].burned);
    const goalData = sortedDates.map(() => goalCalories); // Flat line at goal

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
                    label: 'Goal',
                    data: goalData,
                    borderColor: colors.textSecondary,
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 0
                },
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
                tension: 0
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
 * Render contractile tissue (lean mass) trend chart.
 * Uses a 7-day rolling average of weight and body_fat % measurements.
 * Lean mass (lbs) = weight_lbs × (1 − body_fat_pct / 100)
 * Only plots dates where both a rolling-average weight AND body fat % are available.
 * @param {Array} allMeasurements - All measurements (unfiltered, for rolling window)
 * @param {number|null} days - Display range
 */
async function renderContractileTissue(allMeasurements, days) {
    const ctx = document.getElementById('contractile-tissue-chart');
    if (!ctx) return;

    if (charts.contractileTissue) charts.contractileTissue.destroy();

    // Sort all weight and body_fat readings chronologically
    const weightReadings = allMeasurements
        .filter(m => m.type === 'weight')
        .sort((a, b) => a.timestamp - b.timestamp);
    const bfReadings = allMeasurements
        .filter(m => m.type === 'body_fat')
        .sort((a, b) => a.timestamp - b.timestamp);

    if (weightReadings.length === 0 || bfReadings.length === 0) {
        charts.contractileTissue = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Lean Mass (lbs)', data: [] }] },
            options: { responsive: true, maintainAspectRatio: true,
                plugins: { legend: { labels: { color: getThemeColors().text } } } }
        });
        return;
    }

    // Build daily value maps (use last reading of the day)
    const weightByDate = {};
    for (const r of weightReadings) {
        // Convert lbs to lbs (keep), convert kg to lbs if needed
        const valueLbs = r.unit === 'kg' ? r.value * 2.20462 : r.value;
        weightByDate[r.date] = valueLbs;
    }
    const bfByDate = {};
    for (const r of bfReadings) {
        bfByDate[r.date] = r.value; // already in %
    }

    // Determine date range for the chart display
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    let minDateStr;
    if (days) {
        const start = new Date(today);
        start.setDate(start.getDate() - (days - 1));
        minDateStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    } else {
        const allDates = [...Object.keys(weightByDate), ...Object.keys(bfByDate)].sort();
        minDateStr = allDates[0] || todayStr;
    }

    // Compute 7-day rolling average for each day in display range
    // For each display date, look back up to 7 days to average weight and bf %
    const labels = [];
    const leanMassData = [];

    const cur = new Date(minDateStr + 'T12:00:00');
    const end = new Date(todayStr + 'T12:00:00');

    while (cur <= end) {
        const dateStr = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;

        // Collect readings from the past 7 days (including today)
        let wSum = 0, wCount = 0, bfSum = 0, bfCount = 0;
        for (let back = 0; back < 7; back++) {
            const d = new Date(cur);
            d.setDate(d.getDate() - back);
            const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (weightByDate[ds] !== undefined) { wSum += weightByDate[ds]; wCount++; }
            if (bfByDate[ds]     !== undefined) { bfSum += bfByDate[ds];     bfCount++; }
        }

        if (wCount > 0 && bfCount > 0) {
            const avgWeight = wSum / wCount;
            const avgBF     = bfSum / bfCount;
            const leanMass  = avgWeight * (1 - avgBF / 100);
            labels.push(dateStr);
            leanMassData.push(Math.round(leanMass * 10) / 10);
        }

        cur.setDate(cur.getDate() + 1);
    }

    const colors = getThemeColors();

    charts.contractileTissue = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Lean Mass (lbs)',
                data: leanMassData,
                borderColor: colors.success,
                backgroundColor: colors.success + '20',
                tension: 0,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: colors.text } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.parsed.y.toFixed(1)} lbs lean mass`
                    }
                }
            },
            scales: {
                x: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } }
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
