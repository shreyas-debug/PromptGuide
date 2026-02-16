// ============================================================
// background.js — Service worker for PromptGuide v2
// Handles install events, context menu, and side panel messaging
// ============================================================

// --- First Install: Open Welcome Page ---
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }

  // Create context menu
  chrome.contextMenus.create({
    id: 'refine-with-promptguide',
    title: 'Refine with PromptGuide ✨',
    contexts: ['selection'],
  });
});

// --- Context Menu Click ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'refine-with-promptguide' && info.selectionText) {
    // Store selected text and open side panel
    chrome.storage.local.set({ textToInject: info.selectionText }, () => {
      chrome.sidePanel.open({ tabId: tab.id });
    });
  }
});

// --- Extension Icon Click: Open Side Panel ---
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// --- Messages from Content Script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopupWithText') {
    if (sender.tab?.id) {
      const tabId = sender.tab.id;
      chrome.sidePanel.open({ tabId }, () => {
        chrome.storage.local.set({
          textToInject: request.text,
          detectedPlatform: request.platform || 'unknown',
        });
      });
    }
  }
  return true;
});