/* ═══════════════════════════════════════════════════════════════════════════
   Deed Database — Client-side DataTable + Filters + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var table;
  var allData = [];
  var deedById = {};
  var initialized = false;

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

  function typeBadge(t) {
    if (!t) return '';
    var c = typeColors[t] || '#666';
    return '<span class="deed-type-badge" style="background:' + c + '">' + t + '</span>';
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data;
    return '<a href="deeds.html?id=' + row.id + '" class="lotro-deed-link" data-deed-id="' + row.id + '">' + data + '</a>';
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
      if (r.t === 'LP') return '<span class="deed-reward-badge deed-reward-lp">' + r.v + ' LP</span>';
      if (r.t === 'Title') return '<span class="deed-reward-badge deed-reward-title">' + r.v + '</span>';
      if (r.t === 'Virtue') return '<span class="deed-reward-badge deed-reward-virtue">' + r.v + '</span>';
      if (r.t === 'Reputation') return '<span class="deed-reward-badge deed-reward-rep">' + r.v + '</span>';
      return '<span class="deed-reward-badge">' + r.v + '</span>';
    }).join(' ');
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
      order: [[2, 'asc']],
      columns: [
        { data: 'n', render: renderName },
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
  }

  function bindFilters() {
    $('#filter-type, #filter-reward, #filter-class').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-type, #filter-reward, #filter-class').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var typeVal = $('#filter-type').val();
    var rewardVal = $('#filter-reward').val();
    var classVal = $('#filter-class').val();

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (typeVal && rowData.tp !== typeVal) return false;
      if (classVal && rowData.cl !== classVal) return false;
      if (rewardVal) {
        var has = rowData.rw && rowData.rw.some(function (r) { return r.t === rewardVal; });
        if (!has) return false;
      }
      return true;
    });
    table.draw();
  }

  function showDeedModal(id) {
    var d = deedById[id];
    if (!d) return;

    $('#deed-modal-title').html('<span class="lotro-deed-name">' + d.n + '</span>');

    var html = '<div class="item-modal-meta">';
    html += '<p><strong>Type:</strong> ' + typeBadge(d.tp) + '</p>';
    if (d.lv) html += '<p><strong>Level:</strong> ' + d.lv + '</p>';
    if (d.cl) html += '<p><strong>Required Class:</strong> ' + d.cl + '</p>';
    html += '</div>';

    if (d.rw && d.rw.length) {
      html += '<h5>Rewards</h5>';
      html += '<ul class="deed-reward-list">';
      for (var i = 0; i < d.rw.length; i++) {
        var r = d.rw[i];
        html += '<li><strong>' + r.t + ':</strong> ' + r.v + '</li>';
      }
      html += '</ul>';
    }

    $('#deed-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'deeds.html?id=' + id);
    }
    $('#deed-modal').modal('show');
  }

  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
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
      window.history.replaceState(null, '', 'deeds.html');
    }
  });

  window.LOTRO_DEEDS_INIT = loadData;
  $(document).ready(loadData);
})();
