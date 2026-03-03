/**
 * Fitness Tracker PWA - Chart Renderer Component
 * Renders charts on the Trends screen using Chart.js
 */

import { db } from '../db.js';

let charts = {};

/**
 * Format a Date object as a local YYYY-MM-DD string (avoids UTC offset shifting the date).
 */
function localDateStr(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
        await renderMacroDelta(filteredMacros, days);
        await renderMacroCorrelation(filteredMacros, filteredMeasurements);

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

    // Load body stats for BMI and BMR/TDEE computation
    const heightIn      = parseFloat(await db.getSetting('user_height_in') || 0);
    const age           = parseFloat(await db.getSetting('user_age') || 0);
    const sex           = await db.getSetting('user_sex') || 'male';
    const activityFactor = parseFloat(await db.getSetting('tdee_activity_factor') || 0);
    const canComputeBodyStats = heightIn > 0 && age > 0;

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
    const todayStr = localDateStr(today);
    let minDateStr;
    if (days) {
        const start = new Date(today);
        start.setDate(start.getDate() - (days - 1));
        minDateStr = localDateStr(start);
    } else {
        const allDates = [...Object.keys(weightByDate), ...Object.keys(bfByDate)].sort();
        minDateStr = allDates[0] || todayStr;
    }

    const labels = [];
    const weightData = [];
    const leanMassData = [];
    const bmiData = [];
    const tdeeData = [];

    const cur = new Date(minDateStr + 'T12:00:00');
    const end = new Date(todayStr + 'T12:00:00');

    while (cur <= end) {
        const ds = localDateStr(cur);
        let wSum = 0, wCount = 0, bfSum = 0, bfCount = 0;
        for (let back = 0; back < 7; back++) {
            const d = new Date(cur);
            d.setDate(d.getDate() - back);
            const dds = localDateStr(d);
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

            if (canComputeBodyStats) {
                // BMI: 703 × lbs / in²
                bmiData.push(Math.round((703 * avgWeight / (heightIn * heightIn)) * 10) / 10);

                // Mifflin-St Jeor BMR, optionally scaled by activity factor → TDEE
                const weightKg = avgWeight * 0.453592;
                const heightCm = heightIn * 2.54;
                const bmr = sex === 'female'
                    ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
                    : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
                tdeeData.push(Math.round(activityFactor > 0 ? bmr * activityFactor : bmr));
            } else {
                bmiData.push(null);
                tdeeData.push(null);
            }
        }
        cur.setDate(cur.getDate() + 1);
    }

    const colors = getThemeColors();

    // y  — left axis: weight + lean mass (lbs)
    // y1 — right axis: BMI
    // y2 — right axis (stacked): TDEE (kcal)
    const datasets = [
        {
            label: 'Weight (lbs, 7d avg)',
            data: weightData,
            yAxisID: 'y',
            borderColor: colors.secondary,
            backgroundColor: colors.secondary + '20',
            tension: 0,
            pointRadius: 2,
            spanGaps: false
        }
    ];

    if (leanMassData.some(v => v !== null)) {
        datasets.push({
            label: 'Lean Mass (lbs, 7d avg)',
            data: leanMassData,
            yAxisID: 'y',
            borderColor: colors.success,
            backgroundColor: colors.success + '20',
            tension: 0,
            pointRadius: 2,
            spanGaps: false
        });
    }

    if (canComputeBodyStats && bmiData.some(v => v !== null)) {
        datasets.push({
            label: 'BMI',
            data: bmiData,
            yAxisID: 'y1',
            borderColor: colors.warning,
            backgroundColor: 'transparent',
            tension: 0,
            pointRadius: 2,
            borderDash: [4, 3],
            spanGaps: false
        });
        datasets.push({
            label: activityFactor > 0 ? 'TDEE (kcal)' : 'BMR (kcal)',
            data: tdeeData,
            yAxisID: 'y2',
            borderColor: colors.danger,
            backgroundColor: 'transparent',
            tension: 0,
            pointRadius: 2,
            borderDash: [2, 4],
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
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v === null || v === undefined) return null;
                            if (ctx.dataset.yAxisID === 'y1') return `${ctx.dataset.label}: ${v.toFixed(1)}`;
                            if (ctx.dataset.yAxisID === 'y2') return `${ctx.dataset.label}: ${Math.round(v)} kcal`;
                            return `${ctx.dataset.label}: ${v.toFixed(1)} lbs`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' }
                },
                y: {
                    position: 'left',
                    ticks: { color: colors.textSecondary },
                    grid: { color: colors.border + '40' },
                    title: { display: true, text: 'lbs', color: colors.textSecondary }
                },
                y1: {
                    position: 'right',
                    display: canComputeBodyStats,
                    ticks: { color: colors.warning },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'BMI', color: colors.warning }
                },
                y2: {
                    position: 'right',
                    display: canComputeBodyStats,
                    ticks: {
                        color: colors.danger,
                        callback: v => `${Math.round(v / 100) * 100}`
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: activityFactor > 0 ? 'TDEE kcal' : 'BMR kcal', color: colors.danger }
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

    // Determine date range using local dates to avoid UTC offset shifting the last day
    const today = new Date();
    let minDate, maxDate;

    if (days) {
        maxDate = localDateStr(today);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (days - 1));
        minDate = localDateStr(startDate);
    } else {
        [...macros, ...workouts].forEach(item => {
            if (!minDate || item.date < minDate) minDate = item.date;
            if (!maxDate || item.date > maxDate) maxDate = item.date;
        });
        if (!minDate || !maxDate) {
            minDate = maxDate = localDateStr(today);
        }
    }

    // Initialize dates object with all dates in range
    const dates = {};
    const cur = new Date(minDate + 'T12:00:00');
    const end = new Date(maxDate + 'T12:00:00');
    while (cur <= end) {
        dates[localDateStr(cur)] = { intake: 0, burned: 0 };
        cur.setDate(cur.getDate() + 1);
    }

    // Fill in actual data
    macros.forEach(m => {
        if (dates[m.date]) dates[m.date].intake += m.calories || 0;
    });
    workouts.forEach(w => {
        if (dates[w.date]) dates[w.date].burned += w.estimated_calories_burned || 0;
    });

    // Get calorie goal
    const goalFat = parseFloat(await db.getSetting('goal_fat') || 70);
    const goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
    const goalCarbs = parseFloat(await db.getSetting('goal_carbs') || 200);
    const goalCalories = (goalFat * 9) + (goalProtein * 4) + (goalCarbs * 4);

    const sortedDates = Object.keys(dates).sort();
    const labels = sortedDates;
    const intakeData = sortedDates.map(d => dates[d].intake);
    const burnedData = sortedDates.map(d => dates[d].burned);
    const netData = sortedDates.map(d => dates[d].intake - dates[d].burned);
    const goalData = sortedDates.map(() => goalCalories);

    if (charts.calorieBalance) charts.calorieBalance.destroy();

    const colors = getThemeColors();

    charts.calorieBalance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
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
            plugins: { legend: { labels: { color: colors.text } } },
            scales: {
                x: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } }
            }
        }
    });
}

/**
 * Render macro over/under line chart.
 * Shows daily (actual − goal) in grams for fat, protein, and carbs.
 * Zero = goal met; positive = over; negative = under.
 * @param {Array} macros - Filtered completed macro entries
 * @param {number|null} days - Number of days to show, or null for all time
 */
async function renderMacroDelta(macros, days) {
    const ctx = document.getElementById('macro-delta-chart');
    if (!ctx) return;

    if (charts.macroDelta) charts.macroDelta.destroy();

    const goalFat     = parseFloat(await db.getSetting('goal_fat')     || 70);
    const goalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
    const goalCarbs   = parseFloat(await db.getSetting('goal_carbs')   || 200);

    // Determine date range using local dates
    const today = new Date();
    let minDate, maxDate;

    if (days) {
        maxDate = localDateStr(today);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (days - 1));
        minDate = localDateStr(startDate);
    } else {
        macros.forEach(m => {
            if (!minDate || m.date < minDate) minDate = m.date;
            if (!maxDate || m.date > maxDate) maxDate = m.date;
        });
        if (!minDate || !maxDate) {
            minDate = maxDate = localDateStr(today);
        }
    }

    // Build per-day totals
    const byDate = {};
    const cur = new Date(minDate + 'T12:00:00');
    const end = new Date(maxDate + 'T12:00:00');
    while (cur <= end) {
        byDate[localDateStr(cur)] = { fat: 0, protein: 0, carbs: 0 };
        cur.setDate(cur.getDate() + 1);
    }

    macros.forEach(m => {
        if (byDate[m.date]) {
            byDate[m.date].fat     += m.fat     || 0;
            byDate[m.date].protein += m.protein || 0;
            byDate[m.date].carbs   += m.carbs   || 0;
        }
    });

    const sortedDates = Object.keys(byDate).sort();
    const labels = sortedDates;
    const fatDelta     = sortedDates.map(d => Math.round((byDate[d].fat     - goalFat)     * 10) / 10);
    const proteinDelta = sortedDates.map(d => Math.round((byDate[d].protein - goalProtein) * 10) / 10);
    const carbsDelta   = sortedDates.map(d => Math.round((byDate[d].carbs   - goalCarbs)   * 10) / 10);

    const colors = getThemeColors();

    charts.macroDelta = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Fat (g vs goal)',
                    data: fatDelta,
                    borderColor: colors.warning,
                    backgroundColor: 'transparent',
                    tension: 0,
                    pointRadius: 2
                },
                {
                    label: 'Protein (g vs goal)',
                    data: proteinDelta,
                    borderColor: colors.secondary,
                    backgroundColor: 'transparent',
                    tension: 0,
                    pointRadius: 2
                },
                {
                    label: 'Carbs (g vs goal)',
                    data: carbsDelta,
                    borderColor: colors.primary,
                    backgroundColor: 'transparent',
                    tension: 0,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { labels: { color: colors.text } } },
            scales: {
                x: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: {
                    ticks: {
                        color: colors.textSecondary,
                        callback: v => (v >= 0 ? '+' : '') + v + 'g'
                    },
                    grid: { color: colors.border + '40' }
                }
            }
        }
    });
}

/**
 * Render protein vs next-day weight change scatter chart.
 * For each day with a completed protein total, look up weight on that day
 * AND the next day. If both exist, emit point { x: dailyProtein, y: weightDelta }.
 * @param {Array} macros - Filtered completed macro entries
 * @param {Array} measurements - Filtered measurement entries
 */
async function renderMacroCorrelation(macros, measurements) {
    const ctx = document.getElementById('macro-correlation-chart');
    if (!ctx) return;
    if (charts.macroCorrelation) charts.macroCorrelation.destroy();

    const proteinByDate = {};
    macros.forEach(m => {
        proteinByDate[m.date] = (proteinByDate[m.date] || 0) + (m.protein || 0);
    });

    const weightByDate = {};
    measurements.filter(m => m.type === 'weight').forEach(m => {
        weightByDate[m.date] = m.unit === 'kg' ? m.value * 2.20462 : m.value;
    });

    const points = [];
    for (const date of Object.keys(proteinByDate)) {
        const nextDay = localDateStr(new Date(new Date(date + 'T12:00:00').getTime() + 86400000));
        if (weightByDate[date] !== undefined && weightByDate[nextDay] !== undefined) {
            points.push({
                x: Math.round(proteinByDate[date] * 10) / 10,
                y: Math.round((weightByDate[nextDay] - weightByDate[date]) * 100) / 100
            });
        }
    }

    const colors = getThemeColors();
    if (points.length < 3) {
        charts.macroCorrelation = new Chart(ctx, {
            type: 'scatter', data: { datasets: [] },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: colors.text } },
                    title: { display: true, text: 'Need more data (log weight on consecutive days)', color: colors.textSecondary }
                }
            }
        });
        return;
    }

    charts.macroCorrelation = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ label: 'Protein vs Next-Day Weight Δ', data: points, backgroundColor: colors.primary + 'aa', pointRadius: 5 }] },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { labels: { color: colors.text } } },
            scales: {
                x: { title: { display: true, text: 'Daily Protein (g)', color: colors.textSecondary }, ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: { title: { display: true, text: 'Next-Day Weight Δ (lbs)', color: colors.textSecondary },
                     ticks: { color: colors.textSecondary, callback: v => (v >= 0 ? '+' : '') + v.toFixed(2) + ' lbs' },
                     grid: { color: colors.border + '40' } }
            }
        }
    });
}
