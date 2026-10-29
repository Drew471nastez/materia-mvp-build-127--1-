/**
 * ROUND 42: a OnePage's embeds without scrollbars inside them, buttons whose
 * edges are never cut in a carousel, one copy of a video playing, a social
 * sheet as tall as what it holds, and a slideshow a mouse drags.
 * scripts/check-onepage-r42.mjs measures them in headless Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { bookingFrameUrl, bookingHeightFromMessage, embedHeightFromMessage, embedSource, tiktokPlayerUrl } from "@/lib/onepage/creator-blocks"
import { DRAG_START_PX, isDrag, restingPoint } from "@/lib/onepage/drag-scroll"
import { nextEmbedHeight } from "@/components/onepage/embed-frame"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

section("Embeds: a frame is as tall as its document, and does not scroll")
{
  const x = { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 611.4, width: 444 }] } }
  check("a fractional height is rounded up, never down", embedHeightFromMessage("x", "https://platform.twitter.com", x) === 612)
  check("  a whole one is kept", embedHeightFromMessage("x", "https://platform.twitter.com", { "twttr.embed": { method: "twttr.private.resize", params: [{ height: 612 }] } }) === 612)
  check("growth is always taken, a small shrink is settled", nextEmbedHeight(610, 611, false) === 611 && nextEmbedHeight(611, 609, false) === 611 && nextEmbedHeight(611, 590, false) === 590)
  const tally = embedSource("https://tally.so/r/wMDxQr")
  check("Tally is asked for its height and says it", !!tally?.resizes && /dynamicHeight=1/.test(tally.embedUrl))
  const said = JSON.stringify({ event: "Tally.FormResized", payload: { height: 712.3 } })
  check("  Tally's height is read only from tally.so", embedHeightFromMessage("tally", "https://tally.so", said) === 713 && embedHeightFromMessage("tally", "https://evil.example", said) === null)
  check("a Calendly page inline is told so, with the page's host", /embed_type=Inline/.test(bookingFrameUrl("https://calendly.com/maria/intro", "storelib.me")) && /embed_domain=storelib\.me/.test(bookingFrameUrl("https://calendly.com/maria/intro", "storelib.me:443")))
  check("  Cal.com is left as it is", bookingFrameUrl("https://cal.com/maria", "storelib.me") === "https://cal.com/maria")
  check("  Calendly's height is read only from calendly.com", bookingHeightFromMessage("https://calendly.com", { event: "calendly.page_height", payload: { height: "1021px" } }) === 1021 && bookingHeightFromMessage("https://evil.example", { event: "calendly.page_height", payload: { height: "1021px" } }) === null)
  check("TikTok plays in its player (the video alone), not its post card", /^https:\/\/www\.tiktok\.com\/player\/v1\/123\?autoplay=1/.test(tiktokPlayerUrl("123")) && !/embed\/v2/.test(code("components/onepage/extra-blocks.tsx") + code("components/onepage/storelib-blocks.tsx") + code("components/onepage/public-onepage.tsx")))
  const frame = code("components/onepage/embed-frame.tsx")
  check("a frame that says its height cannot scroll", /scrolling=\{resizes \? "no" : undefined\}/.test(frame))
  check("X's width is kept only for the column it was said in", /said && said\.column === column \? said\.w : null/.test(frame))
  check("the Calendly inline block uses the booking frame", /<BookingFrame\s+url=\{calendlyUrl\}/.test(code("components/onepage/public-onepage.tsx")))
}

section("Buttons in a carousel: room on every side")
{
  const page = code("components/onepage/public-onepage.tsx")
  check("the scroller reaches past its slides and the snap stops inside that room", /const CAROUSEL_ROOM = 16/.test(page) && /scrollPaddingInline: `\$\{CAROUSEL_ROOM\}px`/.test(page) && /margin: `-\$\{CAROUSEL_ROOM\}px -\$\{CAROUSEL_ROOM - 8\}px`/.test(page))
  check("  the old flush 5px gutter is gone", !/padding: '12px 5px 20px 5px'/.test(page))
}

section("The editor's phone: zoomed, so its edges stay on the screen's pixels")
{
  const live = code("components/onepage/live-preview.tsx")
  check("the frame is zoomed, the transform only where zoom does not reach into the frame", /zoomed \? \{ zoom: scale \} : \{ transform: `scale\(\$\{scale\}\)`, transformOrigin: "0 0" \}/.test(live) && /Math\.abs\(inner - width\) > 2\) setZoomed\(false\)/.test(live))
}

section("Video: one copy plays")
{
  const page = code("components/onepage/public-onepage.tsx")
  const still = page.slice(page.indexOf('data-wallpaper-still=""'), page.indexOf("/>", page.indexOf('data-wallpaper-still=""')))
  check("around the card on a computer, the wallpaper's still, not a second player", still.length > 0 && !/autoPlay/.test(still) && /videoPoster\(\(safeTheme as any\)\.background_video_crop\)/.test(page))
  check("the avatar is a still when it is the wallpaper's video", /still=\{avatarStill\}/.test(page) && /background_video_url === profile\.avatar_video_url/.test(page))
  const editor = code("components/onepage/onepage-editor.tsx")
  const share = editor.slice(editor.indexOf("function ShareOnePage"), editor.indexOf("if (isPhone)", editor.indexOf("function ShareOnePage")))
  check("the editor's Share sheet plays its avatar only while open", /still=\{!open\}/.test(share) && !/autoPlay/.test(share))
  check("the editor's own avatars are stills beside the preview", /\bstill\n\s*\/>/.test(code("components/onepage/tabs/links-tab.tsx")) && /\bstill\n\s*\/>/.test(code("components/onepage/tabs/design-tab.tsx")))
  check("PosterVideo takes a still", /still: stillAsked = false/.test(code("components/onepage/poster-video.tsx")))
}

section("Social sheet: as tall as what it holds")
{
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("phone: the list's height for the list only", /height: selectedSocial \? undefined : SOCIAL_SHEET_HEIGHT/.test(tab))
  check("computer: the list's height for the list only, a field's own otherwise", /selectedSocial \? "h-auto" : "h-\[min\(580px,85vh\)\]"/.test(tab))
  check("the change glides", /\[interpolate-size:allow-keywords\] transition-\[height\]/.test(tab))
}

section("Slideshow: a mouse drags it")
{
  check("a press is a click until it travels", !isDrag(DRAG_START_PX - 1, 0) && isDrag(DRAG_START_PX, 0) && !isDrag(10, 30))
  const points = [0, 400, 800, 1200]
  check("a slow drag rests on the nearest slide", restingPoint(points, 0, 150, 0, 1200) === 0 && restingPoint(points, 0, 250, 0, 1200) === 400)
  check("a flick goes on to the next slide", restingPoint(points, 0, 120, 1.5, 1200) === 400)
  check("never more than one slide past the start", restingPoint(points, 0, 390, 20, 1200) === 400)
  check("a flick back returns", restingPoint(points, 400, 330, -1.5, 1200) === 0)
  const page = code("components/onepage/public-onepage.tsx")
  check("the image slideshow and the group carousel both use it", (page.match(/useMouseDragScroll\(/g) ?? []).length === 2 && !/onMouseDown=\{handleMouseDown\}/.test(page))
  const hook = code("components/onepage/drag-scroll.ts")
  check("mouse only; snap off while held; the click after a drag swallowed", /e\.pointerType !== "mouse"/.test(hook) && /scrollSnapType = "none"/.test(hook) && /addEventListener\("click", onClick, true\)/.test(hook))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
