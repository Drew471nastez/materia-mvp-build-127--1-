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
 *   FADE       nothing round the pill: no glow (the old glow put back is
 *              measured to add plenty) and no blurred band, so no element
 *              in the dock carries a mask and there is no edge to see
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
 *   QUESTIONS  at 1440 and 390: a run that stops to ask ends on its
 *              question and answers (44px on a phone), drawn once, the
 *              closing message not repeated; a tap, or a typed answer,
 *              is the next message in the same conversation. The answer's
 *              run is told in the server's headlines and ends on a summary
 *              that names what it changed. Folded, the pill says the
 *              summary or asks the question. At 360 long answers wrap
 *              cleanly. Read back from the database, a question is one
 *              again, its answer marked
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
  /* A conversation whose run stopped to ask, kept the way the route keeps it: the question as text, then the answer as the next message. */
  if (q.get("asked")) {
    var asked = { id: "66666666-6666-4666-8666-666666666666", title: "Put my best product in the hero", updatedAt: iso(now - 60000), messages: [
      { id: "a6666666-0000-4000-8000-000000000001", role: "user", content: "Put my best product in the hero", ops: [], error: null },
      { id: "a6666666-0000-4000-8000-000000000002", role: "assistant", content: "Which product should the hero show?\\n- Clay mug\\n- Linen apron\\n- Oak board", ops: [], error: null } ] };
    if (q.get("asked") === "answered") asked.messages.push(
      { id: "a6666666-0000-4000-8000-000000000003", role: "user", content: "Linen apron", ops: [], error: null },
      { id: "a6666666-0000-4000-8000-000000000004", role: "assistant", content: "Put the Linen apron in the hero.", ops: [{ kind: "update_section", id: "s2", settings: {} }], error: null });
    db.conversations.push(asked);
  }
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
/*
  "Ask Storelib has a white, faded, light glow around it, which is bad."
  The glow is gone. Then "the blur around the pill is not fading, it's very
  cut around": the masked blur band that replaced it is gone too (Safari
  draws a backdrop blur but not its mask, so it ended in a hard edge).
  Nothing is drawn round the pill but its own soft ink shadows. Measured
  over photographs, stripes and text, with and without a picture in the
  pill (the screenshot that was sent):

    NO BAND    no [data-ask-fade], and no element in the dock has a mask
    NO LIGHT   the page round the pill is no lighter than it was. The old
               glow, put back, is measured the same way and adds a lot
*/
async function fade(browser, vp, attached = false) {
  const label = `fade-${vp.width}${attached ? "-attached" : ""}`
  console.log(`\n${label}`)
  const p = await page(browser, vp, "agent=auto", "#desktop", PHOTOS)
  await sleep(300)
  if (attached) {
    /* The owner's screenshot: the folded pill holding a picture, "Add a note, or just send". */
    const dir = mkdtempSync(join(tmpdir(), "askdock-fade-"))
    const png = await p.evaluate(async () => { const c = new OffscreenCanvas(900, 600); const x = c.getContext("2d"); x.fillStyle = "#c2410c"; x.fillRect(0, 0, 900, 600); x.fillStyle = "#fff"; x.fillRect(80, 80, 300, 200); const b = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s) })
    writeFileSync(join(dir, "shot.png"), Buffer.from(png, "base64"))
    const input = await p.$("[data-ask-pill] input[type=file]")
    await input.uploadFile(join(dir, "shot.png"))
    await sleep(900)
    await p.keyboard.press("Escape")
    await p.mouse.click(400, 300)
    await sleep(500)
    rmSync(dir, { recursive: true, force: true })
    const state = await p.evaluate(() => ({ dock: document.querySelector("[data-ask-dock]").getAttribute("data-state"), thumbs: document.querySelectorAll("[data-ask-pill] [data-ask-thumb]").length, placeholder: document.querySelector("[data-ask-pill] textarea").placeholder }))
    expect(state.dock === "pill" && state.thumbs === 1 && state.placeholder === "Add a note, or just send", "the folded pill holds the picture, as in the screenshot that was sent", state)
  }
  /* Scroll so a photograph, stripes and a line of text sit behind the pill. */
  await p.evaluate(() => { document.getElementById("wb-preview-root").scrollTop = 470 })
  await sleep(300)
  const pill = await p.$eval("[data-ask-pill]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const css = await p.evaluate(() => ({
    halo: !!document.querySelector("[data-ask-halo]"),
    band: !!document.querySelector("[data-ask-fade]"),
    masked: [...document.querySelectorAll("[data-ask-dock] *")].filter((e) => { const c = getComputedStyle(e); return (c.maskImage && c.maskImage !== "none") || (c.webkitMaskImage && c.webkitMaskImage !== "none") }).length,
  }))
  expect(!css.halo && !css.band && css.masked === 0, "round the pill, nothing: no halo, no blurred band, no mask to cut an edge", css)

  /* Whole-window pictures, cut to the band after (a clipped screenshot redraws only its box, and a blur in it has nothing beyond to blur with). */
  const R = 22
  const band = { x: Math.round(pill.x - R), y: Math.round(pill.y - R), w: Math.round(pill.w + R * 2), h: Math.round(pill.h + R * 2) }
  const shot = () => p.screenshot({ encoding: "base64" })
  const withBand = await shot()
  await p.screenshot({ path: join(shots, `${P}${label}-pill.png`) })
  await p.screenshot({ path: join(shots, `${P}${label}-close.png`), clip: { x: Math.max(0, pill.x - 120), y: Math.max(0, pill.y - 90), width: Math.min(vp.width - Math.max(0, pill.x - 120), pill.w + 240), height: Math.min(vp.height - Math.max(0, pill.y - 90), pill.h + 110) } })
  /* With no band there is nothing to take away: the page as it is is the page without one. */
  const without = withBand
  /* The old glow, a light shadow the pill's shape, put back for a moment. */
  await p.evaluate((g) => {
    const h = document.createElement("div")
    h.style.cssText = `position:fixed;left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;border-radius:9999px;box-shadow:0 6px 44px 14px rgba(248,249,250,0.5);pointer-events:none;z-index:1`
    document.body.appendChild(h)
  }, pill)
  await sleep(120)
  const oldGlow = await shot()

  const result = await p.evaluate(async (a, b, c, band, pill) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + src })
    const [ia, ib, ic] = await Promise.all([load(a), load(b), load(c)])
    const read = (img) => { const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const x = cv.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height) }
    const A = read(ia), B = read(ib), C = read(ic)
    const lum = (d, x, y) => { const i = (y * d.width + x) * 4; return 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2] }
    /* The band only: round the pill, not over it. `depth` is how far out from the pill's box a pixel is, 1 to 22. */
    const depth = (x, y) => {
      const dx = x < pill.x ? pill.x - x : x > pill.x + pill.w ? x - (pill.x + pill.w) : 0
      const dy = y < pill.y ? pill.y - y : y > pill.y + pill.h ? y - (pill.y + pill.h) : 0
      return Math.max(dx, dy)
    }
    let sumWith = 0, sumWithout = 0, sumOld = 0, n = 0
    const near = [], far = []
    /* The band as far as the window goes: below the pill it runs past the canvas's bottom edge. */
    const x0 = Math.max(0, band.x), x1 = Math.min(A.width, band.x + band.w), y0 = Math.max(0, band.y), y1 = Math.min(A.height, band.y + band.h)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d = depth(x, y)
      if (d < 1 || d > 22) continue
      const w = lum(A, x, y), o = lum(B, x, y), g = lum(C, x, y)
      sumWith += w; sumWithout += o; sumOld += g; n++
      if (d <= 3) near.push(Math.abs(w - o))
      if (d >= 20) far.push(Math.abs(w - o))
    }
    const mean = (xs) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length)
    return {
      pixels: n,
      meanWith: +(sumWith / n).toFixed(2), meanWithout: +(sumWithout / n).toFixed(2), meanOldGlow: +(sumOld / n).toFixed(2),
      changeAtPill: +mean(near).toFixed(2), changeAtOuterEdge: +mean(far).toFixed(2),
    }
  }, withBand, without, oldGlow, band, pill)
  measures[label] = result
  expect(Math.abs(result.meanWith - result.meanWithout) <= 1.5, "nothing round the pill adds light", result)
  expect(result.meanOldGlow - result.meanWithout >= 8, "and the same check on the old glow finds the light it added", { withoutGlow: result.meanWithout, oldGlow: result.meanOldGlow })
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
  await p.screenshot({ path: join(shots, `${P}states-empty.png`) })
  /* Nothing selected: the page's own gaps. */
  await p.evaluate(() => window.__setSelected(undefined))
  await sleep(250)
  const pageChips = await p.$$eval("[data-ask-suggestion]", (c) => c.map((x) => x.textContent))
  expect(pageChips.join() !== chips.join() && pageChips.some((c) => /newest products|buyers say|newsletter/i.test(c)), "with nothing selected they follow the page: its products, what it lacks", pageChips)
  await p.evaluate(() => window.__setSelected("s2"))
  await sleep(250)
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
  await p.type("[data-ask-report-form] input", "It used the wrong colours")
  await p.screenshot({ path: join(shots, `${P}states-report.png`) })
  await p.click('[data-ask-report-form] button[type="submit"]')
  await sleep(300)
  const report = await p.evaluate(() => ({ sent: window.__reports[0], done: document.querySelector("[data-ask-reported]")?.textContent }))
  expect(!!report.sent && /^[0-9a-f-]{36}$/.test(report.sent.messageId) && report.sent.reason === "It used the wrong colours" && report.sent.engine === "claude" && report.done === "Reported. Thank you.", "Report sends the question's id, the reason and the model, and says it was reported", report)
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

/* ── QUESTIONS, AND THE SUMMARY A RUN ENDS ON ─────────────────────────── */
const ASKED = { id: "call_7", question: "Which product should the hero show?", why: "The hero sells one product.", options: ["Clay mug", "Linen apron", "Oak board"] }
/* The closing message, as lib/website-builder/agent/ask.ts questionText writes it. */
const asText = (q) => [q.question, ...q.options.map((o) => `- ${o}`)].join("\n")
/* The same run order the loop streams: headlines, the ask_creator step, the question, the message that repeats it. */
const questionRun = (q) => [
  { type: "progress", phase: "reading", label: "Reading the page" },
  { type: "progress", phase: "products", label: "Looking at your products" },
  { type: "progress", phase: "planning", label: "Planning" },
  { type: "step", id: q.id, label: "Asking you a question", state: "running" },
  { type: "step", id: q.id, label: "Asking you a question", state: "done" },
  { type: "question", id: q.id, question: q.question, why: q.why, options: q.options },
  { type: "message", text: asText(q) },
]
/* A run that changes the hero, told in headlines, ending on `done` with its sentence and the section by name. */
const summaryRun = (detail, reply) => [
  [{ type: "progress", phase: "reading", label: "Reading the page" }, "Reading the page"],
  [{ type: "progress", phase: "planning", label: "Planning" }, "Planning"],
  [{ type: "step", id: "t1", label: "Reading the Hero", state: "running" }, "Planning"],
  [{ type: "step", id: "t1", label: "Reading the Hero", state: "done" }, "Planning"],
  [{ type: "step", id: "t2", label: "Changing the Hero", state: "running" }, "Planning"],
  [{ type: "progress", phase: "writing", label: "Writing Hero" }, "Writing Hero"],
  [{ type: "op", op: { kind: "update_section", id: "s2", settings: {} }, label: "Changed the Hero heading" }, "Changed the Hero heading"],
  [{ type: "step", id: "t2", label: "Changing the Hero", state: "done" }, "Writing Hero"],
  [{ type: "progress", phase: "checking", label: "Checking contrast" }, "Checking contrast"],
  [{ type: "progress", phase: "done", label: "Done", detail, sections: ["Hero"] }, "Done"],
  [{ type: "message", text: reply }, null],
]
const SUMMARY_STEPS = ["Reading the page", "Planning", "Reading the Hero", "Changing the Hero", "Writing Hero", "Checking contrast"]

/* Where the question and its answers are, measured against the thread's own padding. */
const readQuestion = (p, question) => p.evaluate((question) => {
  const thread = document.querySelector("[data-chat-thread]")
  const box = thread.getBoundingClientRect()
  const cs = getComputedStyle(thread)
  const inner = { left: box.left + parseFloat(cs.paddingLeft), right: box.right - parseFloat(cs.paddingRight) }
  const blocks = [...document.querySelectorAll("[data-ask-question]")]
  const block = blocks[blocks.length - 1]
  const options = [...(block ? block.querySelectorAll("[data-ask-option]") : [])].map((b) => {
    const r = b.getBoundingClientRect()
    return { t: b.textContent, left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: Math.round(r.top), h: Math.round(r.height), enabled: !b.disabled, picked: b.hasAttribute("data-picked") }
  })
  const text = thread.textContent
  const rows = [...new Set(options.map((o) => o.top))].sort((a, b) => a - b)
  return {
    state: block ? block.getAttribute("data-ask-question") : null,
    question: block ? block.querySelector("[data-ask-question-text]")?.textContent : null,
    why: block ? block.querySelector("[data-ask-question-why]")?.textContent ?? null : null,
    options,
    inner: { left: +inner.left.toFixed(1), right: +inner.right.toFixed(1) },
    inside: options.every((o) => o.left >= inner.left - 0.5 && o.right <= inner.right + 0.5),
    rows: rows.length,
    rowStarts: rows.map((top) => Math.min(...options.filter((o) => o.top === top).map((o) => o.left))),
    rowGaps: rows.slice(1).map((top, i) => top - (rows[i] + Math.max(...options.filter((o) => o.top === rows[i]).map((o) => o.h)))),
    once: question ? text.split(question).length - 1 : null,
    dashes: /\n- |- Clay mug/.test(text),
    reply: document.querySelectorAll("[data-ask-exchange]:last-child [data-ask-reply]").length,
    suggestions: document.querySelectorAll("[data-ask-suggestion]").length,
    placeholder: document.querySelector("[data-chat-composer] textarea").placeholder,
    sideways: thread.scrollWidth > thread.clientWidth + 0.5 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5,
    running: !!document.querySelector('[data-ask-exchange="running"]'),
  }
}, question)

const readSummary = (p) => p.evaluate(() => {
  const last = [...document.querySelectorAll("[data-ask-exchange]")].pop()
  return {
    state: last.getAttribute("data-ask-exchange"),
    reply: last.querySelector("[data-ask-reply]")?.textContent ?? null,
    detail: last.querySelector("[data-ask-detail]")?.textContent ?? null,
    count: last.querySelector("[data-ask-count]")?.textContent ?? null,
    undo: !!last.querySelector("[data-ask-undo]"),
    toggle: last.querySelector("[data-ask-steps-toggle]")?.textContent ?? null,
    activity: !!last.querySelector("[data-ask-activity]"),
  }
})

async function questions(browser, vp, hash) {
  const phone = hash === "#phone"
  const label = `${vp.width}`
  console.log(`\nquestion-${label}`)
  const p = await page(browser, vp, "agent=manual&empty=1", hash)
  const field = phone ? "[data-chat-composer] textarea" : "[data-ask-pill] textarea"
  if (!phone) { await p.click(field); await sleep(400) }
  await p.type(field, "Put my best product in the hero")
  await p.keyboard.press("Enter")
  await sleep(200)
  const run = questionRun(ASKED)
  await p.evaluate((lines) => lines.forEach((l) => window.__push(l)), run.slice(0, 3))
  await sleep(350)
  const headline = await lineText(p)
  await p.evaluate((lines) => { lines.forEach((l) => window.__push(l)); window.__end() }, run.slice(3))
  await sleep(600)
  const q = await readQuestion(p, ASKED.question)
  measures[`question-${label}`] = { options: q.options, rows: q.rows, inner: q.inner }
  expect(headline === "Planning", "while it works the line is the server's headline", headline)
  expect(q.state === "open" && q.question === ASKED.question && q.why === ASKED.why && q.options.map((o) => o.t).join() === ASKED.options.join() && q.options.every((o) => o.enabled), "the run ends on its question, why, and three answers to tap", { state: q.state, question: q.question, why: q.why, options: q.options.map((o) => o.t) })
  expect(q.once === 1 && !q.dashes && q.reply === 0, "the closing message that repeats it is not drawn: the question is on screen once, and no - lines", { once: q.once, dashes: q.dashes, reply: q.reply })
  expect(q.options.every((o) => o.h >= (phone ? 44 : 32)), `each answer is ${phone ? 44 : 32}px or more tall`, q.options.map((o) => o.h))
  expect(q.rows === 1 && q.inside && !q.sideways, "three short answers are one row, inside the thread, and nothing scrolls sideways", { rows: q.rows, inside: q.inside, sideways: q.sideways })
  expect(q.suggestions === 0 && q.placeholder === "Or type your answer", "the suggestions step aside and the box says an answer can be typed", { suggestions: q.suggestions, placeholder: q.placeholder })
  expect(!q.running, "and nothing is still running", q.running)
  await p.screenshot({ path: join(shots, `${P}question-${label}.png`) })

  const firstConversation = await p.evaluate(() => window.__posts[0].conversationId === null && window.__db.conversations.length === 1 ? window.__db.conversations[0].id : null)
  if (!phone) {
    /* A tap: the answer is sent as the next message in the same conversation. */
    const before = await p.evaluate(() => window.__posts.length)
    await p.click('[data-ask-option]:nth-child(2)')
    await sleep(250)
    const sent = await p.evaluate(() => window.__posts[window.__posts.length - 1])
    const after = await readQuestion(p, ASKED.question)
    expect(sent.prompt === "Linen apron" && sent.conversationId === firstConversation && (await p.evaluate(() => window.__posts.length)) === before + 1, "tapping Linen apron sends it, once, as the next message in the same conversation", { sent, firstConversation })
    expect(after.state === "answered" && after.options.filter((o) => o.picked).map((o) => o.t).join() === "Linen apron" && after.options.every((o) => !o.enabled), "the question stays as a record: Linen apron marked, the answers no longer tappable", after.options)
  } else {
    /* A typed answer instead: the box, the same conversation, no answer marked. */
    await p.type(field, "The blue vase")
    await p.keyboard.press("Enter")
    await sleep(250)
    const sent = await p.evaluate(() => window.__posts[window.__posts.length - 1])
    const after = await readQuestion(p, ASKED.question)
    expect(sent.prompt === "The blue vase" && sent.conversationId === firstConversation, "a typed answer goes as the next message in the same conversation", { sent, firstConversation })
    expect(after.state === "answered" && after.options.every((o) => !o.picked && !o.enabled), "and the question is answered, none of its choices marked", after.options)
  }

  /* The answer's run: headlines as the line, then the summary. */
  const seen = []
  for (const [line, want] of summaryRun("Put the Linen apron in the hero.", "Put the Linen apron in the hero. Its name is the heading and the button goes to its page.")) {
    await p.evaluate((l) => window.__push(l), line)
    await sleep(want === "Done" ? 120 : 260)
    if (want) seen.push([want, await lineText(p)])
  }
  await p.evaluate(() => window.__end())
  await sleep(500)
  const wrong = seen.filter(([want, got]) => want !== got)
  expect(wrong.length === 0, "each headline replaces the last as the line, tool calls do not take it, a change landing does, and Done ends it", wrong.length ? wrong : seen.map((s) => s[1]))
  const s = await readSummary(p)
  expect(s.state === "done" && !s.activity && s.reply === "Put the Linen apron in the hero. Its name is the heading and the button goes to its page.", "it ends on the answer", s)
  expect(s.count === "Changed Hero" && s.undo, "the summary names the section it changed, from done, with Undo", { count: s.count, undo: s.undo })
  expect(s.detail === null, "done's sentence is not drawn under an answer that already says it", s.detail)
  expect(s.toggle === `${SUMMARY_STEPS.length} steps`, `and ${SUMMARY_STEPS.length} finished steps fold under a toggle: every headline and tool call, Done not among them`, s.toggle)
  await p.click("[data-ask-exchange]:last-child [data-ask-steps-toggle]")
  await sleep(250)
  const listed = await p.$$eval("[data-ask-exchange]:last-child [data-ask-steps] li", (l) => l.map((x) => x.textContent))
  expect(listed.join(" | ") === SUMMARY_STEPS.join(" | "), "opened, they are listed oldest first", listed)
  await p.screenshot({ path: join(shots, `${P}summary-${label}.png`) })

  if (!phone) {
    /* FOLDED: a run that ends while the pill is folded says so in the pill. */
    await p.click(field)
    await sleep(300)
    await p.type(field, "Make the FAQ shorter")
    await p.keyboard.press("Enter")
    await sleep(200)
    await p.keyboard.press("Escape")
    await sleep(450)
    await p.evaluate(() => { window.__push({ type: "progress", phase: "reading", label: "Reading the page" }); window.__push({ type: "progress", phase: "planning", label: "Planning" }) })
    await sleep(300)
    const folding = await p.$eval(field, (f) => ({ state: document.querySelector("[data-ask-dock]").getAttribute("data-state"), placeholder: f.placeholder }))
    await p.evaluate(() => {
      window.__push({ type: "progress", phase: "writing", label: "Writing FAQ" })
      window.__push({ type: "op", op: { kind: "update_section", id: "s3", settings: {} }, label: "Changed the FAQ" })
      window.__push({ type: "progress", phase: "done", label: "Done", detail: "Cut the FAQ to its four most asked questions.", sections: ["FAQ"] })
      window.__push({ type: "message", text: "Cut the FAQ to its four most asked questions. The answers are two lines each." })
      window.__end()
    })
    await sleep(500)
    const folded = await p.$eval(field, (f) => f.placeholder)
    await p.screenshot({ path: join(shots, `${P}summary-folded-${label}.png`) })
    await p.click(field)
    await sleep(500)
    const reopened = await p.$eval(field, (f) => f.placeholder)
    expect(folding.state === "pill" && folding.placeholder === "Planning…", "folded while it works, the pill says the headline", folding)
    expect(folded === "Cut the FAQ to its four most asked questions.", "when it finishes folded, the pill says done's sentence", folded)
    expect(reopened === "Continue the conversation", "and once the conversation is open again, the pill is a box to type in", reopened)

    /* And a question asked while folded is asked in the pill. */
    await p.type(field, "Add my best seller")
    await p.keyboard.press("Enter")
    await sleep(200)
    await p.keyboard.press("Escape")
    await sleep(450)
    const again = { ...ASKED, id: "call_9", question: "Which one is your best seller?", why: undefined }
    await p.evaluate((lines) => { lines.forEach((l) => window.__push(l)); window.__end() }, questionRun(again))
    await sleep(500)
    const pillAsks = await p.$eval(field, (f) => f.placeholder)
    await p.screenshot({ path: join(shots, `${P}question-folded-${label}.png`) })
    await p.click(field)
    await sleep(500)
    const openAsk = await readQuestion(p, again.question)
    expect(pillAsks === "Which one is your best seller?", "a run that stops to ask while folded asks in the pill", pillAsks)
    expect(openAsk.state === "open" && openAsk.why === null && openAsk.options.every((o) => o.enabled) && openAsk.placeholder === "Or type your answer", "and opening it shows the question with its answers, no why when none was given", { state: openAsk.state, why: openAsk.why, placeholder: openAsk.placeholder })
  }
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* At 360, answers too long for one row wrap onto the next, and one longer than the row wraps inside itself. */
async function questionWrap(browser) {
  console.log("\nquestion-360, long answers")
  const vp = { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const p = await page(browser, vp, "agent=manual&empty=1", "#phone")
  await p.type("[data-chat-composer] textarea", "Feature a product in the hero")
  await p.keyboard.press("Enter")
  await sleep(200)
  const long = { id: "call_8", question: "Which product should the hero show?", why: "The hero sells one product.", options: ["A large speckled stoneware serving bowl in white", "Linen apron", "Oak board", "Four espresso cups"] }
  await p.evaluate((lines) => { lines.forEach((l) => window.__push(l)); window.__end() }, questionRun(long))
  await sleep(600)
  const q = await readQuestion(p, long.question)
  measures["question-360"] = { options: q.options, rows: q.rows, rowStarts: q.rowStarts, rowGaps: q.rowGaps, inner: q.inner }
  expect(q.options.length === 4 && q.inside && !q.sideways, "every answer is inside the thread and nothing scrolls sideways", { inside: q.inside, sideways: q.sideways, inner: q.inner, options: q.options.map((o) => [o.left, o.right]) })
  expect(q.rows >= 2 && q.rowStarts.every((x) => Math.abs(x - q.inner.left) <= 0.5), "they wrap onto rows that each start at the thread's edge", { rows: q.rows, starts: q.rowStarts, edge: q.inner.left })
  expect(q.rowGaps.every((g) => g === q.rowGaps[0]) && q.rowGaps[0] >= 6 && q.rowGaps[0] <= 10, "with the same gap between every row", q.rowGaps)
  const longest = q.options[0]
  expect(longest.h > 44 && longest.right - longest.left <= q.inner.right - q.inner.left + 0.5, "the one longer than a row wraps inside itself rather than running out", { h: longest.h, w: +(longest.right - longest.left).toFixed(1) })
  expect(q.options.every((o) => o.h >= 44), "every answer is 44px or more tall", q.options.map((o) => o.h))
  await p.screenshot({ path: join(shots, `${P}question-360-wrap.png`) })
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* Read back from the database: the question from its text, the answer from the next message. */
async function questionHistory(browser) {
  console.log("\nquestion, read back")
  const a = await page(browser, { width: 1440, height: 900 }, "agent=manual&asked=answered", "#desktop")
  await a.click("[data-ask-pill] textarea")
  await sleep(600)
  const answered = await readQuestion(a, ASKED.question)
  const prompts = await a.$$eval("[data-ask-prompt]", (x) => x.map((e) => e.textContent))
  expect(answered.state === "answered" && answered.options.map((o) => o.t).join() === ASKED.options.join() && answered.options.filter((o) => o.picked).map((o) => o.t).join() === "Linen apron", "a question in a chat read back is drawn as one, the answer that was sent marked", answered.options)
  expect(answered.once === 1 && !answered.dashes && prompts.join(" | ") === "Put my best product in the hero | Linen apron", "its text is not repeated as a list, and the answer is the next message", { once: answered.once, dashes: answered.dashes, prompts })
  await a.screenshot({ path: join(shots, `${P}question-history-1440.png`) })
  await a.close()

  const o = await page(browser, { width: 1440, height: 900 }, "agent=manual&asked=open", "#desktop")
  await o.click("[data-ask-pill] textarea")
  await sleep(600)
  const open = await readQuestion(o, ASKED.question)
  expect(open.state === "open" && open.options.every((x) => x.enabled) && open.placeholder === "Or type your answer", "one still waiting for its answer can be answered after a reload", { state: open.state, placeholder: open.placeholder })
  await o.click('[data-ask-option]:nth-child(3)')
  await sleep(250)
  const sent = await o.evaluate(() => window.__posts[window.__posts.length - 1])
  expect(sent.prompt === "Oak board" && sent.conversationId === "66666666-6666-4666-8666-666666666666", "and the tap continues that conversation", sent)
  if (o.__errors.length) expect(false, "no errors on the page", o.__errors)
  await o.close()
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
  await p.screenshot({ path: join(shots, `${P}${label}-opened.png`) })
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
    if (want("fade")) {
      for (const vp of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }]) await fade(browser, vp)
      await fade(browser, { width: 1440, height: 900 }, true)
    }
    if (want("labels")) for (const w of [360, 390, 430]) await labels(browser, w)
    if (want("states")) await states(browser)
    if (want("questions")) {
      await questions(browser, { width: 1440, height: 900 }, "#desktop")
      await questions(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "#phone")
      await questionWrap(browser)
      await questionHistory(browser)
    }
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
