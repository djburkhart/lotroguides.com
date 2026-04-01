# LOTRO Guides Bridge Plugin

This is the in-game LOTRO plugin that extracts character data using official Turbine.Gameplay APIs for seamless integration with lotroguides.com.

## Features

- **Official API Usage**: Uses only supported Turbine.Gameplay APIs
- **Auto-Loading**: Automatically loads without manual plugin panel activation
- **Safe Extraction**: No memory manipulation or game client modification
- **Comprehensive Data**: Extracts stats, equipment, class-specific data, and more
- **Auto Export**: Automatically exports data on level changes and login
- **Manual Control**: Provides `/lotroexport` command for on-demand exports
- **JSON Format**: Exports in standard JSON format for easy consumption
- **Account-Specific**: Installs per LOTRO account for proper data isolation

## Installation

### Automatic (via Browser Extension) ⭐ **Recommended**

The LOTRO Guides browser extension automatically handles installation:

1. Install the [LOTRO Character Bridge extension](https://github.com/lotroguides/browser-extension)
2. Click "Install Bridge Plugin" on the lotroguides.com editor page  
3. Copy the downloaded `LOTROGuidesExporter.lua` file to your **AllServers** folder:
   ```
   Documents\The Lord of the Rings Online\PluginData\[YOUR_ACCOUNT]\AllServers\
   ```
4. Restart LOTRO - the plugin will auto-load without manual activation!

### Manual Installation

1. Download `LOTROGuidesExporter.lua` from this repository
2. Navigate to your LOTRO account folder:
   ```
   Documents\The Lord of the Rings Online\PluginData\[YOUR_ACCOUNT]\AllServers\
   ```
3. Copy the plugin file to the AllServers folder
4. Restart LOTRO
5. The plugin auto-loads and enables itself automatically

> **Important**: Use the **AllServers** folder, not the Plugins folder. AllServers ensures the plugin loads automatically for all characters on your account without requiring manual activation in the plugin panel.

## Usage

### Automatic Mode

Once installed, the plugin automatically:
- Exports character data when you log in (after 2 second delay)
- Exports updated data when your character levels up
- Saves data to: `Documents\LOTROGuides\character.json`

### Manual Export

You can manually trigger an export anytime:

```
/lotroexport
```

### Plugin Diagnostics

If you're experiencing issues, test the plugin functionality:

```
/lotrotest
```

This command is useful for:
- Getting fresh data after equipment changes  
- Exporting data after completing quests
- **Testing if the plugin is working correctly**
- **Diagnosing installation or permission issues**
- Triggering export before using the browser extension

### Expected Behavior

When the plugin loads successfully, you'll see these chat messages:

```
Loading LOTRO Guides Character Exporter...
LOTRO Guides Exporter: Player detected, initializing...
===================================
LOTRO Guides Exporter v1.1.0 loaded
Account ID: [SERVER]_[CHARACTER]
Export Path: Documents\LOTROGuides\Accounts\[ACCOUNT]
Commands: '/lotroexport' (export) | '/lotrotest' (test)
Auto-export enabled for level changes
===================================
LOTRO Guides Exporter: ✅ Initial character data export completed
LOTRO Guides Exporter: ✅ Plugin ready! Use '/lotrotest' to verify functionality or '/lotroexport' to export data.
```

### Plugin Compatibility & Diagnostics

The `/lotrotest` command now includes comprehensive API compatibility testing:

```
=== LOTRO Guides Plugin Debug Test ===
✅ Player found: YourCharacter
✅ Server: YourServer
✅ Level: 150
--- API Compatibility Test ---
✅ GetClassDisplayName available: Hunter
✅ GetRaceDisplayName available: Elf
✅ Equipment API working - found head slot item
✅ Attributes API working - Might: 2500
✅ Paths initialized successfully
✅ Export directory created/verified
✅ Full character export successful!
=== Test Complete ===
```

**If you see ⚠️ or ❌ messages**: Your LOTRO version may not support all APIs. The plugin will work with fallback methods, but some data may be limited.

## Exported Data Structure

```json
{
  "version": "1.0.0",
  "source": "lotro-bridge-plugin", 
  "extractedAt": "2026-03-31T12:00:00Z",
  "characters": [{
    "name": "CharacterName",
    "level": 150,
    "class": "Hunter",
    "race": "Elf",
    "server": "Evernight",
    "extractedAt": "2026-03-31T12:00:00Z",
    "stats": {
      "might": 2500,
      "agility": 2800,
      "vitality": 2200,
      "will": 1800,
      "fate": 1900,
      "morale": 45000,
      "power": 12000,
      "armour": 15000
    },
    "money": 1234567,
    "resistances": {
      "disease": 95.5,
      "fear": 87.2,
      "poison": 91.8,
      "wound": 89.1
    },
    "equipment": {
      "head": {
        "name": "Crown of the King",
        "quality": 8,
        "level": 150,
        "slot": 1
      }
      // ... other equipped items
    },
    "classData": {
      "focus": 350,
      "stance": 1
      // ... class-specific attributes
    },
    "raceData": {
      // ... race-specific attributes
    }
  }]
}
```

## Class-Specific Data

### Hunter
- `focus`: Current focus points
- `stance`: Current stance (Strength/Endurance/Precision)

### Guardian  
- `stance`: Current stance (Overwatch/Block/Parry)
- Block and parry tier availability

### Champion
- `fervor`: Current fervor level  
- `stance`: Current stance (Fervour/Glory/Ardour)

### Beorning
- `wrath`: Current wrath level
- `isInBearForm`: Whether currently in bear form

### Other Classes
- Additional class-specific attributes as available via API

## Technical Details

### Standard LOTRO Plugin Architecture

This plugin follows established LOTRO plugin patterns:

- **Single File**: `LOTROGuidesExporter.lua` contains all functionality
- **AllServers Installation**: Auto-loads for all characters on the account
- **Official APIs Only**: Uses only supported `Turbine.*` APIs
- **Auto-Enable**: Bypasses manual plugin panel activation
- **Account-Specific**: Installs per LOTRO account for proper data isolation

### File Structure

```
PluginData/
└── [ACCOUNT_NAME]/
    └── AllServers/
        └── LOTROGuidesExporter.lua  ← Plugin file (auto-loads)

Documents/
└── LOTROGuides/
    └── Accounts/
        └── [ACCOUNT_ID]/
            ├── character.json           ← Character data  
            ├── character.json.ready     ← Ready flag
            └── export_status.json       ← Export metadata
```

### Auto-Enable Technology

The plugin includes **auto-enable functionality** that works like established plugins:

```lua
-- Plugin registration (standard pattern)
if (Plugins == nil) then Plugins = {}; end
Plugins.LOTROGuidesExporter = {
    Name = "LOTRO Guides Character Exporter",
    Author = "LotroGuides.com", 
    Version = "1.1.0",
    AutoEnabled = true,
    LoadOnStartup = true
};

-- Force enablement (bypasses manual activation)
if (Turbine.PluginManager) then
    Turbine.PluginManager.SetPluginEnabled("LOTROGuidesExporter", true);
end
```

### APIs Used

**Core Player APIs** (SSG U24 Documentation Compliant):
- `Turbine.Gameplay.LocalPlayer.GetInstance()`: Gets current player
- `LocalPlayer:GetName()`: Character name  
- `LocalPlayer:GetLevel()`: Character level
- `LocalPlayer:GetClassDisplayName()`: Reliable class name (e.g., "Hunter", "Guardian") 
- `LocalPlayer:GetRaceDisplayName()`: Reliable race name (e.g., "Elf", "Man")
- `LocalPlayer:GetWorldName()`: Server name

**Attribute APIs**:
- `LocalPlayer:GetAttributes()`: Core character stats
- `Attributes:GetMight/Agility/Vitality/Will/Fate()`: Primary stats
- `Attributes:GetMorale/MaxMorale/Power/MaxPower()`: Health and power
- `Attributes:GetPhysicalMastery/TacticalMastery()`: Combat effectiveness
- `Attributes:GetCriticalRating/Finesse()`: Combat stats
- `Attributes:GetArmour()`: Armor value
- `Attributes:GetMoney()`: Character wealth

**Class-Specific APIs**:
- `LocalPlayer:GetClassAttributes()`: Class-specific data
- Hunter: `GetFocus()`, `GetStance()`
- Guardian: `GetStance()`, `GetBlock()`  
- Champion: `GetFervor()`, `GetStance()`
- Beorning: `GetWrath()`, `IsInBearForm()`
- Minstrel: `GetBallads()`
- Lore-master: `GetAttunement()`
- Captain: `GetDefeat()`

**Equipment APIs**:
- `LocalPlayer:GetEquipment()`: Equipment container
- `Equipment:GetItem(slot)`: Item in specific slot (1-18)
- `Item:GetName/GetQuality/GetItemLevel()`: Item properties
- `Item:GetCategory/GetSubCategory()`: Item classification
- `Item:GetDurability/GetMaxDurability()`: Item condition

**Resistance APIs**:
- `Attributes:GetDiseaseResistance()`: Disease immunity
- `Attributes:GetFearResistance()`: Fear immunity  
- `Attributes:GetPoisonResistance()`: Poison immunity
- `Attributes:GetWoundResistance()`: Wound immunity

All APIs use safe access patterns with `pcall()` to prevent crashes on version incompatibilities.

### File Locations

- **Plugin Installation**: `Documents\The Lord of the Rings Online\PluginData\[ACCOUNT]\AllServers\LOTROGuidesExporter.lua`
- **Export Data**: `Documents\LOTROGuides\Accounts\[ACCOUNT_ID]\character.json`
- **Ready Flag**: `Documents\LOTROGuides\Accounts\[ACCOUNT_ID]\character.json.ready`
- **Export Status**: `Documents\LOTROGuides\Accounts\[ACCOUNT_ID]\export_status.json`

### Why AllServers?

- **Auto-Loading**: LOTRO automatically loads plugins from AllServers folder
- **No Manual Activation**: Eliminates need for plugin panel interaction
- **Standard Practice**: Same approach used by popular plugins (BuffBars, TitanBar)
- **Account-Specific**: Each LOTRO account maintains separate plugin instances
- **Cross-Character**: Active for all characters on the account automatically

### Error Handling

The plugin includes comprehensive error handling:
- Safe API access with pcall() wrappers
- Graceful fallbacks for missing data
- Detailed error messages in LOTRO console
- Automatic directory creation for export files

## Troubleshooting

### Plugin Not Loading

1. **Check File Location**: Ensure `LOTROGuidesExporter.lua` is in the correct AllServers folder:
   ```
   Documents\The Lord of the Rings Online\PluginData\[YOUR_ACCOUNT]\AllServers\
   ```
2. **Verify Account Name**: Make sure you're using the correct account folder (check other folders if unsure)
3. **Restart LOTRO**: Plugin loads during client startup
4. **Check Chat Messages**: Look for plugin loading messages:
   ```
   Loading LOTRO Guides Character Exporter...
   LOTRO Guides Exporter: Auto-enabled successfully
   ```
5. **Enable Lua Plugins**: In LOTRO, go to Options → UI Settings → Plugin Options and ensure plugins are enabled

### Auto-Enable Not Working

- Plugin will still function normally even if auto-enable fails
- Look for "Auto-enable attempted" message in chat
- You can manually enable via plugin panel as backup
- Check that LOTRO allows plugin modifications

### No Export File Generated

1. **Check Plugin Loading**: Look for loading messages in chat
2. **Run Manual Export**: Use `/lotroexport` command to test functionality
3. **Verify Paths**: Check that export folder exists: `Documents\LOTROGuides\Accounts\[ACCOUNT]`
4. **Character State**: Ensure you're logged into a character (not at character select)
5. **File Permissions**: Verify LOTRO can write to Documents folder

### Browser Extension Issues

1. **Export First**: Run `/lotroexport` in LOTRO before using browser extension
2. **Check Recent Data**: Extension looks for character data exported within last 5-30 minutes
3. **Account Matching**: Ensure browser extension detects correct LOTRO account folder
4. **File Timing**: Export timestamp must be recent for extension to use the data

### Compatibility Issues

- **Other Plugins**: Compatible with all popular LOTRO plugins
- **LOTRO Updates**: Uses only stable APIs, unaffected by client updates
- **Multiple Accounts**: Each account operates independently
- **Server Changes**: Works on all LOTRO servers

## Support

For issues, follow these steps in order:

### **Step 1: Run Plugin Diagnostics** ⭐ **Start Here**
```
/lotrotest
```
This command tests all plugin functionality and reports specific errors. Look for:
- ❌ **ERROR** messages = something is broken
- ⚠️  **WARNING** messages = may cause issues but plugin can work
- ✅ **Success** messages = everything working correctly

### **Step 2: Basic Troubleshooting**
1. **Check Installation**: Verify plugin is in correct AllServers location
2. **Test Manual Export**: Use `/lotroexport` command to test functionality  
3. **Check Chat Messages**: Look for error messages in LOTRO chat log
4. **Restart LOTRO**: Close and restart LOTRO completely

### **Step 3: Advanced Issues**
- **Browser Extension**: Visit the [extension repository](https://github.com/lotroguides/browser-extension) for web-side troubleshooting
- **File Permissions**: Ensure LOTRO can write to your Documents folder
- **Path Issues**: Check that your Documents folder isn't redirected/corrupted

## Contributing

This plugin follows established LOTRO plugin development patterns:

1. **Official APIs Only**: Use only `Turbine.*` APIs for compatibility
2. **Standard Structure**: Follow AllServers installation pattern
3. **Auto-Enable Support**: Maintain compatibility with auto-loading
4. **Test Compatibility**: Ensure compatibility with common plugin combinations
5. **Document Changes**: Update README and inline code comments

### Development Guidelines

- Use `pcall()` for all API calls to prevent crashes
- Follow existing code style and naming conventions 
- Add error handling for all file operations
- Test with multiple character classes and servers
- Verify compatibility with other popular plugins
## License

MIT License - free to use, modify, and distribute

## Version History

### 1.1.0 (Current Release)
- **SSG Documentation Compliance**: Updated all API usage to follow official SSG U24 documentation patterns
- **Improved Class/Race Detection**: Use GetClassDisplayName and GetRaceDisplayName for reliable identification
- **Enhanced Equipment API**: Fixed slot mapping and added additional item properties (durability, category)
- **Extended Stats Collection**: Added Physical/Tactical Mastery, Critical Rating, Finesse, Max Morale/Power
- **Comprehensive API Testing**: New `/lotrotest` command with compatibility validation
- **Robust File Operations**: Improved directory creation and path handling for all Windows configurations
- **Class-Specific Data**: Enhanced support for all classes (Hunter, Guardian, Champion, Beorning, Minstrel, Lore-master, Captain)
- **Standard Plugin Structure**: Follows official LOTRO plugin patterns for maximum compatibility
- **AllServers Installation**: Standard LOTRO plugin auto-loading pattern
- **Account-Specific Paths**: Proper multi-account data isolation

### 1.0.0 (Initial Release)
- Basic character data extraction
- All major stats and attributes  
- Equipment information
- Class and race specific data
- Auto-export functionality
- Manual export command