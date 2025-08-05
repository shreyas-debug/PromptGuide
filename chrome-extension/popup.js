document.addEventListener('DOMContentLoaded', () => {
    // Select all the UI elements from popup.html
    const gauntletSelect = document.getElementById('gauntletSelect');
    const promptInput = document.getElementById('promptInput');
    const evaluateButton = document.getElementById('evaluateButton');
    const resultContent = document.getElementById('resultContent');
    const loader = document.getElementById('loader');
    const evaluationResult = document.getElementById('evaluationResult');

    let gauntlets = {}; // To store the fetched gauntlet data

    // --- Function to load the list of challenges from your backend ---
    function loadGauntlets() {
        fetch('http://127.0.0.1:5000/api/gauntlets')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                gauntlets = data;
                gauntletSelect.innerHTML = '<option selected disabled>Select a challenge...</option>';
                for (const id in gauntlets) {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = gauntlets[id].name;
                    gauntletSelect.appendChild(option);
                }
            })
            .catch(error => {
                console.error('Error loading gauntlets:', error);
                resultContent.style.display = 'block';
                loader.style.display = 'none';
                evaluationResult.innerHTML = '<p class="text-danger">Error: Could not connect to the backend. Is it running?</p>';
            });
    }

    // --- The main evaluation function, now using async/await for streaming ---
    async function handleEvaluation() {
        const selectedGauntletId = gauntletSelect.value;
        const promptText = promptInput.value;

        // Validation to ensure a challenge is selected and a prompt is entered
        if (!selectedGauntletId || gauntletSelect.selectedIndex === 0) {
            alert('Please select a challenge first.');
            return;
        }
        if (!promptText) {
            alert('Please enter a prompt to evaluate.');
            return;
        }

        // Set up the UI for a loading state
        resultContent.style.display = 'block';
        loader.style.display = 'block';
        evaluationResult.innerHTML = ''; // Clear previous results

        try {
            // Start the fetch request to the streaming endpoint
            const response = await fetch('http://127.0.0.1:5000/api/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    gauntlet_id: selectedGauntletId
                }),
            });

            // Get the tools to read the incoming stream of data
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            // As soon as we have a reader, hide the initial loader
            loader.style.display = 'none';

            // Loop to read from the stream until it's finished
            while (true) {
                const { value, done } = await reader.read();
                if (done) break; // Exit the loop when the stream is complete

                // Decode the chunk of data (which arrives as a Uint8Array)
                const chunk = decoder.decode(value);
                // The data is sent in "data: ...\n\n" format. We need to parse this.
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        fullResponse += line.substring(6); // Append the actual content
                    }
                }

                // Update the UI in real-time with the raw text as it arrives
                evaluationResult.textContent = fullResponse;
            }

            // Once the stream is finished, try to parse the complete response as JSON
            try {
                const finalJson = JSON.parse(fullResponse);
                // If successful, format the final output nicely
                evaluationResult.innerHTML = `<strong>Score:</strong> ${finalJson.score}/10<br><strong>Justification:</strong> ${finalJson.justification}`;
            } catch (e) {
                // If it's not perfect JSON at the end, that's okay.
                // The raw text is already displayed, which is a good fallback.
                console.log("Stream finished. Final content was not perfect JSON, but that's okay.");
            }

        } catch (error) {
            // Handle any errors during the fetch/streaming process
            console.error('Streaming Error:', error);
            loader.style.display = 'none';
            evaluationResult.innerHTML = '<p class="text-danger">An error occurred while streaming the evaluation.</p>';
        }
    }

    // --- Attach the async function to the button's click event ---
    evaluateButton.addEventListener('click', handleEvaluation);

    // --- Initial action: Load the gauntlets when the popup is opened ---
    loadGauntlets();
});