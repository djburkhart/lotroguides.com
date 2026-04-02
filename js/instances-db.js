/* ═══════════════════════════════════════════════════════════════════════════
   Instance Database — Client-side DataTable + Filters
   Expects: data/instances-db.json loaded into window.LOTRO_INSTANCES_DB
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var table;
  var allData = [];
  var instanceBySlug = {};
  var initialized = false;

  // ── Group-size color map ─────────────────────────────────────────────────
  var groupColors = {
    '3-Player':       '#2E86AB',
    '6-Player':       '#A23B72',
    '12-Player Raid': '#F18F01',
    '24-Player Raid': '#C73E1D'
  };

  function groupBadge(g) {
    if (!g) return '<span class="text-muted">—</span>';
    var c = groupColors[g] || '#666';
    return '<span class="instance-group-badge" style="background:' + c + '">' + g + '</span>';
  }

  // ── Render cells ─────────────────────────────────────────────────────────
  function renderName(data, type, row) {
    if (type !== 'display') return data;
    return '<a href="instances/' + row.slug + '" class="lotro-instance-link">' + data + '</a>';
  }

  function renderGroup(data, type) {
    if (type !== 'display') return data || '';
    return groupBadge(data);
  }

  function renderTiers(data, type) {
    if (type !== 'display') return data || 1;
    if (!data || data <= 1) return '<span class="text-muted">1</span>';
    return '<span class="instance-tier-badge">' + data + ' Tiers</span>';
  }

  function renderMobs(data, type) {
    if (type !== 'display') return data || 0;
    if (!data) return '<span class="text-muted">0</span>';
    return '<span>' + data + '</span>';
  }

  function renderLoot(data, type, row) {
    if (type !== 'display') return data ? '1' : '';
    if (!row.lootUrl) return '<span class="text-muted">—</span>';
    return '<a href="' + row.lootUrl + '" class="btn btn-xs btn-default instance-loot-btn" target="_blank" rel="noopener">' +
      '<i class="fa fa-gift"></i> Loot</a>';
  }

  // ── Load data ───────────────────────────────────────────────────────────
  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_INSTANCES_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_INSTANCES_DB;
    buildLookup();
    initTable();
    bindFilters();
  }

  function buildLookup() {
    for (var i = 0; i < allData.length; i++) {
      instanceBySlug[allData[i].slug] = allData[i];
    }
  }

  // ── DataTable init ──────────────────────────────────────────────────────
  function initTable() {
    table = $('#instances-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 50,
      lengthMenu: [25, 50, 100],
      order: [[0, 'asc']],
      columns: [
        { data: 'name', render: renderName },
        { data: 'groupType', render: renderGroup, width: '150px' },
        { data: 'tiers', render: renderTiers, width: '100px' },
        { data: 'mobCount', render: renderMobs, width: '80px' },
        { data: 'lootUrl', render: renderLoot, width: '80px', orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search instances...',
        info: 'Showing _START_–_END_ of _TOTAL_ instances',
        infoEmpty: 'No instances found',
        lengthMenu: 'Show _MENU_ entries',
        zeroRecords: 'No matching instances'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rt<"row"<"col-sm-6"i><"col-sm-6"p>>'
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  function bindFilters() {
    $('#filter-group').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-group').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var group = $('#filter-group').val();

    $.fn.dataTable.ext.search = [];
    if (group) {
      $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        var row = allData[dataIndex];
        return row.groupType === group;
      });
    }
    table.draw();
  }

  // ── Public init ─────────────────────────────────────────────────────────
  window.LOTRO_INSTANCES_INIT = loadData;

  $(document).ready(function () {
    loadData();
  });
})();
