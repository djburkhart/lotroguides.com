/* ═══════════════════════════════════════════════════════════════════════════
   Title Database — Client-side DataTable + Filters + Modal
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
  var titleById = {};
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
    if (type === 'display') {
      var icon = row.ic ? gameIcon(row.ic, 24) + ' ' : '';
      return '<span class="db-name-cell">' + icon +
             '<a href="titles?id=' + row.id + '" class="lotro-title-link" data-title-id="' + row.id + '"><strong>' +
             $('<span/>').text(data).html() + '</strong></a></span>';
    }
    if (type === 'filter') {
      var parts = [data];
      if (row.cat) parts.push(row.cat);
      if (row.desc) parts.push(row.desc);
      return parts.join(' ');
    }
    return data;
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

  // ── Title detail modal ──────────────────────────────────────────────────
  function showTitleModal(id) {
    var t = titleById[id];
    if (!t) return;

    var icon = t.ic ? gameIcon(t.ic, 36) + ' ' : '';
    $('#title-modal-title').html(icon + '<strong>' + $('<span/>').text(t.n).html() + '</strong>');

    var html = '';
    if (t.cat) html += '<p><strong>Category:</strong> ' + catBadge(t.cat) + '</p>';
    if (t.desc) html += '<p class="text-muted">' + $('<span/>').text(t.desc).html() + '</p>';

    $('#title-modal-body').html(html);

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'titles?id=' + id);
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'select_content', content_type: 'title', content_id: id });

    $('#title-modal').modal('show');
  }

  function checkUrlParams() {
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
      setTimeout(function () { showTitleModal(id); }, 200);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    allData = window.LOTRO_TITLES_DB || [];
    for (var i = 0; i < allData.length; i++) titleById[allData[i].id] = allData[i];
    populateCategories(allData);

    table = $('#titles-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[0, 'asc']],
      columns: [
        { data: 'n', title: 'Title', render: renderName },
        { data: 'cat', title: 'Category', render: renderCat, defaultContent: '', width: '160px' },
        { data: 'desc', title: 'Description', render: renderDesc, defaultContent: '' }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search titles…',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ titles',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });

    $('#filter-category').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-category').val('');
      applyFilters();
    });

    checkUrlParams();
  }

  // ── Delegated click handler ─────────────────────────────────────────────
  $(document).on('click', '.lotro-title-link', function (e) {
    e.preventDefault();
    showTitleModal($(this).data('title-id').toString());
  });

  $(document).on('hidden.bs.modal', '#title-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'titles');
    }
  });

  window.LOTRO_TITLES_INIT = init;
})();
