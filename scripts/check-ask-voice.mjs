/**
 * ===========================================================================
 *  THE MICROPHONE IN ASK STORELIB, ON A PHONE AND ON A COMPUTER
 * ===========================================================================
 * "Voice input stopped, try again or type. I get the error when on phone."
 *
 * The real hook (components/website-builder/ask-voice) in a real browser,
 * with the recogniser, the recorder and the transcription route stood in for
 * (scripts/render-ask-voice.tsx), so each case is a browser that behaves a
 * particular way:
 *
 *   PHONE      a touch screen records, even though a recogniser is there:
 *              every browser on iOS is WebKit, and WebKit's recogniser ends
 *              without a word
 *   COMPUTER   a mouse listens with the browser's own recogniser
 *   HANDOVER   a recogniser that ends without a word, errors without one, or
 *              refuses to start hands the press to the recorder, which
 *              records and comes back with the text: no message, no stop
 *   REFUSAL    a microphone that is off is NOT handed over: it says so, and
 *              offers Settings where the platform has them
 *   IOS        getUserMedia inside the tap, with the audio session back on
 *              auto (the sounds leave it ambient, which has no microphone);
 *              a recorder that offers only mp4 and throws for a bit rate
 *              still records, and the clip goes up as speech.mp4; an empty
 *              recording, a call taking the microphone and no microphone
 *              each end in words, never in silence
 *   ALONE      a phone with nothing to record to keeps its recogniser, so
 *              the microphone is still drawn
 *
 *   node scripts/check-ask-voice.mjs
 */
import { build } from "esbuild"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const work = join(root, ".ask-voice-probe")
mkdirSync(work, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/*
  THE STAND-INS, written into the page before the bundle runs. `window.__voice`
  says how this browser behaves; everything here answers the way the real
  thing would, including the order WebKit fires `onerror` then `onend` in.
*/
const stubs = `
window.__log = []
const cfg = window.__voice
/* This browser's OWN recogniser is put aside either way: Chrome has both the
   prefixed and the unprefixed one, and a real one here would ask a real
   Chrome for a microphone it has not got. */
delete window.SpeechRecognition
delete window.webkitSpeechRecognition
if (cfg.recogniser) {
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    constructor() { this.lang = ""; this.continuous = false; this.interimResults = false }
    start() {
      window.__log.push("recogniser.start")
      if (cfg.recogniser === "throws") throw new DOMException("already started", "InvalidStateError")
      setTimeout(() => {
        if (cfg.recogniser === "silent") { this.onend && this.onend(); return }
        if (cfg.recogniser === "errors") { this.onerror && this.onerror({ error: cfg.error || "network" }); this.onend && this.onend(); return }
        this.onstart && this.onstart()
        this.onresult && this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "typed by voice" } }] })
      }, 10)
    }
    stop() { this.onend && this.onend() }
    abort() { this.onend && this.onend() }
  }
}
/* iOS 17+: the page's audio session, which the sounds leave "ambient". */
const session = { type: cfg.ambient ? "ambient" : "auto" }
Object.defineProperty(navigator, "audioSession", { configurable: true, value: session })
/* Whether a call happens inside the tap's own dispatch: set on the way down, cleared on the way out. */
window.__inTap = false
window.addEventListener("click", () => { window.__inTap = true }, true)
window.addEventListener("click", () => { window.__inTap = false })
if (cfg.recorder) {
  /* iOS records mp4 only; Chrome and Android record webm. */
  const made = cfg.ios ? "audio/mp4" : "audio/webm"
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        window.__log.push("getUserMedia", "inTap:" + window.__inTap, "session:" + session.type)
        if (cfg.mic === "refused") throw new DOMException("denied", "NotAllowedError")
        if (cfg.mic === "none") throw new DOMException("no device", "NotFoundError")
        const track = { onended: null, stop() { window.__log.push("track.stop") } }
        window.__endTrack = () => track.onended && track.onended()
        return { getTracks: () => [track], getAudioTracks: () => [track] }
      },
    },
  })
  window.MediaRecorder = class {
    static isTypeSupported(type) { return cfg.ios ? type === "audio/mp4" : true }
    constructor(stream, options) {
      /* An older iOS that says it supports a bit rate and then throws for it. */
      if (cfg.ios && options && options.audioBitsPerSecond) throw new DOMException("bit rate", "NotSupportedError")
      window.__log.push("recorder:" + JSON.stringify(options || null))
      this.state = "inactive"
      this.mimeType = made
    }
    start() { window.__log.push("recorder.start"); this.state = "recording" }
    stop() {
      this.state = "inactive"
      if (!cfg.empty) this.ondataavailable && this.ondataavailable({ data: new Blob(["x"], { type: made }) })
      this.onstop && this.onstop()
    }
  }
}
const realFetch = window.fetch
window.fetch = async (url, init) => {
  const href = String(url)
  if (href.includes("/api/website-builder/transcribe")) {
    if (init && init.method === "POST") {
      window.__log.push("transcribe.post")
      const clip = init.body && init.body.get && init.body.get("audio")
      if (clip) window.__log.push("upload:" + clip.name + ":" + clip.type)
      return new Response(JSON.stringify({ text: "heard by the recorder" }), { headers: { "content-type": "application/json" } })
    }
    return new Response(JSON.stringify({ available: cfg.route !== false }), { headers: { "content-type": "application/json" } })
  }
  return realFetch(url, init)
}
`

await build({
  entryPoints: [join(root, "scripts/render-ask-voice.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": "." },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

/** One browser, one set of behaviours; returns the page, ready. */
async function open({ phone, ...cfg }) {
  const page = await browser.newPage()
  await page.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: 1280, height: 800 })
  const html = `<!doctype html><html><body><div id="app"></div><script>window.__voice=${JSON.stringify(cfg)}</script><script>${stubs}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await page.setContent(html)
  await page.waitForSelector("[data-engine]")
  await sleep(250)
  return page
}
const read = (page) =>
  page.evaluate(() => ({
    engine: document.querySelector("[data-engine]").getAttribute("data-engine"),
    supported: document.querySelector("[data-engine]").getAttribute("data-supported"),
    state: document.querySelector("[data-engine]").getAttribute("data-state"),
    said: document.querySelector("[data-said]").textContent,
    error: document.querySelector("[data-error]").textContent,
    settings: document.querySelector("[data-settings]").getAttribute("data-settings"),
    log: window.__log,
  }))

console.log("\nWhich engine")
{
  const page = await open({ phone: true, recogniser: "works", recorder: true })
  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)
  expect(coarse, "the emulated phone really is a coarse pointer, which is what the choice reads")
  const s = await read(page)
  expect(s.engine === "record" && s.supported === "true", "PHONE: a touch screen records, though a recogniser is there", s.engine)
  await page.click("[data-start]")
  await sleep(150)
  await page.click("[data-stop]")
  await sleep(250)
  const after = await read(page)
  expect(after.said === "heard by the recorder" && after.log.includes("transcribe.post") && !after.log.includes("recogniser.start"),
    "and the words come back from the clip, with the recogniser never asked", after)
  await page.close()
}
{
  const page = await open({ phone: false, recogniser: "works", recorder: true })
  const s = await read(page)
  expect(s.engine === "speech", "COMPUTER: a mouse listens with the browser's own recogniser", s.engine)
  await page.click("[data-start]")
  await sleep(200)
  const after = await read(page)
  expect(after.said === "typed by voice" && !after.log.includes("getUserMedia"), "and nothing is recorded or sent", after)
  await page.close()
}

console.log("\nA recogniser that fails hands the press to the recorder")
for (const [how, what] of [
  ["silent", "ends without a word and without saying why (what WebKit does on a phone)"],
  ["errors", "stops with a reason nothing can act on"],
  ["throws", "refuses to start at all"],
]) {
  const page = await open({ phone: false, recogniser: how, recorder: true })
  await page.click("[data-start]")
  await sleep(300)
  const mid = await read(page)
  expect(mid.engine === "record" && mid.state === "listening" && mid.error === "", `HANDOVER: it ${what}`, { engine: mid.engine, state: mid.state, error: mid.error })
  await page.click("[data-stop]")
  await sleep(250)
  const after = await read(page)
  expect(after.said === "heard by the recorder" && after.error === "", "  and the recording is turned into text, with nothing said about it", after.said)
  await page.close()
}

console.log("\nA microphone that is off says so")
{
  const page = await open({ phone: false, recogniser: "errors", error: "not-allowed", recorder: true })
  await page.click("[data-start]")
  await sleep(300)
  const s = await read(page)
  expect(/Microphone access is off/.test(s.error) && !s.log.includes("getUserMedia") && s.engine === "speech",
    "REFUSAL: a refused recogniser is not handed over, and says what to turn on", { error: s.error, engine: s.engine })
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true, mic: "refused" })
  await page.click("[data-start]")
  await sleep(300)
  const s = await read(page)
  expect(/Microphone access is off/.test(s.error) && s.state === "idle", "a refused recorder says the same", { error: s.error, state: s.state })
  await page.close()
}

console.log("\niOS: an mp4 recorder, the audio session, and the tap")
{
  const page = await open({ phone: true, recogniser: false, recorder: true, ios: true, ambient: true })
  await page.click("[data-start]")
  await sleep(150)
  const mid = await read(page)
  expect(mid.log.includes("inTap:true"), "getUserMedia is called inside the tap itself, nothing awaited before it", mid.log)
  expect(mid.log.includes("session:auto"), "with the audio session back on auto, not the ambient the sounds left (ambient has no microphone)", mid.log)
  expect(mid.state === "listening" && mid.error === "", "a recorder that throws for a bit rate is made again without it, and records", { state: mid.state, error: mid.error })
  expect(mid.log.includes('recorder:{"mimeType":"audio/mp4"}'), "in mp4, the one format it offers", mid.log.filter((l) => l.startsWith("recorder")))
  await page.click("[data-stop]")
  await sleep(250)
  const after = await read(page)
  expect(after.log.includes("upload:speech.mp4:audio/mp4"), "the clip goes up as speech.mp4, audio/mp4, not as webm", after.log.filter((l) => l.startsWith("upload")))
  expect(after.said === "heard by the recorder" && after.log.includes("track.stop"), "the words come back, and the microphone is let go", after)
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true })
  await page.click("[data-start]")
  await sleep(150)
  await page.click("[data-stop]")
  await sleep(250)
  const s = await read(page)
  expect(s.log.includes('recorder:{"mimeType":"audio/webm;codecs=opus","audioBitsPerSecond":64000}') && s.log.includes("upload:speech.webm:audio/webm"), "Android and Chrome record Opus in WebM at 64 kbps, sent as speech.webm", s.log.filter((l) => /^(recorder:|upload)/.test(l)))
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true, empty: true })
  await page.click("[data-start]")
  await sleep(150)
  await page.click("[data-stop]")
  await sleep(250)
  const s = await read(page)
  expect(s.error === "Nothing was recorded. Try again, and speak after the tick." && s.state === "idle" && !s.log.includes("transcribe.post"), "a recording that came back empty says so, rather than going quietly back", { error: s.error, state: s.state })
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true })
  await page.click("[data-start]")
  await sleep(150)
  await page.evaluate(() => window.__endTrack())
  await sleep(250)
  const s = await read(page)
  expect(s.said === "heard by the recorder" && s.state === "idle", "the microphone taken by a call mid recording: what was said so far is kept and turned into text", { said: s.said, state: s.state })
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true, mic: "none" })
  await page.click("[data-start]")
  await sleep(200)
  const s = await read(page)
  expect(s.error === "No microphone was found." && s.state === "idle", "no microphone says so", { error: s.error, state: s.state })
  await page.close()
}

console.log("\nWith only one way to hear")
{
  const page = await open({ phone: true, recogniser: "works", recorder: true, route: false })
  const s = await read(page)
  expect(s.engine === "speech" && s.supported === "true", "ALONE: a phone with nothing to record to keeps its recogniser", s.engine)
  await page.close()
}
{
  const page = await open({ phone: true, recogniser: false, recorder: true, route: false })
  const s = await read(page)
  expect(s.engine === "none" && s.supported === "false", "and with neither, no microphone is drawn at all", s)
  await page.close()
}

await browser.close()
rmSync(work, { recursive: true, force: true })
console.log(broken ? `\n${broken} failed` : "\nThe microphone records on a phone, listens on a computer, and never stops at a message it can work around.")
process.exit(broken ? 1 : 0)
