/**
 * ===========================================================================
 *  ROUND 18, L18: A LESSON INSIDE A COMMUNITY, AND EXPLORE'S HOVER
 * ===========================================================================
 * Held from the source and from the small history module, beside the probes
 * that measure them in a browser (scripts/check-learn18.mjs and
 * scripts/check-explore-hover18.mjs):
 *
 *   COVER     the lesson's stage never draws the program's cover: not while
 *             the media is asked for, not as the video's poster
 *   STILL     while it is asked for, a black 16:9 box the video's own size;
 *             a text lesson has no stage and is never asked for
 *   SWITCH    what the stage shows is held with its lesson's id, so a new
 *             lesson never draws the last one's media; no keyed fade
 *   PAGE      the community's lesson is one card (title, text, files, Mark
 *             as complete, the lessons either side named); the list sits
 *             beside it on a computer and under it on a phone, never a sheet
 *   BACK      the arrow is the browser's Back when the step before is Learn;
 *             a hidden lesson's video stops
 *   HOVER     Explore's cover zoom transitions `scale` (the property the
 *             utility sets), the cards fade only border and shadow, and the
 *             banner reacts to a mouse only
 *   COPY      no em dash and no banned word in this work
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}

async function main() {
  const player = code("components/courses/course-player.tsx")
  const video = code("components/courses/lesson-video.tsx")
  const page = code("components/community/learn/program-page.tsx")
  const library = code("components/community/learn/learn-library.tsx")

  console.log("\nThe program's cover never stands in for a lesson")
  check("the stage is not handed the program's picture at all", !/poster=\{data\.thumbnailUrl\}/.test(player) && !/poster: string \| null/.test(player) && !/props\.poster/.test(player))
  check("a video lesson plays with no poster", /<LessonVideo[\s\S]{0,200}poster=\{null\}/.test(player))
  /* Changed on purpose (round 29): the still's black is bg-[rgb(0,0,0)], which the dark stylesheet leaves black, as the video's own box is. */
  check("while it is asked for: a black 16:9 still, its spinner only past half a second", /data-stage-still=""/.test(player) && /relative aspect-video w-full overflow-hidden bg-\[rgb\(0,0,0\)\]/.test(player) && /delay-500[^"]*starting:opacity-0/.test(player))
  check("a text lesson has no stage and is not asked for", /if \(play\.state === "text"\) return null/.test(player) && /if \(l\.kind === "text"\) return \{ state: "text" \}/.test(player))

  console.log("\nChanging lessons happens in place")
  check("what the stage shows is held with its lesson's id, and a new lesson starts from what is known on the same render", /useState<\{ id: string \| null; play: Play \}>/.test(player) && /const play: Play = lesson && held\.id === lesson\.id \? held\.play : firstPlay\(lesson\)/.test(player))
  check("no keyed fade on the stage when the lesson changes", !/key=\{lessonId \?\? "no-lesson"\}/.test(player) && !/fade-in-0/.test(player))
  check("the address follows with replaceState, keeping the entry's state", /window\.history\.replaceState\(window\.history\.state, ""/.test(player))
  check("a new lesson in a community starts at its card's top, gliding only a short way", /if \(embedded\) return void toLessonTop\(topRef\.current\)/.test(player) && /const far = Math\.abs\(top - bar\) > window\.innerHeight/.test(player))
  check("an embed fades in over the black box once loaded", /function ExternalStage/.test(player) && /onLoad=\{\(\) => setLoaded\(true\)\}/.test(player))

  console.log("\nThe lesson page in a community")
  check("one card: the stage, the title, the text at a reading width, the files", /data-lesson-column=""/.test(player) && /data-lesson-title=""/.test(player) && /max-w-\[68ch\][^"]*" data-lesson-text=""/.test(player))
  check("its foot: Mark as complete and the lessons either side, named", /data-lesson-foot=""/.test(player) && /<PagerCell side="prev"/.test(player) && /<PagerCell side="next"/.test(player) && /lesson\.title/.test(player.slice(player.indexOf("function PagerCell"))))
  {
    const community = player.slice(player.indexOf("if (embedded) {"), player.indexOf("\n  return (", player.indexOf("if (embedded) {")))
    check("the list is beside it from 1024px and under it below, in the page (no sheet in a community)", /mt-4 lg:hidden`\} aria-label="Lessons" data-lessons-inline=""/.test(community) && /<aside className="sticky[^"]*hidden lg:block"/.test(community) && !/<LessonSheet/.test(community))
  }
  check("the progress heads the page on a phone", /data-progress-label=""/.test(player))

  console.log("\nGoing back")
  check("the program's arrow is the browser's Back when it came from Learn, else Learn through the navigator", /if \(cameFromLearn\(\)\) window\.history\.back\(\)\s*else nav\.go\(\{ kind: "learn" \}\)/.test(page))
  check("the shell leaves that arrow to the page (data-native-nav)", /data-native-nav=\{onBack \? "" : undefined\}/.test(player))
  check("a card on the shelf notes the step it opens", /onClick=\{noteProgramOpened\}/.test(library))
  check("a lesson's video stops when its screen is put away", /return \(\) => el\?\.pause\(\)/.test(video))
  check("the video's own waiting spinner waits 300ms too", /delay-300[^"]*starting:opacity-0/.test(video))
  {
    /* The history module, against a stand in window: a push from the shelf, lessons replaced in it, then elsewhere. */
    const state: { s: Record<string, unknown> | null; path: string } = { s: null, path: "/community/x/learn" }
    const g = globalThis as unknown as { window?: unknown }
    g.window = { history: { get state() { return state.s } }, location: { get pathname() { return state.path } } }
    const { noteProgramOpened, cameFromLearn } = await import("../components/community/learn/learn-history")
    check("nothing noted: not from Learn", cameFromLearn() === false)
    state.s = { __communityDepth: 3 }
    state.path = "/community/x/learn/p1"
    noteProgramOpened()
    check("opened from the shelf: back goes the way it came", cameFromLearn() === true)
    state.s = { __communityDepth: 3, other: 1 }
    check("a lesson changed in place still counts", cameFromLearn() === true)
    state.s = { __communityDepth: 4 }
    check("a deeper step (a post opened over it) does not", cameFromLearn() === false)
    state.s = { __communityDepth: 3 }
    state.path = "/community/x/learn/p2"
    check("another program does not", cameFromLearn() === false)
    delete g.window
  }

  console.log("\nExplore's hover")
  const card = code("components/explore/product-card.tsx")
  const community = code("components/explore/community-card.tsx")
  const creator = code("components/explore/creator-card.tsx")
  const banner = code("components/explore/featured-banner-carousel.tsx")
  check("the product cover's zoom transitions scale, the property the utility sets", /transition-\[scale,opacity\][^"]*group-hover:scale-\[1\.02\]/.test(card) && !/transition-\[transform,opacity\]/.test(card))
  check("the product and creator cards fade only border and shadow, one curve both ways", /bg-card isolate transition-\[border-color,box-shadow\] duration-300 ease-\[cubic-bezier\(0\.4,0,0\.2,1\)\]/.test(card) && /transition-\[border-color,box-shadow\] duration-300/.test(creator) && !/transition-all/.test(card) && !/transition-all/.test(creator))
  check("the community card zooms on the same curve and keeps its corners", /bg-card isolate outline-none/.test(community) && /transition-\[scale\] duration-500 ease-\[cubic-bezier\(0\.33,1,0\.68,1\)\][^"]*scale-\[1\.02\]/.test(community))
  check("every hover there sits behind a real mouse", /\[@media\(hover:hover\)\]:group-hover:scale/.test(card) && /\[@media\(hover:hover\)\]:hover:shadow/.test(card))
  check("the banner pauses and shows its arrows for a mouse only, never a tap", /onPointerEnter=\{handleMouseEnter\}/.test(banner) && (banner.match(/if \(e\.pointerType !== "mouse"\) return/g) || []).length === 2 && !/onMouseEnter=/.test(banner))

  console.log("\nCopy")
  const files = [
    "components/courses/course-player.tsx",
    "components/courses/lesson-video.tsx",
    "components/community/learn/program-page.tsx",
    "components/community/learn/learn-library.tsx",
    "components/community/learn/learn-history.ts",
    "components/explore/product-card.tsx",
    "components/explore/community-card.tsx",
    "components/explore/creator-card.tsx",
    "components/explore/featured-banner-carousel.tsx",
    "scripts/check-learn18.mjs",
    "scripts/render-learn18.tsx",
    "scripts/check-explore-hover18.mjs",
    "tests/learn18.test.ts",
  ]
  /* "transform" is also the CSS property these files talk about; as copy it would be "transforms", "transformation", "transform your". */
  const banned = /\b(unlock|elevate|seamless|powerful|effortless|supercharge|transforms|transformation|transformative|transform your)/i
  const dash = String.fromCharCode(0x2014)
  /* The Explore files carried em dashes in older comments before this round; what this round wrote is held to it. */
  for (const f of files.filter((x) => !x.startsWith("components/explore/"))) check(`${f}: no em dash`, !read(f).includes(dash))
  const ours = ["components/community/learn/learn-history.ts", "scripts/check-learn18.mjs", "scripts/render-learn18.tsx", "scripts/check-explore-hover18.mjs", "tests/learn18.test.ts"]
  for (const f of ours) check(`${f}: none of the banned words`, !banned.test(read(f).replace(/const banned = .*\n/, "").replace(/"transform" is also[^\n]*\n/, "")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
