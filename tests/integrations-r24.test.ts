/**
 * Round r24: Integrations, the owner's five.
 *
 *   sheet     Install's dialog moves on the properties it changes (Tailwind 4
 *             writes translate and scale apart from transform), and leaves
 *             the page only once its way out has ended
 *   pills     one row at every width: sideways scroll, no scrollbar, a fade
 *             at the cut end, a mouse drag
 *   back      a floating round Back where the page has a way back, in the
 *             full-width bar's place
 *   gallery   exactly one YouTube video (a lite embed: its cover, then a
 *             youtube-nocookie frame on a press) and Storelib's own pictures
 *             of the app connected, in /public at three widths
 *
 * scripts/check-integrations-r24.mjs measures all of it in Chromium at 1440
 * and 390, frame by frame for the sheet and the Back.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { VERIFIED_VIDEOS, mediaFor } from "@/lib/integrations/listing"
import { APP_SHOTS, SHOT_WIDTHS, shotSrc, shotSrcSet } from "@/lib/integrations/shots"
import { AppMediaGallery, slidesOf } from "@/components/app/integrations/app-media"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const AI = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform)\b/i

console.log("\nThe install sheet, both ways\n")
{
  const sheet = read("components/app/integrations/install-sheet.tsx")
  check("the dialog transitions opacity, translate and scale, the three it changes", /transition-\[opacity,translate,scale\]/.test(sheet) && !/transition-\[opacity,transform\]/.test(sheet))
  check("  in on a decelerating curve, out on an accelerating one, none under reduced motion", /shown \? "duration-\[200ms\] ease-\[cubic-bezier\(0\.2,0,0,1\)\]" : "duration-\[160ms\] ease-\[cubic-bezier\(0\.4,0,1,1\)\]"/.test(sheet) && /motion-reduce:transition-none/.test(sheet))
  check("  off the page when the panel's own opacity transition ends, with a timer behind it", /e\.target === el && e\.propertyName === "opacity"/.test(sheet) && /window\.setTimeout\(leave, MS_OUT \+ 120\)/.test(sheet))
  check("  a leaving dialog takes no presses", /!shown && "pointer-events-none"/.test(sheet))
  check("  the field is focused once the panel has arrived, not during it", /reduced\(\) \? 0 : MS_IN\)/.test(sheet))
}

console.log("\nThe pills: one row\n")
{
  const pills = read("components/app/filter-pills.tsx")
  const dir = read("components/app/settings/integrations-directory.tsx")
  const row = pills.match(/export const FILTER_PILL_SCROLL_ROW =\s*"([^"]+)"/)?.[1] ?? ""
  check("never wrapped, scrolls sideways, no scrollbar, fades where it is cut", /flex-nowrap/.test(row) && /overflow-x-auto/.test(row) && !/flex-wrap/.test(row.replace("flex-nowrap", "")) && /\[scrollbar-width:none\]/.test(row) && /\[&::-webkit-scrollbar\]:hidden/.test(row) && /\bedge-fade\b/.test(row) && /overscroll-x-contain/.test(row))
  check("  the Integrations row is that row, with the fade and the drag set up whenever it is mounted", /<PillScrollRow rowRef=\{pillsRef\}[^>]*data-integration-pills="">/.test(dir) && /const row = useEdgeFade<HTMLDivElement>\(\)\s*useDragScroll\(row\)/.test(pills))
  const drag = read("components/app/use-drag-scroll.ts")
  check("  a mouse drag of more than 5px scrolls it, and the click that ends it chooses nothing", /e\.pointerType !== "mouse"/.test(drag) && /Math\.abs\(dx\) < 5/.test(drag) && /addEventListener\("click", swallow, \{ capture: true, once: true \}\)/.test(drag))
  check("  a finger is left to the browser, and nothing renders while it moves", !/useState/.test(drag))
}

console.log("\nBack, floating\n")
{
  const detail = read("components/app/settings/integration-detail.tsx")
  const back = read("components/app/integrations/floating-back.tsx")
  check("where the page has a way back, the floating Back on the bar's flag; the bar only where there is none", /\{onBack \? <FloatingBack shown=\{barShown\} onBack=\{onBack\} \/> : null\}/.test(detail) && /\{barOn && !onBack \? \(/.test(detail))
  check("  round, white, with depth: an arrow and the word Back, 44px tall", /rounded-full bg-white/.test(back) && /h-11/.test(back) && /0_10px_24px_-8px_rgba\(16,24,40,0\.28\)/.test(back) && /<ArrowLeft[^>]*\/>\s*\{tt\("Back"\)\}/.test(back))
  check("  in a sticky box with no height, in and out on opacity, translate and scale", /sticky top-\[var\(--pin-lift\)\] z-20 h-0/.test(back) && /transition-\[opacity,translate,scale\] duration-\[220ms\]/.test(back) && /inert=\{!shown\}/.test(back))
  check("  out of reach while hidden", /shown \? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "-translate-y-1\.5 scale-\[0\.96\] opacity-0"/.test(back) && /pointer-events-none sticky/.test(back))
}

console.log("\nThe gallery: one video, the rest pictures of the app\n")
{
  const withVideo = INTEGRATIONS.filter((i) => mediaFor(i).video)
  check("every integration with a video has exactly one in its gallery", withVideo.length === Object.keys(VERIFIED_VIDEOS).length && withVideo.every((i) => slidesOf(i, mediaFor(i)).filter((s) => s.kind === "video").length === 1))
  check("  and two or three of Storelib's pictures beside it", withVideo.every((i) => { const n = slidesOf(i, mediaFor(i)).filter((s) => s.kind === "image").length; return n >= 2 && n <= 3 }), withVideo.filter((i) => slidesOf(i, mediaFor(i)).filter((s) => s.kind === "image").length < 2).map((i) => i.id))
  check("  pictures only for integrations that exist and have a video", Object.keys(APP_SHOTS).every((id) => !!integrationById(id) && !!VERIFIED_VIDEOS[id]))
  const missing: string[] = []
  let biggest = 0
  for (const [id, list] of Object.entries(APP_SHOTS)) for (const s of list ?? []) for (const w of SHOT_WIDTHS) {
    const f = join(process.cwd(), "public", shotSrc(id, s.view, w))
    if (!existsSync(f)) missing.push(f)
    else biggest = Math.max(biggest, statSync(f).size)
  }
  check("every picture is in /public at 640, 960 and 1280, as WebP", missing.length === 0 && SHOT_WIDTHS.join() === "640,960,1280", missing.slice(0, 4))
  check("  none heavier than 80 KB", biggest > 0 && biggest < 80 * 1024, biggest)
  check("  each described in plain words, no dashes, nothing that sounds like an ad", Object.values(APP_SHOTS).every((l) => (l ?? []).every((s) => s.alt.length > 20 && !/[—–]/.test(s.alt) && !AI.test(s.alt))))
  check("  the srcset names every width", shotSrcSet("mailchimp", "audience") === "/integrations/shots/mailchimp-audience-640.webp 640w, /integrations/shots/mailchimp-audience-960.webp 960w, /integrations/shots/mailchimp-audience-1280.webp 1280w")
  const mc = integrationById("mailchimp")!
  const html = renderToStaticMarkup(React.createElement(AppMediaGallery, { item: mc, media: mediaFor(mc), color: "#ffe01b" }))
  const shots = html.match(/<img[^>]*data-app-shot[^>]*>/g) ?? []
  check("Mailchimp: the pictures are lazy, sized 1280 by 720, with a srcset and sizes", shots.length >= 2 && shots.every((t) => /loading="lazy"/.test(t) && /width="1280"/.test(t) && /height="720"/.test(t) && /srcSet="[^"]+640w, [^"]+960w, [^"]+1280w"/i.test(t) && /sizes="/.test(t)), shots[0])
  /* Changed on purpose (r25, the owner): the video is YouTube's own player, a lazy youtube-nocookie frame, its thumbnail under it while it loads; no play button of Storelib's. */
  check("  the video is YouTube's own player: a lazy youtube-nocookie frame, not autoplaying, over its thumbnail", /data-app-video-player=""/.test(html) && /<iframe[^>]*src="https:\/\/www\.youtube-nocookie\.com\/embed\/lPxAiEvZefI\?rel=0[^"]*"[^>]*loading="lazy"/.test(html) && !/autoplay=1/.test(html) && !/data-app-video-poster/.test(html) && !/www\.youtube\.com/.test(html) && /i\.ytimg\.com\/vi\/lPxAiEvZefI\/maxresdefault\.jpg/.test(html))
  const media = read("components/app/integrations/app-media.tsx")
  /* Changed on purpose (r25, the owner): no poster to press; the large frame holds the player only while its slide is shown, and the box has no border of its own, so no line of the player's black at an edge. */
  check("  the player only while its slide is shown, overhanging its borderless box by 1px", /youtubeEmbedUrl\(id, autoplay\)/.test(media) && /i === at \? <VideoSlide/.test(media) && /absolute -inset-px h-\[calc\(100%\+2px\)\] w-\[calc\(100%\+2px\)\]/.test(media) && /const FRAME = "relative overflow-hidden rounded-2xl bg-\[#f3f4f6\] after:/.test(media) && !/const FRAME = "[^"]*\bborder border-/.test(media))
  const gen = read("scripts/render-integration-shots.mjs")
  check("the pictures' source is in the repository: drawn as HTML, rendered by headless Chromium, written by sharp", /puppeteer/.test(gen) && /\.webp\(\{ quality: 82/.test(gen) && /const WIDTHS = \[1280, 960, 640\]/.test(gen))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
