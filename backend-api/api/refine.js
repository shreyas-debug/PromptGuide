import { routeLLMCall } from '../lib/llm-router.js';
import { getSupabase } from '../lib/supabase.js';
import { GAUNTLETS } from '../lib/gauntlets.js';

export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { original_prompt, score, feedback, gauntlet_id, weakness_type, platform } = req.body;

        if (!original_prompt || score === undefined || !feedback || !gauntlet_id) {
            return res.status(400).json({ error: 'Missing required fields: original_prompt, score, feedback, gauntlet_id' });
        }

        const gauntlet = GAUNTLETS[gauntlet_id];
        if (!gauntlet) {
            return res.status(400).json({ error: 'Invalid gauntlet_id' });
        }

        // --- Fetch collective learning patterns ---
        let patternContext = '';
        try {
            const supabase = getSupabase();
            const targetWeakness = weakness_type || 'general';

            const { data: patterns } = await supabase
                .from('pattern_library')
                .select('best_strategy, avg_score_delta, sample_count, tip_text')
                .eq('weakness_type', targetWeakness)
                .order('avg_score_delta', { ascending: false })
                .limit(3);

            if (patterns && patterns.length > 0) {
                patternContext = `\n\n--- Community Intelligence ---\nBased on ${patterns.reduce((sum, p) => sum + p.sample_count, 0)} anonymized data points from other users:\n`;
                patterns.forEach((p) => {
                    patternContext += `- Strategy "${p.best_strategy}" improves ${targetWeakness} by +${Math.round(p.avg_score_delta)} points on average (${p.sample_count} uses).\n`;
                    if (p.tip_text) patternContext += `  Tip: ${p.tip_text}\n`;
                });
                patternContext += 'Use these insights to inform your refinement.\n';
            }
        } catch (err) {
            // Non-blocking: if pattern fetch fails, just refine without it
            console.warn('[Patterns] Failed to fetch:', err.message);
        }

        // --- Build the meta-prompt ---
        const systemPrompt = `You are an expert prompt engineer. Your task is to rewrite a user's prompt to make it significantly better based on evaluation feedback and a specific refinement goal.

Rules:
- Rewrite the prompt to address the feedback AND achieve the specific goal.
- Return ONLY the refined prompt text. No explanations, no quotes, no extra text.
- Preserve the original intent of the prompt while improving it.
- If the prompt targets a specific AI platform (${platform || 'unknown'}), optimize for that platform's strengths.
${patternContext}`;

        const userPrompt = `Original Prompt: "${original_prompt}"
Evaluation Score: ${score}/100
Evaluation Feedback: "${feedback}"
Refinement Goal: ${gauntlet.instruction}

Rewrite this prompt now:`;

        const { text: refinedPrompt, provider } = await routeLLMCall(systemPrompt, userPrompt);

        return res.status(200).json({
            refined_prompt: refinedPrompt,
            provider_used: provider,
            gauntlet_used: gauntlet_id,
        });
    } catch (err) {
        console.error('[/api/refine] Error:', err);
        return res.status(500).json({ error: 'Refinement failed. Please try again.' });
    }
}
