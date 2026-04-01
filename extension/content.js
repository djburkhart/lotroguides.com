// Content script - communicates with page and background
console.log('LOTRO Character Bridge extension loaded');

// Extension context validation helpers
function isExtensionContextValid() {
  return !!(chrome.runtime && chrome.runtime.id);
}

function safeRuntimeSendMessage(message, callback) {
  if (!isExtensionContextValid()) {
    console.warn('Extension context invalidated, cannot send message:', message);
    if (callback) callback(null);
    return;
  }
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Runtime message error:', chrome.runtime.lastError.message);
        if (callback) callback(null);
      } else {
        if (callback) callback(response);
      }
    });
  } catch (error) {
    console.warn('Failed to send runtime message:', error);
    if (callback) callback(null);
  }
}

// Inject bridge script into page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('bridge.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from page
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data.type || !event.data.type.startsWith('LOTRO_')) return;

  console.log('Content script received:', event.data);

  switch (event.data.type) {
    case 'LOTRO_IMPORT_REQUEST':
      handleImportRequest(event.data.payload);
      break;
    case 'LOTRO_CHECK_EXTENSION':
      // Respond to page that extension is available
      if (isExtensionContextValid()) {
        try {
          window.postMessage({
            type: 'LOTRO_EXTENSION_AVAILABLE',
            version: chrome.runtime.getManifest().version
          }, '*');
        } catch (error) {
          console.warn('Failed to get manifest version:', error);
          window.postMessage({
            type: 'LOTRO_EXTENSION_AVAILABLE',
            version: '1.0.0' // fallback
          }, '*');
        }
      } else {
        window.postMessage({
          type: 'LOTRO_EXTENSION_CONTEXT_INVALID'
        }, '*');
      }
      break;
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received from background:', request);

  switch (request.action) {
    case 'CHARACTER_DATA_READY':
      // Forward character data to page
      window.postMessage({
        type: 'LOTRO_CHARACTER_DATA',
        payload: request.data,
        error: request.error
      }, '*');
      break;
    case 'STATUS_UPDATE':
      // Forward status updates to page
      window.postMessage({
        type: 'LOTRO_STATUS_UPDATE',
        payload: request.status
      }, '*');
      break;
  }
});

function handleImportRequest(payload) {
  // Forward import request to background script with error handling
  if (!isExtensionContextValid()) {
    window.postMessage({
      type: 'LOTRO_CHARACTER_DATA',
      error: 'Extension context invalidated. Please refresh the page and try again.'
    }, '*');
    return;
  }
  
  safeRuntimeSendMessage({
    action: 'EXTRACT_CHARACTER_DATA',
    payload: payload
  }, (response) => {
    if (!response) {
      window.postMessage({
        type: 'LOTRO_CHARACTER_DATA',
        error: 'Failed to communicate with extension. Please refresh the page and try again.'
      }, '*');
    }
  });
}

// Notify page that extension is ready
function notifyExtensionReady() {
  if (isExtensionContextValid()) {
    window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*');
  } else {
    // Schedule retry if context is invalid
    setTimeout(() => {
      if (isExtensionContextValid()) {
        window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*');
      }
    }, 1000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', notifyExtensionReady);
} else {
  notifyExtensionReady();
}