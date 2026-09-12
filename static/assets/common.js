// Shared helpers for both pages. Each page owns its own row markup, response
// shape and validation; this file holds only what is identical in both.
var SB = (function(){
  "use strict";

  var REQUEST_TIMEOUT_MS = 10000;
  var STALE_AFTER_SECONDS = 45;
  var POLL_INTERVAL_MS = 30000;

  function firstVisit(storageKey){
    try { return !sessionStorage.getItem(storageKey); } catch(err){ return true; }
  }

  function rememberVisit(storageKey){
    try { sessionStorage.setItem(storageKey, "1"); } catch(err){}
  }

  function makePort(board, site){
    var port = document.createElement("li");
    port.className = "port";
    var signal = document.createElement("span");
    signal.className = "signal";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = site.host;
    port.append(signal, label);
    board.appendChild(port);
    return {port: port, signal: signal};
  }

  function updatePort(r, state){
    r.port.dataset.state = state;
    r.signal.textContent = state === "live" ? "[━●━] live" :
      state === "maintenance" ? "[━◐ ] maintenance" : "[━× ] down";
  }

  function badgeText(state){
    if(state === "live") return "● live";
    if(state === "maintenance") return "◐ maintenance";
    return "○ down";
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
    firstVisit: firstVisit,
    rememberVisit: rememberVisit,
    makePort: makePort,
    updatePort: updatePort,
    badgeText: badgeText,
    summarize: summarize,
    dropMissingRows: dropMissingRows,
    revealLines: revealLines,
    fetchJSON: fetchJSON,
    freshness: freshness,
    pollText: pollText
  };
})();
