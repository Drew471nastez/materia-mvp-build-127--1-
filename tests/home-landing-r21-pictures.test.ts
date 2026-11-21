/**
 * LANDING ROUND 21, PICTURES (the owner: the whole landing page smooth and
 * clean on a phone, no content slow to show, nothing broken)
 *
 * In the Safari engine (Playwright WebKit 26.6 at 390x844), a fast flick down
 * and up the home page and a slow pass with stops found pictures that still
 * had no pixels with the page at rest on them:
 *   - "A page that fits what you sell": the DJ player's and the AI club's
 *     photographs (Courses, Communities) sat in cards beside the screen in the
 *     row that slides sideways, lazy, so they were asked for only as their
 *     card came in. The file's own rule (Still) is that a scene's pictures
 *     load with the scene; Pic now takes `eager`, and every Pic in the
 *     business scenes uses it.
 *   - The checkout scene: the ring's pictures turn around the phone and were
 *     lazy, so one was judged by where it stood in the turn; they and the
 *     phone's soft copy now load with the scene (it mounts near the screen;
 *     the folder is about 80 KB).
 *   - Run from anywhere: the app's photograph (47 KB) was lazy in a section
 *     mounted near the screen; a fast flick down reached it still blank.
 * All three sections are mounted late (lazy-sections.tsx), so nothing is fetched
 * before they are near.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Pic } from "@/components/marketing/home/showcase-mocks/frame"
import { ClubScene, CoachScene, CourseScene } from "@/components/marketing/home/showcase-mocks/business-mocks"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const imgs = (html: string) => html.match(/<img[^>]*>/g) ?? []

console.log("\nPic: lazy unless told, eager when told")
{
  const lazy = renderToStaticMarkup(createElement(Pic, { n: "bz-dj", w: 1000, h: 600 }))
  const eager = renderToStaticMarkup(createElement(Pic, { n: "bz-dj", w: 1000, h: 600, eager: true }))
  check("by default a Pic is lazy (the other mocks keep theirs)", /loading="lazy"/.test(lazy))
  check("with eager it loads with its scene, still decoded off the main thread", /<img[^>]*loading="eager"[^>]*decoding="async"/.test(eager))
}

console.log("\nThe business scenes: every photograph loads with its scene")
{
  const html = [CourseScene, ClubScene, CoachScene].map((s) => renderToStaticMarkup(createElement(s))).join("")
  const pics = imgs(html).filter((t) => /class="smk-pic/.test(t))
  check("the DJ photo, the AI club, the avatars and the coach are there", ["bz-dj", "bz-ai-club", "bz-coach", "av-h"].every((n) => html.includes(`/home/showcase/${n}`)), pics.length)
  check("none of them is lazy", pics.length >= 5 && pics.every((t) => /loading="eager"/.test(t)), pics.filter((t) => !/loading="eager"/.test(t)))
  const SRC = read("components/marketing/home/showcase-mocks/business-mocks.tsx")
  check("every <Pic> in business-mocks.tsx says eager", (SRC.match(/<Pic [^>]*\/>/g) ?? []).every((t) => /\beager\b/.test(t)))
}

console.log("\nThe checkout ring: its pictures load with the scene")
{
  const SRC = read("components/marketing/home/checkout-scene.tsx")
  for (const cls of ["cmc-pic", "cmc-far", "cmc-soft", "cmc-phone-soft"]) {
    const tag = new RegExp(`<img className="${cls}"[^>]*>`).exec(SRC)?.[0] ?? ""
    check(`${cls}: eager, decoded off the main thread`, /loading="eager"/.test(tag) && /decoding="async"/.test(tag), tag.slice(0, 120))
  }
}

console.log("\nRun from anywhere: the app's photograph loads with its section")
{
  const SRC = read("components/marketing/home/app-anywhere.tsx")
  const tag = /<img\s+src="\/home\/app\/storelib-app-720\.webp"[\s\S]*?\/>/.exec(SRC)?.[0] ?? ""
  check("eager, decoded off the main thread, still sized", /loading="eager"/.test(tag) && /decoding="async"/.test(tag) && /width=\{1280\}/.test(tag))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
