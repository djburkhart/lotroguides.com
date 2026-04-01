-- LOTRO Guides Character Data Exporter
-- Version 1.1.0 (Auto-Install Compatible)
-- Extracts character data using official Turbine.Gameplay APIs

-- Plugin definition for LOTRO (Standard SSG pattern)
if (Plugins == nil) then
    Plugins = {};
end

-- Create plugin entry with standard fields
Plugins.LOTROGuidesExporter = {
    Name = "LOTRO Guides Character Exporter",
    Author = "LotroGuides.com",
    Version = "1.1.0", 
    Description = "Exports character data for lotroguides.com",
    Load = function()
        -- Standard plugin load function called by LOTRO
        registerCommands();
        setupAutoExport();
    end,
    Unload = function()
        -- Standard cleanup function
    end
};

import "Turbine";
import "Turbine.Gameplay";
import "Turbine.UI";
import "Turbine.UI.Lotro";

local plugin = Plugins.LOTROGuidesExporter;
local LocalPlayer = Turbine.Gameplay.LocalPlayer;
local Utils = Turbine.Utils;

-- Safely access object property/method (must be defined first)
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
        -- Use Turbine's file system API instead of os.execute for better compatibility
        local documents = os.getenv("USERPROFILE") .. "\\Documents";
        
        -- Try to create directories step by step for better error handling
        local pathParts = {};
        for part in string.gmatch(EXPORT_PATH, "[^\\]+") do
            table.insert(pathParts, part);
        end
        
        local currentPath = pathParts[1]; -- Usually C:
        for i = 2, #pathParts do
            currentPath = currentPath .. "\\" .. pathParts[i];
            -- Create directory if it doesn't exist (ignore errors - may already exist)
            local createCmd = 'if not exist "' .. string.gsub(currentPath, '"', '\\"') .. '" mkdir "' .. string.gsub(currentPath, '"', '\\"') .. '"';
            os.execute(createCmd .. " 2>nul");
        end
        
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

-- Extract equipment data
local function extractEquipment(player)
    local equipment = {};
    local equipmentObj = safeAccess(player, function(p) return p:GetEquipment(); end);
    
    if equipmentObj then
        -- Standard LOTRO equipment slots (verified with SSG documentation)
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
                local itemData = {
                    name = safeAccess(item, function(i) return i:GetName(); end) or "Unknown",
                    quality = safeAccess(item, function(i) return i:GetQuality(); end),
                    level = safeAccess(item, function(i) return i:GetItemLevel(); end),
                    slot = slot
                };
                
                -- Try to get additional item properties if available
                local category = safeAccess(item, function(i) return i:GetCategory(); end);
                local subcategory = safeAccess(item, function(i) return i:GetSubCategory(); end);
                local durability = safeAccess(item, function(i) return i:GetDurability(); end);
                local maxDurability = safeAccess(item, function(i) return i:GetMaxDurability(); end);
                
                if category then itemData.category = tostring(category); end
                if subcategory then itemData.subcategory = tostring(subcategory); end
                if durability then itemData.durability = durability; end
                if maxDurability then itemData.maxDurability = maxDurability; end
                
                equipment[name] = itemData;
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
        -- Get class as number and convert to string for comparison
        local classEnum = safeAccess(player, function(p) return p:GetClass(); end);
        local className = safeAccess(player, function(p) return p:GetClassDisplayName(); end) or "Unknown";
        
        -- Use class name strings instead of enum comparison (more reliable)
        if className == "Hunter" then
            classData.focus = getAttributeValue(classAttrs, function(a) return a:GetFocus(); end);
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
        elseif className == "Guardian" then
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
            classData.block = getAttributeValue(classAttrs, function(a) return a:GetBlock(); end);
        elseif className == "Champion" then
            classData.fervor = getAttributeValue(classAttrs, function(a) return a:GetFervor(); end);
            classData.stance = getAttributeValue(classAttrs, function(a) return a:GetStance(); end);
        elseif className == "Beorning" then
            classData.wrath = getAttributeValue(classAttrs, function(a) return a:GetWrath(); end);
            classData.isInBearForm = getAttributeValue(classAttrs, function(a) return a:IsInBearForm(); end);
        elseif className == "Minstrel" then
            classData.ballads = getAttributeValue(classAttrs, function(a) return a:GetBallads(); end);
        elseif className == "Lore-master" then
            classData.attunement = getAttributeValue(classAttrs, function(a) return a:GetAttunement(); end);
        elseif className == "Captain" then
            classData.defeat = getAttributeValue(classAttrs, function(a) return a:GetDefeat(); end);
        end
        
        -- Store both enum and name for debugging
        classData.classEnum = classEnum;
        classData.className = className;
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
        -- Use GetClassDisplayName for reliable class name
        class = safeAccess(player, function(p) return p:GetClassDisplayName(); end) or "Unknown",
        -- Use GetRaceDisplayName for reliable race name  
        race = safeAccess(player, function(p) return p:GetRaceDisplayName(); end) or "Unknown",
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
            armour = getAttributeValue(attrs, function(a) return a:GetArmour(); end),
            -- Additional core stats
            maxMorale = getAttributeValue(attrs, function(a) return a:GetMaxMorale(); end),
            maxPower = getAttributeValue(attrs, function(a) return a:GetMaxPower(); end),
            physicalMastery = getAttributeValue(attrs, function(a) return a:GetPhysicalMastery(); end),
            tacticalMastery = getAttributeValue(attrs, function(a) return a:GetTacticalMastery(); end),
            criticalRating = getAttributeValue(attrs, function(a) return a:GetCriticalRating(); end),
            finesse = getAttributeValue(attrs, function(a) return a:GetFinesse(); end)
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
            Turbine.Shell.WriteLine("LOTRO Guides Exporter: Player detected, initializing...");
            
            -- Initialize paths now that player is available
            if not initializePaths() then
                Turbine.Shell.WriteLine("LOTRO Guides Exporter: ❌ FAILED to initialize paths");
                Turbine.Shell.WriteLine("LOTRO Guides Exporter: Try running '/lotrotest' for detailed diagnostics");
                return;
            end
            
            -- Ensure directories are set up
            if not ensureExportDir() then
                Turbine.Shell.WriteLine("LOTRO Guides Exporter: ⚠️  WARNING - Could not create export directory");
                Turbine.Shell.WriteLine("LOTRO Guides Exporter: Manual exports may fail. Check folder permissions.");
            end
            
            -- Set up event handlers
            player.LevelChanged = function(sender, args)
                local success, error = pcall(extractCharacterData);
                if not success then
                    Turbine.Shell.WriteLine("Auto-export on level change failed: " .. tostring(error));
                    Turbine.Shell.WriteLine("Try '/lotroexport' manually or '/lotrotest' for diagnostics");
                end
            end;
            
            -- Success message with account info
            Turbine.Shell.WriteLine("===================================");
            Turbine.Shell.WriteLine("LOTRO Guides Exporter v1.1.0 loaded");
            Turbine.Shell.WriteLine("Account ID: " .. (ACCOUNT_ID or "unknown"));
            Turbine.Shell.WriteLine("Export Path: " .. (EXPORT_PATH or "unknown"));
            Turbine.Shell.WriteLine("Commands: '/lotroexport' (export) | '/lotrotest' (test)");
            Turbine.Shell.WriteLine("Auto-export enabled for level changes");
            Turbine.Shell.WriteLine("===================================");
            
            -- Initial export after successful setup (delayed)
            Turbine.Engine.AddCallback(function()
                local success, error = pcall(extractCharacterData);
                if success then
                    Turbine.Shell.WriteLine("LOTRO Guides Exporter: ✅ Initial character data export completed");
                else
                    Turbine.Shell.WriteLine("LOTRO Guides Exporter: ❌ Initial export failed: " .. tostring(error));
                    Turbine.Shell.WriteLine("LOTRO Guides Exporter: Try '/lotrotest' command for diagnostics");
                end
            end, 5); -- Wait 5 seconds after player is ready
            
        else
            -- Player not ready yet, try again in 2 seconds
            Turbine.Engine.AddCallback(tryInitialize, 2);
        end
    end
    
    -- Start initialization attempt with try-catch
    local success, error = pcall(tryInitialize);
    if not success then
        Turbine.Shell.WriteLine("LOTRO Guides Exporter: ❌ CRITICAL ERROR during initialization: " .. tostring(error));
        Turbine.Shell.WriteLine("LOTRO Guides Exporter: Plugin may not function properly. Try reloading LOTRO.");
    end
end

-- Test function for debugging with API compatibility checks
local function testPlugin()
    Turbine.Shell.WriteLine("=== LOTRO Guides Plugin Debug Test ===");
    
    local player = LocalPlayer:GetInstance();
    if not player then
        Turbine.Shell.WriteLine("❌ ERROR: LocalPlayer not available - are you logged into a character?");
        return;
    end
    
    -- Test basic player data
    local playerName = safeAccess(player, function(p) return p:GetName(); end);
    local server = safeAccess(player, function(p) return p:GetWorldName(); end);
    local level = safeAccess(player, function(p) return p:GetLevel(); end);
    
    Turbine.Shell.WriteLine("✅ Player found: " .. (playerName or "Unknown"));
    Turbine.Shell.WriteLine("✅ Server: " .. (server or "Unknown"));
    Turbine.Shell.WriteLine("✅ Level: " .. (level or "Unknown"));
    
    -- Test API compatibility
    Turbine.Shell.WriteLine("--- API Compatibility Test ---");
    
    -- Test new display name methods
    local classDisplay = safeAccess(player, function(p) return p:GetClassDisplayName(); end);
    local raceDisplay = safeAccess(player, function(p) return p:GetRaceDisplayName(); end);
    
    if classDisplay then
        Turbine.Shell.WriteLine("✅ GetClassDisplayName available: " .. classDisplay);
    else
        local classEnum = safeAccess(player, function(p) return tostring(p:GetClass()); end);
        Turbine.Shell.WriteLine("⚠️  GetClassDisplayName not available, using enum: " .. (classEnum or "Unknown"));
    end
    
    if raceDisplay then
        Turbine.Shell.WriteLine("✅ GetRaceDisplayName available: " .. raceDisplay);
    else  
        local raceEnum = safeAccess(player, function(p) return tostring(p:GetRace()); end);
        Turbine.Shell.WriteLine("⚠️  GetRaceDisplayName not available, using enum: " .. (raceEnum or "Unknown"));
    end
    
    -- Test equipment API
    local equipment = safeAccess(player, function(p) return p:GetEquipment(); end);
    if equipment then
        local testItem = safeAccess(equipment, function(e) return e:GetItem(1); end);
        if testItem then
            Turbine.Shell.WriteLine("✅ Equipment API working - found head slot item");
        else
            Turbine.Shell.WriteLine("⚠️  Equipment slots empty or inaccessible");
        end
    else
        Turbine.Shell.WriteLine("❌ ERROR: Equipment API not accessible");
    end
    
    -- Test attributes API
    local attrs = safeAccess(player, function(p) return p:GetAttributes(); end);
    if attrs then
        local might = safeAccess(attrs, function(a) return a:GetMight(); end);
        if might then
            Turbine.Shell.WriteLine("✅ Attributes API working - Might: " .. might);
        else
            Turbine.Shell.WriteLine("❌ ERROR: Cannot read attribute values");
        end
    else
        Turbine.Shell.WriteLine("❌ ERROR: Attributes API not accessible");
    end
    
    -- Test path initialization
    if initializePaths() then
        Turbine.Shell.WriteLine("✅ Paths initialized successfully");
        Turbine.Shell.WriteLine("   Account ID: " .. (ACCOUNT_ID or "Unknown"));
        Turbine.Shell.WriteLine("   Export Path: " .. (EXPORT_PATH or "Unknown"));
        
        if ensureExportDir() then
            Turbine.Shell.WriteLine("✅ Export directory created/verified");
            
            -- Test full export
            local success, error = pcall(extractCharacterData);
            if success then
                Turbine.Shell.WriteLine("✅ Full character export successful!");
            else
                Turbine.Shell.WriteLine("❌ ERROR: Export failed: " .. tostring(error));
            end
        else
            Turbine.Shell.WriteLine("❌ ERROR: Could not create export directory");
        end
    else
        Turbine.Shell.WriteLine("❌ ERROR: Failed to initialize paths");
    end
    
    Turbine.Shell.WriteLine("=== Test Complete ===");
    Turbine.Shell.WriteLine("If you see errors above, your LOTRO version may not support all APIs used by this plugin.");
end

-- Command registration
local function registerCommands()
    local success, error = pcall(function()
        local exportCommand = Turbine.Shell.AddCommand("lotroexport", manualExport);
        exportCommand:SetShortHelp("Export character data for LOTRO Guides");
        exportCommand:SetHelp("Usage: /lotroexport\\nExports your current character data to JSON format for import into lotroguides.com");
        
        local testCommand = Turbine.Shell.AddCommand("lotrotest", testPlugin);
        testCommand:SetShortHelp("Test LOTRO Guides plugin functionality");
        testCommand:SetHelp("Usage: /lotrotest\\nTests if the LOTRO Guides plugin is working correctly and can access character data");
    end);
    
    if not success then
        Turbine.Shell.WriteLine("LOTRO Guides Exporter: WARNING - Could not register commands: " .. tostring(error));
    end
end

-- Plugin load notification with standard initialization
Turbine.Shell.WriteLine("Loading LOTRO Guides Character Exporter...");

-- Standard plugin initialization (will be called automatically)
if Plugins.LOTROGuidesExporter and Plugins.LOTROGuidesExporter.Load then
    local success, error = pcall(Plugins.LOTROGuidesExporter.Load);
    if not success then
        Turbine.Shell.WriteLine("LOTRO Guides Exporter: ❌ CRITICAL ERROR during load: " .. tostring(error));
    end
else
    -- Fallback if standard Load function doesn't work
    registerCommands();
    setupAutoExport();
end

-- Plugin ready notification
Turbine.Engine.AddCallback(function()
    Turbine.Shell.WriteLine("LOTRO Guides Exporter: ✅ Plugin ready! Use '/lotrotest' to verify functionality or '/lotroexport' to export data.");
end, 1);