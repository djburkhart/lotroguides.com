/* PlayLog character snapshots. The plugin writes PlayLogSnapshot.plugindata
   (a Lua table) under Documents\...\PluginData. The character log and the
   skills page both read that file, or the JSON from the plugin window, and
   store the character in this browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LotroPlayLog = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  var STORAGE_KEY = "lotroguides.playlog.v1";
  var MAX_TEXT = 12000000;
  var MAX_NAME = 80;
  var MAX_SERVER = 40;

  var CLASS_KEYS = {
    guardian: "guardian",
    captain: "captain",
    minstrel: "minstrel",
    burglar: "burglar",
    hunter: "hunter",
    champion: "champion",
    loremaster: "lore-master",
    runekeeper: "rune-keeper",
    warden: "warden",
    beorning: "beorning",
    brawler: "brawler",
    mariner: "mariner",
  };

  var SLOT_ORDER = [
    "Head", "Shoulder", "Back", "Chest", "Gloves", "Legs", "Boots",
    "Bracelet1", "Bracelet2", "Necklace", "Ring1", "Ring2", "Earring1", "Earring2", "Pocket",
    "PrimaryWeapon", "SecondaryWeapon", "RangedWeapon", "CraftTool", "Class",
  ];

  var SLOT_LABELS = {
    Head: "Head",
    Shoulder: "Shoulders",
    Back: "Cloak",
    Chest: "Chest",
    Gloves: "Gloves",
    Legs: "Legs",
    Boots: "Boots",
    Bracelet1: "Bracelet 1",
    Bracelet2: "Bracelet 2",
    Necklace: "Necklace",
    Ring1: "Ring 1",
    Ring2: "Ring 2",
    Earring1: "Earring 1",
    Earring2: "Earring 2",
    Pocket: "Pocket",
    PrimaryWeapon: "Main hand",
    SecondaryWeapon: "Off hand",
    RangedWeapon: "Ranged",
    CraftTool: "Craft tool",
    Class: "Class item",
  };

  function emptyStore() {
    return { version: 1, selectedId: "", characters: [] };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function label(value) {
    if (typeof value !== "string" || value === "" || value === "Undefined") return "";
    return value.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function classKey(value) {
    var name = value && typeof value === "object" ? value.class : value;
    if (typeof name !== "string" || name === "") return null;
    return CLASS_KEYS[name.toLowerCase().replace(/[^a-z]/g, "")] || null;
  }

  function slotLabel(slot) {
    if (typeof slot !== "string" || slot === "") return "Equipment";
    return SLOT_LABELS[slot] || label(slot) || slot;
  }

  function describe(text) {
    if (typeof text !== "string" || text === "") return "";
    var safe = escapeHtml(text).replace(/&lt;string table error;[\s\S]*?&gt;/gi, "");
    safe = safe.replace(/&lt;rgb=#([0-9A-Fa-f]{3,8})&gt;([\s\S]*?)&lt;\/rgb&gt;/g, function (_match, hex, inner) {
      if (!/^[0-9A-Fa-f]{3}$/.test(hex) && !/^[0-9A-Fa-f]{6}$/.test(hex) && !/^[0-9A-Fa-f]{8}$/.test(hex)) return inner;
      return '<span style="color:#' + hex + '">' + inner + "</span>";
    });
    return safe.replace(/\n/g, "<br>");
  }

  function iconSources(id, kind) {
    if (typeof id !== "number" || !isFinite(id)) return [];
    var base = "";
    if (typeof window !== "undefined" && window.LOTRO_CDN) {
      base = String(window.LOTRO_CDN).replace(/\/$/, "");
    }
    var folders = kind === "skill" ? ["skills", "items"] : kind === "effect" ? ["effects", "items"] : ["items"];
    var urls = [];
    var iconId = String(Math.floor(id));
    for (var i = 0; i < folders.length; i++) urls.push(base + "/img/icons/" + folders[i] + "/" + iconId + ".png");
    return urls;
  }

  var LIST_KEYS = {
    items: 1,
    equipment: 1,
    wallet: 1,
    professions: 1,
    recipes: 1,
    ingredients: 1,
    trained: 1,
    untrained: 1,
    effects: 1,
    notes: 1,
    trainedGambits: 1,
  };

  function looksLikeBag(value) {
    return !!value && typeof value === "object" && Array.isArray(value.items) && !value.character;
  }

  function looksLikePluginData(source) {
    return /^\s*return\b/.test(source) || (/^\s*\{/.test(source) && /\[\s*"/.test(source.slice(0, 800)));
  }

  function normalizeLua(value, key) {
    if (value === null || typeof value !== "object") return value;
    var keys = Object.keys(value);
    var allNumeric = keys.length > 0 && keys.every(function (name) {
      return /^(0|[1-9]\d*)$/.test(name);
    });
    if (allNumeric || (keys.length === 0 && LIST_KEYS[key])) {
      keys.sort(function (a, b) { return Number(a) - Number(b); });
      return keys.map(function (name) { return normalizeLua(value[name], null); });
    }
    var out = {};
    for (var n = 0; n < keys.length; n++) out[keys[n]] = normalizeLua(value[keys[n]], keys[n]);
    return out;
  }

  // Turbine PluginData is a Lua `return { ... }` table. Lists are written as
  // [1.000000] = ... rather than JSON arrays.
  function parsePluginData(source) {
    var s = source;
    var i = 0;

    function fail(message) {
      throw new Error(message);
    }

    function skip() {
      while (i < s.length) {
        var c = s.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13) {
          i += 1;
          continue;
        }
        if (s.charCodeAt(i) === 45 && s.charCodeAt(i + 1) === 45) {
          i += 2;
          if (s.charCodeAt(i) === 91) {
            var eq = 0;
            var mark = i + 1;
            while (s.charCodeAt(mark) === 61) {
              eq += 1;
              mark += 1;
            }
            if (s.charCodeAt(mark) === 91) {
              var close = "]" + new Array(eq + 1).join("=") + "]";
              var end = s.indexOf(close, mark + 1);
              i = end < 0 ? s.length : end + close.length;
              continue;
            }
          }
          while (i < s.length && s.charCodeAt(i) !== 10) i += 1;
          continue;
        }
        break;
      }
    }

    function parseString(quote) {
      var q = quote.charCodeAt(0);
      i += 1;
      var out = "";
      while (i < s.length) {
        var c = s.charCodeAt(i);
        if (c === q) {
          i += 1;
          return out;
        }
        if (c === 10 || c === 13) fail("A string in the PluginData file was not closed.");
        if (c !== 92) {
          out += s.charAt(i);
          i += 1;
          continue;
        }
        i += 1;
        var e = s.charAt(i);
        i += 1;
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "\\") out += "\\";
        else if (e === "\"") out += "\"";
        else if (e === "'") out += "'";
        else if (e === "a") out += "\u0007";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "v") out += "\u000b";
        else if (e === "\n") { /* escaped line break */ }
        else if (e === "\r") { if (s.charAt(i) === "\n") i += 1; }
        else if (e === "x") {
          out += String.fromCharCode(parseInt(s.slice(i, i + 2), 16));
          i += 2;
        } else if (e >= "0" && e <= "9") {
          var digits = e;
          var extra = 0;
          while (extra < 2 && s.charAt(i) >= "0" && s.charAt(i) <= "9") {
            digits += s.charAt(i);
            i += 1;
            extra += 1;
          }
          out += String.fromCharCode(parseInt(digits, 10));
        } else if (e === "z") {
          while (s.charAt(i) === " " || s.charAt(i) === "\t" || s.charAt(i) === "\n" || s.charAt(i) === "\r") i += 1;
        } else if (e) out += e;
        else fail("A string in the PluginData file was not closed.");
      }
      fail("A string in the PluginData file was not closed.");
    }

    function parseLongString() {
      var eq = 0;
      i += 1;
      while (s.charAt(i) === "=") {
        eq += 1;
        i += 1;
      }
      if (s.charAt(i) !== "[") fail("That PluginData file could not be read.");
      i += 1;
      if (s.charAt(i) === "\r") i += 1;
      if (s.charAt(i) === "\n") i += 1;
      var close = "]" + new Array(eq + 1).join("=") + "]";
      var end = s.indexOf(close, i);
      if (end < 0) fail("A string in the PluginData file was not closed.");
      var out = s.slice(i, end);
      i = end + close.length;
      return out;
    }

    function parseNumber() {
      var start = i;
      if (s.charAt(i) === "-") i += 1;
      if (s.charAt(i) < "0" || s.charAt(i) > "9") fail("That PluginData file could not be read.");
      while (s.charAt(i) >= "0" && s.charAt(i) <= "9") i += 1;
      if (s.charAt(i) === ".") {
        i += 1;
        while (s.charAt(i) >= "0" && s.charAt(i) <= "9") i += 1;
      }
      if (s.charAt(i) === "e" || s.charAt(i) === "E") {
        i += 1;
        if (s.charAt(i) === "+" || s.charAt(i) === "-") i += 1;
        while (s.charAt(i) >= "0" && s.charAt(i) <= "9") i += 1;
      }
      var value = Number(s.slice(start, i));
      if (value === Infinity) return Number.MAX_VALUE;
      if (value === -Infinity) return -Number.MAX_VALUE;
      if (value !== value) fail("That PluginData file has a number the browser cannot read.");
      return value;
    }

    function keyword(word) {
      if (s.slice(i, i + word.length) !== word) return false;
      var after = s.charAt(i + word.length);
      if ((after >= "a" && after <= "z") || (after >= "A" && after <= "Z") || (after >= "0" && after <= "9") || after === "_") return false;
      i += word.length;
      return true;
    }

    function parseValue() {
      skip();
      var c = s.charAt(i);
      if (c === "{") return parseTable();
      if (c === "\"" || c === "'") return parseString(c);
      if (c === "[") return parseLongString();
      if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
      if (keyword("true")) return true;
      if (keyword("false")) return false;
      if (keyword("nil")) return null;
      fail("That PluginData file could not be read.");
    }

    function keyName(key) {
      if (typeof key === "number" && isFinite(key) && Math.floor(key) === key) return String(key);
      return String(key);
    }

    function parseTable() {
      if (s.charAt(i) !== "{") fail("That PluginData file could not be read.");
      i += 1;
      var table = {};
      while (true) {
        skip();
        if (s.charAt(i) === "}") {
          i += 1;
          return table;
        }
        var key = null;
        if (s.charAt(i) === "[") {
          i += 1;
          key = parseValue();
          skip();
          if (s.charAt(i) !== "]") fail("That PluginData file could not be read.");
          i += 1;
        } else {
          var ident = "";
          var start = i;
          while (i < s.length) {
            var ch = s.charAt(i);
            var ok = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || (ident && ch >= "0" && ch <= "9");
            if (!ok) break;
            ident += ch;
            i += 1;
          }
          if (!ident || ident === "true" || ident === "false" || ident === "nil") {
            i = start;
            fail("That PluginData file could not be read.");
          }
          key = ident;
        }
        skip();
        if (s.charAt(i) !== "=") fail("That PluginData file could not be read.");
        i += 1;
        table[keyName(key)] = parseValue();
        skip();
        if (s.charAt(i) === ",") {
          i += 1;
          continue;
        }
        if (s.charAt(i) === "}") {
          i += 1;
          return table;
        }
        fail("That PluginData file could not be read.");
      }
    }

    skip();
    if (keyword("return")) skip();
    var data = parseValue();
    skip();
    if (i < s.length) fail("That PluginData file could not be read.");
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("That PluginData file is not a PlayLog snapshot.");
    if (typeof data.json === "string" && (data.format === "playlog-json" || typeof data.character === "string")) {
      try {
        return JSON.parse(data.json);
      } catch (error) {
        fail("The json field in that PluginData file is not a PlayLog snapshot.");
      }
    }
    return normalizeLua(data, null);
  }

  function parse(text) {
    if (typeof text !== "string") throw new Error("Choose a PlayLogSnapshot.plugindata file, or paste the snapshot.");
    var source = text.replace(/^\uFEFF/, "").trim();
    if (!source) throw new Error("Choose a PlayLogSnapshot.plugindata file, or paste the snapshot.");
    if (source.length > MAX_TEXT) throw new Error("That export is too large to import in the browser.");

    var data = null;
    var pluginData = looksLikePluginData(source);
    if (!pluginData) {
      try {
        data = JSON.parse(source);
      } catch (error) {
        var start = source.indexOf("{");
        var end = source.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            data = JSON.parse(source.slice(start, end + 1));
          } catch (inner) {
            data = null;
          }
        }
      }
    }
    if (!data && (pluginData || source.indexOf("[\"") >= 0 || source.indexOf("['") >= 0)) {
      try {
        data = parsePluginData(source);
      } catch (error) {
        if (pluginData) throw error;
        data = null;
      }
    }
    if (!data) throw new Error("That file is not a PlayLog snapshot. Choose PlayLogSnapshot.plugindata from Documents\\The Lord of the Rings Online\\PluginData, or paste the JSON from /playlog.");

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("That text is not a PlayLog character snapshot.");
    }
    if (!data.character && (data.backpack || looksLikeBag(data))) {
      throw new Error("This is only bag data. Snapshot the character in PlayLog and paste the full JSON, which starts with schemaVersion and includes the character.");
    }
    if (!data.character || typeof data.character !== "object" || typeof data.character.name !== "string" || !data.character.name.trim()) {
      throw new Error("This export has no character name. Snapshot the character in PlayLog and paste the full JSON.");
    }
    if (data.character.name.trim().length > MAX_NAME) throw new Error("That character name is too long.");
    if (data.schemaVersion != null && data.schemaVersion !== 1) {
      throw new Error("This PlayLog export uses schema version " + data.schemaVersion + ", which this site cannot read yet.");
    }
    data.character.name = data.character.name.trim();
    return data;
  }

  function validEntry(entry) {
    return !!(
      entry &&
      typeof entry.id === "string" &&
      entry.snapshot &&
      entry.snapshot.character &&
      typeof entry.snapshot.character.name === "string"
    );
  }

  function load() {
    if (typeof localStorage === "undefined") return emptyStore();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.characters)) return emptyStore();
      return {
        version: 1,
        selectedId: typeof data.selectedId === "string" ? data.selectedId : "",
        characters: data.characters.filter(validEntry),
      };
    } catch (error) {
      return emptyStore();
    }
  }

  function stripRecipes(store) {
    var copy = JSON.parse(JSON.stringify(store));
    copy.characters.forEach(function (entry) {
      var professions = entry.snapshot && entry.snapshot.crafting && entry.snapshot.crafting.professions;
      if (!Array.isArray(professions)) return;
      professions.forEach(function (profession) {
        if (Array.isArray(profession.recipes)) {
          profession.recipeCount = profession.recipes.length;
          delete profession.recipes;
        }
      });
    });
    return copy;
  }

  function write(store) {
    if (typeof localStorage === "undefined") throw new Error("This browser cannot store characters.");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return "";
    } catch (error) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stripRecipes(store)));
        return "Recipe lists were left out because this browser ran out of storage space.";
      } catch (again) {
        throw new Error("This browser could not store the character. Remove a saved character, or snapshot PlayLog without recipes.");
      }
    }
  }

  function slug(value) {
    var text = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return text || "character";
  }

  function sameName(entry, name) {
    return entry.snapshot.character.name.trim().toLowerCase() === name.toLowerCase();
  }

  function upsert(snapshot, server) {
    var name = snapshot.character.name.trim();
    var serverName = typeof server === "string" ? server.trim() : "";
    if (serverName.length > MAX_SERVER) throw new Error("Server names are limited to " + MAX_SERVER + " characters.");
    var store = load();
    var matches = store.characters.filter(function (entry) {
      return sameName(entry, name);
    });
    var target = null;
    var notice = "";
    if (serverName) {
      target = matches.filter(function (entry) {
        return (entry.server || "").toLowerCase() === serverName.toLowerCase();
      })[0] || null;
    } else if (matches.length === 1) {
      target = matches[0];
      serverName = target.server || "";
    } else if (matches.length > 1) {
      target = matches.slice().sort(function (a, b) {
        return String(b.importedAt || "").localeCompare(String(a.importedAt || ""));
      })[0];
      serverName = target.server || "";
      notice = "Updated the most recent " + name + ". Enter a server name to keep characters with the same name separate.";
    }

    var updated = !!target;
    if (!target) {
      var ids = {};
      store.characters.forEach(function (entry) {
        ids[entry.id] = true;
      });
      var id = slug(serverName ? serverName + " " + name : name);
      var suffix = 2;
      while (ids[id]) {
        id = slug(serverName ? serverName + " " + name : name) + "-" + suffix;
        suffix += 1;
      }
      target = { id: id, server: serverName, importedAt: "", snapshot: snapshot };
      store.characters.unshift(target);
    } else {
      target.server = serverName;
      target.snapshot = snapshot;
      store.characters = [target].concat(store.characters.filter(function (entry) {
        return entry.id !== target.id;
      }));
    }
    target.importedAt = new Date().toISOString();
    store.selectedId = target.id;
    var storageNotice = write(store);
    if (!notice) notice = updated ? "Updated " + name + "." : "Imported " + name + ".";
    if (storageNotice) notice += " " + storageNotice;
    return { character: target, updated: updated, notice: notice };
  }

  function select(id) {
    var store = load();
    if (!store.characters.some(function (entry) { return entry.id === id; })) return store;
    store.selectedId = id;
    write(store);
    return store;
  }

  function remove(id) {
    var store = load();
    store.characters = store.characters.filter(function (entry) { return entry.id !== id; });
    if (store.selectedId === id) store.selectedId = store.characters.length ? store.characters[0].id : "";
    write(store);
    return store;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SLOT_ORDER: SLOT_ORDER,
    parse: parse,
    load: load,
    upsert: upsert,
    select: select,
    remove: remove,
    classKey: classKey,
    label: label,
    slotLabel: slotLabel,
    describe: describe,
    escapeHtml: escapeHtml,
    iconSources: iconSources,
  };
});
