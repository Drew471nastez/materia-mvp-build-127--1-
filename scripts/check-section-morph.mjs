/**
 * ===========================================================================
 *  AN EDIT TO A SECTION CHANGES WHAT IT CHANGED, AND NOTHING ELSE
 * ===========================================================================
 * lib/website-builder/morph-html.ts applies a section's new markup in the
 * editor. Held here, in a real browser:
 *   • the result is exactly the markup asked for, over a set of edits that
 *     change text, attributes, and the shape (children added, removed,
 *     swapped for another tag);
 *   • the nodes an edit did not touch are the same nodes afterwards: the
 *     hero's <img> and <video> are not rebuilt when its heading is typed
 *     into, so the picture is not decoded again and the video not restarted;
 *   • an animation already running on an untouched element keeps running.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const out = mkdtempSync(join(tmpdir(), "storelib-morph-"))
execFileSync("npx", ["esbuild", join(root, "lib/website-builder/morph-html.ts"), "--bundle", "--format=iife", "--global-name=M", `--outfile=${join(out, "m.js")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "m.js"), "utf8")

let failed = 0
const expect = (ok, name, detail = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail !== "" ? `   (${detail})` : ""}`); if (!ok) failed++ }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const p = await browser.newPage()
await p.setContent(`<!doctype html><html><head><style>@keyframes rise{from{opacity:0}to{opacity:1}} .rise{animation:rise 4s linear}</style></head><body><div id="host"></div></body></html>`)
await p.addScriptTag({ content: bundle })

console.log("\nthe result is the markup asked for")
const pairs = [
  [`<h1>Film</h1><p>Presets</p>`, `<h1>Film presets</h1><p>Presets</p>`],
  [`<a href="/a" class="b">Go</a>`, `<a href="/b">Go</a>`],
  [`<ul><li>1</li><li>2</li><li>3</li></ul>`, `<ul><li>1</li></ul>`],
  [`<ul><li>1</li></ul>`, `<ul><li>1</li><li>2</li><li>3</li></ul>`],
  [`<div><span>a</span></div>`, `<div><em>a</em></div>`],
  [`<div id="x">a</div><div id="y">b</div>`, `<div id="y">b</div><div id="x">a</div>`],
  [`<style>.a{color:red}</style><p>x</p>`, `<style>.a{color:blue}</style><p>x</p>`],
  [`<template><b>1</b></template>`, `<template><b>2</b></template>`],
  [`text <b>bold</b> tail`, `text <i>it</i> tail <!-- c -->`],
  [`<section><img src="/a.png" alt=""><h2>A</h2></section>`, `<section><img src="/a.png" alt=""><h2>B</h2><p>new</p></section>`],
  [`<p>one</p>`, ``],
  [``, `<p>one</p>`],
]
const exact = await p.evaluate((pairs) => pairs.map(([a, b]) => {
  const host = document.getElementById("host")
  host.innerHTML = a
  M.morphInto(host, b)
  const t = document.createElement("template")
  t.innerHTML = b
  return host.innerHTML === t.innerHTML ? null : `${a} → ${b}: ${host.innerHTML}`
}).filter(Boolean), pairs)
expect(exact.length === 0, `each of ${pairs.length} edits ends as exactly the markup asked for`, exact.join(" | "))

console.log("\nwhat an edit did not touch stays the same node")
const kept = await p.evaluate(() => {
  const host = document.getElementById("host")
  const hero = (heading) => `<section class="hero"><video src="/clip.mp4" muted></video><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Studio"><h1 class="rise">${heading}</h1><a class="s__btn" href="/shop">Shop</a></section>`
  host.innerHTML = hero("Film")
  const img = host.querySelector("img"), video = host.querySelector("video"), h1 = host.querySelector("h1"), a = host.querySelector("a")
  const anim = h1.getAnimations()[0]
  anim.currentTime = 1500
  for (const word of ["Film ", "Film p", "Film presets"]) M.morphInto(host, hero(word))
  return {
    img: host.querySelector("img") === img,
    video: host.querySelector("video") === video,
    h1: host.querySelector("h1") === h1,
    link: host.querySelector("a") === a,
    text: host.querySelector("h1").textContent,
    animRunning: h1.getAnimations()[0] === anim && anim.currentTime >= 1500,
  }
})
expect(kept.text === "Film presets", "typing into the heading changes the heading", kept.text)
expect(kept.img && kept.video, "and the picture and the video are the same elements, not rebuilt", JSON.stringify({ img: kept.img, video: kept.video }))
expect(kept.h1 && kept.link && kept.animRunning, "the heading's entrance animation carries on rather than starting again", JSON.stringify(kept))

console.log("\nwhat the page wrote onto the section stays (PAGE_OWNED_ATTRIBUTES)")
const owned = await p.evaluate(() => {
  const host = document.getElementById("host")
  const grid = (cols) => `<ul style="--cols: ${cols}"><li><img src="/p1.png" alt="One" data-sl-media=""><h3>One</h3></li></ul>`
  host.innerHTML = grid(3)
  const img = host.querySelector("img")
  img.setAttribute("data-sl-loaded", "")
  M.morphInto(host, grid(4))
  const kept = img.hasAttribute("data-sl-loaded") && host.querySelector("img") === img
  M.morphInto(host, `<ul style="--cols: 4"><li><img src="/p1.png" alt="One" data-sl-media="" data-sl-loaded="yes"><h3>One</h3></li></ul>`)
  return { kept, stated: img.getAttribute("data-sl-loaded") }
})
expect(owned.kept, "a layout change keeps a loaded picture's mark, so the theme does not fade it to nothing")
expect(owned.stated === "yes", "and markup that states the attribute itself still wins", owned.stated)

await browser.close()
console.log(failed ? `\n${failed} check(s) failed.` : "\nA section's edit changes only what it changed.")
process.exit(failed ? 1 : 0)
