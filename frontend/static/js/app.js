document.addEventListener('DOMContentLoaded', () => {
    const evaluateButton = document.getElementById('evaluateButton');
    const promptInput = document.getElementById('promptInput');
    const evaluationResult = document.getElementById('evaluationResult');
    const refineSection = document.getElementById('refineSection');
    const gauntletSelect = document.getElementById('gauntletSelect');
    const refineButton = document.getElementById('refineButton');
    const refineLoader = document.getElementById('refineLoader');
    const refineResult = document.getElementById('refineResult');
    const refinedPrompt = document.getElementById('refinedPrompt');
    const copyButton = document.getElementById('copyButton');

    let latestEvaluationData = null;

    function loadGauntlets() {
        fetch('http://127.0.0.1:5000/api/gauntlets')
            .then(response => response.json())
            .then(data => {
                if (gauntletSelect) {
                    gauntletSelect.innerHTML = '';
                    for (const id in data) {
                        const option = document.createElement('option');
                        option.value = id;
                        option.textContent = data[id].name;
                        gauntletSelect.appendChild(option);
                    }
                }
            })
            .catch(error => console.error('Error loading gauntlets:', error));
    }

    evaluateButton.addEventListener('click', () => {
        const promptText = promptInput.value;
        if (!promptText) return alert('Please enter a prompt.');

        evaluationResult.style.display = 'block';
        evaluationResult.innerHTML = '<div class="loader">Evaluating...</div>';
        refineSection.style.display = 'none';

        fetch('http://127.0.0.1:5000/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_prompt: promptText }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.error || !data.evaluation) {
                evaluationResult.innerHTML = `<p class="text-danger">Error: ${data.error || 'Invalid response.'}</p>`;
                return;
            }

            const evalData = data.evaluation;
            latestEvaluationData = {
                original_prompt: promptText,
                score: evalData.final_score,
                feedback: evalData.feedback
            };
            evaluationResult.innerHTML = `
                <h4>Score: ${evalData.final_score} / 100</h4>
                <p><strong>Feedback:</strong> ${evalData.feedback}</p>
            `;
            refineSection.style.display = 'block';
            refineResult.style.display = 'none';
            refineButton.style.display = 'block';
        })
        .catch(error => console.error('Evaluation Error:', error));
    });

    refineButton.addEventListener('click', () => {
        if (!latestEvaluationData) return;

        const selectedGauntletId = gauntletSelect.value;
        if (!selectedGauntletId) return alert('Please select a refinement goal.');
        latestEvaluationData.gauntlet_id = selectedGauntletId;

        refineButton.style.display = 'none';
        refineLoader.style.display = 'block';
        refineResult.style.display = 'none';

        fetch('http://127.0.0.1:5000/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(latestEvaluationData),
        })
        .then(response => response.json())
        .then(data => {
            refineLoader.style.display = 'none';
            if (data.error) {
                evaluationResult.innerHTML += `<p class="text-danger mt-2">Refinement Error: ${data.error}</p>`;
            } else {
                refinedPrompt.value = data.refined_prompt;
                refineResult.style.display = 'block';
            }
        });
    });

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(refinedPrompt.value).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => { copyButton.textContent = 'Copy'; }, 1000);
        });
    });

    async function checkForInjectedText() {
        const result = await chrome.storage.local.get(['textToInject']);
        if (result.textToInject && promptInput) {
            promptInput.value = result.textToInject;
            chrome.storage.local.remove(['textToInject']);
        }
    }

    loadGauntlets();
    checkForInjectedText();
});