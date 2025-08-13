let debounceTimer;
let refineButton = null;

// This function creates the single button instance for the page
function initializeRefineButton() {
    if (document.getElementById('pg-refine-button')) return;

    refineButton = document.createElement('button');
    refineButton.id = 'pg-refine-button';
    refineButton.textContent = 'Refine ✨';
    refineButton.style.display = 'none'; // Initially hidden
    document.body.appendChild(refineButton);

    // Add the click listener ONCE when the button is created
    refineButton.addEventListener('click', () => {
        // --- CHECKPOINT 1 ---
        console.log("✅ Refine button clicked! Attempting to send message.");

        const textToRefine = refineButton.dataset.textToRefine; // Get text from data attribute
        if (textToRefine && chrome.runtime?.id) {
            chrome.runtime.sendMessage({ action: "openPopupWithText", text: textToRefine });
        } else {
            console.error("❌ Could not send message. Context may be invalidated.");
        }
        refineButton.style.display = 'none'; // Hide after click
    });
}

// This function shows and positions the button
function showRefineButton(targetElement) {
    if (!refineButton) return;

    const text = targetElement.isContentEditable ? targetElement.textContent : targetElement.value;
    refineButton.dataset.textToRefine = text;

    const rect = targetElement.getBoundingClientRect();
    refineButton.style.display = 'block';

    refineButton.style.top = `${rect.top - 30}px`;
    refineButton.style.left = `${rect.left}px`;
}

// --- Main Logic ---
initializeRefineButton();

// Listener for typing on the page
document.addEventListener('input', (event) => {
    const target = event.target;
    const isEditable = target.tagName.toLowerCase() === 'textarea' || target.isContentEditable;

    if (isEditable) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const text = target.isContentEditable ? target.textContent : target.value;
            if (text.length > 15) {
                showRefineButton(target);
            } else {
                if (refineButton) refineButton.style.display = 'none';
            }
        }, 500);
    }
});

// Hide button when clicking away
document.addEventListener('mousedown', (event) => {
    if (refineButton && refineButton.style.display === 'block') {
        if (!refineButton.contains(event.target) && !event.target.isContentEditable && event.target.tagName.toLowerCase() !== 'textarea') {
            refineButton.style.display = 'none';
        }
    }
});