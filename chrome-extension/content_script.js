console.log("✅ Prompt Gauntlet: Content Script Loaded!");

// A variable to hold the timer, so we can reset it if the user keeps typing
let debounceTimer;

// --- Main function to get an evaluation from the backend ---
function getEvaluation(text, targetElement) {
    // We'll use a default gauntlet for these automatic checks.
    // The user can choose a different one in the main popup for manual checks.
    const defaultGauntletId = 'clarity-check';

    console.log(`Prompt Gauntlet: Evaluating prompt for gauntlet: ${defaultGauntletId}`);

    fetch('http://127.0.0.1:5000/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, gauntlet_id: defaultGauntletId }),
    })
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        if (data.evaluation) {
            const cleanedString = data.evaluation.replace(/```json/g, '').replace(/```/g, '').trim();
            const evaluation = JSON.parse(cleanedString);
            // If we get a valid evaluation, show the suggestion UI
            showSuggestion(targetElement, evaluation);
        }
    })
    .catch(error => console.error('Prompt Gauntlet Error:', error));
}


// --- Function to create and display the suggestion UI on the page ---
function showSuggestion(targetElement, evaluation) {
    // First, remove any suggestion box that might already be on the page
    const oldSuggestion = document.getElementById('prompt-gauntlet-suggestion');
    if (oldSuggestion) oldSuggestion.remove();

    // Create the main container for our suggestion
    const suggestionBox = document.createElement('div');
    suggestionBox.id = 'prompt-gauntlet-suggestion';
    suggestionBox.innerHTML = `
        <div class="pg-suggestion-header">
            <span>Prompt Gauntlet</span>
        </div>
        <div class="pg-suggestion-body">
            <strong>Score: ${evaluation.score}/10</strong> - ${evaluation.justification}
        </div>
        <div class="pg-suggestion-footer">
            <button id="pgMoreInfoBtn" class="pg-button">More Info</button>
        </div>
    `;

    // Add the suggestion box to the page's body
    document.body.appendChild(suggestionBox);

    // Calculate the position to place the suggestion box right below the text field
    const rect = targetElement.getBoundingClientRect();
    suggestionBox.style.top = `${window.scrollY + rect.bottom + 5}px`; // 5px buffer
    suggestionBox.style.left = `${window.scrollX + rect.left}px`;
    suggestionBox.style.minWidth = `${rect.width}px`; // Make it at least as wide as the input

    // Add functionality to the "More Info" button
    document.getElementById('pgMoreInfoBtn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the click from closing the box immediately
        // Send a message to the background script telling it to open the popup
        chrome.runtime.sendMessage({ action: "openPopup" });
    });
}


// --- Event listener that watches the entire document for user input ---
document.addEventListener('input', (event) => {
    const target = event.target;
    // Check if the user is typing in a textarea or a text input field
    const isEditable = target.tagName.toLowerCase() === 'textarea' ||
                       (target.tagName.toLowerCase() === 'input' && /text|search|email|url|password/.test(target.type)) ||
                       target.isContentEditable;

    if (isEditable) {
        // Reset the timer every time the user types a character
        clearTimeout(debounceTimer);

        const text = target.isContentEditable ? target.textContent : target.value;

        // If the text is empty, hide any existing suggestion
        if (text.length === 0) {
            const oldSuggestion = document.getElementById('prompt-gauntlet-suggestion');
            if (oldSuggestion) oldSuggestion.remove();
            return;
        }

        // Set a new timer. We'll only run the evaluation 1.5 seconds *after* the user stops typing.
        debounceTimer = setTimeout(() => {
            if (text.length > 20) { // Only evaluate if the prompt is reasonably long
                getEvaluation(text, target);
            }
        }, 1500);
    }
});


// --- Event listener to hide the suggestion when the user clicks elsewhere ---
document.addEventListener('click', (event) => {
    const suggestionBox = document.getElementById('prompt-gauntlet-suggestion');
    // If a suggestion box exists and the click was outside of it, remove it.
    if (suggestionBox && !suggestionBox.contains(event.target)) {
        suggestionBox.remove();
    }
});