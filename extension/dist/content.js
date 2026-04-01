// Content script - communicates with page and background
console.log('LOTRO Character Bridge extension loaded');

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
      window.postMessage({
        type: 'LOTRO_EXTENSION_AVAILABLE',
        version: chrome.runtime.getManifest().version
      }, '*');
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
  // Forward import request to background script
  chrome.runtime.sendMessage({
    action: 'EXTRACT_CHARACTER_DATA',
    payload: payload
  });
}

// Notify page that extension is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*');
  });
} else {
  window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*');
}