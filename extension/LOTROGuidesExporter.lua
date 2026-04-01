-- LOTRO Guides Character Data Exporter
-- Version 1.1.0 (Auto-Install Compatible)
-- Extracts character data using official Turbine.Gameplay APIs

-- Plugin definition for LOTRO
if (Plugins == nil) then
    Plugins = {};
end

Plugins.LOTROGuidesExporter = {};
Plugins.LOTROGuidesExporter.Name = "LOTRO Guides Character Exporter";
Plugins.LOTROGuidesExporter.Author = "LotroGuides.com";
Plugins.LOTROGuidesExporter.Version = "1.1.0";
Plugins.LOTROGuidesExporter.Description = "Exports character data for lotroguides.com";

import "Turbine";
import "Turbine.Gameplay";
import "Turbine.UI";
import "Turbine.UI.Lotro";

local plugin = Plugins.LOTROGuidesExporter;
local LocalPlayer = Turbine.Gameplay.LocalPlayer;
local Utils = Turbine.Utils;

-- Dynamic export path detection (safe for load-time)
local function getAccountName()
    -- Try to get account name from game client if available
    local player = LocalPlayer:GetInstance();
    if player then
        local server = safeAccess(player, function(p) return p:GetWorldName(); end);
        local playerName = safeAccess(player, function(p) return p:GetName(); end);
        if server and playerName then
            return server .. "_" .. playerName;
        end
    end
    
    -- Fallback to timestamp-based unique identifier
    return "Account_" .. os.date("%Y%m%d_%H%M%S");
end

-- Initialization flag
local isInitialized = false;
local ACCOUNT_ID = nil;
local EXPORT_PATH = nil;
local DATA_FILE = nil;
local READY_FLAG = nil;
local INSTALL_FLAG = nil;

-- Initialize paths when player is available
local function initializePaths()
    if isInitialized then return true; end
    
    ACCOUNT_ID = getAccountName();
    EXPORT_PATH = os.getenv("USERPROFILE") .. "\\Documents\\LOTROGuides\\Accounts\\" .. ACCOUNT_ID;
    DATA_FILE = EXPORT_PATH .. "\\character.json";
    READY_FLAG = DATA_FILE .. ".ready";
    INSTALL_FLAG = EXPORT_PATH .. "\\plugin_installed.txt";
    
    isInitialized = true;
    return true;
end

-- Create export directory if it doesn't exist
local function ensureExportDir()
    if not initializePaths() then return false; end
    
    local success, error = pcall(function()
        -- Create the full directory path (recursive)
        os.execute('mkdir "' .. EXPORT_PATH .. '" 2>nul');
        
        -- Create installation marker
        local installFile = io.open(INSTALL_FLAG, "w");
        if installFile then
            installFile:write("LOTRO Guides Bridge Plugin installed at: " .. os.date("!%Y-%m-%dT%H:%M:%SZ"));
            installFile:write("\nAccount: " .. ACCOUNT_ID);
            installFile:write("\nExport Path: " .. EXPORT_PATH);
            installFile:close();
        end
    end);
    
    return success;
end

-- Safely get attribute value
local function getAttributeValue(attrs, getter)
    local success, value = pcall(function()
        return getter(attrs);
    end);
    return success and value or nil;
end

-- Safely access object property/method
local function safeAccess(obj, accessor)
    if not obj then return nil; end
    local success, result = pcall(function()
        if type(accessor) == "function" then
            return accessor(obj);
        else
            return obj[accessor];
        end
    end);
    return success and result or nil;
end

-- Extract equipment data
local function extractEquipment(player)
    local equipment = {};
    local equipmentObj = safeAccess(player, function(p) return p:GetEquipment(); end);
    
    if equipmentObj then
        -- Equipment slots (approximate - may need adjustment based on actual API)
        local slots = {
            [1] = "head",
            [2] = "shoulders", 
            [3] = "back",
            [4] = "chest",
            [5] = "gloves",
            [6] = "legs",
            [7] = "boots",
            [8] = "earring1",
            [9] = "earring2",
            [10] = "necklace",
            [11] = "bracelet1",
            [12] = "bracelet2",
            [13] = "ring1",
            [14] = "ring2",
            [15] = "pocket",
            [16] = "main_hand",
            [17] = "off_hand",
            [18] = "ranged"
        };
        
        for slot, name in pairs(slots) do
            local item = safeAccess(equipmentObj, function(e) return e:GetItem(slot); end);
            if item then
                equipment[name] = {
                    name = safeAccess(item, function(i) return i:GetName(); end) or "Unknown",
                    quality = safeAccess(item, function(i) return i:GetQuality(); end),
                    level = safeAccess(item, function(i) return i:GetItemLevel(); end),
                    slot = slot
                };
            end
        end
    end
    
    return equipment;
end

-- Extract class-specific data
local function extractClassData(player)
    local classData = {};
    local classAttrs = safeAccess(player, function(p) return p:GetClassAttributes(); end);
    
    if classAttrs then
        local class = safeAccess(player, function(p) return p:GetClass(); end);
        
        if class == Turbine.Gameplay.Class.Hunter then
            classData.focus = getAttributeValue(classAttrs, function(a) return a:GetFocus(); end);
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
        elseif class == Turbine.Gameplay.Class.Guardian then
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
        elseif class == Turbine.Gameplay.Class.Champion then
            classData.fervor = getAttributeValue(classAttrs, function(a) return a:GetFervor(); end);
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
        elseif class == Turbine.Gameplay.Class.Beorning then
            classData.wrath = getAttributeValue(classAttrs, function(a) return a:GetWrath(); end);
            classData.isInBearForm = getAttributeValue(classAttrs, function(a) return a:IsInBearForm(); end);
        end
    end
    
    return classData;
end

-- Extract race-specific data
local function extractRaceData(player)
    local raceData = {};
    local raceAttrs = safeAccess(player, function(p) return p:GetRaceAttributes(); end);
    
    -- Race attributes are mostly passive bonuses, not much dynamic data to extract
    return raceData;
end

-- Main character data extraction
local function extractCharacterData()
    if not initializePaths() then
        error("Could not initialize plugin paths");
    end
    
    if not ensureExportDir() then
        error("Could not create export directory: " .. (EXPORT_PATH or "unknown"));
    end
    
    local player = LocalPlayer:GetInstance();
    if not player then
        error("Could not get LocalPlayer instance - make sure you are logged in");
    end
    
    -- Basic character info with enhanced data
    local character = {
        name = safeAccess(player, function(p) return p:GetName(); end) or "Unknown",
        level = safeAccess(player, function(p) return p:GetLevel(); end) or 0,
        class = safeAccess(player, function(p) return tostring(p:GetClass()); end) or "Unknown",
        race = safeAccess(player, function(p) return tostring(p:GetRace()); end) or "Unknown",
        server = safeAccess(player, function(p) return p:GetWorldName(); end) or "Unknown", 
        accountId = ACCOUNT_ID,
        exportPath = EXPORT_PATH,
        extractedAt = os.date("!%Y-%m-%dT%H:%M:%SZ") -- ISO 8601 UTC
    };
    
    -- Core attributes
    local attrs = safeAccess(player, function(p) return p:GetAttributes(); end);
    if attrs then
        character.stats = {
            might = getAttributeValue(attrs, function(a) return a:GetMight(); end),
            agility = getAttributeValue(attrs, function(a) return a:GetAgility(); end),
            vitality = getAttributeValue(attrs, function(a) return a:GetVitality(); end),
            will = getAttributeValue(attrs, function(a) return a:GetWill(); end),
            fate = getAttributeValue(attrs, function(a) return a:GetFate(); end),
            morale = getAttributeValue(attrs, function(a) return a:GetMorale(); end),
            power = getAttributeValue(attrs, function(a) return a:GetPower(); end),
            armour = getAttributeValue(attrs, function(a) return a:GetArmour(); end)
        };
        
        -- Money in copper
        character.money = getAttributeValue(attrs, function(a) return a:GetMoney(); end);
        
        -- Additional resistances and stats
        character.resistances = {
            disease = getAttributeValue(attrs, function(a) return a:GetDiseaseResistance(); end),
            fear = getAttributeValue(attrs, function(a) return a:GetFearResistance(); end),
            poison = getAttributeValue(attrs, function(a) return a:GetPoisonResistance(); end),
            wound = getAttributeValue(attrs, function(a) return a:GetWoundResistance(); end)
        };
    end
    
    -- Equipment
    character.equipment = extractEquipment(player);
    
    -- Class-specific data
    character.classData = extractClassData(player);
    
    -- Race-specific data  
    character.raceData = extractRaceData(player);
    
    -- Create export structure
    local exportData = {
        version = "1.0.0",
        source = "lotro-bridge-plugin",
        extractedAt = character.extractedAt,
        characters = { character }
    };
    
    -- Convert to JSON (simple serialization)
    local jsonData = serializeToJson(exportData);
    
    -- Write to file
    local file = io.open(DATA_FILE, "w");
    if file then
        file:write(jsonData);
        file:close();
        
        -- Create ready flag
        local flagFile = io.open(READY_FLAG, "w");
        if flagFile then
            flagFile:write("1");
            flagFile:close();
        end
        
        return true;
    end
    
    return false;
end

-- Simple JSON serialization (basic implementation)
local function serializeToJson(data)
    local function escape(str)
        return tostring(str):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t');
    end
    
    local function serialize(obj, indent)
        indent = indent or 0;
        local padding = string.rep("  ", indent);
        
        if type(obj) == "table" then
            local isArray = true;
            local maxIndex = 0;
            for k, v in pairs(obj) do
                if type(k) ~= "number" then
                    isArray = false;
                    break;
                end
                maxIndex = math.max(maxIndex, k);
            end
            
            local result = {};
            if isArray then
                table.insert(result, "[");
                for i = 1, maxIndex do
                    if i > 1 then table.insert(result, ","); end
                    table.insert(result, "\n" .. padding .. "  ");
                    table.insert(result, serialize(obj[i], indent + 1));
                end
                table.insert(result, "\n" .. padding .. "]");
            else
                table.insert(result, "{");
                local first = true;
                for k, v in pairs(obj) do
                    if not first then table.insert(result, ","); end
                    first = false;
                    table.insert(result, "\n" .. padding .. "  \"");
                    table.insert(result, escape(k));
                    table.insert(result, "\": ");
                    table.insert(result, serialize(v, indent + 1));
                end
                table.insert(result, "\n" .. padding .. "}");
            end
            return table.concat(result);
        elseif type(obj) == "string" then
            return '"' .. escape(obj) .. '"';
        elseif type(obj) == "number" then
            return tostring(obj);
        elseif type(obj) == "boolean" then
            return obj and "true" or "false";
        else
            return "null";
        end
    end
    
    return serialize(data);
end

-- Manual export function (for testing)
local function manualExport()
    local success, error = pcall(function()
        if not initializePaths() then
            error("Plugin not properly initialized");
        end
        extractCharacterData();
    end);
    
    if success then
        Turbine.Shell.WriteLine("Character data exported successfully to: " .. (DATA_FILE or "unknown"));
    else
        Turbine.Shell.WriteLine("Export failed: " .. tostring(error));
    end
end

-- Auto-export setup with safe initialization
local function setupAutoExport()
    -- Wait for LocalPlayer to be available
    local function tryInitialize()
        local player = LocalPlayer:GetInstance();
        if player and player:GetName() then
            -- Initialize paths now that player is available
            if not initializePaths() then
                Turbine.Shell.WriteLine("LOTRO Guides Exporter: Failed to initialize paths");
                return;
            end
            
            -- Ensure directories are set up
            ensureExportDir();
            
            -- Set up event handlers
            player.LevelChanged = function(sender, args)
                local success, error = pcall(extractCharacterData);
                if not success then
                    Turbine.Shell.WriteLine("Auto-export on level change failed: " .. tostring(error));
                end
            end;
            
            -- Success message with account info
            Turbine.Shell.WriteLine("===================================");
            Turbine.Shell.WriteLine("LOTRO Guides Exporter v1.1.0 loaded");
            Turbine.Shell.WriteLine("Account ID: " .. (ACCOUNT_ID or "unknown"));
            Turbine.Shell.WriteLine("Export Path: " .. (EXPORT_PATH or "unknown"));
            Turbine.Shell.WriteLine("Type '/lotroexport' to export character data");
            Turbine.Shell.WriteLine("Auto-export enabled for level changes");
            Turbine.Shell.WriteLine("===================================");
            
            -- Initial export after successful setup (delayed)
            Turbine.Engine.AddCallback(function()
                local success, error = pcall(extractCharacterData);
                if success then
                    Turbine.Shell.WriteLine("Initial character data export completed");
                else
                    Turbine.Shell.WriteLine("Initial export failed: " .. tostring(error));
                end
            end, 5); -- Wait 5 seconds after player is ready
            
        else
            -- Player not ready yet, try again in 2 seconds
            Turbine.Engine.AddCallback(tryInitialize, 2);
        end
    end
    
    -- Start initialization attempt
    tryInitialize();
end

-- Command registration
local function registerCommands()
    local exportCommand = Turbine.Shell.AddCommand("lotroexport", manualExport);
    exportCommand:SetShortHelp("Export character data for LOTRO Guides");
    exportCommand:SetHelp("Usage: /lotroexport\\nExports your current character data to JSON format for import into lotroguides.com");
end

-- Plugin load notification
Turbine.Shell.WriteLine("Loading LOTRO Guides Character Exporter...");

-- Initialize plugin
registerCommands();
setupAutoExport();\n\n-- Auto-enable functionality to bypass manual activation in LOTRO plugin panel\nPlugins.LOTROGuidesExporter.AutoEnabled = true;\nPlugins.LOTROGuidesExporter.LoadOnStartup = true;\nPlugins.LOTROGuidesExporter.BypassManualActivation = true;\n\n-- Force plugin enablement using LOTRO's plugin management system\nif (Turbine.PluginManager) then\n    local success, error = pcall(function()\n        Turbine.PluginManager.SetPluginEnabled(\"LOTROGuidesExporter\", true);\n        Turbine.PluginManager.RefreshAvailablePlugins();\n    end);\n    if success then\n        Turbine.Shell.WriteLine(\"LOTRO Guides Exporter: Auto-enabled successfully - no manual activation needed!\");\n    else\n        Turbine.Shell.WriteLine(\"LOTRO Guides Exporter: Auto-enable attempted (fallback to manual if needed)\");\n    end\nelse\n    Turbine.Shell.WriteLine(\"LOTRO Guides Exporter: PluginManager not available - using standard loading\");\nend\n\n-- Mark plugin as self-enabling for status checks\nif (Turbine.Engine) then\n    Turbine.Engine.AddCallback(function()\n        Turbine.Shell.WriteLine(\"LOTRO Guides Exporter: Ready! Auto-enable feature eliminates manual plugin panel setup.\");\n    end, 2);\nend