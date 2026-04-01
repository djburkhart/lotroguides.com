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
const GOOGLE_SEARCH_CONSOLE_VERIFICATION = process.env.GOOGLE_SEARCH_CONSOLE_VERIFICATION || '';
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
    levelCap: 150,
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
 * Build the full accordion HTML for an instance's boss loot tables.
 * Called post-autolink so boss names don't get partial mob-link matches.
 */
function buildLootAccordionHtml(slug) {
  const refs = loadInstanceLootReferenceConfig();
  const entry = refs[slug];
  if (!entry) return '';

  const bosses = Array.isArray(entry.bosses) ? entry.bosses : [];
  if (!bosses.length) return '';

  const lines = ['<div class="lotro-loot-accordion">'];

  for (const boss of bosses) {
    const bossName = String(boss.name || '').trim();
    if (!bossName) continue;

    // Resolve boss name to mob link if available
    const bossEntry = itemIndex[bossName];
    const bossLabel = bossEntry && bossEntry.type === 'mob'
      ? `<a href="../mobs.html?id=${bossEntry.id}" class="lotro-mob">${bossName}</a>`
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
          ? `<img src="../img/icons/items/${iconId}.png" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
          : '';

        const itemHtml = dbItem
          ? `<a href="../items.html?id=${dbItem.id}" class="lotro-item${qualityClass}" data-item-type="${dbItem.type || 'item'}"${tooltipAttr}>${lootIconHtml}<span class="lotro-item-text">${itemName}</span></a>`
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

  // Already using preferred token format.
  if (markdown.includes(token)) return markdown;

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
    let src = `${siteRoot}map.html?${type}=${param}&embed=1`;
    if (opts.lng) src += `&lng=${encodeURIComponent(opts.lng)}`;
    if (opts.lat) src += `&lat=${encodeURIComponent(opts.lat)}`;
    return `<div class="lotro-map-embed" style="height:${height}px">`
      + `<iframe src="${src}" style="width:100%;height:100%;border:0" loading="lazy" allowfullscreen title="LOTRO Interactive Map"></iframe>`
      + `</div>`;
  });
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
      const itemUrl = `../items.html?id=${entry.id}`;
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
        ? `<img src="../img/icons/items/${iconId}.png" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
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
      const mobUrl = `../mobs.html?id=${entry.id}`;
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
      const setUrl = `../sets.html?id=${entry.id}`;
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
      const deedUrl = `../deeds.html?id=${entry.id}`;
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
      const questUrl = `../quests.html?id=${entry.id}`;
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
  return html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
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
}

// ─── Template Engine ────────────────────────────────────────────────────────
// Simple placeholder replacement: {{variable}}
function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

function resolveNavUrl(siteRoot, url) {
  if (!url) return '#';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('#') || url.startsWith('mailto:')) {
    return url;
  }
  return `./${siteRoot}${url}`;
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
    googleSearchConsoleVerification: GOOGLE_SEARCH_CONSOLE_VERIFICATION
      ? `<meta name="google-site-verification" content="${GOOGLE_SEARCH_CONSOLE_VERIFICATION}">`
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
      resolvedContent = normalizeGuideInstanceLootReferenceContent(resolvedContent, file, slug);
      if (resolvedContent.includes('{{instanceLootReference}}')) {
        resolvedContent = resolvedContent.replace(/\{\{instanceLootReference\}\}/g, buildInstanceLootReferenceMarkdown(slug));
      }
    }

    const siteRoot = (subdir === 'guides' || subdir === 'news') ? '../' : '';
    const htmlContent = resolveDpsTokens(resolveMapEmbeds(marked(resolvedContent), siteRoot));
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
      url: `${subdir}/${slug}.html`,
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
        url: `${subdir}/${slug}.html`,
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
    `<li><a href="./${siteRoot}${p.url}">${p.title}</a></li>`
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
  const root = `./${siteRoot}guides.html`;
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

  return buildPage(body, { title: 'LOTRO Guides - LOTRO Fansite', currentPage: 'home', ...navData });
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
          <a class="btn btn-sm btn-default" href="guides.html">All Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=raid">Raid Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=class">Class Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=leveling">Leveling Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=systems">Systems Guides</a>
          <a class="btn btn-sm btn-default" href="guides.html?filter=general">General Guides</a>
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
  const body = render(template, {
    title: post.title,
    date: post.formattedDate,
    author: post.author || 'Amdor',
    image: postImg,
    content: expandLootAccordionPlaceholders(autoLinkQuests(autoLinkDeeds(autoLinkSets(autoLinkMobs(autoLinkItems(post.content)))))),
    tags: tagsHtml,
    category: post.category === 'guides' ? 'Guides' : 'News',
    categoryUrl: post.category === 'guides' ? '../guides.html' : '../news.html',
    relatedPosts: relatedHtml,
    assets: articleAssets,
    articleUrl,
    encodedTitle,
  });

  return buildPage(body, {
    title: `${post.title} - LOTRO Guides`,
    metaDescription: post.excerpt,
    currentPage: post.category,
    assets: articleAssets,
    siteRoot: '../',
    ogUrl: articleUrl,
    ogImage,
    ...navData,
  });
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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script src="./js/items-db.js"></script>',
    '<script>',
    '  // Progressive chunked loading',
    '  $.getJSON("./data/items-db-manifest.json", function(manifest) {',
    '    $.getJSON("./data/items-db-0.json", function(firstChunk) {',
    '      window.LOTRO_ITEMS_DB = firstChunk;',
    '      if (window.LOTRO_ITEMS_INIT) window.LOTRO_ITEMS_INIT();',
    '      // Load remaining chunks in background',
    '      if (manifest.totalChunks > 1 && window.LOTRO_ITEMS_ADD_CHUNK) {',
    '        var loaded = 1;',
    '        (function loadNext(i) {',
    '          if (i >= manifest.totalChunks) return;',
    '          $.getJSON("./data/items-db-" + i + ".json", function(chunk) {',
    '            loaded++;',
    '            window.LOTRO_ITEMS_ADD_CHUNK(chunk, loaded, manifest.totalChunks);',
    '            loadNext(i + 1);',
    '          });',
    '        })(1);',
    '      }',
    '    });',
    '  });',
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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  // Load mobs data + map overlay, then init',
    '  $.when($.getJSON("./data/mobs-db.json"), $.getJSON("./data/mob-overlay.json"))',
    '    .done(function(mobsRes, overlayRes) {',
    '      window.LOTRO_MOBS_DB = mobsRes[0];',
    '      window.LOTRO_MOB_OVERLAY = overlayRes[0] || {};',
    '      $.getScript("./js/mobs-db.js", function() {',
    '        if (window.LOTRO_MOBS_INIT) window.LOTRO_MOBS_INIT();',
    '      });',
    '    });',
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

  // Compact format: {id, n, st:[], mr, ic}
  const clientVirtues = virtues.map(v => {
    const row = {
      id: v.id,
      n: v.name,
      st: v.stats || [],
      mr: v.maxTier || 0,
    };
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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/virtues-db.json", function(data) {',
    '    window.LOTRO_VIRTUES_DB = data;',
    '    $.getScript("./js/virtues-db.js", function() {',
    '      if (window.LOTRO_VIRTUES_INIT) window.LOTRO_VIRTUES_INIT();',
    '    });',
    '  });',
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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/sets-db.json", function(data) {',
    '    window.LOTRO_SETS_DB = data;',
    '    $.getScript("./js/sets-db.js", function() {',
    '      if (window.LOTRO_SETS_INIT) window.LOTRO_SETS_INIT();',
    '    });',
    '  });',
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

  ensureDir(path.join(OUTPUT_DIR, 'data'));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'data', 'deeds-db.json'),
    JSON.stringify(clientDeeds)
  );
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
  const body = render(template, { deedCount: count.toLocaleString() });

  let html = buildPage(body, {
    title: 'Deed Database - LOTRO Guides',
    metaDescription: `Browse ${count.toLocaleString()} deeds from the LotRO Companion database. Search by type, rewards, and class requirements.`,
    currentPage: 'deeds',
    ...navData,
  });

  const dtCss = '<link href="./plugins/datatables/datatables.min.css" rel="stylesheet">';
  html = html.replace('</head>', `    ${dtCss}\n  </head>`);

  const dtScripts = [
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.when($.getJSON("./data/deeds-db.json"), $.getJSON("./data/deed-overlay.json"), $.getJSON("./data/icon-map.json"))',
    '    .done(function(deedsRes, overlayRes, iconRes) {',
    '      window.LOTRO_DEEDS_DB = deedsRes[0];',
    '      window.LOTRO_DEED_OVERLAY = overlayRes[0] || {};',
    '      window.LOTRO_ICON_MAP = iconRes[0] || {};',
    '      $.getScript("./js/deeds-db.js", function() {',
    '        if (window.LOTRO_DEEDS_INIT) window.LOTRO_DEEDS_INIT();',
    '      });',
    '    });',
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

  // Build lightweight quest search index for the DO Function (id + name + level only).
  // This file is committed to git so the function has it at deploy time.
  // Re-run npm run build and commit packages/quests/lookup/quest-index.json after LOTRO updates.
  const questSearchIndex = questOverlayKeys.map(id => {
    const q = questOverlay[id];
    return { id, n: q.n || '', lv: q.lv || 0 };
  });
  const funcDir = path.join(__dirname, 'packages', 'quests', 'lookup');
  if (!fs.existsSync(funcDir)) fs.mkdirSync(funcDir, { recursive: true });
  fs.writeFileSync(path.join(funcDir, 'quest-index.json'), JSON.stringify(questSearchIndex));
  console.log(`   → packages/quests/lookup/quest-index.json (${questSearchIndex.length} entries)`);

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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.when(',
    '    $.getJSON("./data/quests-db.json"),',
    '    $.getJSON("./data/icon-map.json"),',
    '    $.getJSON("./data/quest-overlay-index.json")',
    '  ).done(function(qRes, iRes, oRes) {',
    '    window.LOTRO_QUESTS_DB = qRes[0];',
    '    window.LOTRO_ICON_MAP = iRes[0] || {};',
    '    window.LOTRO_QUEST_OVERLAY = oRes[0] || {};',
    '    $.getScript("./js/quests-db.js", function() {',
    '      if (window.LOTRO_QUESTS_INIT) window.LOTRO_QUESTS_INIT();',
    '    });',
    '  });',
    '</script>',
  ].join('\n    ');
  html = html.replace('</body>', `    ${dtScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'quests.html'), html);
}

// ─── Instances Database Page ────────────────────────────────────────────────

function buildInstancesPage(navData) {
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
      obj.lootUrl = `instances/${inst.slug}.html#loot`;
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
    '<script src="./plugins/datatables/datatables.min.js"></script>',
    '<script>',
    '  $.getJSON("./data/instances-db-listing.json")',
    '    .done(function(data) {',
    '      window.LOTRO_INSTANCES_DB = data;',
    '      $.getScript("./js/instances-db.js", function() {',
    '        if (window.LOTRO_INSTANCES_INIT) window.LOTRO_INSTANCES_INIT();',
    '      });',
    '    });',
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
    'the-abyss-of-mordath': { url: '../guides/abyss-of-mordath-raid-guide.html', label: 'Abyss of Mordath Raid Guide' },
    'the-court-of-seregost': { url: '../guides/court-of-seregost-guide.html', label: 'Court of Seregost Guide' },
    'the-dungeons-of-naerband': { url: '../guides/dungeons-of-naerband-guide.html', label: 'Dungeons of Naerband Guide' },
    'ost-dunhoth-disease-and-poison-wing': { url: '../guides/ost-dunhoth-disease-wing-guide.html', label: 'Ost Dunhoth Disease Wing Guide' },
    'the-tower-of-orthanc': { url: '../guides/tower-of-orthanc-fire-ice-guide.html', label: 'Tower of Orthanc Fire & Ice Guide' },
  };

  instances.forEach(inst => {
    // Build mob accordion HTML using <details>/<summary> (consistent with loot tables)
    const mobAccordions = inst.mobs.map((mob, idx) => {
      const abilityRows = mob.abilities.map(a =>
        `<tr><td>${escapeHtml(a.name)}</td><td class="text-muted">${a.id}</td></tr>`
      ).join('\n');
      const abilityTable = mob.abilities.length
        ? `<div class="lotro-loot-chest"><table class="lotro-loot-table instance-ability-table">
            <thead><tr><th>Ability</th><th>ID</th></tr></thead>
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

    // Build related content links
    const relatedLinks = [];
    const guide = guideLinks[inst.slug];
    if (guide) {
      relatedLinks.push(`<a href="${guide.url}" class="btn btn-sm btn-primary"><i class="fa fa-book"></i> ${guide.label}</a>`);
    }
    // Link to mobs database
    relatedLinks.push(`<a href="../mobs.html" class="btn btn-sm btn-default"><i class="fa fa-crosshairs"></i> Mob Database</a>`);

    const relatedContent = relatedLinks.length
      ? `<div class="row m-b-30"><div class="col-md-8 col-md-offset-2"><h3 class="instance-section-title"><i class="fa fa-link"></i> Related Content</h3><div class="instance-related-links">${relatedLinks.join('\n')}</div></div></div>`
      : '';

    // Build loot section from comprehensive instance-loot.json or fallback to loot-reference
    let lootSection = '';
    const instLoot = instanceLoot[inst.slug];
    if (instLoot && instLoot.bosses && instLoot.bosses.length) {
      // Build accordion HTML from auto-discovered loot data
      const lootLines = ['<div class="lotro-loot-accordion">'];
      for (const boss of instLoot.bosses) {
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
              ? `<img src="../img/icons/items/${iconId}.png" width="12" height="12" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display='none'">`
              : '';

            const itemHtml = dbItem
              ? `<a href="../items.html?id=${dbItem.id}" class="lotro-item${qualityClass}" data-item-type="${dbItem.type || 'item'}"${tooltipAttr}>${lootIconHtml}<span class="lotro-item-text">${itemName}</span></a>`
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
    });

    let detailHtml = buildPage(detailBody, {
      title: `${inst.name} — Instance Details - LOTRO Guides`,
      metaDescription: `Detailed mob and ability data for ${inst.name} (${inst.groupType}). ${inst.mobCount} mobs documented.`,
      currentPage: 'instances',
      siteRoot: '../',
      ...navData,
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
    '<script src="./plugins/leaflet/leaflet.js"></script>',
    '<script src="./plugins/leaflet/leaflet.markercluster.js"></script>',
    '<script src="./js/lotro-map.js"></script>',
    '<script>',
    '  if (window.LOTRO_MAP_INIT) window.LOTRO_MAP_INIT();',
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
    }))
    .filter(v => v.youtubeId);

  const videoCards = videos.map(video => `
      <div class="col-12 col-md-6 m-b-30">
        <div class="panel panel-default">
          <div class="panel-body">
            <div class="embed-responsive embed-responsive-16by9 m-b-15">
              <iframe class="embed-responsive-item" src="https://www.youtube.com/embed/${video.youtubeId}" title="${video.title}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            </div>
            <h4 class="m-b-10">${video.title}</h4>
            <p class="text-muted m-b-10">${video.description}</p>
            <a class="btn btn-sm btn-default" href="https://youtu.be/${video.youtubeId}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
          </div>
        </div>
      </div>`).join('\n');

  const body = render(template, {
    videoCount: String(videos.length),
    videoCards,
  });

  const html = buildPage(body, {
    title: 'Media Gallery - LOTRO Guides',
    metaDescription: 'Watch LOTRO videos from the community in our embedded media gallery.',
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
  // Bundle Milkdown Crepe editor JS + CSS
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

  // Copy raw .md files so the editor can fetch them
  for (const subdir of ['guides', 'news']) {
    const srcDir = path.join(CONTENT_DIR, subdir);
    const destDir = path.join(OUTPUT_DIR, 'data', 'content', subdir);
    ensureDir(destDir);
    if (fs.existsSync(srcDir)) {
      for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.md'))) {
        fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
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
    (EDITOR_ALLOWED_EMAILS || GITHUB_REPO || GITHUB_CLIENT_ID)
      ? '<script>window.LOTRO_EDITOR_CONFIG={'
        + (EDITOR_ALLOWED_EMAILS ? 'allowedEmails:"' + EDITOR_ALLOWED_EMAILS.replace(/"/g, '\\"') + '",' : '')
        + (GITHUB_REPO ? 'githubRepo:"' + GITHUB_REPO.replace(/"/g, '\\"') + '",' : '')
        + (GITHUB_CLIENT_ID ? 'githubClientId:"' + GITHUB_CLIENT_ID.replace(/"/g, '\\"') + '"' : '')
        + '};</script>'
      : '',
    '<script src="./js/editor.bundle.js"></script>',
    '<script src="https://accounts.google.com/gsi/client" async defer></script>',
  ].filter(Boolean).join('\n    ');
  html = html.replace('</body>', `    ${editorScripts}\n  </body>`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'editor.html'), html);
}

// ─── Main Build ─────────────────────────────────────────────────────────────

async function build() {
  console.log('🏗  Building LOTRO guides...');
  const startTime = Date.now();

  // Convert images to WebP and collect dimensions metadata
  console.log('   📸 Converting images to WebP...');
  await convertImagesToWebp();

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
  buildInstancesPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ instances.html');

  // Build interactive map page
  buildMapPage({ guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ map.html');

  // Build editor page
  buildEditorPage(allPosts, { guideNavItems: guideNav, newsNavItems: newsNav });
  console.log('   ✓ editor.html');

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
    { loc: 'guides.html',  changefreq: 'weekly',  priority: '0.9' },
    { loc: 'news.html',    changefreq: 'daily',   priority: '0.9' },
    { loc: 'deeds.html',   changefreq: 'weekly',  priority: '0.8' },
    { loc: 'quests.html',  changefreq: 'weekly',  priority: '0.8' },
    { loc: 'items.html',   changefreq: 'weekly',  priority: '0.7' },
    { loc: 'mobs.html',    changefreq: 'weekly',  priority: '0.7' },
    { loc: 'virtues.html', changefreq: 'monthly', priority: '0.7' },
    { loc: 'sets.html',    changefreq: 'monthly', priority: '0.7' },
    { loc: 'instances.html', changefreq: 'weekly', priority: '0.7' },
    { loc: 'map.html',     changefreq: 'weekly',  priority: '0.8' },
    { loc: 'about.html',   changefreq: 'monthly', priority: '0.5' },
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
        `  <url>\n    <loc>${SITE_BASE_URL}/instances/${inst.slug}.html</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), xml, 'utf8');
  console.log(`   ✓ sitemap.xml (${urlEntries.length} URLs)`);
}

function buildRobotsTxt() {
  const content = `User-agent: *\nAllow: /\nDisallow: /editor.html\n\nSitemap: ${SITE_BASE_URL}/sitemap.xml\n`;
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
