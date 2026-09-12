(function(){
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var banner = document.getElementById("banner");
  var list = document.getElementById("list");
  var checkedEl = document.getElementById("checked");
  var footChecked = document.getElementById("footchecked");
  var board = document.getElementById("board");
  var counts = document.getElementById("counts");
  var poll = document.getElementById("poll");
  var notice = document.getElementById("notice");
  var transcript = document.getElementById("transcript");
  var ansi = document.getElementById("ansi");

  var rows = Object.create(null);
  var lastChecked = null;
  var firstRender = true;
  var nextPoll = Date.now() + SB.POLL_INTERVAL_MS;
  var fetching = false;
  var failed = false;
  var startup = SB.firstVisit("sb-status-started");

  function bootLine(text){
    if(!startup) return;
    var line = document.createElement("p");
    line.textContent = text;
    transcript.appendChild(line);
  }

  function validate(sites){
    if(!Array.isArray(sites) || !sites.every(function(s){
      return s && typeof s.host === "string" && s.host.length > 0 &&
        ["live", "maintenance", "down"].includes(s.state);
    })) throw new Error("invalid status response");
  }

  function makeRow(site, index){
    var row = document.createElement("div");
    row.className = "svc ln";

    var idx = document.createElement("span");
    idx.className = "idx";
    idx.setAttribute("aria-hidden", "true");
    idx.textContent = (index + 1 < 10 ? "0" : "") + (index + 1);

    var name = document.createElement("span");
    name.className = "name";
    name.textContent = site.host;

    var history = SB.makeHistory();

    var badge = document.createElement("span");
    badge.className = "badge";

    row.append(idx, name, history, badge);
    list.appendChild(row);
    var port = SB.makePort(board, site);
    return {row: row, badge: badge, history: history,
      port: port.port, jack: port.jack, state: null};
  }

  function render(sites){
    SB.hideSkeleton();
    SB.dropMissingRows(rows, sites);
    sites.forEach(function(site, index){
      var r = rows[site.host] || (rows[site.host] = makeRow(site, index));
      SB.pushHistory(r, site.state);
      if(r.state === site.state) return;
      r.row.className = "svc ln in " + site.state + (r.state ? " changed" : "");
      r.badge.className = "badge " + site.state;
      r.badge.textContent = SB.badgeText(site.state);
      r.state = site.state;
      SB.updatePort(r, site.state);
    });

    var summary = SB.summarize(sites);
    document.body.dataset.state = summary.state;
    if(banner.textContent !== summary.verdict){
      banner.textContent = summary.verdict;
      SB.paintVerdict(ansi, summary.verdict);
    }
    counts.textContent = summary.counts;

    var empty = document.getElementById("empty");
    if(sites.length === 0 && !empty){
      empty = document.createElement("p");
      empty.id = "empty";
      empty.className = "empty";
      var title = document.createElement("b");
      title.textContent = "nothing to report";
      var hint = document.createElement("span");
      hint.textContent =
        "the switchboard is running but has no services to watch. " +
        "states will appear here as soon as it has some.";
      empty.append(title, hint);
      list.appendChild(empty);
    }
    if(sites.length && empty) empty.remove();

    if(firstRender){
      firstRender = false;
      if(!reduce) SB.revealLines();
    }
  }

  function tickChecked(){
    var age = SB.freshness(lastChecked, failed);
    document.body.dataset.stale = String(age.stale);
    checkedEl.textContent = age.label;
    footChecked.textContent = age.label + " · responses may be cached for 30s";
    poll.textContent = SB.pollText(nextPoll, fetching);
    if(notice.textContent !== age.notice) notice.textContent = age.notice;
    if(age.stale && banner.textContent !== "updates unavailable"){
      banner.textContent = "updates unavailable";
      SB.paintVerdict(ansi, "updates unavailable");
    }
  }
  setInterval(tickChecked, 1000);

  async function load(){
    if(fetching) return;
    fetching = true;
    poll.dataset.poll = "fetching";
    tickChecked();
    try {
      var data = await SB.fetchJSON("/api/status", {cache: "no-store"});
      validate(data.sites);
      failed = false;
      lastChecked = Date.now();
      render(data.sites);
      poll.dataset.poll = "received";
      bootLine("[ok] /api/status returned · " + data.sites.length + " services discovered");
      bootLine("[ok] report rendered · refresh interval 30s");
      SB.rememberVisit("sb-status-started");
    } catch(err){
      failed = true;
      poll.dataset.poll = "failed";
      Object.keys(rows).forEach(function(host){ SB.pushHistory(rows[host], "gap"); });
      bootLine("[!] first request failed · retry scheduled");
    } finally {
      fetching = false;
      startup = false;
      tickChecked();
    }
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
  bootLine("[init] switchboard · requesting /api/status");
  load();
  setInterval(function(){
    nextPoll = Date.now() + SB.POLL_INTERVAL_MS;
    if(!document.hidden) load();
  }, SB.POLL_INTERVAL_MS);
})();
