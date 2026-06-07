// ============================================================
// structureFormatter.ts — Adds output structure hints
// Detects list/step/comparison intent from the prompt and appends
// the matching format directive if the user hasn't specified one.
// ============================================================
import type { AppliedRule } from './index';

// Patterns that already indicate structure was requested
const ALREADY_STRUCTURED = [
  /bullet points?/i, /numbered list/i, /as a list/i, /step.by.step/i,
  /as a table/i, /in markdown/i, /in json/i, /use (headers?|sections?)/i,
  /format (as|it|the response)/i,
];

// Intent detection patterns → appropriate structure directive
const INTENT_DETECTORS: { pattern: RegExp; directive: string; label: string }[] = [
  {
    pattern: /\b(list|give me|what are the|name (the|all)|enumerate)\b/i,
    directive: 'Format your response as a bullet-point list.',
    label: 'list intent',
  },
  {
    pattern: /\b(how (do|to|can)|steps? (to|for)|walk me through|guide me)\b/i,
    directive: 'Format your response as a numbered, step-by-step guide.',
    label: 'step-by-step intent',
  },
  {
    pattern: /\b(compare|difference between|vs\.?|versus|pros? and cons?|similarities|trade.?offs?)\b/i,
    directive: 'Present the comparison in a markdown table with clear column headers.',
    label: 'comparison intent',
  },
  {
    pattern: /\b(pros? and cons?|advantages? and disadvantages?|benefits? and drawbacks?)\b/i,
    directive: 'Present as two sections: Pros and Cons, each as a bullet list.',
    label: 'pros/cons intent',
  },
];

/**
 * Appends a structure directive if the prompt implies a structured output
 * but doesn't explicitly request one.
 */
export function addStructure(
  text: string,
  appliedRules: AppliedRule[]
): string {
  // Skip if structure is already specified
  if (ALREADY_STRUCTURED.some(re => re.test(text))) { return text; }

  // Skip very short prompts
  if (text.trim().split(/\s+/).length < 8) { return text; }

  for (const { pattern, directive, label } of INTENT_DETECTORS) {
    if (pattern.test(text)) {
      const result = `${text.trim()}\n\n${directive}`;

      appliedRules.push({
        transformer: 'StructureFormatter',
        rule: `Added format directive (detected ${label})`,
        description: `Appended: "${directive}"`,
        tokensSaved: -6, // Small token cost upfront prevents long unstructured responses
      });

      return result;
    }
  }

  return text;
}
