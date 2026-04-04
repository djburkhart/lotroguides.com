/* ═══════════════════════════════════════════════════════════════════════════
   LOTRO Trait Planner — Interactive trait point allocator
   Renders interactive trait tree widgets with point allocation capabilities.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Game constants ────────────────────────────────────────────────────── */
  var MILESTONE_THRESHOLDS = [0, 5, 10, 15, 20, 25, 30, 35];
  var MAX_TREE_POINTS = 35;   // Maximum points in single tree
  var DEFAULT_LEVEL = 160;    // Default character level
  
  /* ── Available classes ─────────────────────────────────────────────────── */
  var LOTRO_CLASSES = {
    'beorning': 'Beorning',
    'brawler': 'Brawler', 
    'burglar': 'Burglar',
    'captain': 'Captain',
    'champion': 'Champion',
    'guardian': 'Guardian', 
    'hunter': 'Hunter',
    'lore-master': 'Lore-master',
    'mariner': 'Mariner',
    'minstrel': 'Minstrel',
    'rune-keeper': 'Rune-keeper',
    'warden': 'Warden'
  };
  
  /* ── Trait point progression by level (based on LOTRO data) ────────────── */
  var TRAIT_POINT_PROGRESSION = {
    // Early levels (1-15): Base trait points from leveling
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2,
    11: 3, 12: 3, 13: 3, 14: 3, 15: 4, 16: 4, 17: 4, 18: 4, 19: 5, 20: 5,
    
    // Mid levels (21-50): Continued progression plus deed rewards
    21: 6, 22: 6, 23: 7, 24: 7, 25: 8, 26: 9, 27: 10, 28: 11, 29: 12, 30: 13,
    31: 14, 32: 15, 33: 16, 34: 17, 35: 18, 36: 19, 37: 20, 38: 21, 39: 22, 40: 23,
    41: 24, 42: 25, 43: 26, 44: 27, 45: 28, 46: 29, 47: 30, 48: 31, 49: 32, 50: 33,
    
    // High levels (51-85): Instance and region deed trait points
    51: 34, 52: 35, 53: 36, 54: 37, 55: 38, 56: 39, 57: 40, 58: 41, 59: 42, 60: 43,
    61: 44, 62: 45, 63: 46, 64: 47, 65: 48, 66: 49, 67: 50, 68: 51, 69: 52, 70: 53,
    71: 54, 72: 55, 73: 56, 74: 57, 75: 58, 76: 59, 77: 60, 78: 61, 79: 62, 80: 63,
    81: 64, 82: 65, 83: 66, 84: 67, 85: 68,
    
    // End-game levels (86-160+): Full progression including all content
    86: 69, 87: 70, 88: 71, 89: 72, 90: 73, 91: 74, 92: 75, 93: 76, 94: 77, 95: 78,
    96: 79, 97: 80, 98: 81, 99: 82, 100: 83, 105: 86, 110: 89, 115: 92, 120: 94,
    125: 96, 130: 97, 135: 98, 140: 98, 145: 98, 150: 98, 155: 98, 160: 98
  };
  
  function getTraitPointsAtLevel(level) {
    // Handle levels beyond our progression table
    if (level >= 160) return 98;
    if (level <= 1) return 1;
    
    // Find the trait points for the specified level
    var exactMatch = TRAIT_POINT_PROGRESSION[level];
    if (exactMatch !== undefined) return exactMatch;
    
    // Interpolate between known values for missing levels
    var lowerLevel = 1;
    var upperLevel = 160;
    
    for (var l = level - 1; l >= 1; l--) {
      if (TRAIT_POINT_PROGRESSION[l] !== undefined) {
        lowerLevel = l;
        break;
      }
    }
    
    for (var u = level + 1; u <= 160; u++) {
      if (TRAIT_POINT_PROGRESSION[u] !== undefined) {
        upperLevel = u;
        break;
      }
    }
    
    // Linear interpolation between known points
    var lowerPoints = TRAIT_POINT_PROGRESSION[lowerLevel];
    var upperPoints = TRAIT_POINT_PROGRESSION[upperLevel];
    var levelDiff = upperLevel - lowerLevel;
    var pointDiff = upperPoints - lowerPoints;
    var ratio = (level - lowerLevel) / levelDiff;
    
    return Math.floor(lowerPoints + (pointDiff * ratio));
  }

  /* ── Global planner state ─ */
  var currentData = null;
  var currentBuild = null;
  var currentBuildKey = null;
  var currentLevel = DEFAULT_LEVEL;  // Character level for trait point calculation
  var classDataCache = {};  // Cache loaded class JSON to avoid re-fetching
  
  function getMilestoneThreshold(row) {
    return MILESTONE_THRESHOLDS[row] || 0;
  }
  
  function getMaxTotalPoints() {
    return getTraitPointsAtLevel(currentLevel);
  }
  
  function getTotalSpentPoints() {
    if (!currentBuild) return 0;
    var total = 0;
    if (currentData && currentData.trees && currentBuild.points) {
      currentData.trees.forEach(function (tree) {
        tree.traits.forEach(function (trait) {
          if (!trait.milestone) {
            total += (currentBuild.points[trait.id] || 0);
          }
        });
      });
    }
    return total;
  }
  
  function getTreeSpentPoints(treeId) {
    if (!currentBuild || !currentData || !currentBuild.points) return 0;
    var spent = 0;
    var tree = currentData.trees.find(function (t) { return t.id === treeId; });
    if (tree) {
      tree.traits.forEach(function (trait) {
        if (!trait.milestone) {
          spent += (currentBuild.points[trait.id] || 0);
        }
      });
    }
    return spent;
  }
  
  function canAllocatePoint(traitId) {
    if (!currentBuild || !currentData) return false;
    
    // Find the trait
    var trait = null;
    var treeId = null;
    for (var i = 0; i < currentData.trees.length; i++) {
      var tree = currentData.trees[i];
      trait = tree.traits.find(function (t) { return t.id === traitId; });
      if (trait) {
        treeId = tree.id;
        break;
      }
    }
    
    if (!trait || trait.milestone) return false;
    
    var currentRank = (currentBuild.points && currentBuild.points[traitId]) || 0;
    var totalSpent = getTotalSpentPoints();
    var treeSpent = getTreeSpentPoints(treeId);
    
    // Check constraints
    if (currentRank >= trait.maxRank) return false;  // Already maxed
    if (totalSpent >= getMaxTotalPoints()) return false; // Level-based total cap reached
    if (treeSpent >= MAX_TREE_POINTS) return false;   // Tree cap reached
    
    return true;
  }
  
  function canDeallocatePoint(traitId) {
    if (!currentBuild || !currentBuild.points) return false;
    var currentRank = currentBuild.points[traitId] || 0;
    return currentRank > 0;
  }
  
  function allocatePoint(traitId) {
    if (!canAllocatePoint(traitId)) return false;
    
    if (!currentBuild.points) currentBuild.points = {};
    currentBuild.points[traitId] = (currentBuild.points[traitId] || 0) + 1;
    
    // Add visual feedback animation
    var traitCells = document.querySelectorAll('.ltp-cell[data-trait-id="' + traitId + '"]');
    traitCells.forEach(function(cell) {
      cell.classList.remove('point-removed');
      cell.classList.add('point-allocated');
      setTimeout(function() {
        cell.classList.remove('point-allocated');
      }, 400);
    });
    
    updatePlannerDisplay();
    return true;
  }
  
  function deallocatePoint(traitId) {
    if (!canDeallocatePoint(traitId)) return false;
    
    var currentRank = currentBuild.points[traitId] || 0;
    if (currentRank > 1) {
      currentBuild.points[traitId] = currentRank - 1;
    } else {
      delete currentBuild.points[traitId];
    }
    
    // Add visual feedback animation
    var traitCells = document.querySelectorAll('.ltp-cell[data-trait-id="' + traitId + '"]');
    traitCells.forEach(function(cell) {
      cell.classList.remove('point-allocated');
      cell.classList.add('point-removed');
      setTimeout(function() {
        cell.classList.remove('point-removed');
      }, 300);
    });
    
    updatePlannerDisplay();
    return true;
  }
  
  function resetAllPoints() {
    if (!currentBuild) return;
    currentBuild.points = {};
    updatePlannerDisplay();
  }

  /* ── Render a single trait tree panel ─────────────────────────────────── */
  function renderTree(tree, buildPoints, isMainSpec, cdnBase) {
    var spent = 0;
    var maxRows = 0;
    tree.traits.forEach(function (t) {
      if (t.row > maxRows) maxRows = t.row;
      var pts = buildPoints[t.id] || 0;
      if (!t.milestone) spent += pts;
    });

    var panel = document.createElement('div');
    panel.className = 'ltp-tree' + (isMainSpec ? ' ltp-tree-main' : '');
    panel.style.borderTopColor = tree.color;
    panel.setAttribute('data-tree-id', tree.id);

    /* Header */
    var header = document.createElement('div');
    header.className = 'ltp-tree-header';
    
    var treeSpent = getTreeSpentPoints(tree.id);
    
    header.innerHTML = '<span class="ltp-tree-name" style="color:' + tree.color + '">' + tree.name + '</span>'
      + '<span class="ltp-tree-role">' + tree.role + '</span>'
      + '<span class="ltp-tree-counter" data-tree="' + tree.id + '">Ranks earned: ' + treeSpent + '/' + MAX_TREE_POINTS + '</span>';
    panel.appendChild(header);

    /* Progression milestones */
    if (tree.progression && tree.progression.length) {
      var progressEl = document.createElement('div');
      progressEl.className = 'ltp-progression';
      
      tree.progression.forEach(function (milestone) {
        var unlocked = spent >= milestone.points;
        var milestoneEl = document.createElement('div');
        milestoneEl.className = 'ltp-milestone' + (unlocked ? ' ltp-milestone-active' : '');
        milestoneEl.title = milestone.name + ' (' + milestone.points + ' points)';
        
        var icon = document.createElement('div');
        icon.className = 'ltp-milestone-icon';
        
        if (milestone && milestone.iconId) {
          /* Capture milestone data in closure to prevent null reference errors */
          var milestoneIconId = milestone.iconId;
          var milestoneName = milestone.name;
          
          var img = document.createElement('img');
          img.className = 'ltp-milestone-icon-img';
          img.src = (window.LOTRO_CDN || cdnBase) + 'img/traits/' + milestoneIconId + '.png';
          img.alt = milestoneName;
          img.onerror = function () {
            /* Try skills directory as fallback */
            var skillImg = document.createElement('img');
            skillImg.className = 'ltp-milestone-icon-img';
            skillImg.src = (window.LOTRO_CDN || cdnBase) + 'img/skills/' + milestoneIconId + '.png';
            skillImg.alt = milestoneName;
            skillImg.onerror = function () {
              /* Final fallback to abbreviation */
              var abbr = milestoneName.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
              icon.innerHTML = '<span class="ltp-milestone-abbr">' + abbr + '</span>';
            };
            icon.innerHTML = '';
            icon.appendChild(skillImg);
          };
          icon.appendChild(img);
        } else {
          /* Handle cases where milestone has no iconId */
          var abbr = (milestone && milestone.name) ? milestone.name.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase() : '??';
          icon.innerHTML = '<span class="ltp-milestone-abbr">' + abbr + '</span>';
        }
        
        var points = document.createElement('div');
        points.className = 'ltp-milestone-points';
        points.textContent = milestone.points;
        
        milestoneEl.appendChild(icon);
        milestoneEl.appendChild(points);
        progressEl.appendChild(milestoneEl);
      });
      
      panel.appendChild(progressEl);
    }

    /* Grid */
    var grid = document.createElement('div');
    grid.className = 'ltp-grid';

    /* Auto-detect column range for this tree */
    var allCols = tree.traits.map(function (t) { return t.col; });
    var minCol = Math.min.apply(null, allCols);
    var maxCol = Math.max.apply(null, allCols);
    var colCount = maxCol - minCol + 1;

    for (var r = 1; r <= maxRows; r++) {
      var rowTraits = tree.traits.filter(function (t) { return t.row === r; });
      var rowEl = document.createElement('div');
      rowEl.className = 'ltp-row';

      /* Create cells array based on actual column range */
      var cells = new Array(colCount).fill(null);
      rowTraits.forEach(function (t) {
        var cellIndex = t.col - minCol;
        if (cellIndex >= 0 && cellIndex < colCount) {
          cells[cellIndex] = t;
        }
      });

      for (var c = 0; c < colCount; c++) {
        var t = cells[c];
        var cell = document.createElement('div');
        cell.className = 'ltp-cell';

        if (!t) {
          cell.className += ' ltp-cell-empty';
        } else {
          var pts = buildPoints[t.id] || 0;
          var isMilestone = !!t.milestone;
          var milestoneUnlocked = isMilestone && spent >= getMilestoneThreshold(t.row);
          var isRanked = !isMilestone && pts > 0;
          
          cell.setAttribute('data-trait-id', t.id);
          cell.setAttribute('data-trait-name', t.name);
          cell.setAttribute('data-max-rank', t.maxRank || 1);
          
          if (isMilestone) {
            cell.className += ' ltp-cell-milestone';
            if (milestoneUnlocked) cell.className += ' ltp-cell-active';
          } else if (isRanked) {
            cell.className += ' ltp-cell-active';
            if (pts >= t.maxRank) cell.className += ' ltp-cell-maxed';
          } else {
            cell.className += ' ltp-cell-empty-trait';
          }
          
          // Add interactivity for non-milestone traits
          if (!isMilestone) {
            cell.style.cursor = 'pointer';
            cell.setAttribute('data-trait-id', t.id);
            cell.setAttribute('data-can-allocate', canAllocatePoint(t.id) ? 'true' : 'false');
            
            // Capture trait data in closure to avoid null reference errors
            (function(traitId, traitName) {
              cell.addEventListener('click', function (e) {
                e.preventDefault();
                if (e.shiftKey || e.ctrlKey) {
                  var success = deallocatePoint(traitId);
                  if (success) {
                    console.log('Deallocated point from ' + traitName + ', new rank: ' + ((currentBuild.points[traitId] || 0)));
                  }
                } else {
                  var success = allocatePoint(traitId);
                  if (success) {
                    console.log('Allocated point to ' + traitName + ', new rank: ' + (currentBuild.points[traitId] || 0));
                  }
                }
              });
              
              cell.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                var success = deallocatePoint(traitId);
                if (success) {
                  console.log('Right-click deallocated point from ' + traitName);
                }
              });
            })(t.id, t.name);
          }

          /* Icon */
          var icon = document.createElement('div');
          icon.className = 'ltp-icon';
          
          // Enhanced tooltip matching ilovefriedorc.com format
          var tooltipText = t.name;
          if (!isMilestone) {
            var rankText = pts + '/' + t.maxRank;
            var isMaxed = pts >= t.maxRank;
            var statusText = isMaxed ? ' (Maxed)' : (pts > 0 ? ' (Active)' : ' (Available)');
            
            tooltipText = t.name + ' ' + rankText + statusText;
            if (t.maxRank > 1) {
              tooltipText += '\n\nRank: ' + pts + ' of ' + t.maxRank;
              if (pts > 0 && pts < t.maxRank) {
                tooltipText += '\nNext rank available at this tier';
              } else if (isMaxed) {
                tooltipText += '\nFully trained';
              }
            }
            
            // Add interaction help
            if (!isMaxed && canAllocatePoint(t.id)) {
              tooltipText += '\n\nClick to allocate point';
            }
            if (pts > 0) {
              tooltipText += '\nRight-click or Shift+click to remove point';
            }
          } else {
            var unlocked = milestoneUnlocked ? 'Unlocked' : 'Locked';
            var reqPoints = getMilestoneThreshold(t.row);
            tooltipText = t.name + ' (Milestone)\n\nStatus: ' + unlocked;
            if (!milestoneUnlocked) {
              tooltipText += '\nRequires: ' + reqPoints + ' points in this tree';
            }
          }
          icon.title = tooltipText;

          if (t && t.iconId) {
            /* Capture trait data in closure to prevent null reference errors */
            var traitIconId = t.iconId;
            var traitName = t.name;
            
            var img = document.createElement('img');
            img.className = 'ltp-icon-img';
            img.src = (window.LOTRO_CDN || cdnBase) + 'img/traits/' + traitIconId + '.png';
            img.alt = traitName;
            img.onerror = function () {
              /* Try skills directory as fallback */
              var skillImg = document.createElement('img');
              skillImg.className = 'ltp-icon-img';
              skillImg.src = (window.LOTRO_CDN || cdnBase) + 'img/skills/' + traitIconId + '.png';
              skillImg.alt = traitName;
              skillImg.onerror = function () {
                /* Final fallback to abbreviation */
                var abbr = traitName.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase();
                icon.innerHTML = '<span class="ltp-icon-abbr">' + abbr + '</span>';
              };
              icon.innerHTML = '';
              icon.appendChild(skillImg);
            };
            icon.appendChild(img);
          } else {
            /* Handle cases where trait has no iconId */
            var abbr = (t && t.name) ? t.name.split(' ').map(function (w) { return w.charAt(0); }).join('').substring(0, 2).toUpperCase() : '??';
            icon.innerHTML = '<span class="ltp-icon-abbr">' + abbr + '</span>';
          }
          cell.appendChild(icon);

          /* Name and rank display */
          var nameEl = document.createElement('div');
          nameEl.className = 'ltp-trait-name';
          nameEl.textContent = t.name;
          cell.appendChild(nameEl);

          /* Enhanced rank badge matching reference site */
          if (!isMilestone && t.maxRank > 0) {
            var badge = document.createElement('div');
            badge.className = 'ltp-badge ltp-rank-' + Math.min(pts, t.maxRank);
            badge.setAttribute('data-trait', t.id);
            badge.textContent = pts + '/' + t.maxRank;
            cell.appendChild(badge);
          }
        }
        rowEl.appendChild(cell);
      }
      grid.appendChild(rowEl);
    }
    panel.appendChild(grid);

    return panel;
  }

  /* ── All available virtues ────────────────────────────────────────────── */
  var ALL_VIRTUES = [
    'Charity','Compassion','Confidence','Determination','Discipline',
    'Empathy','Fidelity','Fortitude','Honesty','Honour','Idealism',
    'Innocence','Justice','Loyalty','Mercy','Patience','Tolerance',
    'Valour','Wisdom','Wit','Zeal'
  ];
  var MAX_VIRTUE_SLOTS = 5;

  /* ── Render editable virtues row ──────────────────────────────────────── */
  function renderVirtues(virtues, cdnBase) {
    // Ensure exactly MAX_VIRTUE_SLOTS slots, filling with nulls
    var slots = [];
    for (var i = 0; i < MAX_VIRTUE_SLOTS; i++) {
      slots.push((virtues && virtues[i]) ? virtues[i] : null);
    }

    var wrap = document.createElement('div');
    wrap.className = 'ltp-virtues';
    wrap.innerHTML = '<span class="ltp-virtues-label"><i class="fa fa-shield"></i> Virtues</span>';

    slots.forEach(function (v, slotIndex) {
      var virtueEl = document.createElement('div');
      virtueEl.className = 'ltp-virtue' + (v ? '' : ' ltp-virtue-empty');
      virtueEl.setAttribute('data-slot', slotIndex);
      virtueEl.title = v ? v + ' (click to change)' : 'Click to select a virtue';
      virtueEl.style.cursor = 'pointer';

      if (v) {
        var icon = document.createElement('img');
        icon.className = 'ltp-virtue-icon';
        icon.src = (window.LOTRO_CDN || cdnBase) + 'img/icons/virtues/' + v.toLowerCase() + '.webp';
        icon.alt = v;
        icon.onerror = function () {
          this.parentNode.innerHTML = '<span class="ltp-virtue-fallback">' + v.charAt(0) + '</span>' +
            '<span class="ltp-virtue-name">' + v + '</span>';
        };
        virtueEl.appendChild(icon);

        var nameLabel = document.createElement('span');
        nameLabel.className = 'ltp-virtue-name';
        nameLabel.textContent = v;
        virtueEl.appendChild(nameLabel);
      } else {
        virtueEl.innerHTML = '<span class="ltp-virtue-fallback ltp-virtue-plus">+</span>' +
          '<span class="ltp-virtue-name">Empty</span>';
      }

      virtueEl.addEventListener('click', function (e) {
        e.stopPropagation();
        openVirtuePicker(slotIndex, virtueEl, cdnBase);
      });

      wrap.appendChild(virtueEl);
    });
    return wrap;
  }

  /* ── Virtue picker dropdown ───────────────────────────────────────────── */
  function openVirtuePicker(slotIndex, anchorEl, cdnBase) {
    // Close any existing picker
    closeVirtuePicker();

    var selected = currentBuild.virtues || [];
    var overlay = document.createElement('div');
    overlay.className = 'ltp-virtue-picker-overlay';
    overlay.addEventListener('click', function () { closeVirtuePicker(); });

    var picker = document.createElement('div');
    picker.className = 'ltp-virtue-picker';
    picker.id = 'ltpVirtuePicker';

    var header = document.createElement('div');
    header.className = 'ltp-virtue-picker-header';
    header.innerHTML = '<span>Select Virtue</span>' +
      '<button class="ltp-virtue-picker-close" title="Close">&times;</button>';
    header.querySelector('button').addEventListener('click', function () { closeVirtuePicker(); });
    picker.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'ltp-virtue-picker-grid';

    ALL_VIRTUES.forEach(function (name) {
      var isSelected = selected.indexOf(name) !== -1;
      var isCurrent = selected[slotIndex] === name;
      var item = document.createElement('div');
      item.className = 'ltp-virtue-picker-item' +
        (isCurrent ? ' ltp-virtue-picker-current' : '') +
        (isSelected && !isCurrent ? ' ltp-virtue-picker-used' : '');
      item.title = isSelected && !isCurrent ? name + ' (already in slot ' + (selected.indexOf(name) + 1) + ')' : name;

      var icon = document.createElement('img');
      icon.src = (window.LOTRO_CDN || cdnBase) + 'img/icons/virtues/' + name.toLowerCase() + '.webp';
      icon.alt = name;
      icon.className = 'ltp-virtue-picker-icon';
      item.appendChild(icon);

      var label = document.createElement('span');
      label.className = 'ltp-virtue-picker-name';
      label.textContent = name;
      item.appendChild(label);

      item.addEventListener('click', function (e) {
        e.stopPropagation();
        selectVirtue(slotIndex, name, cdnBase);
        closeVirtuePicker();
      });

      grid.appendChild(item);
    });

    // Clear button
    var clearRow = document.createElement('div');
    clearRow.className = 'ltp-virtue-picker-clear';
    clearRow.innerHTML = '<button class="ltp-virtue-picker-clear-btn"><i class="fa fa-times"></i> Clear Slot</button>';
    clearRow.querySelector('button').addEventListener('click', function (e) {
      e.stopPropagation();
      selectVirtue(slotIndex, null, cdnBase);
      closeVirtuePicker();
    });

    picker.appendChild(grid);
    picker.appendChild(clearRow);

    // Position picker near anchor
    overlay.appendChild(picker);
    document.body.appendChild(overlay);

    // Position relative to anchor
    var rect = anchorEl.getBoundingClientRect();
    var pickerH = 380;
    var top = rect.bottom + 8;
    if (top + pickerH > window.innerHeight) {
      top = rect.top - pickerH - 8;
      if (top < 0) top = 10;
    }
    var left = rect.left + rect.width / 2 - 160;
    if (left < 10) left = 10;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
    picker.style.position = 'fixed';
    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
  }

  function closeVirtuePicker() {
    var existing = document.querySelector('.ltp-virtue-picker-overlay');
    if (existing) existing.remove();
  }

  function selectVirtue(slotIndex, name, cdnBase) {
    if (!currentBuild) return;
    if (!currentBuild.virtues) currentBuild.virtues = [];

    // Ensure array has enough slots
    while (currentBuild.virtues.length < MAX_VIRTUE_SLOTS) {
      currentBuild.virtues.push(null);
    }

    // If selecting a virtue already in another slot, swap
    if (name) {
      var existingIdx = currentBuild.virtues.indexOf(name);
      if (existingIdx !== -1 && existingIdx !== slotIndex) {
        currentBuild.virtues[existingIdx] = currentBuild.virtues[slotIndex];
      }
    }

    currentBuild.virtues[slotIndex] = name;

    // Re-render virtues section
    var container = document.querySelector('.ltp-virtues');
    if (container) {
      var newVirtues = renderVirtues(currentBuild.virtues, cdnBase);
      container.replaceWith(newVirtues);
    }

    // Dispatch change event
    document.dispatchEvent(new CustomEvent('traitPlannerChanged', {
      detail: {
        class: currentData.class,
        build: currentBuildKey,
        level: currentLevel,
        points: Object.assign({}, currentBuild.points || {}),
        virtues: currentBuild.virtues.slice()
      },
      bubbles: true
    }));
  }
  
  /* ── Update display after point allocation changes ───────────────────── */
  function updatePlannerDisplay() {
    if (!currentData || !currentBuild || !currentBuildKey) return;
    
    // More efficient update - just update counters and badges instead of full re-render
    var totalSpent = getTotalSpentPoints();
    var maxPoints = getMaxTotalPoints();
    var pointsAvailable = maxPoints - totalSpent;
    
    // Update main point counters
    var availableEls = document.querySelectorAll('.ltp-points-available');
    availableEls.forEach(function (el) { el.textContent = pointsAvailable; });
    
    var spentEls = document.querySelectorAll('.ltp-points-spent');
    spentEls.forEach(function (el) { el.textContent = totalSpent; });
    
    var maxEls = document.querySelectorAll('.ltp-max-points');
    maxEls.forEach(function (el) { el.textContent = maxPoints; });
    
    // Update tree-specific counters
    currentData.trees.forEach(function (tree) {
      var treeSpent = getTreeSpentPoints(tree.id);
      var treeCounters = document.querySelectorAll('.ltp-tree-counter[data-tree="' + tree.id + '"]');
      treeCounters.forEach(function (el) {
        el.textContent = 'Ranks earned: ' + treeSpent + '/' + MAX_TREE_POINTS;
      });
    });
    
    // Update trait badges and states
    currentData.trees.forEach(function (tree) {
      tree.traits.forEach(function (trait) {
        var currentPoints = currentBuild.points[trait.id] || 0;
        var isMilestone = !!trait.milestone;
        
        // Update trait badges
        var traitBadges = document.querySelectorAll('.ltp-badge[data-trait="' + trait.id + '"]');
        traitBadges.forEach(function (badge) {
          badge.textContent = currentPoints + '/' + trait.maxRank;
          badge.className = 'ltp-badge ltp-rank-' + Math.min(currentPoints, trait.maxRank);
        });
        
        // Update trait cell visual states
        var traitCells = document.querySelectorAll('.ltp-cell[data-trait-id="' + trait.id + '"]');
        traitCells.forEach(function (cell) {
          // Reset classes
          cell.className = 'ltp-cell';
          
          if (isMilestone) {
            cell.classList.add('ltp-cell-milestone');
            var treeSpent = getTreeSpentPoints(tree.id);
            var milestoneUnlocked = treeSpent >= getMilestoneThreshold(trait.row);
            if (milestoneUnlocked) {
              cell.classList.add('ltp-cell-active');
            }
          } else {
            var isMaxed = currentPoints >= trait.maxRank;
            var hasPoints = currentPoints > 0;
            
            if (hasPoints) {
              cell.classList.add('ltp-cell-active');
            }
            if (isMaxed) {
              cell.classList.add('ltp-cell-maxed');
            }
            if (!hasPoints) {
              cell.classList.add('ltp-cell-empty-trait');
            }
            
            // Update interactivity attributes
            cell.setAttribute('data-can-allocate', canAllocatePoint(trait.id) ? 'true' : 'false');
            
            // Update tooltip
            var tooltipText = trait.name;
            var rankText = currentPoints + '/' + trait.maxRank;
            var statusText = isMaxed ? ' (Maxed)' : (hasPoints ? ' (Active)' : ' (Available)');
            
            tooltipText = trait.name + ' ' + rankText + statusText;
            if (trait.maxRank > 1) {
              tooltipText += '\n\nRank: ' + currentPoints + ' of ' + trait.maxRank;
              if (currentPoints > 0 && currentPoints < trait.maxRank) {
                tooltipText += '\nNext rank available at this tier';
              } else if (isMaxed) {
                tooltipText += '\nFully trained';
              }
            }
            
            if (!isMaxed && canAllocatePoint(trait.id)) {
              tooltipText += '\n\nClick to allocate point';
            }
            if (currentPoints > 0) {
              tooltipText += '\nRight-click or Shift+click to remove point';
            }
            
            cell.title = tooltipText;
          }
        });
      });
    });

    // Dispatch change event for Skills page integration
    document.dispatchEvent(new CustomEvent('traitPlannerChanged', {
      detail: {
        class: currentData.class,
        build: currentBuildKey,
        level: currentLevel,
        points: Object.assign({}, currentBuild.points || {}),
        virtues: currentBuild.virtues ? currentBuild.virtues.slice() : []
      },
      bubbles: true
    }));
  }

  /* ── Render class selector ────────────────────────────────────────────── */
  function renderClassSelector(container, currentClass, cdnBase) {
    var selectorHtml = '<div class="ltp-class-selector">' +
      '<label for="class-select"><i class="fa fa-users"></i> Class:</label>' +
      '<select id="class-select" class="ltp-class-select">';
    
    for (var classKey in LOTRO_CLASSES) {
      var selected = classKey === currentClass ? ' selected' : '';
      selectorHtml += '<option value="' + classKey + '"' + selected + '>' + LOTRO_CLASSES[classKey] + '</option>';
    }
    
    selectorHtml += '</select>' +
      '<button class="ltp-load-class-btn" title="Load selected class"><i class="fa fa-sync"></i> Load</button>' +
      '</div>';
    
    return selectorHtml;
  }
  
  /* ── Render class selector ───────────────────────────────────────────── */
  function renderClassSelector(currentClass, cdnBase) {
    var selectorHtml = '<div class="ltp-class-selector">' +
      '<label for="class-select"><i class="fa fa-users"></i> Class:</label>' +
      '<select class="ltp-class-select">';
    
    for (var classKey in LOTRO_CLASSES) {
      var selected = classKey === currentClass ? ' selected' : '';
      selectorHtml += '<option value="' + classKey + '"' + selected + '>' + LOTRO_CLASSES[classKey] + '</option>';
    }
    
    selectorHtml += '</select>' +
      '<button class="ltp-load-class-btn" title="Load selected class"><i class="fa fa-sync"></i> Load</button>' +
      '</div>';
    
    return selectorHtml;
  }
  
  function loadClassData(container, className, buildKey, level, cdnBase) {
    // Use cached data if available for instant switching
    if (classDataCache[className]) {
      var data = JSON.parse(JSON.stringify(classDataCache[className])); // deep copy
      if (level && data.builds[buildKey]) {
        data.builds[buildKey].level = parseInt(level) || DEFAULT_LEVEL;
      }
      renderPlanner(container, data, buildKey, cdnBase);
      return;
    }

    var url = cdnBase + 'data/builds/' + className + '.json';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          classDataCache[className] = JSON.parse(JSON.stringify(data)); // cache a clean copy
          
          // Set level if provided
          if (level && data.builds[buildKey]) {
            data.builds[buildKey].level = parseInt(level) || DEFAULT_LEVEL;
          }
          
          renderPlanner(container, data, buildKey, cdnBase);
        } catch (e) {
          container.innerHTML = '<p class="text-warning">Failed to parse ' + LOTRO_CLASSES[className] + ' trait data.</p>';
        }
      } else {
        container.innerHTML = '<p class="text-warning">Trait data not available for ' + LOTRO_CLASSES[className] + '.</p>';
      }
    };
    xhr.onerror = function () {
      container.innerHTML = '<p class="text-warning">Failed to load ' + LOTRO_CLASSES[className] + ' trait data.</p>';
    };
    xhr.send();
  }
  
  /* ── Main render function ─────────────────────────────────────────────── */
  function renderPlanner(container, data, buildKey, cdnBase) {
    var build = data.builds[buildKey];
    if (!build) {
      container.innerHTML = '<p class="text-danger">Build "' + buildKey + '" not found in ' + data.class + ' data.</p>';
      return;
    }
    
    // Clear existing content before rendering to prevent duplicates
    container.innerHTML = '';
    container.setAttribute('data-initialized', 'true');
    
    // Initialize points if not present for interactive mode
    if (!build.points) {
      build.points = {};
    }
    
    // Initialize level from build data or use default
    currentLevel = build.level || DEFAULT_LEVEL;
    
    // Set global state FIRST before rendering
    currentData = data;
    currentBuild = build;
    currentBuildKey = buildKey;
    
    /* Main controls header */
    var totalSpent = getTotalSpentPoints();
    var maxPoints = getMaxTotalPoints();
    var pointsAvailable = maxPoints - totalSpent;
    
    var controlsHeader = document.createElement('div');
    controlsHeader.className = 'ltp-controls-header';
    controlsHeader.innerHTML = 
      renderClassSelector(data.class, cdnBase) +
      '<div class="ltp-level-controls">' +
        '<label class="ltp-level-label">Character Level:</label>' +
        '<select class="ltp-level-select" id="ltp-level-' + buildKey + '">' +
        '</select>' +
      '</div>' +
      '<div class="ltp-points-display">' +
        'Points Available: <span class="ltp-points-available">' + pointsAvailable + '</span> | ' +
        'Points Spent: <span class="ltp-points-spent">' + totalSpent + '</span> | ' +
        'Max at Level ' + currentLevel + ': <span class="ltp-max-points">' + maxPoints + '</span>' +
      '</div>' +
      '<div class="ltp-controls">' +
        '<button class="ltp-reset-btn" id="ltp-reset-' + buildKey + '">❤ Reset All</button>' +
      '</div>' +
      '<div class="ltp-build-controls">' +
        '<input type="text" class="ltp-build-name" placeholder="Name your build:" value="' + (build.name || '') + '"/>' +
        '<button class="ltp-save-btn" id="ltp-save-' + buildKey + '">Save This!</button>' +
      '</div>';
    
    container.appendChild(controlsHeader);
    
    // Populate level selector
    var levelSelect = container.querySelector('#ltp-level-' + buildKey);
    if (levelSelect) {
      // Add common level options
      var levels = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160];
      levels.forEach(function(level) {
        var option = document.createElement('option');
        option.value = level;
        option.textContent = level + ' (' + getTraitPointsAtLevel(level) + ' points)';
        if (level === currentLevel) option.selected = true;
        levelSelect.appendChild(option);
      });
      
      // Level change handler
      levelSelect.addEventListener('change', function() {
        var newLevel = parseInt(this.value);
        currentLevel = newLevel;
        currentBuild.level = newLevel;
        
        // Update points display immediately
        var newMaxPoints = getMaxTotalPoints();
        var newAvailable = newMaxPoints - getTotalSpentPoints();
        
        container.querySelector('.ltp-points-available').textContent = newAvailable;
        container.querySelector('.ltp-max-points').textContent = newMaxPoints;
        
        // Update full display to refresh constraints
        updatePlannerDisplay();
        
        // Dispatch level change event for Skills page integration
        var levelChangeEvent = new CustomEvent('traitPlannerLevelChanged', {
          detail: { 
            level: newLevel
          },
          bubbles: true
        });
        document.dispatchEvent(levelChangeEvent);
      });
    }
    
    // Add event handlers for controls
    var resetBtn = container.querySelector('#ltp-reset-' + buildKey);
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (confirm('Reset all trait points? This cannot be undone.')) {
          resetAllPoints();
        }
      });
    }
    
    var saveBtn = container.querySelector('#ltp-save-' + buildKey);
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var nameInput = container.querySelector('.ltp-build-name');
        var buildName = nameInput ? nameInput.value.trim() : '';
        
        if (!buildName) {
          alert('Please enter a build name first.');
          return;
        }
        
        // Update build name
        currentBuild.name = buildName;
        
        // Generate shareable URL
        var shareUrl = window.location.href.split('?')[0] + '?build=' + encodeURIComponent(JSON.stringify({
          class: data.class,
          name: buildName,  
          points: currentBuild.points,
          virtues: currentBuild.virtues
        }));
        
        // Show share dialog
        var permalink = prompt('Build saved! Share this URL:', shareUrl);
        if (permalink) {
          // Copy to clipboard if possible
          if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl).then(function() {
              alert('URL copied to clipboard!');
            }).catch(function() {
              // Fallback already handled by showing the URL
            });
          }
        }
      });
    }
    
    // Class selector functionality
    var loadClassBtn = container.querySelector('.ltp-load-class-btn');
    var classSelect = container.querySelector('.ltp-class-select');
    
    if (loadClassBtn && classSelect) {
      loadClassBtn.addEventListener('click', function() {
        var selectedClass = classSelect.value;
        var currentBuildKey = buildKey || 'endgame';
        
        // Update container attributes for reference
        container.setAttribute('data-class', selectedClass);
        
        // Only show loading spinner if data isn't cached yet
        if (!classDataCache[selectedClass]) {
          container.innerHTML = '<p class="ltp-loading"><i class="fa fa-spinner fa-spin"></i> Loading ' + LOTRO_CLASSES[selectedClass] + ' data...</p>';
        }
        
        // Dispatch class change event for Skills page integration
        var classChangeEvent = new CustomEvent('traitPlannerClassChanged', {
          detail: { 
            class: selectedClass, 
            build: currentBuildKey,
            level: currentLevel
          },
          bubbles: true
        });
        document.dispatchEvent(classChangeEvent);
        
        // Load new class data
        loadClassData(container, selectedClass, currentBuildKey, currentLevel, cdnBase);
      });
    }

    /* Determine main spec — tree with most points spent */
    var treeSpent = {};
    data.trees.forEach(function (tree) {
      var s = 0;
      tree.traits.forEach(function (t) {
        if (!t.milestone) s += (build.points[t.id] || 0);
      });
      treeSpent[tree.id] = s;
    });
    var mainTreeId = Object.keys(treeSpent).reduce(function (a, b) {
      return treeSpent[a] > treeSpent[b] ? a : b;
    });

    /* Trees container */
    var treesWrap = document.createElement('div');
    treesWrap.className = 'ltp-trees';

    /* Render trees in fixed order: Blue, Red, Yellow (matching in-game layout) */
    var treeOrder = ['blue', 'red', 'yellow'];
    var sorted = data.trees.slice().sort(function (a, b) {
      return treeOrder.indexOf(a.id) - treeOrder.indexOf(b.id);
    });

    sorted.forEach(function (tree) {
      treesWrap.appendChild(renderTree(tree, build.points || {}, tree.id === mainTreeId, cdnBase));
    });

    container.appendChild(treesWrap);

    /* Virtues */
    var virtuesEl = renderVirtues(build.virtues, cdnBase);
    if (virtuesEl) container.appendChild(virtuesEl);

    /* Sharing footer */
    var shareFooter = document.createElement('div');
    shareFooter.className = 'ltp-share-footer';
    shareFooter.innerHTML = 
      '<div class="ltp-vote-section">' +
        '<span>Like this build?</span>' +
        '<button class="ltp-vote-btn">👍 Vote</button>' +
        '<span class="ltp-vote-count">0</span>' +
      '</div>' +
      '<div class="ltp-permalink">' +
        'Permalink: <input type="text" class="ltp-permalink-url" readonly/>' +
      '</div>' +
      '<p class="ltp-save-notice">Nothing is saved until you click the "Save This!" button. Be sure to save your new build after editing the traits!</p>';
    
    container.appendChild(shareFooter);

    /* Credit */
    var credit = document.createElement('div');
    credit.className = 'ltp-credit';
    credit.innerHTML = 'Trait data referenced from <a href="https://ilovefriedorc.com/traits/" target="_blank" rel="noopener noreferrer">I Love Fried Orc</a>';
    container.appendChild(credit);
  }

  /* ── Auto-init from data attributes ───────────────────────────────────── */
  function init() {
    var widgets = document.querySelectorAll('.lotro-trait-planner[data-class][data-build]');
    if (!widgets.length) return;
    
    // Mark widgets as initialized to prevent duplicate rendering on re-init
    var uninitWidgets = [];
    widgets.forEach(function (el) {
      if (!el.hasAttribute('data-initialized')) {
        uninitWidgets.push(el);
      }
    });
    // On explicit re-init (e.g. from Load Build), process all widgets
    // On first load, only process uninitialized ones
    if (uninitWidgets.length === 0 && widgets.length > 0) {
      // Re-init call: use all widgets (renderPlanner clears container)
      uninitWidgets = Array.prototype.slice.call(widgets);
    }
    widgets = uninitWidgets;

    var cdnBase = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\/$/, '') + '/' : '';

    /* Determine site root for relative paths when CDN is not set */
    if (!cdnBase) {
      var scripts = document.querySelectorAll('script[src*="lotro-trait-planner"]');
      if (scripts.length) {
        var src = scripts[0].getAttribute('src');
        cdnBase = src.replace(/js\/lotro-trait-planner\.js.*$/, '');
      } else {
        cdnBase = './';
      }
    }

    widgets.forEach(function (el) {
      var cls = el.getAttribute('data-class');
      var buildKey = el.getAttribute('data-build');
      var levelAttr = el.getAttribute('data-level');
      var url = cdnBase + 'data/builds/' + cls + '.json';

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            
            // Set level from data attribute if provided
            if (levelAttr && data.builds[buildKey]) {
              data.builds[buildKey].level = parseInt(levelAttr) || DEFAULT_LEVEL;
            }
            
            renderPlanner(el, data, buildKey, cdnBase);
          } catch (e) {
            el.innerHTML = '<p class="text-warning">Failed to parse trait data.</p>';
          }
        } else {
          el.innerHTML = '<p class="text-warning">Trait data not available for ' + cls + '.</p>';
        }
      };
      xhr.onerror = function () {
        el.innerHTML = '<p class="text-warning">Failed to load trait data.</p>';
      };
      xhr.send();
    });
  }

  /* Run on DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LOTRO_TRAIT_PLANNER_INIT = init;

  window.LOTRO_TRAIT_PLANNER_API = {
    getPoints: function() { return currentBuild ? Object.assign({}, currentBuild.points || {}) : null; },
    setPoints: function(points) {
      if (currentBuild) {
        currentBuild.points = points || {};
        updatePlannerDisplay();
      }
    },
    getVirtues: function() { return currentBuild ? (currentBuild.virtues || []).slice() : []; },
    setVirtues: function(virtues) {
      if (currentBuild) {
        currentBuild.virtues = (virtues || []).slice(0, MAX_VIRTUE_SLOTS);
        updatePlannerDisplay();
      }
    },
    reset: function() { resetAllPoints(); },
    getCurrentClass: function() { return currentData ? currentData.class : null; },
    getCurrentLevel: function() { return currentLevel; },
    getBuildName: function() {
      var input = document.querySelector('.ltp-build-name');
      return input ? input.value.trim() : '';
    },
    setBuildName: function(name) {
      var input = document.querySelector('.ltp-build-name');
      if (input) input.value = name || '';
    }
  };
})();
