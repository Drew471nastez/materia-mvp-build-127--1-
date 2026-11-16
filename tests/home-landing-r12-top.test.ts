/**
 * ===========================================================================
 *  HOME, LANDING ROUND 12 (TOP): GODBLESS IN THE WEBSITE BUILDER, AND A
 *  GUITAR TEACHER'S DIGITAL STORE IN THE STRIP
 * ===========================================================================
 * components/marketing/home/showcase-mocks/builder-mocks.tsx,
 * ideas-come-to-life.tsx and everything-in-one-place.tsx.
 *
 * The owner, after round 11:
 *   1. the website builder's first example goes "entirely"; in its place
 *      something "more realistic, cool and clean": their own GodBless store
 *      (the summer offer bar, HOME / SHOP ALL / ABOUT US, the red GODBless
 *      wordmark, a photo hero "GodBless Summer Club" with "Trusted by 1,250+"
 *      and EXPLORE, then New Collection with the jacket, two tees and the
 *      hoodie on light grey). The builder still moves on to loudlib.
 *   2. the strip's digital product store is "really bad": a store that looks
 *      shipped, with real product photographs, a new creator.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"
import * as Ideas from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const F = {
  ev: "components/marketing/home/everything-in-one-place.tsx",
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const evCss = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
/** A real webp under `kb`, and its pixel size from the VP8/VP8L/VP8X header. */
const webp = (p: string, kb: number) => {
  const f = join(root, "public", p)
  if (!existsSync(f)) return null
  const b = readFileSync(f)
  if (b.subarray(0, 4).toString() !== "RIFF" || b.subarray(8, 12).toString() !== "WEBP" || statSync(f).size >= kb * 1024) return null
  const kind = b.subarray(12, 16).toString()
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}

console.log("\n── 1. The earlier example is gone, everywhere ──")
const everything = code(read(F.builders)) + code(read(F.ideas)) + read(F.builders) + read(F.ideas)
check("no Mondo Mango in the code, the comments or the alt text", !/mondo|mango/i.test(everything))
check("its pictures are deleted", ["mm-studio", "mm-logo", "mm-game", "mm-late-round", "mm-family", "mm-crate"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))
check("none of its styles are left", !/\.mg[-{]|mg-ring/.test(BUILDER_CSS))

// Changed on purpose (landing round 13): the owner asked for the website builder's example to be "actually accurate":
// GodBless is replaced by their Materia Steez theme, drawn from its export, and GodBless's pictures and font are deleted.
// Sections 2 and "Crisp at 2x" pinned GodBless and are retired; tests/home-landing-r13-ideas.test.ts pins Steez.
console.log("\n── 2. GodBless is gone (landing round 13) ──")
check("its pictures and its font are deleted", ["gb-hero", "gb-logo", "gb-camo", "gb-green", "gb-hoodie", "gb-brown"].every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))) && !existsSync(join(root, "public/home/fonts/gb-oswald.woff2")))
check("none of its styles are left", !/\.gb[-{ ]|GB Oswald/.test(BUILDER_CSS))

console.log("\n── 3. Still moves on to loudlib, on the clock ──")
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
// Changed on purpose (landing round 13): the first site is Steez (class "stz"), not GodBless.
check("Steez first, loudlib second, in the one canvas", /class="smk-frame wx-site bm-s1"[^>]*><div class="smk"[^>]*><div class="stz">/.test(wb) && /class="smk-frame wx-site bm-s2"[^>]*><div class="smk"[^>]*><div class="ll">/.test(wb))
check("the bar's name and the published address change with it", /<span class="bm-s1">Steez<\/span><span class="bm-s2">loudlib<\/span>/.test(wb) && /<span class="bm-s1">steez\.storelib\.com<\/span><span class="bm-s2">loudlib\.net<\/span>/.test(wb))
check("the builder rings the first section and the products on both", (wb.match(/class="wx-sel wx-ring-a"/g) ?? []).length === 2 && (wb.match(/class="wx-sel wx-ring-b"/g) ?? []).length === 2)
check("the cross fade is opacity only, with two scenes on the tab", /\[data-scene="1"\] \.bm-s1\{opacity:0\}/.test(BUILDER_CSS) && Ideas.IDEAS_TABS[0].scenes === 2)
check("the alt text tells it", /First Steez/.test(Ideas.IDEAS_TABS[0].alt) && /Then loudlib/.test(Ideas.IDEAS_TABS[0].alt))

console.log("\n── 4. Jonah Wells, a guitar teacher's digital store ──")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const jonah = EVERYTHING_STORES.find((s) => s.key === "jonah")
check("round 11's store is gone, with its pictures and its dark band", !/Noor Haddad|Saltwater|Shoot to Invoice|ev-dg-|data-digital/.test(JSON.stringify(EVERYTHING_STORES) + html + evCss + code(read(F.ev))) && !existsSync(join(root, "public/home/everything/stores/dg-saltwater.webp")))
// Changed on purpose (landing round 14): the owner put Liam Bailey's real product page where Jonah Wells's store was; its checks are in tests/home-landing-r14-everything.test.ts. What stays from here: he is gone with his pictures, and the stores still never stand side by side.
check("Jonah Wells is gone, with his pictures (landing round 14)", !jonah && !existsSync(join(root, "public/home/everything/stores/jonah-cover.webp")))
check("still two stores, never two side by side", EVERYTHING_STORES.length === 7 && EVERYTHING_STORES.filter((s) => s.kind === "merch").length === 2 && EVERYTHING_STORES.every((s, i) => s.kind !== "merch" || EVERYTHING_STORES[(i + 1) % 7].kind !== "merch"))
check("the other stores still say how many pieces they have", /<i>4 pieces<\/i>/.test(html))

console.log("\n── Copy ──")
const all = code(read(F.ev)) + code(read(F.ideas)) + code(read(F.builders))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the never on the page samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind\b/i.test(all))
check("no Shopify or Liquid in what is drawn", !/shopify|liquid/i.test(renderToStaticMarkup(createElement(WebsiteBuilderMock)) + html))
check("this suite runs with the push tests, after round 11's", /"tests\/home-landing-r11-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r12-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
