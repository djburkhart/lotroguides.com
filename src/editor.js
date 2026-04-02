import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { schema as mdSchema, defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import 'prosemirror-view/style/prosemirror.css';

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
  if (!isCdnConfigured() || !isDirty()) return;
  var article = buildArticleJson();
  var draftKey = 'drafts/' + article.category + '/' + article.slug + '.json';
  lastDraftKey = draftKey;
  var payload = JSON.stringify(article);
  cdnUploadFile(draftKey, payload, 'application/json; charset=utf-8')
    .then(function (res) {
      var msg = 'Auto-draft saved';
      if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
      showDraftStatus(msg);
    })
    .catch(function () { showDraftStatus('Draft save failed', true); });
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
  }).then(function (r) { return r.json(); }).then(function (data) {
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
  var cfg = window.LOTRO_EDITOR_CONFIG || {};
  var clientId = cfg.githubClientId;
  if (!clientId) {
    alert('GitHub OAuth is not configured for this site.');
    return;
  }
  // Redirect to GitHub OAuth authorize endpoint
  var redirectUri = window.location.origin + window.location.pathname;
  var url = 'https://github.com/login/oauth/authorize'
    + '?client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&scope=repo';
  window.location.href = url;
}

function handleOAuthCallback() {
  var params = new URLSearchParams(window.location.search);
  var code = params.get('code');
  if (!code) return;

  // Clean the URL immediately so a reload won't re-exchange
  var cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState(null, '', cleanUrl);

  githubRepo = parseRepoConfig();
  if (!githubRepo) return;

  // Exchange code for token via DO Function
  fetch('/api/github/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data.error) throw new Error(data.error);
    githubToken = data.access_token;
    sessionStorage.setItem('gh_token', githubToken);
    return ghApi('/repos/' + githubRepo.owner + '/' + githubRepo.name);
  })
  .then(function (repo) {
    githubBranch = repo.default_branch || 'main';
    updateConnectionStatus();
    showSaveToast('Connected to ' + githubRepo.owner + '/' + githubRepo.name);
  })
  .catch(function (err) {
    githubToken = null;
    githubRepo = null;
    showSaveToast('GitHub login failed: ' + err.message, true);
  });
}

function disconnectGitHub() {
  githubToken = null;
  githubRepo = null;
  sessionStorage.removeItem('gh_token');
  updateConnectionStatus();
}

function restoreGitHubSession() {
  var saved = sessionStorage.getItem('gh_token');
  if (!saved) return;
  githubRepo = parseRepoConfig();
  if (!githubRepo) return;
  githubToken = saved;
  ghApi('/repos/' + githubRepo.owner + '/' + githubRepo.name)
    .then(function (repo) {
      githubBranch = repo.default_branch || 'main';
      updateConnectionStatus();
    })
    .catch(function () {
      githubToken = null;
      githubRepo = null;
      sessionStorage.removeItem('gh_token');
    });
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

  if (isGitHubConnected()) {
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa fa-github"></i> ' + esc(githubRepo.owner + '/' + githubRepo.name);
      statusEl.className = 'workspace-status connected';
    }
    if (btnGh) btnGh.style.display = 'none';
    if (btnGhDisc) btnGhDisc.style.display = '';
  } else {
    if (statusEl) {
      statusEl.innerHTML = isCdnConfigured()
        ? '<i class="fa fa-cloud-upload"></i> CDN'
        : '<i class="fa fa-cloud-upload"></i> Not connected';
      statusEl.className = 'workspace-status' + (isCdnConfigured() ? ' connected' : '');
    }
    if (btnGh) btnGh.style.display = '';
    if (btnGhDisc) btnGhDisc.style.display = 'none';
  }

  // Update save button labels
  var canSave = isGitHubConnected() || isCdnConfigured();
  var saveLabel = canSave ? 'Save' : 'Download';
  var icon = isGitHubConnected() ? 'github' : (isCdnConfigured() ? 'cloud-upload' : 'download');
  var btnDl = document.getElementById('btn-download');
  if (btnDl) btnDl.innerHTML = '<i class="fa fa-' + icon + '"></i> ' + saveLabel + ' .md';
  var btnCfgDl = document.getElementById('btn-config-download');
  if (btnCfgDl) btnCfgDl.innerHTML = '<i class="fa fa-' + icon + '"></i> ' + saveLabel + ' .json';
  var btnDpsSave = document.getElementById('btn-dps-save-config');
  if (btnDpsSave) btnDpsSave.innerHTML = '<i class="fa fa-' + icon + '"></i> ' + saveLabel + ' Config';
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

function buildFrontmatter() {
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
      changeTrackPlugin,
    ],
  });

  editorView = new EditorView(root, {
    state: state,
    dispatchTransaction: function (tr) {
      var newState = editorView.state.apply(tr);
      editorView.updateState(newState);
      updateToolbarState();
    },
    nodeViews: {
      dps_widget: function (node, view, getPos) { return new DpsWidgetView(node); },
      map_widget: function (node, view, getPos) { return new MapWidgetView(node); },
      consumable_widget: function (node, view, getPos) { return new ConsumableWidgetView(node); },
      instance_loot_widget: function (node, view, getPos) { return new InstanceLootWidgetView(node); },
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
    }
  });
}

/* ─── Google Sign-In ─────────────────────────────────────────────── */
window.handleGoogleCredential = function (response) {
  googleIdToken = response.credential;
  var parts = response.credential.split('.');
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
      return;
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
  loadArticleList();
};

window.handleSignOut = function () {
  currentUser = null;
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
      var list = document.getElementById('article-list');
      list.innerHTML = '';
      articles.forEach(function (a) {
        var li = document.createElement('li');
        li.className = 'editor-article-item';
        li.innerHTML =
          '<span class="editor-article-cat badge-' + esc(a.category) + '">' + esc(a.category) + '</span>' +
          '<span class="editor-article-title">' + esc(a.title) + '</span>' +
          '<small class="editor-article-date">' + esc(a.date || '') + '</small>';
        li.addEventListener('click', function () { loadArticle(a.category, a.slug); });
        list.appendChild(li);
      });
    })
    .catch(function () { /* manifest may not exist yet */ });
}

/* ─── Load Article ───────────────────────────────────────────────── */
function loadArticle(category, slug) {
  fetch('./data/content/' + encodeURIComponent(category) + '/' + encodeURIComponent(slug) + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(function (data) {
      document.getElementById('fm-title').value = data.title || '';
      document.getElementById('fm-date').value = data.date || '';
      document.getElementById('fm-author').value = data.author || '';
      document.getElementById('fm-tags').value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
      document.getElementById('fm-excerpt').value = data.excerpt || '';
      document.getElementById('fm-image').value = data.image || '';
      updateImagePreview(data.image || '');
      document.getElementById('fm-category').value = data.category || category;
      currentSlug = slug;
      return createEditor(data.markdown || '');
    })
    .then(function () {
      showEditPanel();
    })
    .catch(function (e) { alert('Could not load article: ' + e.message); });
}

/* ─── New Article ────────────────────────────────────────────────── */
function newArticle() {
  currentSlug = null;
  document.getElementById('fm-title').value = '';
  document.getElementById('fm-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('fm-author').value = currentUser ? currentUser.name : '';
  document.getElementById('fm-tags').value = '';
  document.getElementById('fm-excerpt').value = '';
  document.getElementById('fm-image').value = '';
  updateImagePreview('');
  document.getElementById('fm-category').value = 'guides';
  createEditor('').then(function () {
    showEditPanel();
  });
}

/* ─── Save / Download ────────────────────────────────────────────── */
function saveMarkdown() {
  var article = buildArticleJson();
  var slug = article.slug;
  var category = article.category;

  function afterSave() {
    markClean();
    if (autoDraftTimer) { clearTimeout(autoDraftTimer); autoDraftTimer = null; }
  }

  if (isGitHubConnected()) {
    // GitHub saves as .md with frontmatter for compatibility with the build pipeline
    var fm = buildFrontmatter();
    var full = fm + '\n' + article.markdown + '\n';
    var ghPath = 'content/' + category + '/' + slug + '.md';
    ghSaveFile(ghPath, full, 'Update ' + category + '/' + slug + '.md')
      .then(function () { afterSave(); showSaveToast('Committed ' + ghPath + ' to ' + githubBranch); })
      .catch(function (err) { showSaveToast('GitHub save failed: ' + err.message, true); });
  } else if (isCdnConfigured()) {
    var cdnKey = 'content/' + category + '/' + slug + '.json';
    var payload = JSON.stringify(article);
    cdnUploadFile(cdnKey, payload, 'application/json; charset=utf-8')
      .then(function (res) {
        afterSave();
        var msg = 'Uploaded ' + cdnKey + ' to CDN';
        if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
        showSaveToast(msg);
      })
      .catch(function (err) { showSaveToast('CDN save failed: ' + err.message, true); });
  } else {
    // Fallback: download as .md with frontmatter
    var fm = buildFrontmatter();
    var full = fm + '\n' + article.markdown + '\n';
    downloadBlob(new Blob([full], { type: 'text/markdown;charset=utf-8' }), slug + '.md');
    afterSave();
  }
}

/* ─── UI Navigation ──────────────────────────────────────────────── */
function showEditPanel() {
  document.getElementById('article-panel').style.display = 'none';
  document.getElementById('edit-panel').style.display = '';
}

function showArticlePanel() {
  document.getElementById('edit-panel').style.display = 'none';
  document.getElementById('article-panel').style.display = '';
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
  } else if (isCdnConfigured() && CONFIG_KEY_PATHS[currentConfigKey]) {
    var cdnKey = CONFIG_KEY_PATHS[currentConfigKey];
    cdnUploadFile(cdnKey, text, 'application/json')
      .then(function (res) {
        var msg = 'Uploaded ' + cdnKey + ' to CDN';
        if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
        showSaveToast(msg);
      })
      .catch(function (err) { showSaveToast('CDN save failed: ' + err.message, true); });
  } else {
    downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), filename);
  }
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
  } else if (isCdnConfigured()) {
    cdnUploadFile('content/stats/dps-reference.json', json, 'application/json')
      .then(function (res) {
        var msg = 'Uploaded dps-reference.json to CDN';
        if (res.versionId) msg += ' (v' + res.versionId.slice(0, 8) + ')';
        showSaveToast(msg);
      })
      .catch(function (err) { showSaveToast('CDN save failed: ' + err.message, true); });
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
  var btnSaveChanges = document.getElementById('btn-save-changes');
  var btnDraftVersions = document.getElementById('btn-draft-versions');

  if (btnNew) btnNew.addEventListener('click', newArticle);
  if (btnDownload) btnDownload.addEventListener('click', saveMarkdown);
  if (btnSaveChanges) btnSaveChanges.addEventListener('click', saveMarkdown);
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

  handleOAuthCallback();
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
