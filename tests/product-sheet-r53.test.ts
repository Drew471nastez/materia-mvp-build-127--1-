/**
 * ===========================================================================
 *  ROUND 53: THE ONEPAGE PRODUCT SHEET'S GALLERY, ARROWS, QUESTIONS, VIDEO
 * ===========================================================================
 * The rules behind what scripts/check-product-sheet-r53.mjs measures frame by frame in a browser:
 *
 *   DOTS       the lit dot rides the scroll (its translate written from the scroll position), no width animated
 *   SLIDES     keyed by place, so the product's own pictures replace the block's in the same <img>
 *   RATIO      4:5 on a phone, square in a column; a picture fills it only when that cuts at most a fifth of it
 *   ARROWS     the sheet's own surface and ink, never a white disc with the theme's ink on it
 *   QUESTIONS  every line one border class the theme recolours (no divide-*)
 *   VIDEO      a video in the gallery is a <video>: muted, inline, looping, its stored first frame as the poster;
 *              full screen in Storelib's own player, fetched only when needed; a sideways swipe in a dialog is not
 *              cancelled; the full screen view sits over the sheet's window
 *
 *   npx tsx tests/product-sheet-r53.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DOT_STEP_PX, SHEET_COLUMN_RATIO, SHEET_PHONE_RATIO, dotPosition, mediaFit, sheetImages, sheetModel } from "@/lib/onepage/product-sheet"
import { mediaOf } from "@/lib/media/video"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("\nRatio and fit")
check("a phone's box is 4:5, a column's square", SHEET_PHONE_RATIO === 0.8 && SHEET_COLUMN_RATIO === 1)
check("a 4:5 photo fills a 4:5 box", mediaFit(800, 1000, 0.8) === "cover")
check("a square photo fills it (a fifth cut, the most allowed)", mediaFit(1000, 1000, 0.8) === "cover")
check("a 3:4 photo fills it", mediaFit(750, 1000, 0.8) === "cover")
check("a 4:3 photo is drawn whole, not cut by 40%", mediaFit(1200, 900, 0.8) === "contain")
check("a 9:16 video is drawn whole", mediaFit(1080, 1920, 0.8) === "contain")
check("a 4:3 photo in a square column is drawn whole too", mediaFit(1200, 900, 1) === "contain")
check("unknown sizes fill, as before", mediaFit(0, 0, 0.8) === "cover")

console.log("\nThe lit dot")
check("12px from one dot to the next", DOT_STEP_PX === 12)
check("half way through a swipe it is half way between", dotPosition(195, 390, 5) === 0.5)
check("it stays between the first and the last", dotPosition(-40, 390, 5) === 0 && dotPosition(390 * 9, 390, 5) === 4)
check("no width, no count: the first", dotPosition(100, 0, 5) === 0 && dotPosition(100, 390, 1) === 0)

console.log("\nVideos among the pictures")
const video = "https://x.supabase.co/storage/v1/object/public/store-builder-images/u/1700000000-abc-12s.mp4"
const imgs = sheetImages(["https://x/a.jpg", video, "https://x/b.jpg"], sheetModel({ variants: [], options: [] }))
check("the gallery keeps a video in its place", imgs[1] === video && imgs.length === 3)
const media = mediaOf(imgs)
check("and draws it as a video with its stored first frame", media[1].type === "video" && media[1].poster?.endsWith("-12s.poster.jpg") === true, media[1])

console.log("\nThe sheet")
const sheet = strip(read("components/onepage/product-sheet.tsx"))
check("the lit dot is its own element, moved by translate from the scroll", /data-product-sheet-dot-on/.test(sheet) && /style\.translate = `\$\{pos \* DOT_STEP_PX\}px 0`/.test(sheet))
check("no dot animates its width", !/transition-\[width/.test(sheet))
check("the dots fade in when they arrive (starting style)", /data-product-sheet-dots[\s\S]{0,10}/.test(sheet) && /starting:opacity-0" data-product-sheet-dots/.test(sheet))
check("a step's way there is not read back as steps (heading)", /heading\.current !== null/.test(sheet))
check("slides are keyed by place", !/key=\{src\}/.test(sheet) && /<SlideVideo\s+key=\{i\}/.test(sheet))
check("the box is 4:5 on a phone", /tall \? "aspect-square" : "aspect-\[4\/5\]"/.test(sheet))
check("arrows take the sheet's surface and ink, not white with the theme's ink", /bg-\[var\(--opk-surface,#ffffff\)\]\/92 text-\[color:var\(--opk-ink,#111113\)\]/.test(sheet) && !/bg-white\/95 text-\[#111113\]/.test(sheet))
check("arrows are dimmed at the ends, not gone", /disabled:opacity-35/.test(sheet) && !/disabled:opacity-0/.test(sheet))
check("a video slide: muted, looping, inline, its first frame as poster", /<video[\s\S]{0,200}muted\s+loop\s+playsInline/.test(sheet) && /poster=\{entry\.poster \?\? undefined\}/.test(sheet))
check("it plays only while shown and the sheet is up, and waits on reduced motion or Save Data", /shown=\{i === at && active && lightbox === null\}/.test(sheet) && /prefersStill\(window as never\)/.test(sheet))
check("a refused play() leaves it on its frame with the button", /p\.catch\(\(\) => setHeld\(true\)\)/.test(sheet))
check("the sheet tells the gallery when it is up", /active=\{open\}/.test(sheet))
check("Safari: its window's height is of the visible screen (dvh), not of the one under the toolbars (vh)", /max-h-\[min\(90dvh,820px\)\]/.test(sheet) && !/90vh/.test(sheet))
const live = read("components/onepage/public-onepage.tsx")
check("and so are the OnePage's own phone windows", /max-h-\[90dvh\] sm:max-h-\[85dvh\]/.test(live) && /sm:max-h-\[90dvh\]/.test(live) && !/ max-h-\[90vh\]/.test(live))

console.log("\nFull screen")
const box = strip(read("components/onepage/product-lightbox.tsx"))
check("Storelib's own player, fetched when a video is opened (React.lazy)", /React\.lazy\(\(\) => import\("@\/components\/media\/video-player"\)/.test(box) && !/^import[^\n]*video-player/m.test(box))
check("it sits over the dialogs' layer, ground and panel", /z-\[2147483640\] bg-black\/95/.test(box) && /media-viewer-panel z-\[2147483641\]/.test(box))
check("the arrows inside the player seek, elsewhere they step", /closest\?\.\("\[data-video-player\]"\)/.test(box))

console.log("\nThe questions")
const faq = strip(read("components/product/size-chart-panel.tsx"))
const qs = faq.slice(faq.indexOf("export function ProductQuestions"))
check("no divide-* line the theme does not recolour", !/divide-/.test(qs))
check("each question's own bottom line, under one top line, the same class", /className="border-t border-\[#f0f0f3\]"/.test(qs) && /group\/faq border-b border-\[#f0f0f3\]/.test(qs))
check("and the theme recolours that class", /\.border-\\\[\\#f0f0f3\\\]/.test(read("app/globals.css")))

console.log("\nDialogs")
const dialog = strip(read("components/ui/dialog.tsx"))
check("a sideways swipe is not cancelled by the pull to refresh guard", /if \(Math\.abs\(e\.touches\[0\]\.clientX - startX\) > Math\.abs\(deltaY\)\) return/.test(dialog))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
