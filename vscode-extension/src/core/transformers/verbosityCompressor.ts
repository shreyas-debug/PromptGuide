// ============================================================
// verbosityCompressor.ts — Removes filler phrases to reduce tokens
// Rules loaded from data/verbosity-rules.json
// Optionally integrates with semanticAnalyzer to remove redundant sentences
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { findRedundantSentences } from '../semanticAnalyzer';
import type { AppliedRule } from './index';

interface VerbosityRule {
  pattern: string;
  replacement: string;
  tokensSaved: number;
  description: string;
}

let rulesCache: VerbosityRule[] | null = null;

function loadRules(extensionPath: string): VerbosityRule[] {
  if (rulesCache) { return rulesCache; }
  const rulesPath = path.join(extensionPath, 'data', 'verbosity-rules.json');
  try {
    const content = fs.readFileSync(rulesPath, 'utf-8');
    rulesCache = JSON.parse(content) as VerbosityRule[];
    return rulesCache;
  } catch {
    return [];
  }
}

/**
 * Applies all verbosity rules to the text.
 * Returns the compressed text and a list of applied rules.
 */
export function compressVerbosity(
  text: string,
  extensionPath: string,
  appliedRules: AppliedRule[]
): string {
  const rules = loadRules(extensionPath);
  let result = text;

  for (const rule of rules) {
    // Case-insensitive, global replacement
    const regex = new RegExp(
      // Escape special regex characters in the pattern
      rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'gi'
    );

    const before = result;
    if (rule.replacement === '') {
      // Remove the phrase.
      // IMPORTANT: only collapse horizontal whitespace (spaces/tabs), NOT newlines.
      // Collapsing \s{2,} would destroy paragraph/line structure in markdown docs.
      result = result.replace(regex, '');

      // Collapse multiple spaces on the same line (but not newlines)
      result = result.replace(/[^\S\n]+/g, ' ');

      // Clean up any trailing spaces each line may have after phrase removal
      result = result.split('\n').map(line => line.trimEnd()).join('\n');

      // Collapse 3+ consecutive blank lines down to 2 (preserve paragraph breaks)
      result = result.replace(/\n{3,}/g, '\n\n').trim();
    } else {
      result = result.replace(regex, rule.replacement);
    }

    if (result !== before) {
      appliedRules.push({
        transformer: 'VerbosityCompressor',
        rule: `"${rule.pattern}" → ${rule.replacement ? `"${rule.replacement}"` : '(removed)'}`,
        description: rule.description,
        tokensSaved: rule.tokensSaved,
      });
    }
  }

  return result;
}

/**
 * Removes semantically redundant sentences (requires MiniLM model).
 * Falls back silently if model is not available.
 */
export async function removeRedundantSentences(
  text: string,
  globalStoragePath: string,
  appliedRules: AppliedRule[]
): Promise<string> {
  const redundant = await findRedundantSentences(text, globalStoragePath);
  if (redundant.length === 0) { return text; }

  let result = text;
  for (const { sentence, similarity } of redundant) {
    result = result.replace(sentence, '').replace(/\s{2,}/g, ' ').trim();
    appliedRules.push({
      transformer: 'SemanticDeduplicator',
      rule: `Removed redundant sentence (${similarity}% similar to earlier sentence)`,
      description: `"${sentence.substring(0, 60)}..." is semantically redundant`,
      tokensSaved: Math.ceil(sentence.split(/\s+/).length * 1.3),
    });
  }

  return result;
}
