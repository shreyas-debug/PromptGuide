// ============================================================
// transformers/index.ts — Pipeline orchestrator
// Runs all transformers in order and returns a full TransformResult
// including score delta, token savings, and per-rule audit trail.
// ============================================================
import { runFullEvaluation, type Evaluation } from '../evaluator';
import { estimateTokens, type ModelFamily } from '../tokenCounter';
import { compressVerbosity, removeRedundantSentences, clearRulesCache } from './verbosityCompressor';
export { clearRulesCache };
import { injectActionVerb } from './actionVerbInjector';
import { appendConstraint } from './constraintAppender';
import { injectRole } from './roleInjector';
import { addStructure } from './structureFormatter';

export interface AppliedRule {
  transformer: string;
  rule: string;
  description: string;
  tokensSaved: number; // negative = added tokens (intentional quality improvement)
}

export interface TransformResult {
  original: string;
  optimized: string;
  scoreOriginal: Evaluation;
  scoreOptimized: Evaluation;
  tokensOriginal: number;
  tokensOptimized: number;
  /** Net tokens saved. Negative means the optimized version is longer (rare) */
  tokensSaved: number;
  rulesApplied: AppliedRule[];
  /** True if @huggingface/transformers ran semantic deduplication */
  usedSemanticAnalysis: boolean;
}

/**
 * Runs the full optimization pipeline on a prompt.
 *
 * Pipeline order:
 *  1. VerbosityCompressor  — removes filler tokens (token reduction)
 *  2. SemanticDeduplicator — removes redundant sentences (ML, async, optional)
 *  3. RoleInjector         — adds "You are a..." if missing (quality)
 *  4. ActionVerbInjector   — adds action verb if missing (quality)
 *  5. ConstraintAppender   — adds output format if missing (quality)
 *  6. StructureFormatter   — adds structural hint if implied (quality)
 *
 * Steps 3–6 may add tokens, but they improve first-pass AI accuracy,
 * which reduces total tokens spent across a conversation.
 */
export async function optimizePrompt(
  prompt: string,
  extensionPath: string,
  globalStoragePath: string,
  tokenModel: ModelFamily = 'auto'
): Promise<TransformResult> {
  const scoreOriginal = runFullEvaluation(prompt);
  const tokensOriginal = estimateTokens(prompt, tokenModel).count;
  const rulesApplied: AppliedRule[] = [];

  let current = prompt;

  // Step 1: Remove verbose filler phrases (synchronous, JSON rules)
  current = compressVerbosity(current, extensionPath, rulesApplied);

  // Step 2: Semantic deduplication (async, requires MiniLM model)
  const beforeSemantic = current;
  current = await removeRedundantSentences(current, globalStoragePath, rulesApplied);
  const usedSemanticAnalysis = current !== beforeSemantic;

  // Steps 3–6: Quality-adding transformers
  // These inject role/verb/constraint text which ADDS tokens.
  // We only run them if the prompt has a low score (< 50) AND is short (< 30 words).
  // For longer, higher-quality prompts we skip them — adding tokens defeats the goal.
  const wordCount = prompt.trim().split(/\s+/).length;
  const needsQualityBoost = scoreOriginal.finalScore < 50 && wordCount < 30;

  if (needsQualityBoost) {
    // Step 3: Role injection
    current = injectRole(current, scoreOriginal.detectedDomain, rulesApplied);

    // Step 4: Action verb injection
    current = injectActionVerb(
      current,
      scoreOriginal.detectedVerbs,
      scoreOriginal.detectedDomain,
      rulesApplied
    );

    // Step 5: Constraint appender
    current = appendConstraint(current, scoreOriginal.detectedDomain, rulesApplied);

    // Step 6: Structure formatter
    current = addStructure(current, rulesApplied);
  }

  const scoreOptimized = runFullEvaluation(current);
  const tokensOptimized = estimateTokens(current, tokenModel).count;

  return {
    original: prompt,
    optimized: current,
    scoreOriginal,
    scoreOptimized,
    tokensOriginal,
    tokensOptimized,
    tokensSaved: tokensOriginal - tokensOptimized,
    rulesApplied,
    usedSemanticAnalysis,
  };
}

/**
 * Synchronous version — skips semantic deduplication (no async required).
 * Used by diagnostics provider and status bar where async is problematic.
 */
export function optimizePromptSync(
  prompt: string,
  extensionPath: string,
  tokenModel: ModelFamily = 'auto'
): Omit<TransformResult, 'usedSemanticAnalysis'> & { usedSemanticAnalysis: false } {
  const scoreOriginal = runFullEvaluation(prompt);
  const tokensOriginal = estimateTokens(prompt, tokenModel).count;
  const rulesApplied: AppliedRule[] = [];

  let current = prompt;
  current = compressVerbosity(current, extensionPath, rulesApplied);

  // Quality-adding steps: only run if prompt is under-developed
  const wordCount = prompt.trim().split(/\s+/).length;
  if (scoreOriginal.finalScore < 50 && wordCount < 30) {
    current = injectRole(current, scoreOriginal.detectedDomain, rulesApplied);
    current = injectActionVerb(current, scoreOriginal.detectedVerbs, scoreOriginal.detectedDomain, rulesApplied);
    current = appendConstraint(current, scoreOriginal.detectedDomain, rulesApplied);
    current = addStructure(current, rulesApplied);
  }

  const scoreOptimized = runFullEvaluation(current);
  const tokensOptimized = estimateTokens(current, tokenModel).count;

  return {
    original: prompt,
    optimized: current,
    scoreOriginal,
    scoreOptimized,
    tokensOriginal,
    tokensOptimized,
    tokensSaved: tokensOriginal - tokensOptimized,
    rulesApplied,
    usedSemanticAnalysis: false,
  };
}
