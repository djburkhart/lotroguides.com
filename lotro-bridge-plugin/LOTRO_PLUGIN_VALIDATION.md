# LOTRO Plugin Auto-Loading Validation

## Plugin Compliance Check ✅

The `LOTROGuidesExporter.lua` plugin has been verified to meet all LOTRO auto-loading requirements:

### 1. Plugin Registration ✅
- **Plugin Metadata**: Properly registered in global `Plugins` table
- **Version Info**: Name, Author, Version, Description all defined
- **Namespace**: Uses `Plugins.LOTROGuidesExporter` format

### 2. Import Structure ✅
- **Core Imports**: `Turbine`, `Turbine.Gameplay`, `Turbine.UI` correctly imported
- **API Access**: Uses official Turbine APIs only
- **LocalPlayer**: Proper `LocalPlayer:GetInstance()` usage

### 3. Initialization Pattern ✅
- **Delayed Init**: Waits for LocalPlayer to be available before setup
- **Safe Loading**: Uses callback system to prevent load-time failures
- **Error Handling**: Wrapped in pcall to prevent crashes
- **retry Logic**: Automatically retries initialization if player not ready

### 4. Command Registration ✅
- **Command**: `/lotroexport` properly registered with Turbine.Shell
- **Help Text**: Short and detailed help provided
- **Function Binding**: Correctly bound to `manualExport()` function

### 5. Event Handling ✅
- **Level Change**: Auto-export on `player.LevelChanged` event
- **Safe Events**: Event handlers wrapped in pcall for crash prevention
- **Async Safety**: Uses delayed callbacks for safe execution

### 6. Auto-Loading Features ✅
- **Load Notification**: Plugin announces loading to chat
- **Success Message**: Confirms successful initialization with details
- **Account Detection**: Dynamic account/server identification
- **Path Creation**: Automatically creates export directories

## Installation Requirements

### File Placement
The plugin must be placed in:
```
C:\Users\[USER]\OneDrive\Documents\The Lord of the Rings Online\PluginData\[ACCOUNT]\AllServers\
```

### Expected Behavior
When placed correctly, LOTRO should:
1. **Auto-Load**: Load plugin automatically on character login
2. **Chat Message**: Display "Loading LOTRO Guides Character Exporter..." 
3. **Success Message**: Show detailed initialization info after 2-5 seconds
4. **Command Available**: `/lotroexport` command should be functional
5. **Auto-Export**: Character data exported on level changes

## Validation Steps

### Step 1: Installation Validation
1. Place `LOTROGuidesExporter.lua` in AllServers folder
2. Start LOTRO and log into a character
3. Check chat for loading message within 10 seconds

### Step 2: Command Validation  
1. Type `/lotroexport` in chat
2. Should see "Character data exported successfully" message
3. Check for JSON file in: `Documents\LOTROGuides\Accounts\[SERVER_CHARACTER]\`

### Step 3: Auto-Export Validation
1. Gain experience to trigger level change (or use test character)
2. Should see auto-export message in chat
3. Verify JSON file timestamp updates

### Step 4: Path Validation
1. Check that export directory is created automatically
2. Verify `plugin_installed.txt` marker file exists
3. Confirm `character.json` contains valid data

## Troubleshooting

### Plugin Not Loading
- **Check File Location**: Ensure exact path: `AllServers\LOTROGuidesExporter.lua`
- **Case Sensitivity**: Verify filename exactly matches
- **Account Folder**: Use correct account name (e.g., `aaxxis`)
- **File Permissions**: Ensure LOTRO can read the file

### No Chat Messages
- **Player Ready**: Plugin waits for LocalPlayer - may take 2-5 seconds
- **Chat Filter**: Check if system messages are filtered
- **Error State**: Plugin may have failed - check for syntax errors

### Command Not Found
- **Initialization**: Plugin may not have completed setup
- **Command Format**: Use exact command: `/lotroexport` (lowercase)
- **Player State**: Must be logged into character, not at character select

### Auto-Export Not Working
- **Event Setup**: Requires successful plugin initialization first
- **Level Changes**: Only triggers on actual level changes
- **Manual Test**: Use `/lotroexport` to test export function

## Plugin Architecture

### Initialization Flow
```
Plugin Load → Wait for LocalPlayer → Initialize Paths → Setup Events → Register Commands → Ready
```

### Safety Features
- **Graceful Degradation**: Falls back to timestamp-based account ID if player data unavailable
- **Error Recovery**: All major functions wrapped in pcall
- **Retry Mechanism**: Automatically retries initialization until player ready
- **Directory Creation**: Automatically creates required export directories

### Data Export
- **Player Data**: Character name, level, class, race, server
- **Equipment**: Currently equipped items and stats
- **Inventory**: All inventory items with properties
- **Skills**: Active skills and levels
- **Format**: Clean JSON for easy web import

## Browser Extension Integration

The plugin works in conjunction with the browser extension:
1. **Extension Detection**: Monitors for AllServers folder changes
2. **Auto-Install**: Downloads and places plugin automatically
3. **Account Sync**: Matches browser account to LOTRO account
4. **Data Bridge**: Automatically imports exported character data

## Version History

### v1.1.0 (Current)
- Added proper LOTRO plugin registration
- Implemented delayed initialization for LocalPlayer readiness
- Enhanced error handling and recovery
- Added comprehensive auto-loading support
- Improved account detection and path management

### v1.0.0
- Initial implementation
- Basic character data export
- Manual command support