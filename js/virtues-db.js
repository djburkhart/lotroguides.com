/* ═══════════════════════════════════════════════════════════════════════════
   Virtue Database — Client-side DataTable + Modal
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var table;
  var allData = [];
  var virtueById = {};
  var initialized = false;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function gameIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 16;
    return '<img src="' + cdnUrl('img/icons/traits/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data;
    var icon = gameIcon(row.ic);
    return '<a href="virtues.html?id=' + row.id + '" class="lotro-virtue-link" data-virtue-id="' + row.id + '">' + icon + escapeHtml(data) + '</a>';
  }

  function renderStats(data, type) {
    if (type !== 'display') return (data || []).join(', ');
    if (!data || !data.length) return '<span class="text-muted">—</span>';
    return data.map(function (s) {
      return '<span class="virtue-stat-badge">' + s + '</span>';
    }).join(' ');
  }

  function renderRank(data, type) {
    if (type !== 'display') return data || 0;
    return '<span class="virtue-rank-badge">' + data + '</span>';
  }

  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_VIRTUES_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_VIRTUES_DB;
    for (var i = 0; i < allData.length; i++) virtueById[allData[i].id] = allData[i];
    initTable();
    checkUrlParams();
  }

  function initTable() {
    table = $('#virtues-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 25,
      order: [[0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 'st', render: renderStats },
        { data: 'mr', render: renderRank, width: '100px' }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search virtues...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ virtues',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  function showVirtueModal(id) {
    var v = virtueById[id];
    if (!v) return;

    var icon = gameIcon(v.ic, 24);
    $('#virtue-modal-title').html(icon + '<span class="lotro-virtue-name">' + escapeHtml(v.n) + '</span>');

    var html = '<div class="item-modal-meta">';
    html += '<p><strong>Max Rank:</strong> ' + v.mr + '</p>';
    html += '<p><strong>Active Stats:</strong></p>';
    html += '<ul class="virtue-stat-list">';
    for (var i = 0; i < v.st.length; i++) {
      html += '<li>' + escapeHtml(v.st[i]) + '</li>';
    }
    html += '</ul>';
    html += '</div>';

    $('#virtue-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'virtues.html?id=' + id);
    }
    $('#virtue-modal').modal('show');
  }

  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
    }
    var id = params.get('id');
    if (id) setTimeout(function () { showVirtueModal(id); }, 200);
  }

  $(document).on('click', '.lotro-virtue-link', function (e) {
    e.preventDefault();
    showVirtueModal($(this).data('virtue-id').toString());
  });

  $(document).on('hidden.bs.modal', '#virtue-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'virtues.html');
    }
  });

  window.LOTRO_VIRTUES_INIT = loadData;
  $(document).ready(loadData);
})();
