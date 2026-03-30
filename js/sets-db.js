/* ═══════════════════════════════════════════════════════════════════════════
   Set Database — Client-side DataTable + Filters + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var table;
  var allData = [];
  var setById = {};
  var initialized = false;

  function renderName(data, type, row) {
    if (type !== 'display') return data;
    return '<a href="sets.html?id=' + row.id + '" class="lotro-set-link" data-set-id="' + row.id + '">' + data + '</a>';
  }

  function renderLevel(data, type, row) {
    if (type !== 'display') return data || 0;
    var html = data || '—';
    if (row.ml) html += ' <small class="text-muted">(max ' + row.ml + ')</small>';
    return html;
  }

  function renderPieces(data, type) {
    if (type !== 'display') return data ? data.length : 0;
    if (!data || !data.length) return '—';
    return '<span class="set-piece-count">' + data.length + ' pieces</span>';
  }

  function renderBonuses(data, type) {
    if (type !== 'display') return '';
    if (!data || !data.length) return '<span class="text-muted">—</span>';
    return data.map(function (b) {
      var statNames = b.st.map(function (s) {
        return s.s + (s.v !== null ? ': ' + s.v : '');
      }).join(', ');
      return '<span class="set-bonus-badge">' + b.c + 'pc: ' + statNames + '</span>';
    }).join(' ');
  }

  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_SETS_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_SETS_DB;
    for (var i = 0; i < allData.length; i++) setById[allData[i].id] = allData[i];
    initTable();
    bindFilters();
    checkUrlParams();
  }

  function initTable() {
    table = $('#sets-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[1, 'desc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'lv', render: renderLevel, width: '120px' },
        { data: 'pc', render: renderPieces, width: '100px' },
        { data: 'bn', render: renderBonuses, orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search sets...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ sets',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  function bindFilters() {
    $('#filter-pieces').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-pieces').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var piecesVal = $('#filter-pieces').val();

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (piecesVal) {
        var count = rowData.pc ? rowData.pc.length : 0;
        var target = parseInt(piecesVal);
        if (target >= 8) return count >= 8;
        return count === target;
      }
      return true;
    });
    table.draw();
  }

  function showSetModal(id) {
    var s = setById[id];
    if (!s) return;

    $('#set-modal-title').html('<span class="lotro-set-name">' + s.n + '</span>');

    var html = '<div class="item-modal-meta">';
    if (s.lv) html += '<p><strong>Item Level:</strong> ' + s.lv + '</p>';
    if (s.ml) html += '<p><strong>Max Character Level:</strong> ' + s.ml + '</p>';
    html += '</div>';

    html += '<h5>Set Pieces (' + s.pc.length + ')</h5>';
    html += '<ul class="set-pieces-list">';
    for (var i = 0; i < s.pc.length; i++) {
      html += '<li>' + s.pc[i].n + '</li>';
    }
    html += '</ul>';

    if (s.bn && s.bn.length) {
      html += '<h5>Set Bonuses</h5>';
      html += '<table class="table table-condensed item-stat-table">';
      for (var j = 0; j < s.bn.length; j++) {
        var b = s.bn[j];
        var stats = b.st.map(function (st) {
          return st.s + (st.v !== null ? ': <strong>' + st.v + '</strong>' : '');
        }).join(', ');
        html += '<tr><td>' + b.c + '-piece</td><td>' + stats + '</td></tr>';
      }
      html += '</table>';
    }

    $('#set-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'sets.html?id=' + id);
    }
    $('#set-modal').modal('show');
  }

  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
    }
    var id = params.get('id');
    if (id) setTimeout(function () { showSetModal(id); }, 200);
  }

  $(document).on('click', '.lotro-set-link', function (e) {
    e.preventDefault();
    showSetModal($(this).data('set-id').toString());
  });

  $(document).on('hidden.bs.modal', '#set-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'sets.html');
    }
  });

  window.LOTRO_SETS_INIT = loadData;
  $(document).ready(loadData);
})();
