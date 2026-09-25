/**
 * ===========================================================================
 *  THE UPLOAD FIELD, AGAINST A STORAGE ENDPOINT THAT IS REALLY THERE
 * ===========================================================================
 * "Drop zone and click, paste, instant local preview, progress, replace,
 * remove, alt text, client compression, clear errors, keyboard accessible."
 *
 * Two real `MediaField`s (scripts/render-media-field.tsx) in a browser whose
 * uploads go, as real XMLHttpRequests with real progress events, to a fake
 * Supabase storage endpoint on this script's own server, over a connection
 * throttled to 300 KB/s so progress has somewhere to go. Asserted, at 1440
 * and at 390:
 *
 *   keyboard   Tab reaches the empty box and Enter opens the file chooser
 *   refused    a file that is not a picture says why, in words, and nothing
 *              is sent
 *   at once    a chosen photo is on screen within a frame, from memory
 *   smaller    what reaches storage is a resized WebP, not the camera JPEG,
 *              under the user's own folder, with the year-long cache header
 *   progress   the bar reports several real steps between the ends
 *   arrives    the stored copy is shown, and the local one let go
 *   described  the description under it is the section's alt text
 *   failed     a refused upload says so with Try again, keeps the picture
 *              that was there, and Try again sends it
 *   dropped    a video dropped on its box says "Drop to add", then uploads
 *   too big    a 51 MB video is refused before anything is sent
 *   removed    Remove empties the field
 *
 * SHOTS=<dir> keeps a screenshot of each state.
 *
 *   node scripts/check-media-field.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail !== undefined ? `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}
const note = (line) => console.log(`  --    ${line}`)

/* ── The field, bundled with a Supabase client that knows this server ───── */
const out = mkdtempSync(join(tmpdir(), "storelib-media-"))
const stub = join(out, "supabase-client.js")
writeFileSync(
  stub,
  `export function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "probe-user" } } }),
      getSession: async () => ({ data: { session: { access_token: "probe-session" } } }),
    },
    storage: {
      from: (bucket) => ({
        upload: async () => ({ error: new Error("the XHR path was expected, not the fallback") }),
        getPublicUrl: (path) => ({ data: { publicUrl: location.origin + "/public/" + bucket + "/" + path } }),
      }),
    },
  }
}
`,
)
execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-media-field.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    `--alias:@/lib/supabase/client=${stub}`,
    `--alias:@=${root}`,
    '--define:process.env.NODE_ENV="production"',
    "--define:process.env.NEXT_PUBLIC_SUPABASE_URL=window.__SUPA",
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon"',
    "--loader:.css=empty",
  ],
  { cwd: root, stdio: "inherit" },
)
const js = readFileSync(join(out, "probe.js"))
const css = await appCss(root)
const fonts = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fonts.set(name, path)
  return `url(/font/${name})`
})

/* ── The fake storage ─────────────────────────────────────────────────── */
const uploads = []
const stored = new Map()
let failNext = false
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;background:#fff}</style></head>
<body><div id="app"></div><script>window.__SUPA=location.origin</script><script src="/probe.js"></script></body></html>`

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/probe.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (u.pathname.startsWith("/font/")) {
    const path = fonts.get(u.pathname.slice(6))
    if (path && existsSync(path)) {
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(readFileSync(path))
    }
    res.writeHead(404)
    return res.end()
  }
  if (u.pathname.startsWith("/storage/v1/object/") && req.method === "POST") {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    const path = decodeURIComponent(u.pathname.slice("/storage/v1/object/".length))
    uploads.push({
      path,
      bytes: body.length,
      type: req.headers["content-type"],
      auth: req.headers.authorization,
      apikey: req.headers.apikey,
      upsert: req.headers["x-upsert"],
      cache: req.headers["cache-control"],
    })
    if (failNext) {
      failNext = false
      res.writeHead(500, { "content-type": "application/json" })
      return res.end(JSON.stringify({ message: "The storage server had a problem" }))
    }
    stored.set(path, { body, type: req.headers["content-type"] })
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ Key: path }))
  }
  if (u.pathname.startsWith("/public/")) {
    const path = decodeURIComponent(u.pathname.slice("/public/".length))
    const hit = stored.get(path)
    if (!hit) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { "content-type": hit.type })
    return res.end(hit.body)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

/**
 * Gives a field a file the way the browser would: through its own <input>, or
 * as a paste or a drop carrying one. The file is made in the page.
 */
const MAKE = `
window.__makePhoto = async (w, h) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h
  const g = c.getContext("2d")
  const img = g.createImageData(w, h)
  /* Noise with a slope under it: a photo's worth of detail for the encoder. */
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4, x = p % w, y = (p / w) | 0
    img.data[i] = (x * 255 / w + Math.random() * 60) | 0
    img.data[i + 1] = (y * 255 / h + Math.random() * 60) | 0
    img.data[i + 2] = (Math.random() * 90 + 80) | 0
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95))
  return new File([blob], "IMG_2044.jpg", { type: "image/jpeg" })
}
window.__give = (selector, file) => {
  const input = document.querySelector(selector + " input[type=file]")
  const dt = new DataTransfer(); dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event("change", { bubbles: true }))
}
`

const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) })
}

async function run(label, vp) {
  console.log(`\n══ ${label}, ${vp.width} × ${vp.height} ══\n`)
  const tag = vp.width < 600 ? "390" : "1440"
  uploads.length = 0
  const p = await browser.newPage()
  await p.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width < 600 ? 2 : 1, isMobile: vp.width < 600, hasTouch: vp.width < 600 })
  const cdp = await p.createCDPSession()
  await p.goto(origin)
  await p.waitForSelector("#image [data-wb-image-picker='empty']")
  await p.evaluate(MAKE)
  await shot(p, `media-empty-${tag}`)

  /* ── Keyboard ──────────────────────────────────────────────────────── */
  await p.keyboard.press("Tab")
  const focused = await p.evaluate(() => document.activeElement?.classList.contains("wb-dropzone") && !!document.activeElement.closest("#image"))
  check("Tab reaches the empty picture box", focused)
  let chooser = null
  try {
    ;[chooser] = await Promise.all([p.waitForFileChooser({ timeout: 2000 }), p.keyboard.press("Enter")])
  } catch {
    chooser = null
  }
  check("and Enter opens the file chooser, for one file", !!chooser && !chooser.isMultiple())
  if (chooser) await chooser.cancel()
  if (vp.width < 600) {
    const phone = await p.evaluate(() => {
      const b = document.querySelector("#image .wb-dropzone").getBoundingClientRect()
      return { h: Math.round(b.height), hint: getComputedStyle(document.querySelector("#image .wb-dropzone-hint")).display }
    })
    note(`the empty box on a phone: ${phone.h}px tall, hint ${phone.hint === "none" ? "hidden" : "shown"}`)
  }

  /* ── Refused ───────────────────────────────────────────────────────── */
  await p.evaluate(() => window.__give("#image", new File(["hello"], "notes.txt", { type: "text/plain" })))
  await sleep(150)
  const refused = await p.evaluate(() => document.querySelector("#image [role='alert']")?.textContent.trim() ?? "")
  check("a file that is not a picture says why", /^Use a JPG, PNG, WebP, GIF or AVIF picture\./.test(refused), refused)
  check("  and sends nothing", uploads.length === 0, uploads.length)
  await shot(p, `media-refused-${tag}`)

  /* ── A camera photo over a slow connection ─────────────────────────── */
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 30, downloadThroughput: 4 * 1024 * 1024, uploadThroughput: 300 * 1024 })
  const original = await p.evaluate(async () => {
    window.__photo = await window.__makePhoto(3200, 2400)
    return window.__photo.size
  })
  const timing = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now()
        window.__give("#image", window.__photo)
        const seen = () => {
          const local = document.querySelector("#image [data-wb-image-layer='local']")
          if (local && local.getAttribute("src")?.startsWith("blob:")) return resolve(Math.round(performance.now() - t0))
          requestAnimationFrame(seen)
        }
        seen()
      }),
  )
  check("the chosen photo is on screen at once, from memory", timing <= 50, `${timing}ms`)
  const steps = new Set()
  let midShot = false
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(() => ({
      now: document.querySelector("#image [data-wb-upload-progress]")?.getAttribute("aria-valuenow") ?? null,
      value: window.__values.image,
    }))
    if (s.now !== null) steps.add(Number(s.now))
    if (!midShot && s.now !== null && Number(s.now) >= 30 && Number(s.now) <= 80) {
      midShot = true
      await shot(p, `media-uploading-${tag}`)
    }
    if (s.value) break
    await sleep(60)
  }
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  const between = [...steps].filter((n) => n > 2 && n < 100).sort((a, b) => a - b)
  check("the bar reports real steps on the way", between.length >= 3, between)
  const sent = uploads.at(-1)
  check("what reached storage is a resized WebP, much smaller than the photo",
    !!sent && sent.type === "image/webp" && sent.bytes < original / 3, sent ? `${Math.round(original / 1024)} KB chosen, ${Math.round(sent.bytes / 1024)} KB sent` : "nothing sent")
  check("  under the user's own folder, a new key, cached for a year, not overwriting",
    !!sent && /^store-builder-images\/probe-user\/sections\/\d+-[0-9a-z]+\.webp$/.test(sent.path) && sent.cache === "max-age=31536000" && sent.upsert === "false" && sent.auth === "Bearer probe-session",
    sent && { path: sent.path, cache: sent.cache, upsert: sent.upsert })
  const value = await p.evaluate(() => window.__values.image)
  check("the field's value is the stored copy's address", typeof value === "string" && value.startsWith(`${origin}/public/store-builder-images/probe-user/`), value)
  await p.waitForSelector("#image [data-wb-image-layer='stored'].opacity-100", { timeout: 5000 }).catch(() => null)
  await sleep(450)
  const arrived = await p.evaluate(() => ({
    stored: !!document.querySelector("#image [data-wb-image-layer='stored'].opacity-100"),
    local: !!document.querySelector("#image [data-wb-image-layer='local']"),
    bar: !!document.querySelector("#image [data-wb-upload-progress]"),
  }))
  check("the stored copy is shown, the local one let go and the bar gone", arrived.stored && !arrived.local && !arrived.bar, arrived)

  /* ── Described ─────────────────────────────────────────────────────── */
  const altInput = await p.$("#image input[type='text']")
  await altInput.type("Two mugs on a walnut table")
  await sleep(100)
  const alt = await p.evaluate(() => ({ value: window.__values.alt, label: document.querySelector("#image label")?.textContent }))
  check("the description under it is the picture's alt text", alt.value === "Two mugs on a walnut table" && alt.label === "Description", alt)
  await p.evaluate(() => document.activeElement?.blur())
  await shot(p, `media-done-${tag}`)
  if (vp.width < 600) {
    const hs = await p.$$eval("#image [data-wb-image-picker='filled'] .grid button", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)))
    check("Replace and Remove are a thumb's height on a phone", hs.length === 2 && hs.every((h) => h >= 44), hs)
  }

  /* ── A refused upload, then Try again ──────────────────────────────── */
  failNext = true
  const before = await p.evaluate(() => window.__values.image)
  await p.evaluate(async () => {
    const small = await window.__makePhoto(900, 600)
    const box = document.querySelector("#image [data-wb-image-box]")
    box.focus()
    const dt = new DataTransfer()
    dt.items.add(small)
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await p.waitForSelector("#image [role='alert']", { timeout: 5000 }).catch(() => null)
  await sleep(200)
  const failure = await p.evaluate(() => ({
    said: document.querySelector("#image [role='alert']")?.textContent.replace(/\s+/g, " ").trim() ?? "",
    value: window.__values.image,
    shows: document.querySelector("#image [data-wb-image-layer='stored']")?.getAttribute("src") ?? null,
  }))
  check("a pasted photo whose upload is refused says so, with Try again",
    /The upload did not finish\. Check your connection and try again\.\s*Try again/.test(failure.said), failure.said)
  check("  and the field keeps the picture it had", failure.value === before && failure.shows === before)
  await shot(p, `media-failed-${tag}`)
  const n = uploads.length
  await p.evaluate(() => [...document.querySelectorAll("#image [role='alert'] button")].find((b) => b.textContent.trim() === "Try again")?.click())
  for (let i = 0; i < 100; i++) {
    if ((await p.evaluate(() => window.__values.image)) !== before) break
    await sleep(60)
  }
  const after = await p.evaluate(() => ({ value: window.__values.image, alert: !!document.querySelector("#image [role='alert']") }))
  check("Try again sends it, and the message goes", uploads.length === n + 1 && after.value !== before && !after.alert, { sent: uploads.length - n, alert: after.alert })

  /* ── A video, dropped ──────────────────────────────────────────────── */
  const dropping = await p.evaluate(() => {
    const zone = document.querySelector("#video .wb-dropzone")
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(180 * 1024)], "shop-loop.mp4", { type: "video/mp4" }))
    window.__drop = dt
    zone.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }))
    zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }))
    return true
  })
  await sleep(80)
  const over = await p.evaluate(() => document.querySelector("#video .wb-dropzone-title")?.textContent)
  check("a file dragged over the video box says Drop to add", dropping && over === "Drop to add", over)
  await shot(p, `media-drag-${tag}`)
  await p.evaluate(() => {
    const zone = document.querySelector("#video .wb-dropzone")
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: window.__drop, bubbles: true, cancelable: true }))
  })
  for (let i = 0; i < 100; i++) {
    if (await p.evaluate(() => window.__values.video)) break
    await sleep(60)
  }
  const vid = await p.evaluate(() => ({ value: window.__values.video, el: !!document.querySelector("#video video") }))
  const vsent = uploads.at(-1)
  check("dropped, it uploads as it is, and the box shows the video",
    !!vid.value && vid.el && !!vsent && vsent.type === "video/mp4" && vsent.bytes === 180 * 1024 && /\.mp4$/.test(vsent.path), { value: vid.value, sent: vsent && vsent.bytes })

  /* ── Too big ───────────────────────────────────────────────────────── */
  await p.evaluate(() => [...document.querySelectorAll("#video button")].find((b) => b.textContent.trim() === "Remove")?.click())
  await sleep(100)
  const m = uploads.length
  await p.evaluate(() => window.__give("#video", new File([new Uint8Array(51 * 1024 * 1024)], "long-take.mov", { type: "video/quicktime" })))
  await sleep(200)
  const big = await p.evaluate(() => document.querySelector("#video [role='alert']")?.textContent.trim() ?? "")
  check("a 51 MB video is refused before anything is sent", /^That video is 51 MB\. Videos can be up to 50 MB\./.test(big) && uploads.length === m, big)

  /* ── Removed ───────────────────────────────────────────────────────── */
  await p.evaluate(() => [...document.querySelectorAll("#image button")].find((b) => b.textContent.trim() === "Remove")?.click())
  await sleep(120)
  const gone = await p.evaluate(() => ({ value: window.__values.image, empty: !!document.querySelector("#image [data-wb-image-picker='empty']") }))
  check("Remove empties the field", gone.value === null && gone.empty, gone)

  await p.close()
}

try {
  await run("A computer", { width: 1440, height: 900 })
  await run("A phone", { width: 390, height: 844 })
} finally {
  await browser.close()
  server.close()
}

if (SHOTS) console.log(`\nScreenshots in ${SHOTS}`)
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed.` : "\nAll checks passed.")
process.exit(failed ? 1 : 0)
