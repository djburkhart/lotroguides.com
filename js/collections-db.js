/* ═══════════════════════════════════════════════════════════════════════════
   Collections Database — Collections cards + API-driven Items DataTable
   Uses /api/collections/lookup DO Function with client-side fallback.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var API_URL = window.LOTRO_COLLECTIONS_API || '/api/collections/lookup';
  var initialized = false;
  var serverSide = true;       // true = SSP mode; false = client-side fallback
  var allItemsData = null;     // only populated if SSP fails and we fall back to client-side
  var collections = [];        // collections array (always client-side rendered)

  function skillIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 32;
    return '<img src="' + cdnUrl('img/skills/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.src=\'' + cdnUrl('img/icons/default.png') + '\';this.onerror=null;">';
  }

  var catColors = {
    'Mounts': '#CD853F',
    'Pets':   '#4682B4'
  };

  function catBadge(cat) {
    if (!cat) return '';
    var c = catColors[cat] || '#666';
    return '<span class="mob-genus-badge" style="background:' + c + '">' + cat + '</span>';
  }

  function escHtml(s) {
    return $('<span/>').text(s || '').html();
  }

  function classifySource(src) {
    if (!src) return '';
    var s = src.toLowerCase();
    if (s.indexOf('store') !== -1 || s.indexOf('lotro market') !== -1 || s.indexOf('mithril coin') !== -1) return 'Store';
    if (s.indexOf('festival') !== -1 || s.indexOf('anniversary') !== -1 || s.indexOf('yule') !== -1 || s.indexOf('spring') !== -1 || s.indexOf('harvest') !== -1 || s.indexOf('farmer') !== -1 || s.indexOf('mid-summer') !== -1 || s.indexOf('midsummer') !== -1) return 'Festival';
    if (s.indexOf('barter') !== -1) return 'Barter';
    if (s.indexOf('quest') !== -1) return 'Quest';
    if (s.indexOf('deed') !== -1 || s.indexOf('reputation') !== -1) return 'Deed/Reputation';
    if (s.indexOf('drop') !== -1 || s.indexOf('loot') !== -1 || s.indexOf('chance') !== -1) return 'Drop/Loot';
    if (s.indexOf('craft') !== -1) return 'Crafting';
    if (s.indexOf('pvp') !== -1 || s.indexOf('pvmp') !== -1 || s.indexOf('ettenmoors') !== -1 || s.indexOf('creep') !== -1 || s.indexOf('monster play') !== -1) return 'PvMP';
    if (s.indexOf('hobbyist') !== -1 || s.indexOf('hobby') !== -1) return 'Hobby';
    if (s.indexOf('starter') !== -1 || s.indexOf('default') !== -1 || s.indexOf('standard') !== -1) return 'Starter';
    return 'Other';
  }

  // Build a lookup: skill id → collection name(s)
  function buildCollectionLookup() {
    var map = {};
    collections.forEach(function (col) {
      (col.el || []).forEach(function (el) {
        if (!map[el.id]) map[el.id] = [];
        map[el.id].push(col.n);
      });
    });
    return map;
  }

  var colLookup = null;
  function getColLookup() {
    if (!colLookup) colLookup = buildCollectionLookup();
    return colLookup;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COLLECTIONS TAB
     ═══════════════════════════════════════════════════════════════════════ */

  function renderCard(col) {
    var id = 'col-' + col.id;
    var elementCount = col.el ? col.el.length : 0;
    var badge = catBadge(col.cat);
    var raceParts = [];
    if (col.race) {
      col.race.split(';').forEach(function (r) {
        raceParts.push('<span class="collection-race-tag">' + escHtml(r) + '</span>');
      });
    }
    var raceHtml = raceParts.length ?
      ' <span class="text-muted small">(' + raceParts.join(', ') + ' only)</span>' : '';

    var rewardHtml = '';
    if (col.rw && col.rw.length) {
      rewardHtml = '<div class="collection-reward">' +
        '<i class="fa fa-trophy text-warning"></i> <strong>Reward:</strong> ' +
        col.rw.map(function (r) { return '<em>' + escHtml(r.n) + '</em>'; }).join(', ') +
        '</div>';
    }

    var elemHtml = '';
    if (col.el) {
      elemHtml = '<div class="collection-elements">';
      col.el.forEach(function (el) {
        var icon = el.ic ? skillIcon(el.ic, 36) : '';
        var src = el.src ? '<div class="collection-el-src"><i class="fa fa-map-marker"></i> ' + escHtml(el.src) + '</div>' : '';
        var desc = el.desc ? '<div class="collection-el-desc text-muted small">' + escHtml(el.desc) + '</div>' : '';
        elemHtml += '<div class="collection-el">' +
          '<div class="collection-el-icon">' + icon + '</div>' +
          '<div class="collection-el-info">' +
            '<div class="collection-el-name">' + escHtml(el.n) + '</div>' +
            src + desc +
          '</div>' +
        '</div>';
      });
      elemHtml += '</div>';
    }

    return '<div class="collection-card" data-cat="' + escHtml(col.cat) + '" data-name="' + escHtml(col.n).toLowerCase() + '" data-elements="' + escHtml((col.el || []).map(function(e){return e.n}).join(' ')).toLowerCase() + '">' +
      '<div class="collection-card-header" data-toggle="collapse" data-target="#' + id + '">' +
        '<div class="collection-card-title">' +
          '<h4>' + escHtml(col.n) + '</h4>' +
          badge + raceHtml +
          '<span class="collection-count">' + elementCount + ' item' + (elementCount !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<i class="fa fa-chevron-down collection-toggle"></i>' +
      '</div>' +
      rewardHtml +
      '<div id="' + id + '" class="collapse">' +
        elemHtml +
      '</div>' +
    '</div>';
  }

  function applyCollectionFilters() {
    var cat = $('#filter-category').val();
    var q = $('#collection-search').val().toLowerCase().trim();

    $('.collection-card').each(function () {
      var $c = $(this);
      var show = true;
      if (cat && $c.data('cat') !== cat) show = false;
      if (q) {
        var name = ($c.data('name') || '');
        var elements = ($c.data('elements') || '');
        if (name.indexOf(q) === -1 && elements.indexOf(q) === -1) show = false;
      }
      $c.toggle(show);
    });

    var visible = $('.collection-card:visible').length;
    $('#collection-count').text(visible + ' collection' + (visible !== 1 ? 's' : ''));
  }

  function populateCollectionCategories(data) {
    var cats = {};
    for (var i = 0; i < data.length; i++) {
      var c = data[i].cat || 'Other';
      cats[c] = (cats[c] || 0) + 1;
    }
    var sel = $('#filter-category');
    Object.keys(cats).sort().forEach(function (c) {
      sel.append('<option value="' + c + '">' + c + ' (' + cats[c] + ')</option>');
    });
  }

  function initCollectionsTab() {
    collections.sort(function (a, b) {
      if (a.cat !== b.cat) return a.cat < b.cat ? -1 : 1;
      return a.n.localeCompare(b.n);
    });

    populateCollectionCategories(collections);

    var container = $('#collections-container');
    collections.forEach(function (col) {
      container.append(renderCard(col));
    });

    $('#collection-count').text(collections.length + ' collection' + (collections.length !== 1 ? 's' : ''));

    $('#filter-category').on('change', applyCollectionFilters);
    $('#collection-search').on('input', applyCollectionFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-category').val('');
      $('#collection-search').val('');
      applyCollectionFilters();
    });

    $(document).on('show.bs.collapse', '.collection-card .collapse', function () {
      $(this).closest('.collection-card').find('.collection-toggle').addClass('fa-chevron-up').removeClass('fa-chevron-down');
      var name = $(this).closest('.collection-card').data('name');
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'select_content', content_type: 'collection', content_id: name });
    });
    $(document).on('hide.bs.collapse', '.collection-card .collapse', function () {
      $(this).closest('.collection-card').find('.collection-toggle').addClass('fa-chevron-down').removeClass('fa-chevron-up');
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ITEMS TAB — SSP DataTable with client-side fallback
     ═══════════════════════════════════════════════════════════════════════ */

  var itemsTable = null;
  var itemsInitialized = false;

  // ─── Renderers ──────────────────────────────────────────────────────────

  function renderIcon(data, type, row) {
    if (type !== 'display') return '';
    return row.ic ? skillIcon(row.ic, 28) : '';
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data || '';
    return escHtml(data);
  }

  function renderType(data, type) {
    if (type !== 'display') return data || '';
    return catBadge(data);
  }

  function renderSource(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">\u2014</span>';
    return '<span class="collection-el-src-inline"><i class="fa fa-map-marker text-success"></i> ' + escHtml(data) + '</span>';
  }

  function renderCollection(data, type, row) {
    if (type !== 'display') return '';
    var lookup = getColLookup();
    var colNames = lookup[row.id] || [];
    if (colNames.length) {
      return '<span class="text-success"><i class="fa fa-check"></i> ' + colNames.map(escHtml).join(', ') + '</span>';
    }
    return '<span class="text-muted">\u2014</span>';
  }

  // ─── Column name mapping (DT column index → API sort_col) ──────────────

  var COL_MAP = ['', 'n', 'cat', 'src', ''];

  // ─── SSP Items Tab ─────────────────────────────────────────────────────

  function initItemsTab() {
    if (itemsInitialized) return;
    itemsInitialized = true;

    // Fetch source categories from API, then init SSP table
    $.getJSON(API_URL, { meta: 'sources' })
      .done(function (resp) {
        buildSourceFilter(resp.sources || []);
        initServerSideTable();
        bindItemFilters();
      })
      .fail(function () {
        console.warn('[collections] API unavailable, falling back to client-side mode');
        fallbackToClientSide();
      });
  }

  function buildSourceFilter(sources) {
    var sel = $('#filter-items-source');
    for (var i = 0; i < sources.length; i++) {
      sel.append('<option value="' + escHtml(sources[i].name) + '">' + escHtml(sources[i].name) + ' (' + sources[i].count + ')</option>');
    }
  }

  function buildSourceFilterFromData(data) {
    var cats = {};
    for (var i = 0; i < data.length; i++) {
      var sc = classifySource(data[i].src);
      if (sc) cats[sc] = (cats[sc] || 0) + 1;
    }
    var sorted = Object.keys(cats).sort();
    var sel = $('#filter-items-source');
    for (var j = 0; j < sorted.length; j++) {
      sel.append('<option value="' + escHtml(sorted[j]) + '">' + escHtml(sorted[j]) + ' (' + cats[sorted[j]] + ')</option>');
    }
  }

  function initServerSideTable() {
    serverSide = true;
    itemsTable = $('#items-table').DataTable({
      serverSide: true,
      processing: true,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250],
      order: [[1, 'asc']],
      columns: [
        { data: null, render: renderIcon, width: '36px', orderable: false, className: 'text-center' },
        { data: 'n', render: renderName },
        { data: 'cat', render: renderType, width: '80px' },
        { data: 'src', render: renderSource },
        { data: null, render: renderCollection, width: '140px', orderable: false }
      ],
      ajax: function (dtParams, callback) {
        var apiParams = {
          draw: dtParams.draw,
          start: dtParams.start,
          length: dtParams.length,
          search: (dtParams.search && dtParams.search.value) || ''
        };

        // Sort: use first sort column
        if (dtParams.order && dtParams.order.length) {
          var colIdx = dtParams.order[0].column;
          apiParams.sort_col = COL_MAP[colIdx] || 'n';
          apiParams.sort_dir = dtParams.order[0].dir || 'asc';
        }

        // Custom filters
        var catVal = $('#filter-items-cat').val();
        var srcVal = $('#filter-items-source').val();
        var colVal = $('#filter-items-col').val();
        if (catVal) apiParams.cat = catVal;
        if (srcVal) apiParams.src = srcVal;
        if (colVal) apiParams.col = colVal;

        $.getJSON(API_URL, apiParams)
          .done(function (resp) {
            callback(resp);
            updateItemsCount();
          })
          .fail(function () {
            console.warn('[collections] SSP request failed, falling back to client-side');
            if (itemsTable) itemsTable.destroy();
            itemsTable = null;
            itemsInitialized = false;
            fallbackToClientSide();
          });
      },
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search mounts & pets...',
        processing: '<i class="fa fa-spinner fa-spin"></i> Loading...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ items',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ─── Client-side fallback ───────────────────────────────────────────────

  function fallbackToClientSide() {
    serverSide = false;
    itemsInitialized = true;
    var _cdn = _CDN ? _CDN + '/' : './';
    $.getJSON(_cdn + 'data/collections-items-db.json')
      .done(function (data) {
        allItemsData = data;
        buildSourceFilterFromData(data);
        initClientSideTable(data);
        bindItemFilters();
      })
      .fail(function () {
        $('#items-table tbody').html('<tr><td colspan="5" class="text-center text-danger">Failed to load items data.</td></tr>');
      });
  }

  function initClientSideTable(data) {
    itemsTable = $('#items-table').DataTable({
      data: data,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [25, 50, 100, 250],
      order: [[1, 'asc']],
      columns: [
        { data: null, render: renderIcon, width: '36px', orderable: false, className: 'text-center' },
        { data: 'n', render: renderName },
        { data: 'cat', render: renderType, width: '80px' },
        { data: 'src', render: renderSource },
        { data: null, render: renderCollection, width: '140px', orderable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search mounts & pets...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ items',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });

    // Client-side custom column search via $.fn.dataTable.ext.search
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      if (settings.nTable.id !== 'items-table') return true;
      var row = itemsTable.row(dataIndex).data();
      if (!row) return true;

      var catVal = $('#filter-items-cat').val();
      var srcVal = $('#filter-items-source').val();
      var colVal = $('#filter-items-col').val();

      if (catVal && row.cat !== catVal) return false;
      if (srcVal && classifySource(row.src) !== srcVal) return false;
      if (colVal === 'yes' && !row.col) return false;
      if (colVal === 'no' && row.col) return false;
      return true;
    });

    updateItemsCount();
    itemsTable.on('draw', updateItemsCount);
  }

  // ─── Shared filter binding ──────────────────────────────────────────────

  function bindItemFilters() {
    if (serverSide) {
      // SSP mode: redraw triggers a new API call
      $('#filter-items-cat, #filter-items-source, #filter-items-col').on('change', function () {
        if (itemsTable) itemsTable.draw();
      });
    } else {
      // Client-side: redraw uses ext.search filter
      $('#filter-items-cat, #filter-items-source, #filter-items-col').on('change', function () {
        if (itemsTable) { itemsTable.draw(); updateItemsCount(); }
      });
    }

    $('#filter-items-reset').on('click', function () {
      $('#filter-items-cat').val('');
      $('#filter-items-source').val('');
      $('#filter-items-col').val('');
      if (itemsTable) { itemsTable.search('').draw(); }
    });
  }

  function updateItemsCount() {
    if (!itemsTable) return;
    var info = itemsTable.page.info();
    $('#items-count').text(info.recordsDisplay + ' of ' + info.recordsTotal + ' item' + (info.recordsTotal !== 1 ? 's' : ''));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════════════ */

  window.LOTRO_COLLECTIONS_INIT = function () {
    if (initialized) return;
    initialized = true;

    var raw = window.LOTRO_COLLECTIONS_DB || [];
    // Handle both old combined format {collections:[], items:[]} and new split format (plain array)
    collections = Array.isArray(raw) ? raw : (raw.collections || []);
    if (!collections.length) return;

    // Collections tab (always client-side rendered — only ~29 items)
    initCollectionsTab();

    // Items tab — eagerly init SSP so data is ready when user clicks the tab
    initItemsTab();
    $('a[href="#tab-items"]').on('shown.bs.tab', function () {
      if (itemsTable) itemsTable.columns.adjust();
    });

    // URL param support
    var params = new URLSearchParams(window.location.search);
    var qp = params.get('q');
    if (qp) {
      $('#collection-search').val(qp);
      applyCollectionFilters();
    }
    var catp = params.get('cat');
    if (catp) {
      $('#filter-category').val(catp);
      applyCollectionFilters();
    }
    var tabp = params.get('tab');
    if (tabp === 'items') {
      $('a[href="#tab-items"]').tab('show');
    }
  };
})();
