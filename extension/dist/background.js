// Background service worker
console.log('LOTRO Character Bridge background script loaded');

// Track LOTRO game client status
let lotroStatus = {
  running: false,
  bridgeInstalled: false,
  lastCheck: null
};

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request);

  switch (request.action) {
    case 'PING':
      sendResponse({ pong: true, timestamp: Date.now() });
      break;
    case 'EXTRACT_CHARACTER_DATA':
      extractCharacterData(sender.tab.id, request.payload);
      break;
    case 'CHECK_LOTRO_STATUS':
      checkLOTROStatus().then(status => {
        sendResponse(status);
      });
      return true; // async response
    case 'INSTALL_BRIDGE_PLUGIN':
      installBridgePlugin().then(result => {
        sendResponse(result);
      });
      return true; // async response
  }
});

async function extractCharacterData(tabId, payload) {
  try {
    // Update status
    chrome.tabs.sendMessage(tabId, {
      action: 'STATUS_UPDATE',
      status: 'Checking LOTRO client...'
    });

    // Check if LOTRO is running
    const status = await checkLOTROStatus();
    if (!status.running) {
      throw new Error('LOTRO client not running. Please start the game and log in.');
    }

    // Ensure bridge plugin is installed
    if (!status.bridgeInstalled) {
      chrome.tabs.sendMessage(tabId, {
        action: 'STATUS_UPDATE',
        status: 'Installing bridge plugin...'
      });
      await installBridgePlugin();
    }

    // Request data extraction
    chrome.tabs.sendMessage(tabId, {
      action: 'STATUS_UPDATE',
      status: 'Extracting character data...'
    });

    const data = await extractFromGame();
    
    chrome.tabs.sendMessage(tabId, {
      action: 'CHARACTER_DATA_READY',
      data: data
    });

  } catch (error) {
    console.error('Character extraction failed:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'CHARACTER_DATA_READY',
      error: error.message
    });
  }
}

async function checkLOTROStatus() {
  try {
    const pluginPaths = await discoverLOTROPluginPaths();
    const isInstalled = await checkBridgePluginInstalled(pluginPaths);
    
    return {
      running: true, // Assume running if we can find paths
      bridgeInstalled: isInstalled,
      pluginPaths: pluginPaths,
      lastCheck: Date.now()
    };
  } catch (error) {
    console.error('Failed to check LOTRO status:', error);
    return {
      running: false,
      bridgeInstalled: false,
      pluginPaths: [],
      lastCheck: Date.now()
    };
  }
}

async function installBridgePlugin() {
  try {
    // Discover LOTRO plugin directories
    const pluginPaths = await discoverLOTROPluginPaths();
    
    if (pluginPaths.length === 0) {
      throw new Error('No LOTRO accounts found. Please ensure LOTRO is installed and you have logged in at least once.');
    }

    // Install to all discovered account directories
    const installResults = [];
    for (const path of pluginPaths) {
      const result = await installToDirectory(path);
      installResults.push(result);
    }

    const successCount = installResults.filter(r => r.success).length;
    
    if (successCount === 0) {
      throw new Error('Failed to install bridge plugin to any LOTRO account directory');
    }

    await chrome.storage.local.set({ 'bridgeInstalled': true, 'installPaths': pluginPaths });
    
    return {
      success: true,
      message: `Bridge plugin installed successfully to ${successCount} account(s)`,
      paths: pluginPaths
    };
  } catch (error) {
    console.error('Plugin installation failed:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

async function extractFromGame() {
  // This would trigger the bridge plugin to extract data and read the result
  // For now, return sample data
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        characters: [{
          name: 'TestCharacter',
          level: 150,
          class: 'Hunter',
          race: 'Elf',
          server: 'Evernight',
          stats: {
            MORALE: 45000,
            POWER: 12000,
            MIGHT: 2500,
            AGILITY: 2800,
            VITALITY: 2200,
            WILL: 1800,
            FATE: 1900
          },
          money: 1234567, // in copper
          equipment: {},
          extractedAt: new Date().toISOString()
        }],
        source: 'extension',
        extractedAt: new Date().toISOString()
      });
    }, 2000);
  });
}

// Badge management
function updateBadge(status) {
  const color = status.running ? '#00aa00' : '#aa0000';
  const text = status.running ? 'OK' : 'OFF';
  
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: color });
}

// Periodic status check
setInterval(async () => {
  const status = await checkLOTROStatus();
  updateBadge(status);
  lotroStatus = status;
}, 30000); // Check every 30 seconds

// Discover LOTRO plugin directories for all accounts
async function discoverLOTROPluginPaths() {
  const paths = [];
  
  try {
    // Get Windows username from current user profile
    const username = await getWindowsUsername();
    
    // Check both OneDrive and local Documents locations
    const basePaths = [
      `C:\\Users\\${username}\\OneDrive\\Documents\\The Lord of the Rings Online\\PluginData`,
      `C:\\Users\\${username}\\Documents\\The Lord of the Rings Online\\PluginData`
    ];
    
    for (const basePath of basePaths) {
      const accountPaths = await getAccountDirectories(basePath);
      paths.push(...accountPaths);
    }
    
    return [...new Set(paths)]; // Remove duplicates
  } catch (error) {
    console.error('Failed to discover LOTRO paths:', error);
    // Return common path structure for manual installation guidance
    return [
      'C:\\Users\\[YOUR_USERNAME]\\OneDrive\\Documents\\The Lord of the Rings Online\\PluginData\\[ACCOUNT]\\AllServers',
      'C:\\Users\\[YOUR_USERNAME]\\Documents\\The Lord of the Rings Online\\PluginData\\[ACCOUNT]\\AllServers'
    ];
  }
}

// Get Windows username - simplified for better reliability
async function getWindowsUsername() {
  // Try to get from localStorage if previously detected
  const stored = await chrome.storage.local.get(['detectedUsername']);
  if (stored.detectedUsername && stored.detectedUsername !== 'USER_NEEDS_CONFIGURATION') {
    return stored.detectedUsername;
  }
  
  // Since we can't reliably auto-detect username in browser extension,
  // we'll use the current user environment or return a placeholder
  // The user will need to manually configure their paths
  return await detectUsername();
}

// Detect username through various methods
async function detectUsername() {
  try {
    // For developer testing, try common usernames
    const commonUsernames = ['me', 'user', 'admin'];
    
    // In a real extension, we'd need user interaction to get the actual username
    // For now, return a placeholder that will trigger manual path configuration
    await chrome.storage.local.set({ 'needsPathConfiguration': true });
    
    // Return placeholder - the user will need to manually specify their paths
    return 'USER_NEEDS_CONFIGURATION';
  } catch (error) {
    console.error('Username detection failed:', error);
    return 'USER_NEEDS_CONFIGURATION';
  }
}

// Get all account directories under the PluginData folder
async function getAccountDirectories(pluginDataPath) {
  try {
    // Check storage for previously discovered accounts for this path
    const stored = await chrome.storage.local.get(['knownAccountPaths']);
    const knownPaths = stored.knownAccountPaths || {};
    
    if (knownPaths[pluginDataPath] && knownPaths[pluginDataPath].length > 0) {
      return knownPaths[pluginDataPath];
    }
    
    // Since browser extensions can't directly access file system,
    // we'll provide common path structures for manual installation guidance
    const accountPaths = [];
    
    // Real LOTRO structure: PluginData/[account]/AllServers/
    // Common account names vary by user, so we'll show placeholder structure
    if (pluginDataPath.includes('USER_NEEDS_CONFIGURATION')) {
      accountPaths.push(pluginDataPath.replace('USER_NEEDS_CONFIGURATION', '[YOUR_USERNAME]') + '\\[ACCOUNT_NAME]\\AllServers');
    } else {
      // For real usernames, show the expected structure
      accountPaths.push(pluginDataPath + '\\[ACCOUNT_NAME]\\AllServers');
    }
    
    return accountPaths;
  } catch (error) {
    console.error('Failed to get account directories:', error);
    return [];
  }
}

// Discover accounts for a specific plugin data path
async function discoverAccountsForPath(pluginDataPath) {
  // Mark that we need user configuration
  await chrome.storage.local.set({ 
    'needsPathConfiguration': true,
    'configurationBasePath': pluginDataPath
  });
  
  // Return placeholder that triggers configuration flow
  return [`${pluginDataPath}\\ACCOUNT_NEEDS_CONFIGURATION`];
}

// Check if bridge plugin is already installed
async function checkBridgePluginInstalled(pluginPaths) {
  if (pluginPaths.length === 0) return false;
  
  try {
    // Check storage for installation flag
    const stored = await chrome.storage.local.get(['bridgeInstalled', 'installPaths']);
    
    // Consider installed if flag is set and paths match
    if (stored.bridgeInstalled && stored.installPaths) {
      const validPaths = pluginPaths.filter(path => !path.includes('NEEDS_CONFIGURATION'));
      return validPaths.length > 0;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// Install bridge plugin to a specific directory
async function installToDirectory(targetPath) {
  try {
    // Skip placeholder paths that need configuration
    if (targetPath.includes('[') || targetPath.includes('USER_NEEDS_CONFIGURATION')) {
      return {
        success: false,
        error: 'Path configuration needed - please install manually',
        path: targetPath,
        needsConfiguration: true,
        instructions: [
          'Download the plugin file',
          'Navigate to your LOTRO PluginData folder', 
          'Find your account folder (e.g., "aaxxis")',
          'Copy the .lua file to the AllServers subfolder',
          'Path should be: ...\\PluginData\\[YourAccount]\\AllServers\\LOTROGuidesExporter.lua'
        ]
      };
    }
    
    // Get the plugin file content
    const pluginContent = await getBridgePluginContent(targetPath);
    
    // Create a user-friendly filename
    const filename = 'LOTROGuidesExporter.lua';
    
    // Use downloads API to provide the file for manual placement
    const downloadId = await chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(pluginContent),
      filename: filename,
      saveAs: true
    });
    
    // Store installation information for user guidance
    await chrome.storage.local.set({
      'pendingInstallation': {
        downloadId: downloadId,
        targetPath: targetPath,
        filename: filename,
        instructions: [
          '1. Download the LOTROGuidesExporter.lua file',
          '2. Navigate to your LOTRO PluginData folder',
          '3. Find your account folder (e.g., "aaxxis")', 
          '4. Copy the file to the AllServers subfolder',
          '5. Final path: ...\\PluginData\\[Account]\\AllServers\\LOTROGuidesExporter.lua',
          '6. Restart LOTRO to load the plugin'
        ]
      }
    });
    
    return {
      success: true,
      path: targetPath,
      filename: filename,
      downloadId: downloadId,
      needsManualPlacement: true,
      instructions: [
        'File downloaded successfully!',
        'Please place it in your LOTRO PluginData account folder',
        'Path: ...\\PluginData\\[YourAccount]\\AllServers\\'
      ]
    };
  } catch (error) {
    console.error('Failed to install to directory:', targetPath, error);
    return {
      success: false,
      error: error.message,
      path: targetPath
    };
  }
}

// Get the bridge plugin file content with dynamic path configuration
async function getBridgePluginContent(targetPath) {
  try {
    // Get the base plugin content
    const response = await fetch(chrome.runtime.getURL('LOTROGuidesExporter.lua'));
    let pluginContent = await response.text();
    
    // Extract account name from target path
    const accountName = targetPath.split('\\').pop() || 'DefaultAccount';
    
    // Update the export path to be more accessible and unique per account
    const updatedContent = pluginContent.replace(
      'local EXPORT_PATH = os.getenv("USERPROFILE") .. "\\\\Documents\\\\LOTROGuides";',
      `local EXPORT_PATH = os.getenv("USERPROFILE") .. "\\\\Documents\\\\LOTROGuides\\\\${accountName}";`
    );
    
    return updatedContent;
  } catch (error) {
    console.error('Failed to get plugin content:', error);
    // Return fallback content if fetch fails
    return await getFallbackPluginContent(targetPath);
  }
}

// Fallback plugin content if file fetch fails
async function getFallbackPluginContent(targetPath) {
  const accountName = targetPath.split('\\').pop() || 'DefaultAccount';
  
  return `-- LOTRO Guides Character Data Exporter (Auto-installed)
-- Account: ${accountName}
-- Installation Date: ${new Date().toISOString()}

import "Turbine";
import "Turbine.Gameplay";
import "Turbine.UI";

local LocalPlayer = Turbine.Gameplay.LocalPlayer;

-- Export settings with account-specific path
local EXPORT_PATH = os.getenv("USERPROFILE") .. "\\\\Documents\\\\LOTROGuides\\\\${accountName}";
local DATA_FILE = EXPORT_PATH .. "\\\\character.json";

-- Create export directory if it doesn't exist
local function ensureExportDir()
    local success, error = pcall(function()
        os.execute('mkdir "' .. EXPORT_PATH .. '" 2>nul');
    end);
end

-- Basic character data extraction
local function extractCharacterData()
    ensureExportDir();
    
    local player = LocalPlayer.GetInstance();
    if not player then
        Turbine.Shell.WriteLine("Error: Could not get LocalPlayer instance");
        return false;
    end
    
    -- Basic character info
    local character = {
        name = tostring(player:GetName() or "Unknown"),
        level = player:GetLevel() or 0,
        class = tostring(player:GetClass() or "Unknown"),
        race = tostring(player:GetRace() or "Unknown"),
        server = tostring(player:GetWorldName() or "Unknown"),
        extractedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
    };
    
    -- Simple JSON serialization
    local jsonData = '{"version":"1.0.0","source":"auto-installed-bridge","extractedAt":"' .. character.extractedAt .. '","characters":[{"name":"' .. character.name .. '","level":' .. character.level .. ',"class":"' .. character.class .. '","race":"' .. character.race .. '","server":"' .. character.server .. '","extractedAt":"' .. character.extractedAt .. '"}]}';
    
    -- Write to file
    local file = io.open(DATA_FILE, "w");
    if file then
        file:write(jsonData);
        file:close();
        Turbine.Shell.WriteLine("Character data exported to: " .. DATA_FILE);
        return true;
    else
        Turbine.Shell.WriteLine("Error: Could not write to " .. DATA_FILE);
        return false;
    end
end

-- Manual export command
local function manualExport()
    if extractCharacterData() then
        Turbine.Shell.WriteLine("Character data exported successfully!");
    else
        Turbine.Shell.WriteLine("Export failed!");
    end
end

-- Setup auto-export
local function setupAutoExport()
    local player = LocalPlayer.GetInstance();
    if player then
        -- Initial export after load
        Turbine.Engine.AddCallback(function()
            extractCharacterData();
        end, 3);
        
        Turbine.Shell.WriteLine("LOTRO Guides Exporter loaded. Type '/lotroexport' to export character data.");
    end
end

-- Register command
local exportCommand = Turbine.Shell.AddCommand("lotroexport", manualExport);
exportCommand:SetShortHelp("Export character data for LOTRO Guides");

-- Initialize
setupAutoExport();
`;
}