// A single, reusable "Refine" button for the entire page
console.log("✅ Prompt Gauntlet: Content Script is now running!");
let refineButton = null;
let debounceTimer;

// This function creates the button if it doesn't exist
function createRefineButton() {
    if (refineButton) return; // Only create one button

    refineButton = document.createElement('button');
    refineButton.id = 'prompt-gauntlet-refine-btn';
    refineButton.textContent = 'Refine';
    refineButton.style.display = 'none'; // Initially hidden
    document.body.appendChild(refineButton);
}

// This function shows the button next to the element the user is typing in
function showRefineButton(targetElement) {
    const rect = targetElement.getBoundingClientRect();
    refineButton.style.display = 'block';
    refineButton.style.top = `${window.scrollY + rect.top - 30}px`; // Position above the text field
    refineButton.style.left = `${window.scrollX + rect.left}px`;

    // Remove any previous click listener to avoid duplicates
    const newButton = refineButton.cloneNode(true);
    refineButton.parentNode.replaceChild(newButton, refineButton);
    refineButton = newButton;

    // Add a new click listener
    refineButton.addEventListener('click', () => {
        const text = targetElement.isContentEditable ? targetElement.textContent : targetElement.value;
        // Send a message to the background script with the text
        chrome.runtime.sendMessage({ action: 'openPopupWithText', text: text });
        refineButton.style.display = 'none'; // Hide after click
    });
}

// --- Main Logic ---
createRefineButton(); // Create the button as soon as the script loads

// Listen for typing
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
                if(refineButton) refineButton.style.display = 'none';
            }
        }, 500); // Show button after 0.5s of paused typing
    }
});

// Hide button when the user clicks away
document.addEventListener('click', (event) => {
    if (refineButton && event.target.id !== 'prompt-gauntlet-refine-btn') {
        refineButton.style.display = 'none';
    }
});