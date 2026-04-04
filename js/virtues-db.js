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
    return '<a href="virtues?id=' + row.id + '" class="lotro-virtue-link" data-virtue-id="' + row.id + '">' + icon + escapeHtml(data) + '</a>';
  }

  var fmtStat = window.LOTRO_FORMAT_STAT || function (s) { return s; };

  function fmtVal(v) {
    if (v == null) return '';
    if (v === Math.floor(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function renderStats(data, type) {
    if (type !== 'display') return (data || []).map(function (e) { return e.s; }).join(', ');
    if (!data || !data.length) return '<span class="text-muted">—</span>';
    return data.map(function (e) {
      return '<span class="virtue-stat-badge">+' + fmtVal(e.v) + ' ' + fmtStat(e.s) + '</span>';
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
        { data: 'sv', render: renderStats },
        { data: 'passive', render: function (d, t) { return t !== 'display' ? (d || '') : (d ? '<span class="virtue-passive-badge">' + escapeHtml(d) + '</span>' : '<span class="text-muted">—</span>'); }, width: '90px' },
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
    if (v.passive) html += '<p><strong>Passive:</strong> ' + escapeHtml(v.passive) + '</p>';
    html += '<p><strong>Stats at Rank ' + v.mr + ':</strong></p>';
    html += '<ul class="virtue-stat-list">';
    var sv = v.sv || [];
    for (var i = 0; i < sv.length; i++) {
      html += '<li><strong>+' + fmtVal(sv[i].v) + '</strong> ' + escapeHtml(fmtStat(sv[i].s)) + '</li>';
    }
    html += '</ul>';
    html += '</div>';

    $('#virtue-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'virtues?id=' + id);
    }
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:'select_content',content_type:'virtue',content_id:id});
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
      window.history.replaceState(null, '', 'virtues');
    }
  });

  window.LOTRO_VIRTUES_INIT = loadData;
  $(document).ready(loadData);
})();
