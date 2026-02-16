// ============================================================
// evaluation.js — Client-side prompt evaluation engine
// Ported from Python backend (evaluation_metrics.py + services.py)
// Runs entirely in the browser — no API call needed for scoring
// ============================================================

// --- Utility: Simple word tokenizer ---
function tokenize(text) {
    return text.toLowerCase().match(/\b[a-z']+\b/g) || [];
}

function countSentences(text) {
    const matches = text.match(/[.!?]+/g);
    return matches ? matches.length : 1;
}

function countSyllables(word) {
    word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

// --- 1. Clarity & Readability ---

/**
 * Flesch Reading Ease — higher is easier to read.
 * Formula: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 */
function calculateReadingEase(text) {
    const words = tokenize(text);
    if (words.length === 0) return 0;
    const sentences = countSentences(text);
    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (totalSyllables / words.length);
    return Math.max(0, Math.min(100, score));
}

/**
 * Lexical diversity — unique words / total words. Higher = more varied vocabulary.
 */
function calculateLexicalDiversity(text) {
    const words = tokenize(text);
    if (words.length === 0) return 0;
    return new Set(words).size / words.length;
}

// --- 2. Specificity & Intent ---

const ACTION_VERBS = [
    'explain', 'generate', 'create', 'write', 'summarize', 'list', 'compare',
    'analyze', 'translate', 'classify', 'describe', 'define', 'evaluate',
    'design', 'develop', 'implement', 'suggest', 'recommend', 'outline',
    'rewrite', 'simplify', 'elaborate', 'optimize', 'debug', 'refactor',
    'convert', 'extract', 'identify', 'review', 'critique', 'compose',
    'draft', 'format', 'paraphrase', 'proofread', 'research', 'calculate',
];

function countActionVerbs(text) {
    const words = tokenize(text);
    return words.filter((w) => ACTION_VERBS.includes(w)).length;
}

const CONSTRAINT_PHRASES = [
    'in the style of', 'as a', 'format as', 'ensure that', 'must include',
    'with a focus on', 'no more than', 'at least', 'in the form of',
    'using the following', 'step by step', 'for example', 'such as',
    'do not include', 'limited to', 'in json', 'in markdown',
    'as a table', 'as a list', 'in bullet points',
];

function countConstraints(text) {
    const lower = text.toLowerCase();
    return CONSTRAINT_PHRASES.filter((phrase) => lower.includes(phrase)).length;
}

function getPromptLengthScore(text) {
    const words = tokenize(text);
    if (words.length < 5) return 0;
    if (words.length < 15) return 5;
    return 10;
}

// --- 3. Main Evaluation Function ---

/**
 * Runs a comprehensive evaluation and returns score + breakdown + feedback.
 * @param {string} prompt
 * @returns {{ finalScore: number, breakdown: Object, feedback: string, weakestDimension: string }}
 */
function runFullEvaluation(prompt) {
    if (!prompt || prompt.trim().length === 0) {
        return {
            finalScore: 0,
            breakdown: {},
            feedback: 'Prompt is empty.',
            weakestDimension: 'clarity',
        };
    }

    const readingEase = calculateReadingEase(prompt);
    const lexicalDiversity = calculateLexicalDiversity(prompt);
    const actionVerbs = countActionVerbs(prompt);
    const constraints = countConstraints(prompt);
    const lengthScore = getPromptLengthScore(prompt);

    const breakdown = {
        'Clarity': readingEase > 60 ? 20 : Math.max(0, Math.round(readingEase / 3)),
        'Vocabulary': lexicalDiversity > 0.8 ? 20 : Math.round(lexicalDiversity * 25),
        'Actionability': actionVerbs > 0 ? 25 : 0,
        'Specificity': constraints > 0 ? 25 : 0,
        'Brevity': lengthScore > 5 ? 10 : 0,
    };

    const finalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Generate human-readable feedback
    const feedbackParts = [];
    if (breakdown['Clarity'] < 15) {
        feedbackParts.push('The prompt is complex and may be hard for the AI to parse. Try simplifying the language.');
    }
    if (breakdown['Vocabulary'] < 15) {
        feedbackParts.push('The vocabulary is repetitive. Using more diverse words can add descriptive power.');
    }
    if (breakdown['Actionability'] === 0) {
        feedbackParts.push("The prompt lacks a clear action verb (e.g., 'summarize', 'generate'). State your goal directly.");
    }
    if (breakdown['Specificity'] === 0) {
        feedbackParts.push("Add constraints like 'in the style of...', 'format as a list', or 'step by step'.");
    }
    if (breakdown['Brevity'] === 0) {
        feedbackParts.push('The prompt is too short. Add more detail for the AI to work with.');
    }

    const feedback = feedbackParts.length > 0
        ? feedbackParts.join(' ')
        : 'This is a well-structured prompt!';

    // Find weakest dimension for agentic targeting
    let weakestDimension = 'clarity';
    let weakestScore = Infinity;
    const dimensionMap = {
        'Clarity': 'clarity',
        'Vocabulary': 'vocabulary',
        'Actionability': 'actionability',
        'Specificity': 'specificity',
        'Brevity': 'brevity',
    };

    for (const [key, value] of Object.entries(breakdown)) {
        const maxForDim = key === 'Brevity' ? 10 : (key === 'Clarity' || key === 'Vocabulary' ? 20 : 25);
        const normalized = value / maxForDim;
        if (normalized < weakestScore) {
            weakestScore = normalized;
            weakestDimension = dimensionMap[key];
        }
    }

    return { finalScore, breakdown, feedback, weakestDimension };
}
