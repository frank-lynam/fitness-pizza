/**
 * Fitness Tracker PWA - Chart Renderer Component
 * Renders charts on the Trends screen using Chart.js
 */

import { db } from '../db.js';
import { applyWorkoutCredit } from '../utils/calorie-calc.js';
import { KCAL_PER_LB_FAT } from '../constants.js';

let charts = {};
let _annotationCache = null;
let _lastDays = 30;

async function getAnnotations() {
    if (!_annotationCache) _annotationCache = await db.getAllAnnotations();
    return _annotationCache;
}

function buildAnnotationPluginConfig(labels) {
    const annotations = (_annotationCache || []).filter(a => labels.includes(a.date));
    const config = {};
    annotations.forEach(a => {
        config[`note_${a.id}`] = {
            type: 'line',
            xMin: a.date,
            xMax: a.date,
            borderColor: 'rgba(255,200,50,0.7)',
            borderWidth: 1.5,
            borderDash: [4, 3],
            label: {
                display: true,
                content: a.label,
                position: 'start',
                backgroundColor: 'rgba(0,0,0,0.65)',
                color: '#fff',
                font: { size: 10 },
                padding: 3,
                yAdjust: 4,
            },
        };
    });
    return config;
}

async function showAnnotationDialog(date) {
    const existing = (_annotationCache || []).find(a => a.date === date);
    const label = window.prompt(
        `Note for ${date} (leave empty to delete):`,
        existing ? existing.label : ''
    );
    if (label === null) return; // cancelled
    if (label.trim() === '') {
        if (existing) await db.deleteAnnotation(existing.id);
    } else {
        await db.upsertAnnotation(date, label.trim());
    }
    _annotationCache = null; // clear cache so next render reloads
}

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
    _lastDays = days;
    try {
        // Pre-load annotations for this render pass
        _annotationCache = null;
        await getAnnotations();

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
        // Render individual charts
        await renderBodyComposition(measurements, days); // full measurements for rolling avg
        await renderWaistTrend(measurements, days);
        await renderCalorieBalance(filteredMacros, filteredWorkouts, days);
        await renderMacroDelta(filteredMacros, filteredWorkouts, days);
        // All-time data for TDEE inference (more history = better estimates)
        await renderInferredTDEE(macros.filter(m => m.status === 'completed'), measurements, workouts, days);

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

    // Load body stats for BMI computation
    const heightIn = parseFloat(await db.getSetting('user_height_in') || 0);
    const age      = parseFloat(await db.getSetting('user_age') || 0);
    const sex      = await db.getSetting('user_sex') || 'male';
    const canComputeBodyStats = heightIn > 0 && age > 0;

    // Per-method body fat maps (keyed by date, last reading wins)
    const bfByDateNavy = {}, bfByDateCaliper = {}, bfByDateManual = {};
    for (const r of bfReadings) {
        const notes = (r.notes || '').toLowerCase();
        if (notes.includes('navy'))                              bfByDateNavy[r.date]    = r.value;
        else if (notes.includes('jp') || notes.includes('caliper')) bfByDateCaliper[r.date] = r.value;
        else                                                     bfByDateManual[r.date]  = r.value;
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
    const weightRawData = [];   // raw daily weight — dots show water-weight noise
    const leanMassData = [];
    const bmiData = [];

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

        // Include date if there's weight data OR a raw body fat reading for this day
        if (wCount > 0 || bfByDate[ds] !== undefined) {
            const avgWeight = wCount > 0 ? wSum / wCount : null;
            labels.push(ds);
            weightData.push(avgWeight !== null ? Math.round(avgWeight * 10) / 10 : null);
            weightRawData.push(weightByDate[ds] !== undefined
                ? Math.round(weightByDate[ds] * 10) / 10 : null);
            leanMassData.push(avgWeight !== null && bfCount > 0
                ? Math.round(avgWeight * (1 - (bfSum / bfCount) / 100) * 10) / 10
                : null);
            if (canComputeBodyStats && avgWeight !== null) {
                bmiData.push(Math.round((703 * avgWeight / (heightIn * heightIn)) * 10) / 10);
            } else {
                bmiData.push(null);
            }
        }
        cur.setDate(cur.getDate() + 1);
    }

    // Per-method body fat positional arrays aligned with labels
    const bfNavyData    = labels.map(d => bfByDateNavy[d]    ?? null);
    const bfCaliperData = labels.map(d => bfByDateCaliper[d] ?? null);
    const bfManualData  = labels.map(d => bfByDateManual[d]  ?? null);

    // Linear trend over last 14 days of body fat readings
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = localDateStr(twoWeeksAgo);
    const recentBF = bfReadings.filter(r => r.date >= twoWeeksAgoStr);
    let bfTrendData = labels.map(() => null);
    if (recentBF.length >= 2) {
        const t0 = new Date(recentBF[0].date + 'T12:00:00').getTime();
        const xs = recentBF.map(r => (new Date(r.date + 'T12:00:00').getTime() - t0) / 86400000);
        const ys = recentBF.map(r => r.value);
        const n  = xs.length;
        const mx = xs.reduce((s, x) => s + x, 0) / n;
        const my = ys.reduce((s, y) => s + y, 0) / n;
        const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        const slope = denom > 0
            ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom
            : 0;
        const intercept = my - slope * mx;
        bfTrendData = labels.map(d => {
            if (d < recentBF[0].date || d > todayStr) return null;
            const x = (new Date(d + 'T12:00:00').getTime() - t0) / 86400000;
            return Math.round((slope * x + intercept) * 10) / 10;
        });
    }

    const colors = getThemeColors();

    // y  — left axis: weight + lean mass (lbs)
    // y1 — right axis: BMI
    // y2 — right axis (stacked): body fat %
    const datasets = [
        {
            // Raw daily readings — gap to trend line ≈ water weight deviation
            label: 'Weight (raw)',
            data: weightRawData,
            yAxisID: 'y',
            borderColor: 'transparent',
            backgroundColor: colors.textSecondary + '55',
            pointRadius: 3,
            pointHoverRadius: 5,
            showLine: false,
            order: 2,
            spanGaps: false
        },
        {
            label: 'Weight (lbs, 7d avg)',
            data: weightData,
            yAxisID: 'y',
            borderColor: colors.secondary,
            backgroundColor: colors.secondary + '20',
            tension: 0,
            pointRadius: 0,
            order: 1,
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
    }

    // Body fat scatter — one series per estimation method
    const bfMethodSeries = [
        { label: 'Body Fat % – Manual',   data: bfManualData,   color: colors.warning },
        { label: 'Body Fat % – Navy',     data: bfNavyData,     color: colors.primary },
        { label: 'Body Fat % – JP3 Caliper', data: bfCaliperData, color: colors.success },
    ];
    for (const { label, data, color } of bfMethodSeries) {
        if (!data.some(v => v !== null)) continue;
        datasets.push({
            label,
            data,
            yAxisID: 'y2',
            borderColor: 'transparent',
            backgroundColor: color,
            pointRadius: 5,
            pointHoverRadius: 7,
            showLine: false,
            spanGaps: false,
            order: 2
        });
    }

    // Body fat 2-week linear trend line
    if (bfTrendData.some(v => v !== null)) {
        datasets.push({
            label: 'Body Fat % (2-wk trend)',
            data: bfTrendData,
            yAxisID: 'y2',
            borderColor: colors.danger,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 3],
            tension: 0,
            pointRadius: 0,
            spanGaps: false,
            order: 1
        });
    }

    charts.bodyComposition = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.25,
            onClick: async (evt, _elems, chart) => {
                const xScale = chart.scales.x;
                if (!xScale) return;
                const xVal = xScale.getValueForPixel(evt.x);
                const idx = Math.round(xVal);
                const date = labels[idx];
                if (!date) return;
                await showAnnotationDialog(date);
                await renderCharts(_lastDays);
            },
            plugins: {
                legend: { labels: { color: colors.text } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v === null || v === undefined) return null;
                            if (ctx.dataset.yAxisID === 'y1') return `${ctx.dataset.label}: ${v.toFixed(1)}`;
                            if (ctx.dataset.yAxisID === 'y2') return `${ctx.dataset.label}: ${v.toFixed(1)}%`;
                            if (ctx.dataset.label === 'Weight (raw)') {
                                const trend = weightData[ctx.dataIndex];
                                if (trend !== null && trend !== undefined) {
                                    const dev = v - trend;
                                    const sign = dev >= 0 ? '+' : '';
                                    return `Raw: ${v.toFixed(1)} lbs  (${sign}${dev.toFixed(1)} vs trend)`;
                                }
                                return `Raw: ${v.toFixed(1)} lbs`;
                            }
                            return `${ctx.dataset.label}: ${v.toFixed(1)} lbs`;
                        }
                    }
                },
                annotation: { annotations: buildAnnotationPluginConfig(labels) }
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
                    display: canComputeBodyStats && bmiData.some(v => v !== null),
                    ticks: { color: colors.warning },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'BMI', color: colors.warning }
                },
                y2: {
                    position: 'right',
                    display: bfReadings.length > 0,
                    min: 0,
                    ticks: {
                        color: colors.primary,
                        callback: v => `${v}%`
                    },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Body Fat %', color: colors.primary }
                }
            }
        }
    });
}

async function renderWaistTrend(allMeasurements, days) {
    const ctx     = document.getElementById('waist-trend-chart');
    const section = document.getElementById('waist-trend-section');
    if (!ctx) return;
    if (charts.waistTrend) charts.waistTrend.destroy();

    const waistReadings = allMeasurements
        .filter(m => m.type === 'waist')
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => ({ date: m.date, value: m.unit === 'cm' ? m.value / 2.54 : m.value }));

    if (waistReadings.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    // Filter to display range
    const today = new Date();
    const todayStr = localDateStr(today);
    const minDateStr = days
        ? localDateStr(new Date(today.getTime() - (days - 1) * 86400000))
        : waistReadings[0].date;

    const filtered = waistReadings.filter(r => r.date >= minDateStr);
    if (filtered.length === 0) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = '';

    const colors = getThemeColors();

    // Linear regression over displayed waist readings
    const t0 = new Date(filtered[0].date + 'T12:00:00').getTime();
    const xs = filtered.map(r => (new Date(r.date + 'T12:00:00').getTime() - t0) / 86400000);
    const ys = filtered.map(r => r.value);
    const n  = xs.length;
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const slope = denom > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom : 0;
    const intercept = my - slope * mx;

    // Dense label array spanning first→last waist measurement
    const firstDate = filtered[0].date;
    const lastDate  = filtered[filtered.length - 1].date;
    const waistByDate = {};
    filtered.forEach(r => { waistByDate[r.date] = r.value; });

    const trendLabels = [], waistDots = [], trendLine = [];
    const cur = new Date(firstDate + 'T12:00:00');
    const end = new Date(lastDate  + 'T12:00:00');
    while (cur <= end) {
        const d = localDateStr(cur);
        const x = (cur.getTime() - new Date(firstDate + 'T12:00:00').getTime()) / 86400000;
        trendLabels.push(d);
        waistDots.push(waistByDate[d] ?? null);
        trendLine.push(Math.round((slope * x + intercept) * 100) / 100);
        cur.setDate(cur.getDate() + 1);
    }

    // 7-day rolling avg weight on the same time axis, for visual correlation
    const weightByDate = {};
    allMeasurements.filter(m => m.type === 'weight').forEach(m => {
        weightByDate[m.date] = m.unit === 'kg' ? m.value * 2.20462 : m.value;
    });
    const weightTrend = trendLabels.map((d, i) => {
        const dt = new Date(d + 'T12:00:00');
        let sum = 0, cnt = 0;
        for (let back = 0; back < 7; back++) {
            const dd = new Date(dt.getTime() - back * 86400000);
            const ds = localDateStr(dd);
            if (weightByDate[ds] !== undefined) { sum += weightByDate[ds]; cnt++; }
        }
        return cnt > 0 ? Math.round(sum / cnt * 10) / 10 : null;
    });
    const hasWeight = weightTrend.some(v => v !== null);

    // Stats line
    const statsEl = section?.querySelector('.waist-stats');
    if (statsEl) {
        const latest   = filtered[filtered.length - 1].value;
        const earliest = filtered[0].value;
        const totalChg = filtered.length >= 2 ? latest - earliest : null;
        const rateWk   = xs.length >= 2 ? slope * 7 : null;
        const heightIn  = parseFloat(await db.getSetting('user_height_in') || 0);
        const whr       = heightIn > 0 ? (latest / heightIn).toFixed(2) : null;
        const whrNote   = whr ? `  ·  W:H ${whr}${parseFloat(whr) < 0.5 ? ' ✓' : ''}` : '';
        const chgNote   = totalChg !== null
            ? `  ·  ${totalChg >= 0 ? '+' : ''}${totalChg.toFixed(1)}" total`
            : '';
        const rateNote  = rateWk !== null && Math.abs(rateWk) > 0.005
            ? `  ·  ${rateWk < 0 ? '↓' : '↑'}${Math.abs(rateWk).toFixed(2)}"/wk`
            : '';
        statsEl.textContent = `${latest.toFixed(1)}" now${chgNote}${rateNote}${whrNote}`;
    }

    const datasets = [
        {
            label: 'Waist (in)',
            data: waistDots,
            yAxisID: 'y',
            borderColor: 'transparent',
            backgroundColor: colors.primary,
            pointRadius: 5,
            pointHoverRadius: 7,
            showLine: false,
            order: 2
        },
        {
            label: 'Waist trend',
            data: trendLine,
            yAxisID: 'y',
            borderColor: colors.primary,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 3],
            tension: 0,
            pointRadius: 0,
            order: 1
        }
    ];

    if (hasWeight) {
        datasets.push({
            label: 'Weight (lbs, 7d avg)',
            data: weightTrend,
            yAxisID: 'y1',
            borderColor: colors.secondary,
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0,
            pointRadius: 0,
            spanGaps: true,
            order: 3
        });
    }

    charts.waistTrend = new Chart(ctx, {
        type: 'line',
        data: { labels: trendLabels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.25,
            plugins: {
                legend: { labels: { color: colors.text } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            if (v === null || v === undefined) return null;
                            return ctx.dataset.yAxisID === 'y1'
                                ? `${ctx.dataset.label}: ${v.toFixed(1)} lbs`
                                : `${ctx.dataset.label}: ${v.toFixed(1)}"`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: colors.textSecondary, maxTicksLimit: 10 },
                    grid:  { color: colors.border + '40' }
                },
                y: {
                    position: 'left',
                    ticks: { color: colors.textSecondary, callback: v => `${v}"` },
                    grid:  { color: colors.border + '40' },
                    title: { display: true, text: 'inches', color: colors.textSecondary }
                },
                y1: {
                    position: 'right',
                    display: hasWeight,
                    ticks: { color: colors.secondary },
                    grid:  { drawOnChartArea: false },
                    title: { display: true, text: 'lbs', color: colors.secondary }
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
    const ctx     = document.getElementById('calorie-balance-chart');
    const statsEl = document.getElementById('calorie-balance-stats');
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
            onClick: async (evt, _elems, chart) => {
                const xScale = chart.scales.x;
                if (!xScale) return;
                const idx = Math.round(xScale.getValueForPixel(evt.x));
                const date = labels[idx];
                if (!date) return;
                await showAnnotationDialog(date);
                await renderCharts(_lastDays);
            },
            plugins: {
                legend: { labels: { color: colors.text } },
                annotation: { annotations: buildAnnotationPluginConfig(labels) }
            },
            scales: {
                x: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } }
            }
        }
    });

    // Averages summary below the chart — exclude today (still in progress)
    if (statsEl) {
        const todayStr = localDateStr(today);
        const pastIndices = sortedDates
            .map((d, i) => ({ d, i }))
            .filter(({ d }) => d < todayStr)
            .map(({ i }) => i);
        if (pastIndices.length === 0) {
            statsEl.innerHTML = '';
        } else {
            const avg = arr => Math.round(pastIndices.reduce((s, i) => s + arr[i], 0) / pastIndices.length);
            const avgIntake  = avg(intakeData);
            const avgBurned  = avg(burnedData);
            const avgNet     = avg(netData);
            const netColor   = avgNet >= goalCalories
                ? 'var(--accent-danger)'
                : 'var(--accent-success)';
            statsEl.innerHTML = `
                <div style="display:flex;flex-wrap:wrap;gap:8px 20px;padding:8px 2px;font-size:13px;color:var(--text-secondary);">
                    <span>Avg intake: <strong style="color:var(--accent-primary);">${avgIntake.toLocaleString()} kcal</strong></span>
                    <span>Avg burned: <strong style="color:var(--accent-danger);">${avgBurned.toLocaleString()} kcal</strong></span>
                    <span>Avg net: <strong style="color:${netColor};">${avgNet.toLocaleString()} kcal</strong></span>
                    <span>Goal: <strong style="color:var(--text-primary);">${Math.round(goalCalories).toLocaleString()} kcal</strong></span>
                </div>`;
        }
    }
}

/**
 * Render macro over/under line chart.
 * Shows daily (actual − goal) in grams for fat, protein, and carbs.
 * Zero = goal met; positive = over; negative = under.
 * @param {Array} macros - Filtered completed macro entries
 * @param {Array} workouts - Filtered workout entries (for per-day goal adjustment)
 * @param {number|null} days - Number of days to show, or null for all time
 */
async function renderMacroDelta(macros, workouts, days) {
    const ctx = document.getElementById('macro-delta-chart');
    if (!ctx) return;

    if (charts.macroDelta) charts.macroDelta.destroy();

    const baseGoalFat     = parseFloat(await db.getSetting('goal_fat')     || 70);
    const baseGoalProtein = parseFloat(await db.getSetting('goal_protein') || 150);
    let   baseGoalCarbs   = parseFloat(await db.getSetting('goal_carbs')   || 200);

    // Deficit mode: derive carbs the same way calculateEffectiveGoals() does
    const deficitMode = (await db.getSetting('deficit_mode')) === 'true';
    if (deficitMode) {
        const inferredTDEE = parseFloat(await db.getSetting('inferred_tdee_cached') || 0);
        const deficitCal   = parseFloat(await db.getSetting('deficit_cal_per_day')  || 0);
        if (inferredTDEE > 0) {
            const derivedCarbs = (inferredTDEE - deficitCal - baseGoalProtein * 4 - baseGoalFat * 9) / 4;
            baseGoalCarbs = Math.max(0, derivedCarbs);
        }
    }

    // Read workout credit settings (must match calculateEffectiveGoals)
    // Deficit mode locks credit at 100% so net deficit stays constant on workout days
    const workoutCreditFraction = deficitMode ? 1.0 : parseFloat(await db.getSetting('workout_credit_fraction') || '0.5');
    const workoutCreditMacros = {
        fat:     parseFloat(await db.getSetting('workout_credit_fat_weight')     || '34'),
        protein: parseFloat(await db.getSetting('workout_credit_protein_weight') || '33'),
        carbs:   parseFloat(await db.getSetting('workout_credit_carbs_weight')   || '33'),
    };

    // Build per-day workout calories map
    const caloriesBurnedByDate = {};
    workouts.forEach(w => {
        caloriesBurnedByDate[w.date] = (caloriesBurnedByDate[w.date] || 0) + (w.estimated_calories_burned || 0);
    });

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

    // Per-day effective goals (base + workout credit using user-configured settings)
    const effectiveGoalsByDate = {};
    sortedDates.forEach(d => {
        effectiveGoalsByDate[d] = applyWorkoutCredit(
            baseGoalFat, baseGoalProtein, baseGoalCarbs,
            caloriesBurnedByDate[d] || 0,
            workoutCreditFraction, workoutCreditMacros
        );
    });

    // Per-day delta: actual − effective goal
    const fatDelta     = sortedDates.map(d => Math.round((byDate[d].fat     - effectiveGoalsByDate[d].fat)     * 10) / 10);
    const proteinDelta = sortedDates.map(d => Math.round((byDate[d].protein - effectiveGoalsByDate[d].protein) * 10) / 10);
    const carbsDelta   = sortedDates.map(d => Math.round((byDate[d].carbs   - effectiveGoalsByDate[d].carbs)   * 10) / 10);

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
            aspectRatio: 1.5,
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
 * Render empirically inferred TDEE from energy balance.
 *
 * For each pair of consecutive unique-date weight readings separated by
 * MIN_DAYS–MAX_DAYS, computes:
 *   TDEE = (scaled_calorie_intake − ΔW_lbs × 3500) / days
 * where scaled_intake adjusts for unlogged days proportionally.
 *
 * Uses ALL historical macro/weight data regardless of the date-range selector
 * so older data improves the estimate. Display is clipped to the selected range.
 *
 * @param {Array}       allCompletedMacros - All completed macro entries (unfiltered)
 * @param {Array}       allMeasurements    - All measurement entries (unfiltered)
 * @param {number|null} days               - Display window (null = all time)
 */
async function renderInferredTDEE(allCompletedMacros, allMeasurements, allWorkouts, days) {
    const ctx     = document.getElementById('inferred-tdee-chart');
    const statsEl = document.getElementById('inferred-tdee-stats');
    if (!ctx) return;
    if (charts.inferredTDEE) charts.inferredTDEE.destroy();

    const colors = getThemeColors();

    // Build daily calorie intake map (protein×4 + carbs×4 + fat×9)
    const caloriesByDate = {};
    allCompletedMacros.forEach(m => {
        const cal = (m.protein || 0) * 4 + (m.carbs || 0) * 4 + (m.fat || 0) * 9;
        caloriesByDate[m.date] = (caloriesByDate[m.date] || 0) + cal;
    });

    // Build daily workout calorie burn map
    const workoutCalsByDate = {};
    (allWorkouts || []).forEach(w => {
        if (w.estimated_calories_burned > 0) {
            workoutCalsByDate[w.date] = (workoutCalsByDate[w.date] || 0) + w.estimated_calories_burned;
        }
    });

    // Deduplicated, sorted weight readings (last reading per day → lbs)
    const rawWeights = allMeasurements
        .filter(m => m.type === 'weight')
        .sort((a, b) => a.timestamp - b.timestamp);
    const weightByDate = {};
    rawWeights.forEach(r => { weightByDate[r.date] = r.unit === 'kg' ? r.value * 2.20462 : r.value; });
    const weights = Object.keys(weightByDate).sort().map(d => ({ date: d, lbs: weightByDate[d] }));

    const noDataMsg = (msg) => {
        if (statsEl) statsEl.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;text-align:center;margin-top:8px;">${msg}</p>`;
        charts.inferredTDEE = new Chart(ctx, {
            type: 'line', data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1.25,
                plugins: { legend: { labels: { color: colors.text } } } }
        });
    };

    if (weights.length < 2) {
        noDataMsg('Log weight on at least 2 different days (≥14 days apart) with food logged in between to infer TDEE.');
        return;
    }

    const MIN_DAYS = 14;   // ≥2 weeks so real fat change (≈1 lb) exceeds water-weight noise
    const MAX_DAYS = 90;   // up to 3 months; prefer the longest window available
    const estimates = [];

    for (let j = 1; j < weights.length; j++) {
        // Find the LONGEST window ending at weights[j] that is within [MIN_DAYS, MAX_DAYS].
        // Preferring the longest window maximises signal-to-noise: real fat change grows
        // linearly with time while water-weight noise is roughly constant.
        let bestI = -1;
        for (let i = j - 1; i >= 0; i--) {
            const gap = Math.round(
                (new Date(weights[j].date + 'T12:00:00') - new Date(weights[i].date + 'T12:00:00')) / 86400000
            );
            if (gap > MAX_DAYS) break;
            if (gap >= MIN_DAYS) bestI = i;   // keep scanning – want the farthest valid i
        }
        if (bestI === -1) continue;

        const startW   = weights[bestI];
        const endW     = weights[j];
        const startDt  = new Date(startW.date + 'T12:00:00');
        const endDt    = new Date(endW.date + 'T12:00:00');
        const daysGap  = Math.round((endDt - startDt) / 86400000);

        // Sum calories, workout cals, and count logged days in [startDate, endDate)
        let totalIntake = 0, daysWithData = 0, totalWorkoutCals = 0;
        const cur = new Date(startDt);
        while (cur < endDt) {
            const d = localDateStr(cur);
            if (caloriesByDate[d] !== undefined) { totalIntake += caloriesByDate[d]; daysWithData++; }
            if (workoutCalsByDate[d] !== undefined) { totalWorkoutCals += workoutCalsByDate[d]; }
            cur.setDate(cur.getDate() + 1);
        }

        // Require ≥40% of days to have food logged; scale up for the rest
        if (daysWithData < Math.max(1, Math.ceil(daysGap * 0.4))) continue;
        const scaledIntake = totalIntake * daysGap / daysWithData;

        const deltaW = endW.lbs - startW.lbs;           // positive = gained weight
        const tdee   = (scaledIntake - deltaW * KCAL_PER_LB_FAT) / daysGap;
        if (tdee < 800 || tdee > 6000) continue;        // sanity filter

        // Inferred BMR = TDEE − avg workout calories per day (removes exercise component)
        const avgWorkoutPerDay = totalWorkoutCals / daysGap;
        const bmrEst = tdee - avgWorkoutPerDay;

        estimates.push({
            date: endW.date,
            tdee: Math.round(tdee),
            bmr: (bmrEst >= 800 && bmrEst <= 5000) ? Math.round(bmrEst) : null,
            daysGap,
            daysWithData,
            pctLogged: Math.round(daysWithData / daysGap * 100),
            deltaW: Math.round(deltaW * 100) / 100,
            avgIntake: Math.round(scaledIntake / daysGap),
            avgWorkoutCals: Math.round(avgWorkoutPerDay)
        });
    }

    if (estimates.length === 0) {
        const nWeigh = weights.length, nLog = Object.keys(caloriesByDate).length;
        noDataMsg(`No estimate yet — need weight on 2+ days ≥${MIN_DAYS} days apart with ≥40% of days with food logged. (${nWeigh} weigh-ins, ${nLog} days logged)`);
        return;
    }

    // Weighted mean & std-dev over ALL estimates (weight = daysGap = proxy for reliability)
    const totalW   = estimates.reduce((s, e) => s + e.daysGap, 0);
    const wMean    = Math.round(estimates.reduce((s, e) => s + e.tdee * e.daysGap, 0) / totalW);

    // Cache recent TDEE (last 30 days) for deficit mode; fall back to all-time mean if no recent data
    const thirtyDaysAgo = localDateStr(new Date(Date.now() - 30 * 86400000));
    const recentPool = estimates.filter(e => e.date >= thirtyDaysAgo);
    const pool = recentPool.length > 0 ? recentPool : estimates;
    const poolW = pool.reduce((s, e) => s + e.daysGap, 0);
    const recentTDEE = Math.round(pool.reduce((s, e) => s + e.tdee * e.daysGap, 0) / poolW);
    await db.setSetting('inferred_tdee_cached', String(recentTDEE));
    const wVar     = estimates.reduce((s, e) => s + e.daysGap * (e.tdee - wMean) ** 2, 0) / totalW;
    const wStdDev  = Math.round(Math.sqrt(wVar));

    // Cumulative weighted average up to each point — "best estimate using all data to date".
    // Unlike a rolling window, this only moves toward the true value as more data arrives.
    const cumulativeAvg = estimates.map((_, j) => {
        const cumul = estimates.slice(0, j + 1);
        const wt    = cumul.reduce((s, e) => s + e.daysGap, 0);
        return wt > 0 ? Math.round(cumul.reduce((s, e) => s + e.tdee * e.daysGap, 0) / wt) : null;
    });

    // Cumulative BMR avg = cumulative TDEE avg − cumulative workout avg (same weights)
    const bmrCumulativeAvg = estimates.map((_, j) => {
        const cumul      = estimates.slice(0, j + 1);
        const wt         = cumul.reduce((s, e) => s + e.daysGap, 0);
        if (wt === 0) return null;
        const avgTdee    = cumul.reduce((s, e) => s + e.tdee           * e.daysGap, 0) / wt;
        const avgWorkout = cumul.reduce((s, e) => s + e.avgWorkoutCals * e.daysGap, 0) / wt;
        const bmr        = Math.round(avgTdee - avgWorkout);
        return (bmr >= 800 && bmr <= 5000) ? bmr : null;
    });

    // Overall weighted mean BMR = overall TDEE mean − overall workout mean (same weights)
    const avgWorkoutAll = estimates.reduce((s, e) => s + e.avgWorkoutCals * e.daysGap, 0) / totalW;
    const hasWorkoutData = estimates.some(e => e.avgWorkoutCals > 0);
    const wMeanBmr = hasWorkoutData ? Math.round(wMean - avgWorkoutAll) : null;

    // Load formula BMR and optionally TDEE (Mifflin-St Jeor) using most recent weight
    let formulaBMR = null, formulaTDEE = null;
    const heightIn       = parseFloat(await db.getSetting('user_height_in') || 0);
    const age            = parseFloat(await db.getSetting('user_age') || 0);
    const sex            = await db.getSetting('user_sex') || 'male';
    const activityFactor = parseFloat(await db.getSetting('tdee_activity_factor') || 0);
    if (heightIn > 0 && age > 0) {
        const recentLbs = weights[weights.length - 1].lbs;
        const weightKg  = recentLbs * 0.453592;
        const heightCm  = heightIn * 2.54;
        const bmr = sex === 'female'
            ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
            : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
        formulaBMR  = Math.round(bmr);
        if (activityFactor > 0) formulaTDEE = Math.round(bmr * activityFactor);
    }

    // Clip display to selected date range
    const todayStr  = localDateStr(new Date());
    const cutoffStr = days ? localDateStr(new Date(Date.now() - days * 86400000)) : null;
    const dispIdx     = estimates.map((e, i) => i).filter(i => !cutoffStr || estimates[i].date >= cutoffStr);
    const dispEst     = dispIdx.map(i => estimates[i]);
    const dispRoll    = dispIdx.map(i => cumulativeAvg[i]);
    const dispBmrRoll = dispIdx.map(i => bmrCumulativeAvg[i]);
    const labels      = dispEst.map(e => e.date);

    // Build datasets
    const datasets = [
        {
            label: 'TDEE estimate per window',
            data: dispEst.map(e => e.tdee),
            borderColor: colors.primary + 'cc',
            backgroundColor: colors.primary + '66',
            pointRadius: dispEst.map(e => Math.max(3, Math.min(9, 2 + e.daysGap / 5))),
            pointHoverRadius: 10,
            showLine: false,
            tension: 0
        },
        {
            label: 'TDEE cumulative avg (all data)',
            data: dispRoll,
            borderColor: colors.primary,
            backgroundColor: 'transparent',
            pointRadius: 0,
            tension: 0.35,
            borderWidth: 2.5,
            spanGaps: true
        },
        {
            label: 'Inferred BMR cumulative avg (TDEE − workout cals)',
            data: dispBmrRoll,
            borderColor: colors.danger + 'dd',
            backgroundColor: 'transparent',
            pointRadius: 0,
            tension: 0.35,
            borderWidth: 2,
            borderDash: [5, 3],
            spanGaps: false
        },
        {
            label: `Overall inferred (${wMean.toLocaleString()} kcal)`,
            data: Array(labels.length).fill(wMean),
            borderColor: colors.success + 'bb',
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderDash: [7, 4],
            borderWidth: 1.5,
            tension: 0
        }
    ];

    if (formulaBMR !== null && labels.length > 0) {
        datasets.push({
            label: `Formula BMR (${formulaBMR.toLocaleString()} kcal)`,
            data: Array(labels.length).fill(formulaBMR),
            borderColor: colors.danger + 'bb',
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderDash: [3, 5],
            borderWidth: 1.5,
            tension: 0
        });
    }
    if (formulaTDEE !== null && labels.length > 0) {
        datasets.push({
            label: `Formula TDEE (${formulaTDEE.toLocaleString()} kcal)`,
            data: Array(labels.length).fill(formulaTDEE),
            borderColor: colors.warning + 'bb',
            backgroundColor: 'transparent',
            pointRadius: 0,
            borderDash: [6, 4],
            borderWidth: 1.5,
            tension: 0
        });
    }

    charts.inferredTDEE = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.25,
            plugins: {
                legend: { labels: { color: colors.text } },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            if (item.datasetIndex === 0) {
                                const e = dispEst[item.dataIndex];
                                const lines = [
                                    `TDEE: ${item.raw.toLocaleString()} kcal/day`,
                                    `Window: ${e.daysGap}d  (${e.pctLogged}% days logged)`,
                                    `Avg intake: ${e.avgIntake.toLocaleString()} kcal/day`,
                                    `Weight Δ: ${e.deltaW >= 0 ? '+' : ''}${e.deltaW.toFixed(2)} lbs`
                                ];
                                if (e.avgWorkoutCals > 0) lines.push(`Avg workout: ${e.avgWorkoutCals.toLocaleString()} kcal/day`);
                                if (e.bmr !== null) lines.push(`Inferred BMR: ${e.bmr.toLocaleString()} kcal/day`);
                                return lines;
                            }
                            if (item.raw === null) return null;
                            return `${item.dataset.label.split(' (')[0]}: ${Number(item.raw).toLocaleString()} kcal`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: colors.textSecondary }, grid: { color: colors.border + '40' } },
                y: {
                    ticks: { color: colors.textSecondary, callback: v => v.toLocaleString() + ' kcal' },
                    grid: { color: colors.border + '40' }
                }
            }
        }
    });

    // Stats summary block (always uses all-time estimates)
    if (statsEl) {
        const span    = `${estimates[0].date} → ${estimates[estimates.length - 1].date}`;
        const avgGap  = Math.round(totalW / estimates.length);
        const avgLog  = Math.round(estimates.reduce((s, e) => s + e.pctLogged, 0) / estimates.length);
        const avgRate = (() => {
            // overall weight change rate: (last - first) / total days
            const totalDays = Math.round(
                (new Date(weights[weights.length - 1].date + 'T12:00:00') - new Date(weights[0].date + 'T12:00:00')) / 86400000
            );
            const deltaW = weights[weights.length - 1].lbs - weights[0].lbs;
            return totalDays > 0 ? (deltaW / totalDays * 7) : 0; // lbs per week
        })();

        const formulaRef = formulaTDEE ?? formulaBMR;
        const formulaRefLabel = formulaTDEE !== null ? 'Formula TDEE' : (formulaBMR !== null ? 'Formula BMR' : null);
        const formulaCmp = formulaRef !== null
            ? (() => {
                const diff = formulaRef - wMean;
                const sign = diff >= 0 ? '+' : '−';
                const col  = Math.abs(diff) < 100 ? colors.success : colors.warning;
                return `<span style="color:${col};font-size:12px;">&ensp;·&ensp;${formulaRefLabel} ${sign}${Math.abs(diff).toLocaleString()} kcal vs data</span>`;
              })()
            : '';

        const rateStr = Math.abs(avgRate) < 0.05
            ? 'weight stable'
            : `${avgRate >= 0 ? '+' : ''}${avgRate.toFixed(2)} lbs/wk`;

        const bmrRow = wMeanBmr !== null ? `
                <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin-top:4px;">
                    <span style="color:var(--text-secondary);font-size:13px;">Inferred BMR:</span>
                    <strong style="font-size:16px;">${wMeanBmr.toLocaleString()} kcal/day</strong>
                    <span style="color:var(--text-secondary);font-size:12px;">(TDEE − logged workout cals)</span>
                    ${formulaBMR !== null ? (() => {
                        const diff = formulaBMR - wMeanBmr;
                        const sign = diff >= 0 ? '+' : '−';
                        const col  = Math.abs(diff) < 100 ? colors.success : colors.warning;
                        return `<span style="color:${col};font-size:12px;">· Formula BMR ${sign}${Math.abs(diff).toLocaleString()} kcal</span>`;
                    })() : ''}
                </div>` : '';

        statsEl.innerHTML = `
            <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:10px 14px;margin-top:8px;">
                <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;">
                    <span style="color:var(--text-secondary);font-size:13px;">Inferred TDEE:</span>
                    <strong style="font-size:16px;">${wMean.toLocaleString()} kcal/day</strong>
                    <span style="color:var(--text-secondary);font-size:13px;">± ${wStdDev.toLocaleString()}</span>
                    ${formulaCmp}
                </div>
                ${bmrRow}
                <div style="color:var(--text-secondary);font-size:11px;margin-top:4px;line-height:1.6;">
                    ${estimates.length} windows · ${avgGap}d avg window · ${avgLog}% days logged · ${rateStr} · ${span}
                </div>
            </div>`;
    }
}
