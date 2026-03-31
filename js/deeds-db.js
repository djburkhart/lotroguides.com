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
    if (type === 'filter') {
      var parts = [data];
      if (row.rw && row.rw.length) {
        for (var i = 0; i < row.rw.length; i++) {
          if (row.rw[i].v) parts.push(row.rw[i].v);
        }
      }
      return parts.join(' ');
    }
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
      var value = escHtml(r && r.v !== undefined && r.v !== null ? String(r.v) : '');
      if (r.t === 'LP') return '<span class="deed-reward-badge deed-reward-lp">' + value + ' LP</span>';
      if (r.t === 'Title') return '<span class="deed-reward-badge deed-reward-title">' + value + '</span>';
      if (r.t === 'Virtue') return '<span class="deed-reward-badge deed-reward-virtue">' + value + '</span>';
      if (r.t === 'Reputation') return '<span class="deed-reward-badge deed-reward-rep">' + value + '</span>';
      if (r.t === 'VirtueXP') return '<span class="deed-reward-badge deed-reward-virtue">' + value + ' VXP</span>';
      if (r.t === 'XP') return '<span class="deed-reward-badge deed-reward-xp">' + value + ' XP</span>';
      if (r.t === 'Item') return '<span class="deed-reward-badge deed-reward-item">' + value + '</span>';
      return '<span class="deed-reward-badge">' + value + '</span>';
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

    // Objectives / Requirements
    if (d.obj && d.obj.length) {
      html += '<h5>Requirements</h5>';
      html += '<ul class="deed-objective-list">';
      for (var i = 0; i < d.obj.length; i++) {
        var o = d.obj[i];
        html += '<li>' + formatObjective(o) + '</li>';
      }
      html += '</ul>';
    }

    // Add map link only when we have resolved map coordinates for this deed
    var hasMapData = window.LOTRO_DEED_OVERLAY && window.LOTRO_DEED_OVERLAY[id];
    if (hasMapData) {
      html += '<div style="margin: 15px 0;">';
      html += '<a href="map.html?deed=' + id + '" class="btn btn-sm btn-primary" id="deed-map-link" target="_blank">';
      html += '<i class="fa fa-map-o"></i> View on Map</a>';
      html += '</div>';
    }

    if (d.rw && d.rw.length) {
      html += '<h5>Rewards</h5>';
      html += '<ul class="deed-reward-list">';
      for (var i = 0; i < d.rw.length; i++) {
        var r = d.rw[i];
        html += '<li><strong>' + r.t + ':</strong> ' + formatRewardValue(r) + '</li>';
      }
      html += '</ul>';
    }

    $('#deed-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'deeds.html?id=' + id);
    }
    $('#deed-modal').modal('show');
  }

  function formatObjective(o) {
    switch (o.t) {
      case 'kill':
        if (o.mn) {
          var link = '<a href="mobs.html?q=' + encodeURIComponent(o.mn) + '">' + escHtml(o.mn) + '</a>';
          return '<i class="fa fa-crosshairs text-danger"></i> Defeat ' + link + (o.z ? ' <span class="text-muted">(' + escHtml(o.z) + ')</span>' : '');
        }
        var text = 'Defeat ' + (o.c || '') + ' creatures';
        if (o.z) text += ' in ' + escHtml(o.z);
        return '<i class="fa fa-crosshairs text-danger"></i> ' + text;
      case 'complete':
        if (o.an) {
          if (o.aq) return '<i class="fa fa-check-circle text-info"></i> Complete quest: <a href="quests.html?id=' + o.aid + '">' + escHtml(o.an) + '</a>';
          if (o.ad) return '<i class="fa fa-bookmark text-warning"></i> Complete deed: <a href="deeds.html?id=' + o.aid + '" class="lotro-deed-link" data-deed-id="' + o.aid + '">' + escHtml(o.an) + '</a>';
        }
        return '<i class="fa fa-check-circle text-info"></i> Complete prerequisite #' + o.aid;
      case 'qc':
        return '<i class="fa fa-list-ol text-info"></i> Complete ' + o.c + ' quests';
      case 'lm':
        return '<i class="fa fa-map-marker text-success"></i> Discover: ' + escHtml(o.n);
      case 'item':
        return '<i class="fa fa-cube text-primary"></i> Collect: <a href="items.html?q=' + encodeURIComponent(o.n) + '">' + escHtml(o.n) + '</a>';
      case 'use':
        return '<i class="fa fa-hand-pointer-o text-primary"></i> Use: ' + escHtml(o.n);
      case 'npc':
        return '<i class="fa fa-comments text-info"></i> Talk to: ' + escHtml(o.n);
      case 'skill':
        return '<i class="fa fa-bolt text-warning"></i> Use skill ' + o.c + ' times';
      case 'emote':
        return '<i class="fa fa-smile-o text-pink"></i> ' + escHtml(o.n) + ' ' + o.c + ' times';
      case 'explore':
        return '<i class="fa fa-compass text-success"></i> Explore ' + o.c + ' areas';
      case 'fac':
        return '<i class="fa fa-flag text-warning"></i> Reach tier ' + o.tier + ' with ' + escHtml(o.n);
      default:
        return '<i class="fa fa-circle-o"></i> ' + JSON.stringify(o);
    }
  }

  function formatRewardValue(r) {
    if (r.t === 'LP') return escHtml(String(r.v)) + ' LOTRO Points';
    return escHtml(String(r.v || ''));
  }

  function escHtml(s) {
    if (!s) return '';
    s = cleanGameText(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cleanGameText(s) {
    if (!s) return '';
    return String(s)
      .replace(/&amp;#10;|&#10;|&#x0*0a;/gi, '\n')
      .replace(/\\q/g, '')
      .replace(/<rgb=[^>]*>/gi, '')
      .replace(/<\/rgb>/gi, '')
      .replace(/&amp;amp;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
