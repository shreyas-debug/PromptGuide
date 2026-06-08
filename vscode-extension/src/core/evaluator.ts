// ============================================================
// evaluator.ts — Prompt evaluation engine (TypeScript port of evaluation.js)
// Uses compromise for POS-based verb detection (more accurate than regex lists)
// ============================================================
import nlp from 'compromise';
import * as path from 'path';

export interface Evaluation {
  finalScore: number;
  breakdown: ScoreBreakdown;
  feedback: string;
  weakestDimension: WeaknessDimension;
  detectedVerbs: string[];
  detectedDomain: PromptDomain;
}

export interface ScoreBreakdown {
  Clarity: number;
  Vocabulary: number;
  Actionability: number;
  Specificity: number;
  Brevity: number;
}

export type WeaknessDimension = 'clarity' | 'vocabulary' | 'actionability' | 'specificity' | 'brevity';
export type PromptDomain = 'code' | 'writing' | 'analysis' | 'math' | 'explanation' | 'general';

// --- Utility: Tokenize ---
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+/g);
  return matches ? matches.length : 1;
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// --- 1. Clarity: Flesch Reading Ease ---
function calculateReadingEase(text: string): number {
  const words = tokenize(text);
  if (words.length === 0) { return 0; }
  const sentences = countSentences(text);
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (totalSyllables / words.length);
  return Math.max(0, Math.min(100, score));
}

// --- 2. Vocabulary: Lexical Diversity ---
function calculateLexicalDiversity(text: string): number {
  const words = tokenize(text);
  if (words.length === 0) { return 0; }
  return new Set(words).size / words.length;
}

// --- 3. Actionability: POS-based verb detection via compromise ---
// This replaces the hardcoded ACTION_VERBS array from evaluation.js
// compromise detects ANY imperative/infinitive verb, not just our hardcoded list
export function detectVerbs(text: string): string[] {
  const doc = nlp(text);
  // Get all verbs, then filter for likely action verbs (not 'is', 'are', 'have' etc.)
  const allVerbs: string[] = doc.verbs().out('array') as string[];
  const auxiliaries = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used']);
  return allVerbs.filter(v => !auxiliaries.has(v.toLowerCase()));
}

// --- 4. Specificity: Constraint phrase detection ---
const CONSTRAINT_PHRASES = [
  'in the style of', 'as a', 'format as', 'ensure that', 'must include',
  'with a focus on', 'no more than', 'at least', 'in the form of',
  'using the following', 'step by step', 'for example', 'such as',
  'do not include', 'limited to', 'in json', 'in markdown',
  'as a table', 'as a list', 'in bullet points', 'step-by-step',
  'numbered list', 'comma-separated', 'in python', 'in typescript',
  'in plain english', 'maximum', 'minimum', 'exactly', 'at most',
];

function countConstraints(text: string): number {
  const lower = text.toLowerCase();
  return CONSTRAINT_PHRASES.filter(phrase => lower.includes(phrase)).length;
}

// --- 5. Brevity ---
function getBrevityScore(text: string): number {
  const words = tokenize(text);
  const count = words.length;
  if (count < 5 || count > 400) { return 0; }
  if (count < 15 || count > 200) { return 5; }
  return 10;
}

// --- Domain Detection (used by transformers) ---
const DOMAIN_SIGNALS: Record<PromptDomain, string[]> = {
  code: ['function', 'class', 'method', 'variable', 'bug', 'error', 'code', 'script',
    'algorithm', 'api', 'database', 'refactor', 'debug', 'typescript', 'python',
    'javascript', 'java', 'implement', 'test', 'unit test', 'endpoint', 'async'],
  writing: ['email', 'letter', 'essay', 'blog', 'article', 'story', 'write', 'draft',
    'paragraph', 'sentence', 'tone', 'formal', 'informal', 'persuasive', 'audience'],
  analysis: ['analyze', 'compare', 'evaluate', 'assess', 'review', 'examine', 'study',
    'research', 'data', 'trends', 'pattern', 'insight', 'report', 'findings'],
  math: ['calculate', 'solve', 'equation', 'formula', 'proof', 'matrix', 'vector',
    'derivative', 'integral', 'probability', 'statistics', 'number', 'compute'],
  explanation: ['explain', 'describe', 'define', 'what is', 'how does', 'why does',
    'clarify', 'illustrate', 'elaborate', 'teach', 'tutor', 'concept', 'overview'],
  general: [],
};

export function detectDomain(text: string): PromptDomain {
  const lower = text.toLowerCase();
  const scores: Record<PromptDomain, number> = {
    code: 0, writing: 0, analysis: 0, math: 0, explanation: 0, general: 0,
  };
  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS) as [PromptDomain, string[]][]) {
    for (const signal of signals) {
      if (lower.includes(signal)) { scores[domain]++; }
    }
  }
  const best = (Object.entries(scores) as [PromptDomain, number][])
    .reduce((a, b) => b[1] > a[1] ? b : a);
  return best[1] > 0 ? best[0] : 'general';
}

// --- Main Evaluation Function ---
export function runFullEvaluation(prompt: string): Evaluation {
  if (!prompt || prompt.trim().length === 0) {
    return {
      finalScore: 0,
      breakdown: { Clarity: 0, Vocabulary: 0, Actionability: 0, Specificity: 0, Brevity: 0 },
      feedback: 'Prompt is empty.',
      weakestDimension: 'clarity',
      detectedVerbs: [],
      detectedDomain: 'general',
    };
  }

  const readingEase = calculateReadingEase(prompt);
  const lexicalDiversity = calculateLexicalDiversity(prompt);
  const detectedVerbs = detectVerbs(prompt);
  const constraints = countConstraints(prompt);
  const brevityScore = getBrevityScore(prompt);
  const detectedDomain = detectDomain(prompt);

  const breakdown: ScoreBreakdown = {
    Clarity: readingEase > 60 ? 20 : Math.max(0, Math.round(readingEase / 3)),
    Vocabulary: lexicalDiversity > 0.8 ? 20 : Math.round(lexicalDiversity * 25),
    Actionability: Math.min(25, detectedVerbs.length * 10),
    Specificity: Math.min(25, constraints * 8),
    Brevity: brevityScore,
  };

  const finalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // --- Generate actionable feedback ---
  const feedbackParts: string[] = [];
  if (breakdown.Clarity < 15) {
    feedbackParts.push('The prompt is complex. Try shorter sentences and simpler words.');
  }
  if (breakdown.Vocabulary < 15) {
    feedbackParts.push('Vocabulary is repetitive. Using more varied words adds descriptive power.');
  }
  if (breakdown.Actionability === 0) {
    feedbackParts.push("No action verb found. Start with 'Explain', 'Generate', 'Summarize', or 'Analyze'.");
  }
  if (breakdown.Specificity === 0) {
    feedbackParts.push("Add output constraints like 'in JSON format', 'as a list', or 'step by step'.");
  }
  if (breakdown.Brevity === 0) {
    const words = tokenize(prompt);
    if (words.length < 5) {
      feedbackParts.push('The prompt is too short. Add more context for the AI to work with.');
    } else {
      feedbackParts.push('The prompt is very long. Consider making it more concise.');
    }
  } else if (breakdown.Brevity === 5) {
    const words = tokenize(prompt);
    if (words.length < 15) {
      feedbackParts.push('The prompt is slightly short. Consider adding more context.');
    } else {
      feedbackParts.push('The prompt is somewhat verbose. Check if any details can be trimmed.');
    }
  }

  const feedback = feedbackParts.length > 0
    ? feedbackParts.join(' ')
    : 'Well-structured prompt! Minor optimizations available.';

  // --- Find weakest dimension ---
  const maxPerDim: Record<keyof ScoreBreakdown, number> = {
    Clarity: 20, Vocabulary: 20, Actionability: 25, Specificity: 25, Brevity: 10,
  };
  let weakestDimension: WeaknessDimension = 'clarity';
  let weakestNormalized = Infinity;
  for (const [key, value] of Object.entries(breakdown) as [keyof ScoreBreakdown, number][]) {
    const normalized = value / maxPerDim[key];
    if (normalized < weakestNormalized) {
      weakestNormalized = normalized;
      weakestDimension = key.toLowerCase() as WeaknessDimension;
    }
  }

  return { finalScore, breakdown, feedback, weakestDimension, detectedVerbs, detectedDomain };
}

/**
 * Smart heuristic to determine if a text document is a prompt file.
 * Avoids showing token counts and diagnostics on non-prompt markdown/txt files (like READMEs).
 */
export function isPromptText(text: string, fsPath: string, languageId: string): boolean {
  if (languageId === 'prompt' || fsPath.endsWith('.prompt')) {
    return true;
  }

  // Check file name
  const fileName = path.basename(fsPath).toLowerCase();
  if (fileName.includes('prompt')) {
    return true;
  }

  // Check for opt-in comments
  if (text.includes('<!-- promptguide-enable -->') || text.includes('<!-- promptguide: enable -->') || text.includes('<!-- prompt -->')) {
    return true;
  }

  // Check for frontmatter opt-in
  const frontmatterMatch = text.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (frontmatterMatch) {
    const fmContent = frontmatterMatch[1];
    if (/(promptguide|prompt)\s*:\s*true/i.test(fmContent)) {
      return true;
    }
  }

  // Check for common prompt headers
  const promptHeaders = [
    /^#+ (system prompt|prompt|task|instructions|role)\b/im,
    /^(system|user|assistant):/im
  ];
  if (promptHeaders.some(regex => regex.test(text))) {
    return true;
  }

  return false;
}
