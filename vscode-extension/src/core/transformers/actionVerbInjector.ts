// ============================================================
// actionVerbInjector.ts — Adds a clear action verb if missing
// Uses compromise POS tagging from the evaluator to check if any
// meaningful action verb exists. If not, injects the best one
// based on the detected domain.
// ============================================================
import type { PromptDomain } from '../evaluator';
import type { AppliedRule } from './index';

// Best action verb per domain — ordered by specificity
const DOMAIN_VERB_MAP: Record<PromptDomain, string> = {
  code: 'Implement',
  writing: 'Draft',
  analysis: 'Analyze',
  math: 'Solve',
  explanation: 'Explain',
  general: 'Describe',
};

// Detection patterns for when a verb prefix already exists
// (avoids double-injecting if the user wrote an imperative)
const IMPERATIVE_OPENERS = [
  /^(explain|generate|create|write|summarize|list|compare|analyze|translate|classify|describe|define|evaluate|design|develop|implement|suggest|recommend|outline|rewrite|simplify|elaborate|optimize|debug|refactor|convert|extract|identify|review|critique|compose|draft|format|paraphrase|proofread|research|calculate|solve|produce|build|construct|compute|test|validate|parse|find|show|give|tell|make|fix|update|modify|add|remove|replace|check|verify)/i,
];

/**
 * Injects an action verb prefix if the prompt has no detected action verbs.
 * Uses the domain to pick the most relevant verb.
 */
export function injectActionVerb(
  text: string,
  detectedVerbs: string[],
  detectedDomain: PromptDomain,
  appliedRules: AppliedRule[]
): string {
  // If the evaluator (compromise) already found action verbs, don't inject
  if (detectedVerbs.length > 0) { return text; }

  // Also check if the text already opens with a strong imperative
  const firstWords = text.trim().split(/\s+/).slice(0, 3).join(' ');
  if (IMPERATIVE_OPENERS.some(re => re.test(firstWords))) { return text; }

  // If the text is too short (< 5 words), don't inject — might distort meaning
  if (text.trim().split(/\s+/).length < 5) { return text; }

  const verb = DOMAIN_VERB_MAP[detectedDomain] ?? 'Describe';
  const result = `${verb} the following:\n${text.trim()}`;

  appliedRules.push({
    transformer: 'ActionVerbInjector',
    rule: `Added action verb: "${verb}"`,
    description: `No imperative verb detected in prompt. Added "${verb}" as the action directive.`,
    tokensSaved: -2, // Adding 2 tokens — intentional quality trade-off
  });

  return result;
}
