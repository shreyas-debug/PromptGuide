// ============================================================
// content_script.js — Platform-aware inline refinement
// Detects AI platforms, shows contextual "Refine" button,
// and supports inserting refined prompts back into text fields
// ============================================================

let debounceTimer;
let refineButton = null;
let currentPlatform = 'unknown';
let suppressButton = false;

// --- Platform Detection ---
const PLATFORMS = {
    'chat.openai.com': 'chatgpt',
    'chatgpt.com': 'chatgpt',
    'claude.ai': 'claude',
    'gemini.google.com': 'gemini',
    'perplexity.ai': 'perplexity',
    'deepseek.com': 'deepseek',
    'poe.com': 'poe',
    'copilot.microsoft.com': 'copilot',
};

function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [domain, name] of Object.entries(PLATFORMS)) {
        if (hostname.includes(domain)) return name;
    }
    return 'unknown';
}

currentPlatform = detectPlatform();

// --- Button Labels ---
function getButtonLabel() {
    return 'Refine ✨';
}

// --- Create the Refine Button ---
function initializeRefineButton() {
    if (document.getElementById('pg-refine-button')) return;

    refineButton = document.createElement('button');
    refineButton.id = 'pg-refine-button';
    refineButton.textContent = getButtonLabel();
    refineButton.style.display = 'none';

    // Add platform badge
    if (currentPlatform !== 'unknown') {
        refineButton.dataset.platform = currentPlatform;
    }

    document.body.appendChild(refineButton);

    refineButton.addEventListener('click', () => {
        const textToRefine = refineButton.dataset.textToRefine;
        if (textToRefine && chrome.runtime?.id) {
            chrome.runtime.sendMessage({
                action: 'openPopupWithText',
                text: textToRefine,
                platform: currentPlatform,
            });
        }
        refineButton.style.display = 'none';
    });
}

// --- Position and Show the Button ---
function showRefineButton(targetElement) {
    if (!refineButton) return;

    const text = targetElement.isContentEditable
        ? targetElement.textContent
        : targetElement.value;
    refineButton.dataset.textToRefine = text;

    const rect = targetElement.getBoundingClientRect();
    refineButton.style.display = 'flex';
    refineButton.style.top = `${window.scrollY + rect.top - 38}px`;
    refineButton.style.left = `${window.scrollX + rect.left}px`;
}

// --- Initialize ---
initializeRefineButton();

// --- Listen for typing ---
document.addEventListener('input', (event) => {
    const target = event.target;
    const isEditable =
        target.tagName?.toLowerCase() === 'textarea' ||
        target.tagName?.toLowerCase() === 'input' ||
        target.isContentEditable;

    if (isEditable) {
        clearTimeout(debounceTimer);
        if (suppressButton) return;
        debounceTimer = setTimeout(() => {
            const text = target.isContentEditable ? target.textContent : target.value;
            if (text && text.length > 15) {
                showRefineButton(target);
            } else if (refineButton) {
                refineButton.style.display = 'none';
            }
        }, 150);
    }
});

// --- Hide button on click away ---
document.addEventListener('mousedown', (event) => {
    if (
        refineButton &&
        refineButton.style.display !== 'none' &&
        !refineButton.contains(event.target) &&
        !event.target.isContentEditable &&
        event.target.tagName?.toLowerCase() !== 'textarea' &&
        event.target.tagName?.toLowerCase() !== 'input'
    ) {
        refineButton.style.display = 'none';
    }
});

// --- Listen for "Insert refined prompt" messages from side panel ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'insertRefinedPrompt') {
        // Suppress the refine button temporarily so it doesn't re-appear
        suppressButton = true;
        setTimeout(() => { suppressButton = false; }, 1000);

        const activeElement = document.activeElement;
        if (activeElement) {
            if (activeElement.isContentEditable) {
                activeElement.textContent = request.text;
                // Dispatch input event so the platform picks up the change
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (activeElement.tagName?.toLowerCase() === 'textarea' || activeElement.tagName?.toLowerCase() === 'input') {
                activeElement.value = request.text;
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // Try to find the main text input on the page
                const textarea = document.querySelector('textarea');
                const contentEditable = document.querySelector('[contenteditable="true"]');
                const target = textarea || contentEditable;
                if (target) {
                    if (target.isContentEditable) {
                        target.textContent = request.text;
                    } else {
                        target.value = request.text;
                    }
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }
        sendResponse({ success: true });
    }
    return true;
});