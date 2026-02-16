import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// --- Provider Implementations ---

async function callGemini(systemPrompt, userPrompt) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-lite',
        systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(userPrompt);
    const response = result.response;
    return response.text();
}

async function callGroq(systemPrompt, userPrompt) {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
}

async function callOpenRouter(systemPrompt, userPrompt) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://promptguide.app',
            'X-Title': 'PromptGuide',
        },
        body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 1024,
            temperature: 0.7,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// --- Multi-Provider Fallback Router ---

const providers = [
    { name: 'gemini', fn: callGemini },
    { name: 'groq', fn: callGroq },
    { name: 'openrouter', fn: callOpenRouter },
];

/**
 * Calls the LLM with automatic fallback across providers.
 * @param {string} systemPrompt - The system instructions
 * @param {string} userPrompt - The user prompt to refine
 * @returns {{ text: string, provider: string }}
 */
export async function routeLLMCall(systemPrompt, userPrompt) {
    const errors = [];

    for (const provider of providers) {
        try {
            const text = await provider.fn(systemPrompt, userPrompt);
            return { text, provider: provider.name };
        } catch (err) {
            errors.push({ provider: provider.name, error: err.message });
            console.warn(`[LLM Router] ${provider.name} failed: ${err.message}`);
        }
    }

    throw new Error(
        `All LLM providers failed: ${JSON.stringify(errors)}`
    );
}
