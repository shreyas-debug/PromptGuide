// ============================================================
// agent.js — Agentic Iterative Refinement Loop
// The killer feature: autonomously refines prompts through
// multiple cycles, targeting the weakest dimension each time.
// ============================================================

// NOTE: runFullEvaluation is loaded globally from evaluation.js

// Backend URL — will be updated to Vercel deployment URL
const AGENT_API_BASE = 'https://prompt-guide-ten.vercel.app';

// --- Gauntlet mapping from weakness to best strategy ---
const WEAKNESS_TO_GAUNTLET = {
    clarity: 'improve-clarity',
    vocabulary: 'improve-clarity',
    actionability: 'add-role-context',
    specificity: 'add-chain-of-thought',
    brevity: 'structure-output',
};

/**
 * Runs the agentic refinement loop.
 *
 * @param {string} originalPrompt - The user's original prompt
 * @param {Object} options
 * @param {number} options.targetScore - Stop when score >= this (default: 80)
 * @param {number} options.maxIterations - Max refinement cycles (default: 5)
 * @param {string} options.platform - Current AI platform ('chatgpt', 'claude', etc.)
 * @param {function} options.onStep - Callback for each iteration (for UI updates)
 * @param {function} options.shouldStop - Returns true if user clicked "Stop"
 * @returns {Promise<Array>} Chain of { iteration, prompt, evaluation, gauntletUsed }
 */
async function agenticRefine(originalPrompt, options = {}) {
    const {
        targetScore = 80,
        maxIterations = 5,
        platform = 'unknown',
        onStep = () => { },
        shouldStop = () => false,
    } = options;

    const chain = [];
    let currentPrompt = originalPrompt;

    for (let i = 0; i < maxIterations; i++) {
        if (shouldStop()) break;

        // Step 1: Evaluate current prompt
        const evaluation = runFullEvaluation(currentPrompt);

        const stepData = {
            iteration: i,
            prompt: currentPrompt,
            evaluation,
            gauntletUsed: null,
            status: 'evaluating',
        };

        chain.push(stepData);
        onStep({ ...stepData, status: 'evaluated' });

        // Step 2: Check if we've reached the target
        if (evaluation.finalScore >= targetScore) {
            stepData.status = 'target_reached';
            onStep({ ...stepData, status: 'target_reached' });
            break;
        }

        // Step 3: Check convergence (no improvement in last 2 iterations)
        if (chain.length >= 3) {
            const prev = chain[chain.length - 2].evaluation.finalScore;
            const prevPrev = chain[chain.length - 3].evaluation.finalScore;
            if (Math.abs(evaluation.finalScore - prev) < 3 && Math.abs(prev - prevPrev) < 3) {
                stepData.status = 'converged';
                onStep({ ...stepData, status: 'converged' });
                break;
            }
        }

        // Step 4: Pick the best gauntlet for the weakest dimension
        const gauntletId = WEAKNESS_TO_GAUNTLET[evaluation.weakestDimension] || 'improve-clarity';
        stepData.gauntletUsed = gauntletId;

        // Step 5: Call the backend to refine
        onStep({ ...stepData, status: 'refining' });

        try {
            const response = await fetch(`${AGENT_API_BASE}/api/refine`, {
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

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            currentPrompt = data.refined_prompt;
            stepData.status = 'refined';
            stepData.reasoning = data.reasoning || null;
            onStep({ ...stepData, status: 'refined', refinedPrompt: currentPrompt, reasoning: data.reasoning });
        } catch (err) {
            stepData.status = 'error';
            stepData.error = err.message;
            onStep({ ...stepData, status: 'error', error: err.message });
            break;
        }
    }

    // Do a final evaluation of the last prompt
    if (chain.length > 0) {
        const finalEval = runFullEvaluation(currentPrompt);
        const finalStep = {
            iteration: chain.length,
            prompt: currentPrompt,
            evaluation: finalEval,
            gauntletUsed: null,
            status: 'complete',
        };
        chain.push(finalStep);
        onStep(finalStep);
    }

    return chain;
}

/**
 * Logs the refinement outcome for collective learning (if user opted in).
 */
async function logRefinementOutcome(chain, platform, userRating) {
    if (chain.length < 2) return;

    const first = chain[0];
    const last = chain[chain.length - 1];

    try {
        await fetch(`${AGENT_API_BASE}/api/evaluate-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                weakness_type: first.evaluation.weakestDimension,
                strategy: first.gauntletUsed || 'improve-clarity',
                score_before: first.evaluation.finalScore,
                score_after: last.evaluation.finalScore,
                platform,
                user_rating: userRating,
            }),
        });
    } catch (err) {
        console.warn('[PromptGuide] Failed to log outcome:', err.message);
    }
}
