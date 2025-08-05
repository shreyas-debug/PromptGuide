document.addEventListener('DOMContentLoaded', () => {
    const evaluateButton = document.getElementById('evaluateButton');
    const promptInput = document.getElementById('promptInput');
    const resultContent = document.getElementById('resultContent');
    const loader = document.getElementById('loader');
    const evaluationResult = document.getElementById('evaluationResult');
    const refineButton = document.getElementById('refineButton'); // Get the new button

    // --- Variables to store the latest evaluation data ---
    let latestEvaluation = null;
    async function checkForInjectedText() {
        const result = await chrome.storage.local.get(['textToInject']);
        if (result.textToInject) {
            promptInput.value = result.textToInject;
            // Clear the storage so it's not used again
            await chrome.storage.local.remove(['textToInject']);
        }
    }

    evaluateButton.addEventListener('click', () => {
        const promptText = promptInput.value;
        if (!promptText) {
            alert('Please enter a prompt to evaluate.');
            return;
        }

        // Set up UI for loading
        resultContent.style.display = 'block';
        loader.style.display = 'block';
        evaluationResult.innerHTML = '';
        refineButton.style.display = 'none'; // Hide refine button during evaluation

        const apiUrl = 'http://127.0.0.1:5000/api/evaluate';

        fetch(apiUrl, {
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

                // --- Store the evaluation data ---
                latestEvaluation = {
                    original_prompt: promptText,
                    score: evaluation.final_score,
                    feedback: evaluation.feedback
                };

                // Display the results as before
                evaluationResult.innerHTML = `
                    <h4>Score: ${evaluation.final_score} / 100</h4>
                    <p class="mb-0"><strong>Justification:</strong> ${evaluation.feedback}</p>
                `;

                // --- Show the Refine button ---
                refineButton.style.display = 'block';
            }
        })
        .catch(error => {
            loader.style.display = 'none';
            console.error('Evaluation Error:', error);
            evaluationResult.innerHTML = '<p class="text-danger">An error occurred during evaluation.</p>';
        });
    });

    // --- NEW EVENT LISTENER FOR THE REFINE BUTTON ---
    refineButton.addEventListener('click', () => {
        if (!latestEvaluation) return;

        refineButton.textContent = 'Refining...'; // Provide user feedback
        refineButton.disabled = true;

        const refineApiUrl = 'http://127.0.0.1:5000/api/refine';

        fetch(refineApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(latestEvaluation), // Send the stored evaluation data
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`Refinement Error: ${data.error}`);
            } else {
                // --- Update the textarea with the refined prompt ---
                promptInput.value = data.refined_prompt;
            }
        })
        .catch(error => {
            console.error('Refinement Error:', error);
            alert('An error occurred during refinement.');
        })
        .finally(() => {
            // Reset the button state
            refineButton.textContent = 'Refine the Prompt';
            refineButton.disabled = false;
            refineButton.style.display = 'none'; // Hide after use
        });
    });
    checkForInjectedText();
});