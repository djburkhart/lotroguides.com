/* ═══════════════════════════════════════════════════════════════════════════
   Title Database — Client-side DataTable + Filters
   Expects: window.LOTRO_TITLES_DB loaded before init
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  function gameIcon(iconId, size, iconDir) {
    if (!iconId) return '';
    size = size || 32;
    iconDir = iconDir || 'titles';
    return '<img src="' + cdnUrl('img/icons/' + iconDir + '/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  var table;
  var allData = [];
  var initialized = false;

  var catColors = {
    'Deed':                          '#CD853F',
    'Quest':                         '#4682B4',
    'Crafting':                      '#DAA520',
    'Event':                         '#9B59B6',
    'Slayer Deed - Free Peoples':    '#9B2226',
    'Slayer Deed':                   '#C0392B',
    'Social':                        '#20B2AA',
    'Epic':                          '#E67E22',
    'Monster Play':                  '#8B008B',
    'Hobby':                         '#6B8E23'
  };

  function catBadge(cat) {
    if (!cat) return '<span class="text-muted">—</span>';
    var c = catColors[cat] || '#666';
    return '<span class="mob-genus-badge" style="background:' + c + '">' + $('<span/>').text(cat).html() + '</span>';
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data;
    var icon = row.ic ? gameIcon(row.ic, 24) + ' ' : '';
    return '<span class="db-name-cell">' + icon + '<strong>' + $('<span/>').text(data).html() + '</strong></span>';
  }

  function renderCat(data, type) {
    if (type !== 'display') return data || '';
    return catBadge(data);
  }

  function renderDesc(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">—</span>';
    var text = $('<span/>').text(data).html();
    if (text.length > 120) text = text.substring(0, 117) + '…';
    return '<span class="text-muted small">' + text + '</span>';
  }

  function populateCategories(data) {
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

  function init() {
    if (initialized) return;
    initialized = true;

    allData = window.LOTRO_TITLES_DB || [];
    populateCategories(allData);

    table = $('#titles-table').DataTable({
      data: allData,
      columns: [
        { data: 'n', title: 'Title', render: renderName },
        { data: 'cat', title: 'Category', render: renderCat, defaultContent: '' },
        { data: 'desc', title: 'Description', render: renderDesc, defaultContent: '' }
      ],
      pageLength: 25,
      order: [[0, 'asc']],
      language: { search: '', searchPlaceholder: 'Search titles…' },
      dom: "<'row'<'col-sm-6'l><'col-sm-6'f>>" +
           "<'row'<'col-sm-12'tr>>" +
           "<'row'<'col-sm-5'i><'col-sm-7'p>>"
    });

    $('#filter-category').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-category').val('');
      applyFilters();
    });

    // Deep-link support
    var params = new URLSearchParams(window.location.search);
    if (params.get('cat')) {
      $('#filter-category').val(params.get('cat'));
      applyFilters();
    }
  }

  window.LOTRO_TITLES_INIT = init;
})();
