/**
 * Fitness Tracker PWA - Date Utilities
 * Helper functions for date formatting and manipulation
 */

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
export function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @param {string} format - Format type: 'short', 'long', 'relative'
 * @returns {string} Formatted date
 */
export function formatDate(date, format = 'short') {
    const d = typeof date === 'string' ? new Date(date) : date;

    if (format === 'short') {
        // MM/DD/YYYY
        return d.toLocaleDateString('en-US');
    } else if (format === 'long') {
        // January 1, 2024
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } else if (format === 'relative') {
        // "Today", "Yesterday", or date
        const today = getTodayDate();

        // Convert date to local YYYY-MM-DD
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (dateStr === today) return 'Today';

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;

        if (dateStr === yesterdayStr) return 'Yesterday';

        return formatDate(d, 'short');
    }

    return d.toLocaleDateString();
}

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time (e.g., "3:45 PM")
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Format a date and time together
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date and time
 */
export function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return `${formatDate(date, 'relative')} at ${formatTime(timestamp)}`;
}

/**
 * Get date range for queries
 * @param {number} days - Number of days to go back
 * @returns {Object} {start, end} date strings in YYYY-MM-DD format
 */
export function getDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const formatLocalDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        start: formatLocalDate(start),
        end: formatLocalDate(end)
    };
}

/**
 * Get an array of dates between start and end
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Array<string>} Array of date strings
 */
export function getDateArray(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

/**
 * Check if a date is today
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
export function isToday(date) {
    return date === getTodayDate();
}

/**
 * Get the start of the week (Monday) for a given date
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
}

/**
 * Get the start of the month for a given date
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getMonthStart(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
}

/**
 * Parse date from input value
 * @param {string} value - Date input value
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function parseDateInput(value) {
    if (!value) return getTodayDate();
    return value;
}

/**
 * Get day of week name
 * @param {string|Date} date - Date to get day name for
 * @returns {string} Day name (e.g., "Monday")
 */
export function getDayName(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Get month name
 * @param {string|Date} date - Date to get month name for
 * @returns {string} Month name (e.g., "January")
 */
export function getMonthName(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'long' });
}
