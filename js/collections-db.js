/* ═══════════════════════════════════════════════════════════════════════════
   Collections Database — Collections cards + Items DataTable
   Expects:
     window.LOTRO_COLLECTIONS_DB (array) loaded before LOTRO_COLLECTIONS_INIT
     window.LOTRO_COLLECTIONS_ITEMS (array) loaded lazily, triggers LOTRO_COLLECTIONS_ITEMS_READY
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  function skillIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 32;
    return '<img src="' + cdnUrl('img/skills/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.src=\'' + cdnUrl('img/icons/default.png') + '\';this.onerror=null;">';
  }

  var initialized = false;

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

  function initCollectionsTab(collections) {
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
    });
    $(document).on('hide.bs.collapse', '.collection-card .collapse', function () {
      $(this).closest('.collection-card').find('.collection-toggle').addClass('fa-chevron-down').removeClass('fa-chevron-up');
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ITEMS TAB — DataTable of all individual mounts & pets
     ═══════════════════════════════════════════════════════════════════════ */

  var itemsTable = null;
  var itemsInitialized = false;

  // Build a lookup: skill id → collection name(s)
  function buildCollectionLookup(collections) {
    var map = {};
    collections.forEach(function (col) {
      (col.el || []).forEach(function (el) {
        if (!map[el.id]) map[el.id] = [];
        map[el.id].push(col.n);
      });
    });
    return map;
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

  function initItemsTab(items, collections) {
    if (itemsInitialized) return;
    itemsInitialized = true;

    var colLookup = buildCollectionLookup(collections);

    // Populate source filter with classified categories
    var sourceCats = {};
    items.forEach(function (item) {
      var sc = classifySource(item.src);
      if (sc) sourceCats[sc] = (sourceCats[sc] || 0) + 1;
    });
    var srcSel = $('#filter-items-source');
    Object.keys(sourceCats).sort().forEach(function (s) {
      srcSel.append('<option value="' + s + '">' + s + ' (' + sourceCats[s] + ')</option>');
    });

    // Build DataTable rows
    var rows = items.map(function (item) {
      var icon = item.ic ? skillIcon(item.ic, 28) : '';
      var colNames = colLookup[item.id] || [];
      var colHtml = colNames.length ?
        '<span class="text-success"><i class="fa fa-check"></i> ' + colNames.map(escHtml).join(', ') + '</span>' :
        '<span class="text-muted">—</span>';

      var srcHtml = item.src ?
        '<span class="collection-el-src-inline"><i class="fa fa-map-marker text-success"></i> ' + escHtml(item.src) + '</span>' : '<span class="text-muted">—</span>';

      return [
        icon,
        escHtml(item.n),
        catBadge(item.cat),
        srcHtml,
        colHtml,
        // Hidden columns for filtering
        item.cat || '',
        classifySource(item.src),
        item.col ? 'yes' : 'no'
      ];
    });

    itemsTable = $('#items-table').DataTable({
      data: rows,
      columns: [
        { title: '', width: '36px', orderable: false, className: 'text-center' },
        { title: 'Name' },
        { title: 'Type', width: '80px' },
        { title: 'Source' },
        { title: 'Collection', width: '140px' },
        { title: '_cat', visible: false },
        { title: '_src', visible: false },
        { title: '_col', visible: false }
      ],
      order: [[1, 'asc']],
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      language: { search: 'Search:' },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });

    updateItemsCount();

    // Custom column filters
    function filterItems() {
      var cat = $('#filter-items-cat').val();
      var src = $('#filter-items-source').val();
      var col = $('#filter-items-col').val();

      itemsTable.column(5).search(cat ? '^' + $.fn.dataTable.util.escapeRegex(cat) + '$' : '', true, false);
      itemsTable.column(6).search(src ? '^' + $.fn.dataTable.util.escapeRegex(src) + '$' : '', true, false);
      itemsTable.column(7).search(col ? '^' + $.fn.dataTable.util.escapeRegex(col) + '$' : '', true, false);
      itemsTable.draw();
      updateItemsCount();
    }

    $('#filter-items-cat').on('change', filterItems);
    $('#filter-items-source').on('change', filterItems);
    $('#filter-items-col').on('change', filterItems);
    $('#filter-items-reset').on('click', function () {
      $('#filter-items-cat').val('');
      $('#filter-items-source').val('');
      $('#filter-items-col').val('');
      itemsTable.search('');
      filterItems();
    });

    itemsTable.on('draw', updateItemsCount);
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

    var collections = window.LOTRO_COLLECTIONS_DB || [];
    if (!collections.length) return;

    // Collections tab
    initCollectionsTab(collections);

    // Items tab — data arrives lazily via separate JSON load
    window.LOTRO_COLLECTIONS_ITEMS_READY = function () {
      var items = window.LOTRO_COLLECTIONS_ITEMS || [];
      $('a[href="#tab-items"]').on('shown.bs.tab', function () {
        initItemsTab(items, collections);
        if (itemsTable) itemsTable.columns.adjust();
      });
      // If tab is already active (e.g. from URL param), init now
      if ($('#tab-items').hasClass('active')) {
        initItemsTab(items, collections);
      }
    };
    // If items already loaded (race condition), fire now
    if (window.LOTRO_COLLECTIONS_ITEMS) {
      window.LOTRO_COLLECTIONS_ITEMS_READY();
    }

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
