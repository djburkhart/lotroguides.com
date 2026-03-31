import { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/core';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

/* ─── State ──────────────────────────────────────────────────────── */
var crepe = null;
var currentUser = null;
var currentSlug = null;
var workspaceDirHandle = null;
var githubToken = null;
var githubRepo = null; // { owner, name }
var githubBranch = 'main';

/* ─── File System Access (Workspace Save) ────────────────────────── */
var fsAccessSupported = typeof window.showDirectoryPicker === 'function';

function connectWorkspace() {
  if (!fsAccessSupported) {
    alert('Your browser does not support the File System Access API. Use Chrome or Edge for direct save support.');
    return;
  }
  window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
    // Verify it's a project root by checking for content/ and build.js
    return handle.getDirectoryHandle('content').then(function () {
      workspaceDirHandle = handle;
      updateConnectionStatus();
    });
  }).catch(function (err) {
    if (err.name !== 'AbortError') {
      alert('Could not connect workspace. Make sure you select the project root directory (containing the content/ folder).');
    }
  });
}

function getNestedDirHandle(rootHandle, pathParts) {
  var chain = Promise.resolve(rootHandle);
  pathParts.forEach(function (part) {
    chain = chain.then(function (dir) {
      return dir.getDirectoryHandle(part, { create: true });
    });
  });
  return chain;
}

function writeFileToWorkspace(relativePath, contents) {
  if (!workspaceDirHandle) return Promise.reject(new Error('No workspace'));
  var parts = relativePath.replace(/\\/g, '/').split('/');
  var fileName = parts.pop();
  return getNestedDirHandle(workspaceDirHandle, parts).then(function (dirHandle) {
    return dirHandle.getFileHandle(fileName, { create: true });
  }).then(function (fileHandle) {
    return fileHandle.createWritable();
  }).then(function (writable) {
    return writable.write(contents).then(function () { return writable.close(); });
  });
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
  var btnLocal = document.getElementById('btn-connect-workspace');

  if (isGitHubConnected()) {
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa fa-github"></i> ' + esc(githubRepo.owner + '/' + githubRepo.name);
      statusEl.className = 'workspace-status connected';
    }
    if (btnGh) btnGh.style.display = 'none';
    if (btnGhDisc) btnGhDisc.style.display = '';
    if (btnLocal) btnLocal.style.display = 'none';
  } else if (workspaceDirHandle) {
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa fa-folder-open"></i> ' + esc(workspaceDirHandle.name);
      statusEl.className = 'workspace-status connected';
    }
    if (btnGh) btnGh.style.display = '';
    if (btnGhDisc) btnGhDisc.style.display = 'none';
    if (btnLocal) btnLocal.style.display = (fsAccessSupported ? '' : 'none');
  } else {
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa fa-cloud-upload"></i> Not connected';
      statusEl.className = 'workspace-status';
    }
    if (btnGh) btnGh.style.display = '';
    if (btnGhDisc) btnGhDisc.style.display = 'none';
    if (btnLocal) btnLocal.style.display = (fsAccessSupported ? '' : 'none');
  }

  // Update save button labels
  var saveLabel = (isGitHubConnected() || workspaceDirHandle) ? 'Save' : 'Download';
  var icon = isGitHubConnected() ? 'github' : (workspaceDirHandle ? 'save' : 'download');
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

/* ─── Crepe Editor ───────────────────────────────────────────────── */
function createEditor(markdown) {
  var chain = Promise.resolve();
  if (crepe) {
    chain = crepe.destroy();
  }
  return chain.then(function () {
    var root = document.getElementById('milkdown-editor');
    if (!root) throw new Error('No editor root');
    root.innerHTML = '';
    crepe = new Crepe({ root: root, defaultValue: markdown || '' });
    return crepe.create();
  }).then(function () {
    return crepe;
  });
}

/* ─── Google Sign-In ─────────────────────────────────────────────── */
window.handleGoogleCredential = function (response) {
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
  var parsed;
  fetch('./data/content/' + encodeURIComponent(category) + '/' + encodeURIComponent(slug) + '.md')
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.text();
    })
    .then(function (text) {
      parsed = parseFrontmatter(text);
      document.getElementById('fm-title').value = parsed.data.title || '';
      document.getElementById('fm-date').value = parsed.data.date || '';
      document.getElementById('fm-author').value = parsed.data.author || '';
      document.getElementById('fm-tags').value = Array.isArray(parsed.data.tags) ? parsed.data.tags.join(', ') : (parsed.data.tags || '');
      document.getElementById('fm-excerpt').value = parsed.data.excerpt || '';
      document.getElementById('fm-image').value = parsed.data.image || '';
      document.getElementById('fm-category').value = category;
      currentSlug = slug;
      return createEditor(parsed.content);
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
  document.getElementById('fm-category').value = 'guides';
  createEditor('').then(function () {
    showEditPanel();
  });
}

/* ─── Save / Download ────────────────────────────────────────────── */
function saveMarkdown() {
  var fm = buildFrontmatter();
  var md = crepe ? crepe.getMarkdown() : '';
  var full = fm + '\n' + md + '\n';
  var slug = currentSlug || slugify(document.getElementById('fm-title').value) || 'article';
  var category = document.getElementById('fm-category').value || 'guides';
  var filename = slug + '.md';

  if (isGitHubConnected()) {
    var ghPath = 'content/' + category + '/' + filename;
    ghSaveFile(ghPath, full, 'Update ' + category + '/' + filename)
      .then(function () { showSaveToast('Committed ' + ghPath + ' to ' + githubBranch); })
      .catch(function (err) { showSaveToast('GitHub save failed: ' + err.message, true); });
  } else if (workspaceDirHandle) {
    var relativePath = 'content/' + category + '/' + filename;
    writeFileToWorkspace(relativePath, full)
      .then(function () { showSaveToast('Saved ' + relativePath); })
      .catch(function (err) { showSaveToast('Save failed: ' + err.message, true); });
  } else {
    downloadBlob(new Blob([full], { type: 'text/markdown;charset=utf-8' }), filename);
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
  } else if (workspaceDirHandle && CONFIG_KEY_PATHS[currentConfigKey]) {
    var relativePath = CONFIG_KEY_PATHS[currentConfigKey];
    writeFileToWorkspace(relativePath, text)
      .then(function () { showSaveToast('Saved ' + relativePath); })
      .catch(function (err) { showSaveToast('Save failed: ' + err.message, true); });
  } else {
    downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), filename);
  }
}

/* ─── Insert Text at Cursor ──────────────────────────────────────── */
function insertTextAtCursor(text) {
  if (!crepe || !crepe.editor) return;
  crepe.editor.action(function (ctx) {
    var view = ctx.get(editorViewCtx);
    var state = view.state;
    var from = state.selection.from;
    var tr = state.tr.insertText(text, from);
    view.dispatch(tr);
    view.focus();
  });
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
  } else if (workspaceDirHandle) {
    writeFileToWorkspace('content/stats/dps-reference.json', json)
      .then(function () { showSaveToast('Saved content/stats/dps-reference.json'); })
      .catch(function (err) { showSaveToast('Save failed: ' + err.message, true); });
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
  insertTextAtCursor('\n\n' + token + '\n\n');
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
  insertTextAtCursor('\n\n{{map:' + type + '=' + id + ',height=' + height + '}}\n\n');
  closeMapModal();
}

/* ─── Wire Up Buttons ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  var btnNew = document.getElementById('btn-new');
  var btnDownload = document.getElementById('btn-download');
  var btnBack = document.getElementById('btn-back');
  var btnSignOut = document.getElementById('btn-sign-out');

  if (btnNew) btnNew.addEventListener('click', newArticle);
  if (btnDownload) btnDownload.addEventListener('click', saveMarkdown);
  if (btnBack) btnBack.addEventListener('click', showArticlePanel);
  if (btnSignOut) btnSignOut.addEventListener('click', window.handleSignOut);

  // Workspace connect (File System Access API – local only)
  var btnConnect = document.getElementById('btn-connect-workspace');
  if (btnConnect) {
    if (!fsAccessSupported) btnConnect.style.display = 'none';
    else btnConnect.addEventListener('click', connectWorkspace);
  }

  // GitHub connect / disconnect
  var btnGh = document.getElementById('btn-connect-github');
  if (btnGh) btnGh.addEventListener('click', connectGitHub);
  var btnGhDisconnect = document.getElementById('btn-disconnect-github');
  if (btnGhDisconnect) btnGhDisconnect.addEventListener('click', disconnectGitHub);

  handleOAuthCallback();
  restoreGitHubSession();
  updateConnectionStatus();

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
});
