/**
 * The canvas scroll does not read layout on the frames it moves, and a push
 * waits until that gesture rests.
 *
 * Measured here as the numbers the scroll handler uses (scroll-rest.ts): a
 * bar follows the scroll offset, and the thumb is placed from a size read
 * earlier. The source is held to not calling getBoundingClientRect from the
 * scroll listener.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resetCanvasScroll, shiftWithScroll, thumbFor, whenCanvasRests, noteCanvasScroll, canvasScrolling, SCROLL_REST_MS } from "@/lib/website-builder/scroll-rest"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA bar follows the scroll, and the thumb uses a size already known")
{
  check("the page moved down 40: the bar moves up 40", shiftWithScroll(120, 200, 240) === 80)
  check("the page did not move: the bar stays", shiftWithScroll(120, 200, 200) === 120)
  check("a short page has no thumb", thumbFor(0, 400, 400) === null)
  const thumb = thumbFor(100, 2000, 500)
  check("a long page has a thumb inside the track", !!thumb && thumb.top >= 8 && thumb.height >= 28, thumb)
  check("the same scroll is the same thumb", JSON.stringify(thumbFor(100, 2000, 500)) === JSON.stringify(thumb))
}

async function rests() {
  console.log("\nA push waits out a gesture, and a still canvas does not wait")
  resetCanvasScroll()
  let rested = false
  await whenCanvasRests().then(() => { rested = true })
  check("still: it resolves at once", rested && !canvasScrolling())
  noteCanvasScroll()
  check("a scroll is a gesture", canvasScrolling())
  let after = false
  void whenCanvasRests().then(() => { after = true })
  await new Promise((r) => setTimeout(r, 30))
  check("it has not landed while the gesture is moving", !after)
  await new Promise((r) => setTimeout(r, SCROLL_REST_MS + 40))
  check("it lands once the gesture rests", after && !canvasScrolling())
  resetCanvasScroll()
}

console.log("\nThe scroll listeners do not read boxes")
{
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const scrollFn = editor.slice(editor.indexOf("const onScroll = () => {\n      noteCanvasScroll()"), editor.indexOf("scroller.addEventListener(\"scroll\", onScroll"))
  check("the section bar follows the offset and measures when the gesture rests", /shiftWithScroll\(/.test(scrollFn) && !/getBoundingClientRect/.test(scrollFn))
  const bar = read("components/website-builder/canvas-scrollbar.tsx")
  const onScroll = bar.slice(bar.indexOf("const onScroll = () => {"), bar.indexOf("let resizedAt"))
  check("the thumb's scroll does not read the page's size", /requestAnimationFrame\(place\)/.test(onScroll) && !/scrollHeight/.test(onScroll) && !/getBoundingClientRect/.test(onScroll))
  check("the canvas does not let a growing section shove the scroll", /#wb-preview-root \{\s*container: wb-canvas \/ size;[\s\S]*overflow-anchor: none;/.test(read("app/globals.css")))
  check("a push waits for the gesture", /await whenCanvasRests\(\)/.test(editor))
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/editor-scroll-rest.test.ts"'))
}

void rests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
