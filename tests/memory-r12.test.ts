/**
 * ===========================================================================
 *  ROUND 12: WHAT THE ONEPAGE HOLDS IN MEMORY
 * ===========================================================================
 * The owner's "Aw, Snap! Error code: 5" on storelib.com/app/onepage (a
 * renderer killed, most often for memory). scripts/check-memory-r12.mjs
 * measures a long session in a real browser; this pins the pieces it found:
 *
 *   ONE LAYOUT      the live page (also the editor's preview) builds the
 *                   computer's layout or the phone's, never both, once in
 *                   the browser (lib/onepage/live-layout); the server sends
 *                   both, so the HTML is whole without script.
 *   SHOWN SIZE      every OnePage photo, avatar, logo and thumbnail goes
 *                   through the image optimizer at the width it is drawn
 *                   (lib/onepage/display-image), never the 4096px file.
 *   LET GO          the Design tab's kept theme pictures are released when
 *                   the tab goes, not held for the life of the page; an
 *                   upload's canvas gives its pixels back once its file is
 *                   made (a 4096px picture is 48MB of canvas).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onePageImageSrc, ONEPAGE_COLUMN_PX } from "../lib/onepage/display-image"
import { LIVE_DESKTOP_QUERY, liveLayoutNow } from "../lib/onepage/live-layout"
import { releaseCanvas } from "../lib/onepage/media-upload"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── SHOWN SIZE ─────────────────────────────────────────────────────────── */
{
  const stored = "https://storelib.com/media/onepage/u1/photo.jpg"
  const block = onePageImageSrc(stored, ONEPAGE_COLUMN_PX)
  check("a photo block asks the optimizer for a 1080px copy", block === `/_next/image?url=${encodeURIComponent(stored)}&w=1080&q=88`, block)
  const avatar = onePageImageSrc(stored, 64)
  check("a 64px avatar asks for a 128px copy", /&w=128&/.test(avatar), avatar)
  // Changed on purpose (round AW): Storelib's own storage project; the optimizer no longer fetches from any other *.supabase.co (next.config.mjs OWN_STORAGE_HOSTS).
  const supa = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/onepage/a.png"
  check("a Supabase file is optimized too", onePageImageSrc(supa, 160).startsWith("/_next/image?url="))
  check("an SVG is drawn as it is (the optimizer refuses SVG)", onePageImageSrc("https://storelib.com/media/logo.svg", 320) === "https://storelib.com/media/logo.svg")
  check("a blob: address (a picture still being cropped) is drawn as it is", onePageImageSrc("blob:https://storelib.com/1", 64) === "blob:https://storelib.com/1")
  check("a data: address is drawn as it is", onePageImageSrc("data:image/png;base64,AA", 64) === "data:image/png;base64,AA")
  check("a host the optimizer does not fetch is drawn as it is", onePageImageSrc("https://cdn.example.com/a.jpg", 64) === "https://cdn.example.com/a.jpg")
  check("nothing stays nothing", onePageImageSrc(null, 64) === null && onePageImageSrc(undefined, 64) === undefined && onePageImageSrc("", 64) === "")

  const live = code("components/onepage/public-onepage.tsx")
  check("the live page's photo blocks are drawn at the column's width", /src=\{onePageImageSrc\(img\.image_url, ONEPAGE_COLUMN_PX\)/.test(live))
  check("the live page's avatars are drawn at their size", /src=\{onePageImageSrc\(profile\.avatar_url, 160\)/.test(live) && /src=\{onePageImageSrc\(profile\.avatar_url, ONEPAGE_COLUMN_PX\)/.test(live))
  check("the live page's title logos are drawn at their size", (live.match(/onePageImageSrc\(\(theme as any\)\.title_logo_url, 320\)/g) || []).length === 2)
  check("no live page avatar or photo block draws the stored file itself", !/src=\{profile\.avatar_url/.test(live) && !/src=\{img\.image_url \|\|/.test(live))
  const links = code("components/onepage/tabs/links-tab.tsx")
  /* Changed on purpose (round 40 media): the blurred photo drawn under a video is gone (the video fades in from its own first frame, components/onepage/poster-video), so one thumbnail of the photo is left. */
  check("the editor's avatar is a thumbnail, not the stored photo", !/<img src=\{avatar_url\}/.test(links) && (links.match(/onePageImageSrc\(avatar_url, 64\)/g) || []).length === 1)
  /* Changed on purpose (round 40 media): a photo block's picture is one compact row (components/onepage/image-field), its preview a thumbnail at twice its 56px. */
  check("the editor's photo block thumbnails are thumbnails", /<OnePageImageField\b/.test(links) && /onePageImageSrc\(value, THUMB_PX \* 2\)/.test(code("components/onepage/image-field.tsx")) && /const THUMB_PX = 56\b/.test(code("components/onepage/image-field.tsx")))
  const design = code("components/onepage/tabs/design-tab.tsx")
  check("the Design tab's avatar, wallpaper card and wallpaper cover are drawn at their size", /* one: the blurred copy under a video is gone (round 40 media) */ (design.match(/onePageImageSrc\(onepage\.avatar_url, 96\)/g) || []).length === 1 && /onePageImageSrc\(theme\.background_image_url, 160\)/.test(design) && /src=\{onePageImageSrc\(coverImage, 400\)\}/.test(design))
  const editor = code("components/onepage/onepage-editor.tsx")
  check("the editor's share card avatar is a thumbnail", /src=\{onePageImageSrc\(onepage\.avatar_url, 64\)\}/.test(editor))
}

/* ── ONE LAYOUT ─────────────────────────────────────────────────────────── */
{
  check("the breakpoint is Tailwind's md, the one the CSS hides by", LIVE_DESKTOP_QUERY === "(min-width: 48rem)")
  check("without a window (the server) both layouts are built", liveLayoutNow() === "both")
  const g = globalThis as unknown as { window?: unknown }
  const at = (wide: boolean) => {
    g.window = { matchMedia: (q: string) => ({ matches: q === LIVE_DESKTOP_QUERY && wide, addEventListener() {}, removeEventListener() {} }) }
    const r = liveLayoutNow()
    delete g.window
    return r
  }
  check("on a computer only the computer's layout is built", at(true) === "desktop")
  check("on a phone only the phone's layout is built", at(false) === "phone")

  const live = code("components/onepage/public-onepage.tsx")
  check("the live page reads the layout once", (live.match(/useLiveLayout\(\)/g) || []).length === 1)
  check("the computer's layout is built only off a phone", /\{liveLayout !== "phone" && \(\s*<div\s+className="onepage-live hidden md:block/.test(live))
  check("the phone's layout is built only off a computer", /\{liveLayout !== "desktop" && \(\s*<div\s+className="onepage-live md:hidden/.test(live))
  const hook = code("lib/onepage/live-layout.ts")
  check("the server's answer is both, so the HTML is whole and hydration matches", /useSyncExternalStore\(subscribe, liveLayoutNow, onServer\)/.test(hook) && /const onServer = \(\): LiveLayout => "both"/.test(hook))
  check("the layout listener is removed when the page goes", /removeEventListener\("change", onChange\)/.test(hook))
}

/* ── LET GO ─────────────────────────────────────────────────────────────── */
{
  const design = code("components/onepage/tabs/design-tab.tsx")
  check("the Design tab hands back the theme pictures when it goes", /useEffect\(\(\) => preloadThemeThumbs\(\), \[\]\)/.test(design))
  check("the last holder empties the kept list and drops each picture", /if \(--themeThumbHolders > 0\) return\s+for \(const img of keptThemeThumbs\.splice\(0\)\) img\.src = ""/.test(design))
  check("a release counts once", /if \(!held\) return\s+held = false/.test(design))
}

{
  const canvas = { width: 4096, height: 3072 } as unknown as HTMLCanvasElement
  releaseCanvas(canvas)
  check("a canvas is sized to nothing once its file is made", canvas.width === 0 && canvas.height === 0)
  releaseCanvas(null)
  check("releasing no canvas is harmless", true)
  const upload = code("lib/onepage/media-upload.ts")
  check("both the HEIC/large-picture redraw and the crop give their canvas back", (upload.match(/decoded\.release\(\)\s+releaseCanvas\(canvas\)/g) || []).length === 2)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
