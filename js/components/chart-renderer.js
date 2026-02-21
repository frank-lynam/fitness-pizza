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
        await renderBodyComposition(measurements, days); // full measurements for rolling avg
        await renderCalorieBalance(filteredMacros, filteredWorkouts, days);
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
 * Render combined weight + lean mass (contractile tissue) trend chart.
 * Both series use a 7-day rolling average. Lean mass only plotted when
 * body fat % data is also available.
 * @param {Array} allMeasurements - All measurements (unfiltered, for rolling window)
 * @param {number|null} days - Display range
 */
async function renderBodyComposition(allMeasurements, days) {
    const ctx = document.getElementById('body-composition-chart');
    if (!ctx) return;

    if (charts.weightTrend)      charts.weightTrend.destroy();
    if (charts.contractileTissue) charts.contractileTissue.destroy();
    if (charts.bodyComposition)   charts.bodyComposition.destroy();

    const weightReadings = allMeasurements
        .filter(m => m.type === 'weight')
        .sort((a, b) => a.timestamp - b.timestamp);
    const bfReadings = allMeasurements
        .filter(m => m.type === 'body_fat')
        .sort((a, b) => a.timestamp - b.timestamp);

    if (weightReadings.length === 0) {
        charts.bodyComposition = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: true,
                plugins: { legend: { labels: { color: getThemeColors().text } } } }
        });
        return;
    }

    // Build daily value maps (last reading of each day)
    const weightByDate = {};
    for (const r of weightReadings) {
        weightByDate[r.date] = r.unit === 'kg' ? r.value * 2.20462 : r.value;
    }
    const bfByDate = {};
    for (const r of bfReadings) {
        bfByDate[r.date] = r.value;
    }

    // Determine display date range
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const todayStr = dateStr(today);
    let minDateStr;
    if (days) {
        const start = new Date(today);
        start.setDate(start.getDate() - (days - 1));
        minDateStr = dateStr(start);
    } else {
        const allDates = [...Object.keys(weightByDate), ...Object.keys(bfByDate)].sort();
        minDateStr = allDates[0] || todayStr;
    }

    const labels = [];
    const weightData = [];
    const leanMassData = [];

    const cur = new Date(minDateStr + 'T12:00:00');
    const end = new Date(todayStr + 'T12:00:00');

    while (cur <= end) {
        const ds = dateStr(cur);
        let wSum = 0, wCount = 0, bfSum = 0, bfCount = 0;
        for (let back = 0; back < 7; back++) {
            const d = new Date(cur);
            d.setDate(d.getDate() - back);
            const dds = dateStr(d);
            if (weightByDate[dds] !== undefined) { wSum += weightByDate[dds]; wCount++; }
            if (bfByDate[dds]     !== undefined) { bfSum += bfByDate[dds];     bfCount++; }
        }

        if (wCount > 0) {
            const avgWeight = wSum / wCount;
            labels.push(ds);
            weightData.push(Math.round(avgWeight * 10) / 10);
            leanMassData.push(bfCount > 0
                ? Math.round(avgWeight * (1 - (bfSum / bfCount) / 100) * 10) / 10
                : null);
        }
        cur.setDate(cur.getDate() + 1);
    }

    const colors = getThemeColors();
    const datasets = [{
        label: 'Weight (lbs, 7d avg)',
        data: weightData,
        borderColor: colors.secondary,
        backgroundColor: colors.secondary + '20',
        tension: 0,
        pointRadius: 2,
        spanGaps: false
    }];

    if (leanMassData.some(v => v !== null)) {
        datasets.push({
            label: 'Lean Mass (lbs, 7d avg)',
            data: leanMassData,
            borderColor: colors.success,
            backgroundColor: colors.success + '20',
            tension: 0,
            pointRadius: 2,
            spanGaps: false
        });
    }

    charts.bodyComposition = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: colors.text } },
                tooltip: {
                    callbacks: { label: ctx => `${ctx.parsed.y?.toFixed(1)} lbs` }
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
