// ============================================================
// PromptGuide — Web Demo Application
// Self-contained: evaluation engine + agentic refinement loop
// Uses the deployed Vercel backend at /api/*
// ============================================================

const API_BASE = '';  // relative — same Vercel deployment

// ===================== EVALUATION ENGINE =====================

function tokenize(text) {
    return text.toLowerCase().match(/\b[a-z']+\b/g) || [];
}

function countSentences(text) {
    const m = text.match(/[.!?]+/g);
    return m ? m.length : 1;
}

function countSyllables(word) {
    word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
}

function calculateReadingEase(text) {
    const words = tokenize(text);
    if (!words.length) return 0;
    const sentences = countSentences(text);
    const totalSyllables = words.reduce((s, w) => s + countSyllables(w), 0);
    const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (totalSyllables / words.length);
    return Math.max(0, Math.min(100, score));
}

function calculateLexicalDiversity(text) {
    const words = tokenize(text);
    if (!words.length) return 0;
    return new Set(words).size / words.length;
}

const ACTION_VERBS = [
    'explain', 'generate', 'create', 'write', 'summarize', 'list', 'compare',
    'analyze', 'translate', 'classify', 'describe', 'define', 'evaluate',
    'design', 'develop', 'implement', 'suggest', 'recommend', 'outline',
    'rewrite', 'simplify', 'elaborate', 'optimize', 'debug', 'refactor',
    'convert', 'extract', 'identify', 'review', 'critique', 'compose',
    'draft', 'format', 'paraphrase', 'proofread', 'research', 'calculate',
];

const CONSTRAINT_PHRASES = [
    'in the style of', 'as a', 'format as', 'ensure that', 'must include',
    'with a focus on', 'no more than', 'at least', 'in the form of',
    'using the following', 'step by step', 'for example', 'such as',
    'do not include', 'limited to', 'in json', 'in markdown',
    'as a table', 'as a list', 'in bullet points',
];

function runFullEvaluation(prompt) {
    if (!prompt || !prompt.trim()) {
        return { finalScore: 0, breakdown: {}, feedback: 'Prompt is empty.', weakestDimension: 'clarity' };
    }
    const readingEase = calculateReadingEase(prompt);
    const lexDiv = calculateLexicalDiversity(prompt);
    const actionVerbs = tokenize(prompt).filter(w => ACTION_VERBS.includes(w)).length;
    const constraints = CONSTRAINT_PHRASES.filter(p => prompt.toLowerCase().includes(p)).length;
    const words = tokenize(prompt);
    const lengthScore = words.length < 5 ? 0 : words.length < 15 ? 5 : 10;

    const breakdown = {
        'Clarity': readingEase > 60 ? 20 : Math.max(0, Math.round(readingEase / 3)),
        'Vocabulary': lexDiv > 0.8 ? 20 : Math.round(lexDiv * 25),
        'Actionability': actionVerbs > 0 ? 25 : 0,
        'Specificity': constraints > 0 ? 25 : 0,
        'Brevity': lengthScore > 5 ? 10 : 0,
    };

    const finalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    const parts = [];
    if (breakdown['Clarity'] < 15) parts.push('Simplify the language for better clarity.');
    if (breakdown['Vocabulary'] < 15) parts.push('Use more diverse vocabulary.');
    if (breakdown['Actionability'] === 0) parts.push("Add a clear action verb (e.g., 'summarize', 'generate').");
    if (breakdown['Specificity'] === 0) parts.push("Add constraints like 'step by step' or 'format as a list'.");
    if (breakdown['Brevity'] === 0) parts.push('Add more detail — the prompt is too short.');
    const feedback = parts.length ? parts.join(' ') : 'Great prompt!';

    let weakestDimension = 'clarity', weakestScore = Infinity;
    const dimMap = { 'Clarity': 'clarity', 'Vocabulary': 'vocabulary', 'Actionability': 'actionability', 'Specificity': 'specificity', 'Brevity': 'brevity' };
    for (const [k, v] of Object.entries(breakdown)) {
        const max = k === 'Brevity' ? 10 : (k === 'Clarity' || k === 'Vocabulary' ? 20 : 25);
        if (v / max < weakestScore) { weakestScore = v / max; weakestDimension = dimMap[k]; }
    }
    return { finalScore, breakdown, feedback, weakestDimension };
}

// =================== AGENTIC REFINEMENT =====================

const WEAKNESS_TO_GAUNTLET = {
    clarity: 'improve-clarity',
    vocabulary: 'improve-clarity',
    actionability: 'add-role-context',
    specificity: 'add-chain-of-thought',
    brevity: 'structure-output',
};

async function agenticRefine(originalPrompt, { targetScore = 80, maxIterations = 5, platform = 'web', onStep = () => { }, shouldStop = () => false } = {}) {
    const chain = [];
    let currentPrompt = originalPrompt;

    for (let i = 0; i < maxIterations; i++) {
        if (shouldStop()) break;
        const evaluation = runFullEvaluation(currentPrompt);
        const stepData = { iteration: i, prompt: currentPrompt, evaluation, gauntletUsed: null, status: 'evaluating' };
        chain.push(stepData);
        onStep({ ...stepData, status: 'evaluated' });

        if (evaluation.finalScore >= targetScore) { stepData.status = 'target_reached'; onStep({ ...stepData, status: 'target_reached' }); break; }

        if (chain.length >= 3) {
            const prev = chain[chain.length - 2].evaluation.finalScore;
            const prevPrev = chain[chain.length - 3].evaluation.finalScore;
            if (Math.abs(evaluation.finalScore - prev) < 3 && Math.abs(prev - prevPrev) < 3) {
                stepData.status = 'converged'; onStep({ ...stepData, status: 'converged' }); break;
            }
        }

        const gauntletId = WEAKNESS_TO_GAUNTLET[evaluation.weakestDimension] || 'improve-clarity';
        stepData.gauntletUsed = gauntletId;
        onStep({ ...stepData, status: 'refining' });

        try {
            const res = await fetch(`${API_BASE}/api/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original_prompt: currentPrompt,
                    score: evaluation.finalScore,
                    feedback: evaluation.feedback,
                    gauntlet_id: gauntletId,
                    weakness_type: evaluation.weakestDimension,
                    platform,
                }),
            });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            currentPrompt = data.refined_prompt;
            stepData.status = 'refined';
            stepData.reasoning = data.reasoning || null;
            onStep({ ...stepData, status: 'refined', refinedPrompt: currentPrompt, reasoning: data.reasoning });
        } catch (err) {
            stepData.status = 'error'; stepData.error = err.message;
            onStep({ ...stepData, status: 'error', error: err.message }); break;
        }
    }

    if (chain.length > 0) {
        const finalEval = runFullEvaluation(currentPrompt);
        const finalStep = { iteration: chain.length, prompt: currentPrompt, evaluation: finalEval, gauntletUsed: null, status: 'complete' };
        chain.push(finalStep);
        onStep(finalStep);
    }
    return chain;
}

// ========================== UI ==============================

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const promptInput = document.getElementById('promptInput');
    const evaluateBtn = document.getElementById('evaluateBtn');
    const autoRefineBtn = document.getElementById('autoRefineBtn');
    const stopBtn = document.getElementById('stopBtn');
    const refineControls = document.getElementById('refineControls');
    const gauntletSelect = document.getElementById('gauntletSelect');
    const targetScoreSlider = document.getElementById('targetScore');
    const targetScoreValue = document.getElementById('targetScoreValue');
    const singleRefineBtn = document.getElementById('singleRefineBtn');
    const scorePanel = document.getElementById('scorePanel');
    const scoreCircle = document.getElementById('scoreCircle');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreFeedback = document.getElementById('scoreFeedback');
    const scoreBreakdown = document.getElementById('scoreBreakdown');
    const finalResult = document.getElementById('finalResult');
    const refinedPrompt = document.getElementById('refinedPrompt');
    const copyBtn = document.getElementById('copyBtn');
    const reasoningToggle = document.getElementById('reasoningToggle');
    const toggleReasoningBtn = document.getElementById('toggleReasoningBtn');
    const stepsContainer = document.getElementById('stepsContainer');

    let latestEvaluation = null;
    let agentRunning = false;
    let stopAgent = false;
    let currentChain = [];

    // Load gauntlets
    fetch(`${API_BASE}/api/gauntlets`)
        .then(r => r.json())
        .then(data => {
            // API returns { id: { name }, ... } object
            Object.entries(data).forEach(([id, info]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = info.name;
                gauntletSelect.appendChild(opt);
            });
        })
        .catch(() => {
            ['improve-clarity', 'add-role-context', 'add-chain-of-thought', 'structure-output'].forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                gauntletSelect.appendChild(opt);
            });
        });

    // Target score slider
    targetScoreSlider.addEventListener('input', () => {
        targetScoreValue.textContent = targetScoreSlider.value;
    });

    // --- Score display ---
    function displayScore(evaluation) {
        scorePanel.classList.remove('hidden');
        const score = evaluation.finalScore;
        scoreNumber.textContent = score;

        const circumference = 2 * Math.PI * 52;
        const offset = circumference - (score / 100) * circumference;
        scoreCircle.style.strokeDashoffset = offset;

        const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
        scoreCircle.style.stroke = color;
        scoreNumber.style.color = color;

        scoreFeedback.textContent = evaluation.feedback;

        scoreBreakdown.innerHTML = Object.entries(evaluation.breakdown)
            .map(([dim, val]) => {
                const max = dim === 'Brevity' ? 10 : (dim === 'Clarity' || dim === 'Vocabulary' ? 20 : 25);
                return `<div class="breakdown-row"><span class="dim-name">${dim}</span><span class="dim-score">${val}/${max}</span></div>`;
            }).join('');
    }

    // --- Evaluate ---
    evaluateBtn.addEventListener('click', () => {
        const text = promptInput.value.trim();
        if (!text) return;
        latestEvaluation = runFullEvaluation(text);
        displayScore(latestEvaluation);
        autoRefineBtn.disabled = false;
        refineControls.classList.remove('hidden');
        finalResult.classList.add('hidden');
        stepsContainer.innerHTML = '';
        reasoningToggle.classList.add('hidden');
    });

    // --- Single Refine ---
    singleRefineBtn.addEventListener('click', async () => {
        if (!latestEvaluation) return;
        singleRefineBtn.disabled = true;
        singleRefineBtn.innerHTML = '<span class="spinner"></span> Refining…';

        try {
            const res = await fetch(`${API_BASE}/api/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    original_prompt: promptInput.value.trim(),
                    score: latestEvaluation.finalScore,
                    feedback: latestEvaluation.feedback,
                    gauntlet_id: gauntletSelect.value,
                    weakness_type: latestEvaluation.weakestDimension,
                    platform: 'web',
                }),
            });
            const data = await res.json();
            showFinalResult(data.refined_prompt);

            // Show reasoning as a single step card
            if (data.reasoning) {
                stepsContainer.innerHTML = '';
                reasoningToggle.classList.remove('hidden');
                stepsContainer.classList.remove('collapsed');
                const card = document.createElement('div');
                card.className = 'step-card success';
                card.innerHTML = `
                    <div class="step-header">
                        <span class="step-label">✅ Refinement</span>
                        <span class="step-score">${latestEvaluation.finalScore} → ?</span>
                    </div>
                    <div class="step-reasoning">${data.reasoning}</div>
                `;
                stepsContainer.appendChild(card);
            }

            // Re-evaluate the refined prompt
            const newEval = runFullEvaluation(data.refined_prompt);
            displayScore(newEval);
            latestEvaluation = newEval;
        } catch (err) {
            scoreFeedback.textContent = `Error: ${err.message}`;
        } finally {
            singleRefineBtn.disabled = false;
            singleRefineBtn.textContent = 'Refine Once';
        }
    });

    // --- Auto-Refine ---
    autoRefineBtn.addEventListener('click', async () => {
        if (agentRunning) return;
        agentRunning = true;
        stopAgent = false;

        autoRefineBtn.disabled = true;
        evaluateBtn.disabled = true;
        stopBtn.classList.remove('hidden');
        finalResult.classList.add('hidden');
        reasoningToggle.classList.add('hidden');
        stepsContainer.classList.remove('collapsed');
        stepsContainer.innerHTML = '';
        currentChain = [];

        const targetScore = parseInt(targetScoreSlider.value, 10);

        try {
            const chain = await agenticRefine(promptInput.value.trim(), {
                targetScore,
                maxIterations: 5,
                platform: 'web',
                onStep: (step) => renderStep(step, stepsContainer),
                shouldStop: () => stopAgent,
            });
            currentChain = chain;

            if (chain.length >= 2) {
                const last = chain[chain.length - 1];
                showFinalResult(last.prompt);
                displayScore(last.evaluation);
                latestEvaluation = last.evaluation;

                reasoningToggle.classList.remove('hidden');
                stepsContainer.classList.add('collapsed');
                toggleReasoningBtn.querySelector('.toggle-icon').textContent = '▶';
                toggleReasoningBtn.querySelector('span:last-child').textContent = 'View AI reasoning';
            }
        } catch (err) {
            scoreFeedback.textContent = `Agent error: ${err.message}`;
        } finally {
            agentRunning = false;
            autoRefineBtn.disabled = false;
            evaluateBtn.disabled = false;
            stopBtn.classList.add('hidden');
        }
    });

    // --- Stop ---
    stopBtn.addEventListener('click', () => {
        stopAgent = true;

        if (currentChain.length > 0) {
            const bestStep = currentChain.reduce((best, s) =>
                s.evaluation.finalScore > best.evaluation.finalScore ? s : best, currentChain[0]);
            showFinalResult(bestStep.prompt);
            displayScore(bestStep.evaluation);

            reasoningToggle.classList.remove('hidden');
            stepsContainer.classList.add('collapsed');
        }
    });

    // --- Reasoning toggle ---
    toggleReasoningBtn.addEventListener('click', () => {
        const isHidden = stepsContainer.classList.toggle('collapsed');
        toggleReasoningBtn.querySelector('.toggle-icon').textContent = isHidden ? '▶' : '▼';
        toggleReasoningBtn.querySelector('span:last-child').textContent = isHidden ? 'View AI reasoning' : 'Hide AI reasoning';
    });

    // --- Copy ---
    copyBtn.addEventListener('click', () => {
        const label = document.getElementById('copyLabel');
        navigator.clipboard.writeText(refinedPrompt.value).then(() => {
            label.textContent = 'Copied!';
            setTimeout(() => { label.textContent = 'Copy'; }, 1500);
        });
    });

    // --- Helpers ---
    function showFinalResult(text) {
        refinedPrompt.value = text;
        finalResult.classList.remove('hidden');
        finalResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderStep(step, container) {
        const existing = container.querySelector(`[data-iteration="${step.iteration}"]`);
        if (existing) {
            const scoreEl = existing.querySelector('.step-score');
            if (scoreEl) scoreEl.textContent = `${step.evaluation.finalScore}/100`;
            if (step.status === 'refining') {
                existing.classList.add('active');
                const r = existing.querySelector('.step-reasoning');
                if (r) r.innerHTML = '<span class="spinner"></span> Refining…';
            } else if (step.status === 'refined' || step.status === 'complete') {
                existing.classList.remove('active');
                existing.classList.add('success');
                if (step.reasoning) {
                    const r = existing.querySelector('.step-reasoning');
                    if (r) r.textContent = step.reasoning;
                }
            }
            return;
        }

        const card = document.createElement('div');
        card.className = `step-card ${step.status === 'refining' ? 'active' : ''}`;
        card.dataset.iteration = step.iteration;

        const icon = step.status === 'target_reached' ? '🎯'
            : step.status === 'converged' ? '🔄'
                : step.status === 'error' ? '❌'
                    : step.status === 'complete' ? '✅'
                        : `#${step.iteration + 1}`;

        const reason = step.reasoning || (step.gauntletUsed ? `Strategy: ${step.gauntletUsed}` : step.status);

        card.innerHTML = `
            <div class="step-header">
                <span class="step-label">${icon} Step ${step.iteration + 1}</span>
                <span class="step-score">${step.evaluation.finalScore}/100</span>
            </div>
            <div class="step-reasoning">${reason}</div>
        `;
        container.appendChild(card);
    }
});
