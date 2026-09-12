const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {createContext, runInContext} = require("node:vm");

const readAsset = (name) => readFileSync(join(__dirname, "../static/assets", name), "utf8");

// Assets a page pulls in, in document order, with their query string stripped.
// Anything not served from /assets/ would be a request off this origin.
function assetsOf(html, tag, attribute, required) {
  const tags = new RegExp("<" + tag + "\\b[^>]*>", "gi");
  const url = new RegExp(attribute + '="([^"]+)"', "i");
  return [...html.matchAll(tags)].map((match) => {
    if (required && !match[0].includes(required)) return null;
    const found = match[0].match(url);
    if (!found || found[1].startsWith("data:")) return null;
    assert(found[1].startsWith("/assets/"), "asset outside /assets/: " + found[1]);
    return found[1].slice("/assets/".length).split("?")[0];
  }).filter(Boolean);
}

function checkFonts() {
  const css = readAsset("common.css");
  assert(!/@import\b/.test(css), "external CSS import");
  for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
    assert(match[1].startsWith("data:"), "non-inline CSS asset");
  }
  const fonts = [...css.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(fonts.length, 2);
  fonts.forEach((font) => assert.equal(Buffer.from(font[1], "base64").toString("ascii", 0, 4), "wOF2"));
  assert(css.includes("SIL OPEN FONT LICENSE Version 1.1"));
}

async function check(page) {
  const html = readFileSync(join(__dirname, "../static", page + ".html"), "utf8");
  const styles = assetsOf(html, "link", "href", 'rel="stylesheet"');
  const scripts = assetsOf(html, "script", "src");
  assert.deepEqual(styles, ["common.css", page + ".css"]);
  assert.deepEqual(scripts, ["common.js", page + ".js"]);
  const bytes = [html, ...styles.map(readAsset), ...scripts.map(readAsset)]
    .reduce((total, text) => total + Buffer.byteLength(text), 0);
  assert(bytes < 150000, "page and assets exceed transfer budget");
  assert(html.includes("<noscript>"));

  // A minimal DOM exercises the shipped scripts; layout remains a browser check.
  const nodes = [];
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.attrs = {};
      this.events = {};
      this.className = "";
      this.textContent = "";
      this.classList = {
        add: (name) => { this.className += " " + name; },
        remove: (name) => { this.className = this.className.split(" ").filter((c) => c !== name).join(" "); },
        toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
      };
      nodes.push(this);
    }
    append(...children) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); }
    remove() { this.removed = true; this.parent.children = this.parent.children.filter((child) => child !== this); }
    setAttribute(key, value) { this.attrs[key] = value; }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(event, callback) { this.events[event] = callback; }
    querySelectorAll(selector) { return this.children.filter((child) => child.className.split(" ").includes(selector.slice(1))); }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) new Element().id = match[1];
  const byId = (id) => nodes.find((node) => node.id === id && !node.removed);
  const events = {};
  const document = {
    body: new Element(), hidden: false,
    createElement: () => new Element(), getElementById: byId,
    querySelectorAll: (selector) => nodes.filter((node) => node.className.split(" ").includes(selector.slice(1))),
    addEventListener: (event, callback) => { events[event] = callback; },
  };
  const site = (host, state) => ({host, state, maintenance: state === "maintenance", http_status: state === "down" ? null : 200});
  let sites = [site("live.example.com", "live"), site("maint.example.com", "maintenance"), site("down.example.com", "down")];
  let failure = false;
  let malformed = false;
  let now = 100000;
  const intervals = new Map();
  const timeouts = new Map();
  const requests = [];
  const sandbox = {
    document, window: {matchMedia: () => ({matches: true})},
    sessionStorage: {getItem() { throw new Error("storage blocked"); }, setItem() { throw new Error("storage blocked"); }},
    Date: class extends Date { static now() { return now; } }, AbortController,
    setInterval: (callback, ms) => intervals.set(ms, callback),
    setTimeout: (callback, ms) => { timeouts.set(callback, ms); return callback; },
    clearTimeout: (id) => timeouts.delete(id),
    fetch: async (url, options = {}) => {
      requests.push(url);
      assert(url.startsWith("/api/"), "request leaves same-origin API");
      if (failure) throw new Error("private server failure details");
      if (options.method === "POST") {
        sites[0].maintenance = !sites[0].maintenance;
        sites[0].state = sites[0].maintenance ? "maintenance" : "down";
        return {ok: true, json: async () => ({host: sites[0].host, maintenance: sites[0].maintenance})};
      }
      if (malformed) return {ok: true, json: async () => ({sites: [{state: "invalid"}]})};
      return {ok: true, json: async () => page === "status" ? {sites, all_ok: sites.every((s) => s.state === "live")} : sites};
    },
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const context = createContext(sandbox);
  scripts.forEach((name) => runInContext(readAsset(name), context, {filename: name}));
  await settle();
  assert.equal(byId("banner").textContent, "1 service down");
  assert.equal(byId("counts").textContent, "1 live / 1 maintenance / 1 down");
  assert.equal(byId("board").children.length, 3);
  assert.equal(byId("transcript").children.length, 3, "blocked storage must not prevent startup");
  const firstRow = byId("list").children[0];
  const refresh = async () => { intervals.get(30000)(); await settle(); };
  const initialRequests = requests.length;
  document.hidden = true;
  events.visibilitychange();
  await refresh();
  assert.equal(requests.length, initialRequests, "hidden tabs must not poll");
  now += 46000;
  intervals.get(1000)();
  assert.equal(document.body.dataset.stale, "true");
  document.hidden = false;
  events.visibilitychange();
  await settle();
  assert.equal(document.body.dataset.stale, "false");

  failure = true;
  await refresh();
  assert.equal(byId("banner").textContent, "updates unavailable");
  assert.equal(byId("list").children[0], firstRow, "failure should retain the snapshot");
  assert(byId("notice").textContent.includes("last received states"));
  assert(!byId("notice").textContent.includes("private server"));
  failure = false;
  malformed = true;
  await refresh();
  assert.equal(document.body.dataset.stale, "true", "malformed response must not clear stale state");
  malformed = false;
  sites = [site("live.example.com", "live")];
  await refresh();
  assert.equal(byId("banner").textContent, "all systems green");
  assert.equal(document.body.dataset.stale, "false");
  assert.equal(byId("list").children[0], firstRow, "polling must preserve row and keyboard focus");
  assert.equal(byId("board").children.length, 1, "removed services must leave the strip");

  if (page === "dashboard") {
    const button = firstRow.children.find((child) => child.className.includes("switch"));
    button.events.click();
    assert.equal(button.disabled, true);
    await settle();
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-checked"), "true");
    assert.equal(byId("banner").textContent, "maintenance in progress");
    button.events.click();
    await settle();
    assert.equal(button.getAttribute("aria-checked"), "false");
    assert.equal(byId("banner").textContent, "1 service down", "clearing a flag must not imply live");
    failure = true;
    button.events.click();
    await settle();
    assert.equal(button.disabled, false);
    assert(byId("err").textContent.includes("could not confirm"));
    assert(!byId("err").textContent.includes("private server"));
    failure = false;
  }
  sites = [];
  await refresh();
  assert.equal(byId("banner").textContent, "no services configured");
  assert.equal(byId("board").children.length, 0);
  assert.equal(timeouts.size, 0, "request timeouts must be cleared");
  console.log(page + ": asset paths, transfer budget, polling, stale recovery and state checks passed");
}

(async () => { checkFonts(); await check("status"); await check("dashboard"); })().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
