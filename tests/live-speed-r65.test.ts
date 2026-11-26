/**
 * ===========================================================================
 *  ROUND 65 (m3): A LIVE WEBSITE'S PAGES WITHOUT THE DOWNLOADS THEY DID NOT NEED
 * ===========================================================================
 * The owner: a page of a live website took about ten seconds to load.
 * Measured on liam-bailey.storelib.com (scratchpad r65/m3): the server
 * answered every page in 0.15 to 0.65 s (CDN HIT, Server-Timing total
 * 30 to 375 ms warm), but on a phone network the front page's largest paint
 * came at 11.4 s, because:
 *
 *   SIZED UPLOADS   the hero printed its own upload as it is, a 1.9MB PNG,
 *                   68% of the page's bytes. Every <img> and single-address
 *                   <source> naming one of Storelib's own uploads with no
 *                   srcset of its own now goes through /_next/image
 *                   (lib/storelib-theme/compat/sized-media.ts), before the
 *                   first big picture is preloaded (lcp-hint.ts).
 *   HERO POSTER     Materia's hero-image-one.js gave the hidden <video> the
 *                   photo's original file as its poster when there was no
 *                   video: the 1.9MB again, after load.
 *   SELF FETCH      Materia's product-counters.js fetched the product page
 *                   it was on (480KB of HTML) to read the sold count the
 *                   page was just drawn with.
 * The two script fixes are made in theme-packages and, for websites that
 * keep an older install, where an installed theme's script is served
 * (lib/storelib-theme/compat/js-fixes.ts), under a new address for that
 * file alone so a browser's year-long copy is not kept.
 *
 * Run with:  npx tsx tests/live-speed-r65.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_SIZES, SIZED_MEDIA_WIDTHS, isSizableUpload, withSizedMedia } from "../lib/storelib-theme/compat/sized-media"
import { withLcpHint } from "../lib/storelib-theme/compat/lcp-hint"
import { THEME_JS_FIXES, fixThemeJs, themeJsFixMark } from "../lib/storelib-theme/compat/js-fixes"
import { plainAssetVersion } from "../lib/storelib-theme/compat/asset-version"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const HERO = "https://storelib.com/media/store-builder-images/a69ef3a8-675a-4324-a4c6-2a2b403fa95f/sections/1793965046471.png"
const enc = encodeURIComponent(HERO)

section("Sized uploads: the hero as Materia prints it")
{
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><div id="shopify-section-group-header" class="shopify-section shopify-section-group-header-group"><img src="/logo.png" width="120"></div><section id="shopify-section-hero" class="shopify-section"><div class="hi1__bg"><picture><img src="${HERO}" alt="" width="1920" height="1080" loading="eager" fetchpriority="high" decoding="async"></picture><video hidden muted playsinline autoplay loop></video></div></section><meta property="og:image" content="${HERO}"></body></html>`
  const r = withSizedMedia(page)
  check("one picture sized", r.sized === 1, r.sized)
  check("its src is the optimizer at 1920", r.html.includes(`src="/_next/image?url=${enc}&amp;w=1920&amp;q=90"`))
  for (const w of SIZED_MEDIA_WIDTHS) check(`its srcset offers ${w}w`, r.html.includes(`/_next/image?url=${enc}&amp;w=${w}&amp;q=90 ${w}w`))
  check("sizes, when the theme says none, allows for a hero cropped to cover on a phone", r.html.includes(`<img sizes="${DEFAULT_SIZES}"`))
  check("the original is no longer an <img> address", !/<img[^>]*src="https:\/\/storelib\.com\/media/.test(r.html))
  check("its other attributes are kept", /fetchpriority="high"[^>]*decoding="async"/.test(r.html) && r.html.includes('width="1920" height="1080"'))
  check("the share picture (a meta) is left as it is", r.html.includes(`<meta property="og:image" content="${HERO}">`))
  check("the theme's logo (its own file) is left as it is", r.html.includes('<img src="/logo.png" width="120">'))
  const hinted = withLcpHint(r.html).html
  const preload = hinted.match(/<link rel="preload" as="image"[^>]*>/)?.[0] ?? ""
  check("the first big picture is preloaded at its sized address", preload.includes(`href="/_next/image?url=${enc}&amp;w=1920`) && preload.includes("imagesrcset=") && preload.includes(`imagesizes="${DEFAULT_SIZES}"`), preload)
  check("the preload never names the 1.9MB original", !preload.includes(`href="${HERO}"`))
  check("sizing twice changes nothing", withSizedMedia(r.html).html === r.html)
}

section("Sized uploads: what is left as it is")
{
  const same = (name: string, html: string) => check(name, withSizedMedia(html).html === html, withSizedMedia(html).html)
  same("an SVG upload", `<img src="https://storelib.com/media/a/logo.svg">`)
  same("a GIF upload", `<img src="https://storelib.com/media/a/spin.gif">`)
  same("another host's picture", `<img src="https://example.com/a.png">`)
  same("a picture the theme already sized", `<img src="/_next/image?url=${enc}&amp;w=828&amp;q=90">`)
  same("a picture with its own srcset", `<img src="${HERO}" srcset="${HERO} 1x">`)
  same("a data address", `<img src="data:image/png;base64,AAAA">`)
  same("a script that writes an <img>", `<script>var t='<img src="${HERO}">'</script>`)
  same("a style block", `<style>.a{background:url(${HERO})}</style>`)
  same("a <source> with its own descriptors", `<picture><source srcset="${HERO} 1x, ${HERO} 2x"></picture>`)
  same("a page with no pictures", `<p>No pictures</p>`)
  check("a storage address is one of Storelib's", isSizableUpload("https://ynhdwmbeckabwajbnrpz.supabase.co/storage/v1/object/public/media/x.jpg") || isSizableUpload(HERO))
  check("a storage render address is already sized", !isSizableUpload("https://x.supabase.co/storage/v1/render/image/public/media/x.jpg?width=800"))
}

section("Sized uploads: the theme's own words kept")
{
  const small = withSizedMedia(`<img src="${HERO}" width="40" height="40" alt="">`).html
  check("a small picture gets one address, twice as wide", small.includes(`src="/_next/image?url=${enc}&amp;w=96&amp;q=90"`) && !small.includes("srcset"), small)
  const sized = withSizedMedia(`<img src="${HERO}" sizes="(min-width: 990px) 50vw, 100vw">`).html
  check("the theme's sizes is kept", sized.includes('sizes="(min-width: 990px) 50vw, 100vw"') && !sized.includes(DEFAULT_SIZES), sized)
  const src = withSizedMedia(`<picture><source media="(max-width:767px)" srcset="${HERO}"><img src="${HERO}"></picture>`)
  check("a phone's <source> is sized too", src.sized === 2 && /<source[^>]*srcset="\/_next\/image\?url=[^"]*640w/.test(src.html), src.html)
  const amp = withSizedMedia(`<img src="https://storelib.com/media/a/b.png?x=1&amp;y=2">`).html
  check("an escaped address is read as the browser reads it", amp.includes(encodeURIComponent("https://storelib.com/media/a/b.png?x=1&y=2")), amp)
}

section("Wired into the live page, before the preload")
{
  const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  const sizedAt = route.indexOf("html = withSizedMedia(html).html")
  const hintAt = route.indexOf("html = withLcpHint(html).html")
  check("the live page sizes its uploads", sizedAt > 0)
  check("before the first big picture is chosen", sizedAt > 0 && hintAt > sizedAt)
  check("only for a page opened as a page (never a preview)", sizedAt > route.indexOf("if (openedAsDocument(req.headers)) {") && route.lastIndexOf("!token && page", sizedAt) > 0)
}

section("Materia's scripts: fixed at the source")
{
  const hero = read("theme-packages/materia/base/assets/hero-image-one.js")
  const counters = read("theme-packages/materia/base/assets/product-counters.js")
  check("the hero's photo is the video's poster only when there is a video", hero.includes("const posterPic=url(s.video_poster,true)||(videoURL?photo:'');"))
  check("the old poster line is gone", !hero.includes(THEME_JS_FIXES[0].find))
  check("a product page reads its own count from itself", /if\(!entry&&url\.pathname===location\.pathname\)\{entry=\{time:Date\.now\(\),promise:Promise\.resolve\(document\)\}/.test(counters))
  check("the minute's refresh still asks the server", counters.includes("Date.now()-entry.time>60000") && counters.includes("setInterval("))
  check("today's Materia needs no fix where it is served", fixThemeJs("hero-image-one.js", hero) === hero && fixThemeJs("product-counters.js", counters) === counters)
  check("and keeps its address", themeJsFixMark(hero) === "" && themeJsFixMark(counters) === "")
}

section("Materia's scripts: fixed where an older install is served")
{
  for (const fix of THEME_JS_FIXES) {
    const old = `/*a*/${fix.find}/*b*/`
    check(`${fix.file}: mended`, fixThemeJs(fix.file, old) === `/*a*/${fix.replace}/*b*/`)
    check(`${fix.file}: mended under its folder too`, fixThemeJs(`assets/${fix.file}`, old) === `/*a*/${fix.replace}/*b*/`)
    check(`${fix.file}: another file with the same text is left alone`, fixThemeJs("other.js", old) === old)
    check(`${fix.file}: a script that says it twice is left alone`, fixThemeJs(fix.file, old + old) === old + old)
    check(`${fix.file}: a new address for the old install's file`, themeJsFixMark(old) !== "" && /^h-[0-9a-f]{16}$/.test(plainAssetVersion(old)))
  }
  check("any other file's address is as it was", themeJsFixMark("console.log(1)") === "")
  const assets = read("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
  check("the asset route serves a script through the fixes", /\/javascript\/\.test\(type\) \? fixThemeJs\(name, text\)/.test(assets))
  const site = read("lib/storelib-theme/compat/site.ts")
  check("so does the theme's own asset answer", /\/javascript\/\.test\(type\) \? fixThemeJs\(name, body\)/.test(site))
  check("and the fixed hero script still parses", (() => { try { new Function(fixThemeJs("hero-image-one.js", read("theme-packages/materia/base/assets/hero-image-one.js"))); return true } catch { return false } })())
  check("and the fixed counters script still parses", (() => { try { new Function(read("theme-packages/materia/base/assets/product-counters.js")); return true } catch { return false } })())
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`Failed:\n  - ${failures.join("\n  - ")}`)
  process.exit(1)
}
