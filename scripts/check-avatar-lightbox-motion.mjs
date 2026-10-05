/**
 * THE PROFILE PICTURE OPENING AND CLOSING, FILMED.
 *
 *   node scripts/check-avatar-lightbox-motion.mjs      (after pnpm build)
 *
 * The real component, the real Radix dialog, the real compiled stylesheet.
 * scripts/check-avatar-lightbox-behaviour.mjs already holds the hit testing
 * with motion switched off; this is the motion, with nothing switched off.
 *
 *   on open    the photograph starts at the circle's own place and size and
 *              arrives centred at full size, on transform and opacity only
 *   on close   the same move backwards, and it runs for all three ways out:
 *              the X, a press on the ground, and Escape
 *   the panel  fades rather than zooming, so the X in the corner does not
 *              grow with the picture, and it outlives the photograph's exit
 *              so the dialog is still mounted while the picture leaves
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build. Run pnpm build first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-lightbox-motion-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-avatar-lightbox.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 780 })
const url = `file://${join(out, "index.html")}`

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }

const PHOTO = '[data-avatar-lightbox-photo]'
const PANEL = '[data-avatar-lightbox]'

/** Pause everything in the dialog and put its clock at `t`. */
const at = (t) => page.evaluate((time, panel) => {
  const el = document.querySelector(panel)
  if (!el) return null
  const all = [...el.getAnimations(), ...[...el.querySelectorAll("*")].flatMap((n) => n.getAnimations())]
  for (const a of all) { a.pause(); a.currentTime = time }
  return all.length
}, t, PANEL)

const readFrame = () => page.evaluate((photo, panel) => {
  const img = document.querySelector(photo)
  const box = document.querySelector(panel)
  if (!img || !box) return null
  const ri = img.getBoundingClientRect()
  const cs = getComputedStyle(img)
  const close = box.querySelector('button[aria-label="Close"]')
  const rc = close?.getBoundingClientRect()
  return {
    opacity: Number(cs.opacity),
    transform: cs.transform,
    panelTransform: getComputedStyle(box).transform,
    panelOpacity: Number(getComputedStyle(box).opacity),
    centre: [Math.round(ri.left + ri.width / 2), Math.round(ri.top + ri.height / 2)],
    width: Math.round(ri.width),
    close: rc ? { w: Math.round(rc.width), h: Math.round(rc.height), top: Math.round(rc.top), right: Math.round(rc.right) } : null,
    names: [...img.getAnimations(), ...box.getAnimations()].map((a) => a.animationName),
    vars: {
      dx: getComputedStyle(box).getPropertyValue("--lightbox-dx").trim(),
      dy: getComputedStyle(box).getPropertyValue("--lightbox-dy").trim(),
      scale: getComputedStyle(box).getPropertyValue("--lightbox-scale").trim(),
    },
  }
}, PHOTO, PANEL)

async function open() {
  await page.goto(url)
  await page.waitForSelector("#trigger")
  const trigger = await page.evaluate(() => {
    const r = document.getElementById("trigger").getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }
  })
  await page.click("#trigger")
  await page.waitForSelector(PHOTO)
  return trigger
}

console.log("\nIt opens out of the circle it was\n")
const trigger = await open()
{
  await at(0)
  const start = await readFrame()
  console.log(`    the circle in the page: ${trigger.w}px at ${trigger.cx},${trigger.cy}`)
  console.log(`    the panel's numbers: dx ${start.vars.dx}  dy ${start.vars.dy}  scale ${start.vars.scale}`)
  say(!!start.vars.dx && !!start.vars.scale, "the origin was measured and handed to the stylesheet")
  say(Math.abs(Math.round(start.centre[0]) - trigger.cx) <= 2, `the first frame is at the circle's x  (${start.centre[0]} against ${trigger.cx})`)
  say(Math.abs(Math.round(start.centre[1]) - trigger.cy) <= 2, `and at the circle's y  (${start.centre[1]} against ${trigger.cy})`)
  say(Math.abs(start.width - trigger.w) <= 3, `and at the circle's size  (${start.width}px against ${trigger.w}px)`)
  say(start.opacity === 0, `from nothing  (${start.opacity})`)

  const frames = []
  for (const t of [0, 60, 120, 180, 240]) {
    await at(t)
    const f = await readFrame()
    frames.push({ t, ...f })
    console.log(`    ${String(t).padStart(3)}ms  opacity ${f.opacity.toFixed(3)}  width ${f.width}  centre ${f.centre.join(",")}  panel opacity ${f.panelOpacity.toFixed(3)}`)
  }
  const last = frames.at(-1)
  say(last.opacity === 1, `it ends solid  (${last.opacity})`)
  say(Math.abs(last.centre[0] - 195) <= 1 && Math.abs(last.centre[1] - 390) <= 1, `centred in the viewport  (${last.centre.join(",")})`)
  say(last.width === 281, `at its own size  (${last.width}px, which is min(72vw, 56vh, 320px) on a 390x780 phone)`)
  say(frames.every((f, i) => i === 0 || f.width >= frames[i - 1].width), "it only ever grows")
  say(frames.every((f, i) => i === 0 || f.opacity >= frames[i - 1].opacity), "and only ever fades in")
  say(last.panelTransform === "none", `the panel itself is not transformed  (${last.panelTransform})`)
  say(frames.every((f) => f.panelTransform === "none"), "on any frame, so the X in the corner does not grow with the picture")
  say(frames.every((f) => f.close && f.close.w === 44 && f.close.h === 44), "and the X is 44px throughout")
  say(frames[0].names.includes("lightbox-photo-in") && frames[0].names.includes("lightbox-ground-in"), `the two animations are the ones declared  (${frames[0].names.join(", ")})`)
}

console.log("\nAnd it closes the same way, whichever way you close it\n")
for (const [how, act] of [
  ["the X", async () => page.click('[data-avatar-lightbox] button[aria-label="Close"]')],
  ["a press on the ground", async () => page.evaluate(() => {
    const panel = document.querySelector("[data-avatar-lightbox]")
    const o = { bubbles: true, cancelable: true, composed: true, clientX: 8, clientY: 8, button: 0, pointerId: 1, isPrimary: true }
    panel.dispatchEvent(new PointerEvent("pointerdown", o))
    panel.dispatchEvent(new MouseEvent("mousedown", o))
    panel.dispatchEvent(new PointerEvent("pointerup", o))
    panel.dispatchEvent(new MouseEvent("mouseup", o))
    panel.dispatchEvent(new MouseEvent("click", o))
  })],
  ["Escape", async () => page.keyboard.press("Escape")],
]) {
  const t = await open()
  /* The entrance runs out on its own clock. Pausing it by hand and then
     closing leaves a script-paused animation in effect over the exit, which
     is a measurement of the probe rather than of the component. */
  await new Promise((r) => setTimeout(r, 340))
  await act()
  await new Promise((r) => setTimeout(r, 40))
  const count = await at(0)
  const state = await page.evaluate((panel) => document.querySelector(panel)?.getAttribute("data-state") ?? "gone", PANEL)
  say(state === "closed", `${how}: the panel is still there and says it is closing  (${state})`)
  if (state !== "closed") continue
  const frames = []
  for (const ms of [0, 60, 120, 180]) {
    await at(ms)
    const f = await readFrame()
    if (!f) break
    frames.push({ t: ms, ...f })
  }
  for (const f of frames) console.log(`    ${how}  ${String(f.t).padStart(3)}ms  opacity ${f.opacity.toFixed(3)}  width ${f.width}  centre ${f.centre.join(",")}`)
  say(frames.length === 4, `${how}: it is still mounted for the whole exit  (${frames.length} frames read, ${count} animations)`)
  if (frames.length !== 4) continue
  say(frames[0].names.includes("lightbox-photo-out"), `${how}: it is the exit that is running  (${frames[0].names.join(", ")})`)
  say(frames[0].opacity === 1 && frames.at(-1).opacity === 0, `${how}: from solid to nothing  (${frames[0].opacity} to ${frames.at(-1).opacity})`)
  say(frames.every((f, i) => i === 0 || f.width <= frames[i - 1].width), `${how}: it only ever shrinks`)
  say(Math.abs(frames.at(-1).centre[0] - t.cx) <= 2 && Math.abs(frames.at(-1).centre[1] - t.cy) <= 2, `${how}: and ends back at the circle  (${frames.at(-1).centre.join(",")} against ${t.cx},${t.cy})`)
  say(frames.every((f) => f.panelTransform === "none"), `${how}: the panel never scales on the way out either`)
}

console.log("\nThe panel's fade outlives the picture's exit, which is what keeps the dialog mounted\n")
{
  await open()
  await new Promise((r) => setTimeout(r, 340))
  await page.click('[data-avatar-lightbox] button[aria-label="Close"]')
  await new Promise((r) => setTimeout(r, 40))
  const durations = await page.evaluate((photo, panel) => {
    const box = document.querySelector(panel)
    const img = document.querySelector(photo)
    if (!box || !img) return null
    const d = (el) => el.getAnimations().map((a) => ({ name: a.animationName, ms: a.effect.getTiming().duration }))
    return { panel: d(box), photo: d(img) }
  }, PHOTO, PANEL)
  console.log(`    panel ${JSON.stringify(durations?.panel)}   photo ${JSON.stringify(durations?.photo)}`)
  const p = durations?.panel.find((a) => a.name === "lightbox-ground-out")?.ms
  const i = durations?.photo.find((a) => a.name === "lightbox-photo-out")?.ms
  say(typeof p === "number" && typeof i === "number" && p > i, `the panel runs ${p}ms and the picture ${i}ms`)
}

console.log("\nReduced motion: it is simply there, and simply gone\n")
{
  await page.goto(url)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.waitForSelector("#trigger")
  await page.click("#trigger")
  await page.waitForSelector(PHOTO)
  const f = await page.evaluate((photo) => {
    const img = document.querySelector(photo)
    return { opacity: Number(getComputedStyle(img).opacity), transform: getComputedStyle(img).transform, animations: img.getAnimations().length }
  }, PHOTO)
  say(f.animations === 0, `the picture does not travel  (${f.animations} animations)`)
  say(f.opacity === 1 && f.transform === "none", `it is just the picture  (opacity ${f.opacity}, transform ${f.transform})`)
  await page.keyboard.press("Escape")
  await new Promise((r) => setTimeout(r, 400))
  const gone = await page.evaluate((photo) => !document.querySelector(photo), PHOTO)
  say(gone, "and Escape still closes it")
  await page.emulateMediaFeatures([])
}

await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nthe picture comes out of the circle and goes back into it, three ways out\n")
process.exit(bad ? 1 : 0)
