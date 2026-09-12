// Shared helpers for both pages. Each page owns its own row markup, response
// shape and validation; this file holds only what is identical in both.
var SB = (function(){
  "use strict";

  var REQUEST_TIMEOUT_MS = 10000;
  var STALE_AFTER_SECONDS = 45;
  var POLL_INTERVAL_MS = 30000;
  var HISTORY_SLOTS = 24;
  var ANSI_MAX_COLS = 96;

  // ---- ANSI Shadow banner ----
  // generated with pyfiglet, font ansi_shadow; 6 rows per glyph
  var ANSI_SHADOW = {" ":["    ","    ","    ","    ","    ","    "],"A":[" █████╗ ","██╔══██╗","███████║","██╔══██║","██║  ██║","╚═╝  ╚═╝"],"B":["██████╗ ","██╔══██╗","██████╔╝","██╔══██╗","██████╔╝","╚═════╝ "],"C":[" ██████╗","██╔════╝","██║     ","██║     ","╚██████╗"," ╚═════╝"],"D":["██████╗ ","██╔══██╗","██║  ██║","██║  ██║","██████╔╝","╚═════╝ "],"E":["███████╗","██╔════╝","█████╗  ","██╔══╝  ","███████╗","╚══════╝"],"F":["███████╗","██╔════╝","█████╗  ","██╔══╝  ","██║     ","╚═╝     "],"G":[" ██████╗ ","██╔════╝ ","██║  ███╗","██║   ██║","╚██████╔╝"," ╚═════╝ "],"H":["██╗  ██╗","██║  ██║","███████║","██╔══██║","██║  ██║","╚═╝  ╚═╝"],"I":["██╗","██║","██║","██║","██║","╚═╝"],"J":["     ██╗","     ██║","     ██║","██   ██║","╚█████╔╝"," ╚════╝ "],"K":["██╗  ██╗","██║ ██╔╝","█████╔╝ ","██╔═██╗ ","██║  ██╗","╚═╝  ╚═╝"],"L":["██╗     ","██║     ","██║     ","██║     ","███████╗","╚══════╝"],"M":["███╗   ███╗","████╗ ████║","██╔████╔██║","██║╚██╔╝██║","██║ ╚═╝ ██║","╚═╝     ╚═╝"],"N":["███╗   ██╗","████╗  ██║","██╔██╗ ██║","██║╚██╗██║","██║ ╚████║","╚═╝  ╚═══╝"],"O":[" ██████╗ ","██╔═══██╗","██║   ██║","██║   ██║","╚██████╔╝"," ╚═════╝ "],"P":["██████╗ ","██╔══██╗","██████╔╝","██╔═══╝ ","██║     ","╚═╝     "],"Q":[" ██████╗ ","██╔═══██╗","██║   ██║","██║▄▄ ██║","╚██████╔╝"," ╚══▀▀═╝ "],"R":["██████╗ ","██╔══██╗","██████╔╝","██╔══██╗","██║  ██║","╚═╝  ╚═╝"],"S":["███████╗","██╔════╝","███████╗","╚════██║","███████║","╚══════╝"],"T":["████████╗","╚══██╔══╝","   ██║   ","   ██║   ","   ██║   ","   ╚═╝   "],"U":["██╗   ██╗","██║   ██║","██║   ██║","██║   ██║","╚██████╔╝"," ╚═════╝ "],"V":["██╗   ██╗","██║   ██║","██║   ██║","╚██╗ ██╔╝"," ╚████╔╝ ","  ╚═══╝  "],"W":["██╗    ██╗","██║    ██║","██║ █╗ ██║","██║███╗██║","╚███╔███╔╝"," ╚══╝╚══╝ "],"X":["██╗  ██╗","╚██╗██╔╝"," ╚███╔╝ "," ██╔██╗ ","██╔╝ ██╗","╚═╝  ╚═╝"],"Y":["██╗   ██╗","╚██╗ ██╔╝"," ╚████╔╝ ","  ╚██╔╝  ","   ██║   ","   ╚═╝   "],"Z":["███████╗","╚══███╔╝","  ███╔╝ "," ███╔╝  ","███████╗","╚══════╝"],"0":[" ██████╗ ","██╔═████╗","██║██╔██║","████╔╝██║","╚██████╔╝"," ╚═════╝ "],"1":[" ██╗","███║","╚██║"," ██║"," ██║"," ╚═╝"],"2":["██████╗ ","╚════██╗"," █████╔╝","██╔═══╝ ","███████╗","╚══════╝"],"3":["██████╗ ","╚════██╗"," █████╔╝"," ╚═══██╗","██████╔╝","╚═════╝ "],"4":["██╗  ██╗","██║  ██║","███████║","╚════██║","     ██║","     ╚═╝"],"5":["███████╗","██╔════╝","███████╗","╚════██║","███████║","╚══════╝"],"6":[" ██████╗ ","██╔════╝ ","███████╗ ","██╔═══██╗","╚██████╔╝"," ╚═════╝ "],"7":["███████╗","╚════██║","    ██╔╝","   ██╔╝ ","   ██║  ","   ╚═╝  "],"8":[" █████╗ ","██╔══██╗","╚█████╔╝","██╔══██╗","╚█████╔╝"," ╚════╝ "],"9":[" █████╗ ","██╔══██╗","╚██████║"," ╚═══██║"," █████╔╝"," ╚════╝ "]};

  function glyphWidth(ch){
    var glyph = ANSI_SHADOW[ch];
    return glyph ? glyph[0].length : 0;
  }

  function wordWidth(word){
    var total = 0;
    for (var i = 0; i < word.length; i++) total += glyphWidth(word[i]);
    return total;
  }

  // Greedy word wrap measured in glyph columns, not characters: "I" is three
  // columns wide and "M" is eleven, so counting letters would wrap wrongly.
  function wrapWords(words){
    var lines = [];
    var current = [];
    var width = 0;
    var space = glyphWidth(" ");
    words.forEach(function(word){
      var next = wordWidth(word);
      var added = current.length ? width + space + next : next;
      if(current.length && added > ANSI_MAX_COLS){
        lines.push(current);
        current = [word];
        width = next;
        return;
      }
      current.push(word);
      width = added;
    });
    if(current.length) lines.push(current);
    return lines;
  }

  function renderLine(words){
    var text = words.join(" ");
    var rows = ["", "", "", "", "", ""];
    for (var i = 0; i < text.length; i++){
      var glyph = ANSI_SHADOW[text[i]];
      for (var row = 0; row < rows.length; row++) rows[row] += glyph[row];
    }
    return rows;
  }

  // Returns null for anything the font cannot draw, so the caller can keep
  // showing plain text instead of a half-rendered banner.
  function ansiArt(text){
    var upper = String(text).toUpperCase();
    var words = upper.split(/\s+/).filter(Boolean);
    if(!words.length) return null;
    for (var i = 0; i < upper.length; i++){
      if(!ANSI_SHADOW[upper[i]] && !/\s/.test(upper[i])) return null;
    }
    var rows = [];
    var cols = 0;
    wrapWords(words).forEach(function(line){
      var rendered = renderLine(line);
      cols = Math.max(cols, rendered[0].length);
      rows = rows.concat(rendered);
    });
    return {rows: rows.join("\n"), cols: cols};
  }

  // Paints the verdict as block letters and hands the column count to CSS,
  // which sizes the type so the widest line fits its container.
  function paintVerdict(ansiEl, text){
    if(!ansiEl) return false;
    var art = ansiArt(text);
    if(!art){
      document.body.classList.remove("ansi-on");
      return false;
    }
    ansiEl.textContent = art.rows;
    ansiEl.style.setProperty("--ansi-cols", art.cols);
    document.body.classList.add("ansi-on");
    return true;
  }

  // ---- CRT ----
  // The effect is heavy enough that it needs an off switch. The preference is
  // per-browser and the page must still work when storage is unavailable.
  function readPref(key){
    try { return localStorage.getItem(key); } catch(err){ return null; }
  }

  function writePref(key, value){
    try { localStorage.setItem(key, value); } catch(err){}
  }

  function initCrt(button){
    var on = readPref("sb-crt") !== "off";
    function apply(){
      document.body.classList.toggle("crt-off", !on);
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "crt on" : "crt off";
    }
    button.addEventListener("click", function(){
      on = !on;
      writePref("sb-crt", on ? "on" : "off");
      apply();
    });
    apply();
  }

  function firstVisit(storageKey){
    try { return !sessionStorage.getItem(storageKey); } catch(err){ return true; }
  }

  function rememberVisit(storageKey){
    try { sessionStorage.setItem(storageKey, "1"); } catch(err){}
  }

  function makePort(board, site){
    var port = document.createElement("li");
    port.className = "port";
    var jack = document.createElement("span");
    jack.className = "jack";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = site.host;
    port.append(jack, label);
    board.appendChild(port);
    return {port: port, jack: jack};
  }

  function updatePort(r, state){
    r.port.dataset.state = state;
    r.jack.textContent = state;
  }

  // One cell per poll this page has observed, oldest on the left. A failed
  // poll writes a gap so an outage in the checker reads differently from a
  // service that was actually down.
  function makeHistory(){
    var strip = document.createElement("div");
    strip.className = "history";
    strip.setAttribute("aria-hidden", "true");
    for (var i = 0; i < HISTORY_SLOTS; i++) strip.appendChild(document.createElement("i"));
    return strip;
  }

  function pushHistory(r, state){
    if(!r.seen) r.seen = [];
    r.seen.push(state);
    if(r.seen.length > HISTORY_SLOTS) r.seen.shift();
    var cells = r.history.children;
    var offset = HISTORY_SLOTS - r.seen.length;
    for (var i = 0; i < cells.length; i++){
      var seen = i < offset ? null : r.seen[i - offset];
      if(seen) cells[i].setAttribute("data-seen", seen);
      else cells[i].removeAttribute("data-seen");
    }
  }

  // The state bar and the badge colour carry the same signal, so the badge
  // only needs the word. No glyph noise.
  function badgeText(state){
    return state;
  }

  function countState(sites, state){
    return sites.filter(function(s){ return s.state === state; }).length;
  }

  function summarize(sites){
    var live = countState(sites, "live");
    var maintenance = countState(sites, "maintenance");
    var down = countState(sites, "down");
    return {
      live: live,
      maintenance: maintenance,
      down: down,
      total: sites.length,
      state: down ? "down" : maintenance ? "maintenance" : live ? "live" : "unknown",
      verdict: down ? down + (down === 1 ? " service down" : " services down") :
        maintenance ? "maintenance in progress" : live ? "all systems green" : "no services configured",
      counts: live + " live / " + maintenance + " maintenance / " + down + " down"
    };
  }

  function dropMissingRows(rows, sites){
    var hosts = new Set(sites.map(function(s){ return s.host; }));
    Object.keys(rows).forEach(function(host){
      if(hosts.has(host)) return;
      rows[host].row.remove();
      rows[host].port.remove();
      delete rows[host];
    });
  }

  // Rows shaped like the real thing while the first poll is in flight.
  function showSkeleton(list){
    var skeleton = document.createElement("div");
    skeleton.className = "skeleton";
    skeleton.id = "skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++){
      var bone = document.createElement("div");
      bone.className = "bone";
      skeleton.appendChild(bone);
    }
    list.appendChild(skeleton);
  }

  function hideSkeleton(){
    var skeleton = document.getElementById("skeleton");
    if(skeleton) skeleton.remove();
  }

  function revealLines(){
    document.body.classList.add("anim");
    document.querySelectorAll(".ln").forEach(function(line, i){
      line.classList.remove("in");
      setTimeout(function(){ line.classList.add("in"); }, Math.min(i * 55, 330));
    });
  }

  async function fetchJSON(url, options){
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, Object.assign({signal: controller.signal}, options));
      if(!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // Age of the last successful poll, and whether the page should stop
  // presenting its rows as current.
  function freshness(lastChecked, failed){
    var seconds = lastChecked === null ? null : Math.max(0, Math.floor((Date.now() - lastChecked) / 1000));
    var stale = failed || (seconds !== null && seconds > STALE_AFTER_SECONDS);
    return {
      seconds: seconds,
      stale: stale,
      label: seconds === null ? "unverified" : (stale ? "stale · " : "updated ") + seconds + "s ago",
      notice: !stale ? "" : seconds === null ? "updates unavailable. retrying next poll." :
        "updates unavailable. showing last received states; current availability is unverified."
    };
  }

  function pollText(nextPoll, fetching){
    if(document.hidden) return "updates paused · tab hidden";
    if(fetching) return "fetching status…";
    return "next refresh in " + Math.max(0, Math.ceil((nextPoll - Date.now()) / 1000)) + "s";
  }

  return {
    POLL_INTERVAL_MS: POLL_INTERVAL_MS,
    initCrt: initCrt,
    firstVisit: firstVisit,
    rememberVisit: rememberVisit,
    makePort: makePort,
    updatePort: updatePort,
    paintVerdict: paintVerdict,
    ansiArt: ansiArt,
    makeHistory: makeHistory,
    pushHistory: pushHistory,
    showSkeleton: showSkeleton,
    hideSkeleton: hideSkeleton,
    badgeText: badgeText,
    summarize: summarize,
    dropMissingRows: dropMissingRows,
    revealLines: revealLines,
    fetchJSON: fetchJSON,
    freshness: freshness,
    pollText: pollText
  };
})();
