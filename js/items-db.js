/* ═══════════════════════════════════════════════════════════════════════════
   Content Database — Client-side DataTable + Filters + Modal
   Expects: data/lore/items-db.json loaded at build time
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var table;
  var allData = [];

  // ── Quality / type helpers ──────────────────────────────────────────────
  var qualityColors = {
    legendary:    '#ff9800',
    incomparable: '#e040fb',
    rare:         '#3ea8e6',
    uncommon:     '#f5e642',
    common:       '#f0f0f0'
  };

  var subtypeLabels = {
    food:           'Food',
    'trail-food':   'Trail Food',
    feast:          'Feast',
    'battle-scroll':'Battle Scroll',
    'warding-scroll':'Warding Scroll',
    token:          'Token',
    tactical:       'Tactical',
    other:          'Other'
  };

  function qualityBadge(q) {
    if (!q) return '';
    var c = qualityColors[q] || '#999';
    return '<span class="item-quality-badge" style="background:' + c + '">' +
           q.charAt(0).toUpperCase() + q.slice(1) + '</span>';
  }

  function subtypeBadge(s) {
    if (!s) return '';
    var label = subtypeLabels[s] || s;
    return '<span class="item-subtype-badge">' + label + '</span>';
  }

  function formatStats(stats) {
    if (!stats || !stats.length) return '<span class="text-muted">—</span>';
    return stats.filter(function (s) { return s.v !== 0; }).slice(0, 4).map(function (s) {
      return '<span class="item-stat">' + s.s + ': <strong>' + s.v.toLocaleString() + '</strong></span>';
    }).join(' ');
  }

  function formatStatsFull(stats) {
    if (!stats || !stats.length) return '<p class="text-muted">No stat data available.</p>';
    return '<table class="table table-condensed item-stat-table">' +
      stats.filter(function (s) { return s.v !== 0; }).map(function (s) {
        return '<tr><td>' + s.s + '</td><td class="text-right"><strong>' + s.v.toLocaleString() + '</strong></td></tr>';
      }).join('') +
      '</table>';
  }

  // ── Type icons for cross-linked entries ─────────────────────────────────
  var typeIcons = {
    set: '<i class="fa fa-cubes" style="color:#bb86fc"></i> ',
    deed: '<i class="fa fa-bookmark" style="color:#66bb6a"></i> ',
    virtue: '<i class="fa fa-shield" style="color:#ffd54f"></i> '
  };

  // ── Render name cell ────────────────────────────────────────────────────
  function renderName(data, type, row) {
    if (type !== 'display') return data;
    var cls = row.q ? ' lotro-' + row.q : '';
    var icon = typeIcons[row.t] || '';
    var link = '<a href="items.html?id=' + row.id + '" class="lotro-item-link' + cls + '" data-item-id="' + row.id + '">' + icon + data + '</a>';
    if (row.sid) {
      link += ' <a href="sets.html?id=' + row.sid + '" class="item-set-badge" title="Part of: ' + (row.sn || 'Set').replace(/"/g, '&quot;') + '"><i class="fa fa-cubes"></i></a>';
    }
    return link;
  }

  // ── Render quality / subtype cell ───────────────────────────────────────
  function renderQuality(data, type, row) {
    if (type !== 'display') return data || '';
    var parts = [];
    if (row.q) parts.push(qualityBadge(row.q));
    if (row.st) parts.push(subtypeBadge(row.st));
    return parts.join(' ') || '<span class="text-muted">—</span>';
  }

  // ── Load data from embedded JSON ────────────────────────────────────────
  var initialized = false;
  var totalItemCount = 0;

  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_ITEMS_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_ITEMS_DB;
    totalItemCount = allData.length;
    buildLookup();
    initTable();
    bindFilters();
    checkUrlParams();
    updateLoadingStatus(1, 1); // hide progress if single-chunk
  }

  // ── Add a chunk of data after initial load ─────────────────────────────
  function addChunk(chunk, loadedCount, totalChunks) {
    for (var i = 0; i < chunk.length; i++) {
      allData.push(chunk[i]);
      itemById[chunk[i].id] = chunk[i];
    }
    totalItemCount = allData.length;
    table.rows.add(chunk).draw(false);
    updateLoadingStatus(loadedCount, totalChunks);
  }

  function updateLoadingStatus(loaded, total) {
    var $bar = $('#items-load-progress');
    if (!$bar.length) return;
    if (loaded >= total) {
      $bar.closest('.items-loading-bar').fadeOut(400);
    } else {
      var pct = Math.round((loaded / total) * 100);
      $bar.css('width', pct + '%').attr('aria-valuenow', pct);
      $bar.find('.sr-only').text(pct + '% loaded');
    }
  }

  // ── Build a lookup map for fast id-based access ────────────────────────
  var itemById = {};

  function buildLookup() {
    for (var i = 0; i < allData.length; i++) {
      itemById[allData[i].id] = allData[i];
    }
  }

  // ── DataTable init ──────────────────────────────────────────────────────
  function initTable() {
    table = $('#items-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 't', width: '100px' },
        { data: 'q', render: renderQuality, width: '160px' },
        { data: 'stats', render: formatStats, orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search items...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ items',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  function bindFilters() {
    $('#filter-type, #filter-subtype, #filter-quality').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-type, #filter-subtype, #filter-quality').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var typeVal = $('#filter-type').val();
    var subtypeVal = $('#filter-subtype').val();
    var qualityVal = $('#filter-quality').val();

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (typeVal && rowData.t !== typeVal) return false;
      if (subtypeVal && rowData.st !== subtypeVal) return false;
      if (qualityVal && rowData.q !== qualityVal) return false;
      return true;
    });
    table.draw();
  }

  // ── Modal ───────────────────────────────────────────────────────────────
  function showItemModal(id) {
    var item = itemById[id];
    if (!item) return;

    var cls = item.q ? ' lotro-' + item.q : '';
    $('#item-modal-title').html('<span class="' + cls.trim() + '">' + item.n + '</span>');

    var html = '<div class="item-modal-meta">';
    html += '<p><strong>Type:</strong> ' + item.t + '</p>';
    if (item.st) html += '<p><strong>Subtype:</strong> ' + (subtypeLabels[item.st] || item.st) + '</p>';
    if (item.q) html += '<p><strong>Quality:</strong> ' + qualityBadge(item.q) + '</p>';
    if (item.lv) html += '<p><strong>Item Level:</strong> ' + item.lv + '</p>';
    if (item.sl) html += '<p><strong>Slot:</strong> ' + item.sl + '</p>';

    // Cross-links to other database pages
    if (item.sid) {
      html += '<p><strong>Set:</strong> <a href="sets.html?id=' + item.sid + '" class="item-crosslink item-crosslink-set"><i class="fa fa-cubes"></i> ' + (item.sn || 'View Set') + '</a></p>';
    }
    if (item.t === 'deed') {
      html += '<p><a href="deeds.html?id=' + item.id + '" class="item-crosslink item-crosslink-deed"><i class="fa fa-bookmark"></i> View in Deed Database</a></p>';
    }
    if (item.t === 'set') {
      html += '<p><a href="sets.html?id=' + item.id + '" class="item-crosslink item-crosslink-set"><i class="fa fa-cubes"></i> View in Set Database</a></p>';
    }
    if (item.t === 'virtue') {
      html += '<p><a href="virtues.html?id=' + item.id + '" class="item-crosslink item-crosslink-virtue"><i class="fa fa-shield"></i> View in Virtue Database</a></p>';
    }
    html += '</div>';
    html += '<h5>Stats</h5>';
    html += formatStatsFull(item.stats);

    $('#item-modal-body').html(html);

    // Update URL with item id for sharing
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'items.html?id=' + id);
    }

    $('#item-modal').modal('show');
  }

  // ── URL parameter handling: ?id= for modal, ?q= for search ─────────────
  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);

    // Pre-fill search from ?q= (navbar search redirect)
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      // Also update the DataTables search input
      $('div.dataTables_filter input').val(q);
    }

    // Open item modal from ?id=
    var id = params.get('id');
    if (id) {
      setTimeout(function () { showItemModal(id); }, 200);
    }
  }

  // ── Delegated click handler ─────────────────────────────────────────────
  $(document).on('click', '.lotro-item-link', function (e) {
    e.preventDefault();
    var id = $(this).data('item-id').toString();
    showItemModal(id);
  });

  // Clear URL param when modal closes
  $(document).on('hidden.bs.modal', '#item-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'items.html');
    }
  });

  // ── Bootstrap ───────────────────────────────────────────────────────────
  // Expose init for late-load scenario (document.ready may have already fired)
  window.LOTRO_ITEMS_INIT = loadData;
  window.LOTRO_ITEMS_ADD_CHUNK = addChunk;
  $(document).ready(loadData);
})();
