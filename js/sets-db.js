/* ═══════════════════════════════════════════════════════════════════════════
   Set Database — Client-side DataTable + Filters + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var table;
  var allData = [];
  var setById = {};
  var initialized = false;

  // ── Game icon helper ────────────────────────────────────────────────────
  function gameIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 16;
    return '<img src="' + cdnUrl('img/icons/items/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  // Pick a representative icon from the first piece that has one
  function setIcon(row) {
    if (!row.pc) return '';
    for (var i = 0; i < row.pc.length; i++) {
      if (row.pc[i].ic) return gameIcon(row.pc[i].ic);
    }
    return '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderName(data, type, row) {
    if (type === 'filter') {
      var parts = [data];
      if (row.bn && row.bn.length) {
        for (var i = 0; i < row.bn.length; i++) {
          if (row.bn[i].st) {
            for (var j = 0; j < row.bn[i].st.length; j++) {
              parts.push(row.bn[i].st[j].s);
            }
          }
        }
      }
      if (row.pc && row.pc.length) {
        for (var i = 0; i < row.pc.length; i++) {
          if (row.pc[i].n) parts.push(row.pc[i].n);
        }
      }
      return parts.join(' ');
    }
    if (type !== 'display') return data;
    var icon = setIcon(row);
    return '<a href="sets?id=' + row.id + '" class="lotro-set-link" data-set-id="' + row.id + '">' + icon + (icon ? ' ' : '') + escapeHtml(data) + '</a>';
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
    var icons = '';
    for (var i = 0; i < data.length && i < 6; i++) {
      if (data[i].ic) icons += gameIcon(data[i].ic);
    }
    return (icons ? icons + ' ' : '') + '<span class="set-piece-count">' + data.length + ' pieces</span>';
  }

  function renderBonuses(data, type) {
    if (type !== 'display') return '';
    if (!data || !data.length) return '<span class="text-muted">—</span>';
    return data.map(function (b) {
      var statNames = b.st.map(function (s) {
        return escapeHtml(s.s) + (s.v !== null ? ': ' + s.v : '');
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

    var titleIcon = setIcon(s);
    $('#set-modal-title').html(titleIcon + (titleIcon ? ' ' : '') + '<span class="lotro-set-name">' + escapeHtml(s.n) + '</span>');

    var html = '<div class="item-modal-meta">';
    if (s.lv) html += '<p><strong>Item Level:</strong> ' + s.lv + '</p>';
    if (s.ml) html += '<p><strong>Max Character Level:</strong> ' + s.ml + '</p>';
    html += '<p><strong>Pieces:</strong> ' + (s.pc ? s.pc.length : 0) + '</p>';
    html += '</div>';

    html += '<h5><i class="fa fa-cubes"></i> Set Pieces</h5>';
    html += '<ul class="set-pieces-list">';
    for (var i = 0; i < s.pc.length; i++) {
      var p = s.pc[i];
      var pIcon = p.ic ? gameIcon(p.ic) + ' ' : '';
      html += '<li>' + pIcon + '<a href="items?q=' + encodeURIComponent(p.n) + '" class="lotro-item-link">' + escapeHtml(p.n) + '</a></li>';
    }
    html += '</ul>';

    if (s.bn && s.bn.length) {
      html += '<h5><i class="fa fa-star"></i> Set Bonuses</h5>';
      html += '<table class="table table-condensed item-stat-table">';
      for (var j = 0; j < s.bn.length; j++) {
        var b = s.bn[j];
        var stats = b.st.map(function (st) {
          return escapeHtml(st.s) + (st.v !== null ? ': <strong>' + st.v + '</strong>' : '');
        }).join(', ');
        html += '<tr><td><span class="set-bonus-badge">' + b.c + '-piece</span></td><td>' + stats + '</td></tr>';
      }
      html += '</table>';
    }

    $('#set-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'sets?id=' + id);
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
      window.history.replaceState(null, '', 'sets');
    }
  });

  window.LOTRO_SETS_INIT = loadData;
  $(document).ready(loadData);
})();
