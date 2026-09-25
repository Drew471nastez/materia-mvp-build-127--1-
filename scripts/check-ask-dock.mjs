/**
 * ===========================================================================
 *  ASK STORELIB, THIS ROUND, MEASURED
 * ===========================================================================
 * The real ThemeChat, mounted by scripts/render-ask-ai.tsx the way the editor
 * mounts it, over a canvas of photographs and text. Everything it talks to is
 * faked here, before anything loads: a database of conversations (list,
 * read, delete one, delete all, report), the agent's stream (lines the probe
 * pushes one at a time, over fetch or, with pictures, over XMLHttpRequest
 * with upload progress), the clipboard and a speech recogniser.
 *
 *   FADE       the glow round the pill has no edge: the page with it and
 *              without it are compared pixel by pixel along lines through
 *              its border, and no step between neighbours may be more than
 *              a few levels. The old blurred band, with its mask dropped as
 *              an engine that does not honour it would, is measured the
 *              same way to show the check sees an edge
 *   LABELS     at 360, 390 and 430: the mode row is one row, the mode labels
 *              and the placeholders fit on one line in both modes, the
 *              header with Connect AI does not overflow, suggestion chips do
 *              not wrap
 *   STATES     a made up run, line by line: the one line says each stage,
 *              changes as it moves on transform and opacity only, folds
 *              finished steps, and ends on the answer with how much changed,
 *              Undo, Copy and Report. A kind of line the chat has never seen
 *              ({type: "status"}, {type: "tool"}) shows too. Long tasks and
 *              frame gaps are counted while it streams
 *   HISTORY    grouped by day, opened, continued, a new chat, one deleted in
 *              place, the open one deleted, all deleted; and before the
 *              database update, one plain sentence
 *   MODELS     the Claude and OpenAI marks on every choice and the trigger;
 *              a popover on a computer, the shared bottom sheet on a phone
 *   PICTURES   a large photo is shrunk to 1568 on its long edge with a ring
 *              while it is, a PDF and a HEIC say why not, a fifth picture is
 *              refused, paste and drop work, a recorded video becomes
 *              stills, and a send shows its upload progress
 *   VOICE      words type in a few characters a frame while spoken, a
 *              revision is cut back rather than jumped, the box ends with
 *              exactly what was heard, the clock sits over the model button
 *              and nothing on the row moves
 *   KEYBOARD   the phone's field is 16px (iOS zooms the page to anything
 *              smaller), focusing it shifts nothing; a tablet's keyboard
 *              lifts the dock above it
 *
 *   node scripts/check-ask-dock.mjs     (PROBE_CSS=source without a build)
 *
 * Screenshots go to $SHOTS_DIR (or a temp directory) with the prefix dock-.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face)")
const stubs = join(root, ".ask-dock-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-askdock-")), "shots")
mkdirSync(shots, { recursive: true })
const P = "dock-"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const measures = {}

/* ── everything the chat talks to, before anything loads ───────────────── */
const PRELUDE = `
window.__shifts = [];
window.__long = [];
window.__shiftSources = [];
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) { window.__shifts.push(e.value); (e.sources || []).forEach(function (s) { var n = s.node; window.__shiftSources.push((n && n.nodeType === 1 ? n.tagName + "." + String(n.className).slice(0, 60) + " " + (n.textContent || "").slice(0, 30) : String(n && n.nodeName)) + " " + JSON.stringify([s.previousRect.y, s.currentRect.y, s.previousRect.height, s.currentRect.height])) }) } }) }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__long.push(Math.round(e.duration)) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
window.__posts = []; window.__deletes = []; window.__reports = []; window.__copied = [];
try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function (t) { window.__copied.push(t); return Promise.resolve() } } }) } catch (e) {}
(function () {
  var q = new URLSearchParams(location.search);
  var now = Date.now(), H = 3600000, D = 86400000;
  var uid = function () { return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16) }) };
  var iso = function (ms) { return new Date(ms).toISOString() };
  /* The fake database: conversations with their messages, and the messages from before conversations. */
  var db = window.__db = {
    unset: q.get("db") === "unset",
    reportsUnset: q.get("reports") === "unset",
    conversations: [
      { id: "11111111-1111-4111-8111-111111111111", title: "Make the header black", updatedAt: iso(now - 5 * 60000), messages: [
        { id: "a1111111-0000-4000-8000-000000000001", role: "user", content: "Make the header black", ops: [], error: null },
        { id: "a1111111-0000-4000-8000-000000000002", role: "assistant", content: "Changed the header background to black.", ops: [{ kind: "update_section", id: "s1", settings: {} }], error: null } ] },
      { id: "22222222-2222-4222-8222-222222222222", title: "Add a newsletter under the FAQ", updatedAt: iso(now - 26 * H), messages: [
        { id: "a2222222-0000-4000-8000-000000000001", role: "user", content: "Add a newsletter under the FAQ", ops: [], error: null },
        { id: "a2222222-0000-4000-8000-000000000002", role: "assistant", content: "Added a newsletter signup under the FAQ.", ops: [{ kind: "add_section", id: "n1", sectionType: "promo_newsletter" }], error: null } ] },
      { id: "33333333-3333-4333-8333-333333333333", title: "Warmer colours", updatedAt: iso(now - 3 * D), messages: [
        { id: "a3333333-0000-4000-8000-000000000001", role: "user", content: "Warmer colours", ops: [], error: null } ] },
      { id: "44444444-4444-4444-8444-444444444444", title: "Shorter hero heading", updatedAt: iso(now - 20 * D), messages: [] },
      { id: "55555555-5555-4555-8555-555555555555", title: "Rounder buttons", updatedAt: iso(now - 70 * D), messages: [] }
    ],
    earlier: q.get("earlier") === "1" ? [{ id: "e0000000-0000-4000-8000-000000000001", role: "user", content: "From before conversations", ops: [], error: null }] : []
  };
  if (q.get("empty") === "1") db.conversations = [];
  var find = function (id) { return db.conversations.filter(function (c) { return c.id === id })[0] };
  var json = function (body, status) { return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json" } })) };
  var list = function () {
    var rows = db.conversations.slice().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1 });
    return { conversations: rows.map(function (c) { return { id: c.id, title: c.title, updatedAt: c.updatedAt } }), earlier: db.earlier.length ? { preview: db.earlier[0].content, updatedAt: iso(now - 40 * D) } : null };
  };
  var enc = new TextEncoder();
  /* The agent: every line of a run is pushed by the probe (manual) or played (auto). */
  window.__agentMode = q.get("agent") || "auto";
  var run = null;
  var startRun = function (body, deliver, end) {
    var conv = body.conversationId ? find(body.conversationId) : null;
    if (!conv) { conv = { id: uid(), title: body.prompt || "A picture", updatedAt: iso(Date.now()), messages: [] }; db.conversations.push(conv) }
    var userId = uid();
    conv.messages.push({ id: userId, role: "user", content: body.prompt, ops: [], error: null });
    conv.updatedAt = iso(Date.now());
    run = { conv: conv, deliver: deliver, end: end, reply: "" };
    window.__push = function (line) { if (line.type === "message") run.reply = line.text; run.deliver(JSON.stringify(line) + "\\n") };
    window.__end = function () { conv.messages.push({ id: uid(), role: "assistant", content: run.reply, ops: [], error: null }); run.end() };
    deliver(JSON.stringify({ type: "conversation", id: conv.id, title: conv.title }) + "\\n");
    deliver(JSON.stringify({ type: "recorded", messageId: userId }) + "\\n");
    if (window.__agentMode === "auto") {
      var lines = [
        { type: "step", id: "t1", label: "Reading the Hero", state: "running" },
        { type: "step", id: "t1", label: "Reading the Hero", state: "done" },
        { type: "op", op: { kind: "update_section", id: "s2", settings: {} }, label: "Updated Hero" },
        { type: "message", text: "Made the hero heading shorter." }
      ];
      var i = 0;
      var next = function () { if (i >= lines.length) { window.__end(); return } window.__push(lines[i++]); setTimeout(next, 90) };
      setTimeout(next, 90);
    }
  };
  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    var method = (init && init.method) || "GET";
    if (url.indexOf("/api/website-builder/transcribe") === 0) return json({ available: false });
    if (url.indexOf("/chat/report") >= 0) {
      window.__reports.push(JSON.parse(init.body));
      return db.reportsUnset ? json({ error: "x", reason: "not_set_up" }, 503) : json({ reported: true });
    }
    var m = url.match(/\\/chat\\/conversations(?:\\/([^?]+))?/);
    if (m) {
      if (method === "DELETE") {
        window.__deletes.push(m[1] || "all");
        if (!m[1]) { db.conversations = []; db.earlier = [] }
        else if (m[1] === "earlier") db.earlier = [];
        else db.conversations = db.conversations.filter(function (c) { return c.id !== m[1] });
        return json({ deleted: 1 });
      }
      if (db.unset) return json({ error: "x", reason: "not_set_up" }, 503);
      return json(list());
    }
    if (url.indexOf("/chat") >= 0 && method === "GET") {
      var which = new URL(url, location.href).searchParams.get("conversation");
      if (db.unset) return json({ conversation: null, earlier: false, history: "not_set_up", messages: db.conversations[0] ? db.conversations[0].messages : [] });
      if (which === "earlier") return json({ conversation: null, earlier: true, history: "ready", messages: db.earlier });
      var rows = list().conversations;
      var conv = which ? find(which) : (rows[0] ? find(rows[0].id) : null);
      return json({ conversation: conv ? { id: conv.id, title: conv.title } : null, earlier: false, history: "ready", messages: conv ? conv.messages : [] });
    }
    if (url.indexOf("/agent") >= 0) {
      var body = JSON.parse(init.body);
      window.__posts.push({ via: "fetch", conversationId: body.conversationId, images: (body.images || []).length, prompt: body.prompt });
      return new Promise(function (resolve) {
        var stream = new ReadableStream({ start: function (c) {
          startRun(body, function (text) { c.enqueue(enc.encode(text)) }, function () { try { c.close() } catch (e) {} });
        } });
        resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
      });
    }
    return json({});
  };
  /* A request with pictures goes over XMLHttpRequest for its upload progress. */
  window.XMLHttpRequest = function () {
    var self = this;
    this.readyState = 0; this.status = 0; this.responseText = ""; this.upload = {};
    this.open = function (m, u) { self._url = u; self.readyState = 1 };
    this.setRequestHeader = function () {};
    this.abort = function () { self.onabort && self.onabort() };
    this.send = function (text) {
      var body = JSON.parse(text);
      window.__posts.push({ via: "xhr", conversationId: body.conversationId, images: (body.images || []).length, prompt: body.prompt, sizes: [] });
      var post = window.__posts[window.__posts.length - 1];
      (body.images || []).forEach(function (im) {
        var img = new Image();
        img.onload = function () { post.sizes.push([img.naturalWidth, img.naturalHeight, im.mediaType, Math.round(im.data.length * 0.75 / 1024)]) };
        img.src = "data:" + im.mediaType + ";base64," + im.data;
      });
      var total = text.length;
      window.__uploadSteps = [];
      [0.2, 0.45, 0.7, 0.95].forEach(function (f, i) { setTimeout(function () { window.__uploadSteps.push(f); self.upload.onprogress && self.upload.onprogress({ lengthComputable: true, loaded: Math.round(total * f), total: total }) }, 350 * (i + 1)) });
      setTimeout(function () {
        self.status = 200; self.readyState = 2; self.onreadystatechange && self.onreadystatechange();
        self.readyState = 3;
        startRun(body, function (chunk) { self.responseText += chunk; self.onprogress && self.onprogress({}) }, function () { self.readyState = 4; self.onreadystatechange && self.onreadystatechange(); self.onload && self.onload() });
      }, 1600);
    };
  };
  /* A recogniser whose words arrive as a person says them: in bursts, one revised. */
  var Fake = function () { this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null };
  Fake.prototype.start = function () {
    var self = this;
    setTimeout(function () { self.onstart && self.onstart() }, 30);
    var say = [[300, "make", false], [700, "make the hero", false], [1100, "make the here", false], [1500, "make the hero heading", false], [1900, "make the hero heading shorter and calmer", true]];
    self._timers = say.map(function (s) { return setTimeout(function () { self.onresult && self.onresult({ resultIndex: 0, results: [{ isFinal: s[2], 0: { transcript: s[1] } }] }) }, s[0]) });
  };
  Fake.prototype.stop = function () { var self = this; setTimeout(function () { self.onend && self.onend() }, 30) };
  Fake.prototype.abort = function () { (this._timers || []).forEach(clearTimeout); this.onend && this.onend() };
  window.SpeechRecognition = Fake; window.webkitSpeechRecognition = Fake;
})();
`

/* The canvas behind the dock: photographs and text, so an edge has something to cut through. */
const PHOTOS = `
(function () {
  function paint() {
    var root = document.getElementById("wb-preview-root");
    if (!root) return requestAnimationFrame(paint);
    root.querySelectorAll("section").forEach(function (s, i) {
      s.style.background = i % 2 ? "linear-gradient(135deg, #f59e0b 0%, #ef4444 45%, #3b82f6 100%)" : "linear-gradient(200deg, #10b981 0%, #1a1a2e 60%, #f8f9fa 100%)";
      s.style.color = "#fff";
      s.querySelectorAll("h2, p").forEach(function (t) { t.style.color = i % 2 ? "#1a1a2e" : "#ffffff" });
      var stripe = document.createElement("div");
      stripe.style.cssText = "margin-top:16px;height:40px;background:repeating-linear-gradient(90deg,#fff 0 6px,#000 6px 12px);opacity:.55";
      s.appendChild(stripe);
    });
  }
  paint();
})();
`

const ANIMATED = `(scope) => {
  const out = new Set()
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target
    if (!t || !scope.contains(t)) continue
    if (a.transitionProperty) out.add(a.transitionProperty)
    else for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) out.add(p)
  }
  return [...out]
}`

async function page(browser, vp, query, hash, extraPrelude = "") {
  const p = await browser.newPage()
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}?${query}${hash}`)
  if (extraPrelude) await p.evaluate(extraPrelude)
  await sleep(900)
  return p
}
const lineText = (p) => p.evaluate(() => { const t = [...document.querySelectorAll('[data-ask-activity] [data-line="in"] [data-ask-line-text]')].pop(); return t ? t.firstChild.textContent : null })

/* ── FADE ─────────────────────────────────────────────────────────────── */
async function fade(browser, vp) {
  const label = `fade-${vp.width}`
  console.log(`\n${label}`)
  const p = await page(browser, vp, "agent=auto", "#desktop", PHOTOS)
  await sleep(300)
  /* Scroll so a photograph and a line of text sit behind the pill. */
  await p.evaluate(() => { document.getElementById("wb-preview-root").scrollTop = 470 })
  await sleep(300)
  const pill = await p.$eval("[data-ask-pill]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const main = await p.$eval("#canvas-main", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom } })
  const haloCss = await p.$eval("[data-ask-halo]", (e) => { const s = getComputedStyle(e); return { backdrop: s.backdropFilter, mask: s.maskImage || s.webkitMaskImage, shadow: s.boxShadow, opacity: s.opacity } })
  expect(haloCss.backdrop === "none" && (haloCss.mask === "none" || !haloCss.mask) && /rgba\(248, 249, 250/.test(haloCss.shadow) && haloCss.opacity === "1", "the glow is a soft shadow: no backdrop filter and no mask to be dropped", haloCss)

  const shot = async () => p.screenshot({ encoding: "base64", clip: { x: main.x, y: main.y, width: main.w, height: main.h } })
  const withGlow = await shot()
  await p.screenshot({ path: join(shots, `${P}${label}-pill.png`) })
  const near = { x: Math.max(0, pill.x - 160), y: Math.max(0, pill.y - 130), width: Math.min(vp.width - Math.max(0, pill.x - 160), pill.w + 320), height: Math.min(vp.height - Math.max(0, pill.y - 130), pill.h + 150) }
  await p.screenshot({ path: join(shots, `${P}${label}-glow-close.png`), clip: near })
  await p.evaluate(() => { document.querySelector("[data-ask-halo]").style.opacity = "0"; document.querySelector("[data-ask-halo]").style.transition = "none" })
  await sleep(100)
  const without = await shot()

  /* The old band, its mask dropped the way an engine that ignores it draws it. */
  await p.evaluate((g) => {
    const h = document.querySelector("[data-ask-halo]")
    h.style.cssText = `position:absolute;left:${g.left}px;width:${g.width}px;bottom:0;height:${g.height}px;background:rgba(248,249,250,0.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:1;border-radius:0;box-shadow:none;pointer-events:none`
  }, { left: pill.x - main.x - 56, width: pill.w + 112, height: main.b - (pill.y + pill.h) + pill.h + 36 })
  await sleep(150)
  const oldBand = await shot()
  await p.screenshot({ path: join(shots, `${P}${label}-old-band.png`) })

  const result = await p.evaluate(async (a, b, c, pill, main) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + src })
    const [ia, ib, ic] = await Promise.all([load(a), load(b), load(c)])
    const read = (img) => { const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const x = cv.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height) }
    const A = read(ia), B = read(ib), C = read(ic)
    const lum = (d, x, y) => { const i = (y * d.width + x) * 4; return 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2] }
    const px = (x) => Math.round(x - main.x), py = (y) => Math.round(y - main.y)
    /* Lines through the glow's border: rows above the pill and columns beside it, well past where it ends. */
    const rows = [pill.y - 8, pill.y - 24, pill.y - 44, pill.y + pill.h / 2].map(py)
    const cols = [pill.x - 12, pill.x - 40, pill.x + pill.w + 12, pill.x + pill.w + 40, pill.x + pill.w / 2].map(px)
    const x0 = Math.max(0, px(pill.x - 140)), x1 = Math.min(A.width - 2, px(pill.x + pill.w + 140))
    const y0 = Math.max(0, py(pill.y - 120)), y1 = A.height - 2
    /*
      WHAT IS MEASURED IS THE GLOW'S OWN OPACITY, pixel by pixel. A white
      layer of opacity a over a pixel of luminance c shows as c + a(W - c),
      so a = (with - without) / (W - without). The difference alone jumps
      wherever the page under it does (a stripe, a letter), however smooth
      the layer is; its opacity does not. Read only where the page is dark
      enough for the white to show (W - c > 60), between neighbours that
      both are.
    */
    const W = 0.2126 * 248 + 0.7152 * 249 + 0.0722 * 250
    const profile = (S, T, along) => {
      let worst = 0, peak = 0, edge = 0, read = 0
      for (const line of along.lines) {
        let prev = null
        for (let t = along.from; t <= along.to; t++) {
          const [x, y] = along.horizontal ? [t, line] : [line, t]
          /* Under the pill itself is not the glow. */
          if (x >= px(pill.x) && x <= px(pill.x + pill.w) && y >= py(pill.y) && y <= py(pill.y + pill.h)) { prev = null; continue }
          const base = lum(T, x, y)
          if (W - base <= 90) { prev = null; continue }
          const a = (lum(S, x, y) - base) / (W - base)
          read++
          peak = Math.max(peak, a)
          if (prev !== null) worst = Math.max(worst, Math.abs(a - prev))
          prev = a
        }
        const [ex, ey] = along.horizontal ? [along.from, line] : [line, along.from]
        edge = Math.max(edge, Math.abs(lum(S, ex, ey) - lum(T, ex, ey)))
      }
      return { step: +worst.toFixed(3), peak: +peak.toFixed(3), atEnds: +edge.toFixed(1), read }
    }
    const glowRows = profile(A, B, { lines: rows, from: x0, to: x1, horizontal: true })
    const glowCols = profile(A, B, { lines: cols, from: y0, to: y1, horizontal: false })
    const oldRows = profile(C, B, { lines: rows, from: x0, to: x1, horizontal: true })
    const oldCols = profile(C, B, { lines: cols, from: y0, to: y1, horizontal: false })
    return { glowRows, glowCols, oldRows, oldCols }
  }, withGlow, without, oldBand, pill, main)
  measures[label] = result
  const worstGlow = Math.max(result.glowRows.step, result.glowCols.step)
  const worstOld = Math.max(result.oldRows.step, result.oldCols.step)
  expect(result.glowRows.peak >= 0.15 && result.glowRows.peak <= 0.4 && result.glowRows.read > 200, "the glow is there, and faint: it lifts the page round the pill by at most 0.4", result.glowRows)
  expect(worstGlow <= 0.05, "and fades with no edge: its opacity never changes by more than 0.05 from one pixel to the next, along rows and columns through its border", { rows: result.glowRows, cols: result.glowCols })
  expect(result.glowRows.atEnds <= 1 && result.glowCols.atEnds <= 1, "it is nothing at all 140px out from the pill", { rows: result.glowRows.atEnds, cols: result.glowCols.atEnds })
  expect(worstOld >= 0.2, "and the same check on the old band, its mask dropped, finds its straight edge", { rows: result.oldRows, cols: result.oldCols })
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* ── LABELS ───────────────────────────────────────────────────────────── */
async function labels(browser, width) {
  const label = `phone-${width}`
  console.log(`\n${label}`)
  const p = await page(browser, { width, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "agent=auto&empty=1", "#phone")
  await sleep(500)
  const read = () => p.evaluate(() => {
    const row = document.querySelector("[data-ask-mode-row]")
    const kids = [...row.children].map((c) => { const r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right) } })
    const modes = [...document.querySelectorAll("[data-ask-mode]")].map((b) => ({ text: b.textContent, fits: b.scrollWidth <= b.clientWidth + 0.5, h: Math.round(b.getBoundingClientRect().height) }))
    const field = document.querySelector("[data-chat-composer] textarea")
    const fs = getComputedStyle(field)
    const cv = document.createElement("canvas").getContext("2d")
    cv.font = `${fs.fontWeight} ${fs.fontSize} ${fs.fontFamily}`
    const room = field.clientWidth - parseFloat(fs.paddingLeft) - parseFloat(fs.paddingRight)
    const header = document.querySelector("[data-ask-header]")
    const titleEl = document.querySelector("[data-ask-title]")
    const title = titleEl.getBoundingClientRect()
    const titleWhole = titleEl.scrollWidth <= titleEl.clientWidth + 0.5
    const chips = [...document.querySelectorAll("[data-ask-suggestion]")].map((c) => { const r = c.getBoundingClientRect(); return { t: c.textContent, top: Math.round(r.top), h: Math.round(r.height) } })
    return {
      rowH: Math.round(row.getBoundingClientRect().height), rowW: Math.round(row.getBoundingClientRect().right), sheetW: document.documentElement.clientWidth,
      oneRow: kids.every((k) => Math.abs(k.top - kids[0].top) <= 4),
      modes,
      placeholder: field.placeholder, fieldH: Math.round(field.getBoundingClientRect().height), fontSize: fs.fontSize,
      placeholderFits: cv.measureText(field.placeholder).width <= room,
      headerFits: header.scrollWidth <= header.clientWidth + 0.5, titleW: Math.round(title.width), titleWhole, titleText: titleEl.textContent,
      connect: !!document.querySelector("[data-ask-connect]") && document.querySelectorAll("[data-ask-connect] svg").length === 2,
      chips, chipsOneRow: chips.every((c) => c.top === chips[0].top), chipsFlat: chips.every((c) => c.h <= 40),
    }
  })
  const change = await read()
  expect(change.oneRow && change.rowH <= 44 && change.rowW <= change.sheetW, `Change page: the mode row is one row, ${change.rowH}px tall`, { rowH: change.rowH, right: change.rowW, width: change.sheetW })
  expect(change.modes.every((m) => m.fits && m.h <= 36), "both mode labels fit on one line", change.modes)
  expect(change.placeholderFits && change.fieldH <= 44, `and the placeholder "${change.placeholder}" is one line: the box is ${change.fieldH}px`, { fits: change.placeholderFits, h: change.fieldH })
  expect(change.fontSize === "16px", "the field is 16px, so iOS does not zoom the page to it", change.fontSize)
  expect(change.connect && change.headerFits && change.titleWhole, `Connect AI with both marks sits in the header, which does not overflow, and "${change.titleText}" is whole`, { titleW: change.titleW, fits: change.headerFits })
  expect(change.chips.length >= 1 && change.chips.length <= 3 && change.chipsOneRow && change.chipsFlat, "at most three suggestions, one row, none wrapping", change.chips.map((c) => c.t))
  await p.screenshot({ path: join(shots, `${P}${label}-change.png`) })

  /* The switch: its thumb slides on transform, the row does not move. */
  const before = await p.$eval("[data-ask-mode-row]", (r) => r.getBoundingClientRect().top)
  const moving = await p.evaluate(async (ANIM) => {
    const animated = eval(ANIM)
    document.querySelector('[data-ask-mode="code"]').click()
    const props = new Set()
    const t0 = performance.now()
    await new Promise((done) => { const tick = () => { for (const x of animated(document.querySelector("[data-ask-modes]"))) props.add(x); if (performance.now() - t0 < 300) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    return [...props]
  }, ANIMATED)
  await sleep(200)
  const code = await read()
  const after = await p.$eval("[data-ask-mode-row]", (r) => r.getBoundingClientRect().top)
  expect(moving.length > 0 && moving.every((x) => ["transform", "color"].includes(x)), "Code section: the thumb slides on transform", moving)
  expect(Math.abs(after - before) < 0.5, "and the mode row stays where it was", { before, after })
  expect(code.modes.every((m) => m.fits) && code.oneRow && code.placeholderFits && code.fieldH <= 44, `and "${code.placeholder}" is one line too`, { fits: code.placeholderFits, h: code.fieldH, oneRow: code.oneRow })
  await p.screenshot({ path: join(shots, `${P}${label}-code.png`) })
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* ── STATES ───────────────────────────────────────────────────────────── */
async function states(browser) {
  console.log("\nstates, desktop-1440")
  const p = await page(browser, { width: 1440, height: 900 }, "agent=manual&empty=1", "#desktop")
  await p.click("[data-ask-pill] textarea")
  await sleep(400)
  const chips = await p.$$eval("[data-ask-suggestion]", (c) => c.map((x) => x.textContent))
  expect(chips.length >= 2 && chips.length <= 3 && chips.some((c) => /heading shorter|button/i.test(c)), "with the hero selected, the suggestions are about the hero", chips)
  await p.evaluate(() => { window.__long = []; window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 2000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await p.type("[data-ask-pill] textarea", "Add testimonials under the hero")
  await p.keyboard.press("Enter")
  await sleep(150)
  const seen = []
  seen.push(await lineText(p))
  await sleep(1800)
  seen.push(await lineText(p))
  const push = async (line, wait = 450) => { await p.evaluate((l) => window.__push(l), line); await sleep(wait); const t = await lineText(p); seen.push(t); return t }
  await push({ type: "plan", text: "I'll read the hero, then add three quotes under it in the same colours." })
  const reading = await push({ type: "step", id: "t1", label: "Reading the Hero", state: "running" }, 120)
  const morph = await p.evaluate(async (ANIM) => {
    const animated = eval(ANIM)
    const scope = document.querySelector("[data-ask-activity]")
    const props = new Set()
    let outs = 0
    window.__push({ type: "step", id: "t1", label: "Reading the Hero", state: "done" })
    window.__push({ type: "status", label: "Checking colours" })
    const t0 = performance.now()
    await new Promise((done) => { const tick = () => { for (const x of animated(scope)) props.add(x); if (scope.querySelector('[data-line="out"]')) outs++; if (performance.now() - t0 < 400) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    return { props: [...props], outs }
  }, ANIMATED)
  seen.push(await lineText(p))
  await p.screenshot({ path: join(shots, `${P}states-running.png`) })
  const shine = await p.evaluate(() => { const w = document.querySelector("[data-ask-activity] .ask-shine-window"); return w ? getComputedStyle(w).animationName : null })
  await push({ type: "op", op: { kind: "add_section", id: "new-1", sectionType: "proof_testimonials" }, label: "Added Testimonials" })
  await push({ type: "tool", id: "save-1", label: "Saving", state: "running" })
  await p.click("[data-ask-steps-toggle]")
  await sleep(200)
  const steps = await p.$$eval("[data-ask-steps] li", (l) => l.map((x) => ({ t: x.textContent, icons: x.querySelectorAll("svg").length })))
  await p.screenshot({ path: join(shots, `${P}states-steps.png`) })
  await p.evaluate(() => { window.__push({ type: "tool", id: "save-1", label: "Saving", state: "done" }); window.__push({ type: "message", text: "Added a testimonials section under the hero." }); window.__end() })
  await sleep(600)
  const perf = await p.evaluate(() => {
    const f = window.__frames.slice(5)
    const sorted = [...f].sort((a, b) => a - b)
    return { long: window.__long.slice(), frames: f.length, p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1), shifts: +window.__shifts.reduce((a, b) => a + b, 0).toFixed(4) }
  })
  measures.states = { lines: seen, morph, perf }
  expect(seen[0] === "Reading the page" && seen[1] === "Planning the change", "before anything is said: Reading the page, then Planning the change", seen.slice(0, 2))
  expect(reading === "Reading the Hero", "a step running is the line", reading)
  expect(seen.includes("Checking colours") && seen.includes("Added Testimonials") && seen.includes("Saving"), "a kind of line the chat never knew (status, tool) is shown the same way, and so is a change landing", seen)
  expect(morph.props.length > 0 && morph.props.every((x) => ["transform", "opacity"].includes(x)) && morph.outs > 0, "the old words rise out as the new rise in, on transform and opacity only", morph)
  expect(shine === "ask-shine-window", "with a band of light passing over the words in progress", shine)
  expect(steps.length >= 2 && steps.every((s) => s.icons === 0), "the finished steps fold under a toggle: a plain list, no ticks, no spinners", steps)
  const done = await p.evaluate(() => ({
    running: !!document.querySelector('[data-ask-exchange="running"]'),
    activity: !!document.querySelector("[data-ask-activity]"),
    count: document.querySelector("[data-ask-count]")?.textContent,
    undo: !!document.querySelector("[data-ask-undo]"),
    copy: !!document.querySelector("[data-ask-copy]"),
    report: !!document.querySelector("[data-ask-report]"),
    reply: [...document.querySelectorAll("[data-ask-exchange] p")].map((x) => x.textContent).includes("Added a testimonials section under the hero."),
    runs: window.__runs.length,
    working: /Working/.test(document.querySelector("[data-ask-card]").textContent),
  }))
  expect(!done.running && !done.activity && done.reply, "when it is done the line is gone and its answer is there", done)
  expect(done.count === "1 section changed" && done.undo && done.copy && done.report, "under it: 1 section changed, Undo, Copy and Report", done)
  expect(!done.working, "and the word Working appears nowhere")
  expect(perf.long.length === 0, "no long task while it streamed, morphed and finished", perf.long)
  expect(perf.shifts === 0, "and no layout shift", { total: perf.shifts, sources: await p.evaluate(() => window.__shiftSources.slice(0, 6)) })
  await p.screenshot({ path: join(shots, `${P}states-done.png`) })

  await p.click("[data-ask-undo]")
  await sleep(150)
  const undone = await p.evaluate(() => ({ undone: window.__undone.length, runs: window.__runs.slice(), text: document.querySelector("[data-ask-undone]")?.textContent }))
  expect(undone.undone === 1 && undone.runs.length === 1 && undone.text === "Undone", "Undo hands the editor that run's id, once, and says Undone", undone)
  await p.click("[data-ask-copy]")
  await sleep(100)
  expect((await p.evaluate(() => window.__copied[0])) === "Added a testimonials section under the hero.", "Copy copies the answer")
  await p.click("[data-ask-report]")
  await sleep(200)
  await p.type("#ask-report-reason", "It used the wrong colours")
  await p.screenshot({ path: join(shots, `${P}states-report.png`) })
  await p.click('[data-ask-report-form] button[type="submit"]')
  await sleep(300)
  const report = await p.evaluate(() => ({ sent: window.__reports[0], done: document.querySelector("[data-ask-reported]")?.textContent }))
  expect(!!report.sent && /^[0-9a-f-]{36}$/.test(report.sent.messageId) && report.sent.reason === "It used the wrong colours" && report.sent.engine === "claude" && report.done === "Reported", "Report sends the question's id, the reason and the model, and says Reported", report)
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()

  const q = await page(browser, { width: 1440, height: 900 }, "agent=auto&reports=unset", "#desktop")
  await q.click("[data-ask-pill] textarea")
  await sleep(500)
  await q.click("[data-ask-report]")
  await sleep(150)
  await q.click('[data-ask-report-form] button[type="submit"]')
  await sleep(300)
  const unset = await q.$eval("[data-ask-report-form] [role=alert]", (e) => e.textContent).catch(() => null)
  expect(unset === "Reports turn on once the database update is run.", "before the reports SQL: Report says so, in one sentence", unset)
  await q.close()
}

/* ── HISTORY ──────────────────────────────────────────────────────────── */
async function history(browser, vp, hash) {
  const label = `history-${vp.width}`
  console.log(`\n${label}`)
  const p = await page(browser, vp, "agent=auto&earlier=1", hash)
  if (hash === "#desktop") { await p.click("[data-ask-pill] textarea"); await sleep(500) }
  const openHistory = async () => { await p.click("[data-ask-history-button]"); await sleep(550) }
  await openHistory()
  const groups = await p.$$eval("[data-history-group]", (g) => g.map((x) => [x.getAttribute("data-history-group"), x.querySelectorAll("[data-history-row]").length]))
  const want = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days"]
  expect(want.every((w, i) => groups[i] && groups[i][0] === w) && groups.length >= 5, "grouped by day: Today, Yesterday, Previous 7 days, Previous 30 days, then the month", groups)
  await p.screenshot({ path: join(shots, `${P}${label}-grouped.png`) })
  await p.click('[data-history-row="22222222-2222-4222-8222-222222222222"]')
  await sleep(600)
  const opened = await p.evaluate(() => ({ title: document.querySelector("[data-ask-title]").textContent, prompts: [...document.querySelectorAll("[data-ask-prompt]")].map((x) => x.textContent), count: document.querySelector("[data-ask-count]")?.textContent }))
  expect(opened.title === "Add a newsletter under the FAQ" && opened.prompts[0] === "Add a newsletter under the FAQ" && opened.count === "1 section changed", "opening one shows it, with what it changed counted", opened)
  const field = hash === "#desktop" ? "[data-ask-pill] textarea" : "[data-chat-composer] textarea"
  await p.type(field, "Make it narrower")
  await p.keyboard.press("Enter")
  await sleep(900)
  const cont = await p.evaluate(() => window.__posts[window.__posts.length - 1])
  expect(cont.conversationId === "22222222-2222-4222-8222-222222222222", "and a message there continues it", cont)
  await p.click("[data-ask-new]")
  await sleep(300)
  await p.type(field, "Add opening hours")
  await p.keyboard.press("Enter")
  await sleep(900)
  const fresh = await p.evaluate(() => ({ post: window.__posts[window.__posts.length - 1], title: document.querySelector("[data-ask-title]").textContent, n: window.__db.conversations.length }))
  expect(fresh.post.conversationId === null && fresh.n === 6 && fresh.title === "Add opening hours", "New chat starts a conversation of its own, named from its first message", fresh)
  await openHistory()
  const top = await p.$$eval("[data-history-row]", (r) => r.map((x) => x.textContent))
  expect(/Add opening hours/.test(top[0]), "and it is at the top of the history", top[0])

  /* Delete one, in place. */
  const target = "33333333-3333-4333-8333-333333333333"
  const box = await p.$eval(`[data-history-item="${target}"]`, (e) => { const r = e.getBoundingClientRect(); return { h: r.height } })
  await p.hover(`[data-history-row="${target}"]`)
  await sleep(150)
  await p.click(`[data-history-delete="${target}"]`)
  await sleep(150)
  const asking = await p.$eval(`[data-history-item="${target}"]`, (e) => ({ text: e.textContent, h: e.getBoundingClientRect().height }))
  expect(/Delete this chat\?/.test(asking.text) && Math.abs(asking.h - box.h) <= 2, "the bin asks in place, in the row itself, which keeps its height", { asking: asking.text, before: box.h, after: asking.h })
  await p.screenshot({ path: join(shots, `${P}${label}-confirm.png`) })
  await p.click(`[data-history-item="${target}"] [data-history-confirm-yes]`)
  await sleep(300)
  const afterOne = await p.evaluate((t) => ({ gone: !document.querySelector(`[data-history-item="${t}"]`), db: window.__db.conversations.some((c) => c.id === t), deletes: window.__deletes.slice() }), target)
  expect(afterOne.gone && !afterOne.db && afterOne.deletes.includes(target), "Delete removes it from the list and from the database", afterOne)

  /* Delete the one that is open: the thread becomes a new chat. */
  const openId = await p.evaluate(() => window.__db.conversations.find((c) => c.title === "Add opening hours").id)
  await p.hover(`[data-history-row="${openId}"]`)
  await p.click(`[data-history-delete="${openId}"]`)
  await sleep(120)
  await p.click(`[data-history-item="${openId}"] [data-history-confirm-yes]`)
  await sleep(300)
  await p.click('[data-ask-header] button[aria-label="Back to the conversation"]')
  await sleep(450)
  const cleared = await p.evaluate(() => ({ prompts: document.querySelectorAll("[data-ask-prompt]").length, title: document.querySelector("[data-ask-title]").textContent }))
  expect(cleared.prompts === 0 && cleared.title === "Ask Storelib", "deleting the open chat leaves a new, empty one", cleared)

  /* Delete all. */
  await openHistory()
  await p.click("[data-history-delete-all]")
  await sleep(150)
  const all = await p.$eval('[data-history-confirm="all"]', (e) => e.textContent)
  await p.screenshot({ path: join(shots, `${P}${label}-delete-all.png`) })
  await p.click('[data-history-confirm="all"] [data-history-confirm-yes]')
  await sleep(300)
  const none = await p.evaluate(() => ({ n: window.__db.conversations.length, earlier: window.__db.earlier.length, text: document.querySelector("[data-ask-history]").textContent }))
  expect(/Delete all \d+ chats on this website\?/.test(all) && none.n === 0 && none.earlier === 0 && /No chats yet/.test(none.text), "Delete all asks with the count, then every chat on the website is gone", { asked: all, left: none.n })
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()

  const u = await page(browser, vp, "agent=auto&db=unset", hash)
  if (hash === "#desktop") { await u.click("[data-ask-pill] textarea"); await sleep(500) }
  const note = await u.$eval("[data-ask-not-set-up]", (e) => e.textContent).catch(() => null)
  await u.click("[data-ask-history-button]")
  await sleep(550)
  const panel = await u.$eval("[data-history-not-set-up]", (e) => e.textContent).catch(() => null)
  expect(/History turns on once the database update is run/.test(note ?? "") && /History turns on once the database update is run/.test(panel ?? ""), "before the database update: the thread and the history say history turns on once it is run", { note, panel })
  await u.screenshot({ path: join(shots, `${P}${label}-not-set-up.png`) })
  await u.close()
}

/* ── MODELS, CONNECT AI ───────────────────────────────────────────────── */
async function models(browser) {
  console.log("\nmodels and Connect AI")
  const p = await page(browser, { width: 1440, height: 900 }, "agent=auto", "#desktop")
  await p.click("[data-ask-pill] textarea")
  await sleep(450)
  const trigger = await p.$eval("[data-ask-model]", (b) => ({ svg: b.querySelectorAll("svg").length, color: getComputedStyle(b.querySelector("svg")).color, text: b.textContent }))
  await p.click("[data-ask-model]")
  await sleep(250)
  const rows = await p.$$eval("[data-ask-model-option]", (o) => o.map((x) => { const s = x.querySelector("svg"); return { id: x.getAttribute("data-ask-model-option"), color: getComputedStyle(s).color, h: Math.round(x.getBoundingClientRect().height), inSheet: !!x.closest("[data-app-sheet]") } }))
  expect(trigger.svg >= 1 && trigger.color === "rgb(217, 119, 87)", "the trigger wears Claude's mark in its terracotta", trigger)
  expect(rows.length === 3 && rows[0].color === "rgb(217, 119, 87)" && rows[1].color === "rgb(217, 119, 87)" && rows[2].color === "rgb(0, 0, 0)" && rows.every((r) => !r.inSheet), "on a computer a popover: Claude's mark on Sonnet and Opus, OpenAI's on ChatGPT", rows)
  await p.screenshot({ path: join(shots, `${P}models-desktop.png`) })
  await p.click('[data-ask-model-option="openai"]')
  await sleep(200)
  expect((await p.$eval("[data-ask-model]", (b) => b.textContent)).includes("ChatGPT"), "choosing ChatGPT puts it on the trigger")
  await p.click("[data-ask-connect]")
  expect((await p.evaluate(() => window.__connect)) === 1, "Connect AI asks the editor to open Connections")
  await p.close()

  const q = await page(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "agent=auto", "#phone")
  await q.tap("[data-ask-model]")
  await sleep(700)
  const sheet = await q.$$eval("[data-ask-model-option]", (o) => o.map((x) => ({ h: Math.round(x.getBoundingClientRect().height), inSheet: !!x.closest("[data-app-sheet]"), svg: x.querySelectorAll("svg").length })))
  expect(sheet.length === 3 && sheet.every((r) => r.inSheet && r.h >= 44 && r.svg >= 1), "on a phone the shared bottom sheet, rows of 44px or more, each with its mark", sheet)
  await q.screenshot({ path: join(shots, `${P}models-phone.png`) })
  await q.tap('[data-ask-model-option="claude-opus"]')
  await sleep(700)
  const chosen = await q.evaluate(() => ({ trigger: document.querySelector("[data-ask-model]").textContent, open: !!document.querySelector('[data-app-sheet="open"]') }))
  expect(/Opus/.test(chosen.trigger) && !chosen.open, "choosing Opus closes the sheet and names it", chosen)
  if (q.__errors.length) expect(false, "no errors on the page", q.__errors)
  await q.close()
}

/* ── PICTURES ─────────────────────────────────────────────────────────── */
async function pictures(browser) {
  console.log("\npictures, desktop-1440")
  const dir = mkdtempSync(join(tmpdir(), "askdock-files-"))
  const p = await page(browser, { width: 1440, height: 900 }, "agent=manual", "#desktop")
  /* Test pictures drawn in the page: a busy 3000x2000 photo (a few MB as PNG) and a small plain one. */
  const drawn = await p.evaluate(async () => {
    const png = async (w, h, busy) => {
      const c = new OffscreenCanvas(w, h)
      const x = c.getContext("2d")
      if (busy) {
        const img = x.createImageData(w, h)
        let s = 7
        for (let i = 0; i < img.data.length; i += 4) {
          const p = i / 4, px = p % w, py = (p / w) | 0
          s = (s * 1103515245 + 12345) & 0x7fffffff
          const grain = (s & 15) - 8
          img.data[i] = Math.max(0, Math.min(255, (px / w) * 220 + grain + 20))
          img.data[i + 1] = Math.max(0, Math.min(255, (py / h) * 180 + grain + 40))
          img.data[i + 2] = Math.max(0, Math.min(255, 120 + 90 * Math.sin(px / 180) * Math.cos(py / 140) + grain))
          img.data[i + 3] = 255
        }
        x.putImageData(img, 0, 0)
      } else { x.fillStyle = "#1e78c8"; x.fillRect(0, 0, w, h) }
      const blob = await c.convertToBlob({ type: "image/png" })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let bin = ""
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
      return btoa(bin)
    }
    return { photo: await png(3000, 2000, true), small: await png(400, 300, false) }
  })
  writeFileSync(join(dir, "photo.png"), Buffer.from(drawn.photo, "base64"))
  writeFileSync(join(dir, "small.png"), Buffer.from(drawn.small, "base64"))
  writeFileSync(join(dir, "notes.pdf"), "%PDF-1.4 not a picture")
  writeFileSync(join(dir, "IMG_0001.heic"), Buffer.from("00000018667479706865696300000000", "hex"))
  measures.photoBytes = Math.round(Buffer.from(drawn.photo, "base64").length / 1024)
  await p.click("[data-ask-pill] textarea")
  await sleep(400)
  const input = await p.$("[data-ask-pill] input[type=file]")
  await input.uploadFile(join(dir, "photo.png"))
  const early = await p.evaluate(() => ({ thumb: document.querySelectorAll("[data-ask-thumb]").length, preparing: !!document.querySelector("[data-ask-preparing]"), ring: document.querySelector("[data-ask-preparing] [data-ask-ring]")?.getAttribute("data-ask-ring") }))
  await p.screenshot({ path: join(shots, `${P}pictures-preparing.png`) })
  await sleep(2500)
  const ready = await p.evaluate(() => ({ state: document.querySelector("[data-ask-thumb]")?.getAttribute("data-state"), long: window.__long.slice() }))
  expect(early.thumb === 1 && early.preparing, "a chosen photo is a thumbnail at once, with a ring while it is made ready", early)
  expect(ready.state === "ready", "and then ready", ready.state)
  await input.uploadFile(join(dir, "notes.pdf"))
  await sleep(150)
  const pdf = await p.$eval("[data-ask-attach-error]", (e) => e.textContent).catch(() => null)
  expect(/notes\.pdf can't be attached\. Pictures and videos only\./.test(pdf ?? ""), "a PDF says why not, in a sentence", pdf)
  await input.uploadFile(join(dir, "IMG_0001.heic"))
  await sleep(700)
  const heic = await p.evaluate(() => ({ error: document.querySelector("[data-ask-attach-error]")?.textContent, failed: document.querySelectorAll('[data-ask-thumb][data-state="failed"]').length }))
  expect(/HEIC photo, which this browser cannot open/.test(heic.error ?? "") && heic.failed === 1, "a HEIC this browser cannot read says so, and can be removed", heic)
  await p.click('[data-ask-thumb][data-state="failed"] button[aria-label^="Remove"]')
  /* Paste and drop, from files made in the page. */
  await p.evaluate(async () => {
    const make = async (w, h, color) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); return new File([await c.convertToBlob({ type: "image/png" })], `${color.slice(1)}.png`, { type: "image/png" }) }
    const pasted = new DataTransfer(); pasted.items.add(await make(800, 600, "#ff8800"))
    document.querySelector("[data-ask-pill] textarea").dispatchEvent(new ClipboardEvent("paste", { clipboardData: pasted, bubbles: true, cancelable: true }))
    const dropped = new DataTransfer(); dropped.items.add(await make(640, 480, "#22aa66"))
    const zone = document.querySelector("[data-ask-card]")
    zone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dropped, bubbles: true, cancelable: true }))
    window.__dropTarget = !!document.querySelector("[data-drop-target]")
    await new Promise((r) => setTimeout(r, 50))
    window.__dropTarget = window.__dropTarget || !!document.querySelector("[data-drop-target]")
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dropped, bubbles: true, cancelable: true }))
  })
  await sleep(900)
  const three = await p.evaluate(() => ({ n: document.querySelectorAll('[data-ask-thumb][data-state="ready"]').length, target: window.__dropTarget }))
  expect(three.n === 3 && three.target, "a pasted screenshot and a dropped file join it; the drop shows where it will land", three)
  /* A video, recorded in the page, becomes stills. */
  const video = await p.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 240
    const x = c.getContext("2d")
    const stream = c.captureStream(30)
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" })
    const parts = []
    rec.ondataavailable = (e) => parts.push(e.data)
    let t = 0
    const draw = () => { x.fillStyle = `hsl(${t * 3}, 80%, 50%)`; x.fillRect(0, 0, 320, 240); t++ }
    const timer = setInterval(draw, 33)
    rec.start()
    await new Promise((r) => setTimeout(r, 1500))
    rec.stop()
    await new Promise((r) => (rec.onstop = r))
    clearInterval(timer)
    const file = new File(parts, "clip.webm", { type: "video/webm" })
    const dt = new DataTransfer(); dt.items.add(file)
    document.querySelector("[data-ask-card]").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
    return file.size
  })
  await sleep(3500)
  const stills = await p.evaluate(() => ({ stills: [...document.querySelectorAll("[data-ask-thumb]")].filter((t) => /still/.test(t.querySelector("button").getAttribute("aria-label") || "")).length, all: document.querySelectorAll("[data-ask-thumb]").length, error: document.querySelector("[data-ask-attach-error]")?.textContent }))
  expect(stills.all === 4 && stills.stills === 1, `a ${Math.round(video / 1024)}KB video becomes stills, as many as there is room for (one here)`, stills)
  await p.screenshot({ path: join(shots, `${P}pictures-four.png`) })
  await input.uploadFile(join(dir, "small.png"))
  await sleep(200)
  const fifth = await p.$eval("[data-ask-attach-error]", (e) => e.textContent).catch(() => null)
  expect(/4 pictures is the most one message can carry/.test(fifth ?? ""), "a fifth picture is refused, plainly", fifth)
  /* Send: the ring follows the upload. */
  await p.type("[data-ask-pill] textarea", "Build this")
  await p.keyboard.press("Enter")
  const rings = []
  for (let i = 0; i < 8; i++) { await sleep(220); rings.push(await p.evaluate(() => document.querySelector("[data-ask-sending] [data-ask-ring]")?.getAttribute("data-ask-ring") ?? null)) }
  await sleep(900)
  const post = await p.evaluate(() => window.__posts[window.__posts.length - 1])
  measures.pictures = { rings, sizes: post.sizes }
  const nums = rings.filter((r) => r && r !== "turning").map(Number)
  expect(post.via === "xhr" && post.images === 4, "the message goes with its four pictures, over XMLHttpRequest", { via: post.via, images: post.images })
  expect(nums.length >= 2 && nums.every((n, i) => i === 0 || n >= nums[i - 1]) && nums[nums.length - 1] >= 45, "the sent thumbnails' ring follows the upload as it goes up", rings)
  const big = post.sizes.find((s) => s[0] > 1000)
  expect(!!big && Math.max(big[0], big[1]) === 1568 && big[2] === "image/jpeg", "the 3000x2000 photo went at 1568 on its long edge, as JPEG", post.sizes)
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
  rmSync(dir, { recursive: true, force: true })
}

/* ── VOICE ────────────────────────────────────────────────────────────── */
async function voice(browser) {
  console.log("\nvoice, phone-390")
  const p = await page(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "agent=auto&empty=1", "#phone")
  const row = () => p.evaluate(() => ["[data-ask-attach]", "[data-ask-mic]", "[data-ask-send]"].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().x)))
  const before = await row()
  await p.tap("[data-ask-mic]")
  const trace = await p.evaluate(async () => {
    const field = document.querySelector("[data-chat-composer] textarea")
    const out = []
    const t0 = performance.now()
    await new Promise((done) => { const tick = () => { out.push(field.value); if (performance.now() - t0 < 2600) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    return out
  })
  const during = await p.evaluate(() => ({ placeholder: document.querySelector("[data-chat-composer] textarea").placeholder, clock: !!document.querySelector("[data-ask-voice-clock] .ask-rec-dot"), stop: document.querySelector("[data-ask-mic]").getAttribute("aria-label") }))
  const middle = await row()
  await p.screenshot({ path: join(shots, `${P}voice-listening.png`) })
  await p.tap("[data-ask-mic]")
  await sleep(300)
  const final = await p.evaluate(() => document.querySelector("[data-chat-composer] textarea").value)
  let biggest = 0, cuts = 0
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i]
    if (b.startsWith(a)) biggest = Math.max(biggest, b.length - a.length)
    else cuts++
  }
  const distinct = new Set(trace).size
  measures.voice = { frames: trace.length, distinct, biggest, cuts }
  expect(during.placeholder === "Listening…" && during.clock && during.stop === "Stop recording", "a clear recording state: Listening, a red dot and a clock, and the button is Stop", during)
  expect(distinct >= 20 && biggest <= 14, `the words type in a few characters a frame: ${distinct} different lengths, never more than ${biggest} characters in one frame`, { distinct, biggest })
  /* The recogniser revises twice: "hero" becomes "here", then "here" becomes "hero heading". */
  expect(cuts <= 2, "each of the recogniser's two revisions is cut back once, to what the words agree on, never flickered", cuts)
  expect(final === "make the hero heading shorter and calmer", "and the box ends with exactly what was heard", final)
  expect(JSON.stringify(before) === JSON.stringify(middle), "nothing on the row moved while it listened", { before, middle })
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* ── KEYBOARD ─────────────────────────────────────────────────────────── */
async function keyboard(browser) {
  console.log("\nkeyboard")
  const p = await page(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "agent=auto", "#phone")
  await p.evaluate(() => { window.__shifts = [] })
  await p.tap("[data-chat-composer] textarea")
  await sleep(500)
  const focus = await p.evaluate(() => ({ shifts: window.__shifts.reduce((a, b) => a + b, 0), scrollY: window.scrollY, fs: getComputedStyle(document.activeElement).fontSize }))
  expect(focus.shifts === 0 && focus.scrollY === 0 && focus.fs === "16px", "focusing the phone's field moves nothing, and at 16px iOS has no reason to zoom", focus)
  await p.close()

  const t = await page(browser, { width: 1024, height: 1366, isMobile: true, hasTouch: true }, "agent=auto", "#desktop")
  const bottom0 = await t.$eval("[data-ask-pill]", (e) => Math.round(e.getBoundingClientRect().bottom))
  await t.evaluate(() => document.documentElement.style.setProperty("--kb-inset", "400px"))
  await sleep(500)
  const lifted = await t.evaluate(() => ({ pill: Math.round(document.querySelector("[data-ask-pill]").getBoundingClientRect().bottom), vh: window.innerHeight }))
  await t.screenshot({ path: join(shots, `${P}tablet-keyboard.png`) })
  await t.evaluate(() => document.documentElement.style.setProperty("--kb-inset", "0px"))
  await sleep(500)
  const back = await t.$eval("[data-ask-pill]", (e) => Math.round(e.getBoundingClientRect().bottom))
  expect(lifted.pill === lifted.vh - 400 - 20 && back === bottom0, "a tablet's keyboard lifts the pill to 20px above it, and it comes back down after", { before: bottom0, withKeys: lifted.pill, keysTop: lifted.vh - 400, after: back })
  await t.close()
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-ask-ai.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.ask-dock-probe/navigation.js", "next/link": "./.ask-dock-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${PRELUDE}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] })
  try {
    const only = process.env.ONLY ? process.env.ONLY.split(",") : null
    const want = (name) => !only || only.includes(name)
    if (want("fade")) { await fade(browser, { width: 1440, height: 900 }); await fade(browser, { width: 1280, height: 800 }) }
    if (want("labels")) for (const w of [360, 390, 430]) await labels(browser, w)
    if (want("states")) await states(browser)
    if (want("history")) { await history(browser, { width: 1440, height: 900 }, "#desktop"); await history(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "#phone") }
    if (want("models")) await models(browser)
    if (want("pictures")) await pictures(browser)
    if (want("voice")) await voice(browser)
    if (want("keyboard")) await keyboard(browser)
  } finally {
    await browser.close()
  }
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nmeasurements: ${JSON.stringify(measures)}`)
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
