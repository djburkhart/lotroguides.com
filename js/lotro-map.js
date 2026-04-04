/**
 * lotro-map.js
 * Interactive map for LotRO Guides using Leaflet with CRS.Simple.
 * Loads map definitions, markers, links, and categories from extracted JSON.
 */
(function () {
  'use strict';

  // CDN base URL injected by build.js as window.LOTRO_CDN (empty when running locally)
  var _CDN = (window.LOTRO_CDN || '').replace(/\/$/, '');
  function cdnUrl(p) { return _CDN ? _CDN + '/' + p : './' + p; }

  // ─── State ──────────────────────────────────────────────────────────────
  var map;
  var allMaps = [];           // All map definitions
  var mapById = {};           // id → map def
  var categories = [];        // Category definitions
  var catEnabled = {};        // category code → enabled
  var allLinks = [];          // All inter-map links
  var linkTargetsKnown = {};  // mapId → true if it has an incoming link from a known map
  var markerLayer;            // MarkerClusterGroup for markers
  var linkLayer;              // LayerGroup for navigation links
  var basemapLayer;           // ImageOverlay for basemap image
  var regionSelectorControl;   // Region selector dropdown control
  var currentLinkCount = 0;   // Visible navigation links on current map
  var currentMapId = null;    // Currently displayed map
  var mapHistory = [];        // Navigation history for back button
  var markerCache = {};       // mapId → marker data array
  var heavyMarkerCache = {};  // mapId → heavy marker data array
  var heavyLoaded = {};       // mapId → true when heavy markers have been fetched
  // Heavy categories are lazy-loaded into separate files to keep default payloads small.
  var HEAVY_CATS = { 50: true, 71: true, 72: true, 77: true, 78: true };

  // Quest enrichment data
  var questPOI = null;        // NPC DID → [{id, n, r}] quest associations
  var npcData = null;         // NPC id → {n, t}
  var mapAreaIcons = {};      // mapId → iconId for area icons

  // Quest overlay state
  var questOverlayData = null;  // Loaded on-demand from quest-overlay.json
  var questOverlayLayer = null; // LayerGroup for quest objective markers
  var activeQuestId = null;     // Currently overlaid quest
  var activeQuestDefaultMap = null; // Resolved map for quests with no explicit map IDs

  // Deed overlay state
  var deedOverlayData = null;   // Loaded on-demand for deed overlays
  var deedOverlayLayer = null;  // LayerGroup for deed objective markers
  var activeDeedId = null;      // Currently overlaid deed

  // Mob overlay state
  var mobOverlayData = null;     // Loaded on-demand for mob locations

  var MIDDLE_EARTH_ID = '268437554';
  var ROHAN_ID = '268453621';
  var REGION_MAX_FACTOR = 65;

  // Some overview maps benefit from a curated navigation set so the player sees
  // the destinations that belong to that overview instead of every neighboring exit.
  var OVERVIEW_LINK_ALLOWLIST = {
    '268449746': {
      '268449749': true,
      '268449752': true,
      '268449755': true,
      '268449758': true,
      '268449761': true
    },
    '268449749': {
      '268448413': true,
      '268449746': true,
      '268449755': true,
      '268450628': true
    },
    '268449752': {
      '268449746': true,
      '268451270': true
    },
    '268449755': {
      '268449746': true,
      '268449749': true,
      '268449758': true,
      '268450628': true
    },
    '268449758': {
      '268449746': true,
      '268449755': true,
      '268449767': true
    },
    '268449761': {
      '268449746': true
    },
    '268449767': {
      '268449758': true,
      '268453893': true
    },
    '268448413': {
      '268448410': true,
      '268448419': true,
      '268448422': true,
      '268449335': true
    },
    '268448416': {
      '268448407': true,
      '268448419': true,
      '268448422': true,
      '268451270': true
    },
    '268448419': {
      '268448407': true,
      '268448413': true,
      '268448416': true,
      '268448422': true,
      '268449335': true
    },
    '268448422': {
      '268448413': true,
      '268448416': true,
      '268448419': true,
      '268448941': true
    },
    '268442355': {
      '268442341': true,
      '268442342': true,
      '268442343': true,
      '268442344': true,
      '268442345': true,
      '268442346': true,
      '268442347': true,
      '268442348': true,
      '268442349': true,
      '268442350': true,
      '268442330': true,
      '268442463': true
    },
    '268437557': {
      '268437576': true,
      '268437592': true,
      '268437603': true,
      '268437615': true,
      '268437634': true,
      '268437653': true,
      '268437678': true,
      '268437691': true,
      '268437700': true,
      '268439511': true,
      '268441431': true,
      '268442268': true,
      '268442355': true,
      '268444443': true,
      '268446977': true,
      '268453922': true,
      '268453997': true,
      '268454004': true
    },
    '268450901': {
      '268450720': true,
      '268450864': true,
      '268450882': true,
      '268450932': true,
      '268450946': true,
      '268451105': true,
      '268451115': true,
      '268451272': true,
      '268454323': true
    },
    '268453619': {
      '268442330': true,
      '268443855': true,
      '268452526': true,
      '268452631': true,
      '268452634': true,
      '268453023': true,
      '268453454': true,
      '268453641': true
    },
    '268453621': {
      '268447051': true,
      '268447390': true,
      '268448407': true,
      '268448410': true,
      '268448413': true,
      '268448416': true,
      '268448419': true,
      '268448422': true,
      '268449335': true,
      '268449746': true,
      '268449749': true,
      '268449752': true,
      '268449755': true,
      '268449758': true,
      '268449761': true,
      '268449767': true
    },
    '268453620': {
      '268452166': true,
      '268453364': true,
      '268451973': true
    }
  };

  var MAP_SPECIFIC_DEFAULT_OFF = {
    '268449749': { 43: true, 74: true },
    '268449752': { 43: true, 74: true },
    '268449755': { 43: true, 74: true },
    '268448413': { 43: true, 74: true },
    '268448416': { 43: true, 74: true },
    '268448419': { 43: true, 74: true },
    '268448422': { 43: true, 74: true },
    '268448407': { 43: true, 74: true },
    '268449335': { 43: true, 74: true },
    '268449746': { 43: true, 74: true },
    '268449758': { 43: true, 74: true }
  };

  // Category groups for easier toggling
  var CAT_GROUPS = {
    'Travel': [22, 23, 24, 48, 51, 55],
    'Services': [29, 33, 34, 38, 40, 42, 45, 53, 54, 58, 60, 61, 63],
    'Places': [21, 30, 31, 41, 43, 57, 74, 100],
    'NPCs': [2, 27, 56, 70],
    'Landscape': [50, 71, 72, 73, 77, 78],
  };

  // Default-off categories (too noisy if enabled by default)
  var DEFAULT_OFF = new Set([2, 27, 39, 50, 56, 70, 71, 72, 73, 77, 78, 100]);

  // ─── Icon Factory ───────────────────────────────────────────────────────
  var iconCache = {};

  function getCategoryIcon(catCode) {
    if (iconCache[catCode]) return iconCache[catCode];
    var icon = L.icon({
      iconUrl: cdnUrl('img/maps/categories/' + catCode + '.png'),
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

  function latLngToGame(latlng) {
    return {
      lng: latlng.lng / mapScale + mapOrigin.lng,
      lat: latlng.lat / mapScale + mapOrigin.lat
    };
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
      'Data from <a href="https://lotroguides.com/" target="_blank" rel="noopener">LotRO Guides</a>'
    );

    markerLayer = createMarkerCluster(40);
    map.addLayer(markerLayer);

    linkLayer = L.layerGroup();
    map.addLayer(linkLayer);
  }
  
  // ─── Region Selector Control ────────────────────────────────────────────
  function createRegionSelector() {
    var RegionSelectorControl = L.Control.extend({
      onAdd: function(map) {
        var div = L.DomUtil.create('div', 'leaflet-control-region-selector');
        
        var select = L.DomUtil.create('select', 'region-dropdown', div);
        select.style.fontSize = '14px';
        select.style.padding = '4px 8px';
        select.style.border = '1px solid #ccc';
        select.style.borderRadius = '3px';
        select.style.backgroundColor = '#fff';
        select.style.cursor = 'pointer';
        
        // Populate dropdown with maps
        this.populateDropdown(select);
        
        // Handle selection changes
        L.DomEvent.on(select, 'change', function() {
          var mapId = select.value;
          if (mapId && mapId !== currentMapId) {
            showMap(mapId, true);
          }
        });
        
        // Prevent map interaction when using dropdown
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
      },
      
      populateDropdown: function(select) {
        // Clear existing options
        select.innerHTML = '';
        
        // Add default option
        var defaultOption = L.DomUtil.create('option', '', select);
        defaultOption.value = '';
        defaultOption.text = 'Navigate to Region...';
        
        // Group maps by factor ranges for hierarchical dropdown
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

        var addGroup = function(label, maps) {
          if (!maps.length) return;
          var group = L.DomUtil.create('optgroup', '', select);
          group.label = label;
          for (var i = 0; i < maps.length; i++) {
            var option = L.DomUtil.create('option', '', group);
            option.value = maps[i].id;
            option.text = cleanGameText(maps[i].name);
          }
        };

        addGroup('Overview Maps', overviews);
        addGroup('Regions', regions);
        addGroup('Towns & Instances', towns);
      },
      
      updateSelection: function(mapId) {
        var select = this.getContainer().querySelector('select');
        if (select) {
          select.value = mapId || '';
        }
      }
    });
    
    return new RegionSelectorControl({ position: 'topright' });
  }

  // ─── Load Data ──────────────────────────────────────────────────────────
  function loadData(callback) {
    var loaded = 0;
    var needed = 6;

    function check() {
      loaded++;
      if (loaded >= needed) callback();
    }

    $.getJSON(cdnUrl('data/lore/maps-index.json'), function (data) {
      allMaps = data;
      for (var i = 0; i < allMaps.length; i++) {
        mapById[allMaps[i].id] = allMaps[i];
      }
      check();
    });

    $.getJSON(cdnUrl('data/lore/maps-categories.json'), function (data) {
      categories = data;
      for (var i = 0; i < categories.length; i++) {
        catEnabled[categories[i].code] = !DEFAULT_OFF.has(categories[i].code);
      }
      check();
    });

    $.getJSON(cdnUrl('data/lore/maps-links.json'), function (data) {
      allLinks = data;
      // Pre-build set of maps that already have an incoming link from a known map.
      // Used in showLinks to skip false auto-links for maps reachable elsewhere.
      for (var li = 0; li < allLinks.length; li++) {
        if (mapById[allLinks[li].from]) linkTargetsKnown[allLinks[li].to] = true;
      }
      check();
    });

    // Map area icons (mapId → iconId)
    $.getJSON(cdnUrl('data/lore/maps-area-icons.json'), function (data) {
      mapAreaIcons = data || {};
      check();
    }).fail(function () { mapAreaIcons = {}; check(); });

    // Quest ↔ POI cross-reference (NPC DID → quest list)
    $.getJSON(cdnUrl('data/quest-poi.json'), function (data) {
      questPOI = data;
      check();
    }).fail(function () { questPOI = {}; check(); });

    // NPC data for enriched popups
    $.getJSON(cdnUrl('data/npcs.json'), function (data) {
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
          '<img src="' + cdnUrl('img/maps/categories/' + cat.icon + '.png') + '" alt=""> ' +
          '<span>' + cat.name + '</span>' +
          '</label>'
        );
      }

      $grid.append($group);
    }
  }

  function resetCategoryDefaults(mapId) {
    var mapSpecificOff = MAP_SPECIFIC_DEFAULT_OFF[mapId] || {};

    for (var i = 0; i < categories.length; i++) {
      var code = categories[i].code;
      catEnabled[code] = !DEFAULT_OFF.has(code) && !mapSpecificOff[code];
    }
  }

  function syncCategoryPanel() {
    $('#map-category-grid input[type="checkbox"]').each(function () {
      var code = parseInt($(this).data('cat'));
      $(this).prop('checked', !!catEnabled[code]);
    });
  }

  // ─── Show Map ───────────────────────────────────────────────────────────
  function showMap(mapId, addToHistory) {
    var mapDef = mapById[mapId];
    if (!mapDef) return;

    if (addToHistory && currentMapId && currentMapId !== mapId) {
      mapHistory.push(currentMapId);
    }
    currentMapId = mapId;

    resetCategoryDefaults(mapId);
    syncCategoryPanel();

    // Compute the coordinate transform for this map
    computeMapTransform(mapDef);

    // Update selector
    $('#map-selector').val(mapId);
    
    // Update region selector control
    if (regionSelectorControl) {
      regionSelectorControl.updateSelection(mapId);
    }

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

    // Compute per-map maxZoom based on image resolution.
    // At zoom 0, 1 CRS unit = 1 pixel. Bounds span ~REF_SPAN units.
    // Native resolution zoom = log2(imageWidth / REF_SPAN).
    // Allow 1.5 extra zoom levels beyond native for slight upscale.
    var maxZ = 6; // absolute ceiling
    if (mapDef.w) {
      var nativeZoom = Math.log2(mapDef.w / REF_SPAN);
      maxZ = Math.min(6, Math.ceil((nativeZoom + 1.5) * 2) / 2); // round to nearest 0.5
      if (maxZ < 1) maxZ = 1; // minimum useful zoom
    }
    map.setMaxZoom(maxZ);

    map.fitBounds(bounds);
    
    // In embed mode, zoom in a bit more for better viewing
    if (document.body.classList.contains('lotro-map-embed-mode')) {
      map.setZoom(map.getZoom() + 1);
    }

    // Try to load basemap image (WebP with PNG fallback)
    var imgUrl = cdnUrl('img/maps/basemaps/' + mapId + '.webp');
    basemapLayer = L.imageOverlay(imgUrl, bounds, { opacity: 0.9 });
    basemapLayer.addTo(map);
    // If image fails to load, try PNG fallback then give up
    basemapLayer.getElement().onerror = function () {
      var el = this;
      if (el.src.indexOf('.webp') !== -1) {
        el.src = cdnUrl('img/maps/basemaps/' + mapId + '.png');
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
      renderAllMarkers(mapId);
      return;
    }

    $.getJSON(cdnUrl('data/lore/map-markers/' + mapId + '.json'), function (data) {
      markerCache[mapId] = data;
      renderAllMarkers(mapId);
    }).fail(function () {
      // No markers for this map
      markerCache[mapId] = [];
      renderAllMarkers(mapId);
    });
  }

  // Check if any heavy category is currently enabled
  function anyHeavyCatEnabled() {
    for (var code in HEAVY_CATS) {
      if (catEnabled[parseInt(code)]) return true;
    }
    return false;
  }

  // Load heavy markers for the current map (lazy, on-demand)
  function loadHeavyMarkers(mapId, callback) {
    if (heavyLoaded[mapId]) {
      callback(heavyMarkerCache[mapId] || []);
      return;
    }
    $.getJSON(cdnUrl('data/lore/map-markers-heavy/' + mapId + '.json'), function (data) {
      heavyMarkerCache[mapId] = data;
      heavyLoaded[mapId] = true;
      callback(data);
    }).fail(function () {
      heavyMarkerCache[mapId] = [];
      heavyLoaded[mapId] = true;
      callback([]);
    });
  }

  // Render standard markers, plus heavy markers if any heavy category is on
  function renderAllMarkers(mapId) {
    var standard = markerCache[mapId] || [];
    if (anyHeavyCatEnabled()) {
      loadHeavyMarkers(mapId, function (heavy) {
        renderMarkers(standard.concat(heavy));
      });
    } else {
      renderMarkers(standard);
    }
  }

  function renderMarkers(markers) {
    markerLayer.clearLayers();
    var count = 0;
    var mapDef = mapById[currentMapId];
    if (!mapDef) return;
    var isRegionMap = mapDef && mapDef.factor > 2 && mapDef.factor <= REGION_MAX_FACTOR;
    // Strict layer enforcement should only apply to interior/instance style maps.
    // Outdoor world/region maps (id 268...) intentionally aggregate child POIs.
    var enforceStrictLayer = mapDef && mapDef.factor > REGION_MAX_FACTOR && String(currentMapId).indexOf('187') === 0;

    for (var i = 0; i < markers.length; i++) {
      var mk = markers[i];
      if (!catEnabled[mk.c]) continue;

        // Guard against leaked child/interior POIs that use a different coordinate
        // space from the current basemap. These otherwise render far off-map.
        if (mk.lng < mapDef.min.lng || mk.lng > mapDef.max.lng ||
          mk.lat < mapDef.min.lat || mk.lat > mapDef.max.lat) continue;

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
          '<img class="lotro-map-popup-icon" src="' + cdnUrl('img/maps/categories/' + mk.c + '.png') + '" alt="">' +
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
              '<a href="./quests?id=' + quest.id + '">' + escapeHtml(quest.n) + '</a></li>';
          }
          if (quests.length > 5) {
            popup += '<li class="lotro-popup-more">+ ' + (quests.length - 5) + ' more quests</li>';
          }
        }

        popup += '</ul>';
        
        // Action buttons
        popup += '<div class="lotro-map-popup-actions">' +
          '<a href="#" class="lotro-map-share-btn" ' +
          'data-map="' + currentMapId + '" ' +
          'data-lng="' + mk.lng.toFixed(2) + '" ' +
          'data-lat="' + mk.lat.toFixed(2) + '" ' +
          'data-label="' + escapeHtml(mk.l).replace(/"/g, '&quot;') + '">' +
          '<i class="fa fa-share-alt"></i> Share</a>' +
          '<a href="#" class="lotro-map-embed-btn" ' +
          'data-map="' + currentMapId + '" ' +
          'data-lng="' + mk.lng.toFixed(2) + '" ' +
          'data-lat="' + mk.lat.toFixed(2) + '" ' +
          'data-label="' + escapeHtml(mk.l).replace(/"/g, '&quot;') + '">' +
          '<i class="fa fa-code"></i> Embed</a>' +
          '</div>';
      }

      popup += '<div class="lotro-map-popup-coords">' +
        mk.lng.toFixed(1) + ', ' + mk.lat.toFixed(1) + '</div>' +
        '</div>';

      marker.bindPopup(popup);
      markerLayer.addLayer(marker);
      count++;
    }

    if (count === 0 && mapDef.factor <= 2 && currentLinkCount > 0) {
      $('#map-marker-count').text(currentLinkCount + ' links');
    } else {
      $('#map-marker-count').text(count + ' markers');
    }
  }

  // ─── Show Navigation Links ─────────────────────────────────────────────
  function addLinkMarker(latlng, label, targetId) {
    var popup = '<div class="lotro-map-popup lotro-map-popup-link">' +
      '<div class="lotro-map-popup-title">' + escapeHtml(label) + '</div>' +
      '<button class="btn btn-sm btn-primary lotro-map-nav-btn" data-target="' + targetId + '">' +
      '<i class="fa fa-map-o"></i> Navigate</button>' +
      '</div>';
    var marker = L.marker(latlng, { icon: linkIcon });
    marker.bindPopup(popup);
    linkLayer.addLayer(marker);
    currentLinkCount++;
  }

  function showLinks(mapId) {
    linkLayer.clearLayers();
    currentLinkCount = 0;
    var allowedTargets = OVERVIEW_LINK_ALLOWLIST[mapId] || null;
    var explicitTargets = {};

    for (var i = 0; i < allLinks.length; i++) {
      var link = allLinks[i];
      if (link.from !== mapId) continue;
      if (allowedTargets && !allowedTargets[link.to]) continue;
      if (!mapById[link.to]) continue;

      addLinkMarker(gameToLatLng(link.lng, link.lat), link.label, link.to);
      explicitTargets[link.to] = true;
    }

    // For region maps, also auto-generate link icons for spatially-contained child maps
    // (towns/instances) that have no explicit link entry. To avoid false positives from
    // LOTRO's overlapping bounding boxes, only add a child to its SMALLEST containing region.
    var currentMapDef = mapById[mapId];
    var REGION_MAX_FACTOR = 65;
    var OVERVIEW_MAX_FACTOR = 2;
    if (currentMapDef && currentMapDef.min &&
        currentMapDef.factor > OVERVIEW_MAX_FACTOR && currentMapDef.factor <= REGION_MAX_FACTOR) {
      // Pre-collect region maps for the "smallest containing region" check
      var regionMaps = allMaps.filter(function (m) {
        return m.min && m.factor > OVERVIEW_MAX_FACTOR && m.factor <= REGION_MAX_FACTOR;
      });

      for (var j = 0; j < allMaps.length; j++) {
        var child = allMaps[j];
        if (!child.min || child.factor <= REGION_MAX_FACTOR) continue; // only towns/instances
        if (explicitTargets[child.id]) continue;
        // Skip maps already reachable from another map's explicit link
        if (linkTargetsKnown[child.id]) continue;

        // Child must be fully contained within the current map
        if (child.min.lng < currentMapDef.min.lng || child.max.lng > currentMapDef.max.lng ||
            child.min.lat < currentMapDef.min.lat || child.max.lat > currentMapDef.max.lat) continue;

        // Find the smallest-area region that fully contains this child —
        // this is the region the child "belongs" to, preventing overlap bleed.
        var bestArea = Infinity;
        var bestRegionId = null;
        for (var r = 0; r < regionMaps.length; r++) {
          var reg = regionMaps[r];
          if (child.min.lng < reg.min.lng || child.max.lng > reg.max.lng ||
              child.min.lat < reg.min.lat || child.max.lat > reg.max.lat) continue;
          var area = (reg.max.lng - reg.min.lng) * (reg.max.lat - reg.min.lat);
          if (area < bestArea) { bestArea = area; bestRegionId = reg.id; }
        }
        if (bestRegionId !== mapId) continue;

        // Place the link icon at the child map's geographic center
        var cx = (child.min.lng + child.max.lng) / 2;
        var cy = (child.min.lat + child.max.lat) / 2;
        addLinkMarker(gameToLatLng(cx, cy), cleanGameText(child.name), child.id);
      }
    }

    if (mapId === ROHAN_ID && currentLinkCount > 0) {
      $('#map-marker-count').text(currentLinkCount + ' links');
    }
  }

  // ─── Update Breadcrumb ─────────────────────────────────────────────────
  function updateBreadcrumb(mapDef) {
    var $bc = $('#map-breadcrumb');
    $bc.empty();
    $bc.append('<li><a href="./">Home</a></li>');

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

  function showEmbedFeedback($btn) {
    var orig = $btn.html();
    $btn.html('<i class="fa fa-check"></i> Code copied!');
    $btn.addClass('lotro-map-embed-copied');
    setTimeout(function () {
      $btn.html(orig);
      $btn.removeClass('lotro-map-embed-copied');
    }, 2000);
  }

  // Navigate to a shared location: show the map, then pan/zoom to the pin
  function goToSharedLocation(mapId, lng, lat, label, zoom) {
    showMap(mapId, false);
    // Allow the map to render, then fly to the coordinates and drop a pin
    setTimeout(function () {
      var latlng = gameToLatLng(parseFloat(lng), parseFloat(lat));
      var z = zoom ? parseInt(zoom, 10) : map.getZoom() + 1;
      map.setView(latlng, z);
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

    // Right-click on the map goes back a level
    map.getContainer().addEventListener('contextmenu', function (e) {
      e.preventDefault();
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
        renderAllMarkers(currentMapId);
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

    // Embed map button (copies iframe code to clipboard)
    $(document).on('click', '.lotro-map-embed-btn', function (e) {
      e.preventDefault();
      var $btn = $(this);
      var mapId = $btn.data('map').toString();
      var lng = $btn.data('lng');
      var lat = $btn.data('lat');
      var embedUrl = window.location.origin + window.location.pathname +
        '?embed=1&map=' + mapId + '&lng=' + lng + '&lat=' + lat;
      var iframeCode = '<iframe src="' + embedUrl + '" width="800" height="600" frameborder="0" style="border:1px solid #ccc; border-radius:4px;" allowfullscreen></iframe>';

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(iframeCode).then(function () {
          showEmbedFeedback($btn);
        });
      } else {
        // Fallback for older browsers
        var tmp = document.createElement('textarea');
        tmp.value = iframeCode;
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
        showEmbedFeedback($btn);
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

    // Deed overlay — switch map when clicking an off-map objective
    $(document).on('click', '.deed-objective-offmap', function () {
      var targetMap = $(this).data('deed-switch-map');
      if (targetMap) switchDeedMap(String(targetMap));
    });

    // Deed overlay — pan to objective when clicking an on-map step
    $(document).on('click', '.deed-objective-onmap', function () {
      var lng = parseFloat($(this).data('pan-lng'));
      var lat = parseFloat($(this).data('pan-lat'));
      if (!isNaN(lng) && !isNaN(lat)) {
        var ll = gameToLatLng(lng, lat);
        map.setView(ll, map.getZoom() + 1, { animate: true });
      }
    });

    // Quest overlay — switch map when clicking an off-map objective
    $(document).on('click', '.quest-step-offmap', function () {
      var targetMap = $(this).data('quest-switch-map');
      var panLng = parseFloat($(this).data('pan-lng'));
      var panLat = parseFloat($(this).data('pan-lat'));
      if (targetMap) switchQuestMap(String(targetMap), panLng, panLat);
    });

    // Quest overlay — pan to objective when clicking an on-map step
    $(document).on('click', '.quest-step-onmap', function () {
      var lng = parseFloat($(this).data('pan-lng'));
      var lat = parseFloat($(this).data('pan-lat'));
      if (!isNaN(lng) && !isNaN(lat)) {
        var ll = gameToLatLng(lng, lat);
        map.setView(ll, map.getZoom() + 1, { animate: true });
      }
    });

    // Handle URL params for direct linking
    var params = new URLSearchParams(window.location.search);

    // Embed mode: hide site chrome when loaded in an iframe
    if (params.get('embed') === '1') {
      document.body.classList.add('lotro-map-embed-mode');
      // Remove any classes that might add padding-top
      document.body.classList.remove('fixed-header', 'search-open', 'search-active');
      // Remove header and other chrome from DOM entirely
      var headerEl = document.getElementById('header');
      if (headerEl) headerEl.parentNode.removeChild(headerEl);
      var footerEl = document.getElementById('footer');
      if (footerEl) footerEl.parentNode.removeChild(footerEl);
      var breadcrumbsEl = document.querySelector('.breadcrumbs');
      if (breadcrumbsEl) breadcrumbsEl.parentNode.removeChild(breadcrumbsEl);
      // Ensure no scroll offset at top
      window.scrollTo(0, 0);
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
      }
    }

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

    // Shared location link: ?map=ID&lng=X&lat=Y[&z=Z]
    var sharedMap = params.get('map');
    var sharedLng = params.get('lng');
    var sharedLat = params.get('lat');
    var sharedZoom = params.get('z');
    if (sharedMap && sharedLng && sharedLat && mapById[sharedMap]) {
      goToSharedLocation(sharedMap, sharedLng, sharedLat, null, sharedZoom);
      return;
    }

    // Direct map link: ?map=ID (without coords)
    if (sharedMap && mapById[sharedMap]) {
      showMap(sharedMap, false);
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
    $.getJSON(cdnUrl('data/deed-overlay.json'), function (data) {
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

    // Render markers for the current map
    renderDeedMarkers(deed, currentMapId);

    // Show deed info panel
    showDeedPanel(deed);
  }

  /**
   * Render deed objective markers for only the given map.
   * Called on initial load and when switching maps via the panel.
   */
  function renderDeedMarkers(deed, targetMapId) {
    if (!deedOverlayLayer) return;
    deedOverlayLayer.clearLayers();

    for (var i = 0; i < deed.pts.length; i++) {
      var pt = deed.pts[i];
      if (pt.map !== targetMapId) continue;
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
  }

  /**
   * Switch the deed overlay to a different map when the user clicks an
   * off-map objective in the panel.
   */
  function switchDeedMap(targetMapId) {
    var deed = deedOverlayData && deedOverlayData[activeDeedId];
    if (!deed) return;

    if (mapById[targetMapId]) {
      showMap(targetMapId, true);
    }

    renderDeedMarkers(deed, currentMapId);
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

    // Determine which maps this deed spans
    var deedMaps = {};
    for (var i = 0; i < deed.pts.length; i++) {
      deedMaps[deed.pts[i].map] = true;
    }
    var isMultiMap = Object.keys(deedMaps).length > 1;

    var html = '<div id="lotro-deed-panel" class="lotro-map-deed-panel">' +
      '<span class="close-panel" id="deed-panel-close">&times;</span>' +
      '<h5>' + escapeHtml(deed.n) + '</h5>';
    if (deed.lv) html += '<div style="margin-bottom:6px;font-size:11px;opacity:0.7">Level ' + deed.lv + '</div>';
    if (deed.tp) html += '<div style="margin-bottom:8px;font-size:11px;opacity:0.7">' + escapeHtml(deed.tp) + '</div>';

    for (var i = 0; i < deed.pts.length; i++) {
      var obj = deed.pts[i];
      var onCurrentMap = obj.map === currentMapId;
      var stepNum = obj.i || (i + 1);

      if (!onCurrentMap && isMultiMap) {
        // Off-map objective — render as a clickable link to switch maps
        var targetName = (mapById[obj.map] && mapById[obj.map].name)
          ? cleanGameText(mapById[obj.map].name)
          : 'Another map';
        html += '<div class="deed-objective-step deed-objective-offmap" data-deed-switch-map="' + obj.map + '">' +
          '<span class="deed-step-num deed-step-num-offmap">' + stepNum + '</span>' +
          '<span class="deed-objective-text">' + escapeHtml(obj.t || 'Objective location') + '</span>' +
          '<span class="deed-objective-map-hint"><i class="fa fa-map-o"></i> ' + escapeHtml(targetName) + '</span>' +
          '</div>';
      } else {
        // On-map objective — clickable to pan to location
        var panLng = obj.lng || null;
        var panLat = obj.lat || null;
        html += '<div class="deed-objective-step deed-objective-onmap" data-pan-lng="' + panLng + '" data-pan-lat="' + panLat + '">' +
          '<span class="deed-step-num">' + stepNum + '</span>' +
          escapeHtml(obj.t || 'Objective location') +
          '</div>';
      }
    }
    html += '</div>';
    $('#lotro-map').parent().append(html);
  }

  function loadMobOverlay(mobId) {
    if (mobOverlayData) {
      showMobOverlay(mobId);
      return;
    }
    $.getJSON(cdnUrl('data/mob-overlay.json'), function (data) {
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
  /**
   * Find the best map for a quest by scanning point coordinates against map bounds.
   * Returns the map whose bounding box is smallest (most specific) and contains
   * the first quest point. Overview maps (factor ≤ 2) are excluded.
   */
  function resolveQuestPrimaryMap(quest) {
    // Explicit maps[] entry
    if (quest.maps && quest.maps.length) return quest.maps[0];
    // Explicit map ID on individual points
    for (var s = 0; s < quest.steps.length; s++) {
      for (var p = 0; p < quest.steps[s].pts.length; p++) {
        if (quest.steps[s].pts[p][2]) return quest.steps[s].pts[p][2];
      }
    }
    // Coordinate lookup: find smallest map bounding box containing first point
    var firstPt = null;
    for (var si = 0; si < quest.steps.length; si++) {
      if (quest.steps[si].pts.length > 0) { firstPt = quest.steps[si].pts[0]; break; }
    }
    if (!firstPt) return null;
    var lng = firstPt[0], lat = firstPt[1];
    var best = null, bestArea = Infinity;
    for (var i = 0; i < allMaps.length; i++) {
      var m = allMaps[i];
      if (m.factor <= 2) continue;
      if (lng < m.min.lng || lng > m.max.lng || lat < m.min.lat || lat > m.max.lat) continue;
      var area = (m.max.lng - m.min.lng) * (m.max.lat - m.min.lat);
      if (area < bestArea) { bestArea = area; best = m.id; }
    }
    return best;
  }

  function loadQuestOverlay(questId) {
    // questOverlayData is a partial cache: {questId → questData}.
    // We fetch only the specific quest file (~650 bytes) instead of the full 7.9 MB monolith.
    if (questOverlayData && questOverlayData[questId]) {
      showQuestOverlay(questId);
      return;
    }
    if (!questOverlayData) questOverlayData = {};
    $.getJSON(cdnUrl('data/lore/quests/' + questId + '.json'), function (data) {
      questOverlayData[questId] = data;
      showQuestOverlay(questId);
    }).fail(function () {
      console.warn('Quest overlay not found:', questId);
    });
  }

  function showQuestOverlay(questId) {
    clearQuestOverlay();
    clearDeedOverlay(); // Clear any active deed overlay
    var quest = questOverlayData[questId];
    if (!quest) return;

    activeQuestId = questId;
    questOverlayLayer = L.layerGroup();
    map.addLayer(questOverlayLayer);

    // Resolve the primary map (explicit → point-level → coordinate lookup)
    activeQuestDefaultMap = resolveQuestPrimaryMap(quest);
    if (activeQuestDefaultMap && mapById[activeQuestDefaultMap]) {
      showMap(activeQuestDefaultMap, true);
    }

    // Render markers for the current map
    renderQuestMarkers(quest, currentMapId);

    // Show quest info panel
    showQuestPanel(quest);
  }

  /**
   * Render quest objective markers for only the given map.
   * Points format: [lng, lat] or [lng, lat, mapId].
   * Points without a mapId are assumed to belong to maps[0].
   */
  function renderQuestMarkers(quest, targetMapId) {
    if (!questOverlayLayer) return;
    questOverlayLayer.clearLayers();

    var defaultMap = (quest.maps && quest.maps.length) ? quest.maps[0] : activeQuestDefaultMap;

    for (var s = 0; s < quest.steps.length; s++) {
      var step = quest.steps[s];
      for (var p = 0; p < step.pts.length; p++) {
        var pt = step.pts[p];
        var ptMap = pt[2] || defaultMap;
        if (ptMap && ptMap !== targetMapId) continue;

        var ll = gameToLatLng(pt[0], pt[1]);

        // Quest area circle highlight
        if (step.kz) {
          // Scale radius proportionally to map size (~3% of reference span)
          var qaRadius = 0.03 * REF_SPAN;
          var circle = L.circle(ll, {
            radius: qaRadius,
            color: '#e74c3c',
            fillColor: '#e74c3c',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '6 4',
            interactive: true,
          });
          var areaLabel = step.kz.n || step.t || 'Quest area';
          var areaPop = '<div class="lotro-map-popup">' +
            '<div class="lotro-map-popup-title"><i class="fa fa-crosshairs"></i> Quest Area</div>' +
            '<div style="margin-top:4px;font-size:12px;">' + escapeHtml(areaLabel) + '</div>';
          if (step.kz.c > 1) {
            areaPop += '<div style="margin-top:2px;font-size:11px;opacity:0.7">Defeat ' + step.kz.c + '</div>';
          }
          areaPop += '</div>';
          circle.bindPopup(areaPop);
          questOverlayLayer.addLayer(circle);
        }

        var divIcon = L.divIcon({
          className: step.kz ? 'quest-objective-icon quest-kill-icon' : 'quest-objective-icon',
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
  }

  /**
   * Switch the quest overlay to a different map when the user clicks an
   * off-map objective in the panel.
   */
  function switchQuestMap(targetMapId, panLng, panLat) {
    var quest = questOverlayData && questOverlayData[activeQuestId];
    if (!quest) return;

    if (mapById[targetMapId]) {
      showMap(targetMapId, true);
    }

    renderQuestMarkers(quest, currentMapId);
    showQuestPanel(quest);

    // Pan to the objective after switching maps
    if (panLng !== undefined && panLat !== undefined && !isNaN(panLng) && !isNaN(panLat)) {
      var ll = gameToLatLng(panLng, panLat);
      map.setView(ll, map.getZoom() + 1, { animate: true });
    }
  }

  function clearQuestOverlay() {
    if (questOverlayLayer) {
      map.removeLayer(questOverlayLayer);
      questOverlayLayer = null;
    }
    activeQuestId = null;
    activeQuestDefaultMap = null;
    $('#lotro-quest-panel').remove();
  }

  function showQuestPanel(quest) {
    $('#lotro-quest-panel').remove();

    // Determine which maps this quest's points span
    var defaultMap = (quest.maps && quest.maps.length) ? quest.maps[0] : activeQuestDefaultMap;
    var questMaps = {};
    for (var s = 0; s < quest.steps.length; s++) {
      var step = quest.steps[s];
      for (var p = 0; p < step.pts.length; p++) {
        var ptMap = step.pts[p][2] || defaultMap;
        if (ptMap) questMaps[ptMap] = true;
      }
    }

    var html = '<div id="lotro-quest-panel" class="lotro-map-quest-panel">' +
      '<span class="close-panel" id="quest-panel-close">&times;</span>' +
      '<h5>' + escapeHtml(quest.n) + '</h5>';
    if (quest.lv) html += '<div style="margin-bottom:6px;font-size:11px;opacity:0.7">Level ' + quest.lv + '</div>';

    for (var i = 0; i < quest.steps.length; i++) {
      var step = quest.steps[i];
      var stepText = step.t ? escapeHtml(step.t) : 'Objective ' + step.i;

      // Determine which map(s) this step's points are on.
      // A point is "on current" if its explicit mapId matches OR its coordinates
      // fall within the current map's bounding box (handles quests with no explicit mapIds).
      var currentMapDef = mapById[currentMapId];
      var onCurrent = false;
      var offMapId = null;
      var offPanLng = null, offPanLat = null;
      for (var p = 0; p < step.pts.length; p++) {
        var ptMap = step.pts[p][2] || defaultMap;
        var ptLng = step.pts[p][0], ptLat = step.pts[p][1];
        var withinCurrent = currentMapDef && currentMapDef.min &&
          ptLng >= currentMapDef.min.lng && ptLng <= currentMapDef.max.lng &&
          ptLat >= currentMapDef.min.lat && ptLat <= currentMapDef.max.lat;
        if (ptMap === currentMapId || !ptMap || withinCurrent) {
          onCurrent = true;
        } else if (!offMapId) {
          offMapId = ptMap;
          offPanLng = ptLng;
          offPanLat = ptLat;
        }
      }

      if (!onCurrent && offMapId) {
        // Off-map objective — clickable to switch maps and pan to objective
        var targetName = (mapById[offMapId] && mapById[offMapId].name)
          ? cleanGameText(mapById[offMapId].name)
          : 'Another map';
        html += '<div class="quest-step quest-step-offmap" data-quest-switch-map="' + offMapId + '"' +
          ' data-pan-lng="' + offPanLng + '" data-pan-lat="' + offPanLat + '">' +
          '<span class="quest-step-num quest-step-num-offmap">' + step.i + '</span>' +
          '<span class="quest-step-text">' + stepText + '</span>' +
          '<span class="quest-step-map-hint"><i class="fa fa-map-o"></i> ' + escapeHtml(targetName) + '</span>' +
          '</div>';
      } else {
        // On-map objective — clickable to pan to first on-map point
        var panLng = null, panLat = null;
        for (var pp = 0; pp < step.pts.length; pp++) {
          var ppMap = step.pts[pp][2] || defaultMap;
          var ppLng = step.pts[pp][0], ppLat = step.pts[pp][1];
          var ppWithin = currentMapDef && currentMapDef.min &&
            ppLng >= currentMapDef.min.lng && ppLng <= currentMapDef.max.lng &&
            ppLat >= currentMapDef.min.lat && ppLat <= currentMapDef.max.lat;
          if (ppMap === currentMapId || !ppMap || ppWithin) {
            panLng = ppLng;
            panLat = ppLat;
            break;
          }
        }
        if (panLng === null && step.pts[0]) { panLng = step.pts[0][0]; panLat = step.pts[0][1]; }
        var areaBadge = step.kz ? ' <span class="quest-kill-badge"><i class="fa fa-crosshairs"></i>' + (step.kz.c > 1 ? ' ×' + step.kz.c : '') + '</span>' : '';
        html += '<div class="quest-step quest-step-onmap' + (step.kz ? ' quest-step-kill' : '') + '" data-pan-lng="' + panLng + '" data-pan-lat="' + panLat + '">' +
          '<span class="quest-step-num' + (step.kz ? ' quest-step-num-kill' : '') + '">' + step.i + '</span>' +
          stepText + areaBadge +
          '</div>';
      }
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
      
      // Add region selector control to map
      regionSelectorControl = createRegionSelector();
      map.addControl(regionSelectorControl);

      // Add share location control
      map.addControl(createShareControl());
    });
  };

  // ─── Share Location Control ──────────────────────────────────────────
  function createShareControl() {
    var ShareControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        var container = L.DomUtil.create('div', 'leaflet-control-share leaflet-bar');
        var btn = L.DomUtil.create('a', 'leaflet-control-share-btn', container);
        btn.href = '#';
        btn.title = 'Share this map view';
        btn.setAttribute('role', 'button');
        btn.innerHTML = '<i class="fa fa-share-alt"></i>';

        var toast = L.DomUtil.create('div', 'leaflet-control-share-toast', container);
        toast.textContent = 'Link copied!';

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(btn, 'click', function (e) {
          L.DomEvent.preventDefault(e);
          var center = map.getCenter();
          var game = latLngToGame(center);
          var zoom = map.getZoom();
          var url = window.location.origin + window.location.pathname +
            '?map=' + encodeURIComponent(currentMapId) +
            '&lng=' + game.lng.toFixed(1) +
            '&lat=' + game.lat.toFixed(1) +
            '&z=' + zoom;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              showToast(toast);
            });
          } else {
            // Fallback for older browsers
            var input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showToast(toast);
          }
        });

        return container;
      }
    });

    function showToast(el) {
      el.classList.add('visible');
      setTimeout(function () { el.classList.remove('visible'); }, 2000);
    }

    return new ShareControl();
  }

})();
