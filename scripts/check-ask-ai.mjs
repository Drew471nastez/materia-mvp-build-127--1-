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
 *                 52 to 56 tall, frosted inside its own shape, a soft glow
 *                 round it (a shadow; its edges are measured by
 *                 scripts/check-ask-dock.mjs), and the canvas does not move
 *     OPEN        focusing it opens the conversation over ~300ms: sampled
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
  window.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    var method = (init && init.method) || "GET";
    if (url.indexOf("/api/website-builder/transcribe") === 0) return json({ available: q.get("transcribe") === "1" });
    if (url.indexOf("/chat/conversations") >= 0) return json(list);
    if (url.indexOf("/chat") >= 0 && method === "GET") return json(url.indexOf(C2) >= 0 ? two : one);
    if (url.indexOf("/agent") >= 0) {
      var body = JSON.parse(init.body);
      window.__posts.push({ conversationId: body.conversationId, images: (body.images || []).length, prompt: body.prompt });
      var lines = [
        { type: "conversation", id: body.conversationId || "33333333-3333-4333-8333-333333333333", title: body.conversationId === C1 ? one.conversation.title : body.conversationId === C2 ? two.conversation.title : (body.prompt || "A picture") },
        { type: "step", id: "t1", label: "Read the page", state: "running" },
        { type: "step", id: "t1", label: "Read the page", state: "done" },
        { type: "message", text: "Done." }
      ];
      return new Promise(function (resolve) {
        /* The upload taking a moment: the thumbnails say they are sending until here. */
        setTimeout(function () {
          var stream = new ReadableStream({ start: function (c) {
            var i = 0;
            var next = function () { if (i >= lines.length) { c.close(); return } c.enqueue(enc.encode(JSON.stringify(lines[i++]) + "\\n")); setTimeout(next, 120) };
            next();
          } });
          resolve(new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } }));
        }, 700);
      });
    }
    return json({});
  };
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
    const h = getComputedStyle(document.querySelector("[data-ask-halo]"))
    return { glass: g.backdropFilter, fill: g.backgroundColor, halo: h.backdropFilter, shadow: h.boxShadow.slice(0, 60), haloOpacity: h.opacity }
  })
  expect(/blur\(24px\)/.test(glass.glass) && /saturate/.test(glass.glass) && /(, 0\.7\)| \/ 0\.7\))$/.test(glass.fill), "the pill is frosted: a blur and a whitish fill", glass)
  /* The glow's edges are measured pixel by pixel in scripts/check-ask-dock.mjs (FADE). */
  expect(glass.halo === "none" && /rgba\(248, 249, 250/.test(glass.shadow) && glass.haloOpacity === "1", "with a soft glow round it: a shadow, no filter and no mask", { halo: glass.halo, shadow: glass.shadow })
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
  const yielded = await p.$eval("[data-ask-pill-state]", (e) => ({ state: e.getAttribute("data-ask-pill-state"), o: getComputedStyle(e).opacity, pe: getComputedStyle(e).pointerEvents }))
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
  const closed = await p.evaluate(() => { const s = getComputedStyle(document.querySelector("[data-ask-pill-state]")); return { state: document.querySelector("[data-ask-dock]").getAttribute("data-state"), o: s.opacity, v: s.visibility, halo: getComputedStyle(document.querySelector("[data-ask-halo]")).opacity } })
  expect(closed.state === "hidden" && closed.o === "0" && closed.v === "hidden" && closed.halo === "0", "close hides the conversation and the pill", closed)
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
  } finally {
    await browser.close()
  }
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
