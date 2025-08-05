chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (request.action === "openPopupWithText") {
        // 1. Store the text temporarily in local storage
        await chrome.storage.local.set({ textToInject: request.text });

        // 2. Open the popup in a new, focused window
        await chrome.windows.create({
            url: chrome.runtime.getURL("popup.html"),
            type: "popup",
            width: 420,
            height: 500,
        });
    }
});