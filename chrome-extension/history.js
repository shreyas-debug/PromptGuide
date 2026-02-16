// ============================================================
// history.js — Prompt History & Local Storage Manager
// Stores evaluated/refined prompts in chrome.storage.local
// ============================================================

const HISTORY_KEY = 'promptguide_history';
const MAX_HISTORY_ITEMS = 200;

/**
 * Save a refinement session to history.
 * @param {Object} session
 * @param {string} session.originalPrompt
 * @param {string} session.refinedPrompt
 * @param {number} session.originalScore
 * @param {number} session.refinedScore
 * @param {string} session.platform
 * @param {string} session.gauntletUsed
 * @param {number} session.iterations
 */
async function saveToHistory(session) {
    const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        originalPrompt: session.originalPrompt,
        refinedPrompt: session.refinedPrompt,
        originalScore: session.originalScore,
        refinedScore: session.refinedScore,
        platform: session.platform || 'unknown',
        gauntletUsed: session.gauntletUsed || 'unknown',
        iterations: session.iterations || 1,
        improvement: (session.refinedScore || 0) - (session.originalScore || 0),
    };

    const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);

    history.unshift(entry);

    // Cap at max items
    if (history.length > MAX_HISTORY_ITEMS) {
        history.length = MAX_HISTORY_ITEMS;
    }

    await chrome.storage.local.set({ [HISTORY_KEY]: history });
    return entry;
}

/**
 * Get all history entries, optionally filtered.
 * @param {Object} filters
 * @param {string} filters.search - Keyword search in prompts
 * @param {string} filters.platform - Filter by platform
 * @returns {Promise<Array>}
 */
async function getHistory(filters = {}) {
    const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);

    let filtered = history;

    if (filters.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(
            (h) =>
                h.originalPrompt.toLowerCase().includes(q) ||
                h.refinedPrompt.toLowerCase().includes(q)
        );
    }

    if (filters.platform) {
        filtered = filtered.filter((h) => h.platform === filters.platform);
    }

    return filtered;
}

/**
 * Get aggregate analytics from history.
 */
async function getAnalytics() {
    const history = await getHistory();

    if (history.length === 0) {
        return {
            totalSessions: 0,
            avgImprovement: 0,
            avgOriginalScore: 0,
            avgRefinedScore: 0,
            totalIterations: 0,
            platformBreakdown: {},
        };
    }

    const totalSessions = history.length;
    const totalImprovement = history.reduce((sum, h) => sum + h.improvement, 0);
    const totalOrigScore = history.reduce((sum, h) => sum + h.originalScore, 0);
    const totalRefScore = history.reduce((sum, h) => sum + h.refinedScore, 0);
    const totalIterations = history.reduce((sum, h) => sum + h.iterations, 0);

    const platformBreakdown = {};
    for (const h of history) {
        platformBreakdown[h.platform] = (platformBreakdown[h.platform] || 0) + 1;
    }

    return {
        totalSessions,
        avgImprovement: Math.round(totalImprovement / totalSessions),
        avgOriginalScore: Math.round(totalOrigScore / totalSessions),
        avgRefinedScore: Math.round(totalRefScore / totalSessions),
        totalIterations,
        platformBreakdown,
    };
}

/**
 * Export history as JSON.
 */
async function exportHistory() {
    const history = await getHistory();
    return JSON.stringify(history, null, 2);
}

/**
 * Clear all history.
 */
async function clearHistory() {
    await chrome.storage.local.remove(HISTORY_KEY);
}
