/* ═══════════════════════════════════════════════════════════════════════════
   Mob Database — Client-side DataTable + Filters + Modal
   Expects: data/mobs-db.json loaded at build time
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var table;
  var allData = [];
  var mobById = {};
  var initialized = false;

  // ── Genus color map ─────────────────────────────────────────────────────
  var genusColors = {
    'Orc-kind':             '#9B2226',
    'The Dead':             '#7B68EE',
    'Man':                  '#CD853F',
    'Beast':                '#8FBC8F',
    'Troll-kind':           '#A0522D',
    'Dragon-kind':          '#FF4500',
    'Ancient Evil':         '#8B008B',
    'Giant-kind':           '#DAA520',
    'Spiders and Insects':  '#6B8E23',
    'Creatures of Nature':  '#20B2AA',
    'Unseen':               '#9370DB',
    'Unique':               '#FF6347'
  };

  function genusBadge(g) {
    if (!g) return '<span class="text-muted">—</span>';
    var c = genusColors[g] || '#666';
    return '<span class="mob-genus-badge" style="background:' + c + '">' + g + '</span>';
  }

  function speciesBadge(s) {
    if (!s) return '<span class="text-muted">—</span>';
    return '<span class="mob-species-badge">' + s + '</span>';
  }

  // ── Render name cell ────────────────────────────────────────────────────
  function renderName(data, type, row) {
    if (type !== 'display') return data;
    return '<a href="mobs.html?id=' + row.id + '" class="lotro-mob-link" data-mob-id="' + row.id + '">' + data + '</a>';
  }

  // ── Render genus cell ───────────────────────────────────────────────────
  function renderGenus(data, type) {
    if (type !== 'display') return data || '';
    return genusBadge(data);
  }

  // ── Render species cell ─────────────────────────────────────────────────
  function renderSpecies(data, type) {
    if (type !== 'display') return data || '';
    return speciesBadge(data);
  }

  function renderSpawnMap(data, type, row) {
    if (type !== 'display') return '';
    var overlay = window.LOTRO_MOB_OVERLAY && window.LOTRO_MOB_OVERLAY[row.id];
    if (!overlay || !overlay.map) return '<span class="text-muted">-</span>';
    return '<a href="map.html?mob=' + row.id + '" class="btn btn-xs btn-info" target="_blank">' +
      '<i class="fa fa-map-marker"></i> Spawn</a>';
  }

  // ── Load data ───────────────────────────────────────────────────────────
  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_MOBS_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_MOBS_DB;
    buildLookup();
    initTable();
    bindFilters();
    checkUrlParams();
  }

  function buildLookup() {
    for (var i = 0; i < allData.length; i++) {
      mobById[allData[i].id] = allData[i];
    }
  }

  // ── DataTable init ──────────────────────────────────────────────────────
  function initTable() {
    table = $('#mobs-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'g', render: renderGenus, width: '160px' },
        { data: 'sp', render: renderSpecies, width: '140px' },
        { data: null, render: renderSpawnMap, width: '110px', orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search mobs...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ mobs',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  function bindFilters() {
    $('#filter-genus, #filter-species').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-genus, #filter-species').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var genusVal = $('#filter-genus').val();
    var speciesVal = $('#filter-species').val();

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (genusVal && rowData.g !== genusVal) return false;
      if (speciesVal && rowData.sp !== speciesVal) return false;
      return true;
    });
    table.draw();
  }

  // ── Modal ───────────────────────────────────────────────────────────────
  function showMobModal(id) {
    var mob = mobById[id];
    if (!mob) return;

    $('#mob-modal-title').html('<span class="lotro-mob-name">' + mob.n + '</span>');

    var html = '<div class="item-modal-meta">';
    if (mob.g) html += '<p><strong>Genus:</strong> ' + genusBadge(mob.g) + '</p>';
    if (mob.sp) html += '<p><strong>Species:</strong> ' + speciesBadge(mob.sp) + '</p>';

    var overlay = window.LOTRO_MOB_OVERLAY && window.LOTRO_MOB_OVERLAY[id];
    if (overlay && overlay.map) {
      html += '<p><a href="map.html?mob=' + id + '" class="btn btn-sm btn-info" target="_blank">';
      html += '<i class="fa fa-map-o"></i> View Spawn on Map</a></p>';
    }

    html += '</div>';

    $('#mob-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'mobs.html?id=' + id);
    }

    $('#mob-modal').modal('show');
  }

  // ── URL parameter handling ──────────────────────────────────────────────
  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);

    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
    }

    var id = params.get('id');
    if (id) {
      setTimeout(function () { showMobModal(id); }, 200);
    }
  }

  // ── Delegated click handler ─────────────────────────────────────────────
  $(document).on('click', '.lotro-mob-link', function (e) {
    e.preventDefault();
    var id = $(this).data('mob-id').toString();
    showMobModal(id);
  });

  $(document).on('hidden.bs.modal', '#mob-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'mobs.html');
    }
  });

  // ── Bootstrap ───────────────────────────────────────────────────────────
  window.LOTRO_MOBS_INIT = loadData;
  $(document).ready(loadData);
})();
