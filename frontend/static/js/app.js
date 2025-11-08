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

    // Get API URL from config or use default
    let API_BASE_URL = 'http://127.0.0.1:5000';
    async function loadConfig() {
        try {
            const response = await fetch('config.json');
            if (response.ok) {
                const config = await response.json();
                if (config.apiUrl) {
                    API_BASE_URL = config.apiUrl;
                }
            }
        } catch (error) {
            // Config file not found, use default
            console.log('Using default API URL:', API_BASE_URL);
        }
    }

    function showBackendError() {
        const isLocalhost = API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost');
        evaluationResult.innerHTML = `
            <div style="padding: 1rem; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; color: #856404;">
                <h4>⚠️ Backend Not Available</h4>
                ${isLocalhost ? `
                <p><strong>For Local Development:</strong></p>
                <ol style="text-align: left; margin: 1rem 0;">
                    <li>Navigate to the <code>backend</code> directory</li>
                    <li>Activate your virtual environment</li>
                    <li>Run <code>python run.py</code></li>
                    <li>Refresh this page</li>
                </ol>
                <hr style="margin: 1rem 0; border-color: #ffc107;">
                <p><strong>For Production (Deployed Backend):</strong></p>
                <p>If you've deployed your backend, update <code>config.json</code> in the frontend directory with your backend URL:</p>
                <pre style="background: #f8f9fa; padding: 0.5rem; border-radius: 4px; overflow-x: auto;"><code>{
  "apiUrl": "https://your-backend-url.com"
}</code></pre>
                ` : `
                <p><strong>Current API URL:</strong></strong> <code>${API_BASE_URL}</code></p>
                <p>Please verify that your backend is running and accessible at this URL.</p>
                `}
                <p style="margin-top: 1rem; font-size: 0.9em;"><strong>Note:</strong> The backend must be deployed separately (GitHub Pages only serves static files).</p>
            </div>
        `;
    }

    function loadGauntlets() {
        fetch(`${API_BASE_URL}/api/gauntlets`)
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
            .catch(error => {
                console.error('Error loading gauntlets:', error);
                showBackendError();
            });
    }

    evaluateButton.addEventListener('click', () => {
        const promptText = promptInput.value;
        if (!promptText) return alert('Please enter a prompt.');

        evaluationResult.style.display = 'block';
        evaluationResult.innerHTML = '<div class="loader">Evaluating...</div>';
        refineSection.style.display = 'none';

        fetch(`${API_BASE_URL}/api/evaluate`, {
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
        .catch(error => {
            console.error('Evaluation Error:', error);
            showBackendError();
        });
    });

    refineButton.addEventListener('click', () => {
        if (!latestEvaluationData) return;

        const selectedGauntletId = gauntletSelect.value;
        if (!selectedGauntletId) return alert('Please select a refinement goal.');
        latestEvaluationData.gauntlet_id = selectedGauntletId;

        refineButton.style.display = 'none';
        refineLoader.style.display = 'block';
        refineResult.style.display = 'none';

        fetch(`${API_BASE_URL}/api/refine`, {
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
        })
        .catch(error => {
            refineLoader.style.display = 'none';
            console.error('Refinement Error:', error);
            showBackendError();
        });
    });

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(refinedPrompt.value).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => { copyButton.textContent = 'Copy'; }, 1000);
        });
    });

    async function checkForInjectedText() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.local.get(['textToInject']);
                if (result.textToInject && promptInput) {
                    promptInput.value = result.textToInject;
                    chrome.storage.local.remove(['textToInject']);
                }
            }
        } catch (error) {
            // Chrome extension APIs not available (e.g., on GitHub Pages)
            console.log('Chrome extension APIs not available');
        }
    }

    // Initialize
    (async () => {
        await loadConfig();
        loadGauntlets();
        checkForInjectedText();
    })();
});