/* ═══════════════════════════════════════════════════════════════════════════
   Content Database — Client-side DataTable + Filters + Modal
   Expects: data/lore/items-db.json loaded at build time
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  var table;
  var allData = [];

  // ── Quality / type helpers ──────────────────────────────────────────────
  var qualityColors = {
    legendary:    '#ff9800',
    incomparable: '#e040fb',
    rare:         '#3ea8e6',
    uncommon:     '#f5e642',
    common:       '#f0f0f0'
  };

  var subtypeLabels = {
    food:           'Food',
    'trail-food':   'Trail Food',
    feast:          'Feast',
    'battle-scroll':'Battle Scroll',
    'warding-scroll':'Warding Scroll',
    token:          'Token',
    tactical:       'Tactical',
    other:          'Other'
  };

  function qualityBadge(q) {
    if (!q) return '';
    var c = qualityColors[q] || '#999';
    return '<span class="item-quality-badge" style="background:' + c + '">' +
           q.charAt(0).toUpperCase() + q.slice(1) + '</span>';
  }

  function subtypeBadge(s) {
    if (!s) return '';
    var label = subtypeLabels[s] || s;
    return '<span class="item-subtype-badge">' + label + '</span>';
  }

  var fmtStat = window.LOTRO_FORMAT_STAT || function (s) { return s; };

  function formatStats(stats) {
    if (!stats || !stats.length) return '<span class="text-muted">—</span>';
    return stats.filter(function (s) { return s.v !== 0; }).slice(0, 4).map(function (s) {
      return '<span class="item-stat">' + fmtStat(s.s) + ': <strong>' + s.v.toLocaleString() + '</strong></span>';
    }).join(' ');
  }

  function formatStatsFull(stats) {
    if (!stats || !stats.length) return '<div class="tt-stats-empty">No stat data available.</div>';
    return '<div class="tt-stats">' +
      stats.filter(function (s) { return s.v !== 0; }).map(function (s) {
        var prefix = s.v > 0 ? '+' : '';
        var isPercent = s.s.indexOf('%') !== -1 || s.s.indexOf('Chance') !== -1 ||
                        s.s.indexOf('Damage') !== -1 && s.s !== 'Physical Mastery' && s.s !== 'Tactical Mastery';
        var display = isPercent ? prefix + s.v.toLocaleString() + '%' : prefix + s.v.toLocaleString();
        return '<div class="tt-stat-row">' + display + ' ' + fmtStat(s.s) + '</div>';
      }).join('') +
      '</div>';
  }

  // ── Type icons for cross-linked entries ─────────────────────────────────
  var typeIcons = {
    set: '<i class="fa fa-cubes" style="color:#bb86fc"></i> ',
    virtue: '<i class="fa fa-shield" style="color:#ffd54f"></i> ',
    'quest-reward': '<i class="fa fa-gift" style="color:#4fc3f7"></i> '
  };

  var deedTypeIcons = {
    Slayer: 'slayer', Exploration: 'explorer', Lore: 'lore',
    Reputation: 'reputation', Class: 'class', Event: 'event', Race: 'race'
  };

  function deedIcon(deedType, size) {
    var file = deedTypeIcons[deedType];
    if (!file) return '<i class="fa fa-bookmark" style="color:#66bb6a"></i> ';
    size = size || 16;
    return '<img src="' + cdnUrl('img/icons/deed-types/' + file + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="deed-type-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  // ── Game icon helper ────────────────────────────────────────────────────
  function gameIcon(iconId, size) {
    if (!iconId) return '';
    size = size || 16;
    return '<img src="' + cdnUrl('img/icons/items/' + iconId + '.png') + '" ' +
           'width="' + size + '" height="' + size + '" ' +
           'class="lotro-game-icon" alt="" loading="lazy" ' +
           'onerror="this.style.display=\'none\'">';
  }

  // ── Render name cell ────────────────────────────────────────────────────
  function renderName(data, type, row) {
    if (type === 'display') {
      var cls = row.q ? ' lotro-' + row.q : '';
      var icon = row.ic ? gameIcon(row.ic) + ' ' : (row.t === 'deed' ? deedIcon(row.dt) + ' ' : (typeIcons[row.t] || ''));
      var link = '<a href="items?id=' + row.id + '" class="lotro-item-link' + cls + '" data-item-id="' + row.id + '">' + icon + data + '</a>';
      if (row.sid) {
        link += ' <a href="sets?id=' + row.sid + '" class="item-set-badge" title="Part of: ' + (row.sn || 'Set').replace(/"/g, '&quot;') + '"><i class="fa fa-cubes"></i></a>';
      }
      return link;
    }
    if (type === 'filter') {
      var parts = [data];
      if (row.sn) parts.push(row.sn);
      if (row.st) parts.push(subtypeLabels[row.st] || row.st);
      if (row.sl) parts.push(row.sl);
      parts = parts.concat(buildSearchHints(row));
      if (row.stats && row.stats.length) {
        for (var i = 0; i < row.stats.length; i++) {
          parts.push(row.stats[i].s);
        }
      }
      return parts.join(' ');
    }
    return data;
  }

  function buildSearchHints(row) {
    var hints = [];
    var slot = (row.sl || '').toLowerCase();
    var subtype = (row.st || '').toLowerCase();

    if (row.t === 'item') {
      hints.push('gear', 'equipment', 'items');
    }

    // Weapon intent terms used by guide links (weapon/weapons, melee/ranged)
    if (/main|off|one|two|2-hand|hand|ranged|bow|crossbow|javelin|spear|sword|axe|club|dagger|mace|staff|halberd|weapon/.test(slot)) {
      hints.push('weapon', 'weapons', 'melee', 'ranged', 'dps');
    }

    // Armor intent terms used by guide links (armor/armour, defensive gear)
    if (/head|shoulder|chest|cloak|back|hands|legs|feet|wrist|ear|neck|finger|pocket|armor|armour|shield/.test(slot)) {
      hints.push('armor', 'armour', 'defense', 'defensive');
    }

    if (row.t === 'consumable' || subtype) {
      hints.push('consumable', 'consumables');
      if (/food|trail-food|feast/.test(subtype)) hints.push('food', 'buff food');
      if (/battle-scroll|warding-scroll/.test(subtype)) hints.push('scroll', 'scrolls');
      if (/token/.test(subtype)) hints.push('token', 'tokens', 'hope');
      if (/potion/.test(subtype)) hints.push('potion', 'potions');
    }

    return hints;
  }

  // ── Render quality / subtype cell ───────────────────────────────────────
  function renderQuality(data, type, row) {
    if (type !== 'display') return data || '';
    var parts = [];
    if (row.q) parts.push(qualityBadge(row.q));
    if (row.st) parts.push(subtypeBadge(row.st));
    return parts.join(' ') || '<span class="text-muted">—</span>';
  }

  // ── Load data from embedded JSON ────────────────────────────────────────
  var initialized = false;
  var totalItemCount = 0;

  function loadData() {
    if (initialized) return;
    if (typeof window.LOTRO_ITEMS_DB === 'undefined') return;
    initialized = true;
    allData = window.LOTRO_ITEMS_DB;
    totalItemCount = allData.length;
    buildLookup();
    initTable();
    bindFilters();
    checkUrlParams();
    updateLoadingStatus(1, 1); // hide progress if single-chunk
  }

  // ── Add a chunk of data after initial load ─────────────────────────────
  function addChunk(chunk, loadedCount, totalChunks) {
    for (var i = 0; i < chunk.length; i++) {
      allData.push(chunk[i]);
      itemById[chunk[i].id] = chunk[i];
    }
    totalItemCount = allData.length;
    table.rows.add(chunk).draw(false);
    updateLoadingStatus(loadedCount, totalChunks);
  }

  function updateLoadingStatus(loaded, total) {
    var $bar = $('#items-load-progress');
    if (!$bar.length) return;
    if (loaded >= total) {
      $bar.closest('.items-loading-bar').fadeOut(400);
    } else {
      var pct = Math.round((loaded / total) * 100);
      $bar.css('width', pct + '%').attr('aria-valuenow', pct);
      $bar.find('.sr-only').text(pct + '% loaded');
    }
  }

  // ── Build a lookup map for fast id-based access ────────────────────────
  var itemById = {};

  function buildLookup() {
    for (var i = 0; i < allData.length; i++) {
      itemById[allData[i].id] = allData[i];
    }
  }

  // ── DataTable init ──────────────────────────────────────────────────────
  function initTable() {
    table = $('#items-table').DataTable({
      data: allData,
      deferRender: true,
      pageLength: 100,
      lengthMenu: [50, 100, 250, 500],
      order: [[0, 'asc']],
      columns: [
        { data: 'n', render: renderName },
        { data: 't', width: '100px' },
        { data: 'q', render: renderQuality, width: '160px' },
        { data: 'stats', render: formatStats, orderable: false, searchable: false }
      ],
      language: {
        search: '<i class="fa fa-search"></i>',
        searchPlaceholder: 'Search items...',
        info: 'Showing _START_\u2013_END_ of _TOTAL_ items',
        lengthMenu: 'Show _MENU_'
      },
      dom: '<"row"<"col-sm-6"l><"col-sm-6"f>>rtip'
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  function bindFilters() {
    $('#filter-type, #filter-subtype, #filter-quality').on('change', applyFilters);
    $('#filter-reset').on('click', function () {
      $('#filter-type, #filter-subtype, #filter-quality').val('');
      applyFilters();
    });
  }

  function applyFilters() {
    var typeVal = $('#filter-type').val();
    var subtypeVal = $('#filter-subtype').val();
    var qualityVal = $('#filter-quality').val();

    $.fn.dataTable.ext.search = [];
    $.fn.dataTable.ext.search.push(function (settings, searchData, dataIndex, rowData) {
      if (typeVal && rowData.t !== typeVal) return false;
      if (subtypeVal && rowData.st !== subtypeVal) return false;
      if (qualityVal && rowData.q !== qualityVal) return false;
      return true;
    });
    table.draw();
  }

  // ── Slot labels ─────────────────────────────────────────────────────────
  var slotLabels = {
    'back': 'Back', 'main hand': 'Main Hand', 'off hand': 'Off Hand',
    'either hand': 'One-hand', 'ranged item': 'Ranged', 'head': 'Head',
    'shoulder': 'Shoulder', 'chest': 'Chest', 'hand': 'Hands', 'legs': 'Legs',
    'feet': 'Feet', 'wrist': 'Wrist', 'finger': 'Finger', 'ear': 'Ear',
    'neck': 'Necklace', 'pocket': 'Pocket', 'class slot': 'Class Slot',
    'bridle': 'Bridle', 'right finger': 'Finger', 'left finger': 'Finger',
    'right ear': 'Ear', 'left ear': 'Ear', 'right wrist': 'Wrist', 'left wrist': 'Wrist'
  };

  // ── Modal ───────────────────────────────────────────────────────────────
  function showItemModal(id) {
    var item = itemById[id];
    if (!item) return;

    var qClass = item.q || '';
    // Apply quality accent on the modal wrapper
    var modal = document.getElementById('item-modal');
    modal.setAttribute('data-quality', qClass);

    // ── Build tooltip-style body ──
    var html = '<div class="tt">';

    // Header: icon + name
    html += '<div class="tt-header">';
    if (item.ic) html += '<div class="tt-icon">' + gameIcon(item.ic, 40) + '</div>';
    html += '<div class="tt-name' + (qClass ? ' lotro-' + qClass : '') + '">' + item.n + '</div>';
    html += '</div>';

    // Binding / quality line
    if (item.q) {
      html += '<div class="tt-line tt-binding">' + item.q.charAt(0).toUpperCase() + item.q.slice(1) + '</div>';
    }

    // Item level
    if (item.lv) {
      html += '<div class="tt-line tt-ilvl">Item Level: ' + item.lv + '</div>';
    }

    // Slot / type meta
    if (item.sl) {
      html += '<div class="tt-line tt-slot">' + (slotLabels[item.sl] || item.sl) + '</div>';
    } else if (item.t === 'consumable' && item.st) {
      html += '<div class="tt-line tt-slot">' + (subtypeLabels[item.st] || item.st) + '</div>';
    }

    // ── Stats ──
    html += formatStatsFull(item.stats);

    // ── Divider before cross-links ──
    var hasLinks = item.sid || item.t === 'deed' || item.t === 'set' || item.t === 'virtue' || item.t === 'quest-reward';
    if (hasLinks) {
      html += '<div class="tt-divider"></div>';
      html += '<div class="tt-links">';
      if (item.sid) {
        html += '<a href="sets?id=' + item.sid + '" class="item-crosslink item-crosslink-set"><i class="fa fa-cubes"></i> ' + (item.sn || 'View Set') + '</a>';
      }
      if (item.t === 'deed') {
        html += '<a href="deeds?id=' + item.id + '" class="item-crosslink item-crosslink-deed">' + deedIcon(item.dt, 14) + ' View in Deed Database</a>';
      }
      if (item.t === 'set') {
        html += '<a href="sets?id=' + item.id + '" class="item-crosslink item-crosslink-set"><i class="fa fa-cubes"></i> View in Set Database</a>';
      }
      if (item.t === 'virtue') {
        html += '<a href="virtues?id=' + item.id + '" class="item-crosslink item-crosslink-virtue"><i class="fa fa-shield"></i> View in Virtue Database</a>';
      }
      if (item.t === 'quest-reward') {
        html += '<a href="quests?q=' + encodeURIComponent(item.n) + '" class="item-crosslink item-crosslink-quest"><i class="fa fa-gift"></i> Search Quests</a>';
      }
      html += '</div>';
    }

    html += '</div>'; // .tt

    $('#item-modal-title').empty();
    $('#item-modal-body').html(html);

    // Update URL with item id for sharing
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'items?id=' + id);
    }

    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:'select_content',content_type:'item',content_id:id});
    $('#item-modal').modal('show');
  }

  // ── URL parameter handling: ?id= for modal, ?q= for search ─────────────
  function checkUrlParams() {
    var params = new URLSearchParams(window.location.search);

    // Pre-fill search from ?q= (navbar search redirect)
    var q = params.get('q');
    if (q && table) {
      table.search(q).draw();
      // Also update the DataTables search input
      $('div.dataTables_filter input').val(q);
    }

    // Apply filter dropdowns from URL to support context-aware guide links
    var typeVal = params.get('type');
    var subtypeVal = params.get('subtype');
    var qualityVal = params.get('quality');

    if (typeVal) $('#filter-type').val(typeVal);
    if (subtypeVal) $('#filter-subtype').val(subtypeVal);
    if (qualityVal) $('#filter-quality').val(qualityVal);

    if (typeVal || subtypeVal || qualityVal) {
      applyFilters();
      if (q && table) {
        table.search(q).draw();
      }
    }

    // Open item modal from ?id=
    var id = params.get('id');
    if (id) {
      setTimeout(function () { showItemModal(id); }, 200);
    }
  }

  // ── Delegated click handler ─────────────────────────────────────────────
  $(document).on('click', '.lotro-item-link', function (e) {
    e.preventDefault();
    var id = $(this).data('item-id').toString();
    showItemModal(id);
  });

  // Clear URL param when modal closes
  $(document).on('hidden.bs.modal', '#item-modal', function () {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', 'items');
    }
  });

  // ── Bootstrap ───────────────────────────────────────────────────────────
  // Expose init for late-load scenario (document.ready may have already fired)
  window.LOTRO_ITEMS_INIT = loadData;
  window.LOTRO_ITEMS_ADD_CHUNK = addChunk;
  $(document).ready(loadData);
})();
