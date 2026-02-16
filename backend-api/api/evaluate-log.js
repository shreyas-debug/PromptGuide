import { getSupabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { weakness_type, strategy, score_before, score_after, platform, user_rating } = req.body;

        if (!weakness_type || !strategy || score_before === undefined || score_after === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const supabase = getSupabase();

        const { error } = await supabase.from('refinement_outcomes').insert({
            weakness_type,
            strategy,
            score_before,
            score_after,
            platform: platform || 'unknown',
            user_rating: user_rating || null,
        });

        if (error) {
            console.error('[/api/evaluate-log] Supabase error:', error);
            return res.status(500).json({ error: 'Failed to log outcome' });
        }

        // --- Trigger lightweight pattern update ---
        // Instead of a nightly job, we do an incremental update on every Nth log
        try {
            const { count } = await supabase
                .from('refinement_outcomes')
                .select('*', { count: 'exact', head: true })
                .eq('weakness_type', weakness_type);

            // Update patterns every 10 new entries for a weakness type
            if (count && count % 10 === 0) {
                await updatePatternLibrary(supabase, weakness_type);
            }
        } catch (err) {
            console.warn('[Pattern Update] Non-critical error:', err.message);
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[/api/evaluate-log] Error:', err);
        return res.status(500).json({ error: 'Failed to log evaluation outcome' });
    }
}

async function updatePatternLibrary(supabase, weaknessType) {
    // Aggregate best strategies for this weakness type
    const { data: outcomes } = await supabase
        .from('refinement_outcomes')
        .select('strategy, score_before, score_after, user_rating')
        .eq('weakness_type', weaknessType);

    if (!outcomes || outcomes.length === 0) return;

    // Group by strategy and compute averages
    const strategyStats = {};
    for (const o of outcomes) {
        if (!strategyStats[o.strategy]) {
            strategyStats[o.strategy] = { totalDelta: 0, count: 0, ratings: [] };
        }
        strategyStats[o.strategy].totalDelta += (o.score_after - o.score_before);
        strategyStats[o.strategy].count += 1;
        if (o.user_rating) strategyStats[o.strategy].ratings.push(o.user_rating);
    }

    // Upsert top strategies into pattern_library
    for (const [strategy, stats] of Object.entries(strategyStats)) {
        const avgDelta = stats.totalDelta / stats.count;
        const avgRating = stats.ratings.length > 0
            ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
            : 3;
        const confidence = Math.min(1, stats.count / 50); // Confidence grows with more data

        await supabase.from('pattern_library').upsert(
            {
                weakness_type: weaknessType,
                best_strategy: strategy,
                avg_score_delta: Math.round(avgDelta * 10) / 10,
                sample_count: stats.count,
                confidence: Math.round(confidence * 100) / 100,
                tip_text: generateTip(strategy, avgDelta),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'weakness_type,best_strategy' }
        );
    }
}

function generateTip(strategy, avgDelta) {
    const tips = {
        'improve-clarity': `Simplifying language improved scores by +${Math.round(avgDelta)} points on average.`,
        'add-chain-of-thought': `Adding step-by-step reasoning improved scores by +${Math.round(avgDelta)} points on average.`,
        'convert-to-few-shot': `Including examples improved scores by +${Math.round(avgDelta)} points on average.`,
        'make-concise': `Making prompts concise improved scores by +${Math.round(avgDelta)} points on average.`,
        'add-role-context': `Adding role assignment improved scores by +${Math.round(avgDelta)} points on average.`,
        'structure-output': `Structuring the output format improved scores by +${Math.round(avgDelta)} points on average.`,
    };
    return tips[strategy] || `This strategy improved scores by +${Math.round(avgDelta)} points on average.`;
}
