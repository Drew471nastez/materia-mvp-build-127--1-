/**
 * ===========================================================================
 *  A COMMUNITY'S CLASSROOM, EVENTS AND PLAYER, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-classroom.tsx) with fixture
 * props, served at a storelib.com address with the API answered by the
 * probe, at 1440x900 and on a 390x844 phone:
 *
 *   EVERY CASE   nothing scrolls sideways; on a phone every button and link
 *                of these pages is at least 40px tall; screenshots.
 *   CLASSROOM    cards in a grid that never overlap (3 across on a computer,
 *                1 on a phone), real progress bars, locks in words.
 *   EVENTS       rows with the date badge, text and cover side by side and
 *                not overlapping; Past loads; the month calendar on a
 *                computer (hidden on a phone) has 7 equal columns and the
 *                events on their days.
 *   EVENT        the action card beside the event on a computer and sticky
 *                while the page scrolls, under the facts on a phone; Join
 *                now inside the window; Going answers.
 *   PLAYER       an ended event's replay plays in the lesson player with its
 *                controls (a real video, recorded in the browser first).
 *
 *   PROBE_CSS=source node scripts/check-community-classroom.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const work = mkdtempSync(join(tmpdir(), "storelib-community-classroom-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/community/makers"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-classroom.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(work, "navigation.js"), "next/link": join(work, "link.jsx"), "next/image": join(work, "image.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] })

/* A real three second video, recorded from a canvas in the browser, for the replay to play. */
const recorder = await browser.newPage()
await recorder.goto("about:blank")
const webm = Buffer.from(
  await recorder.evaluate(async () => {
    const c = document.createElement("canvas")
    c.width = 640
    c.height = 360
    const g = c.getContext("2d")
    const rec = new MediaRecorder(c.captureStream(24), { mimeType: "video/webm;codecs=vp8" })
    const parts = []
    rec.ondataavailable = (e) => parts.push(e.data)
    const started = performance.now()
    const draw = () => {
      const t = (performance.now() - started) / 1000
      g.fillStyle = "#1f2a37"
      g.fillRect(0, 0, 640, 360)
      g.fillStyle = "#e8e3d9"
      g.font = "bold 40px sans-serif"
      g.fillText("Pricing teardown, live", 40, 200)
      g.fillStyle = "#8b93a1"
      g.fillRect(40, 240, 560 * Math.min(1, t / 3), 6)
      if (t < 3.2) requestAnimationFrame(draw)
    }
    draw()
    rec.start()
    await new Promise((r) => setTimeout(r, 3200))
    rec.stop()
    await new Promise((r) => (rec.onstop = r))
    const buf = await new Blob(parts, { type: "video/webm" }).arrayBuffer()
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
  }),
  "base64",
)
await recorder.close()
expect(webm.length > 1000, "a test video was recorded", webm.length)

const json = (r, body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })

async function open(label, vp, which) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://storelib.com/__ccprobe/video.webm")) return r.respond({ status: 200, contentType: "video/webm", body: webm })
    if (u.startsWith("https://storelib.com/__ccprobe")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (/\/api\/courses\/lessons\/[^/]+\/play/.test(u)) return json(r, { kind: "text", access: "owner" })
    if (u.includes("/api/courses/progress")) return json(r, { kept: true })
    if (/\/api\/community\/[^/]+\/videos\/[^/]+\/play/.test(u)) return json(r, { url: "https://storelib.com/__ccprobe/video.webm", expiresAt: Date.now() + 3_600_000, mime: "video/webm", captions: null, poster: null, durationSeconds: 3 })
    if (/\/rsvp$/.test(u)) return json(r, { status: "going", goingCount: 8, capacity: 30 })
    if (u.includes("/events?when=past")) {
      const t = new Date(Date.now() - 5 * 86_400_000).toISOString()
      return json(r, { nextCursor: null, events: [{ id: "p1", title: "Pricing teardown, live", coverUrl: null, kind: "online", startsAt: t, endsAt: t, timezone: "Europe/London", location: null, online: true, capacity: null, goingCount: 31, cancelled: false, myRsvp: "going", locked: null, hasReplay: true, href: "/community/makers/events/p1" }] })
    }
    if (u.includes("/events?month=")) return json(r, { events: [] })
    if (u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  await p.goto(`https://storelib.com/__ccprobe?${which}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-probe-case]")
  await sleep(350)
  return { p, errors }
}

async function common(p, label, which, phone, skip = []) {
  const m = await p.evaluate((skipSel) => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll("main a, main button")) {
      if (skipSel.some((s) => el.closest(s))) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { over, small }
  }, skip)
  expect(m.over <= 0, `${label} ${which}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label} ${which}: every button and link is at least 40px tall`, m.small)
  await p.screenshot({ path: join(shots, `${which}-${label}.png`), fullPage: true })
}

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900 }, false],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]

for (const [label, vp, phone] of VIEWPORTS) {
  console.log(`\n${label}`)

  /* Classroom */
  {
    const { p, errors } = await open(label, vp, "classroom")
    const g = await p.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-course-card]")].map((c) => c.getBoundingClientRect())
      const rows = new Set(cards.map((r) => Math.round(r.top))).size
      const cols = new Set(cards.map((r) => Math.round(r.left))).size
      let overlap = 0
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j]
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++
      }
      const bars = [...document.querySelectorAll("[data-course-card] [role=progressbar] > div")].map((d) => d.style.width)
      const locks = [...document.querySelectorAll("[data-lock-label], [data-lock-line]")].filter((l) => getComputedStyle(l).display !== "none").map((l) => l.textContent)
      const heights = [...document.querySelectorAll("[data-course-card]")].map((c) => Math.round(c.getBoundingClientRect().height))
      return { n: cards.length, rows, cols, overlap, bars, locks, heights }
    })
    expect(g.n === 6 && g.overlap === 0, `${label}: six course cards, none overlapping`, g)
    expect(phone ? g.cols === 1 : g.cols === 3, `${label}: ${phone ? "one" : "three"} across`, g.cols)
    expect(g.bars.join() === "58%,100%,0%", `${label}: progress bars are the members' real percentages`, g.bars)
    expect(g.locks.length === 3 && g.locks[0] === "Pro members" && g.locks[1].startsWith("Opens on") && g.locks[2] === "Level 3", `${label}: locked courses say why`, g.locks)
    expect(new Set(g.heights.slice(0, phone ? 1 : 3)).size === 1, `${label}: cards in a row are the same height`, g.heights)
    await common(p, label, "classroom", phone)
    expect(errors.length === 0, `${label} classroom: no page errors`, errors)
    await p.close()
  }

  for (const which of ["empty", "locked"]) {
    const { p, errors } = await open(label, vp, which)
    await common(p, label, which, phone)
    if (which === "locked") {
      const s = await p.evaluate(() => document.querySelector("[data-lock-sentence]")?.textContent)
      expect(s === "This course is for Pro members.", `${label}: a locked course says why in a sentence`, s)
    }
    expect(errors.length === 0, `${label} ${which}: no page errors`, errors)
    await p.close()
  }

  /* The course inside the community: the course player itself, its arrow back to the classroom. */
  {
    const { p, errors } = await open(label, vp, "course")
    await p.waitForSelector("[data-course-player]")
    await sleep(300)
    const back = await p.evaluate(() => {
      const a = document.querySelector("[data-course-player] a[aria-label]")
      return { href: a?.getAttribute("href"), label: a?.getAttribute("aria-label") }
    })
    expect(back.href === "/community/makers/classroom" && back.label === "Classroom", `${label}: the player's arrow goes back to the classroom`, back)
    await common(p, label, "course", false)
    expect(errors.length === 0, `${label} course: no page errors`, errors)
    await p.close()
  }

  /* Events list, Past, and the month */
  {
    const { p, errors } = await open(label, vp, "events")
    const rows = await p.evaluate(() =>
      [...document.querySelectorAll("[data-event-row]")].map((li) => {
        const a = li.querySelector("a")
        const badge = a.querySelector("[data-date-badge]").getBoundingClientRect()
        const text = a.children[1].getBoundingClientRect()
        const img = a.querySelector("img")
        const ir = img && getComputedStyle(img).display !== "none" ? img.getBoundingClientRect() : null
        return { badgeRight: Math.round(badge.right), textLeft: Math.round(text.left), textRight: Math.round(text.right), imgLeft: ir ? Math.round(ir.left) : null, h: Math.round(a.getBoundingClientRect().height) }
      }),
    )
    expect(rows.length === 5, `${label}: five upcoming events`, rows.length)
    expect(rows.every((r) => r.badgeRight <= r.textLeft && (r.imgLeft === null || r.textRight <= r.imgLeft)), `${label}: badge, text and cover side by side, not overlapping`, rows)
    const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-events-tab]")].map((b) => ({ id: b.dataset.eventsTab, shown: getComputedStyle(b).display !== "none" })))
    expect(tabs.find((t) => t.id === "calendar").shown === !phone, `${label}: the Calendar tab ${phone ? "is not on a phone" : "is on a computer"}`, tabs)
    await common(p, label, "events", phone)

    await p.click('[data-events-tab="past"]')
    await p.waitForSelector('[data-event-list="past"]')
    const pastRows = await p.evaluate(() => document.querySelectorAll('[data-event-list="past"] [data-event-row]').length)
    expect(pastRows === 1, `${label}: Past loads from the API`, pastRows)
    await p.screenshot({ path: join(shots, `events-past-${label}.png`) })

    if (!phone) {
      await p.click('[data-events-tab="calendar"]')
      await p.waitForSelector("[data-month-calendar]")
      const cal = await p.evaluate(() => {
        const cells = [...document.querySelectorAll("[data-day]")]
        const widths = new Set(cells.slice(0, 7).map((c) => Math.round(c.getBoundingClientRect().width)))
        const chips = [...document.querySelectorAll("[data-calendar-event]")].map((a) => a.closest("[data-day]").dataset.day)
        const today = document.querySelector("[data-day] .bg-\\[\\#1a1a2e\\]")?.closest("[data-day]")?.dataset.day
        const over = [...document.querySelectorAll("[data-calendar-event]")].filter((a) => a.getBoundingClientRect().right > a.closest("[data-day]").getBoundingClientRect().right + 0.5).length
        return { cells: cells.length, widths: [...widths], chips, today, over }
      })
      expect(cal.cells === 42 && cal.widths.length <= 2, `${label}: the month is 6 weeks of 7 equal columns`, cal)
      expect(cal.chips.length >= 3 && cal.over === 0, `${label}: events sit on their days and stay inside them`, cal)
      await p.screenshot({ path: join(shots, `events-calendar-${label}.png`), fullPage: true })
    }
    expect(errors.length === 0, `${label} events: no page errors`, errors)
    await p.close()
  }

  /* One event, inside the join window */
  {
    const { p, errors } = await open(label, vp, "event")
    const lay = await p.evaluate(() => {
      const aside = document.querySelector("[data-event-actions]").getBoundingClientRect()
      const facts = document.querySelector("[data-event-facts]").getBoundingClientRect()
      const desc = document.querySelector("[data-event-description]").getBoundingClientRect()
      return { asideLeft: Math.round(aside.left), asideTop: Math.round(aside.top), factsRight: Math.round(facts.right), factsBottom: Math.round(facts.bottom), descTop: Math.round(desc.top), asideBottom: Math.round(aside.bottom), join: !!document.querySelector("[data-join-now]") }
    })
    expect(lay.join, `${label}: inside the window, Join now is there`, lay.join)
    if (phone) expect(lay.asideTop >= lay.factsBottom && lay.descTop >= lay.asideBottom, `${label}: the action card sits between the facts and the description`, lay)
    else expect(lay.asideLeft >= lay.factsRight, `${label}: the action card is beside the event`, lay)
    await common(p, label, "event", phone)
    if (!phone) {
      await p.evaluate(() => {
        const pad = document.createElement("div")
        pad.style.height = "1600px"
        document.querySelector("[data-event-description]").appendChild(pad)
      })
      const tops = []
      for (const y of [0, 300, 700, 1100]) {
        await p.evaluate((yy) => window.scrollTo(0, yy), y)
        await sleep(60)
        tops.push(await p.evaluate(() => Math.round(document.querySelector("[data-event-actions]").getBoundingClientRect().top)))
      }
      expect(tops.slice(2).every((t) => t === 16), `${label}: the action card stays put while the page scrolls`, tops)
    }
    expect(errors.length === 0, `${label} event: no page errors`, errors)
    await p.close()
  }

  for (const which of ["event-later", "event-place", "event-locked"]) {
    const { p, errors } = await open(label, vp, which)
    if (which === "event-later") {
      const before = await p.evaluate(() => ({ state: document.querySelector("[data-rsvp-state]")?.dataset.rsvpState, opens: document.querySelector("[data-join-opens]")?.textContent }))
      expect(before.state === "none" && /15 minutes before/.test(before.opens || ""), `${label}: days away, no link yet and it says when it opens`, before)
      await common(p, label, which, phone)
      await p.click('[data-rsvp="going"]')
      await p.waitForFunction(() => document.querySelector("[data-rsvp-state]")?.dataset.rsvpState === "going")
      const after = await p.evaluate(() => document.querySelector("[data-rsvp-state]").textContent)
      expect(after.includes("You are going"), `${label}: Going answers`, after)
    } else if (which === "event-place") {
      await common(p, label, which, phone)
      const place = await p.evaluate(() => ({ opens: !!document.querySelector("[data-join-opens]"), where: document.querySelector("[data-event-facts]").textContent }))
      expect(!place.opens && /Lisbon/.test(place.where) && /In person/.test(place.where), `${label}: an in person event shows the place and no join link line`, place)
    } else {
      await common(p, label, which, phone)
      const locked = await p.evaluate(() => ({ text: document.querySelector("[data-event-locked]")?.textContent, rsvp: !!document.querySelector("[data-rsvp]") }))
      expect(!locked.rsvp && /For Pro members/.test(locked.text || ""), `${label}: a locked event says why and cannot be answered`, locked)
    }
    expect(errors.length === 0, `${label} ${which}: no page errors`, errors)
    await p.close()
  }

  /* The replay plays in the lesson player */
  {
    const { p, errors } = await open(label, vp, "event-past")
    await p.waitForSelector("[data-lesson-video] video")
    await p.waitForFunction(() => document.querySelector("[data-lesson-video] video").readyState >= 1, { timeout: 8000 }).catch(() => {})
    await p.evaluate(() => document.querySelector("[data-lesson-video] video").play().catch(() => {}))
    await sleep(1200)
    const v = await p.evaluate(() => {
      const el = document.querySelector("[data-lesson-video] video")
      const box = document.querySelector("[data-lesson-video]").getBoundingClientRect()
      const controls = [...document.querySelectorAll("[data-lesson-video] button")].map((b) => b.getAttribute("aria-label")).filter(Boolean)
      return { ready: el.readyState, time: el.currentTime, ratio: +(box.width / box.height).toFixed(2), controls }
    })
    expect(v.ready >= 1 && v.time > 0.3, `${label}: the replay plays`, v)
    expect(Math.abs(v.ratio - 16 / 9) < 0.02, `${label}: the player is 16:9`, v.ratio)
    expect(["Captions", "Picture in picture", "Fullscreen"].some((c) => v.controls.includes(c)) || v.controls.length >= 3, `${label}: the player has its own controls`, v.controls)
    await p.evaluate(() => document.querySelector("[data-lesson-video] video").pause())
    await sleep(200)
    await common(p, label, "event-past", phone, ["[data-lesson-video]"])
    expect(errors.length === 0, `${label} event-past: no page errors`, errors)
    await p.close()
  }
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
