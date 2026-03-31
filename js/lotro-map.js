/**
 * lotro-map.js
 * Interactive map for LotRO Guides using Leaflet with CRS.Simple.
 * Loads map definitions, markers, links, and categories from extracted JSON.
 */
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────
  var map;
  var allMaps = [];           // All map definitions
  var mapById = {};           // id → map def
  var categories = [];        // Category definitions
  var catEnabled = {};        // category code → enabled
  var allLinks = [];          // All inter-map links
  var markerLayer;            // MarkerClusterGroup for markers
  var linkLayer;              // LayerGroup for navigation links
  var basemapLayer;           // ImageOverlay for basemap image
  var currentMapId = null;    // Currently displayed map
  var mapHistory = [];        // Navigation history for back button
  var markerCache = {};       // mapId → marker data array

  // Quest enrichment data
  var questPOI = null;        // NPC DID → [{id, n, r}] quest associations
  var npcData = null;         // NPC id → {n, t}

  // Quest overlay state
  var questOverlayData = null;  // Loaded on-demand from quest-overlay.json
  var questOverlayLayer = null; // LayerGroup for quest objective markers
  var activeQuestId = null;     // Currently overlaid quest

  // Deed overlay state
  var deedOverlayData = null;   // Loaded on-demand for deed overlays
  var deedOverlayLayer = null;  // LayerGroup for deed objective markers
  var activeDeedId = null;      // Currently overlaid deed

  // Mob overlay state
  var mobOverlayData = null;     // Loaded on-demand for mob locations

  var MIDDLE_EARTH_ID = '268437554';
  var REGION_MAX_FACTOR = 65;

  // Category groups for easier toggling
  var CAT_GROUPS = {
    'Travel': [22, 23, 24, 51, 55, 48],
    'Services': [29, 33, 34, 38, 40, 42, 45, 53, 54, 58, 60, 61, 63],
    'Places': [21, 30, 31, 41, 43, 57, 74, 100],
    'NPCs': [27, 56, 70],
  };

  // Default-off categories (too noisy if enabled by default)
  var DEFAULT_OFF = new Set([70, 27, 56, 100]);

  // ─── Icon Factory ───────────────────────────────────────────────────────
  var iconCache = {};

  function getCategoryIcon(catCode) {
    if (iconCache[catCode]) return iconCache[catCode];
    var icon = L.icon({
      iconUrl: './img/maps/categories/' + catCode + '.png',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12],
    });
    iconCache[catCode] = icon;
    return icon;
  }

  var linkIcon = L.divIcon({
    className: 'lotro-map-link-icon',
    html: '<i class="fa fa-arrow-circle-right"></i>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });

  // ─── Coordinate Helpers ─────────────────────────────────────────────────
  // The game uses longitude (X) and latitude (Y).
  // Leaflet CRS.Simple uses [lat, lng] = [Y, X].
  //
  // Interior / instance maps have very small coordinate spans (e.g. 0.3×0.2)
  // while the world map spans 1024×768.  In CRS.Simple 1 unit = 1px at zoom 0,
  // so tiny maps would render as just a few pixels.  We normalise all bounds to
  // a reference size so the basemap image + markers always fill the viewport.

  var REF_SPAN = 800;  // target size in CRS.Simple units — keeps zoom level ~0
  var mapScale = 1;    // computed per map: REF_SPAN / max(spanX, spanY)
  var mapOrigin = { lng: 0, lat: 0 }; // min corner of the current map

  function computeMapTransform(mapDef) {
    var spanX = mapDef.max.lng - mapDef.min.lng;
    var spanY = mapDef.max.lat - mapDef.min.lat;
    var maxSpan = Math.max(spanX, spanY);
    mapScale = maxSpan > 0 ? REF_SPAN / maxSpan : 1;
    mapOrigin = { lng: mapDef.min.lng, lat: mapDef.min.lat };
  }

  function gameToLatLng(lng, lat) {
    var x = (lng - mapOrigin.lng) * mapScale;
    var y = (lat - mapOrigin.lat) * mapScale;
    return L.latLng(y, x);
  }

  function getMapBounds(mapDef) {
    var sw = gameToLatLng(mapDef.min.lng, mapDef.min.lat);
    var ne = gameToLatLng(mapDef.max.lng, mapDef.max.lat);
    return L.latLngBounds(sw, ne);
  }

  // ─── Initialize Map ────────────────────────────────────────────────────
  function createMarkerCluster(radius) {
    return L.markerClusterGroup({
      maxClusterRadius: radius,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function (cluster) {
        var count = cluster.getChildCount();
        var size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';
        return L.divIcon({
          html: '<div><span>' + count + '</span></div>',
          className: 'marker-cluster marker-cluster-' + size + ' lotro-cluster',
          iconSize: L.point(36, 36),
        });
      },
    });
  }

  function initMap() {
    map = L.map('lotro-map', {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 6,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: true,
    });

    // Add attribution
    L.control.attribution({ prefix: false }).addTo(map);
    map.attributionControl.addAttribution(
      'Data from <a href="https://github.com/LotroCompanion" target="_blank" rel="noopener">LotRO Companion</a>'
    );

    markerLayer = createMarkerCluster(40);
    map.addLayer(markerLayer);

    linkLayer = L.layerGroup();
    map.addLayer(linkLayer);
  }

  // ─── Load Data ──────────────────────────────────────────────────────────
  function loadData(callback) {
    var loaded = 0;
    var needed = 5;

    function check() {
      loaded++;
      if (loaded >= needed) callback();
    }

    $.getJSON('./data/lore/maps-index.json', function (data) {
      allMaps = data;
      for (var i = 0; i < allMaps.length; i++) {
        mapById[allMaps[i].id] = allMaps[i];
      }
      check();
    });

    $.getJSON('./data/lore/maps-categories.json', function (data) {
      categories = data;
      for (var i = 0; i < categories.length; i++) {
        catEnabled[categories[i].code] = !DEFAULT_OFF.has(categories[i].code);
      }
      check();
    });

    $.getJSON('./data/lore/maps-links.json', function (data) {
      allLinks = data;
      check();
    });

    // Quest ↔ POI cross-reference (NPC DID → quest list)
    $.getJSON('./data/quest-poi.json', function (data) {
      questPOI = data;
      check();
    }).fail(function () { questPOI = {}; check(); });

    // NPC data for enriched popups
    $.getJSON('./data/npcs.json', function (data) {
      npcData = data;
      check();
    }).fail(function () { npcData = {}; check(); });
  }

  // ─── Populate Map Selector ──────────────────────────────────────────────
  function populateMapSelector() {
    var $sel = $('#map-selector');
    $sel.empty();

    // Group maps by factor ranges for a hierarchical dropdown
    // factor ≈ 1 = continent, 30-60 = region, 60+ = town/instance
    var overviews = [];
    var regions = [];
    var towns = [];

    for (var i = 0; i < allMaps.length; i++) {
      var m = allMaps[i];
      var mapName = cleanGameText(m.name);
      if (!mapName) continue; // skip blank entries
      if (m.factor <= 2) overviews.push(m);
      else if (m.factor <= 65) regions.push(m);
      else towns.push(m);
    }

    overviews.sort(function (a, b) { return cleanGameText(a.name).localeCompare(cleanGameText(b.name)); });
    regions.sort(function (a, b) { return cleanGameText(a.name).localeCompare(cleanGameText(b.name)); });
    towns.sort(function (a, b) { return cleanGameText(a.name).localeCompare(cleanGameText(b.name)); });

    function addGroup(label, maps) {
      if (!maps.length) return;
      var $group = $('<optgroup>').attr('label', label);
      for (var i = 0; i < maps.length; i++) {
        $group.append($('<option>').val(maps[i].id).text(cleanGameText(maps[i].name)));
      }
      $sel.append($group);
    }

    addGroup('Overview Maps', overviews);
    addGroup('Regions', regions);
    addGroup('Towns & Instances', towns);

    $sel.val(MIDDLE_EARTH_ID);
  }

  // ─── Build Category Panel ──────────────────────────────────────────────
  function buildCategoryPanel() {
    var $grid = $('#map-category-grid');
    $grid.empty();

    // Build by group
    var groupNames = Object.keys(CAT_GROUPS);
    for (var g = 0; g < groupNames.length; g++) {
      var groupName = groupNames[g];
      var codes = CAT_GROUPS[groupName];
      var $group = $('<div class="lotro-map-cat-group">');
      $group.append('<div class="lotro-map-cat-group-title">' + groupName + '</div>');

      for (var c = 0; c < codes.length; c++) {
        var code = codes[c];
        // Find category by code
        var cat = null;
        for (var i = 0; i < categories.length; i++) {
          if (categories[i].code === code) { cat = categories[i]; break; }
        }
        if (!cat) continue;

        var checked = catEnabled[code] ? ' checked' : '';
        $group.append(
          '<label class="lotro-map-cat-item">' +
          '<input type="checkbox" data-cat="' + code + '"' + checked + '> ' +
          '<img src="./img/maps/categories/' + cat.icon + '.png" alt=""> ' +
          '<span>' + cat.name + '</span>' +
          '</label>'
        );
      }

      $grid.append($group);
    }
  }

  // ─── Show Map ───────────────────────────────────────────────────────────
  function showMap(mapId, addToHistory) {
    var mapDef = mapById[mapId];
    if (!mapDef) return;

    if (addToHistory && currentMapId && currentMapId !== mapId) {
      mapHistory.push(currentMapId);
    }
    currentMapId = mapId;

    // Compute the coordinate transform for this map
    computeMapTransform(mapDef);

    // Update selector
    $('#map-selector').val(mapId);

    // Update back button
    $('#map-back').prop('disabled', mapHistory.length === 0);

    // Update breadcrumb
    updateBreadcrumb(mapDef);

    // Clear existing layers
    map.removeLayer(markerLayer);
    linkLayer.clearLayers();

    // Rebuild cluster layer — use tighter clustering on interior maps
    var clusterRadius = mapDef.factor > 200 ? 20 : 40;
    markerLayer = createMarkerCluster(clusterRadius);
    map.addLayer(markerLayer);

    // Remove old basemap
    if (basemapLayer) {
      map.removeLayer(basemapLayer);
      basemapLayer = null;
    }

    // Set view bounds
    var bounds = getMapBounds(mapDef);
    map.setMaxBounds(bounds.pad(0.5));
    map.fitBounds(bounds);

    // Try to load basemap image (WebP with PNG fallback)
    var imgUrl = './img/maps/basemaps/' + mapId + '.webp';
    basemapLayer = L.imageOverlay(imgUrl, bounds, { opacity: 0.9 });
    basemapLayer.addTo(map);
    // If image fails to load, try PNG fallback then give up
    basemapLayer.getElement().onerror = function () {
      var el = this;
      if (el.src.endsWith('.webp')) {
        el.src = './img/maps/basemaps/' + mapId + '.png';
      } else {
        map.removeLayer(basemapLayer);
        basemapLayer = null;
      }
    };

    // Load markers
    loadMarkers(mapId);

    // Show navigation links for this map
    showLinks(mapId);

    // Show loading briefly
    showLoading(false);
  }

  // ─── Load Markers ──────────────────────────────────────────────────────
  function loadMarkers(mapId) {
    // Skip markers on the Middle-earth overview — they are misplaced zone-level
    // objects (doors, buckets, NPCs, etc.) that don't belong on the continent view
    if (mapId === MIDDLE_EARTH_ID) {
      renderMarkers([]);
      return;
    }

    if (markerCache[mapId]) {
      renderMarkers(markerCache[mapId]);
      return;
    }

    $.getJSON('./data/lore/map-markers/' + mapId + '.json', function (data) {
      markerCache[mapId] = data;
      renderMarkers(data);
    }).fail(function () {
      // No markers for this map
      markerCache[mapId] = [];
      renderMarkers([]);
    });
  }

  function renderMarkers(markers) {
    markerLayer.clearLayers();
    var count = 0;
    var mapDef = mapById[currentMapId];
    var isRegionMap = mapDef && mapDef.factor > 2 && mapDef.factor <= REGION_MAX_FACTOR;
    // Strict layer enforcement should only apply to interior/instance style maps.
    // Outdoor world/region maps (id 268...) intentionally aggregate child POIs.
    var enforceStrictLayer = mapDef && mapDef.factor > REGION_MAX_FACTOR && String(currentMapId).indexOf('187') === 0;

    for (var i = 0; i < markers.length; i++) {
      var mk = markers[i];
      if (!catEnabled[mk.c]) continue;

      // On detailed maps, hide POIs that belong to other explicit parent zones.
      // Region maps intentionally aggregate child POIs, so keep those unchanged.
      if (enforceStrictLayer && mk.z && String(mk.z) !== String(currentMapId)) continue;

      var latlng = gameToLatLng(mk.lng, mk.lat);
      var icon = getCategoryIcon(mk.c);
      var marker = L.marker(latlng, { icon: icon });

      // Find category name
      var catName = '';
      for (var j = 0; j < categories.length; j++) {
        if (categories[j].code === mk.c) { catName = cleanGameText(categories[j].name); break; }
      }

      // Build popup content — header with icon + title
      var popup = '<div class="lotro-map-popup">' +
        '<div class="lotro-map-popup-header">' +
        '<img class="lotro-map-popup-icon" src="./img/maps/categories/' + mk.c + '.png" alt="">' +
        '<div class="lotro-map-popup-header-text">' +
        '<div class="lotro-map-popup-title">' + escapeHtml(mk.l) + '</div>' +
        '<div class="lotro-map-popup-cat">' + escapeHtml(catName) + '</div>';

      // NPC title
      if (mk.d && npcData && npcData[mk.d] && npcData[mk.d].t) {
        popup += '<div class="lotro-map-popup-npc-title">' + escapeHtml(npcData[mk.d].t) + '</div>';
      }

      popup += '</div></div>';  // close header-text and header

      // Details list
      var hasQuests = mk.d && questPOI && questPOI[mk.d];
      var hasDetails = true; // always show share link
      if (hasDetails) {
        popup += '<ul class="lotro-map-popup-details">';

        // Share location link
        popup += '<li>' +
          '<a href="#" class="lotro-map-share-btn" ' +
          'data-map="' + currentMapId + '" ' +
          'data-lng="' + mk.lng.toFixed(2) + '" ' +
          'data-lat="' + mk.lat.toFixed(2) + '" ' +
          'data-label="' + escapeHtml(mk.l).replace(/"/g, '&quot;') + '">' +
          '<i class="fa fa-share-alt"></i> Share location</a></li>';

        // Quest associations
        if (mk.d && questPOI && questPOI[mk.d]) {
          var quests = questPOI[mk.d];
          var maxShow = Math.min(quests.length, 5);
          for (var q = 0; q < maxShow; q++) {
            var quest = quests[q];
            var roleIcon = quest.r === 'bestower'
              ? '<i class="fa fa-exclamation-circle lotro-popup-quest-bestower"></i> '
              : '<i class="fa fa-book"></i> ';
            popup += '<li>' + roleIcon +
              '<a href="./quests.html?id=' + quest.id + '">' + escapeHtml(quest.n) + '</a></li>';
          }
          if (quests.length > 5) {
            popup += '<li class="lotro-popup-more">+ ' + (quests.length - 5) + ' more quests</li>';
          }
        }

        popup += '</ul>';
      }

      popup += '<div class="lotro-map-popup-coords">' +
        mk.lng.toFixed(1) + ', ' + mk.lat.toFixed(1) + '</div>' +
        '</div>';

      marker.bindPopup(popup);
      markerLayer.addLayer(marker);
      count++;
    }

    $('#map-marker-count').text(count + ' markers');
  }

  // ─── Show Navigation Links ─────────────────────────────────────────────
  function showLinks(mapId) {
    linkLayer.clearLayers();

    for (var i = 0; i < allLinks.length; i++) {
      var link = allLinks[i];
      if (link.from !== mapId) continue;

      var targetMap = mapById[link.to];
      if (!targetMap) continue;

      var latlng = gameToLatLng(link.lng, link.lat);
      var marker = L.marker(latlng, { icon: linkIcon });

      // Build popup with navigation link
      var popup = '<div class="lotro-map-popup lotro-map-popup-link">' +
        '<div class="lotro-map-popup-title">' + escapeHtml(link.label) + '</div>' +
        '<button class="btn btn-sm btn-primary lotro-map-nav-btn" data-target="' + link.to + '">' +
        '<i class="fa fa-map-o"></i> Navigate</button>' +
        '</div>';

      marker.bindPopup(popup);
      linkLayer.addLayer(marker);
    }
  }

  // ─── Update Breadcrumb ─────────────────────────────────────────────────
  function updateBreadcrumb(mapDef) {
    var $bc = $('#map-breadcrumb');
    $bc.empty();
    $bc.append('<li><a href="index.html">Home</a></li>');

    if (mapHistory.length > 0) {
      $bc.append('<li><a href="#" id="bc-map-home">Interactive Map</a></li>');
      $bc.append('<li class="active">' + escapeHtml(mapDef.name) + '</li>');
    } else {
      $bc.append('<li class="active">Interactive Map' +
        (mapDef.name !== 'Middle-earth' ? ' — ' + escapeHtml(mapDef.name) : '') +
        '</li>');
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  function escapeHtml(text) {
    text = cleanGameText(text);
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function cleanGameText(text) {
    if (text === null || text === undefined) return '';
    return String(text)
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

  function showLoading(show) {
    $('#map-loading').toggle(show);
  }

  function showShareFeedback($btn) {
    var orig = $btn.html();
    $btn.html('<i class="fa fa-check"></i> Link copied!');
    $btn.addClass('lotro-map-share-copied');
    setTimeout(function () {
      $btn.html(orig);
      $btn.removeClass('lotro-map-share-copied');
    }, 2000);
  }

  // Navigate to a shared location: show the map, then pan/zoom to the pin
  function goToSharedLocation(mapId, lng, lat, label) {
    showMap(mapId, false);
    // Allow the map to render, then fly to the coordinates and drop a pin
    setTimeout(function () {
      var latlng = gameToLatLng(parseFloat(lng), parseFloat(lat));
      map.setView(latlng, map.getZoom() + 1);
      // Drop a temporary highlight marker
      var pin = L.circleMarker(latlng, {
        radius: 14,
        color: '#C9A84C',
        fillColor: '#FFD700',
        fillOpacity: 0.6,
        weight: 3,
      }).addTo(map);
      pin.bindPopup('<div class="lotro-map-popup"><div class="lotro-map-popup-title">' + escapeHtml(label || 'Shared location') + '</div>' +
        '<div class="lotro-map-popup-coords">' + parseFloat(lng).toFixed(1) + ', ' + parseFloat(lat).toFixed(1) + '</div></div>'
      ).openPopup();
      // Fade out the highlight after 10 seconds
      setTimeout(function () { map.removeLayer(pin); }, 10000);
    }, 300);
  }

  // ─── Event Handlers ────────────────────────────────────────────────────
  function bindEvents() {
    // Map selector change
    $('#map-selector').on('change', function () {
      var mapId = $(this).val();
      if (mapId) showMap(mapId, true);
    });

    // Back button
    $('#map-back').on('click', function () {
      if (mapHistory.length > 0) {
        var prevId = mapHistory.pop();
        showMap(prevId, false);
      }
    });

    // Breadcrumb "Interactive Map" link -> go to Middle-earth
    $(document).on('click', '#bc-map-home', function (e) {
      e.preventDefault();
      mapHistory = [];
      showMap(MIDDLE_EARTH_ID, false);
    });

    // Toggle category panel
    $('#map-toggle-categories').on('click', function () {
      $('#map-category-panel').slideToggle(200);
    });

    // Category checkbox changes
    $(document).on('change', '#map-category-grid input[type="checkbox"]', function () {
      var code = parseInt($(this).data('cat'));
      catEnabled[code] = $(this).is(':checked');
      if (currentMapId && markerCache[currentMapId]) {
        renderMarkers(markerCache[currentMapId]);
      }
    });

    // Select all / none
    $('#cat-select-all').on('click', function () {
      $('#map-category-grid input[type="checkbox"]').prop('checked', true).trigger('change');
    });
    $('#cat-select-none').on('click', function () {
      $('#map-category-grid input[type="checkbox"]').prop('checked', false).trigger('change');
    });

    // Navigation link clicks (from popups)
    $(document).on('click', '.lotro-map-nav-btn', function () {
      var targetId = $(this).data('target').toString();
      map.closePopup();
      showMap(targetId, true);
    });

    // Share location button (copies URL to clipboard)
    $(document).on('click', '.lotro-map-share-btn', function (e) {
      e.preventDefault();
      var $btn = $(this);
      var mapId = $btn.data('map').toString();
      var lng = $btn.data('lng');
      var lat = $btn.data('lat');
      var label = $btn.data('label');
      var url = window.location.origin + window.location.pathname +
        '?map=' + mapId + '&lng=' + lng + '&lat=' + lat;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showShareFeedback($btn);
        });
      } else {
        // Fallback for older browsers
        var tmp = document.createElement('textarea');
        tmp.value = url;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
        showShareFeedback($btn);
      }
    });

    // Quest overlay panel close
    $(document).on('click', '#quest-panel-close', function () {
      clearQuestOverlay();
    });

    // Deed overlay panel close
    $(document).on('click', '#deed-panel-close', function () {
      clearDeedOverlay();
    });

    // Handle URL params for direct linking
    var params = new URLSearchParams(window.location.search);
    var questParam = params.get('quest');
    if (questParam) {
      loadQuestOverlay(questParam);
      return;
    }

    var deedParam = params.get('deed');
    if (deedParam) {
      loadDeedOverlay(deedParam);
      return;
    }

    var mobParam = params.get('mob');
    if (mobParam) {
      loadMobOverlay(mobParam);
      return;
    }

    // Shared location link: ?map=ID&lng=X&lat=Y
    var sharedMap = params.get('map');
    var sharedLng = params.get('lng');
    var sharedLat = params.get('lat');
    if (sharedMap && sharedLng && sharedLat && mapById[sharedMap]) {
      goToSharedLocation(sharedMap, sharedLng, sharedLat);
      return;
    }

    if (window.location.hash) {
      var hashId = window.location.hash.replace('#map=', '');
      if (mapById[hashId]) {
        showMap(hashId, false);
        return;
      }
    }

    showMap(MIDDLE_EARTH_ID, false);
  }

  // ─── Deed Overlay ───────────────────────────────────────────────────────
  function loadDeedOverlay(deedId) {
    if (deedOverlayData) {
      showDeedOverlay(deedId);
      return;
    }
    $.getJSON('./data/deed-overlay.json', function (data) {
      deedOverlayData = data || {};
      showDeedOverlay(deedId);
    });
  }

  function showDeedOverlay(deedId) {
    clearDeedOverlay();
    clearQuestOverlay(); // Clear any active quest overlay

    var deed = deedOverlayData && deedOverlayData[deedId];
    if (!deed || !deed.pts || !deed.pts.length) return;

    activeDeedId = deedId;
    deedOverlayLayer = L.layerGroup();
    map.addLayer(deedOverlayLayer);

    // Show primary map for deed overlay
    var primaryMap = (deed.maps && deed.maps.length) ? deed.maps[0] : deed.pts[0].map;
    if (primaryMap && mapById[primaryMap]) {
      showMap(primaryMap, true);
    }

    // Add objective markers
    for (var i = 0; i < deed.pts.length; i++) {
      var pt = deed.pts[i];
      if (pt.map !== primaryMap) continue;
      var ll = gameToLatLng(pt.lng, pt.lat);
      var divIcon = L.divIcon({
        className: 'deed-objective-icon',
        html: '' + (pt.i || (i + 1)),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });
      var marker = L.marker(ll, { icon: divIcon });
      var popText = '<div class="lotro-map-popup">' +
        '<div class="lotro-map-popup-title">' + escapeHtml(deed.n) + '</div>' +
        '<div class="lotro-map-popup-cat">Objective ' + (pt.i || (i + 1)) + '</div>';
      if (pt.t) {
        popText += '<div style="margin-top:4px;font-size:12px;">' + escapeHtml(pt.t) + '</div>';
      }
      popText += '</div>';
      marker.bindPopup(popText);
      deedOverlayLayer.addLayer(marker);
    }

    // Show deed info panel
    showDeedPanel(deed);
  }

  function clearDeedOverlay() {
    if (deedOverlayLayer) {
      map.removeLayer(deedOverlayLayer);
      deedOverlayLayer = null;
    }
    activeDeedId = null;
    $('#lotro-deed-panel').remove();
  }

  function showDeedPanel(deed) {
    $('#lotro-deed-panel').remove();
    var html = '<div id="lotro-deed-panel" class="lotro-map-deed-panel">' +
      '<span class="close-panel" id="deed-panel-close">&times;</span>' +
      '<h5>' + escapeHtml(deed.n) + '</h5>';
    if (deed.lv) html += '<div style="margin-bottom:6px;font-size:11px;opacity:0.7">Level ' + deed.lv + '</div>';
    if (deed.tp) html += '<div style="margin-bottom:8px;font-size:11px;opacity:0.7">' + escapeHtml(deed.tp) + '</div>';
    for (var i = 0; i < deed.pts.length; i++) {
      var obj = deed.pts[i];
      html += '<div class="deed-objective-step">' +
        '<span class="deed-step-num">' + (obj.i || (i + 1)) + '</span>' +
        escapeHtml(obj.t || 'Objective location') +
        '</div>';
    }
    html += '</div>';
    $('#lotro-map').parent().append(html);
  }

  function loadMobOverlay(mobId) {
    if (mobOverlayData) {
      showMobOverlay(mobId);
      return;
    }
    $.getJSON('./data/mob-overlay.json', function (data) {
      mobOverlayData = data || {};
      showMobOverlay(mobId);
    });
  }

  function showMobOverlay(mobId) {
    clearQuestOverlay();
    clearDeedOverlay();
    var mob = mobOverlayData && mobOverlayData[mobId];
    if (!mob || !mob.map) return;
    goToSharedLocation(mob.map, mob.lng, mob.lat, mob.n || mob.l || 'Mob location');
  }

  // ─── Quest Overlay ───────────────────────────────────────────────────────
  function loadQuestOverlay(questId) {
    if (questOverlayData) {
      showQuestOverlay(questId);
      return;
    }
    $.getJSON('./data/quest-overlay.json', function (data) {
      questOverlayData = data;
      showQuestOverlay(questId);
    });
  }

  function showQuestOverlay(questId) {
    clearQuestOverlay();
    var quest = questOverlayData[questId];
    if (!quest) return;

    activeQuestId = questId;
    questOverlayLayer = L.layerGroup();
    map.addLayer(questOverlayLayer);

    // If quest has map associations, navigate to the first one
    if (quest.maps && quest.maps.length && mapById[quest.maps[0]]) {
      showMap(quest.maps[0], true);
    }

    // Add objective markers
    for (var s = 0; s < quest.steps.length; s++) {
      var step = quest.steps[s];
      for (var p = 0; p < step.pts.length; p++) {
        var pt = step.pts[p];
        var ll = gameToLatLng(pt[0], pt[1]);
        var divIcon = L.divIcon({
          className: 'quest-objective-icon',
          html: '' + step.i,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -12],
        });
        var m = L.marker(ll, { icon: divIcon });
        var popText = '<div class="lotro-map-popup">' +
          '<div class="lotro-map-popup-title">' + escapeHtml(quest.n) + '</div>' +
          '<div class="lotro-map-popup-cat">Objective ' + step.i + '</div>';
        if (step.t) {
          popText += '<div style="margin-top:4px;font-size:12px;">' + escapeHtml(step.t) + '</div>';
        }
        popText += '</div>';
        m.bindPopup(popText);
        questOverlayLayer.addLayer(m);
      }
    }

    // Show quest info panel
    showQuestPanel(quest);
  }

  function clearQuestOverlay() {
    if (questOverlayLayer) {
      map.removeLayer(questOverlayLayer);
      questOverlayLayer = null;
    }
    activeQuestId = null;
    $('#lotro-quest-panel').remove();
  }

  function showQuestPanel(quest) {
    $('#lotro-quest-panel').remove();
    var html = '<div id="lotro-quest-panel" class="lotro-map-quest-panel">' +
      '<span class="close-panel" id="quest-panel-close">&times;</span>' +
      '<h5>' + escapeHtml(quest.n) + '</h5>';
    if (quest.lv) html += '<div style="margin-bottom:6px;font-size:11px;opacity:0.7">Level ' + quest.lv + '</div>';
    for (var i = 0; i < quest.steps.length; i++) {
      var step = quest.steps[i];
      html += '<div class="quest-step">' +
        '<span class="quest-step-num">' + step.i + '</span>' +
        (step.t ? escapeHtml(step.t) : 'Objective ' + step.i) +
        '</div>';
    }
    html += '</div>';
    $('#lotro-map').parent().append(html);
  }

  // ─── Public Init ────────────────────────────────────────────────────────
  window.LOTRO_MAP_INIT = function () {
    showLoading(true);
    initMap();
    loadData(function () {
      populateMapSelector();
      buildCategoryPanel();
      bindEvents();
    });
  };

})();
