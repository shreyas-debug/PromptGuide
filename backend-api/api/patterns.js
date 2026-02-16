import { getSupabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabase();

        const { data: patterns, error } = await supabase
            .from('pattern_library')
            .select('weakness_type, best_strategy, avg_score_delta, sample_count, confidence, tip_text')
            .order('avg_score_delta', { ascending: false });

        if (error) {
            console.error('[/api/patterns] Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch patterns' });
        }

        // Group by weakness type for easier client consumption
        const grouped = {};
        for (const p of (patterns || [])) {
            if (!grouped[p.weakness_type]) grouped[p.weakness_type] = [];
            grouped[p.weakness_type].push({
                strategy: p.best_strategy,
                avgImprovement: p.avg_score_delta,
                dataPoints: p.sample_count,
                confidence: p.confidence,
                tip: p.tip_text,
            });
        }

        // Also fetch global stats
        const { count: totalRefinements } = await supabase
            .from('refinement_outcomes')
            .select('*', { count: 'exact', head: true });

        return res.status(200).json({
            patterns: grouped,
            stats: {
                totalRefinements: totalRefinements || 0,
                lastUpdated: new Date().toISOString(),
            },
        });
    } catch (err) {
        console.error('[/api/patterns] Error:', err);
        return res.status(500).json({ error: 'Failed to fetch patterns' });
    }
}
