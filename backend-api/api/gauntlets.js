import { GAUNTLETS } from '../lib/gauntlets.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const gauntletList = {};
    for (const [id, g] of Object.entries(GAUNTLETS)) {
        gauntletList[id] = { name: g.name };
    }

    return res.status(200).json(gauntletList);
}
