chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (request.action === "openPopup") {
        await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    }
});