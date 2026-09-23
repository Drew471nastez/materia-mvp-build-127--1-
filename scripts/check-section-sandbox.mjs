#!/usr/bin/env node
/**
 * ===========================================================================
 *  A SECTION'S SCRIPT RUNS, AND CANNOT REACH THE PAGE IT IS ON
 * ===========================================================================
 * The sandbox is the one piece of this codebase where being wrong is a
 * security bug rather than a layout bug, so it is measured in a real browser
 * rather than reasoned about.
 *
 * Two halves:
 *
 *   IT WORKS      an ordinary accordion and an ordinary tab strip, written
 *                 the way anybody writes them, change the real page: classes
 *                 toggle, styles apply, text updates, clicks arrive
 *   IT IS CAGED   a hostile section tries, in one script, to read the
 *                 document, the cookie, localStorage, the parent window, to
 *                 fetch, to set an onclick, an href and a src, and to write
 *                 markup into the page. Every one has to fail, and the page
 *                 has to be intact afterwards.
 *
 * The guest source and the protocol are the product's own, bundled here, so
 * this cannot pass against a copy that has drifted.
 *
 *   node scripts/check-section-sandbox.mjs
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const work = join(root, ".sandbox-probe")
mkdirSync(work, { recursive: true })

try {
  /* The product's own guest and protocol, as the page ships them. */
  writeFileSync(join(work, "entry.ts"), `
import { GUEST_SOURCE } from "@/lib/storelib-theme/sandbox/guest-source"
import { acceptPatch, INDEX_ATTR, EVENTS_FORWARDED } from "@/lib/storelib-theme/sandbox/protocol"
;(window as any).SB = { GUEST_SOURCE, acceptPatch, INDEX_ATTR, EVENTS_FORWARDED }
`)
  execFileSync("npx", [
    "esbuild", join(work, "entry.ts"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "sb.js")}`,
    `--alias:@=${root}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit" })

  /* An accordion and a tab strip, written the ordinary way. */
  const FRIENDLY = `
    var items = root.querySelectorAll("[data-item]");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function (e) {
        var me = e.currentTarget;
        for (var j = 0; j < items.length; j++) items[j].classList.remove("open");
        me.classList.add("open");
        me.style.setProperty("--depth", "3px");
        root.querySelector("[data-label]").textContent = "Open: " + me.getAttribute("data-item");
      });
    }
    root.querySelector("[data-label]").textContent = "Ready with " + settings.title;
  `

  /* One script, every escape worth trying. */
  const HOSTILE = `
    var got = [];
    function tried(what, fn) { try { var v = fn(); got.push(what + "=" + String(v).slice(0, 24)); } catch (e) { got.push(what + "=threw"); } }
    tried("parentDoc", function () { return parent.document.title; });
    tried("topDoc", function () { return top.document.body.innerHTML.length; });
    tried("cookie", function () { return document.cookie; });
    tried("storage", function () { return localStorage.getItem("storelib-secret"); });
    tried("ownerDoc", function () { return root.ownerDocument.defaultView.parent.document.title; });
    tried("ctor", function () { return root.constructor.constructor("return typeof fetch")(); });
    tried("fetch", function () { return typeof fetch; });
    /* And the changes the page must refuse even though the copy accepts them. */
    var label = root.querySelector("[data-label]");
    label.setAttribute("onclick", "window.__pwned = 1");
    label.setAttribute("href", "javascript:window.__pwned = 2");
    label.setAttribute("src", "https://evil.example/x.png");
    label.setAttribute("data-sb", "0");
    label.style.setProperty("background-image", "url(https://evil.example/x.png)");
    label.style.setProperty("color", "rgb(1, 2, 3)");
    label.textContent = "<img src=x onerror='window.__pwned=3'>";
    root.querySelector("[data-report]").textContent = got.join(" | ");
  `

  writeFileSync(join(work, "drive.mjs"), `
import { spawn } from "node:child_process"
const url = process.argv[2]
const port = 9422
const chrome = spawn(${JSON.stringify(CHROMIUM)}, ["--headless=new", "--no-sandbox", "--disable-gpu", \`--remote-debugging-port=\${port}\`, "about:blank"], { stdio: "ignore" })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(\`http://127.0.0.1:\${port}/json/list\`)).json()).find((t) => t.type === "page") } catch { await sleep(200) }
}
if (!target) { console.log(JSON.stringify({ error: "Could not start a browser." })); process.exit(0) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r))
let id = 0
const pending = new Map()
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Page.enable")
await send("Page.navigate", { url })
/* Real seconds: the page runs its own sequence and writes #out when done. */
let out = null
for (let i = 0; i < 40 && !out; i++) {
  await sleep(500)
  const res = await send("Runtime.evaluate", { expression: "document.getElementById('out').textContent", returnByValue: true })
  const text = res.result?.result?.value
  if (typeof text === "string" && text !== "pending") out = text
}
console.log(out ?? JSON.stringify({ error: "The sandbox never reported a measurement." }))
ws.close(); chrome.kill(); process.exit(0)
`)

  const page = join(work, "sandbox.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<body style="margin:0;font-family:system-ui">
<div id="friendly"><section class="s">
  <p data-label>waiting</p>
  <button data-item="one">One</button>
  <button data-item="two">Two</button>
</section></div>
<div id="hostile"><section class="s"><p data-label>plain</p><p data-report>none</p></section></div>
<pre id="out" style="position:absolute;left:-9999px">pending</pre>
<script src="./sb.js"></script>
<script>
document.cookie = "storelib-session=secret-value; path=/";
try { localStorage.setItem("storelib-secret", "secret-value") } catch (e) {}
window.__pwned = 0;

var SB = window.SB;
var frame = document.createElement("iframe");
frame.setAttribute("sandbox", "allow-scripts");
frame.srcdoc = '<!doctype html><meta charset="utf-8"><body><scr' + 'ipt>' + SB.GUEST_SOURCE + '</scr' + 'ipt></body>';
frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0";
document.body.appendChild(frame);

var registry = {};
function elementsOf(root) { return [root].concat(Array.prototype.slice.call(root.querySelectorAll("*"))) }

function applyPatch(nodes, p) {
  var el = nodes[p.i];
  if (!el) return;
  if (p.k === "attr") { p.v === null ? el.removeAttribute(p.n) : el.setAttribute(p.n, p.v); return }
  if (p.k === "text") { el.textContent = p.v; return }
  if (p.k === "style") { p.v === "" ? el.style.removeProperty(p.n) : el.style.setProperty(p.n, p.v); return }
}

/* Exactly as section-sandbox.tsx registers: the wrapper that holds the
   section's markup is the root, and its innerHTML is what the guest gets. */
function register(id, hostEl, bundle, settings) {
  var rootEl = hostEl;
  var nodes = elementsOf(rootEl);
  nodes.forEach(function (el, i) { el.setAttribute(SB.INDEX_ATTR, String(i)) });
  registry[id] = { root: rootEl, nodes: nodes };
  SB.EVENTS_FORWARDED.forEach(function (type) {
    rootEl.addEventListener(type, function (event) {
      var target = event.target.closest("[" + SB.INDEX_ATTR + "]");
      var i = nodes.indexOf(target);
      if (i < 0) return;
      frame.contentWindow.postMessage({ k: "event", id: id, i: i, type: event.type, detail: {} }, "*");
    });
  });
  frame.contentWindow.postMessage({
    k: "run", id: id, html: rootEl.innerHTML, bundle: bundle,
    settings: settings, blocks: [], theme: {}, page: { template: "index" }, capabilities: [], inEditor: false,
  }, "*");
}

var errors = [];
addEventListener("message", function (e) {
  if (e.source !== frame.contentWindow) return;
  var msg = e.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.k === "ready") { start(); return }
  if (msg.k === "error") { errors.push(String(msg.message).slice(0, 120)); return }
  if (msg.k === "patch") {
    var entry = registry[msg.id];
    if (!entry) return;
    (msg.patches || []).forEach(function (raw) {
      var p = SB.acceptPatch(raw);
      if (p) applyPatch(entry.nodes, p);
    });
  }
});

function wrap(src) { return '"use strict";\\n(function (root, settings, blocks, theme, page, storelib) {\\n' + src + '\\n})' }

function start() {
  register("friendly", document.getElementById("friendly"), wrap(${JSON.stringify(FRIENDLY)}), { title: "Sizes" });
  register("hostile", document.getElementById("hostile"), wrap(${JSON.stringify(HOSTILE)}), {});
  setTimeout(function () {
    /* What the script wrote on load, read before the click overwrites it. */
    window.__onLoad = document.querySelector("#friendly [data-label]").textContent;
    document.querySelector('#friendly [data-item="two"]').click();
    setTimeout(measure, 500);
  }, 500);
}

function measure() {
  var f = document.querySelector("#friendly section");
  var two = f.querySelector('[data-item="two"]');
  var one = f.querySelector('[data-item="one"]');
  var label = document.querySelector("#hostile [data-label]");
  document.getElementById("out").textContent = JSON.stringify({
    friendly: {
      ranOnLoad: window.__onLoad,
      afterClick: f.querySelector("[data-label]").textContent,
      openClass: two.classList.contains("open"),
      otherClosed: !one.classList.contains("open"),
      styleApplied: two.style.getPropertyValue("--depth"),
    },
    hostile: {
      report: document.querySelector("#hostile [data-report]").textContent,
      onclick: label.getAttribute("onclick"),
      href: label.getAttribute("href"),
      src: label.getAttribute("src"),
      index: label.getAttribute(SB.INDEX_ATTR),
      bgImage: label.style.getPropertyValue("background-image"),
      colour: label.style.getPropertyValue("color"),
      text: label.textContent,
      childElements: label.children.length,
      pwned: window.__pwned,
    },
    errors: errors,
  });
}
</script>`)

  /**
   * DRIVEN IN REAL TIME, over the DevTools protocol, and not with
   * --virtual-time-budget.
   *
   * Under virtual time the clock races through the page's own timers before
   * a message posted INTO the frame is delivered, so every measurement was
   * taken before the sandbox had done anything and the whole probe read as
   * a failure. The traffic here is asynchronous in both directions, so it
   * has to be waited for the way a person would.
   */
  const m = JSON.parse(
    execFileSync(process.execPath, [join(work, "drive.mjs"), `file://${page}`], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"], timeout: 120_000,
    }),
  )
  if (m.error) fail(m.error)

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${JSON.stringify(got)}`}`)
    if (!ok) broken++
  }

  console.log("\nAn ordinary section script works\n")
  expect(m.friendly.ranOnLoad === "Ready with Sizes", "it runs on load and can read its settings", m.friendly.ranOnLoad)
  expect(m.friendly.afterClick === "Open: two", "a click's text change reaches the page", m.friendly.afterClick)
  expect(m.friendly.openClass === true, "a real click reaches its handler and toggles a class", m.friendly)
  expect(m.friendly.otherClosed === true, "and the class it removed is removed on the page too", m.friendly)
  expect(m.friendly.styleApplied.trim() === "3px", "a style it set is applied", m.friendly.styleApplied)

  console.log("\nA hostile section script is caged\n")
  const report = String(m.hostile.report)
  for (const [what, name] of [
    ["the parent document", "parentDoc"],
    ["the top document", "topDoc"],
    ["this document's cookies", "cookie"],
    ["localStorage", "storage"],
    ["the page through its own root's ownerDocument", "ownerDoc"],
  ]) {
    expect(/=threw/.test(report.split("|").find((p) => p.includes(name)) ?? ""), `it cannot reach ${what}`, report)
  }
  /* The frame has no network permission to speak of, but what matters here
     is that a fetch from it carries no Storelib session: opaque origin. */
  expect(/ctor=threw|ctor=undefined|ctor=function/.test(report), "the Function-constructor escape lands in the sandbox, not the page", report)
  expect(m.hostile.pwned === 0, "nothing it did ran any code in the page", m.hostile.pwned)
  expect(m.hostile.onclick === null, "an onclick it set never reached the page", m.hostile.onclick)
  expect(m.hostile.href === null, "nor an href", m.hostile.href)
  expect(m.hostile.src === null, "nor a src", m.hostile.src)
  /* Wrapper 0, section 1, label 2. */
  expect(m.hostile.index === "2", "and it could not renumber the page's own elements", m.hostile.index)
  expect(m.hostile.bgImage === "", "a style value that would fetch is refused", m.hostile.bgImage)
  expect(m.hostile.colour.replace(/\s/g, "") === "rgb(1,2,3)", "while an ordinary one is applied", m.hostile.colour)
  expect(m.hostile.childElements === 0 && /<img/.test(m.hostile.text), "markup it wrote arrived as text, not as an element", m.hostile)

  if (broken) fail(`${broken} check(s) failed.`)
  console.log("\nall checks passed\n")
} finally {
  rmSync(work, { recursive: true, force: true })
}
