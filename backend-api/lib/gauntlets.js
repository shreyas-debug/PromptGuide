// Refinement goals (gauntlets)
export const GAUNTLETS = {
    'improve-clarity': {
        name: 'Improve Clarity & Specificity',
        instruction:
            'Focus on making the prompt\'s language simpler, clearer, and more direct. Add specific details and constraints if they are missing.',
    },
    'add-chain-of-thought': {
        name: 'Add Chain-of-Thought',
        instruction:
            'Modify the prompt to include a chain-of-thought or a step-by-step reasoning process that guides the AI.',
    },
    'convert-to-few-shot': {
        name: 'Convert to Few-Shot',
        instruction:
            'Rewrite the prompt to include at least two clear examples (shots) that demonstrate the desired output format.',
    },
    'make-concise': {
        name: 'Make Concise & Direct',
        instruction:
            'Trim unnecessary words, remove redundancy, and make the prompt as concise as possible while preserving all essential information.',
    },
    'add-role-context': {
        name: 'Add Role & Context',
        instruction:
            'Add a clear role assignment (e.g., "You are an expert...") and provide relevant context or background information the AI needs.',
    },
    'structure-output': {
        name: 'Structure the Output',
        instruction:
            'Add explicit output format instructions such as bullet points, numbered lists, tables, or markdown formatting requirements.',
    },
};
