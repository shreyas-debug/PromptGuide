document.addEventListener('DOMContentLoaded', () => {
    // --- NEW: Select all the new elements ---
    const gauntletSelect = document.getElementById('gauntletSelect');
    const gauntletDescription = document.getElementById('gauntletDescription');
    const evaluateButton = document.getElementById('evaluateButton');
    const promptInput = document.getElementById('promptInput');
    const responseDiv = document.getElementById('response');
    const resultContent = document.getElementById('resultContent');
    const loader = document.getElementById('loader');

    let gauntlets = {}; // To store the fetched gauntlet data

    // --- NEW: Function to load gauntlets from the backend ---
    function loadGauntlets() {
        fetch('http://127.0.0.1:5000/api/gauntlets')
            .then(response => response.json())
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
            .catch(error => console.error('Error loading gauntlets:', error));
    }

    // --- NEW: Event listener for the dropdown ---
    gauntletSelect.addEventListener('change', () => {
        const selectedId = gauntletSelect.value;
        if (gauntlets[selectedId]) {
            gauntletDescription.textContent = gauntlets[selectedId].description;
        }
    });

    evaluateButton.addEventListener('click', () => {
        const prompt = promptInput.value;
        const gauntlet_id = gauntletSelect.value; // Get the selected gauntlet ID

        if (!gauntlet_id || gauntlet_id === "Select a challenge...") {
            alert('Please select a challenge first.');
            return;
        }
        if (!prompt) {
            alert('Please enter a prompt.');
            return;
        }

        responseDiv.style.display = 'flex';
        loader.style.display = 'block';
        resultContent.innerHTML = '';

        fetch('http://127.0.0.1:5000/api/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // --- NEW: Send the gauntlet_id along with the prompt ---
            body: JSON.stringify({ prompt: prompt, gauntlet_id: gauntlet_id }),
        })
        .then(response => response.json())
        .then(data => {
            loader.style.display = 'none';
            if (data.error) {
                resultContent.textContent = `Error: ${data.error}`;
            } else {
                const cleanedString = data.evaluation.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    const evaluation = JSON.parse(cleanedString);
                    resultContent.innerHTML = `<strong>Score:</strong> ${evaluation.score}/10<br><strong>Justification:</strong> ${evaluation.justification}`;
                } catch (e) {
                    resultContent.textContent = cleanedString;
                }
            }
        })
        .catch(error => {
            loader.style.display = 'none';
            console.error('Error:', error);
            resultContent.textContent = 'An error occurred while connecting to the backend.';
        });
    });

    // --- NEW: Load the gauntlets when the page loads ---
    loadGauntlets();
});