// ============================================================
// constraintAppender.ts — Appends output format constraints
// Detects the type of output the prompt implies, then appends
// the most appropriate format instruction if none exists.
// ============================================================
import type { PromptDomain } from '../evaluator';
import type { AppliedRule } from './index';

// Output format constraint strings to check for (prompt already has one)
const EXISTING_CONSTRAINT_PATTERNS = [
  /in json/i, /as a (list|table|bullet|numbered)/i, /format (as|it as|the (output|response))/i,
  /bullet points?/i, /numbered list/i, /step.by.step/i, /markdown/i,
  /in python/i, /in typescript/i, /in javascript/i, /using code/i,
  /return only/i, /respond with only/i, /output only/i,
  /\bno more than \d+/i, /\bat least \d+/i, /\bmaximum \d+/i,
];

// Best-fit constraints per domain
const DOMAIN_CONSTRAINTS: Record<PromptDomain, string> = {
  code: 'Provide clean, commented code.',
  writing: 'Keep the response concise and well-structured.',
  analysis: 'Present findings as a numbered list with brief explanations.',
  math: 'Show your working step by step, then state the final answer.',
  explanation: 'Format the response as 3–5 clear, numbered points.',
  general: 'Be specific and concise. Limit to 3–5 key points.',
};

/**
 * Appends an output constraint to the prompt if none is detected.
 */
export function appendConstraint(
  text: string,
  detectedDomain: PromptDomain,
  appliedRules: AppliedRule[]
): string {
  // Check if a constraint already exists
  const hasConstraint = EXISTING_CONSTRAINT_PATTERNS.some(re => re.test(text));
  if (hasConstraint) { return text; }

  // Don't append if prompt is very short — might be a title or label
  if (text.trim().split(/\s+/).length < 8) { return text; }

  const constraint = DOMAIN_CONSTRAINTS[detectedDomain] ?? DOMAIN_CONSTRAINTS.general;
  const result = `${text.trim()}\n\n${constraint}`;

  appliedRules.push({
    transformer: 'ConstraintAppender',
    rule: `Added output constraint`,
    description: `No output format instruction found. Appended: "${constraint}"`,
    tokensSaved: -5, // Adding tokens — improves first-pass accuracy, net token saving overall
  });

  return result;
}
