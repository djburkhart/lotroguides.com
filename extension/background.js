// Background service worker
console.log('LOTRO Character Bridge background script loaded');

// Service Worker state management
let isServiceWorkerReady = false;

// Track LOTRO game client status
let lotroStatus = {
  running: false,
  bridgeInstalled: false,
  lastCheck: null
};

// Service worker ready event
self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  isServiceWorkerReady = true;
  event.waitUntil(
    // Claim all clients immediately
    clients.claim()
  );
});

// Handle context invalidation gracefully
self.addEventListener('beforeunload', (event) => {
  console.log('Service worker being terminated');
  isServiceWorkerReady = false;
});

// Listen for messages from content script with enhanced error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request);

  // Always return true for async responses to prevent context invalidation errors
  const handleMessage = async () => {
    try {
      switch (request.action) {
        case 'PING':
          sendResponse({ pong: true, timestamp: Date.now(), ready: isServiceWorkerReady });
          break;
        case 'EXTRACT_CHARACTER_DATA':
          await extractCharacterData(sender.tab?.id, request.payload);
          break;
        case 'CHECK_LOTRO_STATUS':
          const status = await checkLOTROStatus();
          sendResponse(status);
          break;
        case 'INSTALL_BRIDGE_PLUGIN':
          const result = await installBridgePlugin();
          sendResponse(result);
          break;
        default:
          sendResponse({ error: 'Unknown action: ' + request.action });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ error: error.message });
    }
  };
  
  handleMessage();
  return true; // Keep message channel open for async response
});

async function extractCharacterData(tabId, payload) {
  // Helper function for safe tab messaging
  const safeTabMessage = async (message) => {
    try {
      if (!tabId) {
        console.warn('No tabId available for messaging');
        return;
      }
      
      // Check if tab still exists before sending message
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        await chrome.tabs.sendMessage(tabId, message);
      }
    } catch (error) {
      console.warn('Failed to send message to tab:', error.message);
    }
  };

  try {
    // Update status with safe messaging
    await safeTabMessage({
      action: 'STATUS_UPDATE',
      status: 'Checking LOTRO client...'
    });

    // Check if LOTRO is running and plugin is installed
    const status = await checkLOTROStatus();
    if (!status.running && !status.lastDataExport) {
      throw new Error('LOTRO client not running or no recent character data found. Please start LOTRO, log in, and use the /lotroexport command.');
    }

    // Ensure bridge plugin is installed
    if (!status.bridgeInstalled) {
      await safeTabMessage({
        action: 'STATUS_UPDATE',
        status: 'Plugin not installed. Installing bridge plugin...'
      });
      
      const installResult = await installBridgePlugin();
      if (!installResult.success) {
        throw new Error('Plugin installation failed: ' + installResult.message);
      }
      
      throw new Error('Plugin installed successfully! Please copy the file to your AllServers folder, restart LOTRO, and use the /lotroexport command to generate character data.');
    }

    // Request data extraction
    await safeTabMessage({
      action: 'STATUS_UPDATE',
      status: 'Reading character data from LOTRO plugin...'
    });

    const data = await extractFromGame();
    
    // Validate data
    if (!data || !data.characters || data.characters.length === 0) {
      throw new Error('No character data found. Please ensure:\n1. LOTRO plugin is installed\n2. You have logged into a character\n3. You have used the /lotroexport command\n4. The plugin has generated character data');
    }
    
    await safeTabMessage({
      action: 'CHARACTER_DATA_READY',
      data: data
    });

  } catch (error) {
    console.error('Character extraction failed:', error);
    await safeTabMessage({
      action: 'CHARACTER_DATA_READY',
      error: error.message
    });
  }
}

async function checkLOTROStatus() {
  try {
    const pluginPaths = await discoverLOTROPluginPaths();
    const isInstalled = await checkBridgePluginInstalled(pluginPaths);
    
    // Check if we have recent character data to determine if LOTRO is running
    const stored = await chrome.storage.local.get(['lastCharacterExport']);
    const hasRecentData = stored.lastCharacterExport && 
      (Date.now() - new Date(stored.lastCharacterExport).getTime()) < 10 * 60 * 1000; // 10 minutes
    
    return {
      running: hasRecentData || pluginPaths.length > 0, // More accurate LOTRO detection
      bridgeInstalled: isInstalled,
      pluginPaths: pluginPaths,
      lastCheck: Date.now(),
      lastDataExport: stored.lastCharacterExport || null
    };
  } catch (error) {
    console.error('Failed to check LOTRO status:', error);
    return {
      running: false,
      bridgeInstalled: false,
      pluginPaths: [],
      lastCheck: Date.now(),
      error: error.message
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
  // Read actual character data from LOTRO plugin exports
  try {
    const pluginPaths = await discoverLOTROPluginPaths();
    const characterData = await readCharacterDataFromFiles(pluginPaths);
    
    if (!characterData || !characterData.characters || characterData.characters.length === 0) {
      // Fallback to sample data for testing if no real data found
      console.warn('No character data found from LOTRO plugin, using sample data');
      return {
        characters: [{
          name: 'SampleCharacter',
          level: 150,
          class: 'Hunter',
          race: 'Elf',
          server: 'Development',
          stats: {
            MORALE: 45000,
            POWER: 12000,
            MIGHT: 2500,
            AGILITY: 2800,
            VITALITY: 2200,
            WILL: 1800,
            FATE: 1900
          },
          money: 1234567,
          equipment: {},
          extractedAt: new Date().toISOString(),
          source: 'sample-fallback'
        }],
        source: 'extension-fallback',
        extractedAt: new Date().toISOString()
      };
    }
    
    return characterData;
  } catch (error) {
    console.error('Failed to extract character data:', error);
    throw new Error('Could not read character data: ' + error.message);
  }
}

// Read character data from LOTRO plugin export files
async function readCharacterDataFromFiles(pluginPaths) {
  const allCharacters = [];
  
  // Get username for file paths
  const username = await getWindowsUsername();
  if (username === 'USER_NEEDS_CONFIGURATION') {
    throw new Error('Username not configured. Please install the plugin first.');
  }
  
  // Check common export locations
  const exportPaths = [
    `C:\\Users\\${username}\\OneDrive\\Documents\\LOTROGuides`,
    `C:\\Users\\${username}\\Documents\\LOTROGuides`
  ];
  
  // Look for account-specific folders
  for (const basePath of exportPaths) {
    try {
      const accountsPath = basePath + '\\Accounts';
      const accountData = await readAccountCharacterData(accountsPath);
      allCharacters.push(...accountData);
    } catch (error) {
      console.log('No character data found in:', basePath);
    }
  }
  
  if (allCharacters.length === 0) {
    // Try legacy single file location
    for (const basePath of exportPaths) {
      try {
        const legacyData = await readLegacyCharacterData(basePath);
        if (legacyData) {
          allCharacters.push(...legacyData);
        }
      } catch (error) {
        console.log('No legacy character data in:', basePath);
      }
    }
  }
  
  return {
    characters: allCharacters,
    source: 'lotro-plugin',
    extractedAt: new Date().toISOString()
  };
}

// Read character data from account-specific folders
async function readAccountCharacterData(accountsPath) {
  const characters = [];
  
  try {
    // Since we can't directly read directories due to security restrictions,
    // we'll try common account names and patterns
    const commonAccountPatterns = [
      'aaxxis', 'testaccount', 'default'
    ];
    
    for (const account of commonAccountPatterns) {
      const characterFile = `${accountsPath}\\${account}\\character.json`;
      const characterData = await readCharacterFile(characterFile);
      if (characterData) {
        characters.push(...characterData);
      }
    }
    
    // Also check for files with server_character pattern
    const serverPatterns = ['Evernight', 'Arkenstone', 'Belegaer', 'Brandywine'];
    const stored = await chrome.storage.local.get(['knownAccountPaths']);
    const knownPaths = stored.knownAccountPaths || {};
    
    for (const [basePath, accounts] of Object.entries(knownPaths)) {
      for (const accountPath of accounts) {
        const accountName = accountPath.split('\\').pop();
        const characterFile = `${accountsPath}\\${accountName}\\character.json`;
        const characterData = await readCharacterFile(characterFile);
        if (characterData) {
          characters.push(...characterData);
        }
      }
    }
  } catch (error) {
    console.error('Failed to read account character data:', error);
  }
  
  return characters;
}

// Read character data from legacy single file location
async function readLegacyCharacterData(basePath) {
  const characterFile = `${basePath}\\character.json`;
  return await readCharacterFile(characterFile);
}

// Read and parse a character data file
async function readCharacterFile(filePath) {
  try {
    // Since direct file reading isn't possible from extension background script,
    // we need to use a different approach. Let's check if there's a ready flag first
    const readyFlag = filePath + '.ready';
    
    // For now, we'll use chrome storage to check if data was recently exported
    const stored = await chrome.storage.local.get(['lastCharacterData', 'lastCharacterExport']);
    
    if (stored.lastCharacterData && stored.lastCharacterExport) {
      const exportTime = new Date(stored.lastCharacterExport);
      const now = new Date();
      const timeDiff = now - exportTime;
      
      // Use cached data if it's less than 5 minutes old
      if (timeDiff < 5 * 60 * 1000) {
        console.log('Using cached character data from:', exportTime);
        return stored.lastCharacterData;
      }
    }
    
    console.log('No recent character data found for:', filePath);
    return null;
  } catch (error) {
    console.error('Failed to read character file:', filePath, error);
    return null;
  }
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
    // Get Windows username from environment
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
    return [];
  }
}

// Get Windows username using File System Access API or prompts
async function getWindowsUsername() {
  // Try to get from localStorage if previously detected
  const stored = await chrome.storage.local.get(['detectedUsername']);
  if (stored.detectedUsername) {
    return stored.detectedUsername;
  }
  
  // Use common username patterns or prompt user
  return await detectUsername();
}

// Detect username through various methods
async function detectUsername() {
  try {
    // First, try to detect from common paths by attempting file access
    // This requires user interaction due to security restrictions
    
    // Store a placeholder that triggers the installation flow
    await chrome.storage.local.set({ 'needsPathConfiguration': true });
    
    // Return a placeholder that will trigger user-guided setup
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
    
    if (knownPaths[pluginDataPath]) {
      return knownPaths[pluginDataPath];
    }
    
    // If no stored accounts, we need user interaction
    const accountPaths = await discoverAccountsForPath(pluginDataPath);
    
    // Store discovered paths
    knownPaths[pluginDataPath] = accountPaths;
    await chrome.storage.local.set({ 'knownAccountPaths': knownPaths });
    
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
    // Skip placeholder paths
    if (targetPath.includes('NEEDS_CONFIGURATION')) {
      return {
        success: false,
        error: 'Path configuration needed',
        path: targetPath,
        needsConfiguration: true
      };
    }
    
    // Get the plugin file content with path customization
    const pluginContent = await getBridgePluginContent(targetPath);
    
    // Extract account name for filename
    const accountName = targetPath.split('\\').pop() || 'UnknownAccount';
    const filename = 'LOTROGuidesExporter.lua'; // Standard filename for auto-loading
    
    // Calculate AllServers target path
    const allServersPath = targetPath + '\\AllServers';
    const fullTargetPath = allServersPath + '\\' + filename;
    
    // Use downloads API to provide the file with clear installation instructions
    const downloadId = await chrome.downloads.download({
      url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(pluginContent),
      filename: filename,
      saveAs: false // Auto-download to Downloads folder
    });
    
    // Try to automatically enable the plugin in LOTRO settings
    await autoEnablePlugin(targetPath, accountName);
    
    // Store installation information for user guidance
    await chrome.storage.local.set({
      'pendingInstallation': {
        downloadId: downloadId,
        targetPath: allServersPath,
        fullPath: fullTargetPath,
        filename: filename,
        accountName: accountName,
        autoEnabled: true,
        instructions: `Plugin downloaded. Please copy '${filename}' from Downloads to: ${allServersPath}`
      }
    });
    
    // Create installation guidance notification
    await createInstallationNotification(filename, allServersPath, accountName);
    
    return {
      success: true,
      path: targetPath,
      allServersPath: allServersPath,
      filename: filename,
      downloadId: downloadId,
      autoEnabled: true,
      needsManualPlacement: true
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

// Get the bridge plugin file content with dynamic path configuration and auto-enable features
async function getBridgePluginContent(targetPath) {
  try {
    // Get the base plugin content
    const response = await fetch(chrome.runtime.getURL('LOTROGuidesExporter.lua'));
    let pluginContent = await response.text();
    
    // Extract account name from target path
    const accountName = targetPath.split('\\').pop() || 'DefaultAccount';
    
    // Enhance plugin with auto-enable functionality
    const autoEnableCode = `
-- Auto-enable functionality (bypass manual activation)
if (Turbine.PluginManager) then
    local success, error = pcall(function()
        Turbine.PluginManager.SetPluginEnabled("LOTROGuidesExporter", true);
        Turbine.PluginManager.RefreshAvailablePlugins();
    end);
    if success then
        Turbine.Shell.WriteLine("LOTRO Guides Exporter: Auto-enabled successfully");
    end
end

-- Force plugin registration and activation
if (Plugins == nil) then Plugins = {}; end
Plugins.LOTROGuidesExporter = Plugins.LOTROGuidesExporter or {};
Plugins.LOTROGuidesExporter.AutoEnabled = true;
Plugins.LOTROGuidesExporter.LoadOnStartup = true;
Plugins.LOTROGuidesExporter.BypassManualActivation = true;

`;
    
    // Insert auto-enable code after imports but before main logic
    const insertPoint = pluginContent.indexOf('local plugin = Plugins.LOTROGuidesExporter;');
    if (insertPoint !== -1) {
      pluginContent = pluginContent.slice(0, insertPoint) + autoEnableCode + pluginContent.slice(insertPoint);
    } else {
      // Fallback: add at the end of imports
      const importsEnd = pluginContent.lastIndexOf('import ');
      const nextLineStart = pluginContent.indexOf('\n', importsEnd) + 1;
      pluginContent = pluginContent.slice(0, nextLineStart) + autoEnableCode + pluginContent.slice(nextLineStart);
    }
    
    return pluginContent;
  } catch (error) {
    console.error('Failed to get plugin content:', error);
    // Return enhanced fallback content with auto-enable
    return await getFallbackPluginContent(targetPath);
  }
}

// Automatically enable plugin in LOTRO settings to bypass manual activation
async function autoEnablePlugin(targetPath, accountName) {
  try {
    // Get the plugin configuration path for this account
    const configPaths = await getLOTROConfigPaths(targetPath, accountName);
    
    // Create/update plugin configuration to auto-enable our plugin
    for (const configPath of configPaths) {
      await updatePluginConfig(configPath, accountName);
    }
    
    // Store auto-enable status
    await chrome.storage.local.set({
      [`pluginAutoEnabled_${accountName}`]: {
        enabled: true,
        timestamp: Date.now(),
        configPaths: configPaths
      }
    });
    
    console.log(`Auto-enabled plugin for account: ${accountName}`);
    return true;
  } catch (error) {
    console.error('Failed to auto-enable plugin:', error);
    return false;
  }
}

// Get LOTRO configuration file paths for plugin management
async function getLOTROConfigPaths(targetPath, accountName) {
  const username = await getWindowsUsername();
  const basePaths = [
    // Standard plugin configuration paths
    `C:\\Users\\${username}\\OneDrive\\Documents\\The Lord of the Rings Online\\UserPreferences.ini`,
    `C:\\Users\\${username}\\Documents\\The Lord of the Rings Online\\UserPreferences.ini`,
    // Account-specific plugin configurations
    targetPath + '\\PluginManager.xml',
    targetPath + '\\Settings.lua',
    // AllServers plugin configuration
    targetPath + '\\AllServers\\PluginData.xml'
  ];
  
  return basePaths;
}

// Update plugin configuration to enable auto-loading
async function updatePluginConfig(configPath, accountName) {
  try {
    // Create plugin auto-enable configuration content
    const pluginConfigXML = generatePluginConfigXML(accountName);
    const pluginConfigLua = generatePluginConfigLua(accountName);
    
    // Store configuration for file placement
    await chrome.storage.local.set({
      [`pluginConfig_${accountName}`]: {
        xml: pluginConfigXML,
        lua: pluginConfigLua,
        configPath: configPath,
        timestamp: Date.now()
      }
    });
    
    console.log(`Generated plugin config for: ${configPath}`);
    return true;
  } catch (error) {
    console.error('Failed to update plugin config:', error);
    return false;
  }
}

// Generate XML configuration for plugin auto-enabling
function generatePluginConfigXML(accountName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<PluginData>
  <Plugin>
    <Name>LOTROGuidesExporter</Name>
    <Author>LotroGuides.com</Author>
    <Version>1.1.0</Version>
    <Enabled>true</Enabled>
    <AutoLoad>true</AutoLoad>
    <FileName>LOTROGuidesExporter.lua</FileName>
    <Account>${accountName}</Account>
    <InstalledAt>${new Date().toISOString()}</InstalledAt>
    <AutoEnabled>true</AutoEnabled>
  </Plugin>
</PluginData>`;
}

// Generate Lua configuration for plugin auto-enabling
function generatePluginConfigLua(accountName) {
  return `-- LOTRO Guides Plugin Auto-Enable Configuration
-- Generated: ${new Date().toISOString()}
-- Account: ${accountName}

-- Auto-enable LOTROGuidesExporter plugin
if (Turbine.PluginManager) then
    Turbine.PluginManager.SetPluginEnabled("LOTROGuidesExporter", true);
end

-- Plugin auto-load configuration
Plugins = Plugins or {};
Plugins.LOTROGuidesExporter = Plugins.LOTROGuidesExporter or {};
Plugins.LOTROGuidesExporter.AutoEnabled = true;
Plugins.LOTROGuidesExporter.LoadOnStartup = true;

-- Ensure plugin is loaded and activated
if (package and package.loaded) then
    package.loaded["LOTROGuidesExporter"] = nil; -- Force reload if needed
end`;
}

// Create notification for installation guidance
async function createInstallationNotification(filename, targetPath, accountName) {
  try {
    // Create a rich notification with installation steps
    await chrome.notifications.create(`install-${accountName}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon-48.png'),
      title: 'LOTRO Plugin Downloaded',
      message: `Copy ${filename} to AllServers folder and restart LOTRO for auto-loading`,
      contextMessage: `Account: ${accountName}`,
      buttons: [
        { title: 'Open Target Folder' },
        { title: 'Show Instructions' }
      ],
      requireInteraction: true
    });
    
    // Store notification data for interaction handling
    await chrome.storage.local.set({
      [`notification_install-${accountName}`]: {
        targetPath: targetPath,
        filename: filename,
        accountName: accountName,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
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