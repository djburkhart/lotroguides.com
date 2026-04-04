const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const sharp = require('sharp');
const esbuild = require('esbuild');
require('dotenv').config();

// ─── Configuration ──────────────────────────────────────────────────────────
const CONTENT_DIR = path.join(__dirname, 'content');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const OUTPUT_DIR = __dirname; // Output into lotro/ root
const ASSETS_PREFIX = '';   // Relative path to parent theme assets
const SITE_BASE_URL = 'https://lotroguides.com';
const GOOGLE_ADSENSE_ACCOUNT = process.env.GOOGLE_ADSENSE_ACCOUNT || '';
const GOOGLE_ANALYTICS_ID = process.env.GOOGLE_ANALYTICS_ID || '';
const GOOGLE_TAG_MANAGER_ID = process.env.GOOGLE_TAG_MANAGER_ID || '';
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const EDITOR_ALLOWED_EMAILS = process.env.EDITOR_ALLOWED_EMAILS || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const CDN_UPLOAD_URL = process.env.CDN_UPLOAD_URL || '';
const GOOGLE_SEARCH_CONSOLE_VERIFICATION = process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION || '';
const CUSDIS_APP_ID = process.env.CUSDIS_APP_ID || '';
const CUSDIS_HOST = process.env.CUSDIS_HOST || 'https://cusdis.com';
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';
// CDN base URL for large binary assets (basemaps ~34 MB, icons ~72 MB).
// Set to your DO Spaces CDN endpoint, e.g. https://lotroguides.nyc3.cdn.digitaloceanspaces.com
// Leave blank to serve from the site origin (local/dev).
// Disabled in --watch / --local mode so localhost builds use local files.
const LOCAL_MODE = process.argv.includes('--watch') || process.argv.includes('--local');
const CDN_URL = LOCAL_MODE ? '' : (process.env.DO_CDN_URL || '').replace(/\/$/, '');
const LORE_DIR = path.join(__dirname, 'data', 'lore');
const MEDIA_VIDEOS_PATH = path.join(CONTENT_DIR, 'media', 'videos.json');
const NAVIGATION_PATH = path.join(CONTENT_DIR, 'navigation.json');
const DPS_REFERENCE_PATH = path.join(CONTENT_DIR, 'stats', 'dps-reference.json');
const INSTANCE_LOOT_REFERENCE_PATH = path.join(CONTENT_DIR, 'instances', 'loot-reference.json');

// ─── Lore / Item Index ─────────────────────────────────────────────────────
let itemIndex = {};
let iconMap = {};
let questIndex = {};
let mapMarkerIndexCache = null;
let dpsReferenceCache = null;
let instanceLootReferenceCache = null;
let questDbCache = null;   // keyed by id
let deedDbCache = null;    // keyed by id

function loadInstanceLootReferenceConfig() {
  if (instanceLootReferenceCache) return instanceLootReferenceCache;

  if (!fs.existsSync(INSTANCE_LOOT_REFERENCE_PATH)) {
    instanceLootReferenceCache = {};
    return instanceLootReferenceCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(INSTANCE_LOOT_REFERENCE_PATH, 'utf8'));
    instanceLootReferenceCache = parsed && typeof parsed === 'object' ? parsed : {};
    return instanceLootReferenceCache;
  } catch (err) {
    console.warn(`   ⚠ Failed to parse instance loot reference JSON: ${err.message}`);
    instanceLootReferenceCache = {};
    return instanceLootReferenceCache;
  }
}

function loadDpsReferenceConfig() {
  if (dpsReferenceCache) return dpsReferenceCache;

  const fallback = {
    levelCap: 160,
    title: 'Desired Stat Percentages (Raid Targets)',
    intro: 'Quick offensive targets for DPS-oriented builds.',
    tableColumns: ['Stat', 'T1 Target', 'T2 Target', 'T3+ Target'],
    curves: {
      mastery: { hardCap: 200, targetCap: 6.0, ratingByLevel: { '150': 450000, '160': 900000 } },
      criticalHit: { hardCap: 25, targetCap: 0.75, ratingByLevel: { '150': 450000, '160': 900000 } },
      devastateHit: { hardCap: 10, targetCap: 0.3, ratingByLevel: { '150': 600000, '160': 1200000 } },
      finesse: { hardCap: 50, targetCap: 1.5, ratingByLevel: { '150': 300000, '160': 600000 } },
      lightMitigation: { hardCap: 40, targetCap: 1.2, ratingByLevel: { '150': 200000, '160': 400000 } },
      mediumMitigation: { hardCap: 50, targetCap: 1.5, ratingByLevel: { '150': 250000, '160': 500000 } },
      heavyMitigation: { hardCap: 60, targetCap: 1.8, ratingByLevel: { '150': 300000, '160': 600000 } },
    },
    tableRows: [
      { stat: 'Physical Mastery', curve: 'mastery', t1: '**200%+**', t2: '**210%+**', t3: '**220%+**' },
      { stat: 'Critical Rating', curve: 'criticalHit', t1: '**28%+**', t2: '**30%+**', t3: '**33%+**' },
      { stat: 'Devastating Hits', curve: 'devastateHit', t1: '**8%+**', t2: '**9%+**', t3: '**10%+**' },
      { stat: 'Finesse', curve: 'finesse', t1: '**35%-40%**', t2: '**40%-45%**', t3: '**45%-50%**' },
      { stat: 'Tactical Mitigation', curve: 'lightMitigation', t1: '**40%-45%**', t2: '**45%-50%**', t3: '**50%-55%**' },
      { stat: 'Physical Mitigation', curve: 'mediumMitigation', t1: '**40%-45%**', t2: '**45%-50%**', t3: '**50%-55%**', note: 'Physical Mitigation cap varies by armor type: Light 40%, Medium 50%, Heavy 60%.' },
    ],
  };

  if (!fs.existsSync(DPS_REFERENCE_PATH)) {
    dpsReferenceCache = fallback;
    return dpsReferenceCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DPS_REFERENCE_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      dpsReferenceCache = fallback;
      return dpsReferenceCache;
    }

    dpsReferenceCache = {
      levelCap: parsed.levelCap || fallback.levelCap,
      title: parsed.title || fallback.title,
      intro: parsed.intro || fallback.intro,

      tableColumns: Array.isArray(parsed.tableColumns) ? parsed.tableColumns : fallback.tableColumns,
      curves: (parsed.curves && typeof parsed.curves === 'object') ? parsed.curves : fallback.curves,
      tableRows: Array.isArray(parsed.tableRows) ? parsed.tableRows : fallback.tableRows,
    };
    return dpsReferenceCache;
  } catch (err) {
    console.warn(`   ⚠ Failed to parse DPS reference JSON: ${err.message}`);
    dpsReferenceCache = fallback;
    return dpsReferenceCache;
  }
}

function buildDpsReferenceMarkdownTable() {
  const dpsRef = loadDpsReferenceConfig();
  return buildDpsTableHtml(dpsRef);
}

/**
 * Build an HTML table from DPS reference config, with optional overrides.
 */
function buildDpsTableHtml(dpsRef, overrides) {
  const cfg = Object.assign({}, dpsRef, overrides || {});
  const rows = Array.isArray(cfg.tableRows) ? cfg.tableRows : [];
  const curves = cfg.curves || {};
  const levelCap = cfg.levelCap || 150;
  const hasCurves = Object.keys(curves).length > 0 && rows.some(r => r.curve);
  if (!rows.length) return '';

  // Convert inline markdown bold/italic to HTML
  const mdInline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const fmtNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Build columns: add Cap and Rating when curve data is available
  const cols = hasCurves
    ? ['Stat', '% Cap', `Rating (L${levelCap})`, 'T1 Target', 'T2 Target', 'T3+ Target']
    : (Array.isArray(cfg.tableColumns) ? cfg.tableColumns : []);
  if (cols.length < 2) return '';

  const levelNote = levelCap ? `<p><em>Level Cap: ${levelCap}</em></p>\n` : '';
  const headerCells = cols.map(c => `<th>${c}</th>`).join('');
  const notes = [];

  const bodyRows = rows.map(r => {
    if (r.note) notes.push(r.note);

    if (hasCurves) {
      const curve = r.curve && curves[r.curve] ? curves[r.curve] : null;
      const capVal = curve ? curve.hardCap + '%' : '';
      const ratingVal = (() => {
        if (!curve) return '';
        const rbl = curve.ratingByLevel || {};
        const rLevel = rbl[String(levelCap)];
        return rLevel ? fmtNum(rLevel) : '\u2014';
      })();
      const vals = [String(r.stat || ''), capVal, ratingVal, String(r.t1 || ''), String(r.t2 || ''), String(r.t3 || '')];
      return `<tr>${vals.map(v => `<td>${mdInline(v)}</td>`).join('')}</tr>`;
    } else {
      const fallbackCols = Array.isArray(cfg.tableColumns) ? cfg.tableColumns : [];
      const vals = [String(r.stat || ''), String(r.t1 || ''), String(r.t2 || ''), String(r.t3 || '')].slice(0, fallbackCols.length);
      return `<tr>${vals.map(v => `<td>${mdInline(v)}</td>`).join('')}</tr>`;
    }
  }).join('\n');

  const notesHtml = notes.length ? `\n<p class="text-muted small m-t-5"><em>${notes.join('<br>')}</em></p>` : '';

  return levelNote
    + `<table class="table table-striped table-condensed m-b-10">\n<thead><tr>${headerCells}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`
    + notesHtml;
}

/**
 * Load consumables reference config from content/stats/consumables-reference.json
 */
let consumablesReferenceCache = null;
function loadConsumablesReferenceConfig() {
  if (consumablesReferenceCache) return consumablesReferenceCache;
  const cfgPath = path.join(__dirname, 'content', 'stats', 'consumables-reference.json');
  const fallback = { title: 'Recommended Consumables', tableColumns: ['Consumable', 'Example', 'Purpose'], items: [] };
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const parsed = JSON.parse(raw);
    consumablesReferenceCache = Object.assign({}, fallback, parsed);
    return consumablesReferenceCache;
  } catch (err) {
    consumablesReferenceCache = fallback;
    return consumablesReferenceCache;
  }
}

/**
 * Build an HTML table from consumables reference config.
 * @param {Object} overrides - { items: 'food,trail,battle,...', heading: 'Custom Heading', notes: ['note1', ...] }
 */
function buildConsumablesTableHtml(overrides) {
  const cfg = loadConsumablesReferenceConfig();
  const heading = (overrides && overrides.heading) || cfg.title || '';
  let items = cfg.items || [];

  // Filter items by key if specified
  if (overrides && overrides.items) {
    const keys = overrides.items.split('+').map(k => k.trim().toLowerCase());
    items = items.filter(it => keys.indexOf(it.key) !== -1);
    // Preserve requested order
    items.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  }

  if (!items.length) return '';

  // Parse per-item note overrides: key=note pairs in overrides.notes string
  const noteOverrides = {};
  if (overrides && overrides.notes) {
    overrides.notes.split('|').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq > 0) noteOverrides[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    });
  }

  const cols = cfg.tableColumns || ['Consumable', 'Example', 'Purpose'];
  const headingHtml = heading ? `<p><strong>${heading}</strong></p>\n` : '';
  const headerCells = cols.map(c => `<th>${c}</th>`).join('');

  const bodyRows = items.map(it => {
    const purpose = noteOverrides[it.key] || it.purpose || '';
    return `<tr><td>${it.consumable || ''}</td><td>${it.example || ''}</td><td>${purpose}</td></tr>`;
  }).join('\n');

  return headingHtml
    + `<table class="table table-striped table-condensed m-b-10">\n<thead><tr>${headerCells}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`;
}

/**
 * Resolve {{consumableTable}} and {{consumableTable:...}} tokens in HTML.
 */
function resolveConsumableTokens(html) {
  html = html.replace(/<p>\s*(\{\{consumableTable(?::[^}]*)?\}\})\s*<\/p>/gi, '$1');
  return html.replace(/\{\{consumableTable(?::([^}]*))?\}\}/g, function (_, optStr) {
    const overrides = {};
    if (optStr) {
      optStr.split(',').forEach(function (pair) {
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const key = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (key === 'items') overrides.items = val;
        else if (key === 'heading') overrides.heading = val;
        else if (key === 'notes') overrides.notes = val;
      });
    }
    return buildConsumablesTableHtml(overrides);
  });
}

function buildInstanceLootReferenceMarkdown(slug) {
  const refs = loadInstanceLootReferenceConfig();
  const entry = refs[slug];
  if (!entry) return '';

  const lines = [];

  if (entry.levelRange || entry.groupSize) {
    const meta = [];
    if (entry.levelRange) meta.push(`Level Range: ${entry.levelRange}`);
    if (entry.groupSize) meta.push(`Group Size: ${entry.groupSize}`);
    lines.push(`> ${meta.join(' | ')}`);
  }

  if (entry.notes) {
    lines.push('');
    lines.push(entry.notes);
  }

  // Insert a placeholder that survives marked() + autolinkers;
  // the real accordion HTML is injected later by expandLootAccordionPlaceholders()
  const bosses = Array.isArray(entry.bosses) ? entry.bosses : [];
  if (bosses.length) {
    lines.push('');
    lines.push(`<!--LOTRO_LOOT_ACCORDION:${slug}-->`);
  }

  return lines.join('\n');
}

/**
 * When instance-loot.json has no dedicated boss entity (the chest name was used as the
 * "boss" name), extract the real boss name and a tier label from the chest label.
 * Returns { boss: string|null, tier: string }
 *   boss  – extracted entity name to group under (null = no grouping, keep label as-is)
 *   tier  – short label for the chest sub-header within the group
 */
function extractBossFromChestLabel(label) {
  let m;
  // Pattern: "[The] X['s|'] [TypeWord(s)] Chest - (Solo|Tier X[+]) N"
  // e.g. "The Bloody Warden's Chest - Solo 1" → boss="The Bloody Warden", tier="Solo"
  //      "Arena Champion's Chest - Tier 2 3"  → boss="Arena Champion",    tier="Tier 2"
  m = label.match(/^(.+?)['\u2019]s?\s+.*?Chest\s*[-\u2013]\s*(Solo|Tier\s*[\d+]+)\s*\d*\s*$/i);
  if (m) return { boss: m[1].trim(), tier: m[2].trim() };

  // Pattern: "[The] X's [NonChestType] - (Solo|Tier X) N"
  // e.g. "Ragrekhûl's Spoils - Solo 1", "Bombadil's Gift - Tier 1 2"
  m = label.match(/^(.+?)['\u2019]s?\s+\w+\s*[-\u2013]\s*(Solo|Tier\s*[\d+]+)\s*\d*\s*$/i);
  if (m) return { boss: m[1].trim(), tier: m[2].trim() };

  // Pattern: "Chest of [the] X - (Solo|Tier X) N"
  // e.g. "Chest of the Ashen - Solo 1", "Chest of Durin's Bane - Tier 1 1"
  m = label.match(/^Chest\s+of\s+(?:the\s+)?(.+?)\s*[-\u2013]\s*(Solo|Tier\s*[\d+]+)\s*\d*\s*$/i);
  if (m) return { boss: m[1].trim(), tier: m[2].trim() };

  // Pattern: "(Fancy[/ier/iest]|Ornate|Gold) [Type] Chest - BossName N"
  // Boss is after " - "; tier label is the chest quality prefix.
  // e.g. "Fancier Wood Chest - Durchest 1"          → boss="Durchest",                tier="Fancier Wood Chest"
  //      "Fancy Gold Chest - Disease Wing 1"         → boss="Disease Wing",             tier="Fancy Gold Chest"
  //      "Ornate Chest - Gortheron 14"               → boss="Gortheron",                tier="Ornate Chest"
  m = label.match(/^((?:Fancy(?:ier|iest)?|Ornate|Gold)\s+.*?Chest)\s*[-\u2013]\s*(.+?)\s*\d+\s*$/i);
  if (m) return { boss: m[2].trim(), tier: m[1].trim() };

  // Pattern: "BossEntity - (Solo|Tier X) N"  (entity with no 'Chest' suffix)
  // e.g. "Azagath Sea-shadow - Tier 1 1"
  m = label.match(/^(.+?)\s*[-\u2013]\s*(Solo|Tier\s*[\d+]+)\s*\d*\s*$/i);
  if (m) return { boss: m[1].trim(), tier: m[2].trim() };

  // Pattern: "[The] X's [MultiWordType] N"  (possessive, no tier suffix — differentiate by type)
  // e.g. "The Witch King's Golden Chest 1" → boss="The Witch King", tier="Golden Chest"
  //      "Storvâgûn's Tinier Trinket Box 2"→ boss="Storvâgûn",     tier="Tinier Trinket Box"
  m = label.match(/^(.+?)['\u2019]s?\s+(.+?)\s+\d+\s*$/i);
  if (m) return { boss: m[1].trim(), tier: m[2].trim() };

  // Cannot identify boss — keep label as-is (no grouping)
  return { boss: null, tier: label };
}

/**
 * Build the full accordion HTML for an instance's boss loot tables.
 * Called post-autolink so boss names don't get partial mob-link matches.
 */
function buildLootAccordionHtml(slug) {
  const refs = loadInstanceLootReferenceConfig();
  const entry = refs[slug];
  if (!entry) return '';

  const rawBosses = Array.isArray(entry.bosses) ? entry.bosses : [];
  if (!rawBosses.length) return '';

  // Pre-process: when boss.name === the single chest's label the import script had no real boss
  // entity — extract the actual boss name from the chest label and group chests accordingly.
  const processedBosses = [];
  const bossGroupMap = new Map(); // extractedBossName → synthetic group entry
  for (const boss of rawBosses) {
    const bossName = String(boss.name || '').trim();
    if (!bossName) continue;
    const chests = Array.isArray(boss.chests) ? boss.chests : [];
    const isDegenerate = chests.length === 1 && String(chests[0].label || '').trim() === bossName;
    if (isDegenerate) {
      const { boss: extractedBoss, tier: tierLabel } = extractBossFromChestLabel(bossName);
      if (extractedBoss) {
        if (!bossGroupMap.has(extractedBoss)) {
          const groupEntry = { name: extractedBoss, chests: [] };
          bossGroupMap.set(extractedBoss, groupEntry);
          processedBosses.push(groupEntry);
        }
        // Attach the chest with a cleaned-up tier label instead of the full chest name
        bossGroupMap.get(extractedBoss).chests.push(Object.assign({}, chests[0], { label: tierLabel }));
      } else {
        // No boss extractable — pass through unchanged (chest name shown as boss header)
        processedBosses.push(boss);
      }
    } else {
      processedBosses.push(boss);
    }
  }

  const bosses = processedBosses;

  const lines = ['<div class="lotro-loot-accordion">'];

  for (const boss of bosses) {
    const bossName = String(boss.name || '').trim();
    if (!bossName) continue;

    // Resolve boss name to mob link if available
    const bossEntry = itemIndex[bossName];
    const bossLabel = bossEntry && bossEntry.type === 'mob'
      ? `<a href="../mobs?id=${bossEntry.id}" class="lotro-mob">${bossName}</a>`
      : bossName;

    lines.push(`<details class="lotro-loot-boss">`);
    lines.push(`<summary class="lotro-loot-boss-name">${bossLabel}</summary>`);

    const chests = Array.isArray(boss.chests) ? boss.chests : [];
    for (const chest of chests) {
      const chestLabel = String(chest.label || chest.tier || '').trim();
      const chestItems = Array.isArray(chest.items) ? chest.items : [];
      if (!chestItems.length) continue;

      lines.push(`<div class="lotro-loot-chest">`);
      lines.push(`<h5 class="lotro-loot-chest-label">${chestLabel}</h5>`);
      lines.push(`<table class="lotro-loot-table">`);
      lines.push(`<thead><tr><th>Item</th><th>Drop Chance</th></tr></thead>`);
      lines.push(`<tbody>`);

      for (const lootItem of chestItems) {
        const itemName = String(lootItem.name || '').trim();
        if (!itemName) continue;

        const dbItem = itemIndex[itemName];
        const qualityClass = dbItem && dbItem.quality ? ` lotro-${dbItem.quality}` : '';

        // Build tooltip from loot-reference stats (preferred) or itemIndex stats
        let tooltipAttr = '';
        const statsSource = lootItem.stats || (dbItem && dbItem.stats);
        if (statsSource && statsSource.length) {
          const parts = [];
          // Header: slot + level + scaling indicator
          const slot = lootItem.slot || (dbItem && dbItem.slot) || '';
          const level = lootItem.level || (dbItem && dbItem.level) || 0;
          if (slot || level) {
            let header = '';
            if (slot) header += slot.replace(/\b\w/g, c => c.toUpperCase());
            if (level) header += (header ? ' · ' : '') + 'iLvl ' + level;
            if (lootItem.scaling) header += ' · ⚖ Scales';
            parts.push(header);
          }
          // Stats
          const statKey = s => s.stat || s.s;
          const statVal = s => s.value !== undefined ? s.value : s.v;
          const statLines = statsSource
            .filter(s => statVal(s) !== 0)
            .slice(0, 6)
            .map(s => `${statKey(s)}: ${Number(statVal(s)).toLocaleString()}`);
          parts.push(...statLines);
          tooltipAttr = ` data-item-stats="${parts.join(' · ').replace(/"/g, '&quot;')}"`;
        }

        // Build inline icon tag if available
        const iconId = dbItem ? (dbItem.icon || iconMap[dbItem.id]) : null;
        const lootIconHtml = iconId
          ? `<img src="${CDN_URL ? CDN_URL + '/img/icons/items/' + iconId + '.png' : '../img/icons/items/' + iconId + '.png'}" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
          : '';

        const itemHtml = dbItem
          ? `<a href="../items?id=${dbItem.id}" class="lotro-item${qualityClass}" data-item-type="${dbItem.type || 'item'}"${tooltipAttr}>${lootIconHtml}<span class="lotro-item-text">${itemName}</span></a>`
          : (tooltipAttr ? `<span class="lotro-item"${tooltipAttr}>${itemName}</span>` : itemName);

        const dropChance = String(lootItem.drop || '').trim();
        const dropClass = dropChance ? ` lotro-drop-${dropChance.toLowerCase()}` : '';

        lines.push(`<tr><td>${itemHtml}</td><td><span class="lotro-drop-chance${dropClass}">${dropChance}</span></td></tr>`);
      }

      lines.push(`</tbody></table>`);
      lines.push(`</div>`);
    }

    lines.push(`</details>`);
  }

  lines.push('</div>');
  return lines.join('\n');
}

/**
 * Replace <!--LOTRO_LOOT_ACCORDION:slug--> placeholders with real HTML.
 * Must be called after autolinkers have run.
 */
function expandLootAccordionPlaceholders(html) {
  return html.replace(/<!--LOTRO_LOOT_ACCORDION:([\w-]+)-->/g, (_, slug) => buildLootAccordionHtml(slug));
}

function normalizeGuideDpsTableContent(markdown, fileName) {
  const dpsRef = loadDpsReferenceConfig();
  const sectionHeading = String(dpsRef.sectionHeading || dpsRef.title || '').trim();
  if (!sectionHeading) return markdown;

  const token = '{{dpsStatTable}}';
  const headingRegex = new RegExp(`(^##\\s+${sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$)`, 'im');
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return markdown;

  // Already using preferred token format (with or without options).
  if (markdown.includes('{{dpsStatTable}}') || markdown.includes('{{dpsStatTable:')) return markdown;

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = markdown.slice(sectionStart);

  // Find the first markdown table in this section.
  const tableRegex = /(^\|.+\|\s*$\r?\n^\|[-:\s|]+\|\s*(?:\r?\n^\|.*\|\s*)+)/m;
  const tableMatch = tableRegex.exec(rest);
  if (!tableMatch) return markdown;

  const before = markdown.slice(0, sectionStart);
  const tableStartInRest = tableMatch.index;
  const tableEndInRest = tableStartInRest + tableMatch[0].length;
  const between = rest.slice(0, tableStartInRest);
  const after = rest.slice(tableEndInRest);

  console.log(`   ℹ Normalized DPS table token in guides/${fileName}`);
  return `${before}${between}${token}\n\n${after}`;
}

function normalizeGuideInstanceLootReferenceContent(markdown, fileName, slug) {
  const refs = loadInstanceLootReferenceConfig();
  if (!refs[slug]) return markdown;

  const heading = '## Instance Loot Reference';
  const token = '{{instanceLootReference}}';

  if (markdown.includes(token)) return markdown;

  const headingRegex = new RegExp(`(^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$)`, 'im');
  const headingMatch = headingRegex.exec(markdown);

  if (headingMatch) {
    const sectionStart = headingMatch.index + headingMatch[0].length;
    const rest = markdown.slice(sectionStart);
    const nextHeadingMatch = /^##\s+/m.exec(rest);
    const sectionEnd = nextHeadingMatch ? sectionStart + nextHeadingMatch.index : markdown.length;
    const before = markdown.slice(0, sectionStart);
    const after = markdown.slice(sectionEnd);

    console.log(`   ℹ Normalized instance loot token in guides/${fileName}`);
    return `${before}\n\n${token}\n\n${after.replace(/^\s+/, '')}`;
  }

  const sectionBlock = `${heading}\n\n${token}\n\n`;
  const dividerMatch = /^---\s*$/m.exec(markdown);
  if (dividerMatch) {
    console.log(`   ℹ Inserted instance loot token in guides/${fileName}`);
    return `${markdown.slice(0, dividerMatch.index)}${sectionBlock}${markdown.slice(dividerMatch.index)}`;
  }

  console.log(`   ℹ Appended instance loot token in guides/${fileName}`);
  return `${markdown.trimEnd()}\n\n${sectionBlock}`;
}

/**
 * Auto-normalize consumable markdown tables under common headings to {{consumableTable:items=...}} tokens.
 * Matches 2-col (Consumable|Purpose) and 3-col (Consumable|Example|Slot) tables.
 */
function normalizeGuideConsumableTableContent(markdown, fileName) {
  if (markdown.includes('{{consumableTable')) return markdown;

  // Match section headings that commonly wrap consumable tables
  const headingRe = /^##\s+(Recommended Consumables|Consumables Checklist|Consumables)\s*$/im;
  const headingMatch = headingRe.exec(markdown);
  if (!headingMatch) return markdown;

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = markdown.slice(sectionStart);

  // Find first markdown table in this section
  const tableRe = /(^\|.+\|\s*$\r?\n^\|[-:\s|]+\|\s*(?:\r?\n^\|.*\|\s*)+)/m;
  const tableMatch = tableRe.exec(rest);
  if (!tableMatch) return markdown;

  // Parse row content to match known consumable keys
  const cfg = loadConsumablesReferenceConfig();
  const allItems = cfg.items || [];
  const tableText = tableMatch[0];
  const rows = tableText.split(/\r?\n/).filter(r => r.trim().startsWith('|'));
  // skip header and separator rows
  const dataRows = rows.slice(2);
  const matchedKeys = [];
  const noteOverrides = [];

  for (const row of dataRows) {
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const name = cells[0].toLowerCase();
    const purpose = cells.length >= 2 ? cells[cells.length - 1] : '';

    // Match against known items by checking if the consumable name or example appears in the row
    let found = null;
    for (const it of allItems) {
      if (name.includes(it.key) || name.includes(it.consumable.toLowerCase()) ||
          (cells.length > 1 && cells[1].toLowerCase().includes(it.example.toLowerCase()))) {
        found = it;
        break;
      }
    }
    if (found) {
      matchedKeys.push(found.key);
      // If the purpose/slot text differs from default, add a note override
      if (purpose && purpose.toLowerCase() !== (found.purpose || '').toLowerCase()) {
        noteOverrides.push(found.key + '=' + purpose);
      }
    }
  }

  if (matchedKeys.length < 2) return markdown; // Not enough matches to be confident

  let token = '{{consumableTable:items=' + matchedKeys.join('+');
  if (noteOverrides.length) token += ',notes=' + noteOverrides.join('|');
  token += '}}';

  const before = markdown.slice(0, sectionStart);
  const tableStartInRest = tableMatch.index;
  const tableEndInRest = tableStartInRest + tableMatch[0].length;
  const between = rest.slice(0, tableStartInRest);
  const after = rest.slice(tableEndInRest);

  console.log(`   ℹ Normalized consumable table token in guides/${fileName}`);
  return `${before}${between}${token}\n\n${after}`;
}

/**
 * Replace {{map:type=id,...opts}} tokens in HTML with responsive map iframes.
 * Supports type: map, deed, quest, mob. Options: lng, lat, height.
 * Strips any wrapping <p> tag that marked may have added.
 */
function resolveMapEmbeds(html, siteRoot) {
  siteRoot = siteRoot || '';
  return html.replace(/<p>\s*(\{\{map:[^}]+\}\})\s*<\/p>/gi, '$1')
    .replace(/\{\{map:([^}]+)\}\}/g, function (_, inner) {
    const opts = {};
    inner.split(',').forEach(function (pair) {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      opts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    });
    // First key=value is the type (map, deed, quest, mob)
    const firstPair = inner.split(',')[0];
    const eqIdx = firstPair.indexOf('=');
    const type = firstPair.slice(0, eqIdx).trim();
    const id = firstPair.slice(eqIdx + 1).trim();
    const height = opts.height || '450';
    const param = encodeURIComponent(id);
    let src = `${siteRoot}map?${type}=${param}&embed=1`;
    if (opts.lng) src += `&lng=${encodeURIComponent(opts.lng)}`;
    if (opts.lat) src += `&lat=${encodeURIComponent(opts.lat)}`;
    return `<div class="lotro-map-embed" style="height:${height}px">`
      + `<iframe src="${src}" style="width:100%;height:100%;border:0" loading="lazy" allowfullscreen title="LOTRO Interactive Map"></iframe>`
      + `</div>`;
  });
}

// ─── Quest & Deed Card Embeds ───────────────────────────────────────────────

function loadQuestDb() {
  if (questDbCache) return questDbCache;
  const dbPath = path.join(OUTPUT_DIR, 'data', 'quests-db.json');
  if (!fs.existsSync(dbPath)) { questDbCache = {}; return questDbCache; }
  const arr = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  questDbCache = {};
  for (const q of arr) questDbCache[q.id] = q;
  return questDbCache;
}

function loadDeedDb() {
  if (deedDbCache) return deedDbCache;
  const dbPath = path.join(OUTPUT_DIR, 'data', 'deeds-db.json');
  if (!fs.existsSync(dbPath)) { deedDbCache = {}; return deedDbCache; }
  const arr = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  deedDbCache = {};
  for (const d of arr) deedDbCache[d.id] = d;
  return deedDbCache;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildQuestCardHtml(quest) {
  if (!quest) return '<div class="lotro-card lotro-card-quest lotro-card-missing"><i class="fa fa-exclamation-triangle"></i> Quest not found</div>';
  const name = escHtml(quest.n || '');
  const level = quest.lv ? `<span class="lotro-card-level">Lv ${quest.lv}</span>` : '';
  const cat = quest.cat ? `<span class="lotro-card-zone"><i class="fa fa-map-marker"></i> ${escHtml(quest.cat)}</span>` : '';
  const arc = quest.arc ? `<span class="lotro-card-arc"><i class="fa fa-link"></i> ${escHtml(quest.arc)}</span>` : '';
  const bestower = quest.b ? `<div class="lotro-card-bestower"><strong>Bestower:</strong> ${escHtml(quest.b)}</div>` : '';
  const desc = quest.desc ? `<div class="lotro-card-desc">${escHtml(quest.desc)}</div>` : '';

  let rewardsHtml = '';
  if (quest.rw) {
    const parts = [];
    if (quest.rw.xp) parts.push(`<span class="lotro-card-rw-xp"><i class="fa fa-star"></i> ${quest.rw.xp} XP</span>`);
    if (quest.rw.m) parts.push(`<span class="lotro-card-rw-money"><i class="fa fa-money"></i> ${escHtml(quest.rw.m)}</span>`);
    if (quest.rw.it && quest.rw.it.length) {
      for (const it of quest.rw.it) {
        const iconSrc = it.id && iconMap[it.id] ? `${CDN_URL ? CDN_URL + '/img/icons/items/' : 'img/icons/items/'}${iconMap[it.id]}.png` : '';
        const icon = iconSrc ? `<img src="${iconSrc}" width="16" height="16" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'"> ` : '';
        parts.push(`<span class="lotro-card-rw-item">${icon}${escHtml(it.n)}</span>`);
      }
    }
    if (parts.length) rewardsHtml = `<div class="lotro-card-rewards"><strong>Rewards:</strong> ${parts.join(' ')}</div>`;
  }

  const link = `quests?id=${encodeURIComponent(quest.id)}`;
  return `<div class="lotro-card lotro-card-quest">`
    + `<div class="lotro-card-header"><i class="fa fa-bookmark"></i> <a href="${link}">${name}</a> ${level}</div>`
    + `<div class="lotro-card-meta">${cat}${arc}</div>`
    + desc + bestower + rewardsHtml
    + `</div>`;
}

function formatDeedObjective(obj) {
  if (!obj) return '';
  switch (obj.t) {
    case 'kill': return `Defeat ${escHtml(obj.mn || 'enemies')}${obj.c ? ' ×' + obj.c : ''}${obj.z ? ' in ' + escHtml(obj.z) : ''}`;
    case 'complete': return `Complete: ${escHtml(obj.an || '')}`;
    case 'qc': return `Complete ${obj.c || '?'} quests`;
    case 'explore': return `Explore: ${escHtml(obj.n || '')}`;
    case 'item': return `Collect: ${escHtml(obj.n || '')}`;
    case 'npc': return `Talk to ${escHtml(obj.n || '')}`;
    case 'use': return `Use: ${escHtml(obj.n || '')}`;
    case 'skill': return `Use skill: ${escHtml(obj.n || '')}`;
    case 'emote': return `Emote: ${escHtml(obj.n || '')}`;
    case 'lm': return escHtml(obj.n || obj.t);
    case 'fac': return `Reach reputation: ${escHtml(obj.n || '')}`;
    default: return escHtml(obj.n || obj.t || '');
  }
}

function buildDeedCardHtml(deed) {
  if (!deed) return '<div class="lotro-card lotro-card-deed lotro-card-missing"><i class="fa fa-exclamation-triangle"></i> Deed not found</div>';
  const name = escHtml(deed.n || '');
  const level = deed.lv ? `<span class="lotro-card-level">Lv ${deed.lv}</span>` : '';
  const typeBadge = deed.tp ? `<span class="lotro-card-deed-type lotro-card-deed-type-${escHtml(deed.tp.toLowerCase())}">${escHtml(deed.tp)}</span>` : '';
  const classReq = deed.cl ? `<span class="lotro-card-class"><i class="fa fa-shield"></i> ${escHtml(deed.cl)}</span>` : '';

  let objectivesHtml = '';
  if (deed.obj && deed.obj.length) {
    const items = deed.obj.slice(0, 5).map(o => `<li>${formatDeedObjective(o)}</li>`).join('');
    const more = deed.obj.length > 5 ? `<li class="lotro-card-more">+${deed.obj.length - 5} more…</li>` : '';
    objectivesHtml = `<div class="lotro-card-objectives"><strong>Objectives:</strong><ul>${items}${more}</ul></div>`;
  }

  let rewardsHtml = '';
  if (deed.rw && deed.rw.length) {
    const parts = deed.rw.map(r => {
      if (r.t === 'LP') return `<span class="lotro-card-rw-lp"><i class="fa fa-star"></i> ${r.v} LP</span>`;
      if (r.t === 'Title') return `<span class="lotro-card-rw-title"><i class="fa fa-certificate"></i> ${escHtml(r.v)}</span>`;
      if (r.t === 'Virtue' || r.t === 'VirtueXP') return `<span class="lotro-card-rw-virtue"><i class="fa fa-heart"></i> ${escHtml(r.v)}${r.t === 'VirtueXP' ? ' VXP' : ''}</span>`;
      if (r.t === 'Reputation') return `<span class="lotro-card-rw-rep"><i class="fa fa-flag"></i> ${escHtml(r.v)}</span>`;
      if (r.t === 'XP') return `<span class="lotro-card-rw-xp"><i class="fa fa-star"></i> ${escHtml(r.v)} XP</span>`;
      if (r.t === 'Item') return `<span class="lotro-card-rw-item">${escHtml(r.v)}</span>`;
      return `<span>${escHtml(r.v || r.t)}</span>`;
    });
    rewardsHtml = `<div class="lotro-card-rewards"><strong>Rewards:</strong> ${parts.join(' ')}</div>`;
  }

  const link = `deeds?id=${encodeURIComponent(deed.id)}`;
  return `<div class="lotro-card lotro-card-deed">`
    + `<div class="lotro-card-header"><i class="fa fa-shield"></i> <a href="${link}">${name}</a> ${level} ${typeBadge}</div>`
    + `<div class="lotro-card-meta">${classReq}</div>`
    + objectivesHtml + rewardsHtml
    + `</div>`;
}

/**
 * Replace {{quest:id_or_name}} and {{deed:id_or_name}} tokens with rendered cards.
 * Looks up by numeric ID first, then falls back to name match.
 */
function resolveCardEmbeds(html) {
  html = html.replace(/<p>\s*(\{\{(?:quest|deed):[^}]+\}\})\s*<\/p>/gi, '$1');

  html = html.replace(/\{\{quest:([^}]+)\}\}/g, function (_, ref) {
    const db = loadQuestDb();
    const trimmed = ref.trim();
    const quest = db[trimmed] || Object.values(db).find(q => q.n === trimmed);
    return buildQuestCardHtml(quest);
  });

  html = html.replace(/\{\{deed:([^}]+)\}\}/g, function (_, ref) {
    const db = loadDeedDb();
    const trimmed = ref.trim();
    const deed = db[trimmed] || Object.values(db).find(d => d.n === trimmed);
    return buildDeedCardHtml(deed);
  });

  return html;
}

/**
 * Replace {{dpsStatTable}} or {{dpsStatTable:opt=val,...}} tokens in HTML.
 * Supported options: levelCap, heading (used as section heading above the table).
 * Strips any wrapping <p> tag that marked may have added.
 */
function resolveDpsTokens(html) {
  // Strip <p> wrapper around DPS tokens
  html = html.replace(/<p>\s*(\{\{dpsStatTable(?::[^}]*)?\}\})\s*<\/p>/gi, '$1');

  return html.replace(/\{\{dpsStatTable(?::([^}]*))?\}\}/g, function (_, optStr) {
    const dpsRef = loadDpsReferenceConfig();
    const overrides = {};

    if (optStr) {
      optStr.split(',').forEach(function (pair) {
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const key = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (key === 'levelCap') overrides.levelCap = parseInt(val, 10) || dpsRef.levelCap;
        else if (key === 'heading') overrides.sectionHeading = val;
      });
    }

    return buildDpsTableHtml(dpsRef, overrides);
  });
}

// ─── Trait Planner Embeds ────────────────────────────────────────────────

const TRAIT_PLANNER_CLASSES = [
  'beorning', 'brawler', 'burglar', 'captain', 'champion',
  'guardian', 'hunter', 'loremaster', 'mariner', 'minstrel',
  'runekeeper', 'warden',
];

function resolveTraitPlannerTokens(html) {
  // Strip <p> wrapper around tokens
  html = html.replace(/<p>\s*(\{\{traitPlanner:[^}]+\}\})\s*<\/p>/gi, '$1');

  html = html.replace(/\{\{traitPlanner:([^}]+)\}\}/g, function (_, optStr) {
    const opts = {};
    optStr.split(',').forEach(function (pair) {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim();
      let val = pair.slice(eq + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      opts[key] = val;
    });

    const cls = (opts['class'] || '').toLowerCase();
    if (!TRAIT_PLANNER_CLASSES.includes(cls)) {
      console.warn(`   ⚠ Unknown trait planner class: "${cls}"`);
      return `<!-- unknown traitPlanner class: ${cls} -->`;
    }

    const buildKey = opts.build || '';
    if (!buildKey) {
      console.warn(`   ⚠ traitPlanner token missing build key for class "${cls}"`);
      return `<!-- traitPlanner missing build key -->`;
    }

    const level = opts.level || '160';

    // Resolve points: use explicit points param, or load from build JSON
    let pointsData = opts.points || null;
    let buildName = opts.title || '';
    let buildDesc = '';
    if (!pointsData) {
      try {
        const buildFile = path.join(__dirname, 'data', 'builds', cls + '.json');
        if (fs.existsSync(buildFile)) {
          const buildJson = JSON.parse(fs.readFileSync(buildFile, 'utf8'));
          const buildDef = buildJson.builds && buildJson.builds[buildKey];
          if (buildDef && buildDef.points && Object.keys(buildDef.points).length > 0) {
            pointsData = JSON.stringify(buildDef.points);
            if (!buildName) buildName = buildDef.name || '';
            buildDesc = buildDef.desc || buildDef.description || '';
          }
        }
      } catch (e) {
        console.warn(`   ⚠ Failed to load build data for ${cls}/${buildKey}: ${e.message}`);
      }
    }

    if (!buildName) {
      buildName = `${capitalizeFirst(cls)} ${buildKey.split('-').map(capitalizeFirst).join(' ')} Build`;
    }

    // Build URL to skills page
    const urlParams = new URLSearchParams({ class: cls, build: buildKey, level: level });
    if (pointsData) {
      urlParams.set('points', encodeURIComponent(pointsData));
    }

    const skillsUrl = `../skills.html?${urlParams.toString()}`;

    // Compute tree point summary from points data
    let blue = 0, red = 0, yellow = 0;
    if (pointsData) {
      try {
        const pts = typeof pointsData === 'string' ? JSON.parse(pointsData) : pointsData;
        Object.keys(pts).forEach(function (k) {
          const v = pts[k] || 0;
          if (k.indexOf('b-') === 0) blue += v;
          else if (k.indexOf('r-') === 0) red += v;
          else if (k.indexOf('y-') === 0) yellow += v;
        });
      } catch (_e) { /* ignore parse errors */ }
    }
    const total = blue + red + yellow;

    // Build styled link card
    const treeTags = [
      blue ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(64,128,192,0.25);color:#7db8e8;">Blue: ${blue}</span>` : '',
      red ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(192,64,64,0.25);color:#e87d7d;">Red: ${red}</span>` : '',
      yellow ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(192,168,64,0.25);color:#e8d87d;">Yellow: ${yellow}</span>` : ''
    ].filter(Boolean).join(' ');

    return `<div class="trait-planner-embed" style="background:rgba(26,26,46,1);border:1px solid #444;border-radius:8px;padding:18px 22px;margin:1.5rem 0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <i class="fa fa-bookmark" style="color:var(--lotro-gold);font-size:18px;"></i>
        <span style="font-family:'Cinzel',serif;color:#eee;font-size:16px;font-weight:600;">${buildName}</span>
      </div>
      ${buildDesc ? `<p style="color:#aaa;font-size:13px;margin:0 0 10px 0;">${buildDesc}</p>` : ''}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        ${treeTags}
        ${total ? `<span style="color:#888;font-size:12px;">Total: ${total} points &middot; Level ${level}</span>` : ''}
      </div>
      <a href="${skillsUrl}" style="display:inline-block;background:rgba(201,168,76,0.15);border:1px solid var(--lotro-gold);color:var(--lotro-gold);padding:8px 20px;border-radius:4px;font-size:14px;font-weight:500;text-decoration:none;transition:all 0.2s;">
        <i class="fa fa-play"></i> Open in Trait Builder
      </a>
    </div>`;
  });

  return html;
}

// Helper function for capitalizing first letter
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadItemIndex() {
  const indexPath = path.join(LORE_DIR, 'item-index.json');
  if (!fs.existsSync(indexPath)) {
    console.log('   ℹ No lore data found — run: node scripts/extract-lore.js');
    return;
  }
  itemIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  console.log(`   📇 Loaded item index (${Object.keys(itemIndex).length} entries)`);

  // Load icon map (itemId → iconId) for inline icons in auto-linked content
  const iconMapPath = path.join(LORE_DIR, 'icon-map.json');
  if (fs.existsSync(iconMapPath)) {
    iconMap = JSON.parse(fs.readFileSync(iconMapPath, 'utf8'));
  }
}

function loadQuestIndex() {
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (!fs.existsSync(questsPath)) {
    questIndex = {};
    return;
  }

  const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
  const idx = {};
  for (const q of quests) {
    const name = (q.n || q.name || '').trim();
    if (!name) continue;
    idx[name] = { id: q.id, lv: q.lv, cat: q.cat };
  }
  questIndex = idx;
  console.log(`   🧭 Loaded quest index (${Object.keys(questIndex).length} entries)`);
}

function normalizeLookupName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMapMarkerIndex() {
  if (mapMarkerIndexCache) return mapMarkerIndexCache;

  const dir = path.join(LORE_DIR, 'map-markers');
  const byDid = {};
  const byLabel = {};

  if (!fs.existsSync(dir)) {
    mapMarkerIndexCache = { byDid, byLabel };
    return mapMarkerIndexCache;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const mapId = path.basename(file, '.json');
    const markers = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const mk of markers) {
      const row = {
        map: mapId,
        lng: mk.lng,
        lat: mk.lat,
        l: mk.l || '',
      };
      if (mk.d && !byDid[mk.d]) byDid[mk.d] = row;
      const key = normalizeLookupName(mk.l);
      if (key && !byLabel[key]) byLabel[key] = row;
    }
  }

  mapMarkerIndexCache = { byDid, byLabel };
  return mapMarkerIndexCache;
}

function findMarkerLocation(markerIndex, did, label) {
  if (did && markerIndex.byDid[did]) return markerIndex.byDid[did];
  const key = normalizeLookupName(label);
  if (key && markerIndex.byLabel[key]) return markerIndex.byLabel[key];
  return null;
}

function createProtectedHtmlStore(html) {
  const fragments = [];

  function protect(fragment) {
    const token = `@@LOTRO_HTML_FRAGMENT_${fragments.length}@@`;
    fragments.push(fragment);
    return token;
  }

  return {
    html: html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (match) => protect(match)),
    protect,
    restore(value) {
      return value.replace(/@@LOTRO_HTML_FRAGMENT_(\d+)@@/g, (_, index) => fragments[Number(index)] || '');
    },
  };
}

/**
 * Auto-link known item/consumable/mob names within HTML content.
 * - Only matches names 8+ chars to avoid false positives
 * - Matches longest names first (greedy)
 * - Only links the first occurrence of each name per article
 * - Wraps in <a class="lotro-item" data-item-id="..." data-item-type="...">
 * - Skips content inside HTML tags (href, alt, etc.)
 */
function autoLinkItems(html) {
  if (!Object.keys(itemIndex).length) return html;
  const protectedAnchors = createProtectedHtmlStore(html);
  html = protectedAnchors.html;

  // Build list of names to match: 8+ chars, sorted longest-first.
  // Keep deed/set linking in their dedicated linkers to avoid overlap.
  const allowedTypes = new Set(['item', 'consumable', 'quest-reward', 'virtue']);
  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 8 && allowedTypes.has(itemIndex[n].type))
    .sort((a, b) => b.length - a.length);

  if (!names.length) return protectedAnchors.restore(html);

  const linked = new Set();

  // Process each name — only match in text content, not inside tags
  for (const name of names) {
    if (linked.has(name)) continue;

    // Escape regex special chars in the item name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match whole-word only, case-insensitive, not inside HTML tags
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      // Link to our own items database page (articles live in subdir)
      const itemUrl = `../items?id=${entry.id}`;
      const qualityClass = entry.quality ? ` lotro-${entry.quality}` : '';
      const typeLabel = entry.type === 'consumable' ? entry.subtype || 'consumable' : entry.type;

      // Build tooltip data attribute with stats
      let tooltipData = '';
      if (entry.stats && entry.stats.length) {
        const statStr = entry.stats
          .filter(s => s.value !== 0)
          .slice(0, 6)
          .map(s => `${s.stat}: ${s.value.toLocaleString()}`)
          .join(' | ');
        tooltipData = ` data-item-stats="${statStr.replace(/"/g, '&quot;')}"`;
      }

      // Build inline icon tag if available
      const iconId = entry.icon || iconMap[entry.id];
      const iconHtml = iconId
        ? `<img src="${CDN_URL ? CDN_URL + '/img/icons/items/' + iconId + '.png' : '../img/icons/items/' + iconId + '.png'}" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';

      const replacement = protectedAnchors.protect(`<a href="${itemUrl}" class="lotro-item${qualityClass}" data-item-type="${typeLabel}"${tooltipData}>${iconHtml}<span class="lotro-item-text">${match[0]}</span></a>`);

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return protectedAnchors.restore(html);
}

/**
 * Auto-link known mob names within HTML content.
 * Same approach as autoLinkItems but for mobs only.
 */
function autoLinkMobs(html) {
  if (!Object.keys(itemIndex).length) return html;
  const protectedAnchors = createProtectedHtmlStore(html);
  html = protectedAnchors.html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 8 && itemIndex[n].type === 'mob')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return protectedAnchors.restore(html);

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const mobUrl = `../mobs?id=${entry.id}`;
      const genusInfo = entry.genus ? ` data-mob-genus="${entry.genus}"` : '';
      const speciesInfo = entry.species ? ` data-mob-species="${entry.species}"` : '';
      const replacement = protectedAnchors.protect(`<a href="${mobUrl}" class="lotro-mob" data-mob-id="${entry.id}"${genusInfo}${speciesInfo}>${match[0]}</a>`);

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return protectedAnchors.restore(html);
}

/**
 * Auto-link known set names within HTML content.
 */
function autoLinkSets(html) {
  if (!Object.keys(itemIndex).length) return html;
  const protectedAnchors = createProtectedHtmlStore(html);
  html = protectedAnchors.html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 10 && itemIndex[n].type === 'set')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return protectedAnchors.restore(html);

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const setUrl = `../sets?id=${entry.id}`;
      const replacement = protectedAnchors.protect(`<a href="${setUrl}" class="lotro-set" data-set-id="${entry.id}">${match[0]}</a>`);

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return protectedAnchors.restore(html);
}

/**
 * Auto-link known deed names within HTML content.
 */
function autoLinkDeeds(html) {
  if (!Object.keys(itemIndex).length) return html;
  const protectedAnchors = createProtectedHtmlStore(html);
  html = protectedAnchors.html;

  const names = Object.keys(itemIndex)
    .filter(n => n.length >= 10 && itemIndex[n].type === 'deed')
    .sort((a, b) => b.length - a.length);

  if (!names.length) return protectedAnchors.restore(html);

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![<\\w/])\\b(${escaped})\\b(?![^<]*>)`, 'i');
    const match = html.match(regex);

    if (match) {
      const entry = itemIndex[name];
      const deedUrl = `../deeds?id=${entry.id}`;
      const replacement = protectedAnchors.protect(`<a href="${deedUrl}" class="lotro-deed" data-deed-type="${entry.deedType || ''}">${match[0]}</a>`);

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return protectedAnchors.restore(html);
}

/**
 * Auto-link known quest names within HTML content.
 */
function autoLinkQuests(html) {
  if (!Object.keys(questIndex).length) return html;
  const protectedAnchors = createProtectedHtmlStore(html);
  html = protectedAnchors.html;

  const deedNames = new Set(
    Object.keys(itemIndex).filter(n => itemIndex[n].type === 'deed')
  );

  const names = Object.keys(questIndex)
    .filter(n => n.length >= 12)
    .filter(n => n.trim().split(/\s+/).length >= 3)
    .filter(n => !deedNames.has(n))
    .sort((a, b) => b.length - a.length);

  if (!names.length) return protectedAnchors.restore(html);

  const linked = new Set();

  for (const name of names) {
    if (linked.has(name)) continue;

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const first = escaped.charAt(0);
    const hasAsciiLetter = /^[A-Za-z]$/.test(first);
    const leading = hasAsciiLetter
      ? `[${first.toLowerCase()}${first.toUpperCase()}]${escaped.slice(1)}`
      : escaped;
    const regex = new RegExp(`(?<![<\\w/])\\b(${leading})\\b(?![^<]*>)`);
    const match = html.match(regex);

    if (match) {
      const entry = questIndex[name];
      const questUrl = `../quests?id=${entry.id}`;
      const levelInfo = entry.lv ? ` data-quest-level="${entry.lv}"` : '';
      const catInfo = entry.cat ? ` data-quest-category="${String(entry.cat).replace(/"/g, '&quot;')}"` : '';
      const replacement = protectedAnchors.protect(`<a href="${questUrl}" class="lotro-quest"${levelInfo}${catInfo}>${match[0]}</a>`);

      html = html.replace(match[0], replacement);
      linked.add(name);
    }
  }

  return protectedAnchors.restore(html);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readTemplate(name) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf-8');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '');
}

function truncate(text, maxLen) {
  const plain = stripHtml(text);
  if (plain.length <= maxLen) return plain;
  return plain.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

// ─── Image Optimization ────────────────────────────────────────────────────

// ─── Favicon ICO Generation ─────────────────────────────────────────────────
/**
 * Generate favicon.ico from img/favicon.png using sharp.
 * Produces a multi-size ICO (16×16, 32×32, 48×48) with embedded PNGs.
 */
async function generateFaviconIco() {
  const srcPath = path.join(OUTPUT_DIR, 'img', 'favicon.png');
  const outPath = path.join(OUTPUT_DIR, 'favicon.ico');
  if (!fs.existsSync(srcPath)) {
    console.log('   ⚠ img/favicon.png not found — skipping favicon.ico');
    return;
  }
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map(s => sharp(srcPath).resize(s, s).png().toBuffer())
  );
  // Build ICO file: header (6 bytes) + directory entries (16 bytes each) + PNG data
  const headerSize = 6 + sizes.length * 16;
  let dataOffset = headerSize;
  const dirEntries = [];
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    const buf = Buffer.alloc(16);
    buf.writeUInt8(s < 256 ? s : 0, 0);   // width  (0 = 256)
    buf.writeUInt8(s < 256 ? s : 0, 1);   // height (0 = 256)
    buf.writeUInt8(0, 2);                  // color palette
    buf.writeUInt8(0, 3);                  // reserved
    buf.writeUInt16LE(1, 4);               // color planes
    buf.writeUInt16LE(32, 6);              // bits per pixel
    buf.writeUInt32LE(pngBuffers[i].length, 8);  // image size
    buf.writeUInt32LE(dataOffset, 12);            // data offset
    dirEntries.push(buf);
    dataOffset += pngBuffers[i].length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type = ICO
  header.writeUInt16LE(sizes.length, 4);   // image count
  fs.writeFileSync(outPath, Buffer.concat([header, ...dirEntries, ...pngBuffers]));
}

// Cache of image dimensions: { 'img/guides/foo.jpg': { width: 800, height: 450 } }
const imageMeta = {};

async function convertImagesToWebp() {
  const imgDir = path.join(OUTPUT_DIR, 'img');
  if (!fs.existsSync(imgDir)) return;

  const extensions = ['.jpg', '.jpeg', '.png'];

  async function processDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const tasks = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        tasks.push(processDir(fullPath));
      } else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        const webpPath = fullPath.replace(/\.(jpe?g|png)$/i, '.webp');
        const relPath = path.relative(OUTPUT_DIR, fullPath).replace(/\\/g, '/');

        // Read dimensions and cache them
        tasks.push(
          sharp(fullPath).metadata().then(meta => {
            imageMeta[relPath] = { width: meta.width, height: meta.height };
            const webpRel = relPath.replace(/\.(jpe?g|png)$/i, '.webp');
            imageMeta[webpRel] = { width: meta.width, height: meta.height };
          }).catch(() => {})
        );

        // Skip conversion if WebP already exists and is newer than source
        if (fs.existsSync(webpPath) && fs.statSync(webpPath).mtimeMs >= fs.statSync(fullPath).mtimeMs) {
          continue;
        }

        tasks.push(
          sharp(fullPath)
            .webp({ quality: 80 })
            .toFile(webpPath)
            .then(() => console.log(`   ✓ webp: ${path.relative(OUTPUT_DIR, webpPath)}`))
            .catch(err => console.warn(`   ⚠ webp failed: ${path.relative(OUTPUT_DIR, fullPath)} — ${err.message}`))
        );
      }
    }
    await Promise.all(tasks);
  }

  await processDir(imgDir);
}

/**
 * Post-process HTML to upgrade <img> tags with SEO best practices:
 * - Wraps in <picture> with WebP <source> + original fallback
 * - Adds loading="lazy", decoding="async"
 * - Adds width/height attributes from cached metadata to prevent CLS
 * - Preserves existing alt text
 */
function optimizeImages(html) {
  let result = html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    // Skip game icons — they have explicit sizing that must be preserved
    if (attrs.includes('lotro-game-icon')) return match;

    const srcMatch = attrs.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return match;

    const src = srcMatch[1];
    const ext = path.extname(src).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) return match;

    // Derive WebP path
    const webpSrc = src.replace(/\.(jpe?g|png)$/i, '.webp');

    // Extract existing alt text
    const altMatch = attrs.match(/alt=["']([^"']*)["']/);
    const alt = altMatch ? altMatch[1] : '';

    // Extract existing class
    const classMatch = attrs.match(/class=["']([^"']*)["']/);
    const cls = classMatch ? ` class="${classMatch[1]}"` : '';

    // Extract existing style
    const styleMatch = attrs.match(/style=["']([^"']*)["']/);
    const style = styleMatch ? ` style="${styleMatch[1]}"` : '';

    // Look up dimensions — try with the src as-is and with ../ stripped
    const lookupKey = src.replace(/^\.\.\//g, '');
    const meta = imageMeta[lookupKey] || imageMeta[src] || null;
    const dims = meta ? ` width="${meta.width}" height="${meta.height}"` : '';

    return `<picture>` +
      `<source srcset="${webpSrc}" type="image/webp">` +
      `<img src="${src}" alt="${alt}"${cls}${style}${dims} loading="lazy" decoding="async">` +
      `</picture>`;
  });

  // Upgrade CSS background-image url() references from jpg/png to webp
  result = result.replace(/url\(['"]?([^'"\)]+\.(jpe?g|png))['"]?\)/gi, (match, src) => {
    const webpSrc = src.replace(/\.(jpe?g|png)$/i, '.webp');
    return `url('${webpSrc}')`;
  });

  return result;
}

// ─── Template Engine ────────────────────────────────────────────────────────
// Simple placeholder replacement: {{variable}}
function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

/**
 * Build the Cusdis comments widget HTML for a page.
 * Returns empty string when CUSDIS_APP_ID is not configured.
 */
function buildCommentsSection(pageId, pageUrl, pageTitle) {
  if (!CUSDIS_APP_ID) return '';
  const template = readTemplate('partials/comments.html');
  return render(template, {
    cusdisHost: CUSDIS_HOST,
    cusdisAppId: CUSDIS_APP_ID,
    cusdisPageId: pageId,
    cusdisPageUrl: pageUrl,
    cusdisPageTitle: pageTitle,
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    recaptchaScript: RECAPTCHA_SITE_KEY
      ? `<script src="https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}"></script>`
      : '',
  });
}

/**
 * Strip .html from internal URLs for clean URLs on the live site.
 * index.html → '' (or '../' for subdirectory pages)
 * page.html  → page
 * page.html?q=1 → page?q=1
 * page.html#frag → page#frag
 */
function cleanUrl(url) {
  if (!url) return url;
  return url.replace(/index\.html\b/, '').replace(/\.html\b/, '');
}

function resolveNavUrl(siteRoot, url) {
  if (!url) return '#';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('#') || url.startsWith('mailto:')) {
    return url;
  }
  return cleanUrl(`./${siteRoot}${url}`);
}

function loadNavigationConfig() {
  if (!fs.existsSync(NAVIGATION_PATH)) {
    console.log('   ℹ No navigation file found at content/navigation.json');
    return { header: [], footer: { primary: [], secondary: [] } };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(NAVIGATION_PATH, 'utf8'));

    // Backward compatibility: a bare array means header-only config.
    if (Array.isArray(parsed)) {
      return { header: parsed, footer: { primary: [], secondary: [] } };
    }

    const header = Array.isArray(parsed.header) ? parsed.header : [];
    const footer = parsed.footer && typeof parsed.footer === 'object' ? parsed.footer : {};

    return {
      header,
      footer: {
        primary: Array.isArray(footer.primary) ? footer.primary : [],
        secondary: Array.isArray(footer.secondary) ? footer.secondary : [],
      },
    };
  } catch (err) {
    console.warn(`   ⚠ Failed to parse navigation JSON: ${err.message}`);
    return { header: [], footer: { primary: [], secondary: [] } };
  }
}

function buildNavigationItems(pageData) {
  const siteRoot = pageData.siteRoot || '';
  const navConfig = loadNavigationConfig().header;

  return navConfig.map(item => {
    const activeOn = Array.isArray(item.activeOn) ? item.activeOn : [];
    const isActive = activeOn.includes(pageData.currentPage);
    const staticChildren = Array.isArray(item.children) ? item.children : [];
    const dynamicKey = item.childrenFrom;
    const dynamicChildren = typeof pageData[dynamicKey] === 'string' ? pageData[dynamicKey] : '';
    const hasChildren = staticChildren.length > 0 || Boolean(dynamicChildren);

    const liClass = [hasChildren ? 'has-dropdown' : '', isActive ? 'active' : '']
      .filter(Boolean)
      .join(' ');

    const parentHref = resolveNavUrl(siteRoot, item.url);
    const parent = `<a href="${parentHref}">${item.label}</a>`;
    if (!hasChildren) {
      return `<li class="${liClass}">${parent}</li>`;
    }

    const staticHtml = staticChildren.map(child =>
      `<li><a href="${resolveNavUrl(siteRoot, child.url)}">${child.label}</a></li>`
    ).join('\n                      ');

    const childBits = [staticHtml, dynamicChildren].filter(Boolean).join('\n                      ');
    return `<li class="${liClass}">${parent}\n                    <ul>\n                      ${childBits}\n                    </ul>\n                  </li>`;
  }).join('\n                  ');
}

function buildFooterLinks(pageData) {
  const siteRoot = pageData.siteRoot || '';
  const footer = loadNavigationConfig().footer;

  const renderLinks = (links) => links.map(link =>
    `<li><a href="${resolveNavUrl(siteRoot, link.url)}">${link.label}</a></li>`
  ).join('\n                  ');

  return {
    footerLinksPrimary: renderLinks(footer.primary),
    footerLinksSecondary: renderLinks(footer.secondary),
  };
}

function buildPage(bodyContent, pageData) {
  const baseTemplate = readTemplate('base.html');
  const assetsPrefix = pageData.assets || ASSETS_PREFIX;
  const siteRoot = pageData.siteRoot || '';
  const navItems = buildNavigationItems(pageData);
  const footerLinks = buildFooterLinks(pageData);
  return render(baseTemplate, {
    title: pageData.title || 'LOTRO Guides & News',
    metaDescription: pageData.metaDescription || 'Lord of the Rings Online guides, news, and community content.',
    bodyClass: pageData.bodyClass || 'fixed-header',
    content: bodyContent,
    assets: assetsPrefix,
    year: new Date().getFullYear().toString(),
    currentGuides: pageData.currentPage === 'guides' ? 'active' : '',
    currentNews: pageData.currentPage === 'news' ? 'active' : '',
    currentHome: pageData.currentPage === 'home' ? 'active' : '',
    currentAbout: pageData.currentPage === 'about' ? 'active' : '',
    currentItems: pageData.currentPage === 'items' ? 'active' : '',
    currentMobs: pageData.currentPage === 'mobs' ? 'active' : '',
    currentVirtues: pageData.currentPage === 'virtues' ? 'active' : '',
    currentSets: pageData.currentPage === 'sets' ? 'active' : '',
    currentDeeds: pageData.currentPage === 'deeds' ? 'active' : '',
    currentQuests: pageData.currentPage === 'quests' ? 'active' : '',
    currentInstances: pageData.currentPage === 'instances' ? 'active' : '',
    currentMap: pageData.currentPage === 'map' ? 'active' : '',
    currentMedia: pageData.currentPage === 'media' ? 'active' : '',
    siteRoot,
    navItems,
    footerLinksPrimary: footerLinks.footerLinksPrimary,
    footerLinksSecondary: footerLinks.footerLinksSecondary,
    guideNavItems: pageData.guideNavItems || '',
    newsNavItems: pageData.newsNavItems || '',
    ogUrl: pageData.ogUrl || SITE_BASE_URL,
    ogImage: pageData.ogImage || `${SITE_BASE_URL}/img/default.jpg`,
    googleAdsenseAccount: GOOGLE_ADSENSE_ACCOUNT,
    googleAnalyticsId: GOOGLE_ANALYTICS_ID,
    gtagScript: GOOGLE_ANALYTICS_ID
      ? `<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', '${GOOGLE_ANALYTICS_ID}');\n</script>`
      : '',
    gtmHeadScript: GOOGLE_TAG_MANAGER_ID
      ? `<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\nnew Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\nj=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');</script>\n<!-- End Google Tag Manager -->`
      : '',
    gtmBodyNoscript: GOOGLE_TAG_MANAGER_ID
      ? `<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GOOGLE_TAG_MANAGER_ID}"\nheight="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n<!-- End Google Tag Manager (noscript) -->`
      : '',
    googleFcScript: GOOGLE_ADSENSE_ACCOUNT
      ? `<!-- Google Consent Management (Funding Choices) -->\n<script async src="https://fundingchoicesmessages.google.com/i/${GOOGLE_ADSENSE_ACCOUNT.replace('ca-', '')}?ers=1"></script>\n<script>(function(){function signalGooglefcPresent(){if(!window.frames['googlefcPresent']){if(document.body){var i=document.createElement('iframe');i.style='width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;';i.style.display='none';i.name='googlefcPresent';document.body.appendChild(i);}else{setTimeout(signalGooglefcPresent,0);}}}signalGooglefcPresent();})();</script>`
      : '',
    googleSearchConsoleVerification: GOOGLE_SEARCH_CONSOLE_VERIFICATION
      ? `<meta name="google-site-verification" content="${GOOGLE_SEARCH_CONSOLE_VERIFICATION}">`
      : '',
    cdnScript: CDN_URL
      ? `<script>window.LOTRO_CDN='${CDN_URL}';</script>`
      : '',
    cdnPreconnect: CDN_URL
      ? `<link rel="preconnect" href="${new URL(CDN_URL).origin}" crossorigin>`
      : '',
  });
}

// ─── Content Loading ────────────────────────────────────────────────────────
function loadContent(subdir) {
  const dir = path.join(CONTENT_DIR, subdir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data, content } = matter(raw);
    let resolvedContent = content;
    if (subdir === 'guides') {
      const slug = path.basename(file, '.md');
      resolvedContent = normalizeGuideDpsTableContent(resolvedContent, file);
      resolvedContent = normalizeGuideConsumableTableContent(resolvedContent, file);
      resolvedContent = normalizeGuideInstanceLootReferenceContent(resolvedContent, file, slug);
      if (resolvedContent.includes('{{instanceLootReference}}')) {
        resolvedContent = resolvedContent.replace(/\{\{instanceLootReference\}\}/g, buildInstanceLootReferenceMarkdown(slug));
      }
    }

    const siteRoot = (subdir === 'guides' || subdir === 'news') ? '../' : '';
    const htmlContent = resolveTraitPlannerTokens(resolveCardEmbeds(resolveConsumableTokens(resolveDpsTokens(resolveMapEmbeds(marked(resolvedContent), siteRoot)))));
    const slug = path.basename(file, '.md');

    // Normalize image path to be relative to lotro/ root
    let image = data.image || null;
    if (image && image.startsWith('../lotro/')) {
      image = image.slice('../lotro/'.length);
    }

    return {
      ...data,
      slug,
      content: htmlContent,
      excerpt: data.excerpt || truncate(htmlContent, 200),
      date: data.date || '2026-01-01',
      formattedDate: formatDate(data.date || '2026-01-01'),
      category: subdir,
      url: `${subdir}/${slug}`,
      image,
      tags: data.tags || [],
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Legacy HTML Scanner ────────────────────────────────────────────────────
// Picks up scraped HTML articles in the output dir that have no markdown source

function loadLegacyHtml(subdir) {
  const htmlDir = path.join(OUTPUT_DIR, subdir);
  const mdDir = path.join(CONTENT_DIR, subdir);
  if (!fs.existsSync(htmlDir)) return [];

  const mdSlugs = new Set();
  if (fs.existsSync(mdDir)) {
    fs.readdirSync(mdDir).filter(f => f.endsWith('.md'))
      .forEach(f => mdSlugs.add(path.basename(f, '.md')));
  }

  return fs.readdirSync(htmlDir)
    .filter(f => f.endsWith('.html') && !mdSlugs.has(path.basename(f, '.html')))
    .map(file => {
      const slug = path.basename(file, '.html');
      const html = fs.readFileSync(path.join(htmlDir, file), 'utf-8');

      // Extract metadata from generated HTML
      const titleMatch = html.match(/<h2 class="post-title">([\s\S]*?)<\/h2>/);
      const dateMatch = html.match(/<span><i class="fa fa-clock-o"><\/i>\s*(.*?)<\/span>/);
      const authorMatch = html.match(/<span><i class="fa fa-user"><\/i>\s*(.*?)<\/span>/);
      const descMatch = html.match(/<meta name="description" content="(.*?)">/);

      // Only look for a featured/hero image in the post content area, not related posts
      const postContentMatch = html.match(/<div class="post post-single">([\s\S]*?)<\/div>\s*<div class="post-actions">/);
      const postContent = postContentMatch ? postContentMatch[1] : '';
      const imgMatch = postContent.match(/<img[^>]*class="[^"]*post-img[^"]*"[^>]*src="([^"]*)"/) ||
                       postContent.match(/<img[^>]*src="((?!\.\.\/img\/default\.jpg)[^"]*)"/);

      const title = titleMatch ? titleMatch[1].trim() : slug;
      const dateStr = dateMatch ? dateMatch[1].trim() : '2026-01-01';
      let image = imgMatch ? imgMatch[1] : null;
      if (image && image.startsWith('../')) image = image.slice(3);

      return {
        title,
        slug,
        content: '',
        excerpt: descMatch ? descMatch[1] : '',
        date: dateStr,
        formattedDate: dateStr,
        category: subdir,
        url: `${subdir}/${slug}`,
        image,
        tags: [],
        author: authorMatch ? authorMatch[1].trim() : 'LOTRO.com',
        legacy: true,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Nav Generation ─────────────────────────────────────────────────────────

function buildNavItems(posts, siteRoot, limit) {
  return posts.slice(0, limit).map(p =>
    `<li><a href="${cleanUrl('./' + siteRoot + p.url)}">${p.title}</a></li>`
  ).join('\n                      ');
}

function classifyGuide(post) {
  const tags = (post.tags || []).map(t => String(t).toLowerCase());
  const title = String(post.title || '').toLowerCase();

  const hasAny = (words) => words.some(w => tags.includes(w) || title.includes(w));

  if (hasAny(['raid', 't2', 't2c', 'instance', 'dungeon'])) return 'raid';
  if (hasAny(['class', 'build', 'hunter', 'champion', 'captain', 'burglar', 'minstrel', 'warden', 'runekeeper', 'rune-keeper', 'beorning', 'mariner', 'lore-master', 'guardian'])) return 'class';
  if (hasAny(['leveling', 'levelling', 'beginner', 'new-player', 'getting-started', 'starter-zones'])) return 'leveling';
  if (hasAny(['crafting', 'legendary-items', 'li', 'systems'])) return 'systems';
  return 'general';
}

function buildGuideQuickNavLinks(siteRoot) {
  const root = cleanUrl(`./${siteRoot}guides.html`);
  const links = [
    { key: 'raid', label: 'Raid Guides' },
    { key: 'class', label: 'Class Guides' },
    { key: 'leveling', label: 'Leveling Guides' },
    { key: 'systems', label: 'Systems Guides' },
    { key: 'general', label: 'General Guides' },
  ];

  return links.map(l => `<li><a href="${root}?filter=${l.key}">${l.label}</a></li>`)
    .join('\n                      ');
}

// ─── Page Generators ────────────────────────────────────────────────────────

function buildIndex(allPosts, navData) {
  const template = readTemplate('index-content.html');
  const latestPosts = allPosts.slice(0, 6);

  // Featured post (most recent)
  const featured = latestPosts[0];
  const featuredHtml = featured ? render(readTemplate('partials/featured-card.html'), {
    url: featured.url,
    image: featured.image || 'img/default.jpg',
    title: featured.title,
    slug: featured.slug,
    date: featured.formattedDate,
    author: featured.author || 'Amdor',
    excerpt: featured.excerpt,
    category: featured.category === 'guides' ? 'Guide' : 'News',
    categoryClass: featured.category === 'guides' ? 'badge-success' : 'badge-primary',
    assets: ASSETS_PREFIX,
  }) : '';

  // Recent posts grid
  const recentPosts = latestPosts.slice(1);
  const cardTemplate = readTemplate('partials/post-card.html');
  const recentHtml = recentPosts.map(post => render(cardTemplate, {
    url: post.url,
    image: post.image || 'img/default.jpg',
    title: post.title,
    slug: post.slug,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    excerpt: post.excerpt,
    category: post.category === 'guides' ? 'Guide' : 'News',
    categoryClass: post.category === 'guides' ? 'badge-success' : 'badge-primary',
    assets: ASSETS_PREFIX,
  })).join('\n');

  const body = render(template, {
    featuredPost: featuredHtml,
    recentPosts: recentHtml,
    assets: ASSETS_PREFIX,
    siteRoot: '',
  });

  let html = buildPage(body, { title: 'LOTRO Guides - LOTRO Fansite', currentPage: 'home', ...navData });
  if (CUSDIS_APP_ID) {
    html = html.replace('</body>',
      `  <script defer data-host="${CUSDIS_HOST}" data-app-id="${CUSDIS_APP_ID}" src="${CUSDIS_HOST}/js/cusdis-count.umd.js"></script>\n  </body>`);
  }
  // Buy Me a Coffee widget
  html = html.replace('</body>',
    `  <script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js" data-id="lotroguides" data-description="Support me on Buy me a coffee!" data-message="" data-color="#FF813F" data-position="Right" data-x_margin="18" data-y_margin="18"></script>\n  </body>`);
  return html;
}

function buildListing(posts, category, navData) {
  const template = readTemplate('listing-content.html');
  const cardTemplate = readTemplate('partials/post-card.html');

  const categoryName = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  const categoryIcon = category === 'guides' ? 'fa-book' : 'fa-newspaper-o';

  const postsHtml = posts.map(post => {
    const guideType = category === 'guides' ? classifyGuide(post) : '';
    const tagsAttr = (post.tags || []).map(t => String(t).toLowerCase()).join(',');
    const cardAttrs = category === 'guides'
      ? ` data-guide-type="${guideType}" data-guide-tags="${tagsAttr}"`
      : '';

    return render(cardTemplate, {
    url: post.url,
    image: post.image || 'img/default.jpg',
    title: post.title,
    slug: post.slug,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    excerpt: post.excerpt,
    category: post.category === 'guides' ? 'Guide' : 'News',
    categoryClass: post.category === 'guides' ? 'badge-success' : 'badge-primary',
    cardAttrs,
    assets: ASSETS_PREFIX,
    });
  }).join('\n');

  let quickNav = '';
  if (category === 'guides') {
    quickNav = `
        <div class="m-b-20" id="guides-quick-nav">
          <a class="btn btn-sm btn-default" href="guides">All Guides</a>
          <a class="btn btn-sm btn-default" href="guides?filter=raid">Raid Guides</a>
          <a class="btn btn-sm btn-default" href="guides?filter=class">Class Guides</a>
          <a class="btn btn-sm btn-default" href="guides?filter=leveling">Leveling Guides</a>
          <a class="btn btn-sm btn-default" href="guides?filter=systems">Systems Guides</a>
          <a class="btn btn-sm btn-default" href="guides?filter=general">General Guides</a>
        </div>`;
  }

  const body = render(template, {
    categoryName,
    categoryIcon,
    quickNav,
    posts: postsHtml,
    assets: ASSETS_PREFIX,
  });

  const pageTitle = category === 'guides' ? 'Guides & Walkthroughs' : 'Latest News';
  let html = buildPage(body, {
    title: `${pageTitle} - LOTRO Guides`,
    currentPage: category,
    ...navData,
  });

  if (category === 'guides') {
    const filterScript = [
      '<script>',
      '(function(){',
      '  var params = new URLSearchParams(window.location.search);',
      '  var filter = (params.get("filter") || "all").toLowerCase();',
      '  if (!filter || filter === "all") return;',
      '  var cards = document.querySelectorAll("[data-guide-type]");',
      '  var shown = 0;',
      '  for (var i = 0; i < cards.length; i++) {',
      '    var card = cards[i];',
      '    var type = (card.getAttribute("data-guide-type") || "").toLowerCase();',
      '    var keep = type === filter;',
      '    card.style.display = keep ? "" : "none";',
      '    if (keep) shown++;',
      '  }',
      '  var quickNav = document.getElementById("guides-quick-nav");',
      '  if (quickNav) {',
      '    var links = quickNav.querySelectorAll("a");',
      '    for (var j = 0; j < links.length; j++) {',
      '      var href = (links[j].getAttribute("href") || "").toLowerCase();',
      '      if (href.indexOf("filter=" + filter) !== -1) links[j].classList.add("btn-primary");',
      '    }',
      '  }',
      '})();',
      '</script>',
    ].join('\n    ');
    html = html.replace('</body>', `    ${filterScript}\n  </body>`);
  }

  if (CUSDIS_APP_ID) {
    html = html.replace('</body>',
      `  <script defer data-host="${CUSDIS_HOST}" data-app-id="${CUSDIS_APP_ID}" src="${CUSDIS_HOST}/js/cusdis-count.umd.js"></script>\n  </body>`);
  }

  return html;
}

function buildArticle(post, relatedPosts, navData) {
  const template = readTemplate('article-content.html');
  const articleAssets = ASSETS_PREFIX + '/..';

  const tagsHtml = post.tags.map(t => `<a href="#">#${t}</a>`).join('\n                ');

  const relatedTemplate = readTemplate('partials/related-card.html');
  const relatedHtml = relatedPosts.slice(0, 4).map(rp => {
    const rpImg = rp.image
      ? (rp.image.startsWith('http') ? rp.image : `../${rp.image}`)
      : '../img/default.jpg';
    return render(relatedTemplate, {
      url: `../${rp.url}`,
      image: rpImg,
      title: rp.title,
      slug: rp.slug,
      date: rp.formattedDate,
      excerpt: rp.excerpt,
      assets: articleAssets,
    });
  }).join('\n');

  const postImg = post.image
    ? (post.image.startsWith('http') ? post.image : `../${post.image}`)
    : '../img/default.jpg';
  const articleUrl = `${SITE_BASE_URL}/${post.url}`;
  const encodedTitle = encodeURIComponent(post.title);
  const ogImage = post.image && post.image.startsWith('http')
    ? post.image
    : `${SITE_BASE_URL}/${post.image || 'img/default.jpg'}`;
  const comments = buildCommentsSection(post.slug, articleUrl, post.title);
  const body = render(template, {
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    image: postImg,
    content: expandLootAccordionPlaceholders(autoLinkQuests(autoLinkDeeds(autoLinkSets(autoLinkMobs(autoLinkItems(post.content)))))),
    tags: tagsHtml,
    category: post.category === 'guides' ? 'Guides' : 'News',
    categoryUrl: post.category === 'guides' ? '../guides' : '../news',
    relatedPosts: relatedHtml,
    assets: articleAssets,
    articleUrl,
    encodedTitle,
    comments,
  });

  let html = buildPage(body, {
    title: `${post.title} - LOTRO Guides`,
    metaDescription: post.excerpt,
    currentPage: post.category,
    assets: articleAssets,
    siteRoot: '../',
    ogUrl: articleUrl,
    ogImage,
    ...navData,
  });

  if (CUSDIS_APP_ID) {
    html = html.replace('</body>',
      `  <script defer data-host="${CUSDIS_HOST}" data-app-id="${CUSDIS_APP_ID}" src="${CUSDIS_HOST}/js/cusdis-count.umd.js"></script>\n  </body>`);
  }

  return html;
}

// ─── Items Database Page ────────────────────────────────────────────────────

function buildItemsPage(navData) {
  if (!Object.keys(itemIndex).length) return;

  // Build piece-id → {setId, setName} lookup from sets data
  const pieceToSet = {};
  const setsPath = path.join(LORE_DIR, 'sets.json');
  if (fs.existsSync(setsPath)) {
    const sets = JSON.parse(fs.readFileSync(setsPath, 'utf8'));
    for (const s of sets) {
      for (const p of (s.pieces || [])) {
        pieceToSet[p.id] = { sid: s.id, sn: s.name };
      }
    }
  }

  // Load icon map (itemId → iconId) from extract-icons output
  let iconMap = {};
  const iconMapPath = path.join(LORE_DIR, 'icon-map.json');
  if (fs.existsSync(iconMapPath)) {
    iconMap = JSON.parse(fs.readFileSync(iconMapPath, 'utf8'));
    console.log(`   Loaded icon map with ${Object.keys(iconMap).length} entries`);
  }

  // Build compact client-side JSON: array of {id, n, t, st, q, lv, sl, stats:[{s,v}], sid?, sn?, dt?, ic?}
  const clientItems = Object.entries(itemIndex)
    .filter(([, v]) => v.type !== 'mob')          // exclude mobs from item DB
    .map(([name, v]) => {
      const row = { id: v.id, n: name, t: v.type };
      if (v.subtype) row.st = v.subtype;
      if (v.quality) row.q = v.quality;
      if (v.level) row.lv = v.level;
      if (v.slot) row.sl = v.slot;
      if (v.stats && v.stats.length) {
        row.stats = v.stats.filter(s => s.value !== 0).map(s => ({ s: s.stat, v: s.value }));
      }
      // Cross-link: set membership for equipment items
      const setInfo = pieceToSet[v.id];
      if (setInfo) { row.sid = setInfo.sid; row.sn = setInfo.sn; }
      // Cross-link: deed type for deed entries
      if (v.deedType) row.dt = v.deedType;
      // Icon: from item-index (extract-lore) or icon-map (extract-icons)
      const ic = v.icon || iconMap[v.id];
      if (ic) row.ic = ic;
      return row;
    });

  // Inject quest reward items that aren't already in the item index
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (fs.existsSync(questsPath)) {
    const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
    const existingIds = new Set(clientItems.map(r => r.id));
    const existingNames = new Set(clientItems.map(r => r.n));
    const rewardMap = new Map(); // id → {id, name, count}
    for (const q of quests) {
      if (q.rw && q.rw.it) {
        for (const it of q.rw.it) {
          if (existingIds.has(it.id) || existingNames.has(it.n)) continue;
          const entry = rewardMap.get(it.id) || { id: it.id, n: it.n, count: 0 };
          entry.count++;
          rewardMap.set(it.id, entry);
        }
      }
    }
    let added = 0;
    for (const [, v] of rewardMap) {
      const row = { id: v.id, n: v.n, t: 'quest-reward' };
      const ic = iconMap[v.id];
      if (ic) row.ic = ic;
      clientItems.push(row);
      added++;
    }
    if (added) console.log(`   + ${added} quest reward items added to item DB`);
  }

  const itemCount = clientItems.length;

  // Write chunked JSON data files for progressive loading
  const CHUNK_SIZE = 5000;
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  const totalChunks = Math.ceil(clientItems.length / CHUNK_SIZE);
  for (let i = 0; i < totalChunks; i++) {
    const chunk = clientItems.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'data', `items-db-${i}.json`),
      JSON.stringify(chunk)
    );
  }
  // Also write a small manifest so the client knows how many chunks exist
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'items-db-manifest.json'),
    JSON.stringify({ totalChunks, totalItems: itemCount, chunkSize: CHUNK_SIZE })
  );
  // Keep the full file for backward compatibility (direct links, etc.)
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'items-db.json'),
    JSON.stringify(clientItems)
  );

  // Build the page from template
  const template = readTemplate('items-content.html');
  const body = render(template, { itemCount: itemCount.toLocaleString() });

  // Wrap in base.html with extra scripts for DataTables + items JS
  let html = buildPage(body, {
    title: 'Content Database - LOTRO Guides',
    metaDescription: `Browse ${itemCount.toLocaleString()} items from the LotRO Companion database. Search, filter, and view stats for weapons, armor, consumables, and more.`,
    currentPage: 'items',
    ...navData,
  });

  // Inject DataTables CSS in <head> and scripts before </body>
  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script src="./js/items-db.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  // Progressive chunked loading',
    '  $.getJSON(_cdn + "data/items-db-manifest.json", function(manifest) {',
    '    $.getJSON(_cdn + "data/items-db-0.json", function(firstChunk) {',
    '      window.LOTRO_ITEMS_DB = firstChunk;',
    '      if (window.LOTRO_ITEMS_INIT) window.LOTRO_ITEMS_INIT();',
    '      // Load remaining chunks in background',
    '      if (manifest.totalChunks > 1 && window.LOTRO_ITEMS_ADD_CHUNK) {',
    '        var loaded = 1;',
    '        (function loadNext(i) {',
    '          if (i >= manifest.totalChunks) return;',
    '          $.getJSON(_cdn + "data/items-db-" + i + ".json", function(chunk) {',
    '            loaded++;',
    '            window.LOTRO_ITEMS_ADD_CHUNK(chunk, loaded, manifest.totalChunks);',
    '            loadNext(i + 1);',
    '          });',
    '        })(1);',
    '      }',
    '    });',
    '  });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'items.html'), html);
}

// ─── Mobs Database Page ─────────────────────────────────────────────────────

function buildMobsPage(navData) {
  if (!Object.keys(itemIndex).length) return;

  // Build compact client-side JSON: array of {id, n, g, sp}
  const clientMobs = Object.entries(itemIndex)
    .filter(([, v]) => v.type === 'mob')
    .map(([name, v]) => {
      const row = { id: v.id, n: name };
      if (v.genus) row.g = v.genus;
      if (v.species) row.sp = v.species;
      return row;
    });

  const mobCount = clientMobs.length;

  // Build map overlays for mobs from map marker DID/label matches.
  const markerIndex = loadMapMarkerIndex();
  const mobOverlay = {};
  for (const mob of clientMobs) {
    const loc = findMarkerLocation(markerIndex, mob.id, mob.n);
    if (!loc) continue;
    mobOverlay[mob.id] = { n: mob.n, map: loc.map, lng: loc.lng, lat: loc.lat, l: loc.l || mob.n };
  }

  // Write the JSON data file
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'mobs-db.json'),
    JSON.stringify(clientMobs)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'mob-overlay.json'),
    JSON.stringify(mobOverlay)
  );

  // Build the page from template
  const template = readTemplate('mobs-content.html');
  const body = render(template, { mobCount: mobCount.toLocaleString() });

  let html = buildPage(body, {
    title: 'Mob Database - LOTRO Guides',
    metaDescription: `Browse ${mobCount.toLocaleString()} enemies from the LotRO Companion database. Search and filter mobs by genus and species.`,
    currentPage: 'mobs',
    ...navData,
  });

  // Inject DataTables CSS in <head> and scripts before </body>
  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  // Load mobs data + map overlay, then init',
    '  $.when($.getJSON(_cdn + "data/mobs-db.json"), $.getJSON(_cdn + "data/mob-overlay.json"))',
    '    .done(function(mobsRes, overlayRes) {',
    '      window.LOTRO_MOBS_DB = mobsRes[0];',
    '      window.LOTRO_MOB_OVERLAY = overlayRes[0] || {};',
    '      $.getScript("./js/mobs-db.js", function() {',
    '        if (window.LOTRO_MOBS_INIT) window.LOTRO_MOBS_INIT();',
    '      });',
    '    });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'mobs.html'), html);
}

// ─── Virtues Database Page ───────────────────────────────────────────────────

function buildVirtuesPage(navData) {
  const virtuesPath = path.join(LORE_DIR, 'virtues.json');
  if (!fs.existsSync(virtuesPath)) return;

  const virtues = JSON.parse(fs.readFileSync(virtuesPath, 'utf8'));

  // Rank 100 stat values overlay — authoritative game data
  const virtueR100 = {
    'Charity':       { sv: [{ s: 'Resistance', v: 30212 }, { s: 'Physical Mitigation', v: 6670 }, { s: 'Vitality', v: 893 }], passive: 'Morale' },
    'Compassion':    { sv: [{ s: 'Physical Mitigation', v: 13357 }, { s: 'Tactical Mitigation', v: 6670 }, { s: 'Armour', v: 2163 }], passive: 'Morale' },
    'Confidence':    { sv: [{ s: 'Critical Rating', v: 16804 }, { s: 'Finesse', v: 11086 }, { s: 'Evade Rating', v: 6993 }], passive: 'Mastery' },
    'Determination': { sv: [{ s: 'Agility', v: 3088 }, { s: 'Physical Mastery', v: 6940 }, { s: 'Critical Rating', v: 5024 }], passive: 'Mastery' },
    'Discipline':    { sv: [{ s: 'Resistance', v: 30212 }, { s: 'Incoming Healing Rating', v: 11086 }, { s: 'Physical Mitigation', v: 4007 }], passive: 'Morale' },
    'Empathy':       { sv: [{ s: 'Armour', v: 7206 }, { s: 'Critical Defence', v: 11086 }, { s: 'Resistance', v: 9051 }], passive: 'Morale' },
    'Fidelity':      { sv: [{ s: 'Tactical Mitigation', v: 13357 }, { s: 'Vitality', v: 1493 }, { s: 'Physical Mitigation', v: 4007 }], passive: 'Morale' },
    'Fortitude':     { sv: [{ s: 'Morale', v: 12765 }, { s: 'Critical Defence', v: 11086 }, { s: 'Resistance', v: 9051 }], passive: 'Morale' },
    'Honesty':       { sv: [{ s: 'Tactical Mastery', v: 13933 }, { s: 'Will', v: 1549 }, { s: 'Critical Rating', v: 5024 }], passive: 'Mastery' },
    'Honour':        { sv: [{ s: 'Morale', v: 12765 }, { s: 'Tactical Mitigation', v: 6670 }, { s: 'Critical Defence', v: 6651 }], passive: 'Morale' },
    'Idealism':      { sv: [{ s: 'Fate', v: 2508 }, { s: 'Incoming Healing Rating', v: 11086 }, { s: 'Morale', v: 3830 }], passive: 'Morale' },
    'Innocence':     { sv: [{ s: 'Physical Mitigation', v: 13357 }, { s: 'Resistance', v: 15106 }, { s: 'Tactical Mitigation', v: 4007 }], passive: 'Morale' },
    'Justice':       { sv: [{ s: 'In-Combat Morale Regen', v: 255.306 }, { s: 'Morale', v: 6383 }, { s: 'Tactical Mitigation', v: 4007 }], passive: 'Morale' },
    'Loyalty':       { sv: [{ s: 'Vitality', v: 2978 }, { s: 'Armour', v: 3603 }, { s: 'Incoming Healing Rating', v: 6651 }], passive: 'Morale' },
    'Mercy':         { sv: [{ s: 'Evade Rating', v: 23333 }, { s: 'Fate', v: 1254 }, { s: 'Vitality', v: 893 }], passive: 'Morale' },
    'Patience':      { sv: [{ s: 'Power', v: 2006.531 }, { s: 'Evade Rating', v: 11710 }, { s: 'Critical Rating', v: 5024 }], passive: 'Morale' },
    'Tolerance':     { sv: [{ s: 'Tactical Mitigation', v: 13357 }, { s: 'Resistance', v: 15106 }, { s: 'Physical Mitigation', v: 4007 }], passive: 'Morale' },
    'Valour':        { sv: [{ s: 'Physical Mastery', v: 13933 }, { s: 'Finesse', v: 11086 }, { s: 'Critical Rating', v: 5024 }], passive: 'Mastery' },
    'Wisdom':        { sv: [{ s: 'Will', v: 3088 }, { s: 'Tactical Mastery', v: 6940 }, { s: 'Finesse', v: 6651 }], passive: 'Mastery' },
    'Wit':           { sv: [{ s: 'Finesse', v: 22171 }, { s: 'Critical Rating', v: 8376 }, { s: 'Physical Mastery', v: 4171 }, { s: 'Tactical Mastery', v: 4171 }], passive: 'Mastery' },
    'Zeal':          { sv: [{ s: 'Might', v: 3088 }, { s: 'Physical Mastery', v: 6940 }, { s: 'Critical Rating', v: 5024 }], passive: 'Mastery' },
  };

  // Compact format: {id, n, sv:[{s,v}], mr, ic, passive?}
  const clientVirtues = virtues.map(v => {
    const overlay = virtueR100[v.name];
    const row = {
      id: v.id,
      n: v.name,
      sv: overlay ? overlay.sv : (v.stats || []).map(s => ({ s, v: 0 })),
      mr: 100,  // Current in-game max virtue rank
    };
    if (overlay && overlay.passive) row.passive = overlay.passive;
    if (v.iconId) row.ic = v.iconId;
    return row;
  });

  const count = clientVirtues.length;

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'virtues-db.json'),
    JSON.stringify(clientVirtues)
  );

  const template = readTemplate('virtues-content.html');
  const body = render(template, { virtueCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Virtue Database - LOTRO Guides',
    metaDescription: `Browse all ${count} virtues from the LotRO Companion database. View stats and ranks for every virtue in Lord of the Rings Online.`,
    currentPage: 'virtues',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  $.getJSON(_cdn + "data/virtues-db.json", function(data) {',
    '    window.LOTRO_VIRTUES_DB = data;',
    '    $.getScript("./js/virtues-db.js", function() {',
    '      if (window.LOTRO_VIRTUES_INIT) window.LOTRO_VIRTUES_INIT();',
    '    });',
    '  });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'virtues.html'), html);
}

// ─── Sets Database Page ─────────────────────────────────────────────────────

function buildSetsPage(navData) {
  const setsPath = path.join(LORE_DIR, 'sets.json');
  if (!fs.existsSync(setsPath)) return;

  const sets = JSON.parse(fs.readFileSync(setsPath, 'utf8'));

  // Load icon map for piece icons
  let iconMap = {};
  const iconMapPath = path.join(LORE_DIR, 'icon-map.json');
  if (fs.existsSync(iconMapPath)) {
    iconMap = JSON.parse(fs.readFileSync(iconMapPath, 'utf8'));
  }

  // Compact format: {id, n, lv, ml, pc:[{id,n,ic}], bn:[{c, st:[{s,v}]}]}
  const clientSets = sets.map(s => {
    const row = { id: s.id, n: s.name };
    if (s.level) row.lv = s.level;
    if (s.maxLevel) row.ml = s.maxLevel;
    if (s.pieces && s.pieces.length) {
      row.pc = s.pieces.map(p => {
        const piece = { id: p.id, n: p.name };
        const ic = iconMap[p.id];
        if (ic) piece.ic = ic;
        return piece;
      });
    }
    if (s.bonuses && s.bonuses.length) {
      row.bn = s.bonuses.map(b => ({
        c: b.count,
        st: (b.stats || []).map(st => ({ s: st.stat, v: st.value })),
      }));
    }
    return row;
  });

  const count = clientSets.length;

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'sets-db.json'),
    JSON.stringify(clientSets)
  );

  const template = readTemplate('sets-content.html');
  const body = render(template, { setCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Set Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} equipment sets from the LotRO Companion database. View set bonuses, pieces, and level requirements.`,
    currentPage: 'sets',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  $.getJSON(_cdn + "data/sets-db.json", function(data) {',
    '    window.LOTRO_SETS_DB = data;',
    '    $.getScript("./js/sets-db.js", function() {',
    '      if (window.LOTRO_SETS_INIT) window.LOTRO_SETS_INIT();',
    '    });',
    '  });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sets.html'), html);
}

// ─── Deeds Database Page ────────────────────────────────────────────────────

function buildDeedsPage(navData) {
  const deedsPath = path.join(LORE_DIR, 'deeds.json');
  if (!fs.existsSync(deedsPath)) return;

  const deeds = JSON.parse(fs.readFileSync(deedsPath, 'utf8'));

  // Build lookup maps for resolving achievableId references
  const deedNameById = {};
  for (const d of deeds) deedNameById[d.id] = d.name;

  const questsPath = path.join(LORE_DIR, 'quests.json');
  const questNameById = {};
  if (fs.existsSync(questsPath)) {
    const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
    for (const q of quests) questNameById[q.id] = q.n || q.name;
  }

  // Compact format: {id, n, tp, lv, rw:[{t,v}], cl?, obj?:[{...}]}
  const clientDeeds = deeds.map(d => {
    const row = { id: d.id, n: d.name, tp: d.type || 'Other' };
    if (d.level) row.lv = d.level;
    if (d.region) row.rg = d.region;
    if (d.rewards && d.rewards.length) {
      row.rw = d.rewards.map(r => {
        const cr = { t: r.type, v: r.value };
        if (r.id) cr.i = r.id;
        return cr;
      });
    }
    if (d.requiredClass) row.cl = d.requiredClass;

    // Compact objectives
    if (d.objectives && d.objectives.length) {
      row.obj = d.objectives.map(o => {
        if (o.type === 'kill') {
          const r = { t: 'kill' };
          if (o.mobId) { r.mid = o.mobId; r.mn = o.mobName; }
          if (o.count) r.c = o.count;
          if (o.zone) r.z = o.zone;
          return r;
        }
        if (o.type === 'complete') {
          const r = { t: 'complete', aid: o.achievableId };
          // Resolve name: check deeds first, then quests
          if (deedNameById[o.achievableId]) {
            r.an = deedNameById[o.achievableId];
            r.ad = true; // is a deed
          } else if (questNameById[o.achievableId]) {
            r.an = questNameById[o.achievableId];
            r.aq = true; // is a quest
          }
          return r;
        }
        if (o.type === 'questCount') return { t: 'qc', c: o.count };
        if (o.type === 'landmark') return { t: 'lm', n: o.name };
        if (o.type === 'item') return { t: 'item', n: o.name, i: o.itemId };
        if (o.type === 'useItem') return { t: 'use', n: o.name, i: o.itemId };
        if (o.type === 'npc') return { t: 'npc', n: o.name };
        if (o.type === 'skill') return { t: 'skill', c: o.count };
        if (o.type === 'emote') return { t: 'emote', n: o.name, c: o.count };
        if (o.type === 'explore') return { t: 'explore', c: o.count };
        if (o.type === 'faction') return { t: 'fac', n: o.name, tier: o.tier };
        return o;
      });
    }

    return row;
  });

  // Build map overlays for deeds from objective links to maps/quests/mobs/landmarks.
  const markerIndex = loadMapMarkerIndex();
  const questOverlayPath = path.join(LORE_DIR, 'quest-overlay.json');
  const questOverlay = fs.existsSync(questOverlayPath)
    ? JSON.parse(fs.readFileSync(questOverlayPath, 'utf8'))
    : {};
  const deedOverlay = {};

  for (const deed of clientDeeds) {
    if (!deed.obj || !deed.obj.length) continue;

    const pts = [];
    const maps = new Set();
    const seen = new Set();

    for (let i = 0; i < deed.obj.length; i++) {
      const o = deed.obj[i];
      let loc = null;

      if (o.t === 'complete' && o.aq && o.aid && questOverlay[o.aid]) {
        const q = questOverlay[o.aid];
        if (q.maps && q.maps.length && q.steps && q.steps.length && q.steps[0].pts && q.steps[0].pts.length) {
          const pt = q.steps[0].pts[0];
          loc = {
            map: q.maps[0],
            lng: pt[0],
            lat: pt[1],
            l: o.an || q.n || deed.n,
          };
        }
      } else if (o.t === 'kill') {
        loc = findMarkerLocation(markerIndex, o.mid, o.mn);
      } else if (o.t === 'lm' || o.t === 'npc' || o.t === 'item' || o.t === 'use') {
        loc = findMarkerLocation(markerIndex, '', o.n);
      }

      if (!loc) continue;

      const key = `${loc.map}|${loc.lng}|${loc.lat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      maps.add(loc.map);
      pts.push({
        i: i + 1,
        map: loc.map,
        lng: loc.lng,
        lat: loc.lat,
        t: o.an || o.mn || o.n || deed.n,
      });
      if (pts.length >= 12) break;
    }

    if (pts.length) {
      deedOverlay[deed.id] = {
        n: deed.n,
        lv: deed.lv || 0,
        tp: deed.tp || 'Other',
        maps: Array.from(maps),
        pts,
      };
    }
  }

  const count = clientDeeds.length;

  // Collect unique regions for the filter dropdown
  const regionSet = new Set();
  for (const d of clientDeeds) {
    if (d.rg) regionSet.add(d.rg);
  }
  const regions = [...regionSet].sort();
  const regionOptions = regions.map(r => `              <option value="${r}">${r}</option>`).join('\n');

  ensureDir(path.join(OUTPUT_DIR, 'data'));

  // ── Deed index for DO Function (id, name, type, level, region, class, rewards) ──
  const deedSearchIndex = clientDeeds.map(d => {
    const entry = { id: d.id, n: d.n };
    if (d.tp) entry.tp = d.tp;
    if (d.lv) entry.lv = d.lv;
    if (d.rg) entry.rg = d.rg;
    if (d.cl) entry.cl = d.cl;
    if (d.rw && d.rw.length) entry.rw = d.rw;
    return entry;
  });
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deed-index.json'),
    JSON.stringify(deedSearchIndex)
  );
  console.log(`   → data/deed-index.json (${deedSearchIndex.length} entries)`);

  // ── Per-deed detail files for lazy modal loading ──
  const deedsOutDir = path.join(OUTPUT_DIR, 'data', 'lore', 'deeds');
  if (!fs.existsSync(deedsOutDir)) fs.mkdirSync(deedsOutDir, { recursive: true });
  // Remove stale deed files first
  for (const f of fs.readdirSync(deedsOutDir)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(deedsOutDir, f));
  }
  let deedDetailCount = 0;
  for (const d of clientDeeds) {
    // Per-deed file: objectives, full rewards, overlay data
    const detail = {};
    if (d.obj && d.obj.length) detail.obj = d.obj;
    if (d.rw && d.rw.length) detail.rw = d.rw;
    if (d.cl) detail.cl = d.cl;
    if (deedOverlay[d.id]) detail.overlay = deedOverlay[d.id];
    // Only write a file if there's meaningful detail
    if (Object.keys(detail).length) {
      fs.writeFileSync(path.join(deedsOutDir, `${d.id}.json`), JSON.stringify(detail));
      deedDetailCount++;
    }
  }
  console.log(`   → data/lore/deeds/ (${deedDetailCount} per-deed files)`);

  // ── Deed overlay index (lightweight map of deed IDs with overlay data) ──
  const deedOverlayIndex = {};
  for (const deedId of Object.keys(deedOverlay)) {
    deedOverlayIndex[deedId] = 1;
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deed-overlay-index.json'),
    JSON.stringify(deedOverlayIndex)
  );
  console.log(`   → data/deed-overlay-index.json (${Object.keys(deedOverlayIndex).length} entries)`);

  // ── Slim deeds-db.json: strip objectives (loaded per-deed on demand) ──
  const slimDeeds = clientDeeds.map(d => {
    const slim = { id: d.id, n: d.n };
    if (d.tp) slim.tp = d.tp;
    if (d.lv) slim.lv = d.lv;
    if (d.rg) slim.rg = d.rg;
    if (d.cl) slim.cl = d.cl;
    if (d.rw && d.rw.length) slim.rw = d.rw;
    return slim;
  });
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deeds-db.json'),
    JSON.stringify(slimDeeds)
  );
  // Keep full deed-overlay.json for map page backward compatibility
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deed-overlay.json'),
    JSON.stringify(deedOverlay)
  );

  // Copy icon-map for client-side icon lookups (shared by deeds + quests pages)
  const iconMapSrc = path.join(LORE_DIR, 'icon-map.json');
  if (fs.existsSync(iconMapSrc)) {
    fs.copyFileSync(iconMapSrc, path.join(OUTPUT_DIR, 'data', 'icon-map.json'));
  }

  const template = readTemplate('deeds-content.html');
  const body = render(template, { deedCount: count.toLocaleString(), regionOptions });

  let html = buildPage(body, {
    title: 'Deed Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} deeds from the LotRO Companion database. Search by type, rewards, and class requirements.`,
    currentPage: 'deeds',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  $.when($.getJSON(_cdn + "data/deeds-db.json"), $.getJSON(_cdn + "data/deed-overlay-index.json"), $.getJSON(_cdn + "data/icon-map.json"))',
    '    .done(function(deedsRes, overlayRes, iconRes) {',
    '      window.LOTRO_DEEDS_DB = deedsRes[0];',
    '      window.LOTRO_DEED_OVERLAY = overlayRes[0] || {};',
    '      window.LOTRO_ICON_MAP = iconRes[0] || {};',
    '      $.getScript("./js/deeds-db.js", function() {',
    '        if (window.LOTRO_DEEDS_INIT) window.LOTRO_DEEDS_INIT();',
    '      });',
    '    });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'deeds.html'), html);
}

// ─── Quest Database Page ────────────────────────────────────────────────────

function buildQuestsPage(navData) {
  const questsPath = path.join(LORE_DIR, 'quests.json');
  if (!fs.existsSync(questsPath)) return;

  const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
  const count = quests.length;

  // Write quest data for client-side loading
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'quests-db.json'),
    JSON.stringify(quests)
  );

  // Write quest overlay index (quest IDs with plottable objectives — lightweight check for map link)
  const questOverlayPath = path.join(LORE_DIR, 'quest-overlay.json');
  const questOverlay = fs.existsSync(questOverlayPath)
    ? JSON.parse(fs.readFileSync(questOverlayPath, 'utf8'))
    : {};
  const questOverlayKeys = Object.keys(questOverlay);
  const questOverlayIndex = {};
  for (const qid of questOverlayKeys) {
    questOverlayIndex[qid] = 1;
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'quest-overlay-index.json'),
    JSON.stringify(questOverlayIndex)
  );

  // Split quest-overlay into per-quest static files for on-demand map loading.
  // Each file is ~641 bytes on average vs the 7.9 MB monolith.
  const questsOutDir = path.join(OUTPUT_DIR, 'data', 'lore', 'quests');
  if (!fs.existsSync(questsOutDir)) fs.mkdirSync(questsOutDir, { recursive: true });
  // Remove stale quest files first
  for (const f of fs.readdirSync(questsOutDir)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(questsOutDir, f));
  }
  for (const [qid, qdata] of Object.entries(questOverlay)) {
    fs.writeFileSync(path.join(questsOutDir, `${qid}.json`), JSON.stringify(qdata));
  }
  console.log(`   → data/lore/quests/ (${questOverlayKeys.length} per-quest files)`);

  // Build lightweight quest search index (id + name + level only).
  // Written to data/ so it gets synced to CDN. The DO Function fetches it at runtime.
  const questSearchIndex = questOverlayKeys.map(id => {
    const q = questOverlay[id];
    return { id, n: q.n || '', lv: q.lv || 0 };
  });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'data', 'quest-index.json'), JSON.stringify(questSearchIndex));
  console.log(`   → data/quest-index.json (${questSearchIndex.length} entries)`);

  // Copy POI cross-reference files for map enrichment
  const poiFiles = ['quest-poi.json', 'map-quests.json', 'npcs.json'];
  for (const f of poiFiles) {
    const src = path.join(LORE_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(OUTPUT_DIR, 'data', f));
    }
  }


  const template = readTemplate('quests-content.html');
  const body = render(template, { questCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Quest Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} quests from the LotRO Companion database. Search by name, category, level, and quest giver.`,
    currentPage: 'quests',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  $.when(',
    '    $.getJSON(_cdn + "data/icon-map.json"),',
    '    $.getJSON(_cdn + "data/quest-overlay-index.json")',
    '  ).done(function(iRes, oRes) {',
    '    window.LOTRO_ICON_MAP = iRes[0] || {};',
    '    window.LOTRO_QUEST_OVERLAY = oRes[0] || {};',
    '    $.getScript("./js/quests-db.js", function() {',
    '      if (window.LOTRO_QUESTS_INIT) window.LOTRO_QUESTS_INIT();',
    '    });',
    '  });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'quests.html'), html);
}

// ─── Instances Database Page ────────────────────────────────────────────────

function buildInstancesPage(navData, subDirNavData, allGuides) {
  const dbPath = path.join(OUTPUT_DIR, 'data', 'instances-db.json');
  if (!fs.existsSync(dbPath)) {
    console.log('   ℹ No instances data found — run: node import-instances.js');
    return;
  }

  const instances = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const instanceCount = instances.length;

  // ── Load loot data ─────────────────────────────────────────────────
  // Primary: comprehensive auto-discovered loot from import-all-instance-loot.js
  const instanceLootPath = path.join(OUTPUT_DIR, 'data', 'instance-loot.json');
  const instanceLoot = fs.existsSync(instanceLootPath)
    ? JSON.parse(fs.readFileSync(instanceLootPath, 'utf8'))
    : {};

  // Secondary: curated loot-reference.json (for the 5 guide-linked instances)
  const lootRef = loadInstanceLootReferenceConfig();
  const instanceIdToLootSlug = {};
  for (const [guideSlug, entry] of Object.entries(lootRef)) {
    if (entry && entry.url) {
      const idMatch = String(entry.url).match(/(\d{5,})(?:[^\d]|$)/);
      if (idMatch) instanceIdToLootSlug[idMatch[1]] = guideSlug;
    }
  }

  // ── Build compact client-side JSON (strip abilities for listing page) ──
  const clientInstances = instances.map(inst => {
    const hasLoot = instanceLoot[inst.slug] || instanceIdToLootSlug[inst.id];
    const obj = {
      slug: inst.slug,
      name: inst.name,
      groupType: inst.groupType,
      tiers: inst.tiers,
      mobCount: inst.mobCount,
    };
    if (hasLoot) {
      obj.lootUrl = `instances/${inst.slug}#loot`;
    }
    return obj;
  });

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'instances-db-listing.json'),
    JSON.stringify(clientInstances)
  );

  // ── Build listing page ─────────────────────────────────────────────────
  const template = readTemplate('instances-content.html');
  const body = render(template, { instanceCount: instanceCount.toString() });

  let html = buildPage(body, {
    title: 'Instance Database - LOTRO Guides',
    metaDescription: `Browse ${instanceCount} LOTRO instances with detailed mob and ability data from the Refridgerraiders project.`,
    currentPage: 'instances',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, \'\') + \'/\' : \'./\';',
    '  $.getJSON(_cdn + "data/instances-db-listing.json")',
    '    .done(function(data) {',
    '      window.LOTRO_INSTANCES_DB = data;',
    '      $.getScript("./js/instances-db.js", function() {',
    '        if (window.LOTRO_INSTANCES_INIT) window.LOTRO_INSTANCES_INIT();',
    '      });',
    '    });',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'instances.html'), html);

  // ── Build individual instance pages ────────────────────────────────────
  const detailTemplate = readTemplate('instance-detail-content.html');
  const instancesDir = path.join(OUTPUT_DIR, 'instances');
  ensureDir(instancesDir);

  // Map of known guide slugs for cross-linking
  const guideLinks = {
    'the-abyss-of-mordath': { url: '../guides/abyss-of-mordath-raid-guide', label: 'Abyss of Mordath Raid Guide' },
    'the-court-of-seregost': { url: '../guides/court-of-seregost-guide', label: 'Court of Seregost Guide' },
    'the-dungeons-of-naerband': { url: '../guides/dungeons-of-naerband-guide', label: 'Dungeons of Naerband Guide' },
    'ost-dunhoth-disease-and-poison-wing': { url: '../guides/ost-dunhoth-disease-wing-guide', label: 'Ost Dunhoth Disease Wing Guide' },
    'the-tower-of-orthanc': { url: '../guides/tower-of-orthanc-fire-ice-guide', label: 'Tower of Orthanc Fire & Ice Guide' },
  };

  // Load cached YouTube videos for instances
  const instanceVideosPath = path.join(__dirname, 'data', 'instance-videos.json');
  let instanceVideos = {};
  if (fs.existsSync(instanceVideosPath)) {
    try { instanceVideos = JSON.parse(fs.readFileSync(instanceVideosPath, 'utf8')); } catch (e) { /* ignore */ }
  }

  // Build guide match index: tokenize instance names for fuzzy matching
  function findRelatedGuides(inst) {
    if (!allGuides || !allGuides.length) return [];
    const slug = inst.slug || '';
    const nameLower = (inst.name || '').toLowerCase();
    // Extract meaningful words from instance name (drop articles/prepositions)
    const stopWords = new Set(['the', 'of', 'and', 'a', 'an', 'in', 'at', 'to', 'from']);
    const nameWords = nameLower.split(/[\s,\-–—]+/).filter(w => w.length > 2 && !stopWords.has(w));

    const scored = [];
    for (const guide of allGuides) {
      let score = 0;
      const gTags = (guide.tags || []).map(t => t.toLowerCase());
      const gSlug = (guide.slug || '').toLowerCase();
      const gTitle = (guide.title || '').toLowerCase();

      // Check if any guide tag matches the instance slug tokens
      const slugTokens = slug.split('-').filter(w => w.length > 2 && !stopWords.has(w));
      for (const token of slugTokens) {
        if (gTags.some(t => t.includes(token))) score += 3;
        if (gSlug.includes(token)) score += 2;
        if (gTitle.includes(token)) score += 1;
      }
      // Check if instance name words appear in guide tags/title
      for (const word of nameWords) {
        if (gTags.some(t => t.includes(word))) score += 2;
        if (gTitle.includes(word)) score += 1;
      }
      // Must be an instance/raid-related guide to count
      const isInstanceGuide = gTags.some(t => ['instance', 'instances', 'raid', 'raids', 'dungeon'].includes(t));
      if (score > 0 && isInstanceGuide) score += 2;

      if (score >= 4) scored.push({ guide, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.guide);
  }

  instances.forEach(inst => {
    // Build mob accordion HTML using <details>/<summary> (consistent with loot tables)
    const mobAccordions = inst.mobs.map((mob, idx) => {
      const abilityRows = mob.abilities.map(a => {
        // Attack type badge
        const atkBadge = a.attackType
          ? `<span class="skill-badge skill-badge-atk">${escapeHtml(a.attackType)}</span>`
          : '';

        // Range
        const rangeBadge = a.range
          ? `<span class="skill-badge skill-badge-range">${a.range}m</span>`
          : '';

        // AoE
        const aoeBadge = a.aoe
          ? `<span class="skill-badge skill-badge-aoe">${escapeHtml(a.aoe)}</span>`
          : '';

        // Cooldown
        const cdBadge = a.cooldown
          ? `<span class="skill-badge skill-badge-cd">${a.cooldown}s cd</span>`
          : '';

        // Induction
        const indBadge = a.induction
          ? `<span class="skill-badge skill-badge-ind">${a.induction}s cast</span>`
          : '';

        const badges = [atkBadge, rangeBadge, aoeBadge, cdBadge, indBadge].filter(Boolean).join(' ');

        // Effects row
        let effectsHtml = '';
        if (a.effects && a.effects.length > 0) {
          const effectTags = a.effects.map(e => {
            const parts = [escapeHtml(e.name)];
            if (e.cc) parts.push(`<strong class="skill-cc">${escapeHtml(e.cc)}${e.ccDuration ? ' ' + e.ccDuration + 's' : ''}</strong>`);
            if (e.duration) parts.push(`${e.duration}s`);
            if (e.ticks) parts.push(`${e.ticks} ticks`);
            const cls = e.type === 'cc' ? 'skill-effect-cc'
              : e.type === 'dot' ? 'skill-effect-dot'
              : e.type === 'countdown' ? 'skill-effect-countdown'
              : 'skill-effect-debuff';
            return `<span class="skill-effect ${cls}">${parts.join(' · ')}</span>`;
          }).join(' ');
          effectsHtml = `<div class="skill-effects">${effectTags}</div>`;
        }

        const iconHtml = a.iconId && a.iconDir
          ? `<img src="../img/icons/${a.iconDir}/${a.iconId}.webp" width="12" height="12" class="skill-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
          : '';

        return `<tr>
          <td class="skill-name-cell">${iconHtml}${escapeHtml(a.name)}${badges ? '<div class="skill-badges">' + badges + '</div>' : ''}</td>
          <td class="skill-detail-cell">${effectsHtml}</td>
        </tr>`;
      }).join('\n');

      const abilityTable = mob.abilities.length
        ? `<div class="lotro-loot-chest"><table class="lotro-loot-table instance-ability-table">
            <thead><tr><th>Skill</th><th>Effects</th></tr></thead>
            <tbody>${abilityRows}</tbody>
          </table></div>`
        : '<div class="lotro-loot-chest"><p class="text-muted">No specific abilities listed.</p></div>';

      return `<details class="lotro-loot-boss instance-mob-boss">
        <summary class="lotro-loot-boss-name">
          ${escapeHtml(mob.name)}
          <span class="instance-mob-meta">${mob.abilityCount} abilities · ID: ${mob.id}</span>
        </summary>
        ${abilityTable}
      </details>`;
    }).join('\n');

    // Build related content: guides, YouTube videos, links
    const matchedGuides = findRelatedGuides(inst);
    const videos = instanceVideos[inst.slug] || [];

    let guidesHtml = '';
    if (matchedGuides.length) {
      const guideCards = matchedGuides.map(g => {
        const imgSrc = g.image ? (g.image.startsWith('http') ? g.image : `../${g.image}`) : '';
        const img = imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(g.title)}" class="rc-card-img" loading="lazy">` : '';
        const excerpt = g.excerpt ? `<p class="rc-card-excerpt">${escapeHtml(g.excerpt)}</p>` : '';
        return `<a href="../guides/${g.slug}.html" class="rc-card rc-guide-card">${img}<div class="rc-card-body"><h4 class="rc-card-title">${escapeHtml(g.title)}</h4>${excerpt}</div></a>`;
      }).join('\n');
      guidesHtml = `<div class="rc-section"><h4 class="rc-section-title"><i class="fa fa-book"></i> Strategy Guides</h4><div class="rc-grid">${guideCards}</div></div>`;
    }

    let videosHtml = '';
    if (videos.length) {
      const videoCards = videos.map(v => {
        const thumb = v.thumbnail || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`;
        return `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener" class="rc-card rc-video-card"><div class="rc-thumb-wrap"><img src="${thumb}" alt="${escapeHtml(v.title)}" class="rc-card-img" loading="lazy"><span class="rc-play-btn"><i class="fa fa-play"></i></span></div><div class="rc-card-body"><h4 class="rc-card-title">${escapeHtml(v.title)}</h4><span class="rc-card-channel">${escapeHtml(v.channel || '')}</span></div></a>`;
      }).join('\n');
      videosHtml = `<div class="rc-section"><h4 class="rc-section-title"><i class="fa fa-youtube-play"></i> Video Guides</h4><div class="rc-grid">${videoCards}</div></div>`;
    }

    const mobLink = inst.mobs && inst.mobs.length
      ? `<a href="../mobs?instance=${encodeURIComponent(inst.slug)}" class="btn btn-sm btn-default"><i class="fa fa-crosshairs"></i> Mob Database (${inst.mobs.length})</a>`
      : `<a href="../mobs" class="btn btn-sm btn-default"><i class="fa fa-crosshairs"></i> Mob Database</a>`;
    const hasRelated = guidesHtml || videosHtml;
    const relatedContent = hasRelated
      ? `<div class="row m-b-30"><div class="col-md-10 col-md-offset-1"><h3 class="instance-section-title"><i class="fa fa-link"></i> Related Content</h3>${guidesHtml}${videosHtml}<div class="instance-related-links m-t-15">${mobLink}</div></div></div>`
      : `<div class="row m-b-30"><div class="col-md-8 col-md-offset-2"><h3 class="instance-section-title"><i class="fa fa-link"></i> Related Content</h3><div class="instance-related-links">${mobLink}</div></div></div>`;

    // Build loot section from comprehensive instance-loot.json or fallback to loot-reference
    let lootSection = '';
    const instLoot = instanceLoot[inst.slug];
    if (instLoot && instLoot.bosses && instLoot.bosses.length) {
      // Build accordion HTML from auto-discovered loot data
      // Pre-process: group degenerate entries where chest name was used as boss name
      const rawInstBosses = instLoot.bosses;
      const processedInstBosses = [];
      const instBossGroupMap = new Map();
      for (const boss of rawInstBosses) {
        const bossNameRaw = String(boss.name || '').trim();
        if (!bossNameRaw) continue;
        const rawChests = Array.isArray(boss.chests) ? boss.chests : [];
        const isDegenerate = rawChests.length === 1 && String(rawChests[0].label || '').trim() === bossNameRaw;
        if (isDegenerate) {
          const { boss: extractedBoss, tier: tierLabel } = extractBossFromChestLabel(bossNameRaw);
          if (extractedBoss) {
            if (!instBossGroupMap.has(extractedBoss)) {
              const groupEntry = { name: extractedBoss, chests: [] };
              instBossGroupMap.set(extractedBoss, groupEntry);
              processedInstBosses.push(groupEntry);
            }
            instBossGroupMap.get(extractedBoss).chests.push(Object.assign({}, rawChests[0], { label: tierLabel }));
          } else {
            processedInstBosses.push(boss);
          }
        } else {
          processedInstBosses.push(boss);
        }
      }

      const lootLines = ['<div class="lotro-loot-accordion">'];
      for (const boss of processedInstBosses) {
        const bossName = escapeHtml(boss.name);
        lootLines.push(`<details class="lotro-loot-boss">`);
        lootLines.push(`<summary class="lotro-loot-boss-name">${bossName}</summary>`);

        for (const chest of boss.chests) {
          if (!chest.items || !chest.items.length) continue;
          lootLines.push(`<div class="lotro-loot-chest">`);
          lootLines.push(`<h5 class="lotro-loot-chest-label">${escapeHtml(chest.label)}</h5>`);
          lootLines.push(`<table class="lotro-loot-table">`);
          lootLines.push(`<thead><tr><th>Item</th><th>Drop Chance</th></tr></thead>`);
          lootLines.push(`<tbody>`);

          for (const lootItem of chest.items) {
            const itemName = escapeHtml(lootItem.name);
            // Try to link to item in items database
            const dbItem = itemIndex[lootItem.name];
            const qualityClass = dbItem && dbItem.quality ? ` lotro-${dbItem.quality}` : '';

            // Build tooltip from stats
            let tooltipAttr = '';
            const statsSource = lootItem.stats;
            if (statsSource && statsSource.length) {
              const parts = [];
              const slot = lootItem.slot || '';
              const level = lootItem.level || 0;
              if (slot || level) {
                let header = '';
                if (slot) header += slot.replace(/\b\w/g, c => c.toUpperCase());
                if (level) header += (header ? ' · ' : '') + 'iLvl ' + level;
                if (lootItem.scaling) header += ' · ⚖ Scales';
                parts.push(header);
              }
              const statLines = statsSource
                .filter(s => (s.value !== undefined ? s.value : 0) !== 0)
                .slice(0, 6)
                .map(s => `${s.stat}: ${Number(s.value).toLocaleString()}`);
              parts.push(...statLines);
              tooltipAttr = ` data-item-stats="${parts.join(' · ').replace(/"/g, '&quot;')}"`;
            }

            // Build inline icon tag if available
            const iconId = dbItem ? (dbItem.icon || iconMap[dbItem.id]) : null;
            const lootIconHtml = iconId
              ? `<img src="${CDN_URL ? CDN_URL + '/img/icons/items/' + iconId + '.png' : '../img/icons/items/' + iconId + '.png'}" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
              : '';

            const itemHtml = dbItem
              ? `<a href="../items?id=${dbItem.id}" class="lotro-item${qualityClass}" data-item-type="${dbItem.type || 'item'}"${tooltipAttr}>${lootIconHtml}<span class="lotro-item-text">${itemName}</span></a>`
              : (tooltipAttr ? `<span class="lotro-item"${tooltipAttr}>${itemName}</span>` : itemName);

            const dropChance = lootItem.drop || '';
            const dropClass = dropChance ? ` lotro-drop-${dropChance.toLowerCase()}` : '';

            lootLines.push(`<tr><td>${itemHtml}</td><td><span class="lotro-drop-chance${dropClass}">${dropChance}</span></td></tr>`);
          }

          lootLines.push(`</tbody></table>`);
          lootLines.push(`</div>`);
        }

        lootLines.push(`</details>`);
      }
      lootLines.push('</div>');

      lootSection = `<div class="m-b-30" id="loot">
          <h3 class="instance-section-title"><i class="fa fa-gift"></i> Loot Tables</h3>
          <p class="text-muted">Boss loot drops for this instance. Drop rates computed from game data.</p>
          ${lootLines.join('\n')}
        </div>`;
    } else {
      // Fallback: try curated loot-reference.json
      const lootSlug = instanceIdToLootSlug[inst.id];
      if (lootSlug) {
        const lootHtml = buildLootAccordionHtml(lootSlug);
        if (lootHtml) {
          lootSection = `<div class="m-b-30" id="loot">
            <h3 class="instance-section-title"><i class="fa fa-gift"></i> Loot Tables</h3>
            <p class="text-muted">Boss loot drops for this instance.</p>
            ${lootHtml}
          </div>`;
        }
      }
    }

    const scalingRow = inst.scaling
      ? `<tr><th><i class="fa fa-arrows-v"></i> Scaling</th><td>${escapeHtml(inst.scaling)}</td></tr>`
      : '';
    const instanceIdRow = inst.id
      ? `<tr><th><i class="fa fa-hashtag"></i> Instance ID</th><td class="text-muted">${inst.id}</td></tr>`
      : '';

    const instanceUrl = `${SITE_BASE_URL}/instances/${inst.slug}`;
    const comments = buildCommentsSection(inst.slug, instanceUrl, inst.name);

    const detailBody = render(detailTemplate, {
      instanceName: escapeHtml(inst.name),
      groupType: inst.groupType,
      tiers: String(inst.tiers),
      scalingRow,
      mobCount: String(inst.mobCount),
      instanceIdRow,
      relatedContent,
      lootSection,
      mobAccordions: mobAccordions || '<p class="text-muted">No mob data available for this instance.</p>',
      comments,
    });

    let detailHtml = buildPage(detailBody, {
      title: `${inst.name} — Instance Details - LOTRO Guides`,
      metaDescription: `Detailed mob and ability data for ${inst.name} (${inst.groupType}). ${inst.mobCount} mobs documented.`,
      currentPage: 'instances',
      siteRoot: '../',
      ...(subDirNavData || navData),
    });

    fs.writeFileSync(path.join(instancesDir, `${inst.slug}.html`), detailHtml);
  });

  console.log(`   ✓ ${instanceCount} instance detail pages`);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Interactive Map Page ───────────────────────────────────────────────────

function buildMapPage(navData) {
  const manifestPath = path.join(LORE_DIR, 'maps-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('   ℹ No map data found — run: node scripts/extract-maps.js');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const template = readTemplate('map-content.html');
  const body = render(template, {});

  let html = buildPage(body, {
    title: 'Interactive Map - LOTRO Guides',
    metaDescription: `Explore Middle-earth with an interactive map featuring ${manifest.totalMarkers.toLocaleString()} points of interest across ${manifest.totalMaps.toLocaleString()} maps. Find stable-masters, vendors, landmarks, and more.`,
    currentPage: 'map',
    ...navData,
  });

  // Inject Leaflet CSS + MarkerCluster CSS in <head>
  const mapCss = [
    '<link href="./plugins/leaflet/leaflet.css" rel="stylesheet">',
    '<link href="./plugins/leaflet/MarkerCluster.css" rel="stylesheet">',
    '<link href="./plugins/leaflet/MarkerCluster.Default.css" rel="stylesheet">',
  ].join('\n    ');
  html = html.replace('</head>', `    ${mapCss}\n  </head>`);

  // Inject Leaflet JS + MarkerCluster + map JS before </body>
  const mapScripts = [
    '<script src="./plugins/leaflet/leaflet.js" defer></script>',
    '<script src="./plugins/leaflet/leaflet.markercluster.js" defer></script>',
    '<script src="./js/lotro-map.js" defer></script>',
    '<script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    '  if (window.LOTRO_MAP_INIT) window.LOTRO_MAP_INIT();',
    '});',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${mapScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'map.html'), html);
}

// ─── Media Page ─────────────────────────────────────────────────────────────

function loadMediaVideos() {
  if (!fs.existsSync(MEDIA_VIDEOS_PATH)) {
    console.log('   ℹ No media videos file found at content/media/videos.json');
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEDIA_VIDEOS_PATH, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.warn(`   ⚠ Failed to parse media videos JSON: ${err.message}`);
    return [];
  }
}

function extractYouTubeId(input) {
  const value = String(input || '').trim();
  if (!value) return '';

  const shortMatch = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (shortMatch) return shortMatch[1];

  const embedMatch = value.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
  if (embedMatch) return embedMatch[1];

  const watchMatch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
  if (watchMatch) return watchMatch[1];

  // Support passing a raw video ID in the list.
  return /^[A-Za-z0-9_-]{6,}$/.test(value) ? value : '';
}

function buildMediaPage(navData) {
  const template = readTemplate('media-content.html');
  const videos = loadMediaVideos()
    .map(v => ({
      title: String(v.title || '').trim() || 'LOTRO Video',
      description: v.description || '',
      youtubeId: extractYouTubeId(v.url || v.youtubeId),
      publishedAt: v.publishedAt || '',
      thumbnail: v.thumbnail || '',
    }))
    .filter(v => v.youtubeId);

  const videoCards = videos.map(video => {
    const dateStr = video.publishedAt
      ? new Date(video.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    const dateBadge = dateStr ? `<span class="text-muted" style="font-size:13px"><i class="fa fa-calendar"></i> ${dateStr}</span>` : '';
    return `
      <div class="col-12 col-md-6 m-b-30">
        <div class="panel panel-default">
          <div class="panel-body">
            <div class="embed-responsive embed-responsive-16by9 m-b-15">
              <iframe class="embed-responsive-item" src="https://www.youtube.com/embed/${video.youtubeId}" title="${video.title}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            </div>
            <h4 class="m-b-10">${video.title}</h4>
            ${dateBadge}
            <p class="text-muted m-b-10">${video.description}</p>
            <a class="btn btn-sm btn-default" href="https://youtu.be/${video.youtubeId}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
          </div>
        </div>
      </div>`;
  }).join('\n');

  const body = render(template, {
    videoCount: String(videos.length),
    videoCards,
  });

  const html = buildPage(body, {
    title: 'Media Gallery - LOTRO Guides',
    metaDescription: `Watch ${videos.length} official LOTRO videos from the Lord of the Rings YouTube channel.`,
    currentPage: 'media',
    ...navData,
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'media.html'), html);
}

// ─── Editor Page ────────────────────────────────────────────────────────────

function buildEditorBundle() {
  const srcFile = path.join(__dirname, 'src', 'editor.js');
  if (!fs.existsSync(srcFile)) return;
  esbuild.buildSync({
    entryPoints: [srcFile],
    bundle: true,
    outdir: path.join(OUTPUT_DIR, 'js'),
    entryNames: 'editor.bundle',
    format: 'iife',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    logLevel: 'warning',
    loader: {
      '.ttf': 'file',
      '.woff': 'file',
      '.woff2': 'file',
      '.eot': 'file',
      '.svg': 'file',
    },
  });
}

function buildEditorPage(allPosts, navData) {
  // Bundle ProseMirror editor JS + CSS
  buildEditorBundle();

  // Generate article manifest for the editor
  const manifest = allPosts.map(p => ({
    slug: p.slug,
    title: p.title || p.slug,
    category: p.category || 'guides',
    date: p.formattedDate || '',
    author: p.author || '',
  }));
  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'editor-manifest.json'),
    JSON.stringify(manifest)
  );

  // Generate per-article JSON files (metadata + raw markdown body) for the editor
  for (const subdir of ['guides', 'news']) {
    const srcDir = path.join(CONTENT_DIR, subdir);
    const destDir = path.join(OUTPUT_DIR, 'data', 'content', subdir);
    ensureDir(destDir);
    if (fs.existsSync(srcDir)) {
      for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.md'))) {
        const raw = fs.readFileSync(path.join(srcDir, f), 'utf-8');
        const { data, content } = matter(raw);
        const articleJson = {
          slug: path.basename(f, '.md'),
          category: subdir,
          title: data.title || '',
          date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : (data.date ? String(data.date).slice(0, 10) : ''),
          author: data.author || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          image: data.image || '',
          excerpt: data.excerpt || '',
          markdown: content.trim(),
        };
        fs.writeFileSync(
          path.join(destDir, path.basename(f, '.md') + '.json'),
          JSON.stringify(articleJson)
        );
      }
    }
  }

  // Copy JSON config files so the editor can fetch/edit them
  const configFiles = [
    { src: path.join(CONTENT_DIR, 'navigation.json'), key: 'navigation', label: 'Navigation' },
    { src: path.join(CONTENT_DIR, 'media', 'videos.json'), key: 'media-videos', label: 'Media Videos' },
    { src: path.join(CONTENT_DIR, 'stats', 'dps-reference.json'), key: 'dps-reference', label: 'DPS Reference' },
    { src: path.join(CONTENT_DIR, 'instances', 'loot-reference.json'), key: 'loot-reference', label: 'Loot Reference' },
  ];
  const configManifest = [];
  const configDestDir = path.join(OUTPUT_DIR, 'data', 'content', 'config');
  ensureDir(configDestDir);
  for (const cf of configFiles) {
    if (fs.existsSync(cf.src)) {
      fs.copyFileSync(cf.src, path.join(configDestDir, cf.key + '.json'));
      configManifest.push({ key: cf.key, label: cf.label });
    }
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'config-manifest.json'),
    JSON.stringify(configManifest)
  );

  // Render editor page
  const template = readTemplate('editor-content.html');
  const body = render(template, {
    googleClientId: GOOGLE_OAUTH_CLIENT_ID,
  });

  let html = buildPage(body, {
    title: 'Editor - LOTRO Guides',
    metaDescription: 'Content editor for LOTRO Guides.',
    currentPage: 'editor',
    ...navData,
  });

  // Inject editor CSS bundle
  const editorCss = '<link href="./js/editor.bundle.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${editorCss}\n  </head>`);

  // Inject editor config + scripts
  const editorScripts = [
    (EDITOR_ALLOWED_EMAILS || GITHUB_REPO || GITHUB_CLIENT_ID || CDN_UPLOAD_URL)
      ? '<script>window.LOTRO_EDITOR_CONFIG={'
        + (EDITOR_ALLOWED_EMAILS ? 'allowedEmails:"' + EDITOR_ALLOWED_EMAILS.replace(/"/g, '\\"') + '",' : '')
        + (GITHUB_REPO ? 'githubRepo:"' + GITHUB_REPO.replace(/"/g, '\\"') + '",' : '')
        + (GITHUB_CLIENT_ID ? 'githubClientId:"' + GITHUB_CLIENT_ID.replace(/"/g, '\\"') + '",' : '')
        + (CDN_UPLOAD_URL ? 'cdnUploadUrl:"' + CDN_UPLOAD_URL.replace(/"/g, '\\"') + '"' : '')
        + '};</script>'
      : '',
    '<script src="./js/editor.bundle.js"></script>',
    '<script src="https://accounts.google.com/gsi/client" async defer></script>',
  ].filter(Boolean).join('\n    ');
  html = html.replace('</body>', `    ${editorScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'editor.html'), html);
}

// ─── Skills Page ────────────────────────────────────────────────────────────

function buildSkillsPage(navData) {
  const template = readTemplate('skills-content.html');

  // Extract guide builds from data/builds/*.json
  const buildsDir = path.join(__dirname, 'data', 'builds');
  const guideBuilds = [];
  if (fs.existsSync(buildsDir)) {
    fs.readdirSync(buildsDir).filter(f => f.endsWith('.json')).forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(buildsDir, file), 'utf8'));
        const cls = data.class || file.replace('.json', '');
        if (data.builds) {
          Object.keys(data.builds).forEach(key => {
            const b = data.builds[key];
            if (b.points && Object.keys(b.points).length > 0) {
              guideBuilds.push({
                id: 'guide_' + cls + '_' + key,
                name: b.name || key,
                class: cls,
                build: key,
                level: b.level || 160,
                points: b.points,
                desc: b.desc || b.description || '',
                guide: true,
                likes: 0,
                createdAt: 0
              });
            }
          });
        }
      } catch (e) { /* skip malformed files */ }
    });
  }

  const body = render(template, {
    assets: '.',
    guideBuilds: JSON.stringify(guideBuilds),
  });

  let html = buildPage(body, {
    title: 'Skills & Trait Builder - LOTRO Guides',
    metaDescription: 'Interactive trait planner for all LOTRO classes with save and share functionality.',
    currentPage: 'skills',
    ...navData,
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'skills.html'), optimizeImages(html));
}

// ─── Embedded Trait Planner ─────────────────────────────────────────────────

function buildEmbeddedTraitPlanner() {
  const template = readTemplate('partials/embedded-trait-planner.html');
  const html = render(template, { assets: '.' });
  fs.writeFileSync(path.join(OUTPUT_DIR, 'embedded-trait-planner.html'), optimizeImages(html));
}

// ─── Main Build ─────────────────────────────────────────────────────────────

async function build() {
  console.log('🏗  Building LOTRO guides...');
  const startTime = Date.now();

  // Convert images to WebP and collect dimensions metadata
  console.log('   📸 Converting images to WebP...');
  await convertImagesToWebp();

  // Generate favicon.ico from PNG source
  console.log('   🔖 Generating favicon.ico...');
  await generateFaviconIco();

  // Load lore item index for auto-linking
  loadItemIndex();
  loadQuestIndex();

  // Load all markdown content
  const guides = loadContent('guides');
  const news = loadContent('news');

  // Pick up legacy scraped HTML articles not yet converted to markdown
  const legacyNews = loadLegacyHtml('news');
  const legacyGuides = loadLegacyHtml('guides');

  // Merge markdown + legacy, deduplicate by slug, sort by date
  const allNews = [...news, ...legacyNews].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allGuides = [...guides, ...legacyGuides].sort((a, b) => new Date(b.date) - new Date(a.date));
  const allPosts = [...allGuides, ...allNews].sort((a, b) => new Date(b.date) - new Date(a.date));

  console.log(`   Found ${allGuides.length} guides (${legacyGuides.length} legacy), ${allNews.length} news (${legacyNews.length} legacy)`);

  // Build nav items from content (guides use category links only)
  const guideNav = buildGuideQuickNavLinks('');
  const newsNav = buildNavItems(allNews, '', 5);
  const guideNavArticle = buildGuideQuickNavLinks('../');
  const newsNavArticle = buildNavItems(allNews, '../', 5);

  // Ensure output directories
  ensureDir(path.join(OUTPUT_DIR, 'guides'));
  ensureDir(path.join(OUTPUT_DIR, 'news'));

  // Build index page
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), optimizeImages(buildIndex(allPosts, { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ index.html');

  // Build listing pages
  fs.writeFileSync(path.join(OUTPUT_DIR, 'guides.html'), optimizeImages(buildListing(allGuides, 'guides', { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ guides.html');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'news.html'), optimizeImages(buildListing(allNews, 'news', { guideNavItems: guideNav, newsNavItems: newsNav })));
  console.log('   ✓ news.html');

  // Build about page
  const aboutBody = readTemplate('about-content.html');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'about.html'), optimizeImages(buildPage(aboutBody, {
    title: 'About - LOTRO Guides',
    currentPage: 'about',
    guideNavItems: guideNav,
    newsNavItems: newsNav,
  })));
  console.log('   ✓ about.html');

  // Build media page
  buildMediaPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ media.html');

  // Build items database page
  buildItemsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ items.html');

  // Build mobs database page
  buildMobsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ mobs.html');

  // Build virtues database page
  buildVirtuesPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ virtues.html');

  // Build sets database page
  buildSetsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ sets.html');

  // Build deeds database page
  buildDeedsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ deeds.html');

  // Build quests database page
  buildQuestsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ quests.html');

  // Build instances database page + individual instance pages
  buildInstancesPage({ guideNavItems: guideNav, newsNavItems: newsNav }, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle }, allGuides);
  console.log('   ✓ instances.html');

  // Build interactive map page
  buildMapPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ map.html');

  // Build editor page
  buildEditorPage(allPosts, { guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ editor.html');

  // Build skills page
  buildSkillsPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ skills.html');

  // Build embedded trait planner
  buildEmbeddedTraitPlanner();
  console.log('   ✓ embedded-trait-planner.html');

  // Build individual articles (only from markdown — legacy HTML already exists)
  guides.forEach(post => {
    const related = allGuides.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'guides', `${post.slug}.html`);
    fs.writeFileSync(outPath, optimizeImages(buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle })));
    console.log(`   ✓ guides/${post.slug}.html`);
  });

  news.forEach(post => {
    const related = allNews.filter(p => p.slug !== post.slug);
    const outPath = path.join(OUTPUT_DIR, 'news', `${post.slug}.html`);
    fs.writeFileSync(outPath, optimizeImages(buildArticle(post, related, { guideNavItems: guideNavArticle, newsNavItems: newsNavArticle })));
    console.log(`   ✓ news/${post.slug}.html`);
  });

  // Build sitemap and robots.txt
  buildSitemap(allPosts);
  buildRobotsTxt();

  const elapsed = Date.now() - startTime;
  const itemCount = Object.keys(itemIndex).length;
  console.log(`\n✅ Build complete in ${elapsed}ms — ${allPosts.length} articles, ${itemCount.toLocaleString()} items`);
}

// ─── Sitemap & Robots ────────────────────────────────────────────────────────

function buildSitemap(allPosts) {
  const now = new Date().toISOString().split('T')[0];

  // Static pages with their priorities and change frequencies
  const staticPages = [
    { loc: '',              changefreq: 'daily',   priority: '1.0' },
    { loc: 'guides',  changefreq: 'weekly',  priority: '0.9' },
    { loc: 'news',    changefreq: 'daily',   priority: '0.9' },
    { loc: 'deeds',   changefreq: 'weekly',  priority: '0.8' },
    { loc: 'quests',  changefreq: 'weekly',  priority: '0.8' },
    { loc: 'items',   changefreq: 'weekly',  priority: '0.7' },
    { loc: 'mobs',    changefreq: 'weekly',  priority: '0.7' },
    { loc: 'virtues', changefreq: 'monthly', priority: '0.7' },
    { loc: 'sets',    changefreq: 'monthly', priority: '0.7' },
    { loc: 'instances', changefreq: 'weekly', priority: '0.7' },
    { loc: 'map',     changefreq: 'weekly',  priority: '0.8' },
    { loc: 'about',   changefreq: 'monthly', priority: '0.5' },
  ];

  const urlEntries = staticPages.map(p => {
    const fullUrl = p.loc ? `${SITE_BASE_URL}/${p.loc}` : SITE_BASE_URL;
    return `  <url>\n    <loc>${fullUrl}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`;
  });

  // Article pages
  for (const post of allPosts) {
    const lastmod = post.date ? new Date(post.date).toISOString().split('T')[0] : now;
    const isGuide = post.category === 'guides';
    urlEntries.push(
      `  <url>\n    <loc>${SITE_BASE_URL}/${post.url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${isGuide ? 'monthly' : 'yearly'}</changefreq>\n    <priority>${isGuide ? '0.8' : '0.7'}</priority>\n  </url>`
    );
  }

  // Instance detail pages
  const instanceDbPath = path.join(OUTPUT_DIR, 'data', 'instances-db.json');
  if (fs.existsSync(instanceDbPath)) {
    const instances = JSON.parse(fs.readFileSync(instanceDbPath, 'utf8'));
    for (const inst of instances) {
      urlEntries.push(
        `  <url>\n    <loc>${SITE_BASE_URL}/instances/${inst.slug}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), xml, 'utf8');
  console.log(`   ✓ sitemap.xml (${urlEntries.length} URLs)`);
}

function buildRobotsTxt() {
  const content = `User-agent: *\nAllow: /\nDisallow: /editor\n\nSitemap: ${SITE_BASE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'robots.txt'), content, 'utf8');
  console.log('   ✓ robots.txt');
}

// ─── Watch Mode ─────────────────────────────────────────────────────────────

if (process.argv.includes('--watch')) {
  const chokidar = require('chokidar');
  build().then(() => {
    console.log('\n👁  Watching for changes in content/ and templates/...\n');
    chokidar.watch([CONTENT_DIR, TEMPLATE_DIR], { ignoreInitial: true })
      .on('all', (event, filePath) => {
        console.log(`\n📝 ${event}: ${path.relative(__dirname, filePath)}`);
        build();
      });
  });
} else {
  build();
}
