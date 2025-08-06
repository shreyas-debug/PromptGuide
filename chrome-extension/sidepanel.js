document.addEventListener('DOMContentLoaded', () => {
    // Select all UI elements
    const evaluateButton = document.getElementById('evaluateButton');
    const promptInput = document.getElementById('promptInput');
    const resultContent = document.getElementById('resultContent');
    const loader = document.getElementById('loader');
    const evaluationResult = document.getElementById('evaluationResult');
    const refineButton = document.getElementById('refineButton');
    const copyButton = document.getElementById('copyButton'); // New copy button

    let latestEvaluation = null;

    // --- NEW: Function to handle copying text to clipboard ---
    copyButton.addEventListener('click', () => {
        const textToCopy = promptInput.value;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                // Visual feedback that copy was successful
                copyButton.innerHTML = 'Copied!';
                setTimeout(() => {
                    copyButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                        </svg>
                    `;
                }, 1000);
            }).catch(err => console.error('Failed to copy text: ', err));
        }
    });

    // Function to check for text passed from the content script
    async function checkForInjectedText() {
        const result = await chrome.storage.local.get(['textToInject']);
        if (result.textToInject) {
            promptInput.value = result.textToInject;
            await chrome.storage.local.remove(['textToInject']);
        }
    }

    evaluateButton.addEventListener('click', () => {
        const promptText = promptInput.value;
        if (!promptText) return alert('Please enter a prompt.');

        resultContent.style.display = 'block';
        loader.style.display = 'block';
        evaluationResult.innerHTML = '';
        refineButton.style.display = 'none';

        fetch('http://127.0.0.1:5000/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptText }),
        })
        .then(response => response.json())
        .then(data => {
            loader.style.display = 'none';
            if (data.error) {
                evaluationResult.innerHTML = `<p class="text-danger">Error: ${data.error}</p>`;
            } else {
                const evaluation = JSON.parse(data.evaluation);
                latestEvaluation = {
                    original_prompt: promptText,
                    score: evaluation.final_score,
                    feedback: evaluation.feedback
                };
                evaluationResult.innerHTML = `
                    <h4>Score: ${evaluation.final_score} / 100</h4>
                    <p class="mb-0"><strong>Feedback:</strong> ${evaluation.feedback}</p>
                `;
                refineButton.style.display = 'block';
            }
        })
        .catch(error => {
            loader.style.display = 'none';
            console.error('Evaluation Error:', error);
        });
    });

    refineButton.addEventListener('click', () => {
        if (!latestEvaluation) return;

        refineButton.textContent = 'Refining...';
        refineButton.disabled = true;

        fetch('http://127.0.0.1:5000/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(latestEvaluation),
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`Refinement Error: ${data.error}`);
            } else {
                promptInput.value = data.refined_prompt;
            }
        })
        .catch(error => console.error('Refinement Error:', error))
        .finally(() => {
            refineButton.textContent = 'Refine this Prompt';
            refineButton.disabled = false;
            refineButton.style.display = 'none';
        });
    });

    checkForInjectedText();
});