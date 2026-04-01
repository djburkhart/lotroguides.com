// Bridge script - injected into page context
(function() {
  'use strict';

  console.log('LOTRO Character Bridge injected into page');

  // Extension availability flag
  let extensionAvailable = false;

  // Listen for extension availability
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'LOTRO_EXTENSION_AVAILABLE') {
      extensionAvailable = true;
      console.log('LOTRO extension available, version:', event.data.version);
      
      // Notify any waiting functions
      window.dispatchEvent(new CustomEvent('lotro-extension-ready'));
    }
  });

  // Add extension import capability to window
  window.LOTROCharacterBridge = {
    isAvailable: () => extensionAvailable,
    
    extractCharacterData: () => {
      return new Promise((resolve, reject) => {
        if (!extensionAvailable) {
          reject(new Error('LOTRO Character Bridge extension not available'));
          return;
        }

        // Set up response listener
        const responseHandler = (event) => {
          if (event.source !== window) return;
          
          if (event.data.type === 'LOTRO_CHARACTER_DATA') {
            window.removeEventListener('message', responseHandler);
            
            if (event.data.error) {
              reject(new Error(event.data.error));
            } else {
              resolve(event.data.payload);
            }
          }
        };

        window.addEventListener('message', responseHandler);

        // Send extract request
        window.postMessage({
          type: 'LOTRO_IMPORT_REQUEST',
          payload: {
            timestamp: Date.now()
          }
        }, '*');

        // Timeout after 30 seconds
        setTimeout(() => {
          window.removeEventListener('message', responseHandler);
          reject(new Error('Character extraction timed out'));
        }, 30000);
      });
    },

    getStatus: () => {
      return new Promise((resolve) => {
        // This would query the extension for LOTRO status
        resolve({
          extensionAvailable,
          lotroRunning: false, // Would be populated by extension
          bridgeInstalled: false
        });
      });
    }
  };

  // Auto-check for extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*'), 100);
    });
  } else {
    setTimeout(() => window.postMessage({ type: 'LOTRO_CHECK_EXTENSION' }, '*'), 100);
  }
})();