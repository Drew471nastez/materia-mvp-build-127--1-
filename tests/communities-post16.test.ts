/**
 * ===========================================================================
 *  ROUND 16: THE POST ON A PHONE (worker P16)
 * ===========================================================================
 * Held from their inputs (lib/communities/client/places.ts and open-post.ts,
 * components/community/member/page-sheet.ts and post-motion.ts) and, where
 * the rule is about how a file is written, from its source:
 *
 *   HOST        while a post is open over a place the host stays at that
 *               place, whatever the address says (ARCH16 finding B); a post
 *               no card holds opens over the place; a post's link closes
 *               onto the feed already under it
 *   SHEET       one number drives the page sheet, every part linear in it:
 *               the community's scale is about the screen's middle, the
 *               bands meet its edges, the spring never overshoots
 *   CLOSE       the order of a close: the feed first, the community eased
 *               back unseen, one move down, hidden on its last frame, the
 *               community let go, the layer let go, taken out, the history
 *               step given back
 *   PULL        the distances and speeds that close or spring back, and
 *               the app's edge swipe as the same motion down
 *   KEYBOARD    the box placed from visualViewport's height AND offsetTop
 *               (76.jpg's numbers), the plugin's height first in the app,
 *               then the table, then the floor; the white block from the
 *               box's top edge past the screen's foot; the plugin for the
 *               next build; the ?kbdebug=1 readout
 *   COMPOSER    the same sheet up and down, nothing inside it moving on the
 *               way down, the document's overflow never switched off, the
 *               tab bar's layer kept
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { atPlaceFor, isPostAddress, placeFromUrl } from "@/lib/communities/client/places"
import { addOpenPostFallback, addOpenPostHandler, openPostOver, requestNames, resetOpenPost } from "@/lib/communities/client/open-post"
import { CLOSE_MS, CORNER_PX, OPEN_MS, RECEDE_DIM, RECEDE_SCALE, closeMsFrom, progressFromOffset, sheetFrame, springEasing, springPoints, springVelocity } from "@/components/community/member/page-sheet"
import { closeSteps, dimFor, edgeOffset, iosKeyboardFor, postBox, pullCloseDistance, pullVerdict, shouldComplete, type CloseTrigger } from "@/components/community/member/post-motion"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) <= e

console.log("\nHOST: the place under an opened post stays (finding B)")
{
  check("a post's own address is a post address, with words or a uuid", isPostAddress("/community/clay/post/first-bowls-a1b2c3d4") && isPostAddress("/community/clay/post/a0000000-0000-4000-8000-000000000002") && isPostAddress("/community/clay/post/x/"))
  check("a place, a deeper path or another page is not", !isPostAddress("/community/clay") && !isPostAddress("/community/clay/space/general") && !isPostAddress("/community/clay/post/x/share.png") && !isPostAddress("/explore"))
  check("a post's address is still not a place (the navigator keeps its place)", placeFromUrl("/community/clay/post/a1b2c3d4", "") === null)
  check("at a place the host is at a place", atPlaceFor("/community/clay", "", false) && atPlaceFor("/community/clay", "?profile=mara", false) && atPlaceFor("/community/clay/saved", "", false))
  check("a post opened over a place: the host stays at the place, whatever the address says", atPlaceFor("/community/clay/post/a1b2c3d4", "", true))
  check("a post arrived at by its link (nothing held): the router's page is what shows", !atPlaceFor("/community/clay/post/a1b2c3d4", "", false))
  check("another page that is not a post is never held as a place", !atPlaceFor("/community/clay/join", "", true) && !atPlaceFor("/explore", "", true))
  const host = read("components/community/member/place-host.tsx")
  check("the host reads the address through atPlaceFor, and notes what it was at only when the address is not a post's", /const atPlace = atPlaceFor\(pathname \|\| "", search\?\.toString\(\) \?\? "", heldAtPlace\.current \?\? false(, overLayer)?\)/.test(host) && /if \(!isPostAddress\(pathname\)\) heldAtPlace\.current = atPlace/.test(host))
  /* Round 17: and the router's own post page (not the opened post's entry) is always the routed slot's (communities-post17.test.ts). */
  check("which slot is visible is still decided from atPlace (one rule for the routed slot and the kept screens)", /const routedVisible = (routerPost \|\| \()?routedKey === null \? !atPlace : routedOwns\(shown\.key\)/.test(host) && /const visible = key === shown\.key && \(routedKey !== null \|\| atPlace\)/.test(host))
  check("the host mounts the reader for a post no card holds, outside every <Activity>", /\{viewer \? <PostOpener communityId=\{communityId\} slug=\{slug\} viewer=\{viewer\} readOnly=\{readOnly\} \/> : null\}/.test(host))
  check("the member's own profile is not read ahead (it is the account page, /account)", !/ref: "me"/.test(host.slice(host.indexOf("export function aheadPlaces"), host.indexOf("export function usePlaceScreens"))))
  const frame = read("components/community/member/shell-frame.tsx")
  check("the frame hands the host who is looking", /usePlaceScreens\(\{[^)]*viewer, readOnly: community\.archived \|\| !!viewer\.mutedUntil/.test(frame))
  check("a link to a post of this community opens it over the place (a notification, a mention), never a page when someone can", /if \(!p && a\) \{\s*const id = postIdOf\(a\)\s*if \(id && openPostOver\(id, a\)\) e\.preventDefault\(\)/.test(frame))
  const opener = read("components/community/member/post-opener.tsx")
  check("the reader is a fallback (asked after every card), reads the post by id, opens it over the place", /addOpenPostFallback\(/.test(opener) && /api<\{ post: FeedPostView \}>\(`\$\{apiBase\(communityId\)\}\/posts\/\$\{req\.postId\}`\)/.test(opener) && /<PostOverlay/.test(opener))
  check("and a post it cannot read opens its own page, so a press is never dead", /window\.location\.assign\(href\)/.test(opener))
  const shared = read("components/community/member/shared-post.tsx")
  check("a post opened by its link closes by giving the address back in place, not a router move (the feed under it is not drawn again)", /window\.history\.replaceState\(window\.history\.state, "", home\)/.test(shared) && !/router\.replace/.test(shared))
  const search = read("components/community/member/search.tsx")
  check("a post picked from the community's search opens over the place too (both search screens)", (search.match(/if \(openResultOver\(href, options\)\) return\s*router\.push\(href\)/g) ?? []).length === 2 && /return !!o && openPostOver\(o\.key\.slice\("post:"\.length\)\)/.test(search))
  const page = read("app/(marketing)/community/[slug]/(member)/post/[postId]/page.tsx")
  check("the post route seeds the shell with the feed under the shared post", /<SharedPost slug=\{community\.slug\}[^>]*>\s*<PlacePage slug=\{community\.slug\} place=\{\{ kind: "feed" \}\} \/>\s*<\/SharedPost>/.test(page) && !/<CommunityFeed/.test(page))
}

console.log("\nOPEN POST: cards first, then the host's reader, one open per press")
{
  resetOpenPost()
  const asked: string[] = []
  const offFallback = addOpenPostFallback((r) => (asked.push(`fallback:${r.postId}`), true))
  const offCard = addOpenPostHandler((r) => (asked.push(`card:${r.postId}`), r.postId === "a0000000-0000-4000-8000-000000000001"))
  check("a card that holds the post opens it and the reader is not asked", openPostOver("a0000000-0000-4000-8000-000000000001") && asked.join() === "card:a0000000-0000-4000-8000-000000000001")
  asked.length = 0
  check("no card holds it: the reader is asked after the cards", openPostOver("a0000000-0000-4000-8000-000000000009") && asked.join() === "card:a0000000-0000-4000-8000-000000000009,fallback:a0000000-0000-4000-8000-000000000009")
  asked.length = 0
  check("the same post asked again in the same press is answered without asking again", openPostOver("a0000000-0000-4000-8000-000000000009") && asked.length === 0)
  offFallback()
  offCard()
  resetOpenPost()
  check("nobody to open it: openPostOver says so and leaves the link alone (no page load of its own)", openPostOver("a0000000-0000-4000-8000-000000000007") === false)
  check("a request names a post by its uuid or by the short id its address carries", requestNames({ postId: "a1b2c3d4", from: null }, "a1b2c3d4-0000-4000-8000-000000000000") && requestNames({ postId: "A1B2C3D4-0000-4000-8000-000000000000", from: null }, "a1b2c3d4-0000-4000-8000-000000000000") && !requestNames({ postId: "a1b2c3d5", from: null }, "a1b2c3d4-0000-4000-8000-000000000000") && !requestNames({ postId: "a1b2", from: null }, "a1b2c3d4-0000-4000-8000-000000000000"))
}

console.log("\nSHEET: one p, every part linear in it")
{
  const scene = { width: 390, height: 844, boxCenterX: 195, boxCenterY: 1900 }
  const rest = sheetFrame(0, scene)
  const up = sheetFrame(1, scene)
  const half = sheetFrame(0.5, scene)
  check("p 0: the sheet below the screen, the community untouched, no dim, no bands, no corners", rest.sheetY === 844 && rest.scale === 1 && rest.shiftX === 0 && rest.shiftY === 0 && rest.dim === 0 && rest.bandX === 0 && rest.bandY === 0 && rest.corners === 0)
  check("p 1: the sheet up, the community eased back to RECEDE_SCALE under the full dim, corners in", up.sheetY === 0 && near(up.scale, RECEDE_SCALE, 1e-9) && up.dim === 1 && up.corners === 1)
  check("a slight scale and a soft dim (iOS's page sheet, not a zoom)", RECEDE_SCALE >= 0.92 && RECEDE_SCALE <= 0.96 && RECEDE_DIM > 0 && RECEDE_DIM <= 0.25 && CORNER_PX >= 8 && CORNER_PX <= 16)
  check("every part is linear in p (half way is half of each)", near(half.sheetY, 422) && near(half.scale, (1 + RECEDE_SCALE) / 2) && near(half.shiftY, up.shiftY / 2) && near(half.bandX, up.bandX / 2) && near(half.dim, 0.5))
  /* The screen's middle stays where it is: a point at the middle, scaled about the box's own middle and shifted, lands on itself. */
  const mid = (f: typeof up) => scene.boxCenterY + f.shiftY + f.scale * (scene.height / 2 - scene.boxCenterY)
  check("the community eases back about the screen's middle, not its own (it is document tall)", near(mid(up), 422) && near(mid(half), 422))
  const edgeTop = scene.boxCenterY + up.shiftY + up.scale * (0 - scene.boxCenterY)
  check("the dark bands meet the receded community's edges exactly", near(edgeTop, up.bandY) && near(up.bandX, ((1 - RECEDE_SCALE) * 390) / 2))
  check("clamped: no p beyond the sheet's ends", sheetFrame(2, scene).sheetY === 0 && sheetFrame(-1, scene).sheetY === 844)
  const pts = springPoints(OPEN_MS)
  check("the spring starts at 0 and ends exactly at 1", pts[0] === 0 && pts.at(-1) === 1)
  check("it only ever goes forward (no bounce at the sheet's foot)", pts.every((x, i) => i === 0 || x >= pts[i - 1]) && pts.every((x) => x <= 1))
  check("quick start, long settle: most of the move in the first third", pts[Math.round(pts.length / 3)] > 0.7)
  const fast = springPoints(CLOSE_MS, 1000)
  check("a fling never overshoots either (its speed is capped at the spring's own)", fast.every((x, i) => x <= 1 && (i === 0 || x >= fast[i - 1])))
  check("as a CSS linear() easing", /^linear\(0, [0-9.]+(, [0-9.]+)+, 1\)$/.test(springEasing(OPEN_MS)))
  check("a finger's place is p", progressFromOffset(0, 844) === 1 && progressFromOffset(422, 844) === 0.5 && progressFromOffset(900, 844) === 0 && progressFromOffset(-30, 844) === 1)
  check("the rest of a close from a finger: at least 200ms, never longer than a close from rest", closeMsFrom(0.5, 844, 3) >= 200 && closeMsFrom(0.5, 844, 0.2) <= CLOSE_MS && closeMsFrom(1, 844, 0) === CLOSE_MS)
  check("a finger's speed as the spring's rate", near(springVelocity(0.844, 844), 1) && springVelocity(-1, 844) === 0)
}

console.log("\nCLOSE: the order of operations")
{
  const all: CloseTrigger[] = ["back", "escape", "history", "browser-swipe", "pull", "edge"]
  for (const t of all) {
    const s = closeSteps(t)
    const i = (x: string) => s.indexOf(x as never)
    check(`${t}: feed first, then the move, hidden on its last frame, the community let go, the layer let go, taken out`, s[0] === "hold-feed" && i("hide-page") === Math.max(i("slide-down"), i("cut")) + 1 && i("release-community") === i("hide-page") + 1 && i("release-layer") > i("release-community") && i("unmount") > i("release-layer"), s)
    if (t !== "browser-swipe") check(`${t}: the community is eased back (unseen) before the move, and the move is down`, i("recede") === 1 && i("slide-down") === 2, s)
  }
  check("a Back the browser drew itself, and reduced motion: no move", closeSteps("browser-swipe").includes("cut") && all.every((t) => closeSteps(t, true).includes("cut") && !closeSteps(t, true).includes("slide-down")))
  check("a close by Back gives no step back; every other close gives it back, last", !closeSteps("history").includes("step-back") && !closeSteps("browser-swipe").includes("step-back") && ["back", "escape", "pull", "edge"].every((t) => closeSteps(t as CloseTrigger).at(-1) === "step-back"))
  check("nothing moves after it is hidden", all.every((t) => !closeSteps(t).slice(closeSteps(t).indexOf("hide-page")).some((x) => x === "slide-down" || x === "recede")))
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("the source keeps that order: feed put back, the community set where the covered sheet leaves it, then down", pf.indexOf("feedRestore(noted.current") < pf.indexOf("st.set(from)") && pf.indexOf("st.set(from)") < pf.indexOf("st.run(from, 0"))
  check("hidden, then the community let go, then gone", /layer\.style\.visibility = "hidden"\s*st\?\.release\(\)\s*done\.current\.onGone\(\)/.test(pf))
  check("one surface: the post is drawn once, the sheet moves by translate, the community by scale and translate (page-sheet-stage.tsx)", /sheetStage\(page, backdropRef\.current, communityFrame\(\)\)/.test(pf) && !/cloneNode|cardBox|coverMorph|morphFrames/.test(pf))
  const stage = read("components/community/member/page-sheet-stage.tsx")
  check("the stage moves only translate, scale and opacity", !/(width|height|top|left|clip-path|filter):/.test(stage.slice(stage.indexOf("const parts = "), stage.indexOf("/* Every move stopped"))) && /translate: `0px \$\{f\.sheetY\}px`/.test(stage) && /scale: `\$\{f\.scale\}`/.test(stage))
  check("at rest the community carries nothing of ours (released once the sheet has arrived)", /if \(!closing\.current && !holding\.current && \(st\?\.at\(\) \?\? 1\) >= 1\) st\?\.release\(\)/.test(pf))
  check("the app's edge swipe and a pull drive the same p", /offset = edgeOffset\(edgeX, W\(\), H\(\)\)/.test(pf) && /stage\(\)\?\.set\(progressFromOffset\(offset, H\(\)\)\)/.test(pf))
}

console.log("\nPULL AND EDGE: when a finger closes it")
{
  check("a pull closes past a fifth of the page, between 80 and 140px", pullCloseDistance(788) === 140 && pullCloseDistance(500) === 100 && pullCloseDistance(300) === 80)
  check("let go far enough, it closes; short and slow, it springs back", pullVerdict({ dy: 150, velocity: 0, height: 788 }) === "close" && pullVerdict({ dy: 90, velocity: 0.2, height: 788 }) === "stay")
  check("a flick from a short pull closes; from almost nothing it does not", pullVerdict({ dy: 30, velocity: 0.9, height: 788 }) === "close" && pullVerdict({ dy: 6, velocity: 2, height: 788 }) === "stay")
  check("the edge swipe: a swipe across is a close all the way down, in proportion on the way", edgeOffset(390, 390, 844) === 844 && edgeOffset(195, 390, 844) === 422 && edgeOffset(-20, 390, 844) === 0 && edgeOffset(900, 390, 844) === 844)
  check("past a third of the width it closes; a short slow drag springs back", shouldComplete(150, 390, 0) && !shouldComplete(60, 390, 0.1))
  check("the dim follows the sheet", dimFor(0) === RECEDE_DIM && dimFor(1) === 0)
}

console.log("\nKEYBOARD: the comment box on the keys (images/76.jpg)")
{
  /* 76.jpg on a 390x844 screen: the keyboard's bar from about 464 (844 - 380), the box's foot at about 402: a pan of 62. */
  const pan = 62
  const round15 = { top: 0, height: 844 - 380 }
  check("76.jpg: round 15's box (top 0) under a 62px pan ends at 402 on the screen, 62 short of the bar", round15.top + round15.height - pan === 402)
  const app = postBox({ layoutH: 844, innerH: 844, vvTop: pan, vvH: 844, typing: true, publishedInset: 422, appKeyboard: iosKeyboardFor(390, 844) })
  check("now the page follows the pan: 62 to 526 in the page, so its foot is on the bar at 464 on the screen", app.source === "table" && app.top === 62 && app.height === 464 && app.top + app.height - pan === 464, app)
  const still = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, publishedInset: 422, appKeyboard: iosKeyboardFor(390, 844) })
  check("no pan: 0 to 464, as before", still.top === 0 && still.height === 464 && still.source === "table", still)
  const native = postBox({ layoutH: 852, innerH: 852, vvTop: 64, vvH: 852, typing: true, publishedInset: 426, appKeyboard: iosKeyboardFor(393, 852), nativeKeyboard: 390 })
  check("the app with the Keyboard plugin: its own height leads over the table (a 393x852 iPhone, 390 from keyboardWillShow)", native.source === "native" && native.top === 64 && native.height === 462 && native.top + native.height - 64 === 852 - 390, native)
  const under = postBox({ layoutH: 852, innerH: 852, vvTop: 64, vvH: 405, typing: true, publishedInset: 0, appKeyboard: 383, nativeKeyboard: null })
  check("a web view that reports a visual height less the pan: the app's keyboard height still leads, so the foot is still on the keys", under.source === "table" && under.top + under.height - 64 === 852 - 383, under)
  const safari = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 464, typing: true, publishedInset: 380, appKeyboard: null })
  check("Safari: the visual viewport's height", safari.source === "visual" && safari.top === 0 && safari.height === 464, safari)
  const safariPanned = postBox({ layoutH: 844, innerH: 844, vvTop: 120, vvH: 464, typing: true, publishedInset: 380, appKeyboard: null })
  check("Safari panned: its height AND its offsetTop", safariPanned.source === "visual" && safariPanned.top === 120 && safariPanned.height === 464, safariPanned)
  const floor = postBox({ layoutH: 700, innerH: 700, vvTop: 30, vvH: 700, typing: true, publishedInset: 350, appKeyboard: null })
  check("nothing reported and no table: the published floor, from the pan", floor.source === "floor" && floor.top === 30 && floor.height === 350, floor)
  const rest = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: false, publishedInset: 0, appKeyboard: null, nativeKeyboard: 0 })
  check("no keyboard: the whole screen down to the tab bar", rest.source === "screen" && rest.aboveTabs, rest)
  check("a keyboard height the plugin left at 0 (down) is not used", postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, publishedInset: 0, appKeyboard: 380, nativeKeyboard: 0 }).source === "table")

  /* THE BLOCK: the box's own solid shadow, offset down by its spread, so it starts at the box's top edge and runs on. */
  const cm = read("components/community/member/comments.tsx")
  const block = /export const KEYBOARD_BLOCK = "\[\[data-typing\]_&\]:shadow-\[0_-1px_0_#eef0f2,0_(\d+)lvh_0_(\d+)lvh_#fff\]"/.exec(cm)
  check("THE BLOCK is white, solid (no blur), only while typing", !!block)
  if (block) {
    const offset = Number(block[1])
    const spread = Number(block[2])
    check("it starts exactly at the box's top edge (offset equals spread)", offset === spread)
    /* For any box on the screen, the block's foot is its top + its height + offset + spread: past the screen's foot. */
    const covers = (screenH: number, boxTop: number, boxH: number) => boxTop + boxH + ((offset + spread) * screenH) / 100 >= screenH
    check("it always runs from the box down past the bottom of the screen, wherever the box is", [[844, 0, 60], [844, 380, 90], [956, 100, 80], [667, 600, 60]].every(([h, t, b]) => covers(h, t, b)))
  }
  check("the floating box carries it and is lifted over the post's content while typed in", /`sticky bottom-0 z-\[3\] -mx-4 mt-auto px-3 pt-3 \[\[data-typing\]_&\]:z-\[8\] \[\[data-typing\]_&\]:bg-white \[\[data-typing\]_&\]:pt-2 \$\{KEYBOARD_BLOCK\}/.test(cm))
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("under the page the white skirt carries it on past the screen's foot", /absolute inset-x-0 top-full h-\[100lvh\] bg-white/.test(pf) && /data-post-skirt/.test(pf))
  const vb = read("components/community/member/visible-box.ts")
  check("the box is read from visualViewport's height and offsetTop, and the plugin's height while typing", /vvH: Math\.round\(vv\?\.height \?\? window\.innerHeight\), vvTop: Math\.round\(vv\?\.offsetTop \?\? 0\)/.test(vb) && /nativeKeyboard: typing \? native : null/.test(vb) && /watchNativeKeyboard\(run\)/.test(vb))
  const nk = read("components/community/member/native-keyboard.ts")
  check("the plugin is reached by name and only where this build has it", /registerPlugin<KeyboardPlugin>\("Keyboard"\)/.test(nk) && /Capacitor\.isPluginAvailable\("Keyboard"\)/.test(nk) && /addListener\("keyboardWillShow"/.test(nk))
  const cap = read("capacitor.config.ts")
  check("capacitor.config.ts: a Keyboard section with resize 'none' (no other screen changes)", /Keyboard: \{\s*resize: 'none',\s*\}/.test(cap))
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> }
  check("@capacitor/keyboard is a dependency, on Capacitor 8 like the rest", /^\^?8\./.test(pkg.dependencies["@capacitor/keyboard"] ?? ""))
  check("and the lockfile has it (a frozen install does not fail)", /'@capacitor\/keyboard':\s*\n\s*specifier: \^8/.test(read("pnpm-lock.yaml")))
  check("?kbdebug=1: a readout of innerHeight, visualViewport's height and offsetTop, the scroll, the box's rect and the measurement used", /searchParams|URLSearchParams\(window\.location\.search\)\.get\("kbdebug"\)/.test(pf) && /`used \$\{box\.source\}/.test(pf) && /innerHeight \$\{facts\.innerH\}/.test(pf) && /vv\.height \$\{facts\.vvH\}  vv\.offsetTop \$\{facts\.vvTop\}/.test(pf) && /scrollY \$\{facts\.scrollY\}/.test(pf) && /comment box top/.test(pf) && /data-kbdebug=""/.test(pf))
  check("hidden unless asked for, and only while typing", /hidden aria-hidden/.test(pf) && /const on = typing && kbDebugOn\(\)/.test(pf))
}

console.log("\nCOMPOSER: the same sheet, up and down")
{
  const c = read("components/community/member/composer.tsx")
  check("it rises and goes on the page sheet", /void st\.run\(0, 1, SHEET_UP_MS\)/.test(c) && /void st\.run\(from, 0, SHEET_DOWN_MS, \{ hold: true \}\)/.test(c))
  check("on the way down its inside is frozen where it stood before the caret is let go (nothing jumps as the keyboard goes)", c.indexOf('vis.setAttribute("data-frozen", "")') > 0 && c.indexOf('vis.setAttribute("data-frozen", "")') < c.indexOf("active.blur()") && /if \(frozen\(\)\) return/.test(c))
  check("the feed is put back under it before it moves", c.indexOf("feedRestore(notedScroll.current") < c.indexOf("void st.run(from, 0"))
  check("the document's overflow is never switched off (iOS restyled the page in the close's last frame)", !/html\.style\.overflow = "hidden"/.test(c) && /html\.style\.overscrollBehavior = "none"/.test(c))
  check("the community is let go of at the move's last frame", /const end = \(\) => \{\s*leaving\.current = false[\s\S]{0,140}sheetStageRef\.current\?\.release\(\)/.test(c))
  check("the tab bar's layer is kept (counted while the screen is up)", /useLayer\("composer", sheet, sheetRef\)/.test(c))
}

console.log(`\n  ${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
