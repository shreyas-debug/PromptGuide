// ============================================================
// sidepanel.js — Main orchestration for the side panel UI
// Wires up evaluation, agentic refinement, history, and insights
// ============================================================

// NOTE: evaluation.js, history.js, and agent.js are loaded via script
// tags and expose their functions globally (no ES module imports in
// Chrome extension side panels without a build step).

const API_BASE = 'https://prompt-guide-ten.vercel.app';

// --- State ---
let latestEvaluation = null;
let agentRunning = false;
let stopAgent = false;
let currentChain = [];

document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const promptInput = document.getElementById('promptInput');
    const evaluateButton = document.getElementById('evaluateButton');
    const autoRefineButton = document.getElementById('autoRefineButton');
    const scoreSection = document.getElementById('scoreSection');
    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreFeedback = document.getElementById('scoreFeedback');
    const scoreBreakdown = document.getElementById('scoreBreakdown');
    const refineControls = document.getElementById('refineControls');
    const gauntletSelect = document.getElementById('gauntletSelect');
    const targetScoreSlider = document.getElementById('targetScore');
    const targetScoreValue = document.getElementById('targetScoreValue');
    const singleRefineButton = document.getElementById('singleRefineButton');
    const stepTracker = document.getElementById('stepTracker');
    const stepsContainer = document.getElementById('stepsContainer');
    const stopAgentButton = document.getElementById('stopAgentButton');
    const finalResult = document.getElementById('finalResult');
    const refinedPrompt = document.getElementById('refinedPrompt');
    const copyButton = document.getElementById('copyButton');
    const insertButton = document.getElementById('insertButton');
    const themeToggle = document.getElementById('themeToggle');
    const accountBanner = document.getElementById('accountBanner');
    const signInBtn = document.getElementById('signInBtn');
    const dismissBanner = document.getElementById('dismissBanner');

    // --- Tab Navigation ---
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

            if (tab.dataset.tab === 'history') loadHistoryTab();
            if (tab.dataset.tab === 'insights') loadInsightsTab();
        });
    });

    // --- Theme Toggle ---
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
        themeToggle.textContent = isDark ? '🌙' : '☀️';
        chrome.storage.local.set({ theme: isDark ? 'light' : 'dark' });
    });

    // Load saved theme
    chrome.storage.local.get('theme', (result) => {
        if (result.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.textContent = '☀️';
        }
    });

    // --- Account Banner ---
    chrome.storage.local.get('bannerDismissed', (result) => {
        if (result.bannerDismissed) accountBanner.classList.add('hidden');
    });

    dismissBanner.addEventListener('click', () => {
        accountBanner.classList.add('hidden');
        chrome.storage.local.set({ bannerDismissed: true });
    });

    signInBtn.addEventListener('click', () => {
        // TODO: Implement Supabase Google Auth
        alert('Google Sign-In coming soon! History is saved locally for now.');
    });

    // --- Target Score Slider ---
    targetScoreSlider.addEventListener('input', () => {
        targetScoreValue.textContent = targetScoreSlider.value;
    });

    // --- Load Gauntlets ---
    loadGauntlets();

    // --- EVALUATE ---
    evaluateButton.addEventListener('click', () => {
        const text = promptInput.value.trim();
        if (!text) return;

        // Client-side evaluation — instant, no API call
        latestEvaluation = runFullEvaluation(text);
        displayScore(latestEvaluation);
        autoRefineButton.disabled = false;
        refineControls.classList.remove('hidden');
        finalResult.classList.add('hidden');
        stepTracker.classList.add('hidden');
    });

    // --- SINGLE REFINE ---
    singleRefineButton.addEventListener('click', async () => {
        if (!latestEvaluation) return;
        singleRefineButton.disabled = true;
        singleRefineButton.innerHTML = '<span class="spinner"></span> Refining...';

        try {
            const response = await fetch(`${API_BASE}/api/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original_prompt: promptInput.value.trim(),
                    score: latestEvaluation.finalScore,
                    feedback: latestEvaluation.feedback,
                    gauntlet_id: gauntletSelect.value,
                    weakness_type: latestEvaluation.weakestDimension,
                    platform: 'extension',
                }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const refinedEval = runFullEvaluation(data.refined_prompt);
            showFinalResult(data.refined_prompt);
            displayScore(refinedEval);

            // Save to history
            saveToHistory({
                originalPrompt: promptInput.value.trim(),
                refinedPrompt: data.refined_prompt,
                originalScore: latestEvaluation.finalScore,
                refinedScore: refinedEval.finalScore,
                platform: 'extension',
                gauntletUsed: gauntletSelect.value,
                iterations: 1,
            });
        } catch (err) {
            scoreFeedback.textContent = `Error: ${err.message}`;
        } finally {
            singleRefineButton.disabled = false;
            singleRefineButton.textContent = 'Refine Once';
        }
    });

    // --- AUTO-REFINE (Agentic Loop) ---
    const iterationsToggle = document.getElementById('iterationsToggle');
    const toggleIterationsBtn = document.getElementById('toggleIterationsBtn');

    // Wire up iterations toggle
    toggleIterationsBtn.addEventListener('click', () => {
        const isHidden = stepsContainer.classList.toggle('collapsed');
        toggleIterationsBtn.querySelector('.toggle-icon').textContent = isHidden ? '▶' : '▼';
        toggleIterationsBtn.childNodes[1].textContent = isHidden ? ' View iteration details' : ' Hide iteration details';
    });

    autoRefineButton.addEventListener('click', async () => {
        if (agentRunning) return;
        agentRunning = true;
        stopAgent = false;

        autoRefineButton.disabled = true;
        evaluateButton.disabled = true;
        stepTracker.classList.remove('hidden');
        finalResult.classList.add('hidden');
        iterationsToggle.classList.add('hidden');
        stepsContainer.classList.remove('collapsed');
        stepsContainer.innerHTML = '';
        currentChain = [];

        const targetScore = parseInt(targetScoreSlider.value, 10);

        try {
            const chain = await agenticRefine(promptInput.value.trim(), {
                targetScore,
                maxIterations: 5,
                platform: 'extension',
                onStep: (step) => renderStep(step, stepsContainer),
                shouldStop: () => stopAgent,
            });

            currentChain = chain;

            if (chain.length >= 2) {
                const last = chain[chain.length - 1];
                showFinalResult(last.prompt);
                displayScore(last.evaluation);

                // Show iterations toggle and collapse iterations
                iterationsToggle.classList.remove('hidden');
                stepsContainer.classList.add('collapsed');
                toggleIterationsBtn.querySelector('.toggle-icon').textContent = '▶';
                toggleIterationsBtn.childNodes[1].textContent = ' View refinement reasoning';

                saveToHistory({
                    originalPrompt: promptInput.value.trim(),
                    refinedPrompt: last.prompt,
                    originalScore: chain[0].evaluation.finalScore,
                    refinedScore: last.evaluation.finalScore,
                    platform: 'extension',
                    gauntletUsed: 'auto',
                    iterations: chain.length - 1,
                });
            }
        } catch (err) {
            scoreFeedback.textContent = `Agent error: ${err.message}`;
        } finally {
            agentRunning = false;
            autoRefineButton.disabled = false;
            evaluateButton.disabled = false;
        }
    });

    // --- Stop Agent ---
    stopAgentButton.addEventListener('click', () => {
        stopAgent = true;

        // Immediately show best result so far
        if (currentChain.length > 0) {
            const bestStep = currentChain.reduce((best, step) =>
                step.evaluation.finalScore > best.evaluation.finalScore ? step : best
                , currentChain[0]);
            showFinalResult(bestStep.prompt);
            displayScore(bestStep.evaluation);

            // Show collapsed iterations toggle
            iterationsToggle.classList.remove('hidden');
            stepsContainer.classList.add('collapsed');
            toggleIterationsBtn.querySelector('.toggle-icon').textContent = '▶';
            toggleIterationsBtn.childNodes[1].textContent = ' View refinement reasoning';

            saveToHistory({
                originalPrompt: promptInput.value.trim(),
                refinedPrompt: bestStep.prompt,
                originalScore: currentChain[0].evaluation.finalScore,
                refinedScore: bestStep.evaluation.finalScore,
                platform: 'extension',
                gauntletUsed: 'auto (stopped)',
                iterations: currentChain.length,
            });
        }

        // Re-enable buttons
        agentRunning = false;
        autoRefineButton.disabled = false;
        evaluateButton.disabled = false;
    });

    // --- Copy ---
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(refinedPrompt.value).then(() => {
            copyButton.textContent = '✅ Copied!';
            setTimeout(() => { copyButton.textContent = '📋 Copy'; }, 1500);
        });
    });

    // --- Insert into page ---
    insertButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'insertRefinedPrompt',
                    text: refinedPrompt.value,
                });
                insertButton.textContent = '✅ Inserted!';
                setTimeout(() => { insertButton.textContent = '📥 Insert'; }, 1500);
            }
        });
    });

    // --- Rating ---
    document.querySelectorAll('.rating-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.rating-btn').forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');

            const rating = parseInt(btn.dataset.rating, 10);

            // Check if user opted in to collective learning
            const { collectiveLearning } = await chrome.storage.local.get('collectiveLearning');
            if (collectiveLearning && currentChain.length >= 2) {
                logRefinementOutcome(currentChain, 'extension', rating);
            }
        });
    });

    // --- Check for injected text from content script ---
    checkForInjectedText();
});

// ===================== HELPER FUNCTIONS =====================

async function loadGauntlets() {
    try {
        const response = await fetch(`${API_BASE}/api/gauntlets`);
        const data = await response.json();
        const select = document.getElementById('gauntletSelect');
        select.innerHTML = '';
        for (const [id, g] of Object.entries(data)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = g.name;
            select.appendChild(option);
        }
    } catch (err) {
        console.warn('Failed to load gauntlets, using defaults');
        const select = document.getElementById('gauntletSelect');
        select.innerHTML = `
      <option value="improve-clarity">Improve Clarity & Specificity</option>
      <option value="add-chain-of-thought">Add Chain-of-Thought</option>
      <option value="convert-to-few-shot">Convert to Few-Shot</option>
      <option value="make-concise">Make Concise & Direct</option>
      <option value="add-role-context">Add Role & Context</option>
      <option value="structure-output">Structure the Output</option>
    `;
    }
}

function displayScore(evaluation) {
    const scoreSection = document.getElementById('scoreSection');
    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');

    scoreSection.classList.remove('hidden');

    // Animate score number
    const targetVal = evaluation.finalScore;
    let currentVal = 0;
    const scoreAnim = setInterval(() => {
        currentVal += 2;
        if (currentVal >= targetVal) {
            currentVal = targetVal;
            clearInterval(scoreAnim);
        }
        scoreNumber.textContent = currentVal;
    }, 20);

    // Animate ring
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (targetVal / 100) * circumference;
    scoreCircle.style.strokeDashoffset = offset;

    // Color based on score
    let color;
    if (targetVal >= 70) color = 'var(--success)';
    else if (targetVal >= 40) color = 'var(--warning)';
    else color = 'var(--danger)';
    scoreCircle.style.stroke = color;

    // Feedback
    document.getElementById('scoreFeedback').textContent = evaluation.feedback;

    // Breakdown chips
    const breakdownEl = document.getElementById('scoreBreakdown');
    breakdownEl.innerHTML = '';
    for (const [key, value] of Object.entries(evaluation.breakdown)) {
        const chip = document.createElement('span');
        chip.className = 'breakdown-chip';
        chip.innerHTML = `${key}: <span class="chip-score">${value}</span>`;
        breakdownEl.appendChild(chip);
    }
}

function renderStep(step, container) {
    const existingCard = document.querySelector(`[data-iteration="${step.iteration}"]`);

    if (existingCard) {
        // Update existing card
        const scoreEl = existingCard.querySelector('.step-score');
        if (scoreEl) scoreEl.textContent = `${step.evaluation.finalScore}/100`;

        if (step.status === 'refining') {
            existingCard.classList.add('active');
            const statusEl = existingCard.querySelector('.step-reasoning');
            if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Refining...';
        } else if (step.status === 'refined' || step.status === 'complete') {
            existingCard.classList.remove('active');
            existingCard.classList.add('success');
            // Update reasoning if available
            if (step.reasoning) {
                const reasoningEl = existingCard.querySelector('.step-reasoning');
                if (reasoningEl) reasoningEl.textContent = step.reasoning;
            }
        }
        return;
    }

    // Create new card
    const card = document.createElement('div');
    card.className = `step-card ${step.status === 'refining' ? 'active' : ''}`;
    card.dataset.iteration = step.iteration;

    const statusIcon = step.status === 'target_reached' ? '🎯'
        : step.status === 'converged' ? '🔄'
            : step.status === 'error' ? '❌'
                : step.status === 'complete' ? '✅'
                    : `#${step.iteration + 1}`;

    const reasoningText = step.reasoning || (step.gauntletUsed ? `Strategy: ${step.gauntletUsed}` : step.status);

    card.innerHTML = `
    <div class="step-header">
      <span class="step-label">${statusIcon} Step ${step.iteration + 1}</span>
      <span class="step-score">${step.evaluation.finalScore}/100</span>
    </div>
    <div class="step-reasoning">${reasoningText}</div>
  `;

    container.appendChild(card);
}

function showFinalResult(text) {
    const finalResult = document.getElementById('finalResult');
    const refinedPrompt = document.getElementById('refinedPrompt');
    refinedPrompt.value = text;
    finalResult.classList.remove('hidden');
    // Scroll the final result into view so user sees it immediately
    finalResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadHistoryTab() {
    const searchInput = document.getElementById('historySearch');
    const filterSelect = document.getElementById('historyFilter');
    const historyList = document.getElementById('historyList');

    const history = await getHistory({
        search: searchInput.value,
        platform: filterSelect.value,
    });

    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-state">No refinement history yet.</p>';
        return;
    }

    historyList.innerHTML = history.map((h) => {
        const dateStr = new Date(h.timestamp).toLocaleDateString();
        const truncatedPrompt = h.originalPrompt.length > 60
            ? h.originalPrompt.substring(0, 60) + '...'
            : h.originalPrompt;
        return `
    <div class="history-item" data-id="${h.id}">
      <div class="history-summary">
        <div class="history-summary-left">
          <span class="history-date">${dateStr}</span>
          <span class="history-prompt-preview">${truncatedPrompt}</span>
        </div>
        <div class="history-summary-right">
          <div class="history-scores-inline">
            <span class="score-badge before">${h.originalScore}</span>
            <span class="score-arrow">→</span>
            <span class="score-badge after">${h.refinedScore}</span>
            <span class="score-badge improvement">+${h.improvement}</span>
          </div>
          <span class="history-chevron">▶</span>
        </div>
      </div>
      <div class="history-details">
        <div class="history-detail-block">
          <label>Original Prompt</label>
          <p>${h.originalPrompt}</p>
        </div>
        <div class="history-detail-block">
          <label>Refined Prompt</label>
          <p>${h.refinedPrompt}</p>
        </div>
        <div class="history-detail-meta">
          <span>Strategy: ${h.gauntletUsed || 'auto'}</span>
          <span>Iterations: ${h.iterations || 1}</span>
        </div>
      </div>
    </div>
  `;
    }).join('');

    // Wire up expand/collapse on history items
    historyList.querySelectorAll('.history-item').forEach((item) => {
        item.addEventListener('click', () => {
            const isExpanded = item.classList.toggle('expanded');
            item.querySelector('.history-chevron').textContent = isExpanded ? '▼' : '▶';
        });
    });

    // Wire up search and filter
    searchInput.oninput = () => loadHistoryTab();
    filterSelect.onchange = () => loadHistoryTab();
}

async function loadInsightsTab() {
    // Personal stats
    const analytics = await getAnalytics();
    document.getElementById('statTotal').textContent = analytics.totalSessions;
    document.getElementById('statAvgImprovement').textContent = `+${analytics.avgImprovement}`;
    document.getElementById('statIterations').textContent = analytics.totalIterations;

    // Community insights
    try {
        const response = await fetch(`${API_BASE}/api/patterns`);
        const data = await response.json();
        const patternsEl = document.getElementById('communityPatterns');

        if (!data.patterns || Object.keys(data.patterns).length === 0) {
            patternsEl.innerHTML = `
        <p class="empty-state">
          Community patterns will grow as more users contribute.
          ${data.stats?.totalRefinements ? `<br>${data.stats.totalRefinements} refinements contributed so far.` : ''}
        </p>
      `;
            return;
        }

        let html = '';
        for (const [weakness, strategies] of Object.entries(data.patterns)) {
            for (const s of strategies.slice(0, 2)) {
                html += `
          <div class="pattern-item">
            <div>
              <div class="pattern-strategy">${s.strategy}</div>
              <div class="pattern-count">for "${weakness}" weakness · ${s.dataPoints} uses</div>
            </div>
            <span class="pattern-delta">+${Math.round(s.avgImprovement)}</span>
          </div>
        `;
            }
        }
        patternsEl.innerHTML = html;
    } catch (err) {
        console.warn('Failed to load community insights:', err);
    }
}

async function checkForInjectedText() {
    const result = await chrome.storage.local.get(['textToInject']);
    if (result.textToInject) {
        document.getElementById('promptInput').value = result.textToInject;
        chrome.storage.local.remove(['textToInject']);
    }
}