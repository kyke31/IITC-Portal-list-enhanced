// ==UserScript==
// @author         teo96 - updates by Enrique H. (kyke31)
// @name           IITC plugin: Portals list
// @category       Info
// @version        0.4.6
// @description    Display a sortable list of all visible portals with full details about the team, resonators, links, etc.
// @id             portals-list
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @updateURL      https://iitc.app/build/release/plugins/portals-list.meta.js
// @downloadURL    https://iitc.app/build/release/plugins/portals-list.user.js
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @icon           https://iitc.app/extras/plugin-icons/portals-list.svg
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

//PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
//(leaving them in place might break the 'About IITC' page or break update checks)
plugin_info.buildName = 'release';
plugin_info.dateTimeVersion = '2025-08-29-160722';
plugin_info.pluginId = 'portals-list';
//END PLUGIN AUTHORS NOTE

/* exported setup, changelog --eslint */
/* global IITC -- eslint */

const changelog = [
  {
    version: '0.4.6',
    changes: ['Checkpoint release: v0.4.5_0.20_kyke31 features finalized', 'Virtual Scrolling', 'Level Filters', 'Mobile Drawer'],
  },
  {
    version: '0.4.5_0.20_kyke31',
    changes: ['Reverted to v0.17 base (Main Thread)', 'Added: Level Filters, Actions, Mobile Drawer, Virtual Scroll', 'Skipped: Web Worker (CSP Fix)'],
  },
  {
    version: '0.4.5_0.17_kyke31',
    changes: ['Fix: Sorting for Owner, Shielding, and Mods columns'],
  },
];

// use own namespace for plugin
window.plugin.portalslist = function () {};

// STATE MANAGEMENT
window.plugin.portalslist.state = {
  sortBy: 1, // Level
  sortOrder: -1, // Desc
  filter: 0, 
  levelFilters: [0,1,2,3,4,5,6,7,8], 
  searchTerm: '',
  // Virtual Scroll State
  rowHeight: 30, 
  processedList: [], 
  // Settings
  hiddenCols: [],
  fetchDetails: false, // Default DISABLED
  initialized: false
};

// CACHE
window.plugin.portalslist.ownerCache = {};
window.plugin.portalslist.highlightLayer = null; 

// --- SETTINGS ---
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('plugin-portalslist-settings'));
    if (saved) {
      window.plugin.portalslist.state.hiddenCols = saved.hiddenCols || [];
      window.plugin.portalslist.state.fetchDetails = (saved.fetchDetails === true); 
    }
  } catch (e) { console.warn('PortalsList: Failed to load settings', e); }
}

function saveSettings() {
  const s = window.plugin.portalslist.state;
  localStorage.setItem('plugin-portalslist-settings', JSON.stringify({
    hiddenCols: s.hiddenCols,
    fetchDetails: s.fetchDetails
  }));
}

// --- UTILS ---
function abbreviate(label) {
  return label.replaceAll(/[^a-z]/gi, '').substring(0, 3).capitalize();
}

function zeroCounts() {
  return window.plugin.portalslist.FILTERS.reduce((prev, curr) => {
    prev[curr] = 0;
    return prev;
  }, {});
}

function getLvlTextColor(lvl) {
    if(lvl === 0) return '#ddd';
    if(lvl <= 3) return '#000';
    return '#fff';
}

// --- HIGHLIGHTER ---
window.plugin.portalslist.highlightPortal = function(guid) {
    if (window.plugin.portalslist.highlightLayer) {
        window.map.removeLayer(window.plugin.portalslist.highlightLayer);
        window.plugin.portalslist.highlightLayer = null;
    }
    
    if (!guid) return;

    const portal = window.portals[guid];
    if (portal) {
        window.plugin.portalslist.highlightLayer = L.circleMarker(portal.getLatLng(), {
            radius: 20, color: '#FFCE00', opacity: 0.8, weight: 3, fill: false, dashArray: '5, 5', interactive: false
        }).addTo(window.map);
    }
};

// --- LAZY LOAD QUEUE ---
const ownerQueue = {
  items: [],
  running: false,
  processed: new Set(),
  
  add: function(guid) {
    if (this.processed.has(guid) || this.items.includes(guid)) return;
    if (window.portalDetail.get(guid)) return; 
    
    this.items.push(guid);
    if (window.plugin.portalslist.state.fetchDetails) this.process();
  },

  process: function() {
    if (this.items.length === 0 || !window.plugin.portalslist.state.fetchDetails) {
        this.running = false;
        return;
    }
    if (this.running) return; 

    this.running = true;
    const guid = this.items.shift();
    this.processed.add(guid);

    const details = window.portalDetail.get(guid);
    if (details) {
      if (details.owner) window.plugin.portalslist.ownerCache[guid] = details.owner;
      this.next();
      return;
    }

    const requestPromise = window.portalDetail.request(guid);
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'));

    Promise.race([requestPromise, timeoutPromise]).then((data) => {
        if(data !== 'timeout' && data && data.owner) {
            window.plugin.portalslist.ownerCache[guid] = data.owner;
        }
    }).finally(() => {
        this.next();
    });
  },

  next: function() {
      this.running = false;
      setTimeout(() => this.process(), Math.floor(Math.random() * 200) + 100);
  },
  
  kickstart: function() {
      if(window.plugin.portalslist.state.fetchDetails && !this.running && this.items.length > 0) {
          this.process();
      }
  }
};

// --- HELPERS ---
function getShielding(guid) {
    const d = window.portalDetail.get(guid);
    if (!d || !d.mods) return null;
    let total = 0;
    d.mods.forEach(mod => {
        if(mod && mod.stats && mod.stats.MITIGATION) {
            total += parseInt(mod.stats.MITIGATION, 10);
        }
    });
    const effective = Math.min(95, total);
    const excess = total - effective;
    let text = `${total}`;
    if (excess > 0) text = `${effective} (+${excess})`;
    return { total: total, text: text };
}

function getModCount(guid) {
    const d = window.portalDetail.get(guid);
    if (!d || !d.mods) return null;
    return d.mods.filter(m => m !== null).length;
}

// --- FIELDS ---
window.plugin.portalslist.fields = [
  {
    title: 'Portal Name',
    id: 'title',
    value: p => p.options.data.title,
    sortValue: v => v.toLowerCase(),
    format: (cell, p) => {
      $(cell).append(window.plugin.portalslist.getPortalLink(p)).addClass('portalTitle');
    },
  },
  {
    title: 'Level',
    id: 'level',
    value: p => p.options.data.level,
    format: (cell, p, v) => {
      const textColor = getLvlTextColor(v);
      $(cell).css({
          'background-color': window.COLORS_LVL[v],
          'color': textColor
      }).text('L' + v).addClass('mono');
    },
    defaultOrder: -1,
  },
  {
    title: 'Team',
    id: 'team',
    value: p => p.options.team,
    format: (cell, p, v) => {
      const teamName = window.plugin.portalslist.FACTION_ABBREVS[v];
      let display = teamName ? teamName.toUpperCase() : '-';
      if (v === window.TEAM_NONE) display = '-';
      
      let colorClass = 'team-neu';
      if (v === window.TEAM_RES) colorClass = 'team-res';
      else if (v === window.TEAM_ENL) colorClass = 'team-enl';
      else if (v === window.TEAM_MAC) { colorClass = 'team-mac'; display = 'MAC'; }
      
      $(cell).text(display).addClass(colorClass).addClass('alignC');
    },
  },
  {
    title: 'Owner',
    id: 'owner',
    requiresDetails: true, 
    value: p => {
      const team = p.options.team;
      if (team === window.TEAM_NONE) return '-';
      if (team === window.TEAM_MAC) return 'Machina';
      if (window.plugin.portalslist.ownerCache[p.options.guid]) return window.plugin.portalslist.ownerCache[p.options.guid];
      
      const d = window.portalDetail.get(p.options.guid);
      if (d && d.owner) {
          window.plugin.portalslist.ownerCache[p.options.guid] = d.owner;
          return d.owner;
      }
      return 'Loading...';
    },
    sortValue: (v, p) => {
        const team = p.options.team;
        if (team === window.TEAM_NONE) return '-';
        if (team === window.TEAM_MAC) return 'Machina';
        return window.plugin.portalslist.ownerCache[p.options.guid] || '';
    },
    format: (cell, p, v) => {
      if (v === 'Loading...') {
        ownerQueue.add(p.options.guid);
        $(cell).text(v).addClass('loading');
      } else {
        $(cell).text(v).removeClass('loading');
      }
    },
  },
  {
    title: 'Shielding',
    id: 'shielding',
    requiresDetails: true,
    value: p => {
        const team = p.options.team;
        if (team === window.TEAM_NONE) return '-';
        const data = getShielding(p.options.guid);
        return data ? data.text : 'Loading...';
    },
    sortValue: (v, p) => {
        const data = getShielding(p.options.guid);
        return data ? data.total : -1;
    },
    format: (cell, p, v) => {
      if (v === 'Loading...') {
        ownerQueue.add(p.options.guid);
        $(cell).text(v).addClass('loading alignR');
      } else {
        $(cell).text(v).removeClass('loading').addClass('alignR mono');
      }
    },
    defaultOrder: -1
  },
  {
    title: 'Mods',
    id: 'mods',
    requiresDetails: true,
    value: p => {
        const team = p.options.team;
        if (team === window.TEAM_NONE) return 0;
        const count = getModCount(p.options.guid);
        return (count !== null) ? count : 'Loading...';
    },
    sortValue: (v, p) => {
        if (p.options.team === window.TEAM_NONE) return 0;
        const count = getModCount(p.options.guid);
        return (count !== null) ? count : -1;
    },
    format: (cell, p, v) => {
        if (v === 'Loading...') {
            ownerQueue.add(p.options.guid);
            $(cell).text(v).addClass('loading alignR');
        } else {
            $(cell).text(v).removeClass('loading').addClass('alignR mono');
        }
    },
    defaultOrder: -1
  },
  {
    title: 'Health',
    id: 'health',
    value: p => p.options.data.health,
    sortValue: (v, p) => (p.options.team === window.TEAM_NONE ? -1 : v),
    format: (cell, p, v) => {
      $(cell).addClass('alignR mono').text(p.options.team === window.TEAM_NONE ? '-' : v + '%');
    },
    defaultOrder: -1,
  },
  {
    title: 'Res',
    id: 'res',
    value: p => p.options.data.resCount,
    format: (cell, p, v) => $(cell).addClass('alignR mono').text(v),
    defaultOrder: -1,
  },
  {
    title: 'Links',
    id: 'links',
    value: p => window.getPortalLinks(p.options.guid),
    sortValue: v => v.in.length + v.out.length,
    format: (cell, p, v) => {
      $(cell).addClass('alignR help mono').attr('title', `In:\t${v.in.length}\nOut:\t${v.out.length}`).text(v.in.length + v.out.length);
    },
    defaultOrder: -1,
  },
  {
    title: 'Fields',
    id: 'fields',
    value: p => window.getPortalFieldsCount(p.options.guid),
    format: (cell, p, v) => $(cell).addClass('alignR mono').text(v),
    defaultOrder: -1,
  },
  {
    title: 'V/C',
    id: 'history_vc',
    value: p => {
      const h = p.options.data.history;
      return h ? (h.captured ? 2 : h.visited ? 1 : 0) : -1;
    },
    format: (cell, p, v) => {
      const map = ['-', 'V', 'C'];
      $(cell).text(v >= 0 ? map[v] : '-').addClass('alignC');
    },
  },
  {
    title: 'S',
    id: 'history_s',
    value: p => {
      const h = p.options.data.history;
      return h ? (h.scoutControlled ? 1 : 0) : -1;
    },
    format: (cell, p, v) => {
      $(cell).text(v === 1 ? 'S' : '-').addClass('alignC');
    },
  },
  {
    title: 'Actions',
    id: 'actions',
    value: p => p.options.guid, // dummy value for sorting
    sortValue: v => 0, // not sortable
    format: (cell, p, v) => {
        const latlng = p.getLatLng();
        const mapUrl = `http://googleusercontent.com/maps.google.com/maps?ll=${latlng.lat},${latlng.lng}`;
        
        // Copy Link
        const btnCp = $('<button class="action-btn" title="Copy Link">CP</button>').click((e) => {
            e.stopPropagation();
            const perma = `https://intel.ingress.com/?pll=${latlng.lat},${latlng.lng}`;
            const temp = $('<input>');
            $('body').append(temp);
            temp.val(perma).select();
            document.execCommand('copy');
            temp.remove();
            
            // Visual feedback
            const btn = $(e.target);
            const orig = btn.text();
            btn.text('OK').css('color', '#20A8B1');
            setTimeout(() => btn.text(orig).css('color', ''), 1000);
        });
        
        // Google Maps
        const btnMap = $(`<a href="${mapUrl}" target="_blank" class="action-btn" title="Open Maps">MAP</a>`).click(e => e.stopPropagation());
        
        $(cell).addClass('alignC').append(btnCp).append(btnMap);
    }
  }
];

// --- CORE LOGIC ---

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

window.plugin.portalslist.getPortals = function () {
  const displayBounds = window.map.getBounds();
  window.plugin.portalslist.listPortals = [];
  
  const counts = zeroCounts();
  window.plugin.portalslist.counts = counts;

  $.each(window.portals, function (i, portal) {
    if (!displayBounds.contains(portal.getLatLng())) return true;
    if (!('title' in portal.options.data)) return true;

    counts[window.plugin.portalslist.FACTION_FILTERS[portal.options.team]]++;
    if (portal.options.data.history.visited) counts[window.plugin.portalslist.HISTORY_FILTERS[0]]++;
    if (portal.options.data.history.captured) counts[window.plugin.portalslist.HISTORY_FILTERS[1]]++;
    if (portal.options.data.history.scoutControlled) counts[window.plugin.portalslist.HISTORY_FILTERS[2]]++;

    const obj = { portal: portal, values: [], sortValues: [] };
    
    // Initial sort values calc
    window.plugin.portalslist.fields.forEach(field => {
        const val = field.value(portal);
        obj.values.push(val);
        obj.sortValues.push(field.sortValue ? field.sortValue(val, portal) : val);
    });

    window.plugin.portalslist.listPortals.push(obj);
  });
};

window.plugin.portalslist.processList = function() {
    let list = window.plugin.portalslist.listPortals;
    const s = window.plugin.portalslist.state;

    // 1. Filter Logic
    if (s.filter !== 0) {
        const factionCount = window.plugin.portalslist.FACTION_FILTERS.length;
        list = list.filter(obj => {
            if (s.filter <= factionCount) {
                // Faction: 1=Neu(0), 2=Res(1), 3=Enl(2), 4=Mac(3)
                const requiredTeamId = s.filter - 1; 
                return obj.portal.options.team === requiredTeamId;
            } else {
                // History
                const historyIdx = s.filter - factionCount - 1;
                const h = obj.portal.options.data.history;
                if (historyIdx === 0) return h.visited;
                if (historyIdx === 1) return h.captured;
                if (historyIdx === 2) return h.scoutControlled;
            }
            return true;
        });
    }

    // 2. Level Filter
    if(s.levelFilters && s.levelFilters.length > 0) {
        list = list.filter(obj => s.levelFilters.includes(obj.portal.options.data.level));
    }

    // 3. Search
    if (s.searchTerm) {
        const term = s.searchTerm.toLowerCase();
        list = list.filter(obj => {
            const title = obj.portal.options.data.title.toLowerCase();
            const owner = (window.plugin.portalslist.ownerCache[obj.portal.options.guid] || '').toLowerCase();
            const team = window.plugin.portalslist.FACTION_ABBREVS[obj.portal.options.team].toLowerCase();
            return title.includes(term) || owner.includes(term) || team.includes(term);
        });
    }

    // 4. Sort
    const sortIdx = s.sortBy;
    const sortField = window.plugin.portalslist.fields[sortIdx];
    const order = s.sortOrder;
    
    // RE-CALC SORT
    list.forEach(obj => {
        const val = sortField.value(obj.portal);
        obj.sortValues[sortIdx] = sortField.sortValue ? sortField.sortValue(val, obj.portal) : val;
    });

    list.sort((a, b) => {
        const valA = a.sortValues[sortIdx];
        const valB = b.sortValues[sortIdx];
        let ret = 0;
        if (sortField.sort) {
            ret = sortField.sort(valA, valB, a.portal, b.portal);
        } else {
            ret = (valA < valB ? -1 : valA > valB ? 1 : 0);
        }
        if (ret === 0) ret = (a.portal.options.guid < b.portal.options.guid ? -1 : 1);
        return ret * order;
    });

    // Update Virtual Scroll Data
    window.plugin.portalslist.state.processedList = list;
    window.plugin.portalslist.updateVirtualRender();
    $('.list-info').text(`Showing ${list.length} portals`);
};

// --- RENDER UI ---

window.plugin.portalslist.displayPL = function () {
  if(!window.plugin.portalslist.state.initialized) {
      loadSettings();
      window.plugin.portalslist.state.initialized = true;
  }
  
  window.plugin.portalslist.getPortals();
  const container = window.plugin.portalslist.renderContainer();

  if (window.useAppPanes()) {
    const mobileContainer = $('<div id="portalslist" class="mobile">');
    mobileContainer.append(container).appendTo(document.body);
  } else {
    window.dialog({
      html: $('<div id="portalslist">').append(container),
      dialogClass: 'ui-dialog-portalslist',
      title: 'Portal list: ' + window.plugin.portalslist.listPortals.length + ' portals',
      id: 'portal-list',
      width: 900,
      height: 550, 
      minHeight: 400,
      buttons: [
          { text: "Settings", click: window.plugin.portalslist.showSettings },
          { text: "Export CSV", click: window.plugin.portalslist.exportCSV },
          { text: "Refresh", click: function() { window.plugin.portalslist.displayPL(); } },
          { text: "OK", click: function() { $(this).dialog('close'); } }
      ]
    });
  }
  
  // Initial Process call
  window.plugin.portalslist.processList();
};

window.plugin.portalslist.renderContainer = function() {
    const s = window.plugin.portalslist.state;
    const container = $('<div>').addClass('pl-wrapper');

    const topSection = $('<div>').addClass('pl-top');
    
    // Toolbar
    const toolbar = $('<div class="pl-toolbar">');
    const searchInput = $('<input type="text" placeholder="Search..." class="pl-search">');
    searchInput.val(s.searchTerm);
    searchInput.on('keyup', debounce(function() {
        s.searchTerm = $(this).val();
        window.plugin.portalslist.processList();
    }, 300));
    
    // Switch
    const toggleWrapper = $('<label class="pl-switch" title="Fetch additional details (Owners, Shielding, Mods)">');
    const toggleInput = $('<input type="checkbox">').prop('checked', s.fetchDetails);
    const toggleSlider = $('<span class="pl-slider"></span>');
    const toggleLabel = $('<span class="pl-label">Gather additional data</span>');
    
    toggleInput.on('change', function() {
        s.fetchDetails = $(this).is(':checked');
        saveSettings();
        if(s.fetchDetails) ownerQueue.process();
        window.plugin.portalslist.processList(); // Re-render to show/hide cols
    });
    
    toggleWrapper.append(toggleInput).append(toggleSlider).append(toggleLabel);

    toolbar.append(searchInput).append(toggleWrapper);
    topSection.append(toolbar);

    // Filters (Faction)
    const filters = document.createElement('div');
    filters.className = 'filters';
    window.plugin.portalslist.renderFilters(filters);
    topSection.append(filters);

    // Filters (Level)
    const lvlFilters = $('<div class="filters lvl-filters">');
    window.plugin.portalslist.renderLevelFilters(lvlFilters[0]);
    topSection.append(lvlFilters);

    container.append(topSection);

    // Table (Virtual Scroll Container)
    const tableDiv = $('<div class="table-container">');
    
    // Create Table Structure Once
    const table = $('<table>').addClass('portals');
    const thead = $('<thead>').appendTo(table);
    const headerRow = $('<tr>').appendTo(thead);
    
    $('<th>#</th>').appendTo(headerRow); // Index

    window.plugin.portalslist.fields.forEach((field, i) => {
        if (s.hiddenCols.includes(field.id)) return;
        if (field.requiresDetails && !s.fetchDetails) return;

        const th = $('<th>').text(field.title).addClass('sortable');
        if (i === s.sortBy) th.addClass('sorted');
        
        th.click(() => {
             if (s.sortBy === i) s.sortOrder *= -1;
             else { s.sortBy = i; s.sortOrder = field.defaultOrder || 1; }
             window.plugin.portalslist.processList(); // Trigger re-sort & render
        });
        headerRow.append(th);
    });

    const tbody = $('<tbody>').appendTo(table);
    tableDiv.append(table);
    
    // Scroll Listener for Virtualization
    tableDiv.on('scroll', () => window.plugin.portalslist.updateVirtualRender());
    
    container.append(tableDiv);

    // Footer
    const bottomSection = $('<div>').addClass('pl-bottom');
    const info = $('<span class="list-info">Loading...</span>');
    bottomSection.append(info);
    container.append(bottomSection);

    return container;
};

window.plugin.portalslist.renderFilters = function(container) {
    const s = window.plugin.portalslist.state;
    const length = window.plugin.portalslist.listPortals.length;
    
    const handleFilter = (idx) => {
        if (s.filter === idx) s.filter = 0;
        else s.filter = idx;
        window.plugin.portalslist.processList();
    };
    
    const labelMap = {
        'Neutral': 'NEU', 'Resistance': 'RES', 'Enlightened': 'ENL',
        'Machina': 'MAC', '__MACHINA__': 'MAC',
        'Visited': 'Visited', 'Captured': 'Captured', 'Scout Controlled': 'Scout Controlled'
    };

    window.plugin.portalslist.FILTERS.forEach((label, i) => {
        let displayName = label;
        let isFaction = false;
        let teamId = -1;

        if (i > 0 && i <= window.plugin.portalslist.FACTION_FILTERS.length) {
            displayName = labelMap[label] || label;
            isFaction = true;
            teamId = i - 1; 
        } else if (i > window.plugin.portalslist.FACTION_FILTERS.length) {
            displayName = labelMap[label] || label;
        }

        const filterName = 'filter' + abbreviate(label);
        let styleClass = 'filterGeneric';
        if (isFaction) {
            if (teamId === window.TEAM_RES) styleClass = 'filterRes';
            else if (teamId === window.TEAM_ENL) styleClass = 'filterEnl';
            else if (teamId === window.TEAM_MAC) styleClass = 'filterMac';
            else if (teamId === window.TEAM_NONE) styleClass = 'filterNeu';
        }
        
        const nameCell = document.createElement('div');
        nameCell.className = `name ${styleClass}`;
        nameCell.textContent = displayName + ':';
        if (s.filter === i) nameCell.classList.add('active');
        nameCell.addEventListener('click', () => handleFilter(i));
        container.appendChild(nameCell);

        const countCell = document.createElement('div');
        countCell.className = `count ${filterName} ${styleClass}`;
        let count = (i === 0) ? length : window.plugin.portalslist.counts[label];
        countCell.textContent = count;
        container.appendChild(countCell);
    });
};

window.plugin.portalslist.renderLevelFilters = function(container) {
    const s = window.plugin.portalslist.state;
    $(container).append('<div class="name filterGeneric">Level:</div>');
    
    for(let l=0; l<=8; l++) {
        const btn = $(`<div class="lvl-btn">L${l}</div>`);
        if(s.levelFilters.includes(l)) btn.addClass('active');
        
        btn.click(() => {
            if(s.levelFilters.includes(l)) {
                s.levelFilters = s.levelFilters.filter(x => x !== l);
            } else {
                s.levelFilters.push(l);
            }
            btn.toggleClass('active');
            window.plugin.portalslist.processList();
        });
        $(container).append(btn);
    }
};

window.plugin.portalslist.refreshTable = function() {
    ownerQueue.kickstart();
    $('.portals th.sortable').removeClass('sorted');
    // We do simple refresh, but correct header class logic requires re-render or explicit update
    // Just trigger process for now
    window.plugin.portalslist.processList();
};

// --- VIRTUAL RENDER ---
window.plugin.portalslist.updateVirtualRender = function() {
    const list = window.plugin.portalslist.state.processedList;
    if (!list) return;
    
    const container = $('.table-container')[0];
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const rowHeight = window.plugin.portalslist.state.rowHeight;
    
    // Calculate range
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5); 
    const endIndex = Math.min(list.length, Math.ceil((scrollTop + clientHeight) / rowHeight) + 5);
    
    const tbody = $('.portals tbody');
    tbody.empty();
    
    // Top Spacer
    if (startIndex > 0) {
        tbody.append(`<tr style="height: ${startIndex * rowHeight}px;"></tr>`);
    }
    
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < endIndex; i++) {
        const item = list[i];
        const portal = item.portal;
        
        const r = document.createElement('tr');
        r.style.height = `${rowHeight}px`;
        if (i % 2 === 1) r.className = 'even';
        
        r.addEventListener('mouseenter', () => window.plugin.portalslist.highlightPortal(portal.options.guid));
        r.addEventListener('mouseleave', () => window.plugin.portalslist.highlightPortal(null));

        const cIdx = r.insertCell(-1);
        cIdx.textContent = i + 1;
        
        window.plugin.portalslist.fields.forEach((field) => {
            if (window.plugin.portalslist.state.hiddenCols.includes(field.id)) return;
            if (field.requiresDetails && !window.plugin.portalslist.state.fetchDetails) return;
            
            const c = r.insertCell(-1);
            const val = field.value(portal);
            if (field.format) field.format(c, portal, val);
            else c.textContent = val;
        });
        fragment.appendChild(r);
    }
    
    tbody.append(fragment);
    
    // Bottom Spacer
    const remaining = list.length - endIndex;
    if (remaining > 0) {
        tbody.append(`<tr style="height: ${remaining * rowHeight}px;"></tr>`);
    }
};

window.plugin.portalslist.showSettings = function() {
    const s = window.plugin.portalslist.state;
    const html = $('<div>');
    html.append('<h4>Visible Columns</h4>');
    window.plugin.portalslist.fields.forEach(f => {
        if (f.requiresDetails && !s.fetchDetails) return;
        const checked = !s.hiddenCols.includes(f.id) ? 'checked' : '';
        html.append(`<label><input type="checkbox" ${checked} data-id="${f.id}"> ${f.title}</label><br>`);
    });

    window.dialog({
        title: 'Portals List Settings',
        html: html,
        width: 300,
        buttons: {
            "Save": function() {
                const hidden = [];
                html.find('input[data-id]').each(function() {
                    if (!this.checked) hidden.push($(this).data('id'));
                });
                s.hiddenCols = hidden;
                saveSettings();
                window.plugin.portalslist.displayPL(); // Re-render to update cols
                $(this).dialog('close');
            }
        }
    });
};

window.plugin.portalslist.exportCSV = function() {
    const listInfo = window.plugin.portalslist.state.processedList;
    if (!listInfo) return;
    
    let csv = "";
    const escape = (val) => '"' + String(val || "").replace(/"/g, '""') + '"';

    const headers = ["Index"];
    window.plugin.portalslist.fields.forEach(f => {
        if (window.plugin.portalslist.state.hiddenCols.includes(f.id)) return;
        if (f.requiresDetails && !window.plugin.portalslist.state.fetchDetails) return;
        headers.push(f.title);
    });
    csv += headers.map(escape).join(",") + "\n";

    listInfo.forEach((item, i) => {
        const portal = item.portal;
        const row = [i + 1];
        
        window.plugin.portalslist.fields.forEach(f => {
            if (window.plugin.portalslist.state.hiddenCols.includes(f.id)) return;
            if (f.requiresDetails && !window.plugin.portalslist.state.fetchDetails) return;

            let val = f.value(portal);
            
            if (f.id === 'history_vc') val = ['-', 'V', 'C'][val >= 0 ? val : 0];
            else if (f.id === 'history_s') val = (val === 1) ? 'S' : '-';
            else if (f.id === 'team') {
                const map = window.plugin.portalslist.FACTION_ABBREVS;
                val = map[val] ? map[val].toUpperCase() : '-';
                if(portal.options.team === window.TEAM_NONE) val = '-';
            }
            else if (typeof val === 'object' && val !== null) {
                 if(val.in) val = val.in.length + val.out.length;
                 else if(val.total !== undefined) val = val.text;
            }
            row.push(val);
        });
        csv += row.map(escape).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portals-list-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
};

window.plugin.portalslist.getPortalLink = function (portal) {
  const coord = portal.getLatLng();
  const perma = window.makePermalink(coord);
  const link = document.createElement('a');
  link.textContent = portal.options.data.title;
  link.href = perma;
  link.addEventListener('click', function (ev) {
      window.renderPortalDetails(portal.options.guid);
      ev.preventDefault();
      return false;
    }, false);
  link.addEventListener('dblclick', function (ev) {
    window.zoomToAndShowPortal(portal.options.guid, [coord.lat, coord.lng]);
    ev.preventDefault();
    return false;
  });
  return link;
};

window.plugin.portalslist.onPaneChanged = function (pane) {
  if (pane === 'plugin-portalslist') window.plugin.portalslist.displayPL();
  else $('#portalslist').remove();
};

window.plugin.portalslist.portalApGainMaths = function (resCount, linkCount, fieldCount) {
  let deployAp = (8 - resCount) * window.DEPLOY_RESONATOR;
  if (resCount === 0) deployAp += window.CAPTURE_PORTAL;
  if (resCount !== 8) deployAp += window.COMPLETION_BONUS;
  const friendlyAp = deployAp;
  const destroyResoAp = resCount * window.DESTROY_RESONATOR;
  const destroyLinkAp = linkCount * window.DESTROY_LINK;
  const destroyFieldAp = fieldCount * window.DESTROY_FIELD;
  const captureAp = window.CAPTURE_PORTAL + 8 * window.DEPLOY_RESONATOR + window.COMPLETION_BONUS;
  const destroyAp = destroyResoAp + destroyLinkAp + destroyFieldAp;
  const enemyAp = destroyAp + captureAp;
  return { friendlyAp, enemyAp, destroyAp, destroyResoAp, captureAp };
};

const setup = function () {
  window.plugin.portalslist.FACTION_FILTERS = window.TEAM_NAMES;
  window.plugin.portalslist.FACTION_ABBREVS = window.plugin.portalslist.FACTION_FILTERS.map(abbreviate);
  window.plugin.portalslist.ALL_FACTION_FILTERS = ['All', ...window.plugin.portalslist.FACTION_FILTERS];
  window.plugin.portalslist.HISTORY_FILTERS = ['Visited', 'Captured', 'Scout Controlled'];
  window.plugin.portalslist.FILTERS = [...window.plugin.portalslist.ALL_FACTION_FILTERS, ...window.plugin.portalslist.HISTORY_FILTERS];
  window.plugin.portalslist.listPortals = [];
  window.plugin.portalslist.counts = zeroCounts();

  window.map.on('moveend', debounce(() => {
     if (window.plugin.portalslist.listPortals.length > 0 && $('#portalslist').length > 0) {
         window.plugin.portalslist.displayPL();
     }
  }, 500));
  
  window.addHook('portalDetailLoaded', (data) => {
     if(!data.success) return;
     if(window.plugin.portalslist.ownerCache[data.guid] === undefined && data.details && data.details.owner) {
         window.plugin.portalslist.ownerCache[data.guid] = data.details.owner;
     }
     if ($('#portalslist').length) window.plugin.portalslist.processList();
  });

  if (window.useAppPanes()) {
    window.app.addPane('plugin-portalslist', 'Portals list', 'ic_action_paste');
    window.addHook('paneChanged', window.plugin.portalslist.onPaneChanged);
  } else {
    IITC.toolbox.addButton({
      label: 'Portals list',
      title: 'Display a list of portals in the current view [t]',
      action: window.plugin.portalslist.displayPL,
      accesskey: 't',
    });
  }

  $('<style>').prop('type', 'text/css').html('\
#portalslist { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; color: #eee; background: #0e3d4e; }\
.pl-wrapper { display: flex; flex-direction: column; flex: 1; overflow: hidden; height: 100%; }\
.pl-top { flex: 0 0 auto; background: #1b415e; padding: 5px; border-bottom: 1px solid #000; }\
.pl-bottom { flex: 0 0 auto; padding: 5px; background: #1b415e; border-top: 1px solid #000; text-align: center; }\
.pl-toolbar { display: flex; gap: 15px; margin-bottom: 5px; align-items: center; }\
.pl-search { flex-grow: 1; padding: 4px; background: #000; border: 1px solid #20A8B1; color: #fff; }\
.pl-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; user-select: none; gap: 8px; }\
.pl-switch input { opacity: 0; width: 0; height: 0; }\
.pl-slider { position: relative; width: 34px; height: 18px; background-color: #444; border-radius: 20px; transition: .3s; }\
.pl-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; border-radius: 50%; transition: .3s; }\
input:checked + .pl-slider { background-color: #20A8B1; }\
input:checked + .pl-slider:before { transform: translateX(16px); }\
.pl-label { font-size: 12px; color: #ccc; }\
.filters { display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 2px; }\
.filters .name, .filters .count, .lvl-btn { padding: 2px 5px; background: rgba(0,0,0,0.5); font-size: 11px; cursor: pointer; border: 1px solid #333; margin-right: 1px; }\
.filters .name:hover, .lvl-btn:hover { background: #444; }\
.filters .name.active, .lvl-btn.active { border-color: #FFCE00; color: #FFCE00; font-weight: bold; }\
.filterRes { background-color: #005684 !important; color: #fff !important; text-shadow: 0 0 2px #000; }\
.filterEnl { background-color: #017f01 !important; color: #fff !important; text-shadow: 0 0 2px #000; }\
.filterMac { background-color: #a00 !important; color: #fff !important; text-shadow: 0 0 2px #000; }\
.filterNeu { background-color: #666 !important; color: #fff !important; }\
.table-container { flex: 1 1 auto; overflow-y: auto; position: relative; }\
.table-container table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }\
.table-container thead th { position: sticky; top: 0; z-index: 10; background-color: #1b415e; color: #eee; padding: 4px; text-align: center; border-bottom: 2px solid #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
.table-container tbody td { padding: 3px 5px; border-bottom: 1px solid #333; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\
.table-container tbody tr:nth-child(even) { background-color: rgba(0,0,0,0.2); }\
.table-container tbody tr:hover { background-color: rgba(255,255,255,0.1); }\
.team-res { background-color: #005684; color: #fff; text-shadow: 0 0 2px #000; }\
.team-enl { background-color: #017f01; color: #fff; text-shadow: 0 0 2px #000; }\
.team-mac { background-color: #a00; color: #fff; text-shadow: 0 0 2px #000; }\
.team-neu { background-color: #222; color: #aaa; }\
.alignR { text-align: right; }\
.alignC { text-align: center; }\
.mono { font-family: monospace; font-size: 1.1em; opacity: 0.9; }\
.portalTitle { color: #fff !important; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; }\
.portalTitle:hover { text-decoration: underline; color: #20A8B1 !important; }\
.action-btn { font-size: 9px; padding: 1px 3px; border: 1px solid #555; background: #222; color: #ddd; margin: 0 2px; cursor: pointer; text-decoration: none; display: inline-block; }\
.action-btn:hover { background: #444; border-color: #888; color: #fff; }\
.ui-dialog-portalslist .ui-dialog-content { padding: 0 !important; overflow: hidden !important; background: #0e3d4e !important; }\
.ui-dialog.ui-dialog-portalslist { max-width: calc(100vw - 2px); border: 1px solid #20A8B1; }\
.ui-dialog.ui-dialog-portalslist .ui-dialog-titlebar { background: #1b415e; border: 0; border-bottom: 1px solid #20A8B1; color: #fff; }\
.ui-dialog-buttonset button { margin: 5px; }\
@media (max-width: 800px) {\
  .ui-dialog.ui-dialog-portalslist { top: auto !important; bottom: 0; left: 0 !important; width: 100% !important; height: 75% !important; border-radius: 12px 12px 0 0; display: flex; flex-direction: column; }\
  .ui-dialog.ui-dialog-portalslist .ui-dialog-content { flex: 1; }\
}\
').appendTo('head');
};

setup.info = plugin_info; //add the script info data to the function as a property
if (typeof changelog !== 'undefined') setup.info.changelog = changelog;
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);
