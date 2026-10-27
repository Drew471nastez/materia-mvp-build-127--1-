/**
 * ===========================================================================
 *  EVERY TAP GOES SOMEWHERE (round 25, haptics)
 * ===========================================================================
 * lib/native-bridge.ts's hapticTap, bundled as it ships and run in Chromium
 * against stand-in phones, recording which way each tap went:
 *
 *   - an app whose binary has the Haptics plugin: impact for light and
 *     medium, and soft as selection feedback with its generator started
 *     once, through the plugin on the bridge or, before anything registered
 *     it, through nativePromise;
 *   - an iPhone app built without the plugin, and Safari: no native call, no
 *     vibration, the switch in its own frame toggled once a tap (at most one
 *     every 40ms), and the page's own click listeners never see it;
 *   - Android without the plugin, and Chrome: navigator.vibrate, 6/10/15ms.
 *
 * A haptic itself cannot be felt here; where it is routed can be.
 *
 *   node scripts/check-haptics-r25.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const dir = mkdtempSync(join(tmpdir(), "haptics-"))
const entry = join(dir, "entry.ts")
const out = join(dir, "bridge.js")
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const { writeFileSync } = await import("node:fs")
  writeFileSync(entry, `import { hapticTap, triggerHaptic } from "${join(root, "lib/native-bridge.ts")}"\n;(window as any).__haptics = { hapticTap, triggerHaptic }\n`)
  execFileSync("pnpm", ["exec", "esbuild", entry, "--bundle", "--format=iife", "--platform=browser", `--outfile=${out}`, "--log-level=error",
    '--define:process.env.NODE_ENV="production"', '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"}};globalThis.process=process;', `--alias:@=${root}`], { stdio: "inherit" })
  const js = readFileSync(out, "utf8")
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })

  /* A phone: its user agent, and the Capacitor the app's binary would inject (or none). */
  async function phone({ ua, capacitor }) {
    const p = await browser.newPage()
    await p.setUserAgent(ua)
    await p.evaluateOnNewDocument((capacitor) => {
      window.__calls = []
      window.__pageClicks = 0
      document.addEventListener("click", () => window.__pageClicks++, true)
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: (ms) => { window.__calls.push(["vibrate", ms]); return true } })
      if (!capacitor) return
      const record = (name) => (options) => { window.__calls.push([name, options ?? null]); return Promise.resolve() }
      const plugin = { impact: record("impact"), selectionStart: record("selectionStart"), selectionChanged: record("selectionChanged") }
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => capacitor.platform,
        isPluginAvailable: (name) => name === "Haptics" && capacitor.plugin !== "none",
        Plugins: capacitor.plugin === "registered" ? { Haptics: plugin } : {},
        nativePromise: (plugin, method, options) => { window.__calls.push([`${plugin}.${method}`, options ?? null]); return Promise.resolve() },
      }
    }, capacitor ?? null)
    await p.setRequestInterception(true)
    p.on("request", (req) => req.respond({ status: 200, contentType: "text/html", body: `<!doctype html><html><body><script>${js}</script></body></html>` }))
    await p.goto("https://phone.test/")
    return p
  }
  /* Taps as a person's presses would make them: inside a click handler. */
  const tap = (p, styles, gap = 60) => p.evaluate(async (styles, gap) => {
    for (const s of styles) {
      const b = document.createElement("button")
      b.onclick = () => window.__haptics.hapticTap(s)
      document.body.appendChild(b)
      b.click()
      b.remove()
      await new Promise((r) => setTimeout(r, gap))
    }
    await new Promise((r) => setTimeout(r, 50))
    const frame = document.querySelector("iframe[aria-hidden]")
    const input = frame?.contentDocument?.querySelector("input")
    return { calls: window.__calls, frame: !!frame, isSwitch: input?.hasAttribute("switch") ?? null, checked: input?.checked ?? null, pageClicks: window.__pageClicks }
  }, styles, gap)

  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1"
  const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Capacitor StorelibWindows/1"

  console.log("\nan iPhone app with the Haptics plugin, registered on the bridge")
  let p = await phone({ ua: IPHONE, capacitor: { platform: "ios", plugin: "registered" } })
  let r = await tap(p, ["light", "medium", "soft", "soft"])
  expect(JSON.stringify(r.calls) === JSON.stringify([["impact", { style: "LIGHT" }], ["impact", { style: "MEDIUM" }], ["selectionStart", null], ["selectionChanged", null], ["selectionChanged", null]]), "light and medium are impacts; soft starts its generator once, then ticks", r.calls)
  expect(!r.frame, "and no switch is made", r.frame)
  await p.close()

  console.log("\nan iPhone app with the plugin, before anything registered it")
  p = await phone({ ua: IPHONE, capacitor: { platform: "ios", plugin: "header" } })
  r = await tap(p, ["light", "soft"])
  expect(JSON.stringify(r.calls) === JSON.stringify([["Haptics.impact", { style: "LIGHT" }], ["Haptics.selectionStart", {}], ["Haptics.selectionChanged", {}]]), "straight to the bridge's nativePromise, no import to wait for", r.calls)
  await p.close()

  console.log("\nan iPhone app built before the plugin was in it")
  p = await phone({ ua: IPHONE, capacitor: { platform: "ios", plugin: "none" } })
  r = await tap(p, ["light", "soft", "medium"])
  expect(r.calls.length === 0, "no native call and no vibration", r.calls)
  expect(r.frame && r.isSwitch === true, "a switch, in a hidden frame of its own", { frame: r.frame, isSwitch: r.isSwitch })
  expect(r.checked === true, "toggled once a tap (three taps: on, off, on)", r.checked)
  expect(r.pageClicks === 3, "the page's click listeners see the three presses and nothing of the switch", r.pageClicks)
  r = await tap(p, ["soft", "soft", "soft"], 5)
  expect(r.checked === false, "three taps 5ms apart toggle it once: one every 40ms", r.checked)
  await p.close()

  console.log("\nSafari on an iPhone")
  p = await phone({ ua: SAFARI })
  r = await tap(p, ["light", "soft"])
  expect(r.calls.length === 0 && r.frame && r.checked === false, "no vibration; the switch, toggled twice", { calls: r.calls, checked: r.checked })
  await p.close()

  console.log("\nan Android app without the plugin")
  p = await phone({ ua: ANDROID, capacitor: { platform: "android", plugin: "none" } })
  r = await tap(p, ["soft", "light", "medium"])
  expect(JSON.stringify(r.calls) === JSON.stringify([["vibrate", 6], ["vibrate", 10], ["vibrate", 15]]), "vibrate, 6, 10 and 15ms", r.calls)
  expect(!r.frame, "and no switch", r.frame)
  await p.close()

  console.log("\nan Android app with the plugin")
  p = await phone({ ua: ANDROID, capacitor: { platform: "android", plugin: "registered" } })
  r = await tap(p, ["medium"])
  expect(JSON.stringify(r.calls) === JSON.stringify([["impact", { style: "MEDIUM" }]]), "the plugin, not a vibration", r.calls)
  await p.close()

  await browser.close()
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}`)
process.exit(broken ? 1 : 0)
