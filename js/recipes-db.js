/* ═══════════════════════════════════════════════════════════════════════════
   Recipe Database — Client-side DataTable + Filters + Modal
   Expects: window.LOTRO_RECIPES_DB loaded before init
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  function gameIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 32;
    return '<img src="' + cdnUrl('img/icons/items/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  var table;
  var allData = [];
  var recipeById = {};
  var initialized = false;

  var profColors = {
    'COOK':        '#CD853F',
    'FARMER':      '#8FBC8F',
    'FORESTER':    '#6B8E23',
    'JEWELLER':    '#DAA520',
    'METALSMITH':  '#708090',
    'PROSPECTOR':  '#A0522D',
    'SCHOLAR':     '#4682B4',
    'TAILOR':      '#9B59B6',
    'WEAPONSMITH': '#9B2226',
    'WOODWORKER':  '#D2691E'
  };

  var profNames = {
    'COOK':        'Cook',
    'FARMER':      'Farmer',
    'FORESTER':    'Forester',
    'JEWELLER':    'Jeweller',
    'METALSMITH':  'Metalsmith',
    'PROSPECTOR':  'Prospector',
    'SCHOLAR':     'Scholar',
    'TAILOR':      'Tailor',
    'WEAPONSMITH': 'Weaponsmith',
    'WOODWORKER':  'Woodworker'
  };

  function profBadge(prof) {
    if (!prof) return '<span class="text-muted">—</span>';
    var c = profColors[prof] || '#666';
    var name = profNames[prof] || prof;
    return '<span class="mob-genus-badge" style="background:' + c + '">' + name + '</span>';
  }

  function renderName(data, type, row) {
    if (type !== 'display') return data;
    var icon = row.ic ? gameIcon(row.ic, 24) + ' ' : '';
    return '<span class="db-name-cell">' + icon +
           '<a href="recipes?id=' + row.id + '" class="lotro-recipe-link" data-recipe-id="' + row.id + '">' +
           $('<span/>').text(data).html() + '</a></span>';
  }

  function renderProf(data, type) {
    if (type !== 'display') return profNames[data] || data || '';
    return profBadge(data);
  }

  function renderTier(data, type) {
    if (type !== 'display') return data || 0;
    return data || '—';
  }

  function renderCat(data, type) {
    if (type !== 'display') return data || '';
    if (!data) return '<span class="text-muted">—</span>';
    return $('<span/>').text(data).html();
  }

  function renderXp(data, type) {
    if (type !== 'display') return data || 0;
    return data ? data.toLocaleString() : '—';
  }

  function populateFilters(data) {
    var profs = {}, tiers = {}, cats = {};
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (r.prof) profs[r.prof] = (profs[r.prof] || 0) + 1;
      if (r.tier) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
      if (r.cat) cats[r.cat] = (cats[r.cat] || 0) + 1;
    }

    var selP = $('#filter-profession');
    Object.keys(profs).sort().forEach(function (p) {
      selP.append('<option value="' + p + '">' + (profNames[p] || p) + ' (' + profs[p] + ')</option>');
    });

    var selT = $('#filter-tier');
    Object.keys(tiers).sort(function (a, b) { return a - b; }).forEach(function (t) {
      selT.append('<option value="' + t + '">Tier ' + t + ' (' + tiers[t] + ')</option>');
    });

    var selC = $('#filter-category');
    Object.keys(cats).sort().forEach(function (c) {
      selC.append('<option value="' + c + '">' + c + ' (' + cats[c] + ')</option>');
    });
  }

  function applyFilters() {
    var prof = $('#filter-profession').val();
    var tier = $('#filter-tier').val();
    var cat = $('#filter-category').val();
    var filtered = allData;
    if (prof) filtered = filtered.filter(function (r) { return r.prof === prof; });
    if (tier) filtered = filtered.filter(function (r) { return String(r.tier) === tier; });
    if (cat) filtered = filtered.filter(function (r) { return r.cat === cat; });
    table.clear().rows.add(filtered).draw();
  }

  function showRecipeModal(id) {
    var r = recipeById[id];
    if (!r) return;

    var modalIcon = r.ic ? gameIcon(r.ic, 36) + ' ' : '';
    $('#recipe-modal-title').html(modalIcon + $('<span/>').text(r.n).html());
    var html = '';

    // Info row
    html += '<div class="row m-b-15">';
    if (r.prof) html += '<div class="col-xs-4"><strong>Profession:</strong> ' + profBadge(r.prof) + '</div>';
    if (r.tier) html += '<div class="col-xs-4"><strong>Tier:</strong> ' + r.tier + '</div>';
    if (r.xp) html += '<div class="col-xs-4"><strong>XP:</strong> ' + r.xp.toLocaleString() + '</div>';
    html += '</div>';

    if (r.cat) html += '<p><strong>Category:</strong> ' + $('<span/>').text(r.cat).html() + '</p>';
    if (r.crit) html += '<p><strong>Critical Chance:</strong> ' + r.crit + '%</p>';
    if (r.guild) html += '<p><span class="label label-info">Guild Recipe</span></p>';
    if (r.single) html += '<p><span class="label label-warning">Single Use</span></p>';

    // Ingredients
    if (r.ing && r.ing.length) {
      html += '<h5>Ingredients</h5>';
      html += '<table class="table table-condensed"><thead><tr><th>Item</th><th>Qty</th><th>Type</th></tr></thead><tbody>';
      for (var i = 0; i < r.ing.length; i++) {
        var ing = r.ing[i];
        html += '<tr>';
        html += '<td><a href="items?id=' + ing.id + '" target="_blank">' + $('<span/>').text(ing.n).html() + '</a></td>';
        html += '<td>' + (ing.qty || 1) + '</td>';
        html += '<td>';
        if (ing.opt) html += '<span class="label label-default">Optional</span>';
        if (ing.critBonus) html += ' <span class="label label-success">+' + ing.critBonus + '% crit</span>';
        if (!ing.opt && !ing.critBonus) html += 'Required';
        html += '</td></tr>';
      }
      html += '</tbody></table>';
    }

    // Results
    if (r.res && r.res.length) {
      html += '<h5>Results</h5>';
      html += '<table class="table table-condensed"><thead><tr><th>Item</th><th>Qty</th><th>Type</th></tr></thead><tbody>';
      for (var j = 0; j < r.res.length; j++) {
        var res = r.res[j];
        html += '<tr>';
        html += '<td><a href="items?id=' + res.id + '" target="_blank">' + $('<span/>').text(res.n).html() + '</a></td>';
        html += '<td>' + (res.qty || 1) + '</td>';
        html += '<td>' + (res.crit ? '<span class="label label-warning">Critical</span>' : 'Normal') + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
    }

    // Scroll item
    if (r.scroll) {
      html += '<p class="m-t-10"><strong>Recipe Scroll:</strong> <a href="items?id=' + r.scroll.id + '" target="_blank">' + $('<span/>').text(r.scroll.n).html() + '</a></p>';
    }

    $('#recipe-modal-body').html(html);
    $('#recipe-modal').modal('show');
  }

  function init() {
    if (initialized) return;
    initialized = true;

    allData = window.LOTRO_RECIPES_DB || [];
    for (var i = 0; i < allData.length; i++) recipeById[allData[i].id] = allData[i];
    populateFilters(allData);

    table = $('#recipes-table').DataTable({
      data: allData,
      columns: [
        { data: 'n', title: 'Recipe', render: renderName },
        { data: 'prof', title: 'Profession', render: renderProf, defaultContent: '' },
        { data: 'tier', title: 'Tier', render: renderTier, defaultContent: '' },
        { data: 'cat', title: 'Category', render: renderCat, defaultContent: '' },
        { data: 'xp', title: 'XP', render: renderXp, defaultContent: '' }
      ],
      pageLength: 25,
      order: [[0, 'asc']],
      language: { search: '', searchPlaceholder: 'Search recipes…' },
      dom: "<'row'<'col-sm-6'l><'col-sm-6'f>>" +
           "<'row'<'col-sm-12'tr>>" +
           "<'row'<'col-sm-5'i><'col-sm-7'p>>"
    });

    $('#filter-profession, #filter-tier, #filter-category').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-profession, #filter-tier, #filter-category').val('');
      applyFilters();
    });

    // Click handler
    $(document).on('click', '.lotro-recipe-link', function (e) {
      e.preventDefault();
      showRecipeModal($(this).data('recipe-id'));
    });

    // Deep-link support
    var params = new URLSearchParams(window.location.search);
    if (params.get('id')) showRecipeModal(params.get('id'));
    if (params.get('prof')) {
      $('#filter-profession').val(params.get('prof'));
      applyFilters();
    }
  }

  window.LOTRO_RECIPES_INIT = init;
})();
