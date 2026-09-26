/**
 * ===========================================================================
 *  ASK STORELIB, MEASURED: THE COMPUTER'S PILL AND THE PHONE'S SHEET
 * ===========================================================================
 * The real ThemeChat (components/website-builder/theme-chat.tsx), mounted by
 * scripts/render-ask-ai.tsx the way the editor mounts it, with the network
 * stubbed here (conversation, history, the agent's stream, transcription)
 * and the browser's speech recogniser stubbed or removed per run.
 *
 *   1440x900 (and 1280x800 for the geometry)
 *     PILL        centred on the canvas, 20px above its bottom, 660 wide and
 *                 52 to 56 tall, near solid white, nothing round it (no
 *                 glow and no blurred band, measured in askai2, below, and
 *                 by scripts/check-ask-dock.mjs), and the canvas does not move
 *     OPEN        focusing it opens the conversation over ~260ms: sampled
 *                 every frame, only transform, opacity and visibility
 *                 animate, it rises and fades in, and the canvas is still
 *     HISTORY     the history slides in over the thread (transform), lists
 *                 the conversations newest first, opens one, slides back
 *     MAXIMIZE    min(960, canvas - 48) by min(canvas - 48, 85% of the
 *                 window), centred; drawn from the old size by transform;
 *                 and back
 *     ESCAPE      Escape and a press on the canvas fold it back to the pill
 *     CLOSE       the X hides the pill; the bar's Ask AI brings it back
 *     PICTURES    a chosen file becomes a thumbnail with a remove button,
 *                 is sent with the message, says it is sending until the
 *                 route answers, shows in the thread and opens full screen
 *     VOICE       no recogniser and no transcription: no microphone at all.
 *                 A recogniser (stubbed): the microphone, a clock while it
 *                 listens, the words in the box, and nothing sent
 *     TOOLBAR     the section toolbar over the pill: the pill steps away
 *   390x844
 *     SHEET       the header's history (the chat's name), Connect AI, new
 *                 chat and close, each answering 44px; the composer's
 *                 buttons 44px; the model menu is the shared bottom sheet;
 *                 the history slides in
 *   askai2 (ONLY=askai2), screenshots askai2-*
 *     GLASS       the pill: 95% white over a light 10px blur, a hairline,
 *                 ink shadows only; round it five rings that blur the page
 *                 and hold no colour; the open conversation solid white
 *                 with no backdrop filter; no halo and not the old masked
 *                 band; no blurred layer under a fading one, frame by
 *                 frame, so the blur never switches off mid fade
 *     NO GLOW     on a flat dark canvas at 1280 and 1440, every pixel within
 *                 90px of the pill is at most 2 of 255 lighter than the page
 *                 (the old glow, put back, is measured the same way)
 *     THE RAMP    the softening round the pill, read off the page: over fine
 *                 stripes it runs from untouched out past the rings to
 *                 nothing at the pill, row by row, never back; and with
 *                 every mask taken off, as WebKit takes them off, it still
 *                 arrives in steps rather than in one cut
 *     PICTURES    a sent picture is a loaded 64px thumbnail; read back after
 *                 a reload (stubbed route) it is one again, and one that is
 *                 gone is a "Picture no longer available" tile; never the
 *                 note in words; the not saved notices
 *     SOUNDS      each rendered offline from the real graph (peak dBFS, how
 *                 long it is heard); nothing on load; the whoosh, the chime
 *                 and the ticks when they should be; the switch in the menu,
 *                 remembered; silent when off
 *     ACTIONS     the live line changes as the run moves and folds into a
 *                 closed steps toggle and a summary; Copy; Report; a
 *                 suggestion is sent; Report before its table
 *
 *   node scripts/check-ask-ai.mjs          (PROBE_CSS=source without a build)
 *
 * Screenshots go to $SHOTS_DIR (or a temp directory) with the prefix askai-.
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
const stubs = join(root, ".ask-ai-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-askai-")), "shots")
mkdirSync(shots, { recursive: true })
const PREFIX = "askai-"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the network, and the recogniser, before anything loads ───────────── */
const PRELUDE = `
window.__shifts = [];
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__shifts.push(e.value) }) }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
window.__posts = [];
(function () {
  var q = new URLSearchParams(location.search);
  var C1 = "11111111-1111-4111-8111-111111111111", C2 = "22222222-2222-4222-8222-222222222222";
  var now = Date.now();
  var one = { conversation: { id: C1, title: "Make the header black" }, earlier: false, history: "ready", messages: [
    { id: "u1", role: "user", content: "Make the header black", ops: [], error: null, images: [] },
    { id: "a1", role: "assistant", content: "Changed the header background to black.", ops: [{}], error: null, images: [] }
  ] };
  var two = { conversation: { id: C2, title: "Add an FAQ with five questions" }, earlier: false, history: "ready", messages: [
    { id: "u2", role: "user", content: "Add an FAQ with five questions", ops: [], error: null, images: [] },
    { id: "a2", role: "assistant", content: "Added an FAQ under the hero.", ops: [{}, {}], error: null, images: [] }
  ] };
  var list = { conversations: [
    { id: C1, title: "Make the header black", updatedAt: new Date(now - 5 * 60000).toISOString() },
    { id: C2, title: "Add an FAQ with five questions", updatedAt: new Date(now - 26 * 3600000).toISOString() }
  ], earlier: { preview: "Give the site a warmer palette", updatedAt: new Date(now - 4 * 86400000).toISOString() } };
  var json = function (body, status) { return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json" } })) };
  var enc = new TextEncoder();
  /* A real two by two PNG, as the signed URL a read would carry. */
  var PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgASIVAAC8GAP/5pVQlgAAAABJRU5ErkJggg==";
  /* ?chat=pictures: a conversation read back after a reload, pictures and all. One picture came back,
     one's address no longer loads, and one question's picture is past its thirty days. */
  var pictures = { conversation: { id: C1, title: "Build this" }, earlier: false, history: "ready", pictures: q.get("pictures") || "ready", messages: [
    { id: "55555555-5555-4555-8555-555555555551", role: "user", content: "Build this\\n\\n[2 images attached]", ops: [], error: null, images: [{ id: "i1", name: "layout.png", url: PNG }, { id: "i2", name: "old.png", url: "file:///nonexistent/askai2/old.png" }] },
    { id: "55555555-5555-4555-8555-555555555552", role: "assistant", content: "Added a hero like your picture.", ops: [{ kind: "add_section", id: "h9", sectionType: "hero_split" }], error: null, images: [] },
    { id: "55555555-5555-4555-8555-555555555553", role: "user", content: "[an image attached]", ops: [], error: null, images: [] },
    { id: "55555555-5555-4555-8555-555555555554", role: "assistant", content: "Done.", ops: [], error: null, images: [] }
  ] };
  window.__reports = [];
  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    var method = (init && init.method) || "GET";
    if (url.indexOf("/api/website-builder/transcribe") === 0) return json({ available: q.get("transcribe") === "1" });
    if (url.indexOf("/chat/conversations") >= 0) return json(list);
    if (url.indexOf("/chat/report") >= 0) {
      window.__reports.push(JSON.parse(init.body));
      return q.get("report") === "not_set_up" ? json({ reason: "not_set_up" }, 503) : json({ reported: true });
    }
    if (url.indexOf("/chat") >= 0 && method === "GET") {
      if (q.get("chat") === "unsaved") return json({ error: "Chat history is not set up on this database yet.", reason: "not_set_up" }, 503);
      if (q.get("chat") === "pictures") return json(pictures);
      return json(url.indexOf(C2) >= 0 ? two : one);
    }
    if (url.indexOf("/agent") >= 0) {
      var body = JSON.parse(init.body);
      window.__posts.push({ conversationId: body.conversationId, images: (body.images || []).length, prompt: body.prompt });
      var opened = { type: "conversation", id: body.conversationId || "33333333-3333-4333-8333-333333333333", title: body.conversationId === C1 ? one.conversation.title : body.conversationId === C2 ? two.conversation.title : (body.prompt || "A picture") };
      var recorded = { type: "recorded", messageId: "44444444-4444-4444-8444-44444444444" + (window.__posts.length % 10) };
      /* ?agent=full: a run told the way the route tells it, headline by headline, a quarter second apart. */
      var lines = q.get("agent") === "full" ? [
        opened, recorded,
        { type: "progress", phase: "reading", label: "Reading the page" },
        { type: "progress", phase: "planning", label: "Planning" },
        { type: "plan", text: "I'll add three quotes under the hero." },
        { type: "step", id: "t1", label: "Reading the Hero", state: "running" },
        { type: "step", id: "t1", label: "Reading the Hero", state: "done" },
        { type: "progress", phase: "writing", label: "Writing Testimonials" },
        { type: "op", op: { kind: "update_section", id: "s3", settings: {} }, label: "Added three quotes" },
        { type: "progress", phase: "checking", label: "Checking contrast" },
        { type: "progress", phase: "done", label: "Done", detail: "Added three quotes under the hero.", sections: ["Testimonials"] },
        { type: "message", text: "Added three quotes under the hero, in your colours." }
      ] : [
        opened, recorded,
        { type: "step", id: "t1", label: "Read the page", state: "running" },
        { type: "step", id: "t1", label: "Read the page", state: "done" },
        { type: "message", text: "Done." }
      ];
      if (q.get("unsaved") === "pictures") lines.splice(2, 0, { type: "unsaved", what: "pictures", reason: "not_set_up" });
      var gap = q.get("agent") === "full" ? 260 : 120;
      return new Promise(function (resolve) {
        /* The upload taking a moment: the thumbnails say they are sending until here. */
        setTimeout(function () {
          var stream = new ReadableStream({ start: function (c) {
            var i = 0;
            var next = function () { if (i >= lines.length) { c.close(); return } c.enqueue(enc.encode(JSON.stringify(lines[i++]) + "\\n")); setTimeout(next, gap) };
            next();
          } });
          resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
        }, 700);
      });
    }
    return json({});
  };
  /* The clipboard, recorded: Copy is read back from here. */
  window.__copied = [];
  try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function (t) { window.__copied.push(t); return Promise.resolve() } } }) } catch (e) {}
  /* Web Audio, counted: which sounds started, and when the context was made. */
  window.__audio = { contexts: 0, started: [] };
  var RealAudio = window.AudioContext;
  if (RealAudio) {
    window.AudioContext = function (options) {
      var ctx = new RealAudio(options);
      window.__audio.contexts++;
      var osc = ctx.createOscillator.bind(ctx), src = ctx.createBufferSource.bind(ctx);
      ctx.createOscillator = function () { var n = osc(); var st = n.start.bind(n); n.start = function (t) { window.__audio.started.push({ kind: n.type, at: performance.now() }); return st(t) }; return n };
      ctx.createBufferSource = function () { var n = src(); var st = n.start.bind(n); n.start = function (t) { window.__audio.started.push({ kind: n.buffer && n.buffer.length > 1 ? "noise" : "silent", at: performance.now() }); return st(t) }; return n };
      return ctx;
    };
  }
  /* A request with pictures goes over XMLHttpRequest, for its upload progress: answered by the same stub, streamed into responseText. */
  window.XMLHttpRequest = function () {
    var self = this;
    this.readyState = 0; this.status = 0; this.responseText = ""; this.upload = {};
    this.open = function (m, u) { self._m = m; self._u = u };
    this.setRequestHeader = function () {};
    this.abort = function () { self.onabort && self.onabort() };
    this.send = function (body) {
      setTimeout(function () { self.upload.onprogress && self.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 }) }, 100);
      window.fetch(self._u, { method: self._m, body: body }).then(function (res) {
        self.status = res.status; self.readyState = 2; self.onreadystatechange && self.onreadystatechange();
        var reader = res.body.getReader(), dec = new TextDecoder();
        var pump = function () { return reader.read().then(function (r) { if (r.value) { self.responseText += dec.decode(r.value, { stream: true }); self.onprogress && self.onprogress({}) } if (r.done) { self.readyState = 4; self.onload && self.onload(); return } return pump() }) };
        return pump();
      });
    };
  };
  if (q.get("speech") === "fake") {
    var Fake = function () { this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null };
    Fake.prototype.start = function () {
      var self = this;
      window.__listening = true;
      setTimeout(function () { self.onstart && self.onstart() }, 30);
      setTimeout(function () { self.onresult && self.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "make the hero" } }] }) }, 250);
      setTimeout(function () { self.onresult && self.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "make the hero taller" } }] }) }, 600);
    };
    Fake.prototype.stop = function () { var self = this; window.__listening = false; setTimeout(function () { self.onend && self.onend() }, 30) };
    Fake.prototype.abort = function () { window.__listening = false; this.onend && this.onend() };
    window.SpeechRecognition = Fake; window.webkitSpeechRecognition = Fake;
  } else {
    window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;
  }
})();
`

/* Every animation inside a scope, by the properties it moves. */
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

const rect = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) } })
const dockState = (p) => p.$eval("[data-ask-dock]", (el) => el.getAttribute("data-state"))

async function desktop(browser, vp, label, full) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}?speech=${full ? "fake" : "none"}#desktop`)
  await sleep(700)

  /* ── the pill ── */
  const main = await rect(p, "#canvas-main")
  const pill = await rect(p, "[data-ask-pill]")
  const centre = +(pill.x + pill.w / 2 - (main.x + main.w / 2)).toFixed(1)
  const gap = +(main.b - pill.b).toFixed(1)
  expect(Math.abs(centre) <= 1 && Math.abs(gap - 20) <= 1, "the pill is centred on the canvas, 20px above its bottom", { centre, gap })
  expect(pill.w === Math.min(660, main.w - 48) && pill.h >= 52 && pill.h <= 56, "and 660 wide, 52 to 56 tall", { w: pill.w, h: pill.h })
  expect(pill.x >= main.x && pill.r <= main.r, "and over the canvas, never the sidebar", { pillLeft: pill.x, canvasLeft: main.x })
  if (!full) { await p.close(); return }

  const glass = await p.evaluate(() => {
    const g = getComputedStyle(document.querySelector("[data-ask-glass]"))
    return { glass: g.backdropFilter, fill: g.backgroundColor, halo: !!document.querySelector("[data-ask-halo]"), band: !!document.querySelector("[data-ask-fade]"), rings: document.querySelectorAll("[data-ask-soften]").length }
  })
  expect(/blur\(10px\)/.test(glass.glass) && /(, 0\.95\)| \/ 0\.95\))$/.test(glass.fill), "the pill is near solid white: 95% over a light 10px blur", glass)
  /* Round it, the page softening into it and nothing else: the pixels are measured in askai2 (NO GLOW, THE RAMP). */
  expect(!glass.halo && !glass.band && glass.rings === 5, "round it, five rings of blur and nothing else: no halo, no old band", glass)
  const mic0 = await p.$("[data-ask-mic]")
  expect(!!mic0, "with a recogniser, the microphone is there")
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-pill.png`) })

  const canvas0 = await rect(p, "#wb-preview-root")
  const shifts0 = await p.evaluate(() => window.__shifts.reduce((a, b) => a + b, 0))
  expect(shifts0 === 0, "the canvas did not shift when the pill appeared", shifts0)

  /* ── open ── */
  const frames = await p.evaluate(async (ANIM) => {
    const animated = eval(ANIM)
    const dock = document.querySelector("[data-ask-dock]")
    const card = document.querySelector("[data-ask-card]")
    const canvas = document.querySelector("#wb-preview-root")
    const out = []
    const props = new Set()
    document.querySelector("[data-ask-pill] textarea").focus()
    const t0 = performance.now()
    await new Promise((done) => {
      const tick = () => {
        const cs = getComputedStyle(card)
        const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform)
        const c = canvas.getBoundingClientRect()
        out.push({ t: Math.round(performance.now() - t0), o: +(+cs.opacity).toFixed(3), s: +m.a.toFixed(4), ty: +m.f.toFixed(1), cx: c.x, cy: c.y, cw: c.width, ch: c.height })
        for (const pr of animated(dock)) props.add(pr)
        if (performance.now() - t0 < 460) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    return { out, props: [...props] }
  }, ANIMATED)
  const f = frames.out
  const first = f[1] ?? f[0]
  const last = f[f.length - 1]
  const opacityDown = f.filter((x, i) => i && x.o < f[i - 1].o - 0.001).length
  expect(first.o < 0.6 && first.s < 1 && last.o === 1 && last.s === 1 && last.ty === 0, "focusing it opens the conversation: it rises and fades in, and lands unscaled", { first, last: { o: last.o, s: last.s, ty: last.ty }, frames: f.length })
  expect(opacityDown === 0, "and fades one way", opacityDown)
  expect(frames.props.length > 0 && frames.props.every((x) => ["transform", "opacity", "visibility"].includes(x)), "only transform, opacity and visibility animate", frames.props)
  const still = f.every((x) => x.cx === f[0].cx && x.cy === f[0].cy && x.cw === f[0].cw && x.ch === f[0].ch)
  expect(still, "and the canvas stays exactly where it was, every frame")
  expect(await dockState(p) === "open", "it is open", await dockState(p))
  const card = await rect(p, "[data-ask-card]")
  const pillOpen = await rect(p, "[data-ask-pill]")
  expect(Math.abs(card.w - (pill.w + 20)) <= 1 && Math.abs(card.b - (main.b - 10)) <= 1 && Math.abs(pillOpen.b - pill.b) <= 1, "above the pill, which is now its input row and did not move", { card: [card.w, card.h], cardBottomGap: +(main.b - card.b).toFixed(1), pillMoved: +(pillOpen.b - pill.b).toFixed(1) })
  await sleep(250)
  const head = await p.evaluate(() => [...document.querySelectorAll("[data-ask-header] button")].map((b) => b.getAttribute("aria-label")))
  expect(["Conversation history", "New chat", "Maximize", "Close chat"].every((x) => head.includes(x)), "the header has history, new chat, maximize and close", head)
  const title = await p.$eval("[data-ask-title]", (e) => e.textContent)
  expect(title === "Make the header black", "and the conversation's name", title)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-open.png`) })

  /* ── history ── */
  const slide = await p.evaluate(async () => {
    const thread = document.querySelector('[data-ask-view="thread"]')
    const x = (el) => { const t = getComputedStyle(el).transform; return new DOMMatrixReadOnly(t === "none" ? undefined : t).e }
    const mountedBefore = !!document.querySelector('[data-ask-view="history"]')
    document.querySelector("[data-ask-history-button]").click()
    const out = []
    const t0 = performance.now()
    await new Promise((done) => { const tick = () => { const h = document.querySelector('[data-ask-view="history"]'); if (h) out.push({ th: x(thread), hi: x(h), w: h.getBoundingClientRect().width }); if (performance.now() - t0 < 520) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    return { mountedBefore, before: out[0], mid: out[Math.floor(out.length / 3)], after: out[out.length - 1], w: out[0].w }
  })
  expect(!slide.mountedBefore, "the history is not in the page until it is asked for")
  expect(Math.abs(slide.before.hi - slide.w) < 2 && slide.mid.hi > 0 && slide.mid.hi < slide.w && slide.after.hi === 0 && slide.after.th < 0, "the history slides in from the right over the thread", { from: Math.round(slide.before.hi), mid: Math.round(slide.mid.hi), to: slide.after.hi, thread: Math.round(slide.after.th) })
  await sleep(150)
  const rows = await p.$$eval("[data-history-row]", (r) => r.map((x) => [x.getAttribute("data-history-row").slice(0, 8), x.textContent.trim().slice(0, 40), x.getAttribute("aria-current")]))
  expect(rows.length === 3 && rows[0][2] === "true" && rows[2][0] === "earlier", "newest first, the open one marked, the earlier messages last", rows)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-history.png`) })
  await p.click('[data-history-row="22222222-2222-4222-8222-222222222222"]')
  await sleep(500)
  const opened = await p.evaluate(() => ({
    title: document.querySelector("[data-ask-title]").textContent,
    prompt: [...document.querySelectorAll("[data-ask-prompt]")].map((x) => x.textContent),
    thread: getComputedStyle(document.querySelector('[data-ask-view="thread"]')).transform,
  }))
  expect(opened.title === "Add an FAQ with five questions" && opened.prompt[0] === "Add an FAQ with five questions" && opened.thread === "none", "opening one slides back to it", opened)

  /* ── maximize ── */
  const maxFrames = await p.evaluate(async () => {
    const surface = document.querySelector("[data-ask-surface]")
    document.querySelector("[data-ask-maximize]").click()
    const out = []
    const t0 = performance.now()
    await new Promise((done) => { const tick = () => { const cs = getComputedStyle(surface); const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform); out.push({ sx: +m.a.toFixed(3), sy: +m.d.toFixed(3) }); if (performance.now() - t0 < 460) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    return out
  })
  await sleep(100)
  const big = await rect(p, "[data-ask-card]")
  const wantW = Math.min(960, main.w - 48)
  const wantH = Math.min(main.h - 48, Math.round(vp.height * 0.85))
  const centredX = +(big.x + big.w / 2 - (main.x + main.w / 2)).toFixed(1)
  const centredY = +(big.y + big.h / 2 - (main.y + main.h / 2)).toFixed(1)
  expect(Math.abs(big.w - wantW) <= 1 && Math.abs(big.h - wantH) <= 1 && Math.abs(centredX) <= 1 && Math.abs(centredY) <= 1, "maximize: min(960, canvas - 48) by min(canvas - 48, 85% of the window), centred", { size: [big.w, big.h], want: [wantW, wantH], centredX, centredY })
  const grew = maxFrames.filter((x) => x.sx < 0.999).length
  expect(grew >= 3 && maxFrames[maxFrames.length - 1].sx === 1, "drawn from the old size by transform, frame by frame", { framesScaled: grew, firstScale: maxFrames[0] })
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-maximized.png`) })
  await p.click("[data-ask-maximize]")
  await sleep(450)
  const back = await rect(p, "[data-ask-card]")
  expect(Math.abs(back.w - card.w) <= 1 && Math.abs(back.h - card.h) <= 1, "and restore puts it back", [back.w, back.h])

  /* ── pictures ── */
  const dir = mkdtempSync(join(tmpdir(), "askai-files-"))
  const png = join(dir, "screenshot.png")
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgASIVAAC8GAP/5pVQlgAAAABJRU5ErkJggg==", "base64"))
  const input = await p.$("[data-ask-pill] input[type=file]")
  await input.uploadFile(png)
  await sleep(400)
  const thumbs = await p.evaluate(() => ({
    n: document.querySelectorAll("[data-ask-thumb]").length,
    remove: !!document.querySelector('[data-ask-thumb] button[aria-label^="Remove"]'),
    send: document.querySelector("[data-ask-send]").disabled,
    pillH: Math.round(document.querySelector("[data-ask-pill]").getBoundingClientRect().height),
  }))
  expect(thumbs.n === 1 && thumbs.remove && thumbs.send === false, "a chosen picture is a thumbnail with a remove button, and Send is live", thumbs)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-attached.png`) })
  const rendersBefore = await p.evaluate(() => window.__editorRenders)
  await p.type("[data-ask-pill] textarea", "Build this")
  await p.click("[data-ask-send]")
  await sleep(250)
  const sending = await p.evaluate(() => ({ sending: document.querySelectorAll("[data-ask-sending]").length, sent: document.querySelectorAll("[data-ask-sent-image]").length, thumbs: document.querySelectorAll("[data-ask-thumb]").length }))
  expect(sending.sending === 1 && sending.sent === 1 && sending.thumbs === 0, "sent with the message: in the thread, saying it is sending, and gone from the box", sending)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-sending.png`) })
  await sleep(1400)
  const post = await p.evaluate(() => ({ posts: window.__posts, sending: document.querySelectorAll("[data-ask-sending]").length }))
  expect(post.posts.length === 1 && post.posts[0].images === 1 && post.posts[0].conversationId === "22222222-2222-4222-8222-222222222222" && post.sending === 0, "the request carried the picture and the open conversation's id; sending is over", post)
  const titleAfter = await p.$eval("[data-ask-title]", (e) => e.textContent)
  expect(titleAfter === "Add an FAQ with five questions", "and it stayed in that conversation, under its name", titleAfter)
  const rendersAfter = await p.evaluate(() => window.__editorRenders)
  expect(rendersAfter === rendersBefore, "typing ten characters and a whole streamed run rendered the editor around it 0 times", { before: rendersBefore, after: rendersAfter })
  await p.click("[data-ask-sent-image]")
  await sleep(300)
  const viewer = await p.evaluate(() => { const v = document.querySelector("[data-ask-keep] > div"); if (!v) return null; const r = v.getBoundingClientRect(); return { w: r.width, h: r.height, inBody: v.parentElement.parentElement === document.body } })
  expect(!!viewer && viewer.w === vp.width && viewer.h === vp.height && viewer.inBody, "and it opens full screen, drawn in the body, not inside the frosted dock", viewer)
  await p.keyboard.press("Escape")
  await sleep(250)
  expect(await dockState(p) === "open", "Escape closes the picture first, and leaves the conversation open", await dockState(p))
  rmSync(dir, { recursive: true, force: true })

  /* ── voice ── */
  await p.click("[data-ask-mic]")
  await sleep(350)
  const hearing = await p.evaluate(() => ({ state: document.querySelector("[data-ask-mic]").getAttribute("data-ask-mic"), clock: document.querySelector("[data-ask-voice-clock]")?.textContent, text: document.querySelector("[data-ask-pill] textarea").value }))
  /* They type themselves in a few characters a frame, so a moment in they are on their way to "make the hero". */
  expect(hearing.state === "listening" && hearing.clock === "0:00" && hearing.text.length > 0 && "make the hero".startsWith(hearing.text), "the microphone listens, with a clock, and the words arrive while they are said", hearing)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-listening.png`) })
  await sleep(400)
  await p.click("[data-ask-mic]")
  await sleep(200)
  const heard = await p.evaluate(() => ({ state: document.querySelector("[data-ask-mic]").getAttribute("data-ask-mic"), text: document.querySelector("[data-ask-pill] textarea").value, posts: window.__posts.length }))
  expect(heard.state === "idle" && heard.text === "make the hero taller" && heard.posts === 1, "stop: the words stay in the box, and nothing is sent", heard)

  /* ── escape, outside ── */
  await p.evaluate(() => { const t = document.querySelector("[data-ask-pill] textarea"); t.focus() })
  await p.keyboard.press("Escape")
  await sleep(350)
  const afterEsc = await p.evaluate(() => ({ state: document.querySelector("[data-ask-dock]").getAttribute("data-state"), kept: document.querySelector("[data-ask-pill] textarea").value, prompts: document.querySelectorAll("[data-ask-prompt]").length }))
  expect(afterEsc.state === "pill" && afterEsc.kept === "make the hero taller" && afterEsc.prompts === 2, "Escape folds it back to the pill, keeping the draft and the conversation", afterEsc)
  await p.click("[data-ask-pill] textarea")
  await sleep(400)
  await p.mouse.click(main.x + 40, main.y + 60)
  await sleep(350)
  expect(await dockState(p) === "pill", "a press on the canvas does too", await dockState(p))

  /* ── the toolbar ── */
  /* Where a section starting near the bottom of the canvas puts its toolbar: over the pill's right end. */
  await p.evaluate((at) => { const t = document.getElementById("fake-toolbar"); t.style.display = "block"; t.style.left = `${at.left}px`; t.style.top = `${at.top}px` }, { left: pill.x - main.x + pill.w - 200, top: pill.y - main.y + 6 })
  await p.evaluate(() => window.dispatchEvent(new Event("resize")))
  await sleep(450)
  const yielded = await p.$eval("[data-ask-pill-state]", (e) => ({ state: e.getAttribute("data-ask-pill-state"), o: getComputedStyle(document.querySelector("[data-ask-glass]")).opacity, pe: getComputedStyle(e).pointerEvents }))
  expect(yielded.state === "away" && yielded.pe === "none", "the section toolbar over the pill: the pill steps out of its way", yielded)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-toolbar.png`) })
  await p.evaluate(() => { document.getElementById("fake-toolbar").style.display = "none"; window.dispatchEvent(new Event("resize")) })
  await sleep(450)
  expect(await p.$eval("[data-ask-pill-state]", (e) => e.getAttribute("data-ask-pill-state")) === "shown", "and comes back when it moves")

  /* ── close ── */
  await p.click("[data-ask-pill] textarea")
  await sleep(400)
  await p.click("[data-ask-close]")
  await sleep(400)
  const closed = await p.evaluate(() => { const s = getComputedStyle(document.querySelector("[data-ask-pill-state]")); return { state: document.querySelector("[data-ask-dock]").getAttribute("data-state"), glass: getComputedStyle(document.querySelector("[data-ask-glass]")).opacity, v: s.visibility } })
  expect(closed.state === "hidden" && closed.glass === "0" && closed.v === "hidden", "close hides the conversation and the pill", closed)
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-closed.png`) })
  await p.click("#ask-ai-toggle")
  await sleep(400)
  expect(await dockState(p) === "pill", "the bar's Ask AI brings the pill back", await dockState(p))

  /* ── reduced motion ── */
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await sleep(150)
  const calm = await p.evaluate(async (ANIM) => {
    const animated = eval(ANIM)
    const dock = document.querySelector("[data-ask-dock]")
    document.querySelector("[data-ask-pill] textarea").focus()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const card = getComputedStyle(document.querySelector("[data-ask-card]"))
    return { moving: animated(dock), state: dock.getAttribute("data-state"), opacity: card.opacity, transform: card.transform }
  }, ANIMATED)
  expect(calm.moving.length === 0 && calm.state === "open" && calm.opacity === "1" && calm.transform === "none", "under reduced motion it opens at once and nothing moves", calm)
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

  if (errors.length) expect(false, "no errors on the page", errors)
  await p.close()
}

async function noSpeech(browser) {
  console.log("\ndesktop-1440, no recogniser and no transcription")
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`file://${join(stubs, "index.html")}?speech=none&transcribe=0#desktop`)
  await sleep(700)
  expect(!(await p.$("[data-ask-mic]")), "no microphone is drawn")
  await p.goto(`file://${join(stubs, "index.html")}?speech=none&transcribe=1#desktop`)
  await sleep(700)
  expect(!!(await p.$("[data-ask-mic]")), "and with a transcription route it is, recording instead")
  await p.close()
}

async function phone(browser) {
  console.log("\nphone-390")
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}?speech=fake#phone`)
  await sleep(1100)
  const head = await p.$$eval("[data-ask-header] button", (b) => b.map((x) => {
    const r = x.getBoundingClientRect()
    /* A pill smaller than 44px answers a thumb through its ::after box. */
    const after = getComputedStyle(x, "::after")
    const reach = after.content !== "none" && after.position === "absolute" ? r.height - parseFloat(after.top) - parseFloat(after.bottom) : r.height
    return [x.getAttribute("aria-label") || x.textContent.trim(), Math.round(r.width), Math.round(reach)]
  }))
  /* A phone's sheet is resized by its handle; its top row gives maximize's room to Connect AI. */
  expect(["Conversation history", "Connect AI", "New chat", "Close chat"].every((x) => head.some((h) => h[0] === x)) && !head.some((h) => h[0] === "Maximize" || h[0] === "Restore size"), "the sheet has history, Connect AI, new chat and close", head.map((h) => h[0]))
  expect(head.every(([, w, h]) => w >= 44 && h >= 44), "each answers at least 44px", head)
  const composer = await p.$$eval("[data-chat-composer] button", (b) => b.map((x) => { const r = x.getBoundingClientRect(); return [x.getAttribute("aria-label") || x.textContent.trim(), Math.round(r.width), Math.round(r.height)] }))
  expect(composer.length >= 4 && composer.every(([, w, h]) => w >= 44 && h >= 44), "the composer's buttons, model, attach, microphone and send, 44px", composer)
  const noSideways = await p.$eval("[data-ask-sheet]", (e) => e.scrollWidth <= e.clientWidth)
  expect(noSideways, "nothing in the sheet is wider than it")
  await p.screenshot({ path: join(shots, `${PREFIX}phone-390-sheet.png`) })

  await p.tap("[data-ask-model]")
  await sleep(700)
  const menu = await p.$$eval("[data-ask-model-menu] [role=option]", (o) => o.map((x) => [x.textContent.slice(0, 13), Math.round(x.getBoundingClientRect().height), !!x.closest("[data-app-sheet]")]))
  expect(menu.length === 3 && menu.every(([, h, inSheet]) => h >= 44 && inSheet), "the model menu is the shared bottom sheet: three choices, each 44px or more", menu)
  await p.screenshot({ path: join(shots, `${PREFIX}phone-390-models.png`) })
  await p.keyboard.press("Escape")
  await sleep(600)
  await p.tap("[data-ask-history-button]")
  await sleep(500)
  const hist = await p.evaluate(() => ({ rows: document.querySelectorAll("[data-history-row]").length, h: Math.round(document.querySelector("[data-history-row]").getBoundingClientRect().height), t: getComputedStyle(document.querySelector('[data-ask-view="history"]')).transform }))
  expect(hist.rows === 3 && hist.h >= 44 && hist.t === "none", "the history slides in, rows 44px or more", hist)
  await p.screenshot({ path: join(shots, `${PREFIX}phone-390-history.png`) })
  await p.tap('[data-ask-header] button[aria-label="Back to the conversation"]')
  await sleep(450)
  await p.tap("[data-ask-mic]")
  await sleep(400)
  const phoneVoice = await p.evaluate(() => ({ state: document.querySelector("[data-ask-mic]").getAttribute("data-ask-mic"), text: document.querySelector("[data-chat-composer] textarea").value }))
  expect(phoneVoice.state === "listening" && phoneVoice.text.length > 0, "the microphone listens on a phone too", phoneVoice)
  await p.screenshot({ path: join(shots, `${PREFIX}phone-390-listening.png`) })
  await p.tap("[data-ask-mic]")
  await sleep(300)
  await p.tap("[data-ask-new]")
  await sleep(300)
  const fresh = await p.evaluate(() => ({ prompts: document.querySelectorAll("[data-ask-prompt]").length, title: document.querySelector("[data-ask-title]").textContent }))
  expect(fresh.prompts === 0 && fresh.title === "Ask Storelib", "new chat starts an empty conversation", fresh)
  if (errors.length) expect(false, "no errors on the page", errors)
  await p.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   ASKAI2: glass without glow, pictures that stay pictures, sounds, and the
   answer's actions. Screenshots askai2-*.
   ═══════════════════════════════════════════════════════════════════════ */

const P2 = "askai2-"
const measures = {}

async function openAt(browser, vp, query, hash = "#desktop") {
  const p = await browser.newPage()
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}?${query}${hash}`)
  await sleep(900)
  return p
}
const closeWith = async (p) => {
  if (p.__errors.length) expect(false, "no errors on the page", p.__errors)
  await p.close()
}

/* Luminance of every pixel in a region, from a screenshot, read in the page. */
const PIXELS = `async (src, clip) => {
  const img = new Image()
  await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64," + src })
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height
  const x = c.getContext("2d"); x.drawImage(img, 0, 0)
  const X0 = Math.round(clip.x), Y0 = Math.round(clip.y), w = Math.round(clip.width), h = Math.round(clip.height)
  const d = x.getImageData(X0, Y0, w, h).data
  const lum = new Float32Array(w * h)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]
  return { w, h, lum: Array.from(lum) }
}`

/*
  THE WHOLE WINDOW, THEN THE PART. A screenshot clipped to a small box
  redraws only that box, and a backdrop blur inside it then has nothing
  beyond the box to blur with: a 16px wide clip read the band as half as
  blurred as it is on screen. So every measurement is taken from a picture
  of the whole window, as a person sees it, and cut to the region after.
*/
async function grab(p, clip) {
  const src = await p.screenshot({ encoding: "base64" })
  return p.evaluate(`(${PIXELS})(${JSON.stringify(src)}, ${JSON.stringify(clip)})`)
}

/* ── GLASS: what the pill and the conversation are made of ──────────── */
async function glassStyles(browser, vp) {
  const label = `glass-${vp.width}`
  console.log(`\n${label}`)
  const p = await openAt(browser, vp, "speech=none&canvas=photo")
  const read = () => p.evaluate(() => {
    const style = (sel) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const c = getComputedStyle(e)
      return { backdrop: c.backdropFilter || c.webkitBackdropFilter, fill: c.backgroundColor, border: `${c.borderTopWidth} ${c.borderTopColor}`, shadow: c.boxShadow, opacity: c.opacity, mask: c.maskImage || c.webkitMaskImage, radius: c.borderTopLeftRadius }
    }
    return { glass: style("[data-ask-glass]"), card: style("[data-ask-card]"), surface: style("[data-ask-surface]"), halo: !!document.querySelector("[data-ask-halo]"), band: !!document.querySelector("[data-ask-fade]"), rings: [...document.querySelectorAll("[data-ask-soften]")].map((e) => { const c = getComputedStyle(e); return { backdrop: c.backdropFilter || c.webkitBackdropFilter, fill: c.backgroundColor, shadow: c.boxShadow, mask: c.maskImage || c.webkitMaskImage } }) }
  })
  /* Every shadow layer: its colour, and whether it is inside. */
  const layers = (shadow) => (shadow.match(/rgba?\([^)]*\)[^,]*(?:,|$)/g) ?? []).map((l) => {
    const [r, g, b, a = "1"] = l.match(/rgba?\(([^)]*)\)/)[1].split(",").map((x) => x.trim())
    return { r: +r, g: +g, b: +b, a: +a, inset: /inset/.test(l) }
  })
  const folded = await read()
  const gl = layers(folded.glass.shadow)
  const outside = gl.filter((l) => !l.inset)
  measures[label] = { glass: folded.glass }
  expect(/blur\(10px\)/.test(folded.glass.backdrop), "the pill: a light 10px backdrop blur", folded.glass.backdrop)
  expect(/0\.95\)$/.test(folded.glass.fill), "a near solid white fill, 95%", folded.glass.fill)
  /* Chromium may report the ink border in oklab (Tailwind mixes it there): alpha 0.08. */
  expect(/^1px .*0\.08\)$/.test(folded.glass.border) && outside.some((l) => l.r < 40 && l.a <= 0.08 && l.a > 0), "a hairline edge of ink", { border: folded.glass.border })
  /* Tailwind's stack carries empty layers (transparent, no size); what is drawn is the rest. */
  const drawn = outside.filter((l) => l.a > 0)
  expect(drawn.length >= 4 && drawn.every((l) => l.r <= 60 && l.g <= 60 && l.b <= 60), "a hairline and three shadows for depth, every one of them ink and none of them light", drawn)
  expect(!folded.halo, "and no halo element at all")
  expect(!folded.band, "and not the one masked band that ended in a hard edge")
  expect(
    folded.rings.length === 5 && folded.rings.every((r) => /blur\(/.test(r.backdrop) && r.mask && r.mask !== "none" && /, 0\)$/.test(r.fill) && r.shadow === "none"),
    "what is round it instead: five rings that only blur the page, each feathered by its own mask, none of them holding a colour",
    folded.rings.map((r) => r.backdrop),
  )
  await p.screenshot({ path: join(shots, `${P2}${label}-pill.png`) })

  /* THE BLUR STAYS ON WHILE IT FADES: no glass layer has an ancestor below full opacity, frame by frame, opening and closing. */
  const frames = await p.evaluate(async () => {
    const glassy = () => [...document.querySelectorAll("[data-ask-dock] *")].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== "none" })
    const worst = () => {
      let min = 1
      for (const e of glassy()) for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) min = Math.min(min, +getComputedStyle(a).opacity)
      return min
    }
    const out = []
    const watch = (ms) => new Promise((done) => { const t0 = performance.now(); const tick = () => { out.push(worst()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done() }; requestAnimationFrame(tick) })
    document.querySelector("[data-ask-pill] textarea").focus()
    await watch(420)
    document.querySelector("[data-ask-pill] textarea").blur()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await watch(420)
    return { frames: out.length, lowest: Math.min(...out), layers: glassy().length }
  })
  expect(frames.lowest === 1 && frames.layers >= 1, "while the conversation opens and folds, no blurred layer sits under a fading one: the blur never switches off", frames)

  await p.click("[data-ask-pill] textarea")
  await sleep(500)
  const open = await read()
  measures[label].surface = open.surface
  expect((!open.surface.backdrop || open.surface.backdrop === "none") && open.surface.fill === "rgb(255, 255, 255)", "the open conversation: solid white, no backdrop filter", { backdrop: open.surface.backdrop, fill: open.surface.fill })
  const sl = layers(open.surface.shadow).filter((l) => !l.inset && l.a > 0)
  expect(sl.length >= 4 && sl.every((l) => l.r <= 60 && l.g <= 60 && l.b <= 60), "with ink shadows only", sl)
  expect(open.card.opacity === "1", "and it is fully shown", open.card.opacity)
  await p.screenshot({ path: join(shots, `${P2}${label}-open.png`) })
  await closeWith(p)
}

/* ── NO GLOW: nothing round the pill is lighter than the page under it ── */
async function noGlow(browser, vp) {
  const label = `noglow-${vp.width}`
  console.log(`\n${label}`)
  const p = await openAt(browser, vp, "speech=none&canvas=dark")
  const pill = await rect(p, "[data-ask-pill]")
  const main = await rect(p, "#canvas-main")
  const R = 90
  const clip = { x: Math.max(main.x, pill.x - R), y: Math.max(main.y, pill.y - R), width: 0, height: 0 }
  clip.width = Math.min(main.r, pill.r + R) - clip.x
  clip.height = Math.min(main.b, pill.b + R) - clip.y
  /* The page's own colour, far from the pill. */
  const far = await grab(p, { x: main.x + 20, y: main.y + 20, width: 40, height: 40 })
  const bg = far.lum.reduce((a, b) => a + b, 0) / far.lum.length
  const ring = (px) => {
    let lift = 0, lifted = 0, darker = 0, n = 0
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const X = clip.x + x, Y = clip.y + y
      /* The pill itself and a pixel of its edge are the pill, not what is round it. */
      if (X >= pill.x - 1 && X <= pill.r + 1 && Y >= pill.y - 1 && Y <= pill.b + 1) continue
      const d = px.lum[y * px.w + x] - bg
      n++
      if (d > lift) lift = d
      if (d > 2) lifted++
      if (d < -2) darker++
    }
    return { maxLift: +lift.toFixed(1), liftedPixels: lifted, shadowPixels: darker, sampled: n }
  }
  const now = ring(await grab(p, clip))
  await p.screenshot({ path: join(shots, `${P2}${label}-dark.png`), clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } })
  /* The same check on the old glow, put back for a moment, to show it would be seen. */
  await p.evaluate((g) => {
    const h = document.createElement("div")
    h.id = "old-halo"
    h.style.cssText = `position:absolute;left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;border-radius:9999px;box-shadow:0 6px 44px 14px rgba(248,249,250,0.5);pointer-events:none;z-index:10`
    document.body.appendChild(h)
  }, { x: pill.x, y: pill.y, w: pill.w, h: pill.h })
  await sleep(100)
  const old = ring(await grab(p, clip))
  await p.screenshot({ path: join(shots, `${P2}${label}-old-glow.png`), clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } })
  measures[label] = { background: +bg.toFixed(1), now, old }
  expect(now.maxLift <= 2 && now.liftedPixels === 0, `no pixel within ${R}px of the pill is lighter than the page (lifted by at most 2 of 255)`, now)
  expect(now.shadowPixels > 200, "what is there is shadow, darker than the page", { shadowPixels: now.shadowPixels })
  expect(old.maxLift >= 40 && old.liftedPixels > 1000, "and the same check on the old glow finds it", old)
  await closeWith(p)
}

/* ── THE RAMP: the page softens into the pill, and stops being touched ── */
async function softenRamp(browser, vp) {
  const label = `soften-${vp.width}`
  console.log(`\n${label}`)
  /*
    "The blur around the pill is not fading, disappearing smoothly. It's very
    cut around." That was one masked band, and WebKit draws a backdrop blur
    but not the mask that feathers it, so it ended in a hard edge. It is
    five rings now (SOFTEN_RINGS), and this reads the ramp off the page
    rather than off the CSS: over fine stripes, the contrast of each row
    above the pill, as a share of the page's own contrast further out.

    Sharp out there, nothing left at the pill, and no jump between one row
    and the next — and then the masks are taken off every ring, which is
    what WebKit does to them, and it is measured again. That fallback is
    the whole reason there are five of them: without a mask the rings are
    still a staircase of five blur radii, not a cut.
  */
  const s = await openAt(browser, vp, "speech=none&canvas=stripes")
  const sp = await rect(s, "[data-ask-pill]")
  await s.screenshot({ path: join(shots, `${P2}${label}-stripes.png`), clip: { x: sp.x - 60, y: sp.y - 60, width: 240, height: sp.h + 90 } })
  const cx = Math.round(sp.x + sp.w / 2)
  const contrast = (px, row) => { let mn = 255, mx = 0; for (let x = 0; x < px.w; x++) { const v = px.lum[row * px.w + x]; mn = Math.min(mn, v); mx = Math.max(mx, v) } return mx - mn }
  const ramp = async () => {
    const above = await grab(s, { x: cx - 8, y: Math.round(sp.y - 48), width: 16, height: 40 })
    const rows = Array.from({ length: above.h }, (_, r) => contrast(above, r))
    const full = Math.max(...rows.slice(0, 6))
    return rows.map((c) => +(c / full).toFixed(3))
  }
  const shape = (profile) => {
    let step = 0
    let rises = 0
    let steps = 0
    for (let i = 1; i < profile.length; i++) {
      step = Math.max(step, Math.abs(profile[i] - profile[i - 1]))
      if (profile[i] > profile[i - 1] + 0.02) rises++
      if (profile[i] < profile[i - 1] - 0.03) steps++
    }
    return { far: profile[0], atPill: profile[profile.length - 1], biggestStep: +step.toFixed(3), steps, rises }
  }
  const rings = await s.$$eval("[data-ask-soften]", (e) => e.length)
  const masked = await s.evaluate(() => [...document.querySelectorAll("[data-ask-soften]")].filter((e) => { const c = getComputedStyle(e); const m = c.maskImage || c.webkitMaskImage; return m && m !== "none" }).length)
  const withMask = await ramp()
  /* What WebKit is left with: the same rings, their masks dropped. */
  await s.evaluate(() => { document.querySelectorAll("[data-ask-soften]").forEach((e) => { e.style.maskImage = "none"; e.style.webkitMaskImage = "none" }) })
  await sleep(160)
  const noMask = await ramp()
  await s.screenshot({ path: join(shots, `${P2}${label}-stripes-unmasked.png`), clip: { x: sp.x - 60, y: sp.y - 60, width: 240, height: sp.h + 90 } })
  await closeWith(s)
  const a = shape(withMask), b = shape(noMask)
  measures[label] = { rings, masked, withMask: { profile: withMask, ...a }, noMask: { profile: noMask, ...b } }
  expect(rings >= 3 && masked === rings, "every ring is feathered by a mask of its own", { rings, masked })
  expect(a.far >= 0.95 && a.atPill <= 0.1 && a.rises === 0 && a.biggestStep <= 0.16, "the page runs from untouched, out past the rings, to fully softened at the pill, one row at a time and never back", a)
  /*
    Stripes every other pixel are the finest thing a screen can hold, and
    the worst case there is: the first ring that touches them at all takes
    half their contrast whatever its radius, so what is asked of the
    fallback is that the softening ARRIVES IN STEPS — four or more of them,
    none taking the page all the way — rather than in the single cut one
    masked band left behind. On ordinary page content (see the blue canvas
    in scripts/check-ask-dock.mjs) the same staircase is not visible at all.
  */
  expect(b.far >= 0.95 && b.atPill <= 0.3 && b.steps >= 4 && b.biggestStep <= 0.6, "and with the masks dropped, as WebKit drops them, the softening still arrives in steps and never in one cut", b)
}

/* ── PICTURES: a thumbnail now, and after a reload ─────────────────────── */
async function pictures(browser, vp) {
  const label = `pictures-${vp.width}`
  console.log(`\n${label}`)
  const p = await openAt(browser, vp, "speech=none")
  const dir = mkdtempSync(join(tmpdir(), "askai2-files-"))
  const file = join(dir, "layout.png")
  const drawn = await p.evaluate(async () => { const c = new OffscreenCanvas(640, 400); const x = c.getContext("2d"); x.fillStyle = "#0f766e"; x.fillRect(0, 0, 640, 400); x.fillStyle = "#fff"; x.fillRect(60, 60, 260, 120); const b = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s) })
  writeFileSync(file, Buffer.from(drawn, "base64"))
  const input = await p.$("[data-ask-pill] input[type=file]")
  await input.uploadFile(file)
  await sleep(700)
  await p.click("[data-ask-send]")
  await sleep(2400)
  const live = await p.evaluate(() => {
    const img = document.querySelector("[data-ask-sent-image] img")
    const r = img?.getBoundingClientRect()
    return { thumbs: document.querySelectorAll("[data-ask-sent-image]").length, loaded: !!img && img.complete && img.naturalWidth > 0, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, noted: /attached\]/.test(document.querySelector("[data-chat-thread]").textContent), prompt: [...document.querySelectorAll("[data-ask-prompt]")].pop()?.textContent }
  })
  expect(live.thumbs === 1 && live.loaded && live.w === 64 && live.h === 64 && !live.noted && live.prompt === "Build this.", "live: the sent picture is a 64px thumbnail that has loaded, and no note in words", live)
  await p.screenshot({ path: join(shots, `${P2}${label}-live.png`) })
  rmSync(dir, { recursive: true, force: true })
  await closeWith(p)

  /* After a reload: one picture came back, one's address no longer loads, and one question's picture is past its thirty days. */
  const r = await openAt(browser, vp, "speech=none&chat=pictures")
  await r.click("[data-ask-pill] textarea")
  await sleep(900)
  const back = await r.evaluate(() => {
    const img = document.querySelector("[data-ask-sent-image] img")
    const tiles = [...document.querySelectorAll("[data-ask-missing-image]")].map((t) => ({ label: t.getAttribute("aria-label"), text: t.textContent, w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height) }))
    return {
      thumbs: document.querySelectorAll("[data-ask-sent-image]").length,
      loaded: !!img && img.complete && img.naturalWidth > 0,
      tiles,
      prompts: [...document.querySelectorAll("[data-ask-prompt]")].map((x) => x.textContent),
      noted: /attached\]/.test(document.querySelector("[data-chat-thread]").textContent),
      notice: document.querySelector("[data-ask-not-set-up]")?.textContent ?? null,
    }
  })
  expect(back.thumbs === 1 && back.loaded, "after a reload the picture that came back is a thumbnail again, loaded", back)
  expect(back.tiles.length === 2 && back.tiles.every((t) => t.label === "Picture no longer available" && t.h === 64 && /Picture no longer available/.test(t.text)), "one whose address does not load and one past its thirty days are tiles that say so, the thumbnail's height", back.tiles)
  expect(!back.noted && back.prompts.join(" | ") === "Build this | Build this.", "and no message shows the note in words", back.prompts)
  expect(back.notice === null, "with the database set up there is no notice")
  await r.screenshot({ path: join(shots, `${P2}${label}-reloaded.png`) })
  await r.click("[data-ask-sent-image]")
  await sleep(350)
  const viewer = await r.evaluate(() => { const v = document.querySelector("[data-ask-keep] > div"); const img = v?.querySelector("img"); return v ? { inBody: v.parentElement.parentElement === document.body, img: !!img && img.naturalWidth > 0 } : null })
  expect(!!viewer && viewer.inBody && viewer.img, "and it opens in the viewer", viewer)
  await r.keyboard.press("Escape")
  await closeWith(r)

  /* Before the database update, said once, above the thread. */
  const u = await openAt(browser, vp, "speech=none&chat=unsaved")
  await u.click("[data-ask-pill] textarea")
  await sleep(700)
  const unsaved = await u.evaluate(() => ({ text: document.querySelector('[data-ask-not-set-up="chat"]')?.textContent ?? null, failed: /could not be loaded/.test(document.querySelector("[data-chat-thread]").textContent), chips: document.querySelectorAll("[data-ask-suggestion]").length }))
  expect(unsaved.text === "Chats are not saved yet. They are kept once the database update is run." && !unsaved.failed && unsaved.chips > 0, "no chat table yet: the chat says it is not saved, not that it failed, and can still be used", unsaved)
  await u.screenshot({ path: join(shots, `${P2}${label}-not-saved.png`) })
  await closeWith(u)
  const n = await openAt(browser, vp, "speech=none&chat=pictures&pictures=not_set_up")
  await n.click("[data-ask-pill] textarea")
  await sleep(700)
  const noPics = await n.evaluate(() => document.querySelector('[data-ask-not-set-up="pictures"]')?.textContent ?? null)
  expect(noPics === "Pictures show here until you leave. They are kept once the database update is run.", "no pictures table yet: said above the thread", noPics)
  await closeWith(n)
}

/* ── SOUNDS: how they sound, when they play, and the switch ──────────── */
async function sounds(browser) {
  console.log("\nsounds")
  const p = await openAt(browser, { width: 1280, height: 800 }, "speech=fake")
  /* Rendered offline from the real graph: how loud, how long. */
  const levels = await p.evaluate(async () => {
    const { ASK_SOUNDS, scheduleSound } = window.__askSounds
    const out = {}
    for (const name of ASK_SOUNDS) {
      const ctx = new OfflineAudioContext(1, 48000, 48000)
      scheduleSound(ctx, name, 0.01, ctx.destination)
      const data = (await ctx.startRendering()).getChannelData(0)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v))
      let last = 0
      for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > peak * 0.01) last = i
      out[name] = { peakDbfs: +(20 * Math.log10(peak)).toFixed(1), heardMs: Math.round((last / 48000 - 0.01) * 1000) }
    }
    return out
  })
  measures.soundLevels = levels
  expect(Object.values(levels).every((l) => l.peakDbfs <= -18 && l.peakDbfs >= -24), "every sound peaks near -20 dBFS (between -24 and -18)", levels)
  expect(levels["record-start"].heardMs <= 140 && levels["record-stop"].heardMs <= 140 && levels.sent.heardMs >= 190 && levels.sent.heardMs <= 260 && levels.done.heardMs >= 340 && levels.done.heardMs <= 470, "ticks about 100ms, the whoosh about 230ms, the chime about 400ms", levels)

  /* When they play. */
  const count = () => p.evaluate(() => ({ contexts: window.__audio.contexts, started: window.__audio.started.map((s) => s.kind) }))
  const onLoad = await count()
  expect(onLoad.contexts === 0 && onLoad.started.length === 0, "on page load no audio is made and nothing plays", onLoad)
  await p.click("[data-ask-pill] textarea")
  await sleep(500)
  const gestured = await count()
  expect(gestured.contexts === 1 && !gestured.started.some((k) => k !== "silent"), "the first press makes one context, and plays nothing you can hear", gestured)
  await p.type("[data-ask-pill] textarea", "Make it calmer")
  const before = (await count()).started.length
  await p.keyboard.press("Enter")
  await sleep(250)
  const whoosh = (await count()).started.slice(before)
  expect(whoosh.includes("noise"), "sending plays the whoosh", whoosh)
  await sleep(1800)
  const chime = (await count()).started.slice(before)
  expect(chime.filter((k) => k === "sine").length >= 4, "the answer arriving plays the chime: two notes, each with its octave", chime)
  const b2 = (await count()).started.length
  await p.click("[data-ask-mic]")
  await sleep(450)
  const opened = (await count()).started.slice(b2)
  await p.click("[data-ask-mic]")
  await sleep(300)
  const closed = (await count()).started.slice(b2 + opened.length)
  expect(opened.includes("triangle") && closed.includes("triangle"), "the microphone ticks as it opens and again as it closes", { opened, closed })
  const all = await count()
  expect(all.contexts === 1, "all on the one context", all.contexts)

  /* The switch, in the Ask Storelib menu. */
  await p.click("[data-ask-model]")
  await sleep(250)
  const sw = await p.evaluate(() => { const s = document.querySelector("[data-ask-sounds]"); return s ? { role: s.getAttribute("role"), on: s.getAttribute("aria-checked"), text: s.textContent.trim() } : null })
  expect(!!sw && sw.role === "switch" && sw.on === "true" && sw.text === "Sounds", "Sounds is a switch in the menu under the model, on by default", sw)
  await p.screenshot({ path: join(shots, `${P2}sounds-menu-1280.png`) })
  await p.click("[data-ask-sounds]")
  await sleep(150)
  const off = await p.evaluate(() => ({ on: document.querySelector("[data-ask-sounds]").getAttribute("aria-checked"), stored: localStorage.getItem("storelib.ask.sounds") }))
  expect(off.on === "false" && off.stored === "off", "turned off, and remembered", off)
  await p.keyboard.press("Escape")
  await p.click("[data-ask-pill] textarea")
  await p.type("[data-ask-pill] textarea", "Again")
  const b3 = (await count()).started.length
  await p.keyboard.press("Enter")
  await sleep(2200)
  const quiet = (await count()).started.slice(b3)
  expect(quiet.every((k) => k === "silent"), "off: a message and its answer play nothing", quiet)
  await p.reload()
  await sleep(900)
  await p.click("[data-ask-pill] textarea")
  await sleep(300)
  await p.click("[data-ask-model]")
  await sleep(250)
  const kept = await p.evaluate(() => document.querySelector("[data-ask-sounds]")?.getAttribute("aria-checked"))
  expect(kept === "false", "still off after a reload", kept)
  await p.click("[data-ask-sounds]")
  await sleep(200)
  const back = await p.evaluate(() => ({ on: document.querySelector("[data-ask-sounds]").getAttribute("aria-checked"), stored: localStorage.getItem("storelib.ask.sounds"), played: window.__audio.started.map((s) => s.kind).filter((k) => k === "sine").length }))
  expect(back.on === "true" && back.stored === "on" && back.played >= 2, "and on again, with one chime so the choice is heard", back)
  await closeWith(p)

  /* A phone's menu is the bottom sheet: the switch is there too, a thumb's height. */
  const ph = await openAt(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "speech=fake", "#phone")
  await ph.tap("[data-ask-model]")
  await sleep(700)
  const phoneSwitch = await ph.evaluate(() => { const s = document.querySelector("[data-ask-sounds]"); return s ? { h: Math.round(s.getBoundingClientRect().height), inSheet: !!s.closest("[data-app-sheet]"), on: s.getAttribute("aria-checked") } : null })
  expect(!!phoneSwitch && phoneSwitch.h >= 44 && phoneSwitch.inSheet, "on a phone the switch is in the menu's sheet, 44px or more", phoneSwitch)
  await ph.screenshot({ path: join(shots, `${P2}sounds-menu-390.png`) })
  await closeWith(ph)
}

/* ── ACTIONS: the live line, Copy, Report, a suggestion ──────────────── */
async function actions(browser, vp) {
  const label = `actions-${vp.width}`
  console.log(`\n${label}`)
  const p = await openAt(browser, vp, "speech=none&agent=full")
  await p.click("[data-ask-pill] textarea")
  await sleep(500)
  await p.type("[data-ask-pill] textarea", "Add quotes under the hero")
  await p.keyboard.press("Enter")
  const seen = await p.evaluate(async () => {
    const lines = []
    const t0 = performance.now()
    await new Promise((done) => {
      const tick = () => {
        const t = [...document.querySelectorAll('[data-ask-activity] [data-line="in"] [data-ask-line-text]')].pop()
        const text = t ? t.firstChild.textContent : null
        if (text && lines[lines.length - 1] !== text) lines.push(text)
        if (performance.now() - t0 < 5200 && document.querySelector('[data-ask-exchange="running"]')) setTimeout(tick, 60)
        else done()
      }
      tick()
    })
    return lines
  })
  expect(seen.length >= 5 && seen.includes("Writing Testimonials") && seen.includes("Checking contrast"), `the line changes as the run moves (${seen.length} different lines)`, seen)
  await sleep(300)
  const done = await p.evaluate(() => {
    const ex = [...document.querySelectorAll("[data-ask-exchange]")].pop()
    return {
      state: ex.getAttribute("data-ask-exchange"),
      line: !!ex.querySelector("[data-ask-activity]"),
      steps: ex.querySelector("[data-ask-steps-toggle]")?.textContent.trim(),
      expanded: ex.querySelector("[data-ask-steps-toggle]")?.getAttribute("aria-expanded"),
      list: !!ex.querySelector("[data-ask-steps]"),
      count: ex.querySelector("[data-ask-count]")?.textContent,
      reply: ex.querySelector("[data-ask-reply]")?.textContent,
    }
  })
  expect(done.state === "done" && !done.line && /^\d+ steps$/.test(done.steps ?? "") && done.expanded === "false" && !done.list && done.count === "Changed Testimonials" && /Added three quotes/.test(done.reply ?? ""), "done, it folds: the line goes, the steps are one closed toggle, and the summary names what changed", done)
  await p.screenshot({ path: join(shots, `${P2}${label}-done.png`) })
  await p.click("[data-ask-steps-toggle]")
  await sleep(200)
  const list = await p.evaluate(() => [...document.querySelectorAll("[data-ask-steps] li")].map((l) => l.textContent))
  expect(list.length >= 5, "and opened, it lists what the run did", list)

  /* Copy, on the answer just given: the last one in the thread. */
  await (await p.$$("[data-ask-copy]")).pop().click()
  await sleep(200)
  const copy = await p.evaluate(() => ({ copied: window.__copied, said: document.querySelector("[data-ask-copied]")?.textContent }))
  expect(copy.copied[0] === done.reply && copy.said === "Copied", "Copy puts the answer on the clipboard and says Copied", copy)

  /* Report, the same answer. */
  await (await p.$$("[data-ask-report]")).pop().click()
  await sleep(250)
  await p.type("[data-ask-report-form] input", "It changed the wrong section")
  await p.click('[data-ask-report-form] button[type="submit"]')
  await sleep(400)
  const report = await p.evaluate(() => ({ sent: window.__reports, said: document.querySelector("[data-ask-reported]")?.textContent, form: !!document.querySelector("[data-ask-report-form]") }))
  expect(report.sent.length === 1 && /^4{8}-4{4}-4{4}-84{3}-4{11}\d$/.test(report.sent[0].messageId) && report.sent[0].reason === "It changed the wrong section" && report.sent[0].engine === "claude" && report.said === "Reported. Thank you." && !report.form, "Report sends this answer's id (the one the stream recorded), the reason and the model, and says it was kept", report)
  await p.screenshot({ path: join(shots, `${P2}${label}-reported.png`) })

  /* A suggestion, from a new chat: it is sent. */
  await p.click("[data-ask-new]")
  await sleep(300)
  const chip = await p.evaluate(() => document.querySelector("[data-ask-suggestion]")?.textContent)
  const posts = await p.evaluate(() => window.__posts.length)
  await p.click("[data-ask-suggestion]")
  await sleep(500)
  const sent = await p.evaluate(() => ({ posts: window.__posts.length, prompt: window.__posts[window.__posts.length - 1]?.prompt, shown: [...document.querySelectorAll("[data-ask-prompt]")].pop()?.textContent, box: document.querySelector("[data-ask-pill] textarea").value }))
  expect(!!chip && sent.posts === posts + 1 && sent.prompt === chip && sent.shown === chip && sent.box === "", "a suggestion tapped is sent as the next message, not left in the box", { chip, ...sent })
  await sleep(4000)
  await closeWith(p)

  /* Report before its table exists says so. */
  const q = await openAt(browser, vp, "speech=none&report=not_set_up")
  await q.click("[data-ask-pill] textarea")
  await sleep(400)
  await q.type("[data-ask-pill] textarea", "Hi")
  await q.keyboard.press("Enter")
  await sleep(2200)
  await (await q.$$("[data-ask-report]")).pop().click()
  await sleep(200)
  await q.click('[data-ask-report-form] button[type="submit"]')
  await sleep(400)
  const problem = await q.evaluate(() => document.querySelector("[data-ask-report-form] [role=alert]")?.textContent)
  expect(problem === "Reports turn on once the database update is run.", "before the update, Report says it turns on after it", problem)
  await closeWith(q)
}

async function phoneActions(browser) {
  console.log("\nactions-390")
  const p = await openAt(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "speech=none&chat=pictures", "#phone")
  await sleep(400)
  const back = await p.evaluate(() => ({ thumbs: document.querySelectorAll("[data-ask-sent-image]").length, tiles: document.querySelectorAll("[data-ask-missing-image]").length, noted: /attached\]/.test(document.querySelector("[data-chat-thread]").textContent), sideways: document.querySelector("[data-ask-sheet]").scrollWidth > document.querySelector("[data-ask-sheet]").clientWidth }))
  expect(back.thumbs === 1 && back.tiles === 2 && !back.noted && !back.sideways, "on a phone a conversation read back shows its picture and its tiles, and nothing is wider than the sheet", back)
  await p.screenshot({ path: join(shots, `${P2}pictures-390-reloaded.png`) })
  await p.tap("[data-ask-new]")
  await sleep(300)
  const chip = await p.evaluate(() => { const c = document.querySelector("[data-ask-suggestion]"); return c ? { text: c.textContent, h: Math.round(c.getBoundingClientRect().height) } : null })
  const posts = await p.evaluate(() => window.__posts.length)
  await p.tap("[data-ask-suggestion]")
  await sleep(500)
  const sent = await p.evaluate(() => ({ posts: window.__posts.length, prompt: window.__posts[window.__posts.length - 1]?.prompt }))
  expect(!!chip && sent.posts === posts + 1 && sent.prompt === chip.text, "a suggestion tapped on a phone is sent", { chip, ...sent })
  await sleep(1500)
  await closeWith(p)
}

async function askai2(browser) {
  await glassStyles(browser, { width: 1280, height: 800 })
  await noGlow(browser, { width: 1280, height: 800 })
  await noGlow(browser, { width: 1440, height: 900 })
  await softenRamp(browser, { width: 1280, height: 800 })
  await pictures(browser, { width: 1280, height: 800 })
  await sounds(browser)
  await actions(browser, { width: 1280, height: 800 })
  await phoneActions(browser)
  console.log("\naskai2 measures")
  console.log(JSON.stringify(measures, null, 1))
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
    alias: { "@": ".", "next/navigation": "./.ask-ai-probe/navigation.js", "next/link": "./.ask-ai-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${PRELUDE}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  try {
    const only = process.env.ONLY ? process.env.ONLY.split(",") : null
    if (!only || only.includes("desktop")) await desktop(browser, { width: 1440, height: 900 }, "desktop-1440", true)
    if (!only || only.includes("desktop")) await desktop(browser, { width: 1280, height: 800 }, "desktop-1280", false)
    if (!only || only.includes("nospeech")) await noSpeech(browser)
    if (!only || only.includes("phone")) await phone(browser)
    if (!only || only.includes("askai2")) await askai2(browser)
  } finally {
    await browser.close()
  }
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
