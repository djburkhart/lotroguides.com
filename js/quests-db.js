/* ═══════════════════════════════════════════════════════════════════════════
   Quest Database — Server-side DataTable + Filters + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var API_URL = window.LOTRO_QUESTS_API || '/api/quests/lookup';
  var table;
  var questById = {};       // id → quest record (populated from SSP responses + detail fetches)
  var initialized = false;
  var serverSide = true;    // true = SSP mode; false = client-side fallback
  var allData = null;       // only populated if SSP fails and we fall back to client-side

  function gameIcon(itemId, size) {
    if (!itemId) return '';
    var map = window.LOTRO_ICON_MAP || {};
    var iconId = map[itemId];
    if (!iconId) return '';
    var s = size || 16;
    return '<img src="' + cdnUrl('img/icons/items/' + iconId + '.png') + '" width="' + s + '" height="' + s + '" class="lotro-game-icon" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  // ─── Renderers ──────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stripColorTags(str) {
    if (!str) return '';
    return str.replace(/&lt;\/?rgb(?:=#[A-Fa-f0-9]+)?&gt;/g, '').replace(/<\/?rgb(?:=#[A-Fa-f0-9]+)?>/g, '');
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data || '';
    var html = '<a href="quests?id=' + row.id + '" class="lotro-quest-link" data-quest-id="' + row.id + '">';
    html += escapeHtml(data);
    if (row.grp) html += ' <span class="quest-group-badge">' + escapeHtml(row.grp) + '</span>';
    if (row.rep) html += ' <span class="quest-repeat-badge"><i class="fa fa-refresh"></i></span>';
    if (row.inst) html += ' <span class="quest-instance-badge"><i class="fa fa-lock"></i></span>';
    html += '</a>';
    return html;
  }

  function renderLevel(data, type) {
    if (type !== 'display') return data || 0;
    return data || '<span class="text-muted">—</span>';
  }

  function renderCategory(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">—</span>';
    return '<span class="quest-category-badge">' + escapeHtml(data) + '</span>';
  }

  function renderBestower(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">—</span>';
    return escapeHtml(data);
  }

  // ─── Category list builder ──────────────────────────────────────────────

  function buildCategoryFilter(cats) {
    var sel = $('#filter-category');
    for (var j = 0; j < cats.length; j++) {
      sel.append('<option value="' + escapeHtml(cats[j].name) + '">' + escapeHtml(cats[j].name) + ' (' + cats[j].count + ')</option>');
    }
  }

  function buildCategoryFilterFromData(data) {
    var cats = {};
    for (var i = 0; i < data.length; i++) {
      var c = data[i].cat;
      if (c) cats[c] = (cats[c] || 0) + 1;
    }
    var sorted = Object.keys(cats).sort();
    var sel = $('#filter-category');
    for (var j = 0; j < sorted.length; j++) {
      sel.append('<option value="' + escapeHtml(sorted[j]) + '">' + escapeHtml(sorted[j]) + ' (' + cats[sorted[j]] + ')</option>');
    }
  }

  // ─── Column name mapping (DT column index → API sort_col) ──────────────

  var COL_MAP = ['n', 'lv', 'cat', 'b'];

  // ─── Init ───────────────────────────────────────────────────────────────

  function loadData() {
    if (initialized) return;
    initialized = true;

    // Fetch category list from API, then init table
    $.getJSON(API_URL, { meta: 'categories' })
      .done(function (resp) {
        buildCategoryFilter(resp.categories || []);
        initServerSideTable();
        bindFilters();
        checkUrlParams();
      })
      .fail(function () {
        // API unreachable — fall back to loading full dataset client-side
        console.warn('[quests] API unavailable, falling back to client-side mode');
        fallbackToClientSide();
      });
  }

  function initServerSideTable() {
    serverSide = true;
    table = $('#quests-table').DataTable({
      serverSide: true,
      processing: true,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[1, 'asc'], [0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'lv', render: renderLevel, width: '80px' },
        { data: 'cat', render: renderCategory, width: '200px' },
        { data: 'b', render: renderBestower }
      ],
      ajax: function (dtParams, callback, settings) {
        // Map DataTables params to our clean API params
        var apiParams = {
          draw: dtParams.draw,
          start: dtParams.start,
          length: dtParams.length,
          search: (dtParams.search && dtParams.search.value) || ''
        };

        // Sort: use first sort column
        if (dtParams.order && dtParams.order.length) {
          var colIdx = dtParams.order[0].column;
          apiParams.sort_col = COL_MAP[colIdx] || 'lv';
          apiParams.sort_dir = dtParams.order[0].dir || 'asc';
        }

        // Custom filters (read from DOM)
        var catVal = $('#filter-category').val();
        var minLv = $('#filter-min-level').val();
        var maxLv = $('#filter-max-level').val();
        var instVal = $('#filter-inst').val();
        if (catVal) apiParams.cat = catVal;
        if (minLv) apiParams.lv_min = minLv;
        if (maxLv) apiParams.lv_max = maxLv;
        if (instVal === '1') apiParams.inst = '1';

        $.getJSON(API_URL, apiParams)
          .done(function (resp) {
            // Cache returned quest records for modal lookups
            if (resp.data) {
              for (var i = 0; i < resp.data.length; i++) {
                questById[resp.data[i].id] = resp.data[i];
              }
            }
            callback(resp);
          })
          .fail(function () {
            // On API failure during SSP, switch to client-side mode
            console.warn('[quests] SSP request failed, falling back to client-side');
            if (table) table.destroy();
            table = null;
            fallbackToClientSide();
          });
      },
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search quests...',
        processing: '<i class="fa fa-spinner fa-spin"></i> Loading quests...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ quests',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ─── Client-side fallback ───────────────────────────────────────────────

  function fallbackToClientSide() {
    serverSide = false;
    var _cdn = _CDN ? _CDN + '/' : './';
    $.getJSON(_cdn + 'data/quests-db.json')
      .done(function (data) {
        allData = data;
        for (var i = 0; i < data.length; i++) questById[data[i].id] = data[i];
        if (!$('#filter-category option').length || $('#filter-category option').length <= 1) {
          buildCategoryFilterFromData(data);
        }
        initClientSideTable(data);
        bindFilters();
        checkUrlParams();
      })
      .fail(function () {
        $('#quests-table tbody').html('<tr><td colspan="4" class="text-center text-danger">Failed to load quest data.</td></tr>');
      });
  }

  function initClientSideTable(data) {
    table = $('#quests-table').DataTable({
      data: data,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[1, 'asc'], [0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'lv', render: renderLevel, width: '80px' },
        { data: 'cat', render: renderCategory, width: '200px' },
        { data: 'b', render: renderBestower }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search quests...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ quests',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ─── Filters ────────────────────────────────────────────────────────────

  function bindFilters() {
    $('#filter-category, #filter-group, #filter-inst').off('change').on('change', applyFilters);
    $('#filter-min-level, #filter-max-level').off('input').on('input', debounce(applyFilters, 300));
    $('#filter-reset').off('click').on('click', function () {
      $('#filter-category, #filter-group, #filter-inst').val('');
      $('#filter-min-level, #filter-max-level').val('');
      applyFilters();
    });
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function applyFilters() {
    if (!table) return;

    if (serverSide) {
      // In SSP mode, filters are sent as API params on the next draw.
      // Just trigger a redraw — the ajax function reads filter values from the DOM.
      table.draw();
      return;
    }

    // Client-side fallback filtering
    var catVal = $('#filter-category').val();
    var grpVal = $('#filter-group').val();
    var minLv = parseInt($('#filter-min-level').val()) || 0;
    var maxLv = parseInt($('#filter-max-level').val()) || 999;

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (catVal && rowData.cat !== catVal) return false;
      if (grpVal) {
        if (grpVal === 'solo' && rowData.grp) return false;
        if (grpVal !== 'solo' && rowData.grp !== grpVal) return false;
      }
      var lv = rowData.lv || 0;
      if (lv < minLv || lv > maxLv) return false;
      return true;
    });
    table.draw();
  }

  // ─── Quest Detail Modal ─────────────────────────────────────────────────

  function showQuestModal(id) {
    var q = questById[id];

    if (!q) {
      // Quest not in local cache — fetch from API
      $('#quest-modal-title').html('<span class="lotro-quest-name">Loading...</span>');
      $('#quest-modal-body').html('<div class="text-center text-muted"><i class="fa fa-spinner fa-spin"></i> Loading quest...</div>');
      $('#quest-modal').modal('show');

      $.getJSON(API_URL, { id: id })
        .done(function (data) {
          questById[data.id] = data;
          renderQuestModal(data.id, data);
        })
        .fail(function () {
          $('#quest-modal-body').html('<div class="text-muted">Quest not found.</div>');
        });

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', 'quests?id=' + id);
      }
      return;
    }

    renderQuestModal(id, q);
  }

  function renderQuestModal(id, q) {
    // Title
    var title = '<span class="lotro-quest-name">' + escapeHtml(q.n) + '</span>';
    if (q.lv) title += ' <span class="quest-level-badge">Lv ' + q.lv + '</span>';
    $('#quest-modal-title').html(title);

    // Body
    var html = '<div class="quest-modal-meta">';

    if (q.cat) html += '<p><strong>Category:</strong> ' + escapeHtml(q.cat) + '</p>';
    if (q.arc) html += '<p><strong>Quest Arc:</strong> ' + escapeHtml(q.arc) + '</p>';
    if (q.sc) html += '<p><strong>Scope:</strong> ' + escapeHtml(q.sc) + '</p>';
    if (q.grp) html += '<p><strong>Group Size:</strong> ' + escapeHtml(q.grp) + '</p>';
    if (q.rep) html += '<p><strong>Repeatable:</strong> Yes</p>';
    if (q.inst) html += '<p><strong>Instanced:</strong> Yes</p>';
    if (q.b) html += '<p><strong>Quest Giver:</strong> ' + escapeHtml(q.b) + '</p>';

    html += '</div>';

    // Description
    if (q.desc) {
      html += '<div class="quest-modal-desc">';
      html += '<p>' + escapeHtml(stripColorTags(q.desc)) + '</p>';
      html += '</div>';
    }

    // Quest chain
    if (q.pre || q.nxt) {
      html += '<div class="quest-modal-chain">';
      html += '<h5><i class="fa fa-link"></i> Quest Chain</h5>';
      if (q.pre) {
        html += '<p><strong>Prerequisites:</strong> ';
        html += q.pre.map(function (p) {
          return '<a href="quests?id=' + p.id + '" class="lotro-quest-link" data-quest-id="' + p.id + '">' + escapeHtml(p.n) + '</a>';
        }).join(', ');
        html += '</p>';
      }
      if (q.nxt) {
        html += '<p><strong>Next Quest:</strong> ';
        html += '<a href="quests?id=' + q.nxt.id + '" class="lotro-quest-link" data-quest-id="' + q.nxt.id + '">' + escapeHtml(q.nxt.n) + '</a>';
        html += '</p>';
      }
      html += '</div>';
    }

    // Rewards
    if (q.rw) {
      html += '<div class="quest-modal-rewards">';
      html += '<h5><i class="fa fa-gift"></i> Rewards</h5>';
      html += '<ul class="quest-reward-list">';
      if (q.rw.xp) html += '<li><strong>Experience:</strong> ' + q.rw.xp.toLocaleString() + ' XP</li>';
      if (q.rw.m) html += '<li><strong>Money:</strong> ' + escapeHtml(q.rw.m) + '</li>';
      if (q.rw.it) {
        for (var i = 0; i < q.rw.it.length; i++) {
          html += '<li><strong>Item:</strong> ' + gameIcon(q.rw.it[i].id) + '<a href="items?q=' + encodeURIComponent(q.rw.it[i].n) + '">' + escapeHtml(q.rw.it[i].n) + '</a></li>';
        }
      }
      html += '</ul>';
      html += '</div>';
    }

    $('#quest-modal-body').html(html);

    // Show on Map link
    var hasOverlay = window.LOTRO_QUEST_OVERLAY && window.LOTRO_QUEST_OVERLAY[id];
    if (hasOverlay) {
      $('#quest-map-link').attr('href', 'map?quest=' + id).show();
    } else {
      $('#quest-map-link').hide();
    }

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'quests?id=' + id);
    }
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:'select_content',content_type:'quest',content_id:id});
    $('#quest-modal').modal('show');
  }

  // ─── URL Params ─────────────────────────────────────────────────────────

  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
    }
    var id = params.get('id');
    if (id) setTimeout(function () { showQuestModal(id); }, 200);
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  $(document).on('click', '.lotro-quest-link', function (e) {
    e.preventDefault();
    showQuestModal($(this).data('quest-id').toString());
  });

  $(document).on('hidden.bs.modal', '#quest-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'quests');
    }
  });

  window.LOTRO_QUESTS_INIT = loadData;
  $(document).ready(loadData);
})();
