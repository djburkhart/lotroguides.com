/* ═══════════════════════════════════════════════════════════════════════════
   Faction Database — Client-side DataTable + Filters + Modal
   Expects: window.LOTRO_FACTIONS_DB loaded before init
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }
  function lpIcon(size) {
    size = size || 16;
    return '<img src="' + cdnUrl('img/icons/lp.png') + '" width="' + size + '" height="' + size + '" class="lp-icon" alt="LP" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  function deedIcon(size) {
    size = size || 20;
    return '<img src="' + cdnUrl('img/icons/deed-types/reputation.png') + '" width="' + size + '" height="' + size + '" class="faction-deed-icon" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  var table;
  var allData = [];
  var factionById = {};
  var initialized = false;

  var regionColors = {
    'Eriador':     '#4682B4',
    'Rhovanion':   '#DAA520',
    'Rohan':       '#8FBC8F',
    'Mordor':      '#9B2226',
    'Dol Amroth':  '#7B68EE',
    'Gondor':      '#CD853F',
    'Haradwaith':  '#E67E22',
    'Umbar':       '#20B2AA',
    'Guild':       '#9B59B6',
    'Dunland':     '#6B8E23',
    'Misc':        '#666'
  };

  function regionBadge(cat) {
    if (!cat) return '<span class="text-muted">—</span>';
    var c = regionColors[cat] || '#666';
    return '<span class="mob-genus-badge" style="background:' + c + '">' + $('<span/>').text(cat).html() + '</span>';
  }

  // Faction category icon mapping (FontAwesome fallbacks since factions have no game icons)
  var catIcons = {
    'Eriador':    'fa-compass',
    'Rhovanion':  'fa-tree',
    'Rohan':      'fa-shield',
    'Mordor':     'fa-fire',
    'Dol Amroth': 'fa-anchor',
    'Gondor':     'fa-fort-awesome',
    'Haradwaith': 'fa-sun-o',
    'Umbar':      'fa-ship',
    'Guild':      'fa-institution',
    'Dunland':    'fa-mountain',
    'Misc':       'fa-star'
  };

  function renderName(data, type, row) {
    if (type === 'display') {
      var iconCls = catIcons[row.cat] || 'fa-star';
      var icon = '<i class="fa ' + iconCls + ' faction-cat-icon"></i> ';
      return '<span class="db-name-cell">' + icon +
             '<a href="factions?id=' + row.id + '" class="lotro-faction-link" data-faction-id="' + row.id + '">' +
             $('<span/>').text(data).html() + '</a></span>';
    }
    if (type === 'filter') {
      var parts = [data];
      if (row.cat) parts.push(row.cat);
      if (row.desc) parts.push(row.desc);
      return parts.join(' ');
    }
    return data;
  }

  function renderRegion(data, type) {
    if (type !== 'display') return data || '';
    return regionBadge(data);
  }

  function renderTiers(data, type, row) {
    if (type !== 'display') return row.tiers ? row.tiers.length : 0;
    if (!row.tiers) return '<span class="text-muted">—</span>';
    return row.tiers.length + ' tiers';
  }

  function renderLP(data, type, row) {
    if (!row.tiers) return 0;
    var total = 0;
    for (var i = 0; i < row.tiers.length; i++) total += (row.tiers[i].lp || 0);
    if (type !== 'display') return total;
    return total > 0 ? '<span class="text-success">' + lpIcon(16) + ' ' + total + '</span>' : '—';
  }

  function populateFilters(data) {
    var cats = {};
    for (var i = 0; i < data.length; i++) {
      var c = data[i].cat || 'Unknown';
      cats[c] = (cats[c] || 0) + 1;
    }
    var sel = $('#filter-category');
    Object.keys(cats).sort().forEach(function (c) {
      sel.append('<option value="' + c + '">' + c + ' (' + cats[c] + ')</option>');
    });
  }

  function applyFilters() {
    var cat = $('#filter-category').val();
    var filtered = allData;
    if (cat) filtered = filtered.filter(function (r) { return (r.cat || 'Unknown') === cat; });
    table.clear().rows.add(filtered).draw();
  }

  function showFactionModal(id) {
    var f = factionById[id];
    if (!f) return;

    var iconCls = catIcons[f.cat] || 'fa-star';
    var modalIcon = '<i class="fa ' + iconCls + ' faction-cat-icon" style="font-size:24px;margin-right:8px"></i>';
    $('#faction-modal-title').html(modalIcon + $('<span/>').text(f.n).html());
    var html = '';
    if (f.desc) html += '<p class="text-muted">' + $('<span/>').text(f.desc).html() + '</p>';
    if (f.cat) html += '<p><strong>Region:</strong> ' + regionBadge(f.cat) + '</p>';

    if (f.tiers && f.tiers.length) {
      html += '<table class="table table-striped table-condensed">';
      html += '<thead><tr><th>Tier</th><th>Standing</th><th>Rep Required</th><th>LP Reward</th><th>Deed</th></tr></thead><tbody>';
      for (var i = 0; i < f.tiers.length; i++) {
        var t = f.tiers[i];
        html += '<tr>';
        html += '<td>' + t.t + '</td>';
        html += '<td>' + $('<span/>').text(t.n).html() + '</td>';
        html += '<td>' + (t.rep || 0).toLocaleString() + '</td>';
        html += '<td>' + (t.lp ? '<span class="text-success">' + lpIcon(16) + ' ' + t.lp + '</span>' : '—') + '</td>';
        if (t.deed) {
          html += '<td>' + deedIcon(18) + ' <a href="deeds?q=' + encodeURIComponent(t.deed) + '" target="_blank">' + $('<span/>').text(t.deed).html() + '</a></td>';
        } else {
          html += '<td class="text-muted">—</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
    }

    $('#faction-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'factions?id=' + id);
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'select_content', content_type: 'faction', content_id: id });

    $('#faction-modal').modal('show');
  }

  function init() {
    if (initialized) return;
    initialized = true;

    allData = window.LOTRO_FACTIONS_DB || [];
    for (var i = 0; i < allData.length; i++) factionById[allData[i].id] = allData[i];
    populateFilters(allData);

    table = $('#factions-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[0, 'asc']],
      columns: [
        { data: 'n', title: 'Faction', render: renderName },
        { data: 'cat', title: 'Region', render: renderRegion, defaultContent: '', width: '120px' },
        { data: null, title: 'Tiers', render: renderTiers, width: '80px' },
        { data: null, title: 'LP Total', render: renderLP, width: '100px' }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search factions…',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ factions',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });

    $('#filter-category').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-category').val('');
      applyFilters();
    });

    // Click handler for faction details
    $(document).on('click', '.lotro-faction-link', function (e) {
      e.preventDefault();
      showFactionModal($(this).data('faction-id').toString());
    });

    // Deep-link support
    var params = new URLSearchParams(window.location.search);

    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      $('div.dataTables_filter input').val(q);
    }

    var catVal = params.get('cat');
    if (catVal) {
      $('#filter-category').val(catVal);
      applyFilters();
      if (q && table) table.search(q).draw();
    }

    var id = params.get('id');
    if (id) {
      setTimeout(function () { showFactionModal(id); }, 200);
    }
  }

  // Clear URL when modal closes
  $(document).on('hidden.bs.modal', '#faction-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'factions');
    }
  });

  window.LOTRO_FACTIONS_INIT = init;
})();
