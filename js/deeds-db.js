/* ═══════════════════════════════════════════════════════════════════════════
   Deed Database — API-driven DataTable + Filters + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var API_URL = window.LOTRO_DEEDS_API || '/api/deeds/lookup';
  var table;
  var allData = [];       // full dataset (fallback / initial)
  var deedById = {};
  var initialized = false;
  var useApi = true;      // try the API first; fall back to client-side on failure
  var apiAvailable = null; // null = untested, true/false after first call
  var searchTimer = null;
  var currentXhr = null;  // abort in-flight API requests

  function gameIcon(itemId, size) {
    if (!itemId) return '';
    var map = window.LOTRO_ICON_MAP || {};
    var iconId = map[itemId];
    if (!iconId) return '';
    var s = size || 16;
    return '<img src="' + cdnUrl('img/icons/items/' + iconId + '.png') + '" width="' + s + '" height="' + s + '" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display=\'none\'">'  ;
  }

  var typeColors = {
    Slayer:      '#9B2226',
    Exploration: '#2D6A4F',
    Lore:        '#7B68EE',
    Reputation:  '#DAA520',
    Class:       '#3ea8e6',
    Event:       '#e040fb',
    Race:        '#CD853F',
    Other:       '#666'
  };

  var typeIcons = {
    Slayer:      'slayer',
    Exploration: 'explorer',
    Lore:        'lore',
    Reputation:  'reputation',
    Class:       'class',
    Event:       'event',
    Race:        'race'
  };

  function typeBadge(t) {
    if (!t) return '';
    var c = typeColors[t] || '#666';
    var iconFile = typeIcons[t];
    var iconHtml = iconFile
      ? '<img src="' + cdnUrl('img/icons/deed-types/' + iconFile + '.png') + '" class="deed-type-icon" alt="" loading="lazy" onerror="this.style.display=\'none\'">' 
      : '';
    return '<span class="deed-type-badge" style="background:' + c + '">' + iconHtml + t + '</span>';
  }

  function renderName(data, type, row) {
    if (type === 'filter') {
      var parts = [data];
      if (row.rw && row.rw.length) {
        for (var i = 0; i < row.rw.length; i++) {
          if (row.rw[i].v) parts.push(row.rw[i].v);
        }
      }
      return parts.join(' ');
    }
    if (type !== 'display') return data;
    return '<a href="deeds?id=' + row.id + '" class="lotro-deed-link" data-deed-id="' + row.id + '">' + data + '</a>';
  }

  function renderType(data, type) {
    if (type !== 'display') return data || '';
    return typeBadge(data);
  }

  function renderLevel(data, type) {
    if (type !== 'display') return data || 0;
    return data || '<span class="text-muted">—</span>';
  }

  function renderRewards(data, type) {
    if (type !== 'display') return '';
    if (!data || !data.length) return '<span class="text-muted">—</span>';
    return data.slice(0, 3).map(function (r) {
      var value = escHtml(r && r.v !== undefined && r.v !== null ? String(r.v) : '');
      if (r.t === 'LP') return '<span class="deed-reward-badge deed-reward-lp"><img src="' + cdnUrl('img/icons/lp.png') + '"   class="deed-reward-icon" alt="LP" loading="lazy" onerror="this.style.display=\'none\'">' + value + ' LP</span>';
      if (r.t === 'Title') return '<span class="deed-reward-badge deed-reward-title"><a href="titles?q=' + encodeURIComponent(r.v) + '">' + value + '</a></span>';
      if (r.t === 'Virtue') return '<span class="deed-reward-badge deed-reward-virtue">' + virtueIcon(value) + value + '</span>';
      if (r.t === 'Reputation') return '<span class="deed-reward-badge deed-reward-rep"><a href="factions?q=' + encodeURIComponent(parseFactionName(r.v)) + '">' + value + '</a></span>';
      if (r.t === 'VirtueXP') return '<span class="deed-reward-badge deed-reward-virtue-xp"><img src="' + cdnUrl('img/icons/virtue-xp.png') + '" class="deed-reward-icon" alt="VXP" loading="lazy" onerror="this.style.display=\'none\'">' + value + ' VXP</span>';
      if (r.t === 'XP') return '<span class="deed-reward-badge deed-reward-xp">' + value + ' XP</span>';
      if (r.t === 'Item') return '<span class="deed-reward-badge deed-reward-item">' + gameIcon(r.i) + value + '</span>';
      return '<span class="deed-reward-badge">' + value + '</span>';
    }).join(' ');
  }

  function virtueIcon(name) {
    if (!name) return '';
    var file = name.toLowerCase();
    return '<img src="' + cdnUrl('img/icons/virtues/' + file + '.png') + '" class="deed-reward-icon" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  function renderRegion(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">—</span>';
    return '<span class="deed-region-badge">' + escHtml(data) + '</span>';
  }

  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_DEEDS_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_DEEDS_DB;
    for (var i = 0; i < allData.length; i++) deedById[allData[i].id] = allData[i];
    initTable();
    bindFilters();
    checkUrlParams();
  }

  function initTable() {
    table = $('#deeds-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[3, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'rg', render: renderRegion, width: '140px' },
        { data: 'tp', render: renderType, width: '120px' },
        { data: 'lv', render: renderLevel, width: '80px' },
        { data: 'rw', render: renderRewards, orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search deeds...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ deeds',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });

    // Intercept DataTable search box for API-driven search
    $('div.dataTables_filter input').off('keyup search input').on('input', function () {
      var val = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { applyFilters(); }, 300);
    });
  }

  function bindFilters() {
    $('#filter-type, #filter-reward, #filter-class, #filter-region').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-type, #filter-reward, #filter-class, #filter-region').val('');
      $('div.dataTables_filter input').val('');
      applyFilters();
    });
  }

  // Build API query params from current filter state
  function getFilterParams() {
    var params = {};
    var typeVal = $('#filter-type').val();
    var rewardVal = $('#filter-reward').val();
    var classVal = $('#filter-class').val();
    var regionVal = $('#filter-region').val();
    var searchVal = ($('div.dataTables_filter input').val() || '').trim();

    if (typeVal) params.type = typeVal;
    if (rewardVal) params.reward = rewardVal;
    if (classVal) params.cls = classVal;
    if (regionVal) params.region = regionVal;
    if (searchVal.length >= 2) params.q = searchVal;

    return params;
  }

  function hasActiveFilters(params) {
    return params.type || params.reward || params.cls || params.region || params.q;
  }

  function applyFilters() {
    var params = getFilterParams();

    // No filters active — show full local dataset
    if (!hasActiveFilters(params)) {
      restoreLocalData();
      return;
    }

    // If API previously failed, fall back to client-side filtering
    if (apiAvailable === false) {
      applyLocalFilters(params);
      return;
    }

    // Try API-driven filtering
    params.limit = 500;
    fetchFromApi(params);
  }

  function fetchFromApi(params) {
    if (currentXhr) currentXhr.abort();
    showTableLoading(true);

    currentXhr = $.getJSON(API_URL, params)
      .done(function (data) {
        apiAvailable = true;
        var results = data.results || [];
        updateTableData(results);
        // Index returned results for modal lookups
        for (var i = 0; i < results.length; i++) {
          deedById[results[i].id] = results[i];
        }
        showTableLoading(false);
      })
      .fail(function (jqXHR, textStatus) {
        if (textStatus === 'abort') return;
        // API unavailable — fall back to client-side filtering
        apiAvailable = false;
        applyLocalFilters(getFilterParams());
        showTableLoading(false);
      })
      .always(function () { currentXhr = null; });
  }

  function restoreLocalData() {
    $.fn.dataTable.ext.search = [];
    updateTableData(allData);
  }

  function applyLocalFilters(params) {
    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (params.type && rowData.tp !== params.type) return false;
      if (params.cls && rowData.cl !== params.cls) return false;
      if (params.region && rowData.rg !== params.region) return false;
      if (params.reward) {
        var has = rowData.rw && rowData.rw.some(function (r) { return r.t === params.reward; });
        if (!has) return false;
      }
      return true;
    });
    // Restore full data so client search works
    if (table.data().count() !== allData.length) {
      updateTableData(allData);
    }
    if (params.q) {
      table.search(params.q).draw();
    } else {
      table.search('').draw();
    }
  }

  function updateTableData(data) {
    table.clear();
    table.rows.add(data);
    table.search('').draw();
  }

  function showTableLoading(show) {
    var el = document.getElementById('deed-table-loading');
    if (el) el.style.display = show ? '' : 'none';
  }

  function showDeedModal(id) {
    var d = deedById[id];

    // If deed not in local cache, try the API first
    if (!d) {
      $('#deed-modal-title').html('<span class="lotro-deed-name">Loading...</span>');
      $('#deed-modal-body').html('<div class="text-center text-muted"><i class="fa fa-spinner fa-spin"></i> Loading deed...</div>');
      $('#deed-modal').modal('show');

      $.getJSON(API_URL, { id: id })
        .done(function (entry) {
          deedById[entry.id] = entry;
          renderDeedModal(entry.id, entry);
        })
        .fail(function () {
          $('#deed-modal-body').html('<div class="text-muted">Deed not found.</div>');
        });

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', 'deeds?id=' + id);
      }
      return;
    }

    renderDeedModal(id, d);
  }

  function renderDeedModal(id, d) {
    $('#deed-modal-title').html('<span class="lotro-deed-name">' + d.n + '</span>');

    // Show loading state immediately with basic info from index
    var html = '<div class="item-modal-meta">';
    html += '<p><strong>Type:</strong> ' + typeBadge(d.tp) + '</p>';
    if (d.rg) html += '<p><strong>Region:</strong> <span class="deed-region-badge">' + escHtml(d.rg) + '</span></p>';
    if (d.lv) html += '<p><strong>Level:</strong> ' + d.lv + '</p>';
    if (d.cl) html += '<p><strong>Required Class:</strong> ' + d.cl + '</p>';
    html += '</div>';
    html += '<div id="deed-detail-loading" class="text-center text-muted"><i class="fa fa-spinner fa-spin"></i> Loading details...</div>';
    $('#deed-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'deeds?id=' + id);
    }
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:'select_content',content_type:'deed',content_id:id});
    $('#deed-modal').modal('show');

    // Lazy-load per-deed detail (objectives, rewards, overlay)
    $.getJSON(cdnUrl('data/lore/deeds/' + id + '.json'))
      .done(function (detail) {
        var detailHtml = '';

        if (detail.desc) {
          detailHtml += '<p class="deed-description">' + escHtml(detail.desc) + '</p>';
        }

        if (detail.cl && !d.cl) {
          detailHtml += '<p><strong>Required Class:</strong> ' + detail.cl + '</p>';
        }

        if (detail.obj && detail.obj.length) {
          detailHtml += '<h5>Requirements</h5>';
          detailHtml += '<ul class="deed-objective-list">';
          for (var i = 0; i < detail.obj.length; i++) {
            detailHtml += '<li>' + formatObjective(detail.obj[i]) + '</li>';
          }
          detailHtml += '</ul>';
        }

        var hasMapData = window.LOTRO_DEED_OVERLAY && window.LOTRO_DEED_OVERLAY[id];
        if (hasMapData) {
          detailHtml += '<div style="margin: 15px 0;">';
          detailHtml += '<a href="map?deed=' + id + '" class="btn btn-sm btn-primary" id="deed-map-link" target="_blank">';
          detailHtml += '<i class="fa fa-map-o"></i> View on Map</a>';
          detailHtml += '</div>';
        }

        var rw = detail.rw || d.rw;
        if (rw && rw.length) {
          detailHtml += '<h5>Rewards</h5>';
          detailHtml += '<ul class="deed-reward-list">';
          for (var i = 0; i < rw.length; i++) {
            var r = rw[i];
            detailHtml += '<li><strong>' + r.t + ':</strong> ' + gameIcon(r.i) + formatRewardValue(r) + '</li>';
          }
          detailHtml += '</ul>';
        }

        $('#deed-detail-loading').replaceWith(detailHtml);
      })
      .fail(function () {
        // Fallback: show what we have from the index data
        var fallbackHtml = '';
        var hasMapData = window.LOTRO_DEED_OVERLAY && window.LOTRO_DEED_OVERLAY[id];
        if (hasMapData) {
          fallbackHtml += '<div style="margin: 15px 0;">';
          fallbackHtml += '<a href="map?deed=' + id + '" class="btn btn-sm btn-primary" id="deed-map-link" target="_blank">';
          fallbackHtml += '<i class="fa fa-map-o"></i> View on Map</a>';
          fallbackHtml += '</div>';
        }
        if (d.rw && d.rw.length) {
          fallbackHtml += '<h5>Rewards</h5>';
          fallbackHtml += '<ul class="deed-reward-list">';
          for (var i = 0; i < d.rw.length; i++) {
            var r = d.rw[i];
            fallbackHtml += '<li><strong>' + r.t + ':</strong> ' + gameIcon(r.i) + formatRewardValue(r) + '</li>';
          }
          fallbackHtml += '</ul>';
        }
        $('#deed-detail-loading').replaceWith(fallbackHtml || '');
      });
  }

  function formatObjective(o) {
    switch (o.t) {
      case 'kill':
        if (o.mn) {
          var link = '<a href="mobs?q=' + encodeURIComponent(o.mn) + '">' + escHtml(o.mn) + '</a>';
          return '<i class="fa fa-crosshairs text-danger"></i> Defeat ' + link + (o.z ? ' <span class="text-muted">(' + escHtml(o.z) + ')</span>' : '');
        }
        var text = 'Defeat ' + (o.c || '') + ' creatures';
        if (o.z) text += ' in ' + escHtml(o.z);
        return '<i class="fa fa-crosshairs text-danger"></i> ' + text;
      case 'complete':
        if (o.an) {
          if (o.aq) return '<i class="fa fa-check-circle text-info"></i> Complete quest: <a href="quests?id=' + o.aid + '">' + escHtml(o.an) + '</a>';
          if (o.ad) return '<i class="fa fa-bookmark text-warning"></i> Complete deed: <a href="deeds?id=' + o.aid + '" class="lotro-deed-link" data-deed-id="' + o.aid + '">' + escHtml(o.an) + '</a>';
        }
        return '<i class="fa fa-check-circle text-info"></i> Complete prerequisite #' + o.aid;
      case 'qc':
        return '<i class="fa fa-list-ol text-info"></i> Complete ' + o.c + ' quests';
      case 'lm':
        return '<i class="fa fa-map-marker text-success"></i> Discover: ' + escHtml(o.n);
      case 'item':
        return '<i class="fa fa-cube text-primary"></i> Collect: ' + gameIcon(o.i) + '<a href="items?q=' + encodeURIComponent(o.n) + '">' + escHtml(o.n) + '</a>';
      case 'use':
        return '<i class="fa fa-hand-pointer-o text-primary"></i> Use: ' + gameIcon(o.i) + escHtml(o.n);
      case 'npc':
        return '<i class="fa fa-comments text-info"></i> Talk to: ' + escHtml(o.n);
      case 'skill':
        return '<i class="fa fa-bolt text-warning"></i> Use skill ' + o.c + ' times';
      case 'emote':
        return '<i class="fa fa-smile-o text-pink"></i> ' + escHtml(o.n) + ' ' + o.c + ' times';
      case 'explore':
        return '<i class="fa fa-compass text-success"></i> Explore ' + o.c + ' areas';
      case 'fac':
        return '<i class="fa fa-flag text-warning"></i> Reach tier ' + o.tier + ' with <a href="factions?q=' + encodeURIComponent(o.n) + '">' + escHtml(o.n) + '</a>';
      default:
        return '<i class="fa fa-circle-o"></i> ' + JSON.stringify(o);
    }
  }

  function formatRewardValue(r) {
    if (r.t === 'LP') return escHtml(String(r.v)) + ' LOTRO Points';
    if (r.t === 'Title') return '<a href="titles?q=' + encodeURIComponent(r.v) + '">' + escHtml(String(r.v || '')) + '</a>';
    if (r.t === 'Reputation') {
      var fn = parseFactionName(r.v);
      if (fn) return '<a href="factions?q=' + encodeURIComponent(fn) + '">' + escHtml(String(r.v || '')) + '</a>';
    }
    return escHtml(String(r.v || ''));
  }

  function parseFactionName(v) {
    if (!v) return '';
    var s = String(v);
    var m = s.match(/^(.+?)\s+[+\-]\d+/);
    return m ? m[1] : s;
  }

  function escHtml(s) {
    if (!s) return '';
    s = cleanGameText(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cleanGameText(s) {
    if (!s) return '';
    return String(s)
      .replace(/&amp;#10;|&#10;|&#x0*0a;/gi, '\n')
      .replace(/\\q/g, '')
      .replace(/<rgb=[^>]*>/gi, '')
      .replace(/<\/rgb>/gi, '')
      .replace(/&amp;amp;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
      $('div.dataTables_filter input').val(q);
    }
    var region = params.get('region');
    if (region) {
      $('#filter-region').val(region);
    }
    // If there are URL params, trigger API-driven filter
    if (q || region) {
      applyFilters();
    }
    var id = params.get('id');
    if (id) setTimeout(function () { showDeedModal(id); }, 200);
  }

  $(document).on('click', '.lotro-deed-link', function (e) {
    e.preventDefault();
    showDeedModal($(this).data('deed-id').toString());
  });

  $(document).on('hidden.bs.modal', '#deed-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'deeds');
    }
  });

  window.LOTRO_DEEDS_INIT = loadData;
  $(document).ready(loadData);
})();
