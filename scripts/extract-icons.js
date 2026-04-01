/**
 * extract-icons.js
 * Extracts game icon PNGs from LotRO Companion ZIP archives and builds
 * an icon-ID lookup from the companion XML data.
 *
 * Usage:  node scripts/extract-icons.js
 * Input:  LotRO Companion /app/lib/*.zip  +  /app/data/lore/items.xml
 * Output: img/icons/items/*.png   — item icon PNGs (first layer only)
 *         img/icons/skills/*.png  — skill icon PNGs
 *         img/icons/traits/*.png  — trait icon PNGs
 *         img/icons/effects/*.png — effect icon PNGs
 *         data/lore/icon-map.json — itemId → iconId lookup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────
const COMPANION_BASE = process.env.LOTRO_COMPANION_PATH ||
  path.join(
    process.env.USERPROFILE || process.env.HOME,
    'OneDrive', 'Documents', 'The Lord of the Rings Online',
    'LotRO Companion', 'app'
  );
const LIB_DIR = path.join(COMPANION_BASE, 'lib');
const LORE_DIR = path.join(COMPANION_BASE, 'data', 'lore');
const ICONS_OUT = path.join(__dirname, '..', 'img', 'icons');
const DATA_OUT = path.join(__dirname, '..', 'data', 'lore');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── ZIP extraction using Node.js built-in (zlib + manual ZIP parsing) ──────
// We use PowerShell's Expand-Archive or a simple approach via child_process
// since the ZIPs are straightforward.

/**
 * Extract specific icon IDs from a ZIP file.
 * Writes a temp PowerShell script file to avoid command-line length limits
 * when thousands of IDs are involved.
 */
function extractSpecificIcons(zipPath, targetDir, iconIds) {
  if (!fs.existsSync(zipPath)) {
    console.warn(`  ⚠ ZIP not found: ${zipPath}`);
    return 0;
  }
  if (!iconIds.size) return 0;

  // Write the ID list to a temp file to avoid command-line length limits
  const tmpDir = path.join(__dirname, '..', '.tmp');
  ensureDir(tmpDir);
  const idFile = path.join(tmpDir, `ids-${path.basename(zipPath, '.zip')}.txt`);
  fs.writeFileSync(idFile, [...iconIds].join('\n'));

  const scriptFile = path.join(tmpDir, `extract-${path.basename(zipPath, '.zip')}.ps1`);
  const script = `
Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
$ids = @{}
Get-Content '${idFile.replace(/'/g, "''")}' | ForEach-Object { $ids[$_.Trim() + '.png'] = $true }
$count = 0
foreach ($entry in $zip.Entries) {
  if ($entry.Length -eq 0) { continue }
  if (-not $ids.ContainsKey($entry.Name)) { continue }
  $dest = Join-Path '${targetDir.replace(/'/g, "''")}' $entry.Name
  if (-not (Test-Path $dest)) {
    $stream = $entry.Open()
    $file = [System.IO.File]::Create($dest)
    $stream.CopyTo($file)
    $file.Close()
    $stream.Close()
    $count++
  }
}
$zip.Dispose()
Write-Output $count
`;
  fs.writeFileSync(scriptFile, script);

  try {
    const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
      encoding: 'utf8',
      timeout: 300000,
    }).trim();
    // Clean up temp files
    try { fs.unlinkSync(idFile); fs.unlinkSync(scriptFile); } catch (_) {}
    return parseInt(result) || 0;
  } catch (e) {
    console.error(`  ✗ Failed to extract from ${path.basename(zipPath)}: ${e.message}`);
    return 0;
  }
}

// ─── Parse item icon IDs from items.xml ─────────────────────────────────────
function buildItemIconMap() {
  console.log('  📦 Parsing item icon IDs from items.xml...');
  const fp = path.join(LORE_DIR, 'items.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ items.xml not found'); return {}; }

  const xml = fs.readFileSync(fp, 'utf8');
  const iconMap = {};  // itemId → first iconId (the main layer)
  const allIconIds = new Set();

  // Match item entries with icon attribute
  const re = /<item key="(\d+)"[^>]*icon="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const itemId = m[1];
    const iconParts = m[2].split('-');
    // First part is the main icon image
    const mainIcon = iconParts[0];
    if (mainIcon) {
      iconMap[itemId] = mainIcon;
      allIconIds.add(mainIcon);
    }
  }

  console.log(`    Found ${Object.keys(iconMap).length} items with icons (${allIconIds.size} unique icon images)`);
  return { iconMap, allIconIds };
}

// ─── Parse skill/trait/effect icon IDs ──────────────────────────────────────
function parseIconIds(filename, tagPattern) {
  const fp = path.join(LORE_DIR, filename);
  if (!fs.existsSync(fp)) return new Set();

  const xml = fs.readFileSync(fp, 'utf8');
  const ids = new Set();
  const re = new RegExp(tagPattern, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('🎨 Extracting game icons from LotRO Companion...');
  console.log(`   Source: ${LIB_DIR}`);

  // 1. Build item → icon mapping from items.xml
  const { iconMap, allIconIds } = buildItemIconMap();

  // 2. Extract item icons (only the ones we need)
  const itemIconDir = path.join(ICONS_OUT, 'items');
  ensureDir(itemIconDir);
  console.log(`  📂 Extracting ${allIconIds.size} item icons...`);
  const itemExtracted = extractSpecificIcons(
    path.join(LIB_DIR, 'itemIcons.zip'),
    itemIconDir,
    allIconIds
  );
  console.log(`    Extracted ${itemExtracted} new item icons`);

  // 3. Extract skill icons
  const skillIconIds = parseIconIds('skills.xml', /iconId="(\d+)"/);
  const skillIconDir = path.join(ICONS_OUT, 'skills');
  ensureDir(skillIconDir);
  console.log(`  📂 Extracting ${skillIconIds.size} skill icons...`);
  const skillExtracted = extractSpecificIcons(
    path.join(LIB_DIR, 'skillIcons.zip'),
    skillIconDir,
    skillIconIds
  );
  console.log(`    Extracted ${skillExtracted} new skill icons`);

  // 4. Extract trait icons
  const traitIconIds = parseIconIds('traits.xml', /iconId="(\d+)"/);
  const traitIconDir = path.join(ICONS_OUT, 'traits');
  ensureDir(traitIconDir);
  console.log(`  📂 Extracting ${traitIconIds.size} trait icons...`);
  const traitExtracted = extractSpecificIcons(
    path.join(LIB_DIR, 'traitIcons.zip'),
    traitIconDir,
    traitIconIds
  );
  console.log(`    Extracted ${traitExtracted} new trait icons`);

  // 5. Extract effect icons
  const effectIconIds = parseIconIds('effects.xml', /iconId="(\d+)"/);
  const effectIconDir = path.join(ICONS_OUT, 'effects');
  ensureDir(effectIconDir);
  console.log(`  📂 Extracting ${effectIconIds.size} effect icons...`);
  const effectExtracted = extractSpecificIcons(
    path.join(LIB_DIR, 'effectIcons.zip'),
    effectIconDir,
    effectIconIds
  );
  console.log(`    Extracted ${effectExtracted} new effect icons`);

  // 6. Extract virtue icons (from traitIcons — virtues are a trait subtype)
  // Virtues use trait icons too, parse them separately
  const virtueIconIds = parseIconIds('virtues.xml', /iconId="(\d+)"/);
  if (virtueIconIds.size) {
    const virtueIconDir = path.join(ICONS_OUT, 'virtues');
    ensureDir(virtueIconDir);
    console.log(`  📂 Extracting ${virtueIconIds.size} virtue icons...`);
    const virtueExtracted = extractSpecificIcons(
      path.join(LIB_DIR, 'traitIcons.zip'),
      virtueIconDir,
      virtueIconIds
    );
    console.log(`    Extracted ${virtueExtracted} new virtue icons`);
  }

  // 7. Write the icon map (itemId → iconId) for use by build.js
  ensureDir(DATA_OUT);
  fs.writeFileSync(
    path.join(DATA_OUT, 'icon-map.json'),
    JSON.stringify(iconMap)
  );
  const mapSize = (Buffer.byteLength(JSON.stringify(iconMap)) / 1024).toFixed(0);
  console.log(`\n✅ Icon extraction complete`);
  console.log(`   Item icons: ${itemExtracted} new (${allIconIds.size} total unique)`);
  console.log(`   Skill icons: ${skillExtracted} new (${skillIconIds.size} total)`);
  console.log(`   Trait icons: ${traitExtracted} new (${traitIconIds.size} total)`);
  console.log(`   Effect icons: ${effectExtracted} new (${effectIconIds.size} total)`);
  console.log(`   Icon map: ${mapSize} KB (${Object.keys(iconMap).length} item→icon entries)`);
  console.log(`   Output: ${ICONS_OUT}`);
}

main();
