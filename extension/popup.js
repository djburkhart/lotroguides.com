// Popup script for LOTRO Character Bridge

// Extension context validation helpers
function isExtensionContextValid() {
  return !!(chrome && chrome.runtime && chrome.runtime.id);
}

function safeRuntimeSendMessage(message) {
  return new Promise((resolve, reject) => {
    if (!isExtensionContextValid()) {
      reject(new Error('Extension context invalidated. Please close and reopen the popup.'));
      return;
    }
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(new Error('Failed to communicate with extension: ' + error.message));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const gameStatus = document.getElementById('game-status');
  const pluginStatus = document.getElementById('plugin-status');
  const setupSection = document.getElementById('setup-section');
  const manualSetup = document.getElementById('manual-setup');
  const installationProgress = document.getElementById('installation-progress');
  const progressText = document.getElementById('progress-text');
  const targetPath = document.getElementById('target-path');
  
  const btnInstallPlugin = document.getElementById('install-plugin');
  const btnCheckStatus = document.getElementById('check-status');
  const btnTestExtraction = document.getElementById('test-extraction');
  const btnReloadExtension = document.getElementById('reload-extension');

  let currentStatus = {};

  // Development mode utilities
  function initDevMode() {
    const extensionId = document.getElementById('extension-id');
    const backgroundStatus = document.getElementById('background-status');
    
    // Show extension ID
    if (extensionId) {
      try {
        extensionId.textContent = chrome.runtime.id || 'N/A';
      } catch (error) {
        extensionId.textContent = 'Context Invalid';
      }
    }
    
    // Test background script connection
    if (backgroundStatus) {
      if (!isExtensionContextValid()) {
        backgroundStatus.textContent = '❌ Context Invalid';
        backgroundStatus.style.color = '#d63031';
        return;
      }
      
      chrome.runtime.sendMessage({ action: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          backgroundStatus.textContent = '❌ Disconnected: ' + chrome.runtime.lastError.message;
          backgroundStatus.style.color = '#d63031';
        } else {
          backgroundStatus.textContent = '✅ Connected';
          backgroundStatus.style.color = '#00b894';
        }
      });
    }
  }

  // Handle extension reload (for development)
  if (btnReloadExtension) {
    btnReloadExtension.addEventListener('click', () => {
      chrome.runtime.reload();
      window.close();
    });
  }

  // Update status indicators
  function updateStatus(status) {
    currentStatus = status;
    
    // Safety checks for missing elements
    if (!gameStatus || !pluginStatus) {
      console.warn('Status elements not found in DOM');
      return;
    }
    
    // Game Status
    if (status.running) {
      gameStatus.textContent = 'Running';
      gameStatus.className = 'status-indicator status-ok';
    } else {
      gameStatus.textContent = 'Not Detected';
      gameStatus.className = 'status-indicator status-warning';
    }

    // Plugin Status
    if (status.bridgeInstalled) {
      pluginStatus.textContent = 'Installed & Auto-Enabled';
      pluginStatus.className = 'status-indicator status-ok';
      if (setupSection) setupSection.classList.add('hidden');
      if (manualSetup) manualSetup.classList.add('hidden');
      if (btnTestExtraction) btnTestExtraction.classList.remove('hidden');
      if (btnInstallPlugin) btnInstallPlugin.textContent = 'Reinstall Plugin';
      
      // Show auto-enable success message
      showAutoEnableMessage();
    } else {
      pluginStatus.textContent = 'Not Installed';
      pluginStatus.className = 'status-indicator status-warning';
      if (setupSection) setupSection.classList.remove('hidden');
      if (btnTestExtraction) btnTestExtraction.classList.add('hidden');
      if (btnInstallPlugin) btnInstallPlugin.textContent = 'Install Bridge Plugin';
      
      // Remove auto-enable message if present
      hideAutoEnableMessage();
      
      // Show target paths if available
      if (status.pluginPaths && status.pluginPaths.length > 0) {
        const pathsWithoutPlaceholders = status.pluginPaths.filter(p => !p.includes('NEEDS_CONFIGURATION'));
        if (pathsWithoutPlaceholders.length > 0 && targetPath) {
          targetPath.textContent = `Target: ${pathsWithoutPlaceholders[0]}`;
        }
      }
    }

    // Update button states
    if (btnInstallPlugin) btnInstallPlugin.disabled = false;
    if (btnCheckStatus) btnCheckStatus.disabled = false;
  }

  // Show installation progress
  function showProgress(message) {
    progressText.textContent = message;
    installationProgress.classList.remove('hidden');
  }

  // Hide installation progress
  function hideProgress() {
    installationProgress.classList.add('hidden');
  }

  // Button event listeners
  btnInstallPlugin.addEventListener('click', async () => {
    btnInstallPlugin.textContent = 'Installing...';
    btnInstallPlugin.disabled = true;
    showProgress('Preparing installation...');

    try {
      const result = await safeRuntimeSendMessage({ action: 'INSTALL_BRIDGE_PLUGIN' });
      
      if (result.success) {
        if (result.paths && result.paths.some(p => p.includes('NEEDS_CONFIGURATION'))) {
          // Show manual setup instructions
          manualSetup.classList.remove('hidden');
          showProgress('Download will start automatically. Please follow the manual installation steps above.');
          
          // Auto-start download after short delay
          setTimeout(() => {
            hideProgress();
          }, 3000);
        } else {
          showProgress('Plugin installed successfully! Restart LOTRO to activate.');
          setTimeout(() => {
            hideProgress();
            checkStatus();
          }, 2000);
        }
      } else {
        showProgress(`Installation failed: ${result.message}`);
        setTimeout(hideProgress, 3000);
      }
    } catch (error) {
      let errorMsg = error.message;
      if (errorMsg.includes('context invalidated')) {
        errorMsg = 'Extension connection lost. Please close and reopen this popup.';
      }
      showProgress(`Installation error: ${errorMsg}`);
      setTimeout(hideProgress, 3000);
    }

    btnInstallPlugin.textContent = 'Install Bridge Plugin';
    btnInstallPlugin.disabled = false;
  });

  btnCheckStatus.addEventListener('click', checkStatus);

  btnTestExtraction.addEventListener('click', async () => {
    btnTestExtraction.textContent = 'Testing...';
    btnTestExtraction.disabled = true;

    try {
      // Get active tab and check if it's the right website
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || (!tab.url.includes('lotroguides.com') && !tab.url.includes('localhost'))) {
        showProgress('Please navigate to lotroguides.com first');
        setTimeout(hideProgress, 3000);
        return;
      }

      // Send extraction request
      showProgress('Testing character data extraction...');
      
      try {
        const result = await safeRuntimeSendMessage({ 
          action: 'EXTRACT_CHARACTER_DATA',
          payload: { test: true }
        });

        if (result && result.success) {
          showProgress('Test successful! Character data extracted.');
          setTimeout(() => {
            hideProgress();
            window.close(); // Close popup, user will see results on website
          }, 2000);
        } else {
          showProgress('Test failed. Make sure LOTRO is running and the plugin is active.');
          setTimeout(hideProgress, 3000);
        }
      } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('context invalidated')) {
          errorMsg = 'Extension connection lost. Please close and reopen this popup.';
        }
        showProgress(`Test error: ${errorMsg}`);
        setTimeout(hideProgress, 3000);
      }

    btnTestExtraction.textContent = 'Test Data Import';
    btnTestExtraction.disabled = false;
  });

  // Check status function
  async function checkStatus() {
    if (!gameStatus || !pluginStatus) {
      console.warn('Status elements not found');
      return;
    }
    
    gameStatus.textContent = 'Checking...';
    pluginStatus.textContent = 'Checking...';
    gameStatus.className = 'status-indicator status-info';
    pluginStatus.className = 'status-indicator status-info';

    try {
      const status = await safeRuntimeSendMessage({ action: 'CHECK_LOTRO_STATUS' });
      updateStatus(status);
    } catch (error) {
      console.error('Status check failed:', error);
      
      if (error.message.includes('context invalidated')) {
        gameStatus.textContent = '⚠️ Disconnected';
        pluginStatus.textContent = '⚠️ Disconnected';
        gameStatus.className = 'status-indicator status-warning';
        pluginStatus.className = 'status-indicator status-warning';
        showProgress('Extension disconnected. Close and reopen this popup.');
        setTimeout(hideProgress, 3000);
      } else {
        gameStatus.textContent = 'Error';
        pluginStatus.textContent = 'Error';
        gameStatus.className = 'status-indicator status-error';
        pluginStatus.className = 'status-indicator status-error';
        
        // Show development mode friendly error
        if (error.message.includes('Could not establish connection')) {
          showProgress('Extension background script not ready. Try refreshing the extension.');
          setTimeout(hideProgress, 3000);
        }
      }
    }
  }

  // Listen for download completion (for manual installation tracking)
  if (chrome.downloads && chrome.downloads.onChanged) {
    chrome.downloads.onChanged.addListener((downloadDelta) => {
      if (downloadDelta.state && downloadDelta.state.current === 'complete') {
        chrome.storage.local.get(['pendingInstallation']).then((stored) => {
          if (stored.pendingInstallation && stored.pendingInstallation.downloadId === downloadDelta.id) {
            showProgress('Download complete! Please move the file to your LOTRO PluginData folder.');
            setTimeout(hideProgress, 5000);
          }
        });
      }
    });
  } else {
    console.log('Downloads API not available in dev mode');
  }

  // Add global error handler for development
  window.addEventListener('error', (event) => {
    console.error('Popup error:', event.error);
    showProgress('Error: ' + event.error.message);
    setTimeout(hideProgress, 3000);
  });

  // Initial status check with delay for extension readiness
  setTimeout(() => {
    initDevMode();
    checkStatus();
  }, 100);

  // Periodic status refresh while popup is open (less frequent in dev mode)
  const statusInterval = setInterval(checkStatus, 15000); // Every 15 seconds

  // Cleanup on popup close or beforeunload
  const cleanup = () => {
    if (statusInterval) {
      clearInterval(statusInterval);
    }
    console.log('Popup cleanup completed');
  };

  // Multiple cleanup event listeners for different close scenarios
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cleanup();
    }
  });

  // Add escape key handler to close popup
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      window.close();
    }
  });
});
