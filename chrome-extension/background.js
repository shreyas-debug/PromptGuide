// This listener sets the default behavior for the extension icon to open the side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// This listener handles messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopupWithText") {
    // Check if the sender has a tab (which it should from a content script)
    if (sender.tab?.id) {
      const tabId = sender.tab.id;
      // First, open the side panel for the specific tab
      chrome.sidePanel.open({ tabId: tabId }, () => {
        // After the panel is open, store the text.
        // This ensures the panel is ready to receive the text.
        chrome.storage.local.set({ textToInject: request.text }, () => {
          // Optional: Send a message back to the side panel if it needs to update instantly
          // For now, the sidepanel.js will check for this text on its own when it loads.
        });
      });
    }
  }
  // Return true to indicate you wish to send a response asynchronously (good practice)
  return true;
});