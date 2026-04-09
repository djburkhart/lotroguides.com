import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema as mdSchema, defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import 'prosemirror-view/style/prosemirror.css';
import { marked } from 'marked';

/* ─── Custom Schema (extends markdown with widget nodes) ─────────── */
var schema = new Schema({
  nodes: mdSchema.spec.nodes
    .addToEnd('dps_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{dpsStatTable}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-dps', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-dps', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{dpsStatTable}}' };
      }}]
    })
    .addToEnd('map_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{map:map=1,height=450}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-map', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-map', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{map:map=1,height=450}}' };
      }}]
    })
    .addToEnd('consumable_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{consumableTable}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-consumable', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-consumable', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{consumableTable}}' };
      }}]
    })
    .addToEnd('instance_loot_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{instanceLootReference}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-instance-loot', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-instance-loot', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{instanceLootReference}}' };
      }}]
    })
    .addToEnd('quest_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{quest:}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-quest', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-quest', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{quest:}}' };
      }}]
    })
    .addToEnd('deed_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{deed:}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-deed', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-deed', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{deed:}}' };
      }}]
    })
    .addToEnd('trait_planner_widget', {
      group: 'block',
      atom: true,
      attrs: { token: { default: '{{traitPlanner:class=hunter,build=endgame}}' } },
      toDOM: function (node) {
        return ['div', { class: 'pm-widget pm-widget-trait-planner', 'data-token': node.attrs.token }];
      },
      parseDOM: [{ tag: 'div.pm-widget-trait-planner', getAttrs: function (dom) {
        return { token: dom.getAttribute('data-token') || '{{traitPlanner:class=hunter,build=endgame}}' };
      }}]
    }),
  marks: mdSchema.spec.marks
});

/* ─── Custom Markdown Parser & Serializer ────────────────────────── */
var mdParser = new MarkdownParser(schema, defaultMarkdownParser.tokenizer, defaultMarkdownParser.tokens);

var mdSerializer = new MarkdownSerializer(
  Object.assign({}, defaultMarkdownSerializer.nodes, {
    dps_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    map_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    consumable_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    instance_loot_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    quest_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    deed_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    },
    trait_planner_widget: function (state, node) {
      state.write(node.attrs.token);
      state.closeBlock(node);
    }
  }),
  defaultMarkdownSerializer.marks
);

/* ─── Widget Token Helpers ───────────────────────────────────────── */
function parseDpsToken(token) {
  var m = token.match(/^\{\{dpsStatTable(?::([^}]*))?\}\}$/);
  if (!m) return {};
  var opts = {};
  if (m[1]) {
    m[1].split(',').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq === -1) return;
      var key = pair.slice(0, eq).trim();
      var val = pair.slice(eq + 1).trim();
      if (key === 'levelCap') opts.levelCap = val;
      else if (key === 'heading') opts.heading = val;
    });
  }
  return opts;
}

function parseMapToken(token) {
  var m = token.match(/^\{\{map:([^}]+)\}\}$/);
  if (!m) return { type: 'map', id: '', height: '450' };
  var inner = m[1];
  var opts = {};
  inner.split(',').forEach(function (pair) {
    var eq = pair.indexOf('=');
    if (eq === -1) return;
    opts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  });
  var firstPair = inner.split(',')[0];
  var eqIdx = firstPair.indexOf('=');
  return {
    type: firstPair.slice(0, eqIdx).trim(),
    id: firstPair.slice(eqIdx + 1).trim(),
    height: opts.height || '450'
  };
}

function replaceWidgetTokens(doc) {
  var dpsRe = /^\{\{dpsStatTable(?::[^}]*)?\}\}$/;
  var mapRe = /^\{\{map:[^}]+\}\}$/;
  var consumableRe = /^\{\{consumableTable(?::[^}]*)?\}\}$/;
  var instanceLootRe = /^\{\{instanceLootReference\}\}$/;
  var questRe = /^\{\{quest:[^}]+\}\}$/;
  var deedRe = /^\{\{deed:[^}]+\}\}$/;
  var traitPlannerRe = /^\{\{traitPlanner:[^}]+\}\}$/;
  var changed = false;
  var newContent = [];
  doc.forEach(function (node) {
    if (node.type === schema.nodes.paragraph && node.childCount === 1 && node.firstChild.isText) {
      var text = node.firstChild.text.trim();
      if (dpsRe.test(text)) {
        newContent.push(schema.nodes.dps_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (mapRe.test(text)) {
        newContent.push(schema.nodes.map_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (consumableRe.test(text)) {
        newContent.push(schema.nodes.consumable_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (instanceLootRe.test(text)) {
        newContent.push(schema.nodes.instance_loot_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (questRe.test(text)) {
        newContent.push(schema.nodes.quest_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (deedRe.test(text)) {
        newContent.push(schema.nodes.deed_widget.create({ token: text }));
        changed = true;
        return;
      }
      if (traitPlannerRe.test(text)) {
        newContent.push(schema.nodes.trait_planner_widget.create({ token: text }));
        changed = true;
        return;
      }
    }
    newContent.push(node);
  });
  if (!changed) return doc;
  return schema.node('doc', null, newContent);
}

/* ─── Widget NodeViews ───────────────────────────────────────────── */
function DpsWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-dps';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
DpsWidgetView.prototype.render = function () {
  var opts = parseDpsToken(this.node.attrs.token);
  var html = '<div class="pm-widget-badge"><i class="fa fa-table"></i> DPS Stat Table</div>';
  var details = [];
  if (opts.levelCap) details.push('Level Cap: ' + opts.levelCap);
  if (opts.heading) details.push(opts.heading);
  if (details.length) html += '<div class="pm-widget-info">' + details.join(' &middot; ') + '</div>';
  this.dom.innerHTML = html;
};
DpsWidgetView.prototype.stopEvent = function () { return false; };
DpsWidgetView.prototype.ignoreMutation = function () { return true; };

function MapWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-map';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
MapWidgetView.prototype.render = function () {
  var info = parseMapToken(this.node.attrs.token);
  var label = info.type === 'map' ? 'Map Region' : info.type.charAt(0).toUpperCase() + info.type.slice(1);
  var html = '<div class="pm-widget-badge"><i class="fa fa-map-o"></i> Map Embed</div>'
    + '<div class="pm-widget-info">' + label + ': ' + info.id + ' &middot; ' + info.height + 'px</div>'
    + '<iframe src="map?' + encodeURIComponent(info.type) + '=' + encodeURIComponent(info.id)
    + '&embed=1" class="pm-widget-map-preview" loading="lazy" title="Map preview"></iframe>';
  this.dom.innerHTML = html;
};
MapWidgetView.prototype.stopEvent = function () { return false; };
MapWidgetView.prototype.ignoreMutation = function () { return true; };

/* ─── Consumable Widget Token Parser ─────────────────────────────── */
var consumablesRefCache = null;

function loadConsumablesRef() {
  if (consumablesRefCache) return Promise.resolve(consumablesRefCache);
  return fetch('./data/content/config/consumables-reference.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      consumablesRefCache = data || { items: [] };
      return consumablesRefCache;
    })
    .catch(function () {
      consumablesRefCache = { items: [] };
      return consumablesRefCache;
    });
}

function parseConsumableToken(token) {
  var m = token.match(/^\{\{consumableTable(?::([^}]*))?\}\}$/);
  if (!m) return {};
  var opts = {};
  if (m[1]) {
    m[1].split(',').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq === -1) return;
      var key = pair.slice(0, eq).trim();
      var val = pair.slice(eq + 1).trim();
      if (key === 'items') opts.items = val.split('+').map(function (s) { return s.trim(); });
      else if (key === 'heading') opts.heading = val;
    });
  }
  return opts;
}

function ConsumableWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-consumable';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
ConsumableWidgetView.prototype.render = function () {
  var opts = parseConsumableToken(this.node.attrs.token);
  var badge = '<div class="pm-widget-badge"><i class="fa fa-flask"></i> Consumable Table</div>';
  var info = '';
  if (opts.heading) info += opts.heading;
  if (opts.items && opts.items.length) {
    info += (info ? ' &middot; ' : '') + opts.items.length + ' items: ' + opts.items.join(', ');
  } else {
    info += (info ? ' &middot; ' : '') + 'All consumables (default)';
  }

  // Build a preview table from cache (async-loaded)
  var self = this;
  var html = badge + '<div class="pm-widget-info">' + info + '</div>';

  if (consumablesRefCache) {
    html += this.buildPreviewTable(consumablesRefCache, opts);
    this.dom.innerHTML = html;
  } else {
    this.dom.innerHTML = html + '<div class="pm-widget-info">Loading preview...</div>';
    loadConsumablesRef().then(function (ref) {
      self.dom.innerHTML = badge + '<div class="pm-widget-info">' + info + '</div>' + self.buildPreviewTable(ref, opts);
    });
  }
};
ConsumableWidgetView.prototype.buildPreviewTable = function (ref, opts) {
  var items = ref.items || [];
  if (opts.items && opts.items.length) {
    var keys = opts.items;
    items = items.filter(function (it) { return keys.indexOf(it.key) !== -1; });
    items.sort(function (a, b) { return keys.indexOf(a.key) - keys.indexOf(b.key); });
  }
  if (!items.length) return '';
  var html = '<table class="pm-widget-table"><thead><tr><th>Consumable</th><th>Example</th><th>Purpose</th></tr></thead><tbody>';
  items.forEach(function (it) {
    html += '<tr><td>' + (it.consumable || '') + '</td><td>' + (it.example || '') + '</td><td>' + (it.purpose || '') + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
};
ConsumableWidgetView.prototype.stopEvent = function () { return false; };
ConsumableWidgetView.prototype.ignoreMutation = function () { return true; };

function InstanceLootWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-instance-loot';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
InstanceLootWidgetView.prototype.render = function () {
  var html = '<div class="pm-widget-badge"><i class="fa fa-trophy"></i> Instance Loot Reference</div>'
    + '<div class="pm-widget-info">Renders the instance loot table for this guide\'s instance slug at build time</div>';
  this.dom.innerHTML = html;
};
InstanceLootWidgetView.prototype.stopEvent = function () { return false; };
InstanceLootWidgetView.prototype.ignoreMutation = function () { return true; };

function QuestWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-quest';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
QuestWidgetView.prototype.render = function () {
  var m = this.node.attrs.token.match(/^\{\{quest:([^}]+)\}\}$/);
  var ref = m ? m[1] : '?';
  this.dom.innerHTML = '<div class="pm-widget-badge"><i class="fa fa-exclamation-circle"></i> Quest Card</div>'
    + '<div class="pm-widget-info">' + ref + '</div>';
};
QuestWidgetView.prototype.stopEvent = function () { return false; };
QuestWidgetView.prototype.ignoreMutation = function () { return true; };

function DeedWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-deed';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
DeedWidgetView.prototype.render = function () {
  var m = this.node.attrs.token.match(/^\{\{deed:([^}]+)\}\}$/);
  var ref = m ? m[1] : '?';
  this.dom.innerHTML = '<div class="pm-widget-badge"><i class="fa fa-bookmark"></i> Deed Card</div>'
    + '<div class="pm-widget-info">' + ref + '</div>';
};
DeedWidgetView.prototype.stopEvent = function () { return false; };
DeedWidgetView.prototype.ignoreMutation = function () { return true; };

function parseTraitPlannerToken(token) {
  var m = token.match(/^\{\{traitPlanner:([^}]+)\}\}$/);
  if (!m) return {};
  var opts = {};
  m[1].split(',').forEach(function (pair) {
    var eq = pair.indexOf('=');
    if (eq === -1) return;
    opts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  });
  return opts;
}

function TraitPlannerWidgetView(node) {
  this.node = node;
  this.dom = document.createElement('div');
  this.dom.className = 'pm-widget pm-widget-trait-planner';
  this.dom.setAttribute('contenteditable', 'false');
  this.render();
}
TraitPlannerWidgetView.prototype.render = function () {
  var opts = parseTraitPlannerToken(this.node.attrs.token);
  var cls = opts['class'] || '?';
  var build = opts.build || '?';
  var level = opts.level || '160';
  var html = '<div class="pm-widget-badge"><i class="fa fa-sitemap"></i> Trait Planner</div>'
    + '<div class="pm-widget-info">' + cls.charAt(0).toUpperCase() + cls.slice(1) + ' &middot; ' + build + ' &middot; Level ' + level + '</div>';
  this.dom.innerHTML = html;
};
TraitPlannerWidgetView.prototype.stopEvent = function () { return false; };
TraitPlannerWidgetView.prototype.ignoreMutation = function () { return true; };

function insertWidgetNode(nodeType, attrs) {
  if (!editorView) return;
  var state = editorView.state;
  var tr = state.tr.replaceSelectionWith(nodeType.create(attrs));
  editorView.dispatch(tr);
  editorView.focus();
}

/* ─── State ──────────────────────────────────────────────────────── */
var editorView = null;
var currentUser = null;
var currentSlug = null;
var googleIdToken = null;
var githubToken = null;
var githubRepo = null; // { owner, name }
var githubBranch = 'main';

/* ─── Dirty / Change Tracking ────────────────────────────────────── */
var cleanDocJSON = null;       // JSON snapshot of doc after load/save
var cleanFrontmatter = null;   // snapshot of frontmatter field values
var autoDraftTimer = null;
var AUTO_DRAFT_DELAY = 5000;   // ms after last change before auto-draft
var lastDraftKey = null;
var isPublished = false;       // whether current article is published (on CDN/disk)

function snapshotFrontmatter() {
  return {
    title: document.getElementById('fm-title').value,
    date: document.getElementById('fm-date').value,
    category: document.getElementById('fm-category').value,
    author: document.getElementById('fm-author').value,
    tags: document.getElementById('fm-tags').value,
    image: document.getElementById('fm-image').value,
    excerpt: document.getElementById('fm-excerpt').value
  };
}

function isFrontmatterDirty() {
  if (!cleanFrontmatter) return false;
  var cur = snapshotFrontmatter();
  for (var k in cleanFrontmatter) {
    if (cur[k] !== cleanFrontmatter[k]) return true;
  }
  return false;
}

function isDocDirty() {
  if (!editorView || !cleanDocJSON) return false;
  return JSON.stringify(editorView.state.doc.toJSON()) !== cleanDocJSON;
}

function isDirty() {
  return isFrontmatterDirty() || isDocDirty();
}

function markClean() {
  if (editorView) cleanDocJSON = JSON.stringify(editorView.state.doc.toJSON());
  cleanFrontmatter = snapshotFrontmatter();
  updateSaveBar();
}

function updateSaveBar() {
  var bar = document.getElementById('save-changes-bar');
  if (!bar) return;
  var dirty = isDirty();
  bar.classList.toggle('visible', dirty);
  var btnSave = document.getElementById('btn-save-changes');
  if (btnSave) btnSave.disabled = !dirty;
}

function onEditorOrFrontmatterChange() {
  updateSaveBar();
  scheduleAutoDraft();
}

/* ─── Auto-Draft to CDN ──────────────────────────────────────────── */
function scheduleAutoDraft() {
  if (autoDraftTimer) clearTimeout(autoDraftTimer);
  if (!isDirty()) return;
  autoDraftTimer = setTimeout(function () {
    autoDraftTimer = null;
    saveAutoDraft();
  }, AUTO_DRAFT_DELAY);
}

function saveAutoDraft() {
  if (!isDirty()) return;
  var article = buildArticleJson();
  if (!article.slug && !article.title) return;
  var slug = article.slug || slugify(article.title) || 'untitled';
  saveLocalDraft(slug, article);
  showDraftStatus('Draft auto-saved');
}

/* ─── Local Draft Storage ────────────────────────────────────────── */
var DRAFT_PREFIX = 'lotro-draft:';
var DRAFT_INDEX_KEY = 'lotro-drafts-index';

function draftKey(slug) {
  return DRAFT_PREFIX + slug;
}

function saveLocalDraft(slug, article) {
  article.slug = slug;
  try {
    localStorage.setItem(draftKey(slug), JSON.stringify(article));
    // Update draft index
    var index = getLocalDraftIndex();
    var existing = index.findIndex(function (d) { return d.slug === slug; });
    var entry = {
      slug: slug,
      title: article.title || slug,
      category: article.category || 'guides',
      date: article.date || '',
      author: article.author || '',
      savedAt: new Date().toISOString(),
    };
    if (existing !== -1) {
      index[existing] = entry;
    } else {
      index.unshift(entry);
    }
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    showDraftStatus('Draft save failed (storage full?)', true);
  }
}

function loadLocalDraft(slug) {
  try {
    var raw = localStorage.getItem(draftKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function deleteLocalDraft(slug) {
  try {
    localStorage.removeItem(draftKey(slug));
    var index = getLocalDraftIndex();
    var filtered = index.filter(function (d) { return d.slug !== slug; });
    localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(filtered));
  } catch (e) { /* ignore */ }
}

function getLocalDraftIndex() {
  try {
    var raw = localStorage.getItem(DRAFT_INDEX_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function showDraftStatus(msg, isError) {
  var el = document.getElementById('draft-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'draft-status' + (isError ? ' draft-error' : '');
  el.style.display = '';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
}

/* ─── Lint Plugin (Spelling & Grammar) ───────────────────────────── */

// Common misspellings: misspelled → correct
var MISSPELLINGS = {
  'accomodate': 'accommodate', 'acheive': 'achieve', 'accross': 'across',
  'agressive': 'aggressive', 'apparantly': 'apparently', 'arguement': 'argument',
  'basicly': 'basically', 'begining': 'beginning', 'beleive': 'believe',
  'calender': 'calendar', 'catagory': 'category', 'commited': 'committed',
  'concious': 'conscious', 'definately': 'definitely', 'desparate': 'desperate',
  'dissapear': 'disappear', 'dissapoint': 'disappoint', 'embarass': 'embarrass',
  'enviroment': 'environment', 'existance': 'existence', 'familar': 'familiar',
  'foreward': 'forward', 'goverment': 'government', 'gaurd': 'guard',
  'happenned': 'happened', 'harrass': 'harass', 'humourous': 'humorous',
  'immediatly': 'immediately', 'independant': 'independent', 'knowlege': 'knowledge',
  'liason': 'liaison', 'liscence': 'licence', 'medeval': 'medieval',
  'momento': 'memento', 'millenium': 'millennium', 'mischievious': 'mischievous',
  'neccessary': 'necessary', 'noticable': 'noticeable', 'occassion': 'occasion',
  'occured': 'occurred', 'occurence': 'occurrence', 'orignal': 'original',
  'parliment': 'parliament', 'persistant': 'persistent', 'posession': 'possession',
  'prefered': 'preferred', 'privelege': 'privilege', 'publically': 'publicly',
  'recieve': 'receive', 'reccomend': 'recommend', 'refrence': 'reference',
  'relevent': 'relevant', 'restaraunt': 'restaurant', 'rythm': 'rhythm',
  'seige': 'siege', 'seperate': 'separate', 'succesful': 'successful',
  'supercede': 'supersede', 'supress': 'suppress', 'suprise': 'surprise',
  'temperture': 'temperature', 'threshhold': 'threshold', 'tommorow': 'tomorrow',
  'truely': 'truly', 'tyrany': 'tyranny', 'underate': 'underrate',
  'untill': 'until', 'usefull': 'useful', 'wierd': 'weird',
  'writting': 'writing', 'writeable': 'writable',
  // LOTRO-specific common misspellings
  'mordoor': 'Mordor', 'rohan': 'Rohan', 'gondoor': 'Gondor',
  'rivendel': 'Rivendell', 'lothloren': 'Lothlórien', 'isengaurd': 'Isengard',
  'angmaar': 'Angmar', 'helms deep': "Helm's Deep", 'minas tirith': 'Minas Tirith',
  'minas morgul': 'Minas Morgul', 'barad dur': 'Barad-dûr',
};
var MISSPELLING_KEYS = Object.keys(MISSPELLINGS);
var misspellingRegex = new RegExp('\\b(' + MISSPELLING_KEYS.join('|') + ')\\b', 'gi');

// Words that weaken writing
var WEAK_WORDS = /\b(obviously|clearly|evidently|simply|basically|actually|really|very|just|quite|rather)\b/gi;

// Repeated words: "the the", "is is", etc.
var REPEATED_WORD = /\b(\w+)\s+\1\b/gi;

// Punctuation issues: space before comma/period/exclamation/question
var BAD_PUNC = / ([,\.!?:;]) ?/g;

// Passive voice indicators
var PASSIVE_VOICE = /\b(is|are|was|were|be|been|being)\s+([\w]+ed|[\w]+en)\b/gi;

// Very long sentences (>40 words between sentence boundaries)
var SENTENCE_END = /[.!?]/;

var lintEnabled = false;

function lintDoc(doc) {
  var result = [];
  var lastHeadLevel = null;

  function record(msg, from, to, fix, severity) {
    result.push({ msg: msg, from: from, to: to, fix: fix || null, severity: severity || 'warning' });
  }

  doc.descendants(function (node, pos) {
    if (node.isText) {
      var text = node.text;
      var m;

      // Misspellings
      misspellingRegex.lastIndex = 0;
      while ((m = misspellingRegex.exec(text)) !== null) {
        var wrongWord = m[0];
        var correct = MISSPELLINGS[wrongWord.toLowerCase()];
        if (correct) {
          (function (w, c, idx) {
            record(
              "Misspelling: '" + w + "' → '" + c + "'",
              pos + idx, pos + idx + w.length,
              function (view) {
                view.dispatch(view.state.tr.replaceWith(
                  this.from, this.to,
                  view.state.schema.text(c)
                ));
              },
              'error'
            );
          })(wrongWord, correct, m.index);
        }
      }

      // Weak/filler words
      WEAK_WORDS.lastIndex = 0;
      while ((m = WEAK_WORDS.exec(text)) !== null) {
        record(
          "Consider removing filler word: '" + m[0] + "'",
          pos + m.index, pos + m.index + m[0].length,
          null, 'info'
        );
      }

      // Repeated words
      REPEATED_WORD.lastIndex = 0;
      while ((m = REPEATED_WORD.exec(text)) !== null) {
        (function (matched, single, idx) {
          record(
            "Repeated word: '" + single + "'",
            pos + idx, pos + idx + matched.length,
            function (view) {
              view.dispatch(view.state.tr.replaceWith(
                this.from, this.to,
                view.state.schema.text(single)
              ));
            },
            'error'
          );
        })(m[0], m[1], m.index);
      }

      // Punctuation spacing
      BAD_PUNC.lastIndex = 0;
      while ((m = BAD_PUNC.exec(text)) !== null) {
        (function (matched, punc, idx) {
          record(
            'Suspicious spacing before punctuation',
            pos + idx, pos + idx + matched.length,
            function (view) {
              view.dispatch(view.state.tr.replaceWith(
                this.from, this.to,
                view.state.schema.text(punc + ' ')
              ));
            },
            'warning'
          );
        })(m[0], m[1], m.index);
      }

      // Passive voice hints
      PASSIVE_VOICE.lastIndex = 0;
      while ((m = PASSIVE_VOICE.exec(text)) !== null) {
        record(
          'Consider active voice instead of: "' + m[0] + '"',
          pos + m.index, pos + m.index + m[0].length,
          null, 'info'
        );
      }

      // Long sentences
      var sentences = text.split(SENTENCE_END);
      var offset = 0;
      for (var i = 0; i < sentences.length; i++) {
        var s = sentences[i];
        var wordCount = s.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length;
        if (wordCount > 40) {
          record(
            'Long sentence (' + wordCount + ' words). Consider splitting.',
            pos + offset, pos + offset + s.length,
            null, 'info'
          );
        }
        offset += s.length + 1; // +1 for the sentence-end character
      }
    } else if (node.type.name === 'heading') {
      // Heading level jumps
      var level = node.attrs.level;
      if (lastHeadLevel !== null && level > lastHeadLevel + 1) {
        (function (lvl, expectedLvl) {
          record(
            'Heading jumps from H' + lastHeadLevel + ' to H' + lvl + ' (expected H' + expectedLvl + ' or less)',
            pos + 1, pos + 1 + node.content.size,
            function (view) {
              view.dispatch(view.state.tr.setNodeMarkup(this.from - 1, null, { level: expectedLvl }));
            },
            'warning'
          );
        })(level, lastHeadLevel + 1);
      }
      lastHeadLevel = level;
    } else if (node.type.name === 'image' && !node.attrs.alt) {
      record('Image without alt text', pos, pos + 1, function (view) {
        var alt = prompt('Alt text', '');
        if (alt) {
          var attrs = Object.assign({}, view.state.doc.nodeAt(this.from).attrs, { alt: alt });
          view.dispatch(view.state.tr.setNodeMarkup(this.from, null, attrs));
        }
      }, 'warning');
    }
  });

  return result;
}

function lintDecorations(doc) {
  var decos = [];
  lintDoc(doc).forEach(function (prob) {
    decos.push(
      Decoration.inline(prob.from, prob.to, { class: 'lint-problem lint-' + prob.severity }, { prob: prob }),
      Decoration.widget(prob.from, function () {
        var icon = document.createElement('span');
        icon.className = 'lint-icon lint-icon-' + prob.severity;
        icon.title = prob.msg;
        icon.setAttribute('aria-label', prob.msg);
        return icon;
      }, { key: prob.msg + prob.from })
    );
  });
  return DecorationSet.create(doc, decos);
}

var emptyDecoSet = DecorationSet.empty;

function getLintProb(view, lintPlugin, dom) {
  var pos = view.posAtDOM(dom, 0);
  var decos = lintPlugin.getState(view.state);
  if (!decos || decos === emptyDecoSet) return null;
  var found = decos.find(pos, pos, function (spec) { return spec.prob && spec.prob.msg === dom.title; });
  return found.length ? found[0].spec.prob : null;
}

var lintPlugin = new Plugin({
  state: {
    init: function (_, state) {
      return lintEnabled ? lintDecorations(state.doc) : emptyDecoSet;
    },
    apply: function (tr, old, oldState, newState) {
      if (!lintEnabled) return emptyDecoSet;
      return tr.docChanged ? lintDecorations(newState.doc) : old;
    }
  },
  props: {
    decorations: function (state) { return this.getState(state); },
    handleClick: function (view, _, event) {
      if (/lint-icon/.test(event.target.className)) {
        var prob = getLintProb(view, this, event.target);
        if (prob) {
          view.dispatch(view.state.tr
            .setSelection(TextSelection.create(view.state.doc, prob.from, prob.to))
            .scrollIntoView());
          return true;
        }
      }
    },
    handleDoubleClick: function (view, _, event) {
      if (/lint-icon/.test(event.target.className)) {
        var prob = getLintProb(view, this, event.target);
        if (prob && prob.fix) {
          prob.fix.call(prob, view);
          view.focus();
          return true;
        }
      }
    }
  }
});

function toggleLint() {
  lintEnabled = !lintEnabled;
  var btn = document.querySelector('[data-cmd="lint"]');
  if (btn) btn.classList.toggle('active', lintEnabled);
  // Update lint count badge
  updateLintCount();
  // Force plugin recompute
  if (editorView) {
    editorView.dispatch(editorView.state.tr);
  }
}

function updateLintCount() {
  var badge = document.getElementById('lint-count');
  if (!badge) return;
  if (!lintEnabled || !editorView) {
    badge.style.display = 'none';
    return;
  }
  var problems = lintDoc(editorView.state.doc);
  var errors = problems.filter(function (p) { return p.severity === 'error'; }).length;
  var warnings = problems.filter(function (p) { return p.severity === 'warning'; }).length;
  var total = problems.length;
  if (total > 0) {
    badge.textContent = total;
    badge.title = errors + ' errors, ' + warnings + ' warnings, ' + (total - errors - warnings) + ' suggestions';
    badge.className = 'lint-count-badge' + (errors > 0 ? ' lint-count-error' : '');
    badge.style.display = '';
  } else {
    badge.textContent = '✓';
    badge.className = 'lint-count-badge lint-count-ok';
    badge.title = 'No issues found';
    badge.style.display = '';
  }
}

/* ─── Change-Tracking Plugin ─────────────────────────────────────── */
var changeTrackPlugin = new Plugin({
  state: {
    init: function () { return { changeCount: 0 }; },
    apply: function (tr, value) {
      if (tr.docChanged) {
        return { changeCount: value.changeCount + 1 };
      }
      return value;
    }
  },
  view: function () {
    return {
      update: function () {
        onEditorOrFrontmatterChange();
      }
    };
  }
});

/* ─── CDN Upload (DigitalOcean Spaces via serverless function) ───── */
function cdnApi(payload) {
  var cfg = window.LOTRO_EDITOR_CONFIG || {};
  var url = cfg.cdnUploadUrl;
  if (!url) return Promise.reject(new Error('CDN upload URL not configured'));
  payload.idToken = googleIdToken;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) {
    if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); });
    return r.json();
  }).then(function (data) {
    if (data.error) throw new Error(data.error);
    return data;
  });
}

function cdnUploadFile(key, content, contentType) {
  var encoded = btoa(unescape(encodeURIComponent(content)));
  return cdnApi({ action: 'upload', key: key, content: encoded, contentType: contentType });
}

function cdnListVersions(key) {
  return cdnApi({ action: 'versions', key: key });
}

function cdnRestoreVersion(key, versionId) {
  return cdnApi({ action: 'restore', key: key, versionId: versionId });
}

function isCdnConfigured() {
  return !!(window.LOTRO_EDITOR_CONFIG || {}).cdnUploadUrl;
}

/* ─── Image Upload ───────────────────────────────────────────────── */
function updateImagePreview(src) {
  var preview = document.getElementById('fm-image-preview');
  if (!preview) return;
  if (src) {
    // Normalize the stored path for display: strip ../lotro/ prefix if present
    var displaySrc = src.replace(/^\.\.\/lotro\//, './');
    preview.innerHTML = '<img src="' + displaySrc + '" alt="Featured image">';
  } else {
    preview.innerHTML = '<span class="fm-image-placeholder"><i class="fa fa-image"></i> No image</span>';
  }
}

function setImageStatus(msg, isError) {
  var el = document.getElementById('fm-image-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'fm-image-status' + (isError ? ' error' : '');
}

function uploadImage(file) {
  var category = document.getElementById('fm-category').value || 'guides';
  var ext = file.name.split('.').pop().toLowerCase();
  var slug = currentSlug || slugify(document.getElementById('fm-title').value) || 'article';
  var filename = slug + '.' + ext;
  var imgPath = 'img/' + category + '/' + filename;

  setImageStatus('Uploading...', false);

  if (isCdnConfigured()) {
    // Live: upload to CDN
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = reader.result.split(',')[1];
      cdnApi({ action: 'upload', key: imgPath, content: base64, contentType: file.type })
        .then(function () {
          document.getElementById('fm-image').value = imgPath;
          updateImagePreview(imgPath);
          setImageStatus('Uploaded to CDN', false);
          onEditorOrFrontmatterChange();
        })
        .catch(function (err) { setImageStatus('Upload failed: ' + err.message, true); });
    };
    reader.readAsDataURL(file);
  } else {
    // Dev: upload to local server
    var formData = new FormData();
    formData.append('image', file);
    formData.append('path', imgPath);
    fetch('/api/upload-image', { method: 'POST', body: formData })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        document.getElementById('fm-image').value = imgPath;
        updateImagePreview(imgPath);
        setImageStatus('Saved locally', false);
        onEditorOrFrontmatterChange();
      })
      .catch(function (err) { setImageStatus('Upload failed: ' + err.message, true); });
  }
}

function showSaveToast(message, isError) {
  var toast = document.getElementById('save-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'save-toast' + (isError ? ' save-toast-error' : ' save-toast-success');
  toast.style.display = '';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () { toast.style.display = 'none'; }, 3000);
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── GitHub API ─────────────────────────────────────────────────── */
function ghApi(path, opts) {
  opts = opts || {};
  var url = 'https://api.github.com' + path;
  var headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + githubToken,
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(url, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (r) {
    if (r.status === 204) return null;
    return r.json().then(function (data) {
      if (!r.ok) throw new Error(data.message || 'GitHub API error ' + r.status);
      return data;
    });
  });
}

function parseRepoConfig() {
  var cfg = (window.LOTRO_EDITOR_CONFIG || {}).githubRepo || '';
  if (!cfg) return null;
  var parts = cfg.split('/');
  if (parts.length !== 2) return null;
  return { owner: parts[0], name: parts[1] };
}

function connectGitHub() {
  if (!googleIdToken) {
    showSaveToast('Sign in with Google first', true);
    return;
  }
  var cfg = window.LOTRO_EDITOR_CONFIG || {};
  if (!cfg.githubClientId) {
    showSaveToast('GitHub OAuth is not configured for this site.', true);
    return;
  }

  // Step 1: Request device + user verification codes via DO Function
  fetch('/api/github/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'device-code', idToken: googleIdToken })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data.error) throw new Error(data.error);
    showDeviceFlowModal(data);
  })
  .catch(function (err) {
    showSaveToast('GitHub device code request failed: ' + err.message, true);
  });
}

function showDeviceFlowModal(deviceData) {
  // Remove any existing modal
  var existing = document.getElementById('gh-device-modal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'gh-device-modal';
  overlay.className = 'gh-device-overlay';
  overlay.innerHTML =
    '<div class="gh-device-dialog">' +
      '<h4><i class="fa fa-github"></i> Connect GitHub</h4>' +
      '<p>Enter this code on GitHub:</p>' +
      '<div class="gh-device-code" id="gh-user-code">' + esc(deviceData.user_code) + '</div>' +
      '<button class="btn btn-sm btn-default" id="gh-copy-code"><i class="fa fa-clipboard"></i> Copy Code</button>' +
      ' <a class="btn btn-sm btn-primary" href="' + esc(deviceData.verification_uri) + '" target="_blank" rel="noopener" id="gh-open-github">' +
        '<i class="fa fa-external-link"></i> Open GitHub</a>' +
      '<p class="gh-device-status" id="gh-device-status"><i class="fa fa-spinner fa-spin"></i> Waiting for authorization...</p>' +
      '<button class="btn btn-sm btn-link" id="gh-device-cancel">Cancel</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var cancelled = false;
  var pollInterval = (deviceData.interval || 5) * 1000;
  var expiresAt = Date.now() + (deviceData.expires_in || 900) * 1000;

  document.getElementById('gh-copy-code').addEventListener('click', function () {
    navigator.clipboard.writeText(deviceData.user_code).then(function () {
      showSaveToast('Code copied to clipboard');
    });
  });

  document.getElementById('gh-device-cancel').addEventListener('click', function () {
    cancelled = true;
    overlay.remove();
  });

  // Step 3: Poll for access token
  function poll() {
    if (cancelled) return;
    if (Date.now() > expiresAt) {
      document.getElementById('gh-device-status').innerHTML = '<i class="fa fa-times-circle"></i> Code expired. Please try again.';
      setTimeout(function () { overlay.remove(); }, 3000);
      return;
    }

    fetch('/api/github/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'device-poll', device_code: deviceData.device_code, idToken: googleIdToken })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (cancelled) return;

      if (data.access_token) {
        // Success — store token and connect
        githubToken = data.access_token;
        githubRepo = parseRepoConfig();
        persistGitHubToken();

        return ghApi('/repos/' + githubRepo.owner + '/' + githubRepo.name)
          .then(function (repo) {
            githubBranch = repo.default_branch || 'main';
            updateConnectionStatus();
            document.getElementById('gh-device-status').innerHTML = '<i class="fa fa-check-circle"></i> Connected!';
            setTimeout(function () { overlay.remove(); }, 1500);
            showSaveToast('Connected to ' + githubRepo.owner + '/' + githubRepo.name);
          });
      }

      if (data.error === 'authorization_pending') {
        // Not yet — keep polling
        setTimeout(poll, pollInterval);
        return;
      }

      if (data.error === 'slow_down') {
        // Back off
        pollInterval = (data.interval || (pollInterval / 1000 + 5)) * 1000;
        setTimeout(poll, pollInterval);
        return;
      }

      if (data.error === 'access_denied') {
        document.getElementById('gh-device-status').innerHTML = '<i class="fa fa-times-circle"></i> Authorization denied by user.';
        setTimeout(function () { overlay.remove(); }, 3000);
        return;
      }

      // Other error
      throw new Error(data.error_description || data.error || 'Unknown error');
    })
    .catch(function (err) {
      if (!cancelled) {
        document.getElementById('gh-device-status').innerHTML = '<i class="fa fa-exclamation-triangle"></i> ' + esc(err.message);
        setTimeout(function () { overlay.remove(); }, 4000);
      }
    });
  }

  // Start polling after the interval
  setTimeout(poll, pollInterval);
}

/* ─── GitHub Token Persistence (synced with Google session) ──────── */
var GITHUB_SESSION_KEY = 'github_session';

function persistGitHubToken() {
  if (!githubToken) return;
  try {
    localStorage.setItem(GITHUB_SESSION_KEY, JSON.stringify({
      token: githubToken,
      savedAt: Date.now()
    }));
  } catch (e) { /* storage full or blocked */ }
}

function restoreGitHubSession() {
  // Only restore if Google is already logged in
  if (!googleIdToken) return;
  try {
    var raw = localStorage.getItem(GITHUB_SESSION_KEY);
    if (!raw) return;
    var session = JSON.parse(raw);
    // Expire after 30 days (same as Google session)
    if (Date.now() - session.savedAt > GOOGLE_SESSION_MAX_AGE) {
      localStorage.removeItem(GITHUB_SESSION_KEY);
      return;
    }
    githubRepo = parseRepoConfig();
    if (!githubRepo) return;
    githubToken = session.token;
    // Validate token still works
    ghApi('/repos/' + githubRepo.owner + '/' + githubRepo.name)
      .then(function (repo) {
        githubBranch = repo.default_branch || 'main';
        updateConnectionStatus();
      })
      .catch(function () {
        githubToken = null;
        githubRepo = null;
        localStorage.removeItem(GITHUB_SESSION_KEY);
        updateConnectionStatus();
      });
  } catch (e) {
    localStorage.removeItem(GITHUB_SESSION_KEY);
  }
}

function disconnectGitHub() {
  githubToken = null;
  githubRepo = null;
  localStorage.removeItem(GITHUB_SESSION_KEY);
  updateConnectionStatus();
}

function ghGetFile(filePath) {
  return ghApi('/repos/' + githubRepo.owner + '/' + githubRepo.name + '/contents/' + encodeURIComponent(filePath).replace(/%2F/g, '/') + '?ref=' + githubBranch);
}

function ghSaveFile(filePath, content, message) {
  var repoPath = '/repos/' + githubRepo.owner + '/' + githubRepo.name + '/contents/' + encodeURIComponent(filePath).replace(/%2F/g, '/');
  var encoded = btoa(unescape(encodeURIComponent(content)));

  // Try to get existing file SHA first
  return ghApi(repoPath + '?ref=' + githubBranch)
    .then(function (existing) {
      return ghApi(repoPath, {
        method: 'PUT',
        body: { message: message, content: encoded, sha: existing.sha, branch: githubBranch }
      });
    })
    .catch(function (err) {
      if (err.message && err.message.indexOf('Not Found') !== -1) {
        // New file
        return ghApi(repoPath, {
          method: 'PUT',
          body: { message: message, content: encoded, branch: githubBranch }
        });
      }
      throw err;
    });
}

function isGitHubConnected() {
  return !!(githubToken && githubRepo);
}

/* ─── Connection Status (unified) ────────────────────────────────── */
function updateConnectionStatus() {
  var statusEl = document.getElementById('workspace-status');
  var btnGh = document.getElementById('btn-connect-github');
  var btnGhDisc = document.getElementById('btn-disconnect-github');

  // Status bar shows both CDN (articles) and GitHub (config) state
  var parts = [];
  if (isCdnConfigured()) parts.push('<i class="fa fa-cloud-upload"></i> CDN');
  if (isGitHubConnected()) parts.push('<i class="fa fa-github"></i> ' + esc(githubRepo.owner + '/' + githubRepo.name));

  if (statusEl) {
    statusEl.innerHTML = parts.length ? parts.join(' · ') : '<i class="fa fa-cloud-upload"></i> Not connected';
    statusEl.className = 'workspace-status' + (parts.length ? ' connected' : '');
  }

  if (isGitHubConnected()) {
    if (btnGh) btnGh.style.display = 'none';
    if (btnGhDisc) btnGhDisc.style.display = '';
  } else {
    if (btnGh) btnGh.style.display = '';
    if (btnGhDisc) btnGhDisc.style.display = 'none';
  }

  // Article save button — CDN
  var articleIcon = isCdnConfigured() ? 'cloud-upload' : 'save';
  var articleLabel = isCdnConfigured() ? 'Save' : 'Save';
  var btnDl = document.getElementById('btn-download');
  if (btnDl) btnDl.innerHTML = '<i class="fa fa-' + articleIcon + '"></i> ' + articleLabel + ' .md';

  // Config save buttons — GitHub
  var configIcon = isGitHubConnected() ? 'github' : 'download';
  var configLabel = isGitHubConnected() ? 'Save' : 'Download';
  var btnCfgDl = document.getElementById('btn-config-download');
  if (btnCfgDl) btnCfgDl.innerHTML = '<i class="fa fa-' + configIcon + '"></i> ' + configLabel + ' .json';
  var btnDpsSave = document.getElementById('btn-dps-save-config');
  if (btnDpsSave) btnDpsSave.innerHTML = '<i class="fa fa-' + configIcon + '"></i> ' + configLabel + ' Config';
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function slugify(text) {
  return (text || '').toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ─── Frontmatter ────────────────────────────────────────────────── */
function parseFrontmatter(text) {
  var m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, content: text };
  var data = {};
  m[1].split('\n').forEach(function (line) {
    var kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) return;
    var val = kv[2].trim();
    if (val.charAt(0) === '[' && val.charAt(val.length - 1) === ']') {
      val = val.slice(1, -1).split(',').map(function (s) {
        return s.trim().replace(/^["']|["']$/g, '');
      });
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    data[kv[1]] = val;
  });
  return { data: data, content: m[2].trim() };
}

function buildFrontmatter(asDraft) {
  var lines = ['---'];
  var title = document.getElementById('fm-title').value;
  var date = document.getElementById('fm-date').value;
  var category = document.getElementById('fm-category').value;
  var author = document.getElementById('fm-author').value;
  var tags = document.getElementById('fm-tags').value;
  var excerpt = document.getElementById('fm-excerpt').value;
  var image = document.getElementById('fm-image').value;
  if (title) lines.push('title: "' + title.replace(/"/g, '\\"') + '"');
  if (date) lines.push('date: ' + date);
  if (category) lines.push('category: ' + category);
  if (author) lines.push('author: "' + author.replace(/"/g, '\\"') + '"');
  if (tags) {
    var arr = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    lines.push('tags: [' + arr.join(', ') + ']');
  }
  if (image) lines.push('image: "' + image.replace(/"/g, '\\"') + '"');
  if (excerpt) lines.push('excerpt: "' + excerpt.replace(/"/g, '\\"') + '"');
  if (asDraft) lines.push('draft: true');
  lines.push('---');
  return lines.join('\n') + '\n';
}

function buildArticleJson() {
  var tagsRaw = document.getElementById('fm-tags').value;
  var tags = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
  return {
    slug: currentSlug || slugify(document.getElementById('fm-title').value) || 'article',
    category: document.getElementById('fm-category').value || 'guides',
    title: document.getElementById('fm-title').value || '',
    date: document.getElementById('fm-date').value || '',
    author: document.getElementById('fm-author').value || '',
    tags: tags,
    image: document.getElementById('fm-image').value || '',
    excerpt: document.getElementById('fm-excerpt').value || '',
    markdown: getMarkdown(),
  };
}

/* ─── ProseMirror Editor ─────────────────────────────────────────── */

function buildInputRules() {
  return inputRules({ rules: [
    // > blockquote
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
    // 1. ordered list
    wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, function (match) {
      return { order: +match[1] };
    }, function (match, node) { return node.childCount + node.attrs.order === +match[1]; }),
    // - or * bullet list
    wrappingInputRule(/^\s*[-*]\s$/, schema.nodes.bullet_list),
    // ``` code block
    textblockTypeInputRule(/^```$/, schema.nodes.code_block),
    // # headings 1-6
    textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, function (match) {
      return { level: match[1].length };
    }),
  ]});
}

function createEditor(markdown) {
  var root = document.getElementById('prosemirror-editor');
  if (!root) throw new Error('No editor root');

  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  root.innerHTML = '';

  // Cancel any pending auto-draft from previous article
  if (autoDraftTimer) { clearTimeout(autoDraftTimer); autoDraftTimer = null; }

  var doc = mdParser.parse(markdown || '');
  doc = replaceWidgetTokens(doc);

  var state = EditorState.create({
    doc: doc,
    plugins: [
      buildInputRules(),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-`': toggleMark(schema.marks.code),
        'Mod-s': function (state, dispatch) { saveMarkdown(); return true; },
      }),
      keymap(baseKeymap),
      history(),
      lintPlugin,
      changeTrackPlugin,
    ],
  });

  editorView = new EditorView(root, {
    state: state,
    dispatchTransaction: function (tr) {
      var newState = editorView.state.apply(tr);
      editorView.updateState(newState);
      updateToolbarState();
      if (lintEnabled && tr.docChanged) updateLintCount();
    },
    nodeViews: {
      dps_widget: function (node, view, getPos) { return new DpsWidgetView(node); },
      map_widget: function (node, view, getPos) { return new MapWidgetView(node); },
      consumable_widget: function (node, view, getPos) { return new ConsumableWidgetView(node); },
      instance_loot_widget: function (node, view, getPos) { return new InstanceLootWidgetView(node); },
      quest_widget: function (node, view, getPos) { return new QuestWidgetView(node); },
      deed_widget: function (node, view, getPos) { return new DeedWidgetView(node); },
      trait_planner_widget: function (node, view, getPos) { return new TraitPlannerWidgetView(node); },
    },
  });

  // Snapshot clean state after editor is ready
  cleanDocJSON = JSON.stringify(editorView.state.doc.toJSON());
  cleanFrontmatter = snapshotFrontmatter();

  updateToolbarState();
  updateSaveBar();
  return Promise.resolve(editorView);
}

function getMarkdown() {
  if (!editorView) return '';
  return mdSerializer.serialize(editorView.state.doc);
}

/* ─── Toolbar Commands ───────────────────────────────────────────── */
function execToggleMark(markType) {
  if (!editorView) return;
  toggleMark(markType)(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function execSetBlock(nodeType, attrs) {
  if (!editorView) return;
  setBlockType(nodeType, attrs)(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function execWrapIn(nodeType) {
  if (!editorView) return;
  wrapIn(nodeType)(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function execLift() {
  if (!editorView) return;
  lift(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function execUndo() {
  if (!editorView) return;
  undo(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function execRedo() {
  if (!editorView) return;
  redo(editorView.state, editorView.dispatch, editorView);
  editorView.focus();
}

function toolbarInsertLink() {
  if (!editorView) return;
  var state = editorView.state;
  var linkMark = schema.marks.link;
  // Check if there's an existing link at cursor
  var from = state.selection.from;
  var to = state.selection.to;
  var existing = null;
  state.doc.nodesBetween(from, to, function (node) {
    var m = linkMark.isInSet(node.marks);
    if (m) existing = m;
  });

  var href = prompt('URL:', existing ? existing.attrs.href : 'https://');
  if (href === null) return;
  if (!href) {
    // Remove link
    toggleMark(linkMark)(editorView.state, editorView.dispatch, editorView);
  } else {
    // Apply link
    var markType = linkMark.create({ href: href, title: '' });
    var tr = state.tr.addMark(from, to, markType);
    editorView.dispatch(tr);
  }
  editorView.focus();
}

function toolbarInsertHR() {
  if (!editorView) return;
  var state = editorView.state;
  var tr = state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create());
  editorView.dispatch(tr);
  editorView.focus();
}

function isMarkActive(markType) {
  if (!editorView) return false;
  var state = editorView.state;
  var from = state.selection.from;
  var to = state.selection.to;
  if (from === to) {
    return !!markType.isInSet(state.storedMarks || state.doc.resolve(from).marks());
  }
  var active = false;
  state.doc.nodesBetween(from, to, function (node) {
    if (markType.isInSet(node.marks)) active = true;
  });
  return active;
}

function isBlockType(nodeType, attrs) {
  if (!editorView) return false;
  var state = editorView.state;
  var $from = state.selection.$from;
  for (var d = $from.depth; d >= 0; d--) {
    var node = $from.node(d);
    if (node.type === nodeType) {
      if (!attrs) return true;
      for (var k in attrs) {
        if (node.attrs[k] !== attrs[k]) return false;
      }
      return true;
    }
  }
  return false;
}

function updateToolbarState() {
  var buttons = document.querySelectorAll('.pm-toolbar [data-cmd]');
  buttons.forEach(function (btn) {
    var cmd = btn.getAttribute('data-cmd');
    var active = false;
    switch (cmd) {
      case 'bold': active = isMarkActive(schema.marks.strong); break;
      case 'italic': active = isMarkActive(schema.marks.em); break;
      case 'code': active = isMarkActive(schema.marks.code); break;
      case 'h1': active = isBlockType(schema.nodes.heading, { level: 1 }); break;
      case 'h2': active = isBlockType(schema.nodes.heading, { level: 2 }); break;
      case 'h3': active = isBlockType(schema.nodes.heading, { level: 3 }); break;
      case 'blockquote': active = isBlockType(schema.nodes.blockquote); break;
      case 'code_block': active = isBlockType(schema.nodes.code_block); break;
    }
    btn.classList.toggle('active', active);
  });
}

function wireToolbar() {
  var toolbar = document.querySelector('.pm-toolbar');
  if (!toolbar) return;
  toolbar.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cmd]');
    if (!btn) return;
    e.preventDefault();
    var cmd = btn.getAttribute('data-cmd');
    switch (cmd) {
      case 'bold': execToggleMark(schema.marks.strong); break;
      case 'italic': execToggleMark(schema.marks.em); break;
      case 'code': execToggleMark(schema.marks.code); break;
      case 'link': toolbarInsertLink(); break;
      case 'h1': execSetBlock(schema.nodes.heading, { level: 1 }); break;
      case 'h2': execSetBlock(schema.nodes.heading, { level: 2 }); break;
      case 'h3': execSetBlock(schema.nodes.heading, { level: 3 }); break;
      case 'paragraph': execSetBlock(schema.nodes.paragraph); break;
      case 'blockquote': execWrapIn(schema.nodes.blockquote); break;
      case 'bullet_list': execWrapIn(schema.nodes.bullet_list); break;
      case 'ordered_list': execWrapIn(schema.nodes.ordered_list); break;
      case 'code_block': execSetBlock(schema.nodes.code_block); break;
      case 'lift': execLift(); break;
      case 'hr': toolbarInsertHR(); break;
      case 'undo': execUndo(); break;
      case 'redo': execRedo(); break;
      case 'lint': toggleLint(); break;
    }
  });
}

/* ─── Google Sign-In ─────────────────────────────────────────────── */
var GOOGLE_SESSION_KEY = 'google_session';
var GOOGLE_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function applyGoogleLogin(credential) {
  googleIdToken = credential;
  var parts = credential.split('.');
  var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  var json = decodeURIComponent(atob(b64).split('').map(function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  var payload = JSON.parse(json);
  var email = (payload.email || '').toLowerCase();

  var cfg = window.LOTRO_EDITOR_CONFIG || {};
  if (cfg.allowedEmails) {
    var allowed = cfg.allowedEmails.split(',').map(function (e) { return e.trim().toLowerCase(); });
    if (allowed.indexOf(email) === -1) {
      var el = document.getElementById('login-error');
      el.textContent = 'Access denied. Your account (' + email + ') is not authorized.';
      el.style.display = 'block';
      return false;
    }
  }

  currentUser = { email: email, name: payload.name || email, picture: payload.picture || '' };
  document.getElementById('user-name').textContent = currentUser.name;
  var avatar = document.getElementById('user-avatar');
  if (currentUser.picture) {
    avatar.src = currentUser.picture;
    avatar.style.display = '';
  }
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('editor-app').style.display = '';
  return true;
}

window.handleGoogleCredential = function (response) {
  if (applyGoogleLogin(response.credential)) {
    try {
      localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify({
        credential: response.credential,
        savedAt: Date.now()
      }));
    } catch (e) { /* storage full or blocked */ }
    loadArticleList();
  }
};

function restoreGoogleSession() {
  try {
    var raw = localStorage.getItem(GOOGLE_SESSION_KEY);
    if (!raw) return;
    var session = JSON.parse(raw);
    if (Date.now() - session.savedAt > GOOGLE_SESSION_MAX_AGE) {
      localStorage.removeItem(GOOGLE_SESSION_KEY);
      return;
    }
    if (applyGoogleLogin(session.credential)) {
      loadArticleList();
    }
  } catch (e) {
    localStorage.removeItem(GOOGLE_SESSION_KEY);
  }
}

window.handleSignOut = function () {
  currentUser = null;
  googleIdToken = null;
  localStorage.removeItem(GOOGLE_SESSION_KEY);
  // Disconnect GitHub when Google signs out
  githubToken = null;
  githubRepo = null;
  localStorage.removeItem(GITHUB_SESSION_KEY);
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  document.getElementById('login-section').style.display = '';
  document.getElementById('editor-app').style.display = 'none';
};

/* ─── Article List ───────────────────────────────────────────────── */
function loadArticleList() {
  fetch('./data/editor-manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (articles) {
      renderArticleList(articles);
    })
    .catch(function () {
      // Manifest may not exist — just show local drafts
      renderArticleList([]);
    });
}

function renderArticleList(publishedArticles) {
  var list = document.getElementById('article-list');
  list.innerHTML = '';

  // Build a set of manifest slugs
  var manifestSlugs = {};
  publishedArticles.forEach(function (a) { manifestSlugs[a.slug] = true; });

  // Local drafts that don't have a manifest counterpart (purely local, never saved to disk/CDN)
  var drafts = getLocalDraftIndex();
  drafts.forEach(function (d) {
    if (manifestSlugs[d.slug]) return; // will show under manifest listing
    var li = document.createElement('li');
    li.className = 'editor-article-item';
    li.innerHTML =
      '<span class="editor-article-cat badge-draft">draft</span>' +
      '<span class="editor-article-title">' + esc(d.title) + '</span>' +
      '<small class="editor-article-date">' + esc(d.date || '') + '</small>';
    li.addEventListener('click', function () { loadDraft(d.slug); });
    list.appendChild(li);
  });

  // Manifest articles (published + server drafts, with local-draft overlay)
  publishedArticles.forEach(function (a) {
    var hasLocalDraft = drafts.some(function (d) { return d.slug === a.slug; });
    var isDraft = a.draft || false;
    var li = document.createElement('li');
    li.className = 'editor-article-item';
    var badges = '';
    if (isDraft) {
      badges += '<span class="editor-article-cat badge-draft">draft</span>';
    } else {
      badges += '<span class="editor-article-cat badge-' + esc(a.category) + '">' + esc(a.category) + '</span>';
    }
    if (hasLocalDraft) {
      badges += '<span class="editor-article-cat badge-draft" style="margin-left:-4px">local</span>';
    }
    li.innerHTML =
      badges +
      '<span class="editor-article-title">' + esc(a.title) + '</span>' +
      '<small class="editor-article-date">' + esc(a.date || '') + '</small>';
    li.addEventListener('click', function () {
      if (hasLocalDraft) {
        loadDraft(a.slug);
      } else if (isDraft) {
        loadArticle(a.category, a.slug, true);
      } else {
        loadArticle(a.category, a.slug);
      }
    });
    list.appendChild(li);
  });
}

/* ─── Load Article ───────────────────────────────────────────────── */
function loadArticle(category, slug, asDraft) {
  fetch('./data/content/' + encodeURIComponent(category) + '/' + encodeURIComponent(slug) + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(function (data) {
      populateEditor(data, category, slug);
      isPublished = !asDraft;
      updatePublishState();
    })
    .catch(function (e) { alert('Could not load article: ' + e.message); });
}

function loadDraft(slug) {
  var data = loadLocalDraft(slug);
  if (!data) {
    alert('Draft not found in local storage.');
    return;
  }
  populateEditor(data, data.category || 'guides', slug);
  isPublished = false;
  updatePublishState();
}

function populateEditor(data, category, slug) {
  document.getElementById('fm-title').value = data.title || '';
  document.getElementById('fm-date').value = data.date || '';
  document.getElementById('fm-author').value = data.author || '';
  document.getElementById('fm-tags').value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
  document.getElementById('fm-excerpt').value = data.excerpt || '';
  document.getElementById('fm-image').value = data.image || '';
  updateImagePreview(data.image || '');
  document.getElementById('fm-category').value = data.category || category;
  currentSlug = slug;
  createEditor(data.markdown || '').then(function () {
    showEditPanel();
  });
}

function updatePublishState() {
  var badge = document.getElementById('article-status-badge');
  var btnPublish = document.getElementById('btn-publish');
  var btnUnpublish = document.getElementById('btn-unpublish');
  var btnSaveDraft = document.getElementById('btn-save-draft');

  if (badge) {
    badge.style.display = '';
    if (isPublished) {
      badge.textContent = 'Published';
      badge.className = 'article-status-badge status-published';
    } else {
      badge.textContent = 'Draft';
      badge.className = 'article-status-badge status-draft';
    }
  }
  if (btnPublish) btnPublish.style.display = '';
  if (btnUnpublish) btnUnpublish.style.display = isPublished ? '' : 'none';
  if (btnSaveDraft) btnSaveDraft.style.display = '';
}

/* ─── New Article ────────────────────────────────────────────────── */
function newArticle() {
  currentSlug = null;
  isPublished = false;
  document.getElementById('fm-title').value = '';
  document.getElementById('fm-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('fm-author').value = currentUser ? currentUser.name : '';
  document.getElementById('fm-tags').value = '';
  document.getElementById('fm-excerpt').value = '';
  document.getElementById('fm-image').value = '';
  updateImagePreview('');
  document.getElementById('fm-category').value = 'guides';
  createEditor('').then(function () {
    updatePublishState();
    showEditPanel();
  });
}

/* ─── Save / Download ────────────────────────────────────────────── */

function saveDraft() {
  var article = buildArticleJson();
  var slug = article.slug || slugify(article.title) || 'untitled';
  currentSlug = slug;
  article.slug = slug;
  var category = article.category;

  // Always keep a localStorage backup
  saveLocalDraft(slug, article);

  // Upload to CDN/disk with draft: true so it persists across browsers
  var fm = buildFrontmatter(true);  // draft=true
  var full = fm + '\n' + article.markdown + '\n';

  function afterDraftSave(msg) {
    markClean();
    if (autoDraftTimer) { clearTimeout(autoDraftTimer); autoDraftTimer = null; }
    isPublished = false;
    updatePublishState();
    showSaveToast(msg);
    setTimeout(loadArticleList, 2000);
  }

  if (isCdnConfigured()) {
    var cdnKey = 'content/' + category + '/' + slug + '.md';
    cdnUploadFile(cdnKey, full, 'text/markdown; charset=utf-8')
      .then(function (res) {
        var msg = 'Draft saved to CDN';
        if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
        afterDraftSave(msg);
      })
      .catch(function (err) { showSaveToast('Draft save failed: ' + err.message, true); });
  } else {
    var editorKey = 'content/' + category + '/' + slug + '.md';
    var isUpdate = !!currentSlug;
    var endpoint = isUpdate ? '/api/editor/update' : '/api/editor/upload';
    var encoded = btoa(unescape(encodeURIComponent(full)));
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editorKey, content: encoded, contentType: 'text/markdown; charset=utf-8' })
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
      return r.json();
    })
    .then(function (res) {
      var msg = 'Draft saved';
      if (res.local) msg += ' (rebuilding…)';
      afterDraftSave(msg);
    })
    .catch(function (err) { showSaveToast('Draft save failed: ' + err.message, true); });
  }
}

function publishArticle() {
  var article = buildArticleJson();
  var slug = article.slug;
  var category = article.category;

  function afterPublish() {
    markClean();
    if (autoDraftTimer) { clearTimeout(autoDraftTimer); autoDraftTimer = null; }
    isPublished = true;
    updatePublishState();
    // Remove local draft since it's now published
    deleteLocalDraft(slug);
  }

  var fm = buildFrontmatter();
  var full = fm + '\n' + article.markdown + '\n';

  if (isCdnConfigured()) {
    var cdnKey = 'content/' + category + '/' + slug + '.md';
    cdnUploadFile(cdnKey, full, 'text/markdown; charset=utf-8')
      .then(function (res) {
        afterPublish();
        currentSlug = slug;
        var msg = 'Published ' + cdnKey;
        if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
        showSaveToast(msg);
        // Manifest is updated server-side; reload list after CDN cache settles
        setTimeout(loadArticleList, 2000);
      })
      .catch(function (err) { showSaveToast('Publish failed: ' + err.message, true); });
  } else {
    var editorKey = 'content/' + category + '/' + slug + '.md';
    var isUpdate = !!currentSlug;
    var endpoint = isUpdate ? '/api/editor/update' : '/api/editor/upload';
    var encoded = btoa(unescape(encodeURIComponent(full)));
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editorKey, content: encoded, contentType: 'text/markdown; charset=utf-8' })
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
      return r.json();
    })
    .then(function (res) {
      afterPublish();
      currentSlug = slug;
      var msg = 'Published ' + editorKey;
      if (res.local) msg += ' (rebuilding…)';
      showSaveToast(msg);
      // Reload the article list after rebuild has time to finish
      setTimeout(loadArticleList, 3000);
    })
    .catch(function (err) { showSaveToast('Publish failed: ' + err.message, true); });
  }
}

function unpublishArticle() {
  if (!currentSlug) return;
  if (!confirm('Unpublish this article? It will be saved as a draft and hidden from the live site.')) return;

  var article = buildArticleJson();
  // Save current state as local draft backup
  saveLocalDraft(currentSlug, article);

  // Upload with draft: true in frontmatter so the build skips it
  var category = article.category;
  var fm = buildFrontmatter(true);  // pass draft=true
  var full = fm + '\n' + article.markdown + '\n';

  function afterUnpublish() {
    markClean();
    isPublished = false;
    updatePublishState();
    showSaveToast('Article unpublished — saved as draft');
    setTimeout(loadArticleList, 2000);
  }

  if (isCdnConfigured()) {
    var cdnKey = 'content/' + category + '/' + currentSlug + '.md';
    cdnUploadFile(cdnKey, full, 'text/markdown; charset=utf-8')
      .then(function () { afterUnpublish(); })
      .catch(function (err) { showSaveToast('Unpublish failed: ' + err.message, true); });
  } else {
    var editorKey = 'content/' + category + '/' + currentSlug + '.md';
    var encoded = btoa(unescape(encodeURIComponent(full)));
    fetch('/api/editor/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editorKey, content: encoded, contentType: 'text/markdown; charset=utf-8' })
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
      return r.json();
    })
    .then(function () { afterUnpublish(); })
    .catch(function (err) { showSaveToast('Unpublish failed: ' + err.message, true); });
  }
}

// Keep legacy name for download button
function saveMarkdown() {
  publishArticle();
}

/* ─── UI Navigation ──────────────────────────────────────────────── */

/* ─── Preview Toggle ─────────────────────────────────────────────── */
function togglePreview(on) {
  var editorContainer = document.getElementById('milkdown-editor');
  var previewContainer = document.getElementById('editor-preview');
  var previewContent = document.getElementById('editor-preview-content');
  var saveBar = document.getElementById('save-changes-bar');
  var frontmatter = document.querySelector('.editor-frontmatter');

  if (on) {
    // Render markdown to HTML
    var md = getMarkdown();
    var title = document.getElementById('fm-title').value;
    var date = document.getElementById('fm-date').value;
    var author = document.getElementById('fm-author').value;
    var image = document.getElementById('fm-image').value;
    var excerpt = document.getElementById('fm-excerpt').value;

    var headerHtml = '';
    if (title) headerHtml += '<h1>' + esc(title) + '</h1>';
    if (date || author) {
      headerHtml += '<p style="color:#888; font-size:13px; margin-bottom:4px;">';
      if (date) headerHtml += '<i class="fa fa-calendar"></i> ' + esc(date);
      if (date && author) headerHtml += ' &nbsp;|&nbsp; ';
      if (author) headerHtml += '<i class="fa fa-user"></i> ' + esc(author);
      headerHtml += '</p>';
    }
    if (excerpt) headerHtml += '<p style="color:#666; font-style:italic; margin-bottom:16px;">' + esc(excerpt) + '</p>';
    if (image) headerHtml += '<img src="' + esc(image) + '" alt="" style="max-width:100%;border-radius:4px;margin-bottom:16px;">';
    if (headerHtml) headerHtml += '<hr>';

    var bodyHtml = marked.parse(md);
    previewContent.innerHTML = headerHtml + bodyHtml;

    editorContainer.style.display = 'none';
    if (saveBar) saveBar.style.display = 'none';
    if (frontmatter) frontmatter.style.display = 'none';
    previewContainer.style.display = '';
  } else {
    previewContainer.style.display = 'none';
    editorContainer.style.display = '';
    if (frontmatter) frontmatter.style.display = '';
    // Save bar visibility is managed by updateSaveBar; trigger it
    if (typeof updateSaveBar === 'function') updateSaveBar();
  }
}

function showEditPanel() {
  document.getElementById('article-panel').style.display = 'none';
  document.getElementById('edit-panel').style.display = '';
  // Reset preview toggle when entering edit mode
  var toggle = document.getElementById('btn-preview-toggle');
  if (toggle && toggle.checked) {
    toggle.checked = false;
    togglePreview(false);
  }
}

function showArticlePanel() {
  document.getElementById('edit-panel').style.display = 'none';
  document.getElementById('article-panel').style.display = '';
  // Reset preview toggle
  var toggle = document.getElementById('btn-preview-toggle');
  if (toggle) toggle.checked = false;
}

function switchTab(tabName) {
  var tabs = document.querySelectorAll('.editor-tab');
  var contents = document.querySelectorAll('.editor-tab-content');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
  }
  for (var i = 0; i < contents.length; i++) {
    contents[i].style.display = contents[i].id === 'tab-' + tabName ? '' : 'none';
  }
  if (tabName === 'config') loadConfigList();
  if (tabName === 'builds') loadBuildsList();
}

/* ─── Config Editor ──────────────────────────────────────────────── */
var currentConfigKey = null;

function loadConfigList() {
  fetch('./data/config-manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (configs) {
      var container = document.getElementById('config-list');
      container.innerHTML = '';
      configs.forEach(function (c) {
        var item = document.createElement('div');
        item.className = 'editor-config-item';
        item.innerHTML =
          '<i class="fa fa-file-code-o"></i> ' +
          '<span class="editor-config-item-label">' + esc(c.label) + '</span>' +
          '<small class="text-muted">' + esc(c.key) + '.json</small>';
        item.addEventListener('click', function () { loadConfigFile(c.key, c.label); });
        container.appendChild(item);
      });
    })
    .catch(function () {
      document.getElementById('config-list').innerHTML = '<p class="text-muted">No config files found.</p>';
    });
}

function loadConfigFile(key, label) {
  fetch('./data/content/config/' + encodeURIComponent(key) + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.text();
    })
    .then(function (text) {
      currentConfigKey = key;
      document.getElementById('config-edit-label').textContent = label;
      document.getElementById('config-json-error').style.display = 'none';
      // Pretty-print the JSON for editing
      try {
        var parsed = JSON.parse(text);
        document.getElementById('config-json-editor').value = JSON.stringify(parsed, null, 2);
      } catch (e) {
        document.getElementById('config-json-editor').value = text;
      }
      document.getElementById('config-list').style.display = 'none';
      document.getElementById('config-edit-panel').style.display = '';
    })
    .catch(function (e) { alert('Could not load config: ' + e.message); });
}

function showConfigList() {
  document.getElementById('config-edit-panel').style.display = 'none';
  document.getElementById('config-list').style.display = '';
  currentConfigKey = null;
}

function validateConfigJson() {
  var el = document.getElementById('config-json-editor');
  var errEl = document.getElementById('config-json-error');
  try {
    JSON.parse(el.value);
    errEl.style.display = 'none';
    return true;
  } catch (e) {
    errEl.textContent = 'Invalid JSON: ' + e.message;
    errEl.style.display = 'block';
    return false;
  }
}

var CONFIG_KEY_PATHS = {
  'navigation': 'content/navigation.json',
  'homepage-flow': 'content/homepage-flow.json',
  'media-videos': 'content/media/videos.json',
  'dps-reference': 'content/stats/dps-reference.json',
  'loot-reference': 'content/instances/loot-reference.json'
};

function saveConfigJson() {
  if (!validateConfigJson()) return;
  var text = document.getElementById('config-json-editor').value;
  var filename = (currentConfigKey || 'config') + '.json';

  if (isGitHubConnected() && CONFIG_KEY_PATHS[currentConfigKey]) {
    var ghPath = CONFIG_KEY_PATHS[currentConfigKey];
    ghSaveFile(ghPath, text, 'Update ' + filename)
      .then(function () { showSaveToast('Committed ' + ghPath + ' to ' + githubBranch); })
      .catch(function (err) { showSaveToast('GitHub save failed: ' + err.message, true); });
  } else {
    downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), filename);
  }
}

/* ─── Builds Management ──────────────────────────────────────────── */
var buildsApiUrl = '/api/builds/save';

function loadBuildsList() {
  var container = document.getElementById('builds-list');
  var classFilter = document.getElementById('builds-class-filter').value;
  container.innerHTML = '<p class="text-muted">Loading builds...</p>';

  var payload = { action: 'list', limit: 200 };
  if (classFilter) payload.class = classFilter;

  fetch(buildsApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (!data.builds || data.builds.length === 0) {
      container.innerHTML = '<p class="text-muted">No community builds found' + (classFilter ? ' for ' + classFilter : '') + '.</p>';
      return;
    }
    var html = '<div class="builds-count text-muted" style="margin-bottom:8px">' + data.total + ' build' + (data.total !== 1 ? 's' : '') + '</div>';
    data.builds.forEach(function (b) {
      var pts = b.ps || {};
      var specLabel = '';
      if (pts.r >= pts.b && pts.r >= pts.y) specLabel = 'Red';
      else if (pts.b >= pts.r && pts.b >= pts.y) specLabel = 'Blue';
      else specLabel = 'Yellow';
      var className = (b.class || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      html += '<li class="builds-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #333">'
        + '<div style="flex:1;min-width:0">'
        + '<strong>' + escapeHtml(b.name || 'Unnamed') + '</strong>'
        + ' <span class="text-muted">— ' + className + ' (' + specLabel + ')</span>'
        + (b.desc ? '<br><small class="text-muted">' + escapeHtml(b.desc).substring(0, 120) + '</small>' : '')
        + '<br><small class="text-muted">Lv ' + (b.level || '?') + ' · ❤️ ' + (b.likes || 0) + ' · ' + (b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '?') + '</small>'
        + '</div>'
        + '<div style="flex-shrink:0;margin-left:12px">'
        + '<a href="/skills?class=' + encodeURIComponent(b.class) + '&id=' + encodeURIComponent(b.id) + '" target="_blank" class="btn btn-xs btn-default" title="View build"><i class="fa fa-external-link"></i></a> '
        + '<button class="btn btn-xs btn-danger btn-delete-build" data-build-id="' + escapeHtml(b.id) + '" data-build-name="' + escapeHtml(b.name || 'Unnamed') + '" title="Delete build"><i class="fa fa-trash"></i></button>'
        + '</div>'
        + '</li>';
    });
    container.innerHTML = '<ul style="list-style:none;padding:0;margin:0">' + html + '</ul>';

    // Bind delete buttons
    container.querySelectorAll('.btn-delete-build').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-build-id');
        var name = btn.getAttribute('data-build-name');
        deleteBuild(id, name);
      });
    });
  })
  .catch(function (err) {
    container.innerHTML = '<p class="text-danger">Failed to load builds: ' + escapeHtml(err.message) + '</p>';
  });
}

function deleteBuild(buildId, buildName) {
  if (!confirm('Delete build "' + buildName + '"?\n\nThis cannot be undone.')) return;
  if (!googleIdToken) {
    alert('You must be signed in to delete builds.');
    return;
  }

  fetch(buildsApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id: buildId, idToken: googleIdToken })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data.error) throw new Error(data.error);
    showSaveToast('Deleted build: ' + buildName);
    loadBuildsList();
  })
  .catch(function (err) {
    alert('Delete failed: ' + err.message);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Insert Text at Cursor ──────────────────────────────────────── */
function insertTextAtCursor(text) {
  if (!editorView) return;
  var state = editorView.state;
  var from = state.selection.from;
  var tr = state.tr.insertText(text, from);
  editorView.dispatch(tr);
  editorView.focus();
}

/* ─── DPS Widget Modal ───────────────────────────────────────────── */
var dpsConfig = null;

function openDpsModal() {
  var modal = document.getElementById('dps-widget-modal');
  modal.style.display = '';
  if (!dpsConfig) {
    fetch('./data/content/config/dps-reference.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        dpsConfig = data || getDefaultDpsConfig();
        populateDpsModal();
      })
      .catch(function () {
        dpsConfig = getDefaultDpsConfig();
        populateDpsModal();
      });
  } else {
    populateDpsModal();
  }
}

function getDefaultDpsConfig() {
  return {
    levelCap: 150,
    sectionHeading: 'Desired Stat Percentages (Raid Targets)',
    appliesTo: ['class', 'raid'],
    tableColumns: ['Stat', 'T1 Target', 'T2 Target', 'T3+ Target'],
    tableRows: [
      { stat: 'Physical Mastery', t1: '**200%+**', t2: '**210%+**', t3: '**220%+**' },
      { stat: 'Critical Rating', t1: '**28%+**', t2: '**30%+**', t3: '**33%+**' },
      { stat: 'Devastating Hits', t1: '**8%+**', t2: '**9%+**', t3: '**10%+**' },
      { stat: 'Finesse', t1: '**35%-40%**', t2: '**40%-45%**', t3: '**45%-50%**' },
      { stat: 'Tactical Mitigation', t1: '**40%-45%**', t2: '**45%-50%**', t3: '**50%-55%**' },
      { stat: 'Physical Mitigation', t1: '**40%-45%**', t2: '**45%-50%**', t3: '**50%-55%**' }
    ]
  };
}

function populateDpsModal() {
  document.getElementById('dps-level-cap').value = dpsConfig.levelCap || '';
  document.getElementById('dps-section-heading').value = dpsConfig.sectionHeading || '';
  document.getElementById('dps-applies-to').value = Array.isArray(dpsConfig.appliesTo) ? dpsConfig.appliesTo.join(', ') : (dpsConfig.appliesTo || '');

  var cols = dpsConfig.tableColumns || [];
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('dps-col-' + i);
    if (el) el.value = cols[i] || '';
  }

  renderDpsRows();
  updateDpsPreview();
}

function renderDpsRows() {
  var container = document.getElementById('dps-rows-container');
  container.innerHTML = '';
  var rows = dpsConfig.tableRows || [];
  rows.forEach(function (row, idx) {
    var div = document.createElement('div');
    div.className = 'dps-row-editor row';
    div.setAttribute('data-idx', idx);
    div.innerHTML =
      '<div class="col-md-3"><input type="text" class="form-control input-sm dps-row-stat" value="' + esc(row.stat) + '" placeholder="Stat name"></div>' +
      '<div class="col-md-3"><input type="text" class="form-control input-sm dps-row-t1" value="' + esc(row.t1) + '" placeholder="T1 value"></div>' +
      '<div class="col-md-2"><input type="text" class="form-control input-sm dps-row-t2" value="' + esc(row.t2) + '" placeholder="T2 value"></div>' +
      '<div class="col-md-2"><input type="text" class="form-control input-sm dps-row-t3" value="' + esc(row.t3) + '" placeholder="T3+ value"></div>' +
      '<div class="col-md-2"><button class="btn btn-xs btn-danger dps-row-remove" data-idx="' + idx + '"><i class="fa fa-trash"></i></button></div>';
    container.appendChild(div);
  });

  // Wire row inputs for live preview
  container.querySelectorAll('input').forEach(function (inp) {
    inp.addEventListener('input', function () { syncDpsFromForm(); updateDpsPreview(); });
  });
  container.querySelectorAll('.dps-row-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = parseInt(btn.getAttribute('data-idx'), 10);
      dpsConfig.tableRows.splice(i, 1);
      renderDpsRows();
      updateDpsPreview();
    });
  });
}

function syncDpsFromForm() {
  dpsConfig.levelCap = parseInt(document.getElementById('dps-level-cap').value, 10) || null;
  dpsConfig.sectionHeading = document.getElementById('dps-section-heading').value;
  var at = document.getElementById('dps-applies-to').value;
  dpsConfig.appliesTo = at ? at.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];

  var cols = [];
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('dps-col-' + i);
    cols.push(el ? el.value : '');
  }
  dpsConfig.tableColumns = cols;

  var rowEls = document.querySelectorAll('.dps-row-editor');
  var newRows = [];
  rowEls.forEach(function (el) {
    newRows.push({
      stat: el.querySelector('.dps-row-stat').value,
      t1: el.querySelector('.dps-row-t1').value,
      t2: el.querySelector('.dps-row-t2').value,
      t3: el.querySelector('.dps-row-t3').value
    });
  });
  dpsConfig.tableRows = newRows;
}

function updateDpsPreview() {
  var cols = dpsConfig.tableColumns || [];
  var rows = dpsConfig.tableRows || [];
  if (!cols.length || !rows.length) {
    document.getElementById('dps-table-preview').innerHTML = '<p class="text-muted">No data to preview.</p>';
    return;
  }
  var levelCapNote = dpsConfig.levelCap ? '<small class="text-muted">Level Cap: ' + esc(String(dpsConfig.levelCap)) + '</small><br>' : '';
  var html = levelCapNote + '<table class="table table-bordered table-sm"><thead><tr>';
  cols.forEach(function (c) { html += '<th>' + esc(c) + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach(function (r) {
    html += '<tr>';
    html += '<td>' + esc(r.stat) + '</td>';
    html += '<td>' + esc(r.t1) + '</td>';
    html += '<td>' + esc(r.t2) + '</td>';
    html += '<td>' + esc(r.t3) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('dps-table-preview').innerHTML = html;
}

function addDpsRow() {
  syncDpsFromForm();
  dpsConfig.tableRows.push({ stat: '', t1: '', t2: '', t3: '' });
  renderDpsRows();
  updateDpsPreview();
}

function closeDpsModal() {
  document.getElementById('dps-widget-modal').style.display = 'none';
}

function saveDpsConfig() {
  syncDpsFromForm();
  var json = JSON.stringify(dpsConfig, null, 2);

  if (isGitHubConnected()) {
    ghSaveFile('content/stats/dps-reference.json', json, 'Update DPS reference config')
      .then(function () { showSaveToast('Committed dps-reference.json to ' + githubBranch); })
      .catch(function (err) { showSaveToast('GitHub save failed: ' + err.message, true); });
  } else {
    downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8' }), 'dps-reference.json');
  }
}

function insertDpsWidget() {
  syncDpsFromForm();
  var opts = [];
  if (dpsConfig.levelCap) opts.push('levelCap=' + dpsConfig.levelCap);
  if (dpsConfig.sectionHeading) opts.push('heading=' + dpsConfig.sectionHeading);
  var token = '{{dpsStatTable' + (opts.length ? ':' + opts.join(',') : '') + '}}';
  insertWidgetNode(schema.nodes.dps_widget, { token: token });
  closeDpsModal();
}

/* ─── Quest / Deed Search Modals ─────────────────────────────────── */
var questCache = null;
var deedCache = null;
var selectedQuest = null;
var selectedDeed = null;
var questSearchTimer = null;
var deedSearchTimer = null;

function loadLookupData(type) {
  var cache = type === 'quest' ? questCache : deedCache;
  if (cache) return Promise.resolve(cache);
  var file = type === 'quest' ? 'data/quests-db.json' : 'data/deeds-db.json';
  return fetch('./' + file)
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (data) {
      if (type === 'quest') { questCache = data; return data; }
      deedCache = data; return data;
    });
}

function searchLookup(items, query, limit) {
  var q = query.toLowerCase();
  var results = [];
  for (var i = 0; i < items.length && results.length < (limit || 30); i++) {
    if ((items[i].n || '').toLowerCase().indexOf(q) !== -1) results.push(items[i]);
  }
  return results;
}

function renderLookupResults(containerId, results, type) {
  var container = document.getElementById(containerId);
  if (!results.length) {
    container.innerHTML = '<div class="text-muted" style="padding:8px 0">No results found.</div>';
    return;
  }
  var html = '';
  results.forEach(function (item) {
    var meta = [];
    if (item.lv) meta.push('Lv ' + item.lv);
    if (type === 'quest' && item.cat) meta.push(item.cat);
    if (type === 'deed' && item.tp) meta.push(item.tp);
    html += '<div class="lookup-result" data-id="' + esc(item.id) + '" data-name="' + esc(item.n) + '">'
      + '<span class="lookup-result-name">' + esc(item.n) + '</span>'
      + (meta.length ? '<span class="lookup-result-meta">' + esc(meta.join(' · ')) + '</span>' : '')
      + '</div>';
  });
  container.innerHTML = html;

  // Bind click handlers
  container.querySelectorAll('.lookup-result').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-id');
      var name = el.getAttribute('data-name');
      selectLookupResult(type, id, name, el);
    });
  });
}

function selectLookupResult(type, id, name, el) {
  var prefix = type === 'quest' ? 'quest' : 'deed';
  if (type === 'quest') selectedQuest = { id: id, n: name };
  else selectedDeed = { id: id, n: name };

  // Highlight selected row
  var container = document.getElementById(prefix + '-search-results');
  container.querySelectorAll('.lookup-result').forEach(function (r) { r.classList.remove('active'); });
  if (el) el.classList.add('active');

  // Show selected item
  document.getElementById(prefix + '-selected').style.display = '';
  document.getElementById(prefix + '-selected-name').textContent = name;
  document.getElementById(prefix + '-selected-meta').textContent = ' (ID: ' + id + ')';
  document.getElementById('btn-' + prefix + '-insert').disabled = false;
}

function openQuestSearchModal() {
  selectedQuest = null;
  var modal = document.getElementById('quest-search-modal');
  modal.style.display = '';
  document.getElementById('quest-search-input').value = '';
  document.getElementById('quest-search-results').innerHTML = '';
  document.getElementById('quest-selected').style.display = 'none';
  document.getElementById('btn-quest-insert').disabled = true;

  var status = document.getElementById('quest-search-status');
  if (!questCache) {
    status.textContent = 'Loading quest database...';
    loadLookupData('quest').then(function (data) {
      status.textContent = data.length.toLocaleString() + ' quests loaded. Start typing to search.';
    }).catch(function () {
      status.textContent = 'Failed to load quest data.';
    });
  } else {
    status.textContent = questCache.length.toLocaleString() + ' quests loaded. Start typing to search.';
  }

  document.getElementById('quest-search-input').focus();
}

function closeQuestSearchModal() {
  document.getElementById('quest-search-modal').style.display = 'none';
}

function insertQuestWidget() {
  if (!selectedQuest) return;
  insertWidgetNode(schema.nodes.quest_widget, { token: '{{quest:' + selectedQuest.id + '}}' });
  closeQuestSearchModal();
}

function openDeedSearchModal() {
  selectedDeed = null;
  var modal = document.getElementById('deed-search-modal');
  modal.style.display = '';
  document.getElementById('deed-search-input').value = '';
  document.getElementById('deed-search-results').innerHTML = '';
  document.getElementById('deed-selected').style.display = 'none';
  document.getElementById('btn-deed-insert').disabled = true;

  var status = document.getElementById('deed-search-status');
  if (!deedCache) {
    status.textContent = 'Loading deed database...';
    loadLookupData('deed').then(function (data) {
      status.textContent = data.length.toLocaleString() + ' deeds loaded. Start typing to search.';
    }).catch(function () {
      status.textContent = 'Failed to load deed data.';
    });
  } else {
    status.textContent = deedCache.length.toLocaleString() + ' deeds loaded. Start typing to search.';
  }

  document.getElementById('deed-search-input').focus();
}

function closeDeedSearchModal() {
  document.getElementById('deed-search-modal').style.display = 'none';
}

function insertDeedWidget() {
  if (!selectedDeed) return;
  insertWidgetNode(schema.nodes.deed_widget, { token: '{{deed:' + selectedDeed.id + '}}' });
  closeDeedSearchModal();
}

/* ─── Trait Planner Widget Modal ─────────────────────────────────── */
var traitPlannerBuildsCache = null;

function loadTraitPlannerBuilds() {
  if (traitPlannerBuildsCache) return Promise.resolve(traitPlannerBuildsCache);
  return fetch('./data/builds/')
    .then(function () {
      // Fetch the build manifest by loading known class files
      var classes = ['beorning','brawler','burglar','captain','champion','guardian','hunter','lore-master','mariner','minstrel','rune-keeper','warden'];
      return Promise.all(classes.map(function (cls) {
        return fetch('./data/builds/' + cls + '.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) { return data ? { class: cls, builds: data.builds } : null; })
          .catch(function () { return null; });
      }));
    })
    .then(function (results) {
      traitPlannerBuildsCache = results.filter(Boolean);
      return traitPlannerBuildsCache;
    });
}

function openTraitPlannerModal() {
  var modal = document.getElementById('trait-planner-modal');
  if (!modal) return;
  modal.style.display = '';

  var classSelect = document.getElementById('tp-class');
  var buildSelect = document.getElementById('tp-build');
  var levelInput = document.getElementById('tp-level');
  var btnInsert = document.getElementById('btn-tp-insert');
  var status = document.getElementById('tp-status');

  levelInput.value = '160';
  btnInsert.disabled = true;

  if (traitPlannerBuildsCache) {
    populateTraitPlannerSelects(traitPlannerBuildsCache, classSelect, buildSelect, btnInsert);
    status.textContent = '';
  } else {
    status.textContent = 'Loading class data...';
    classSelect.innerHTML = '<option value="">Loading...</option>';
    buildSelect.innerHTML = '<option value="">--</option>';
    loadTraitPlannerBuilds().then(function (data) {
      populateTraitPlannerSelects(data, classSelect, buildSelect, btnInsert);
      status.textContent = '';
    }).catch(function () {
      status.textContent = 'Failed to load class data.';
    });
  }
}

function populateTraitPlannerSelects(data, classSelect, buildSelect, btnInsert) {
  classSelect.innerHTML = '<option value="">Select class...</option>';
  data.forEach(function (entry) {
    var opt = document.createElement('option');
    opt.value = entry.class;
    opt.textContent = entry.class.charAt(0).toUpperCase() + entry.class.slice(1).replace(/-/g, ' ');
    classSelect.appendChild(opt);
  });

  classSelect.onchange = function () {
    var cls = classSelect.value;
    buildSelect.innerHTML = '<option value="">Select build...</option>';
    btnInsert.disabled = true;
    if (!cls) return;
    var entry = data.find(function (e) { return e.class === cls; });
    if (!entry || !entry.builds) return;
    Object.keys(entry.builds).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = entry.builds[key].name || key;
      buildSelect.appendChild(opt);
    });
  };

  buildSelect.onchange = function () {
    btnInsert.disabled = !classSelect.value || !buildSelect.value;
  };
}

function closeTraitPlannerModal() {
  var modal = document.getElementById('trait-planner-modal');
  if (modal) modal.style.display = 'none';
}

function insertTraitPlannerWidget() {
  var cls = document.getElementById('tp-class').value;
  var build = document.getElementById('tp-build').value;
  var level = document.getElementById('tp-level').value || '160';
  if (!cls || !build) return;
  var token = '{{traitPlanner:class=' + cls + ',build=' + build + ',level=' + level + '}}';
  insertWidgetNode(schema.nodes.trait_planner_widget, { token: token });
  closeTraitPlannerModal();
}

/* ─── Insert Image ───────────────────────────────────────────────── */
function openImageModal() {
  var modal = document.getElementById('image-insert-modal');
  if (!modal) return;
  document.getElementById('image-url').value = '';
  document.getElementById('image-alt').value = '';
  var preview = document.getElementById('image-preview');
  if (preview) preview.innerHTML = '';
  modal.style.display = '';
}

function closeImageModal() {
  var modal = document.getElementById('image-insert-modal');
  if (modal) modal.style.display = 'none';
}

function previewImage() {
  var url = (document.getElementById('image-url').value || '').trim();
  var preview = document.getElementById('image-preview');
  if (!preview) return;
  if (!url) { preview.innerHTML = ''; return; }
  preview.innerHTML = '<img src="' + esc(url) + '" style="max-width:100%;max-height:200px;border-radius:4px">';
}

function insertImage() {
  var url = (document.getElementById('image-url').value || '').trim();
  var alt = (document.getElementById('image-alt').value || '').trim() || 'image';
  if (!url) { alert('Please enter an image URL.'); return; }
  insertTextAtCursor('\n\n![' + alt + '](' + url + ')\n\n');
  closeImageModal();
}

/* ─── Insert Map Embed ───────────────────────────────────────────── */
var mapsIndex = null;

function openMapModal() {
  var modal = document.getElementById('map-embed-modal');
  if (!modal) return;
  document.getElementById('map-embed-type').value = 'map';
  document.getElementById('map-embed-id').value = '';
  document.getElementById('map-embed-height').value = '450';
  var mapSelect = document.getElementById('map-embed-select');
  updateMapEmbedPreview();
  modal.style.display = '';

  // Load maps index for the selector
  if (!mapsIndex) {
    mapSelect.innerHTML = '<option value="">Loading maps...</option>';
    fetch('./data/lore/maps-index.json').then(function (r) { return r.json(); }).then(function (data) {
      mapsIndex = data;
      populateMapSelect();
    }).catch(function () {
      mapSelect.innerHTML = '<option value="">Failed to load maps</option>';
    });
  }
}

function populateMapSelect() {
  var select = document.getElementById('map-embed-select');
  if (!select || !mapsIndex) return;
  var options = '<option value="">-- Select a map --</option>';
  mapsIndex.forEach(function (m) {
    options += '<option value="' + esc(String(m.id)) + '">' + esc(m.name) + '</option>';
  });
  select.innerHTML = options;
}

function closeMapModal() {
  var modal = document.getElementById('map-embed-modal');
  if (modal) modal.style.display = 'none';
}

function updateMapEmbedPreview() {
  var type = document.getElementById('map-embed-type').value;
  var id = (document.getElementById('map-embed-id').value || '').trim();
  var height = document.getElementById('map-embed-height').value || '450';
  var selectRow = document.getElementById('map-select-row');
  var idRow = document.getElementById('map-id-row');
  var preview = document.getElementById('map-embed-preview');

  // Show map selector for 'map' type, ID field for quest/deed/mob
  if (selectRow) selectRow.style.display = (type === 'map') ? '' : 'none';
  if (idRow) idRow.style.display = (type !== 'map') ? '' : 'none';

  // Build preview
  if (type === 'map') {
    var sel = document.getElementById('map-embed-select');
    var mapId = sel ? sel.value : '';
    var mapName = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : '';
    if (mapId) {
      preview.innerHTML = '<small>Token: <code>{{map:map=' + esc(mapId) + ',height=' + esc(height) + '}}</code></small>'
        + '<p style="margin-top:8px">Will embed the <strong>' + esc(mapName) + '</strong> map (' + esc(height) + 'px tall)</p>';
    } else {
      preview.innerHTML = '<small class="text-muted">Select a map to preview</small>';
    }
  } else {
    if (id) {
      preview.innerHTML = '<small>Token: <code>{{map:' + esc(type) + '=' + esc(id) + ',height=' + esc(height) + '}}</code></small>'
        + '<p style="margin-top:8px">Will embed the map showing <strong>' + esc(type) + ' #' + esc(id) + '</strong> (' + esc(height) + 'px tall)</p>';
    } else {
      preview.innerHTML = '<small class="text-muted">Enter a ' + esc(type) + ' ID to preview</small>';
    }
  }
}

function insertMapEmbed() {
  var type = document.getElementById('map-embed-type').value;
  var height = (document.getElementById('map-embed-height').value || '450').trim();
  var id;
  if (type === 'map') {
    var sel = document.getElementById('map-embed-select');
    id = sel ? sel.value : '';
  } else {
    id = (document.getElementById('map-embed-id').value || '').trim();
  }
  if (!id) { alert('Please select or enter an ID.'); return; }
  var token = '{{map:' + type + '=' + id + ',height=' + height + '}}';
  insertWidgetNode(schema.nodes.map_widget, { token: token });
  closeMapModal();
}

/* ─── Insert Consumable Table ────────────────────────────────────── */
function openConsumableModal() {
  var modal = document.getElementById('consumable-modal');
  if (!modal) return;
  document.getElementById('consumable-heading').value = '';
  var checklist = document.getElementById('consumable-checklist');
  checklist.innerHTML = '<small class="text-muted">Loading consumables...</small>';
  modal.style.display = '';

  loadConsumablesRef().then(function (ref) {
    var items = ref.items || [];
    var html = '';
    items.forEach(function (it) {
      html += '<label class="consumable-check-item">'
        + '<input type="checkbox" value="' + esc(it.key) + '" checked> '
        + '<strong>' + esc(it.consumable) + '</strong> '
        + '<small class="text-muted">' + esc(it.example) + '</small>'
        + '</label>';
    });
    checklist.innerHTML = html;
    updateConsumablePreview();

    // Wire change events
    var boxes = checklist.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].addEventListener('change', updateConsumablePreview);
    }
  });
}

function closeConsumableModal() {
  var modal = document.getElementById('consumable-modal');
  if (modal) modal.style.display = 'none';
}

function getSelectedConsumableKeys() {
  var boxes = document.querySelectorAll('#consumable-checklist input[type="checkbox"]:checked');
  var keys = [];
  for (var i = 0; i < boxes.length; i++) keys.push(boxes[i].value);
  return keys;
}

function updateConsumablePreview() {
  var keys = getSelectedConsumableKeys();
  var preview = document.getElementById('consumable-preview');
  if (!preview) return;
  if (!keys.length) {
    preview.innerHTML = '<small class="text-muted">Select at least one consumable.</small>';
    return;
  }
  var ref = consumablesRefCache || { items: [] };
  var items = ref.items || [];
  var selected = items.filter(function (it) { return keys.indexOf(it.key) !== -1; });
  selected.sort(function (a, b) { return keys.indexOf(a.key) - keys.indexOf(b.key); });

  var html = '<table class="table table-bordered table-sm"><thead><tr><th>Consumable</th><th>Example</th><th>Purpose</th></tr></thead><tbody>';
  selected.forEach(function (it) {
    html += '<tr><td>' + esc(it.consumable) + '</td><td>' + esc(it.example) + '</td><td>' + esc(it.purpose) + '</td></tr>';
  });
  html += '</tbody></table>';
  var heading = document.getElementById('consumable-heading').value.trim();
  var tokenStr = '{{consumableTable:items=' + keys.join('+');
  if (heading) tokenStr += ',heading=' + heading;
  tokenStr += '}}';
  html += '<small>Token: <code>' + esc(tokenStr) + '</code></small>';
  preview.innerHTML = html;
}

function insertConsumableTable() {
  var keys = getSelectedConsumableKeys();
  if (!keys.length) { alert('Select at least one consumable.'); return; }
  var heading = (document.getElementById('consumable-heading').value || '').trim();
  var token = '{{consumableTable:items=' + keys.join('+');
  if (heading) token += ',heading=' + heading;
  token += '}}';
  insertWidgetNode(schema.nodes.consumable_widget, { token: token });
  closeConsumableModal();
}

/* ─── CDN Version History ────────────────────────────────────────── */
function openVersionsModal(key, label) {
  var modal = document.getElementById('versions-modal');
  if (!modal) return;
  document.getElementById('versions-title').textContent = 'Version History: ' + (label || key);
  document.getElementById('versions-list').innerHTML = '<p class="text-muted">Loading versions...</p>';
  modal.setAttribute('data-key', key);
  modal.style.display = '';

  cdnListVersions(key).then(function (data) {
    var list = document.getElementById('versions-list');
    var versions = data.versions || [];
    if (!versions.length) {
      list.innerHTML = '<p class="text-muted">No version history available. Versioning may not be enabled on this bucket.</p>';
      return;
    }
    var html = '<table class="table table-bordered table-sm"><thead><tr>'
      + '<th>Date</th><th>Size</th><th>Version</th><th></th>'
      + '</tr></thead><tbody>';
    versions.forEach(function (v) {
      var date = v.lastModified ? new Date(v.lastModified).toLocaleString() : '—';
      var size = v.size ? (v.size / 1024).toFixed(1) + ' KB' : '—';
      var badge = v.isLatest ? ' <span class="label label-success">current</span>' : '';
      var restoreBtn = v.isLatest
        ? ''
        : '<button class="btn btn-xs btn-warning btn-restore-version" data-vid="' + esc(v.versionId) + '"><i class="fa fa-undo"></i> Restore</button>';
      html += '<tr><td>' + esc(date) + badge + '</td><td>' + esc(size) + '</td>'
        + '<td><code>' + esc((v.versionId || '').slice(0, 12)) + '</code></td>'
        + '<td>' + restoreBtn + '</td></tr>';
    });
    html += '</tbody></table>';
    list.innerHTML = html;

    // Wire restore buttons
    list.querySelectorAll('.btn-restore-version').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var vid = btn.getAttribute('data-vid');
        var fileKey = modal.getAttribute('data-key');
        if (!confirm('Restore version ' + vid.slice(0, 12) + '? This will overwrite the current file.')) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
        cdnRestoreVersion(fileKey, vid).then(function (res) {
          showSaveToast('Restored ' + fileKey + ' from version ' + vid.slice(0, 12));
          closeVersionsModal();
        }).catch(function (err) {
          showSaveToast('Restore failed: ' + err.message, true);
          btn.disabled = false;
          btn.innerHTML = '<i class="fa fa-undo"></i> Restore';
        });
      });
    });
  }).catch(function (err) {
    document.getElementById('versions-list').innerHTML =
      '<p class="text-danger">Failed to load versions: ' + esc(err.message) + '</p>';
  });
}

function closeVersionsModal() {
  var modal = document.getElementById('versions-modal');
  if (modal) modal.style.display = 'none';
}

/* ─── Wire Up Buttons ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  var btnNew = document.getElementById('btn-new');
  var btnDownload = document.getElementById('btn-download');
  var btnBack = document.getElementById('btn-back');
  var btnSignOut = document.getElementById('btn-sign-out');
  var btnSaveDraft = document.getElementById('btn-save-draft');
  var btnPublish = document.getElementById('btn-publish');
  var btnUnpublish = document.getElementById('btn-unpublish');
  var btnDraftVersions = document.getElementById('btn-draft-versions');

  if (btnNew) btnNew.addEventListener('click', newArticle);
  if (btnDownload) btnDownload.addEventListener('click', saveMarkdown);
  if (btnSaveDraft) btnSaveDraft.addEventListener('click', saveDraft);
  if (btnPublish) btnPublish.addEventListener('click', publishArticle);
  if (btnUnpublish) btnUnpublish.addEventListener('click', unpublishArticle);
  if (btnDraftVersions) btnDraftVersions.addEventListener('click', function () {
    if (!lastDraftKey && currentSlug) {
      var cat = document.getElementById('fm-category').value || 'guides';
      lastDraftKey = 'drafts/' + cat + '/' + currentSlug + '.json';
    }
    if (lastDraftKey) openVersionsModal(lastDraftKey, 'Drafts');
  });
  if (btnBack) btnBack.addEventListener('click', function () {
    if (isDirty() && !confirm('You have unsaved changes. Discard them?')) return;
    showArticlePanel();
  });
  if (btnSignOut) btnSignOut.addEventListener('click', window.handleSignOut);

  // Preview toggle
  var btnPreview = document.getElementById('btn-preview-toggle');
  if (btnPreview) btnPreview.addEventListener('change', function () {
    togglePreview(btnPreview.checked);
  });

  // Frontmatter change listeners
  ['fm-title', 'fm-date', 'fm-category', 'fm-author', 'fm-tags', 'fm-image', 'fm-excerpt'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', onEditorOrFrontmatterChange);
    if (el) el.addEventListener('change', onEditorOrFrontmatterChange);
  });

  // Workspace connect (File System Access API – local only)
  // [Removed — replaced by CDN upload]

  // GitHub connect / disconnect
  var btnGh = document.getElementById('btn-connect-github');
  if (btnGh) btnGh.addEventListener('click', connectGitHub);
  var btnGhDisconnect = document.getElementById('btn-disconnect-github');
  if (btnGhDisconnect) btnGhDisconnect.addEventListener('click', disconnectGitHub);

  restoreGoogleSession();
  restoreGitHubSession();
  updateConnectionStatus();

  // Image file picker
  var imgFileInput = document.getElementById('fm-image-file');
  if (imgFileInput) imgFileInput.addEventListener('change', function () {
    if (this.files && this.files[0]) uploadImage(this.files[0]);
    this.value = '';  // reset so re-selecting same file fires change
  });

  // ProseMirror formatting toolbar
  wireToolbar();

  // Tab switching
  var tabs = document.querySelectorAll('.editor-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', (function (tab) {
      return function () { switchTab(tab.getAttribute('data-tab')); };
    })(tabs[i]));
  }

  // Config editor buttons
  var btnConfigBack = document.getElementById('btn-config-back');
  var btnConfigDownload = document.getElementById('btn-config-download');
  if (btnConfigBack) btnConfigBack.addEventListener('click', showConfigList);
  if (btnConfigDownload) btnConfigDownload.addEventListener('click', saveConfigJson);

  // Live JSON validation on input
  var jsonEditor = document.getElementById('config-json-editor');
  if (jsonEditor) jsonEditor.addEventListener('input', validateConfigJson);

  // Builds tab
  var btnBuildsRefresh = document.getElementById('btn-builds-refresh');
  if (btnBuildsRefresh) btnBuildsRefresh.addEventListener('click', loadBuildsList);
  var buildsClassFilter = document.getElementById('builds-class-filter');
  if (buildsClassFilter) buildsClassFilter.addEventListener('change', loadBuildsList);

  // Widget dropdown toggle
  var btnWidget = document.getElementById('btn-insert-widget');
  var widgetMenu = document.getElementById('widget-menu');
  if (btnWidget && widgetMenu) {
    btnWidget.addEventListener('click', function (e) {
      e.stopPropagation();
      widgetMenu.classList.toggle('open');
    });
    document.addEventListener('click', function () {
      widgetMenu.classList.remove('open');
    });
    widgetMenu.querySelector('[data-widget="dpsStatTable"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openDpsModal();
    });
    widgetMenu.querySelector('[data-widget="image"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openImageModal();
    });
    widgetMenu.querySelector('[data-widget="mapEmbed"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openMapModal();
    });
    widgetMenu.querySelector('[data-widget="consumableTable"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openConsumableModal();
    });
    widgetMenu.querySelector('[data-widget="instanceLootReference"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      insertWidgetNode(schema.nodes.instance_loot_widget, { token: '{{instanceLootReference}}' });
    });
    widgetMenu.querySelector('[data-widget="questCard"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openQuestSearchModal();
    });
    widgetMenu.querySelector('[data-widget="deedCard"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openDeedSearchModal();
    });
    widgetMenu.querySelector('[data-widget="traitPlanner"]').addEventListener('click', function () {
      widgetMenu.classList.remove('open');
      openTraitPlannerModal();
    });
  }

  // DPS modal buttons
  var btnDpsClose = document.getElementById('btn-dps-modal-close');
  var btnDpsInsert = document.getElementById('btn-dps-insert');
  var btnDpsSave = document.getElementById('btn-dps-save-config');
  var btnDpsAddRow = document.getElementById('btn-dps-add-row');
  if (btnDpsClose) btnDpsClose.addEventListener('click', closeDpsModal);
  if (btnDpsInsert) btnDpsInsert.addEventListener('click', insertDpsWidget);
  if (btnDpsSave) btnDpsSave.addEventListener('click', saveDpsConfig);
  if (btnDpsAddRow) btnDpsAddRow.addEventListener('click', addDpsRow);

  // DPS modal live preview on top-level field changes
  ['dps-level-cap', 'dps-section-heading', 'dps-applies-to', 'dps-col-0', 'dps-col-1', 'dps-col-2', 'dps-col-3'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { syncDpsFromForm(); updateDpsPreview(); });
  });

  // Close modal on overlay click
  var dpsOverlay = document.getElementById('dps-widget-modal');
  if (dpsOverlay) {
    dpsOverlay.addEventListener('click', function (e) {
      if (e.target === dpsOverlay) closeDpsModal();
    });
  }

  // Quest search modal
  var btnQuestClose = document.getElementById('btn-quest-modal-close');
  var btnQuestInsert = document.getElementById('btn-quest-insert');
  var questSearchInput = document.getElementById('quest-search-input');
  if (btnQuestClose) btnQuestClose.addEventListener('click', closeQuestSearchModal);
  if (btnQuestInsert) btnQuestInsert.addEventListener('click', insertQuestWidget);
  if (questSearchInput) questSearchInput.addEventListener('input', function () {
    clearTimeout(questSearchTimer);
    questSearchTimer = setTimeout(function () {
      var q = questSearchInput.value.trim();
      if (q.length < 2) {
        document.getElementById('quest-search-results').innerHTML = '';
        return;
      }
      if (!questCache) {
        loadLookupData('quest').then(function (data) {
          renderLookupResults('quest-search-results', searchLookup(data, q), 'quest');
        });
      } else {
        renderLookupResults('quest-search-results', searchLookup(questCache, q), 'quest');
      }
    }, 200);
  });
  var questOverlay = document.getElementById('quest-search-modal');
  if (questOverlay) questOverlay.addEventListener('click', function (e) { if (e.target === questOverlay) closeQuestSearchModal(); });

  // Deed search modal
  var btnDeedClose = document.getElementById('btn-deed-modal-close');
  var btnDeedInsert = document.getElementById('btn-deed-insert');
  var deedSearchInput = document.getElementById('deed-search-input');
  if (btnDeedClose) btnDeedClose.addEventListener('click', closeDeedSearchModal);
  if (btnDeedInsert) btnDeedInsert.addEventListener('click', insertDeedWidget);
  if (deedSearchInput) deedSearchInput.addEventListener('input', function () {
    clearTimeout(deedSearchTimer);
    deedSearchTimer = setTimeout(function () {
      var q = deedSearchInput.value.trim();
      if (q.length < 2) {
        document.getElementById('deed-search-results').innerHTML = '';
        return;
      }
      if (!deedCache) {
        loadLookupData('deed').then(function (data) {
          renderLookupResults('deed-search-results', searchLookup(data, q), 'deed');
        });
      } else {
        renderLookupResults('deed-search-results', searchLookup(deedCache, q), 'deed');
      }
    }, 200);
  });
  var deedOverlay = document.getElementById('deed-search-modal');
  if (deedOverlay) deedOverlay.addEventListener('click', function (e) { if (e.target === deedOverlay) closeDeedSearchModal(); });

  // Trait planner modal
  var btnTpClose = document.getElementById('btn-tp-modal-close');
  var btnTpInsert = document.getElementById('btn-tp-insert');
  if (btnTpClose) btnTpClose.addEventListener('click', closeTraitPlannerModal);
  if (btnTpInsert) btnTpInsert.addEventListener('click', insertTraitPlannerWidget);
  var tpOverlay = document.getElementById('trait-planner-modal');
  if (tpOverlay) tpOverlay.addEventListener('click', function (e) { if (e.target === tpOverlay) closeTraitPlannerModal(); });

  // Image insert modal
  var btnImgClose = document.getElementById('btn-image-modal-close');
  var btnImgInsert = document.getElementById('btn-image-insert');
  var imgUrl = document.getElementById('image-url');
  if (btnImgClose) btnImgClose.addEventListener('click', closeImageModal);
  if (btnImgInsert) btnImgInsert.addEventListener('click', insertImage);
  if (imgUrl) imgUrl.addEventListener('input', previewImage);
  var imgOverlay = document.getElementById('image-insert-modal');
  if (imgOverlay) imgOverlay.addEventListener('click', function (e) { if (e.target === imgOverlay) closeImageModal(); });

  // Map embed modal
  var btnMapClose = document.getElementById('btn-map-modal-close');
  var btnMapInsert = document.getElementById('btn-map-insert');
  if (btnMapClose) btnMapClose.addEventListener('click', closeMapModal);
  if (btnMapInsert) btnMapInsert.addEventListener('click', insertMapEmbed);
  var mapEmbedType = document.getElementById('map-embed-type');
  var mapEmbedId = document.getElementById('map-embed-id');
  var mapEmbedHeight = document.getElementById('map-embed-height');
  var mapEmbedSelect = document.getElementById('map-embed-select');
  if (mapEmbedType) mapEmbedType.addEventListener('change', updateMapEmbedPreview);
  if (mapEmbedId) mapEmbedId.addEventListener('input', updateMapEmbedPreview);
  if (mapEmbedHeight) mapEmbedHeight.addEventListener('input', updateMapEmbedPreview);
  if (mapEmbedSelect) mapEmbedSelect.addEventListener('change', updateMapEmbedPreview);
  var mapOverlay = document.getElementById('map-embed-modal');
  if (mapOverlay) mapOverlay.addEventListener('click', function (e) { if (e.target === mapOverlay) closeMapModal(); });

  // Consumable table modal
  var btnConsumableClose = document.getElementById('btn-consumable-modal-close');
  var btnConsumableInsert = document.getElementById('btn-consumable-insert');
  var consumableHeading = document.getElementById('consumable-heading');
  if (btnConsumableClose) btnConsumableClose.addEventListener('click', closeConsumableModal);
  if (btnConsumableInsert) btnConsumableInsert.addEventListener('click', insertConsumableTable);
  if (consumableHeading) consumableHeading.addEventListener('input', updateConsumablePreview);
  var consumableOverlay = document.getElementById('consumable-modal');
  if (consumableOverlay) consumableOverlay.addEventListener('click', function (e) { if (e.target === consumableOverlay) closeConsumableModal(); });

  // Versions modal
  var btnVersionsClose = document.getElementById('btn-versions-modal-close');
  if (btnVersionsClose) btnVersionsClose.addEventListener('click', closeVersionsModal);
  var versionsOverlay = document.getElementById('versions-modal');
  if (versionsOverlay) versionsOverlay.addEventListener('click', function (e) { if (e.target === versionsOverlay) closeVersionsModal(); });

  // Config version history button
  var btnConfigVersions = document.getElementById('btn-config-versions');
  if (btnConfigVersions) {
    btnConfigVersions.addEventListener('click', function () {
      if (!currentConfigKey || !CONFIG_KEY_PATHS[currentConfigKey]) return;
      openVersionsModal(CONFIG_KEY_PATHS[currentConfigKey], currentConfigKey + '.json');
    });
  }
});
