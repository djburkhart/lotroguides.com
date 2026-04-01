# LOTRO Character Bridge Extension

A browser extension that seamlessly bridges character data from Lord of the Rings Online to lotroguides.com.

## Features

- **Automatic Detection**: Detects running LOTRO client
- **Plugin Management**: Auto-installs bridge plugin as needed
- **Real-time Extraction**: Extracts character data directly from game using official Lua APIs
- **Secure Integration**: Works with lotroguides.com's existing Google Drive sync
- **Zero Configuration**: Works out of the box with minimal user setup

## Installation

### For Users

1. Download the extension from [Chrome Web Store / Firefox Add-ons]
2. Visit [lotroguides.com](https://lotroguides.com) and sign in
3. Navigate to "My Characters" tab
4. Click "Import from Game" - the extension will handle the rest!

### For Developers

1. Clone this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `extension` directory
5. The extension will appear in your extensions list

## How It Works

### Architecture

```
LOTRO Game Client
    ↓ (Lua API)
Bridge Plugin (Auto-installed)
    ↓ (JSON Export)
Browser Extension
    ↓ (postMessage API)
lotroguides.com
    ↓ (Google Drive API)
Cloud Storage
```

### Data Flow

1. Extension detects LOTRO client running
2. Bridge plugin is auto-installed to LOTRO plugins directory
3. Plugin extracts character data using official Turbine.Gameplay APIs
4. Extension reads exported data and passes to website
5. Website processes and syncs data to Google Drive

### Bridge Plugin

The LOTRO bridge plugin (`LOTROGuidesExporter.lua`) is minimal and uses only official APIs:

```lua
local player = Turbine.Gameplay.LocalPlayer.GetInstance()
local attrs = player:GetAttributes()
-- Extract character data safely
```

## Security

- **No Memory Hacking**: Uses only official LOTRO Lua APIs
- **Private Storage**: Character data stored in Google Drive app folder
- **Minimal Permissions**: Extension only accesses lotroguides.com domain
- **Open Source**: Full transparency of data handling

## Permissions

- `activeTab`: Communicate with lotroguides.com tabs
- `storage`: Cache extension state and preferences
- `nativeMessaging`: Future support for direct LOTRO integration

## Supported Data

- Character basics (name, level, class, race, server)
- Core stats (Might, Agility, Vitality, Will, Fate, Morale, Power)
- Equipment and inventory
- Money and currencies
- Class-specific attributes (Focus, Fervor, etc.)
- Quest progress
- Crafting professions

## Troubleshooting

### Extension Not Working

1. Ensure LOTRO is running and you're logged into a character
2. Check extension popup for status indicators
3. Try refreshing lotroguides.com
4. Disable and re-enable extension

### Bridge Plugin Issues

1. Check LOTRO plugins directory: `Documents\The Lord of the Rings Online\Plugins\`
2. Look for `LOTROGuidesExporter` folder
3. Restart LOTRO if plugin was just installed
4. Check LOTRO plugin manager for any errors

### Data Not Syncing

1. Ensure you're signed into Google account on lotroguides.com
2. Grant Google Drive permissions when prompted
3. Check internet connection
4. Try manual sync button in "My Characters" tab

## Development

### Building from Source

```bash
# Navigate to extension directory
cd extension

# No build process needed - extension uses vanilla JavaScript
# Load directly in browser for development
```

### Testing

1. Load extension in developer mode
2. Open browser console for debugging
3. Visit lotroguides.com with LOTRO running
4. Test import functionality

### File Structure

```
extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (LOTRO detection)
├── content.js            # Injected into lotroguides.com
├── bridge.js             # Page context bridge
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
└── icons/                # Extension icons
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with LOTRO client
5. Submit pull request

## License

MIT License - see LICENSE file for details

## Support

- Report issues on [GitHub Issues](https://github.com/yourrepo/issues)
- Join discussion on [LOTRO Interface Forums](https://www.lotrointerface.com)
- Email support: support@lotroguides.com

## Version History

### 1.0.0 (Initial Release)
- Basic character data extraction
- Auto-installing bridge plugin
- Google Drive integration
- Chrome/Edge support