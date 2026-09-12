(function(){
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var banner = document.getElementById("banner");
  var list = document.getElementById("list");
  var log = document.getElementById("log");
  var errEl = document.getElementById("err");
  var clock = document.getElementById("clock");
  var greencount = document.getElementById("greencount");
  var board = document.getElementById("board");
  var counts = document.getElementById("counts");
  var poll = document.getElementById("poll");
  var notice = document.getElementById("notice");
  var footstat = document.getElementById("footstat");
  var transcript = document.getElementById("transcript");
  var ansi = document.getElementById("ansi");

  var rows = Object.create(null);
  var lastChecked = null;
  var firstRender = true;
  var nextPoll = Date.now() + SB.POLL_INTERVAL_MS;
  var pendingLoad = null;
  var failed = false;
  var startup = SB.firstVisit("sb-dashboard-started");

  function bootLine(text){
    if(!startup) return;
    var line = document.createElement("p");
    line.textContent = text;
    transcript.appendChild(line);
  }

  function validate(sites){
    if(!Array.isArray(sites) || !sites.every(function(s){
      return s && typeof s.host === "string" && /^[a-z0-9.-]+$/.test(s.host) &&
        ["live", "maintenance", "down"].includes(s.state) && typeof s.maintenance === "boolean" &&
        (s.http_status === null || Number.isInteger(s.http_status));
    })) throw new Error("invalid status response");
  }

  function tickChecked(){
    var age = SB.freshness(lastChecked, failed);
    document.body.dataset.stale = String(age.stale);
    footstat.textContent = age.label + " · responses may be cached for 30s";
    poll.textContent = SB.pollText(nextPoll, pendingLoad);
    if(notice.textContent !== age.notice) notice.textContent = age.notice;
    if(age.stale){
      if(banner.textContent !== "updates unavailable"){
        banner.textContent = "updates unavailable";
        SB.paintVerdict(ansi, "updates unavailable");
      }
      greencount.textContent = "unverified";
    }
  }

  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function hms(){
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  clock.textContent = hms();
  setInterval(function(){ clock.textContent = hms(); tickChecked(); }, 1000);

  function makeRow(site, index){
    var row = document.createElement("div");
    row.className = "svc ln";

    var idx = document.createElement("span");
    idx.className = "idx";
    idx.setAttribute("aria-hidden", "true");
    idx.textContent = (index + 1 < 10 ? "0" : "") + (index + 1);

    var name = document.createElement("a");
    name.className = "name";
    name.href = "https://" + site.host;
    name.target = "_blank";
    name.rel = "noopener";
    name.textContent = site.host;

    var history = SB.makeHistory();

    var http = document.createElement("span");
    http.className = "http";

    var badge = document.createElement("span");
    badge.className = "badge";

    var sw = document.createElement("button");
    sw.className = "switch";
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", "maintenance mode for " + site.host);
    var switchLabel = document.createElement("span");
    switchLabel.className = "switch-label";
    switchLabel.textContent = "maint.";
    var switchState = document.createElement("span");
    sw.append(switchLabel, switchState);
    sw.addEventListener("click", function(){ toggle(site.host, sw); });

    row.append(idx, name, history, http, badge, sw);
    list.appendChild(row);
    var port = SB.makePort(board, site);
    return {row: row, http: http, badge: badge, sw: sw, switchState: switchState,
      history: history, port: port.port, jack: port.jack, state: null};
  }

  function updateRow(site, index){
    var r = rows[site.host] || (rows[site.host] = makeRow(site, index));
    SB.pushHistory(r, site.state);
    if(r.state !== site.state){
      r.row.className = "svc ln in " + site.state + (r.state ? " changed" : "");
      r.badge.className = "badge " + site.state;
      r.badge.textContent = SB.badgeText(site.state);
      r.state = site.state;
      SB.updatePort(r, site.state);
    }
    var http = site.http_status === null ? "[---]" : "[" + site.http_status + "]";
    if(r.http.textContent !== http) r.http.textContent = http;
    var checked = String(site.maintenance);
    if(r.sw.getAttribute("aria-checked") !== checked){
      r.sw.setAttribute("aria-checked", checked);
      if(!r.sw.disabled) r.switchState.textContent = site.maintenance ? "on" : "off";
    }
  }

  function render(sites){
    SB.hideSkeleton();
    SB.dropMissingRows(rows, sites);
    sites.forEach(updateRow);

    var summary = SB.summarize(sites);
    document.body.dataset.state = summary.state;
    if(banner.textContent !== summary.verdict){
      banner.textContent = summary.verdict;
      SB.paintVerdict(ansi, summary.verdict);
    }
    counts.textContent = summary.counts;
    greencount.textContent = summary.live + "/" + summary.total + " live";

    var empty = document.getElementById("empty");
    if(sites.length === 0 && !empty){
      empty = document.createElement("p");
      empty.id = "empty";
      empty.className = "empty";
      var title = document.createElement("b");
      title.textContent = "no services configured";
      var hint = document.createElement("span");
      hint.textContent =
        "set SITES in .env to a comma-separated list of hosts, then restart the " +
        "container. they will show up here on the next poll.";
      empty.append(title, hint);
      list.appendChild(empty);
    }
    if(sites.length && empty) empty.remove();

    if(firstRender){
      firstRender = false;
      if(!reduce) SB.revealLines();
    }
  }

  function logLine(host, maintenance){
    var e = document.createElement("div");
    e.className = "entry";
    var t = document.createElement("span");
    t.className = "t";
    t.textContent = "[ " + hms() + " ] ";
    var body = document.createElement("span");
    body.textContent = host + " → maintenance " + (maintenance ? "on " : "off ");
    var tag = document.createElement("span");
    tag.className = maintenance ? "warn" : "ok";
    tag.textContent = maintenance ? "[ flag set ]" : "[ flag cleared ]";
    e.append(t, body, tag);
    log.appendChild(e);

    var entries = log.querySelectorAll(".entry");
    if(entries.length > 5){
      var oldest = entries[0];
      if(reduce){ oldest.remove(); }
      else {
        oldest.classList.add("fade");
        setTimeout(function(){ oldest.remove(); }, 500);
      }
    }
  }

  async function fetchSites(){
    poll.dataset.poll = "fetching";
    poll.textContent = "fetching status…";
    try {
      var sites = await SB.fetchJSON("/api/sites", {cache: "no-store"});
      validate(sites);
      failed = false;
      lastChecked = Date.now();
      render(sites);
      poll.dataset.poll = "received";
      bootLine("[ok] /api/sites returned · " + sites.length + " services discovered");
      bootLine("[ok] maintenance controls rendered · refresh interval 30s");
      SB.rememberVisit("sb-dashboard-started");
    } catch(err){
      failed = true;
      poll.dataset.poll = "failed";
      Object.keys(rows).forEach(function(host){ SB.pushHistory(rows[host], "gap"); });
      bootLine("[!] first request failed · retry scheduled");
    } finally {
      startup = false;
    }
  }

  function load(){
    if(!pendingLoad){
      pendingLoad = fetchSites().finally(function(){ pendingLoad = null; tickChecked(); });
    }
    return pendingLoad;
  }

  async function toggle(host, sw){
    sw.disabled = true;
    var r = rows[host];
    r.switchState.textContent = "saving…";
    sw.setAttribute("aria-busy", "true");
    try {
      var data = await SB.fetchJSON("/api/sites/" + encodeURIComponent(host) + "/toggle", {method: "POST"});
      if(data.host !== host || typeof data.maintenance !== "boolean") throw new Error("invalid toggle response");
      logLine(data.host, data.maintenance);
      errEl.textContent = "";
    } catch(err){
      errEl.textContent = "could not confirm maintenance change for " + host + ". refreshing reported state.";
    }
    // A poll started before the write may still carry the previous flag state.
    if(pendingLoad) await pendingLoad;
    await load();
    sw.disabled = false;
    sw.removeAttribute("aria-busy");
    r.switchState.textContent = sw.getAttribute("aria-checked") === "true" ? "on" : "off";
  }

  list.addEventListener("animationend", function(event){ event.target.classList.remove("changed"); });
  document.addEventListener("visibilitychange", function(){
    document.body.classList.toggle("tab-hidden", document.hidden);
    if(!document.hidden) load();
    tickChecked();
  });
  SB.initCrt(document.getElementById("crt"));
  SB.paintVerdict(ansi, banner.textContent);
  SB.showSkeleton(list);
  bootLine("[init] switchboard · requesting /api/sites");
  load();
  setInterval(function(){
    nextPoll = Date.now() + SB.POLL_INTERVAL_MS;
    if(!document.hidden) load();
  }, SB.POLL_INTERVAL_MS);
})();
