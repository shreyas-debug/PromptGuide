// ============================================================
// roleInjector.ts — Adds a role assignment if missing
// Uses compromise noun extraction to detect domain, then prepends
// the most relevant "You are a [role]" prefix.
// ============================================================
import type { PromptDomain } from '../evaluator';
import type { AppliedRule } from './index';

// Patterns that indicate a role is already assigned
const EXISTING_ROLE_PATTERNS = [
  /^you are (a|an|the)/i,
  /^act as (a|an|the)/i,
  /^as (a|an|the) [a-z]/i,
  /^pretend (you are|to be)/i,
  /^imagine you('re| are)/i,
  /^take the role/i,
  /^your role is/i,
];

// Most useful role per domain
const DOMAIN_ROLES: Record<PromptDomain, string> = {
  code: 'You are a senior software engineer with expertise in clean, efficient code.',
  writing: 'You are a professional editor and writer.',
  analysis: 'You are a data analyst with expertise in clear, evidence-based reasoning.',
  math: 'You are a mathematics tutor who explains concepts clearly and shows all working.',
  explanation: 'You are a knowledgeable teacher who explains complex topics simply.',
  general: 'You are a helpful, precise assistant.',
};

/**
 * Prepends a role assignment if the prompt does not already have one.
 */
export function injectRole(
  text: string,
  detectedDomain: PromptDomain,
  appliedRules: AppliedRule[]
): string {
  const trimmed = text.trim();

  // Check if a role is already assigned
  if (EXISTING_ROLE_PATTERNS.some(re => re.test(trimmed))) { return text; }

  // Don't inject on very short prompts
  if (trimmed.split(/\s+/).length < 6) { return text; }

  const role = DOMAIN_ROLES[detectedDomain] ?? DOMAIN_ROLES.general;
  const result = `${role}\n\n${trimmed}`;

  appliedRules.push({
    transformer: 'RoleInjector',
    rule: 'Added role assignment',
    description: `No role context detected. Prepended: "${role}"`,
    tokensSaved: -12, // Costs tokens now but prevents vague AI responses
  });

  return result;
}
