/**
 * ===========================================================================
 *  ROUND 15: THE OPENED POST, THE COMPOSER, COMMENTS (worker O)
 * ===========================================================================
 * Held from their inputs (components/community/member/post-motion.ts,
 * lib/communities/client/compose-intent.ts and open-post.ts) and, where the
 * rule is about how a file is written, from its source:
 *
 *   CLOSE       the order of a close: the feed first, one move, hidden on
 *               its last frame, then let go; a Back gives no step back, a
 *               Back the browser drew is not moved again
 *   PULL        follows the finger down, gives on a rubber band up, closes
 *               past a fifth of the page or on a flick
 *   EDGE        the app's edge swipe closes on the app's own rule
 *   KEYBOARD    the page is the visible screen: the visual viewport, the
 *               iPhone's own keyboard in the app, the floor otherwise; the
 *               tab bar's room only with no keyboard
 *   BACK        the back button's tap is 48px or more, from the screen's edge
 *   COMPOSE     requestCompose reaches the composer on screen, or waits for
 *               the next one a moment
 *   OPEN POST   openPost reaches whoever can open it, or the post's page
 *   SOURCE      the push moves translate only, never lands on the card, keeps
 *               the tab bar, has the white skirt and the back bar inside it
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  BACK_CIRCLE,
  BACK_HIT,
  BAR_PX,
  DIM,
  closeSteps,
  closedByBrowserSwipe,
  dimFor,
  feedRestore,
  iosKeyboardFor,
  postBox,
  postBoxHeightCss,
  pullCloseDistance,
  pullOffset,
  pullVerdict,
  shouldComplete,
  type CloseTrigger,
} from "@/components/community/member/post-motion"
import { PENDING_MS, addComposeHandler, requestCompose, resetComposeIntent, takePending } from "@/lib/communities/client/compose-intent"
import { addOpenPostHandler, openPost, postFallbackHref, resetOpenPost, slugFromPath } from "@/lib/communities/client/open-post"

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

console.log("\nCLOSE: the order of operations")
{
  const all: CloseTrigger[] = ["back", "escape", "history", "browser-swipe", "pull", "edge"]
  for (const t of all) {
    const s = closeSteps(t)
    /* Round 16: the page sheet. Every close is the same move down; the community is eased back, unseen, before it. */
    const move = s.findIndex((x) => x === "slide-down" || x === "cut")
    const hide = s.indexOf("hide-page")
    check(
      `${t}: the feed is put back first, then one move, hidden on its last frame, then let go and taken out`,
      s[0] === "hold-feed" && move > 0 && hide === move + 1 && s.indexOf("release-layer") > hide && s.indexOf("unmount") > s.indexOf("release-layer") && s.filter((x) => x === "slide-down" || x === "cut").length === 1,
      s,
    )
    check(`${t}: nothing moves after it is hidden`, !s.slice(hide).some((x) => x === "slide-down" || x === "recede"), s)
  }
  check("round 16: Back, Escape, the browser's Back, a pull and the edge swipe all slide it down (one line in and out)", ["back", "escape", "edge", "history", "pull"].every((t) => closeSteps(t as CloseTrigger).includes("slide-down")))
  check("a Back the browser drew itself is not moved a second time", closeSteps("browser-swipe")[1] === "cut")
  check("reduced motion: no move at all", all.every((t) => closeSteps(t, true)[1] === "cut"))
  check("a close by Back gives no step back (the browser took it); any other close gives it back, last", !closeSteps("history").includes("step-back") && !closeSteps("browser-swipe").includes("step-back") && ["back", "escape", "pull", "edge"].every((t) => closeSteps(t as CloseTrigger).at(-1) === "step-back"))
  check("a popstate soon after a touch at the left edge is the browser's own swipe, outside the app only", closedByBrowserSwipe(300, false) && !closedByBrowserSwipe(300, true) && !closedByBrowserSwipe(5000, false) && !closedByBrowserSwipe(-1, false))
  check("the feed is put back only when it moved", feedRestore(320, 320) === null && feedRestore(320, 307) === 320 && feedRestore(0, 0.4) === null)
}

console.log("\nPULL DOWN TO CLOSE")
{
  check("it follows the finger down, one to one", pullOffset(0) === 0 && pullOffset(37) === 37 && pullOffset(300) === 300)
  check("up, it gives on a rubber band, less and less", pullOffset(-20) < 0 && pullOffset(-20) > -20 && pullOffset(-200) > -48 && pullOffset(-200) < pullOffset(-60))
  check("it closes past a fifth of the page, never more than 140px", pullCloseDistance(788) === 140 && pullCloseDistance(500) === 100 && pullCloseDistance(300) === 80)
  check("let go far enough, it closes", pullVerdict({ dy: 150, velocity: 0, height: 788 }) === "close")
  check("let go short and slow, it springs back", pullVerdict({ dy: 90, velocity: 0.2, height: 788 }) === "stay")
  check("a flick down closes from a short pull", pullVerdict({ dy: 30, velocity: 0.9, height: 788 }) === "close")
  check("but a flick from almost nothing does not", pullVerdict({ dy: 6, velocity: 2, height: 788 }) === "stay")
  check("the dim lifts as it goes", dimFor(0) === DIM && dimFor(0.5) === DIM / 2 && dimFor(1) === 0 && dimFor(2) === 0)
}

console.log("\nEDGE SWIPE (the app on iOS)")
{
  check("past a third of the width it closes", shouldComplete(150, 390, 0))
  check("a short slow drag springs back", !shouldComplete(60, 390, 0.1))
  check("a flick closes from a short drag", shouldComplete(40, 390, 0.8))
  check("a drag that turned back does not", !shouldComplete(200, 390, -0.5))
}

console.log("\nKEYBOARD: the page is the visible screen")
{
  /* iPhone Safari, keyboard up: the visual viewport says so (844 tall, 464 visible, panned by 0). */
  const safari = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 464, typing: true, publishedInset: 380, appKeyboard: null })
  check("Safari: the visual viewport, and the tab bar's room is not taken off", safari.source === "visual" && safari.top === 0 && safari.height === 464 && !safari.aboveTabs, safari)
  /* Safari after iOS panned the page to show the field: the visible part starts lower. */
  const panned = postBox({ layoutH: 844, innerH: 464, vvTop: 380, vvH: 464, typing: true, publishedInset: 380, appKeyboard: null })
  check("Safari panned: the page follows the visible part down", panned.source === "visual" && panned.top === 380 && panned.height === 464, panned)
  /* The iOS app: WKWebView says nothing, the floor is half the screen (422), the owner's iPhone's keyboard with its bar is 380 (images/73.webp). */
  const app = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, publishedInset: 422, appKeyboard: iosKeyboardFor(390, 844) })
  check("the iOS app: the iPhone's own keyboard, so the box's foot is at 464px, on the keyboard's bar (the floor put it at 422)", app.source === "table" && app.top === 0 && app.height === 464, app)
  const unknown = postBox({ layoutH: 700, innerH: 700, vvTop: 0, vvH: 700, typing: true, publishedInset: 350, appKeyboard: iosKeyboardFor(320, 700) })
  check("an iPhone screen not in the table: the published floor", unknown.source === "floor" && unknown.height === 350, unknown)
  /* The Android app: the web view itself shrinks, nothing is reported. */
  const android = postBox({ layoutH: 520, innerH: 520, vvTop: 0, vvH: 520, typing: true, publishedInset: 0, appKeyboard: null })
  check("the Android app (a web view that shrinks): all of it is visible", android.source === "visual" && android.height === 520 && !android.aboveTabs, android)
  const rest = postBox({ layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: false, publishedInset: 0, appKeyboard: null })
  check("no keyboard: the whole screen down to the tab bar", rest.source === "screen" && rest.aboveTabs && postBoxHeightCss(rest) === "calc(844px - var(--buyer-tabs-h, 0px))", rest)
  check("with a keyboard the height is the number alone", postBoxHeightCss(app) === "464px")
  check("the iPhone keyboards known are a sensible size (a third to a half of the screen)", [[375, 667], [390, 844], [402, 874], [440, 956]].every(([w, h]) => { const k = iosKeyboardFor(w, h)!; return k > h * 0.33 && k < h * 0.5 }))
  check("landscape, or a tablet: not guessed", iosKeyboardFor(844, 390) === null && iosKeyboardFor(820, 1180) === null)
}

console.log("\nBACK: a tap that cannot be missed")
{
  check("48px or more each way, from the screen's left edge, the bar's whole height", BACK_HIT.width >= 48 && BACK_HIT.height >= 48 && BACK_HIT.left === 0 && BACK_HIT.height === BAR_PX)
  check("the circle drawn stays 40px inside it", BACK_CIRCLE === 40 && BACK_HIT.width > BACK_CIRCLE)
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("the button is sized by BACK_HIT and sits at left 0", /style=\{\{ width: BACK_HIT\.width, height: BACK_HIT\.height \}\}/.test(pf) && /absolute left-0 top-0/.test(pf))
}

console.log("\nCOMPOSE: Create post, asked for from anywhere")
{
  resetComposeIntent()
  const seen: string[] = []
  const off1 = addComposeHandler((r) => {
    seen.push(`first:${r.spaceSlug ?? ""}`)
    return true
  })
  check("a composer on screen takes it", requestCompose() === true && seen.join() === "first:")
  const off2 = addComposeHandler((r) => {
    seen.push(`second:${r.spaceSlug ?? ""}`)
    return r.spaceSlug !== "announcements"
  })
  seen.length = 0
  check("the newest is asked first", requestCompose({ spaceSlug: "general" }) === true && seen.join() === "second:general")
  seen.length = 0
  check("one that cannot post there passes it on", requestCompose({ spaceSlug: "announcements" }) === true && seen.join() === "second:announcements,first:announcements")
  off1()
  off2()
  seen.length = 0
  check("nobody on screen: it waits", requestCompose({ spaceSlug: "general" }) === false)
  const off3 = addComposeHandler((r) => {
    seen.push(`late:${r.spaceSlug}`)
    return true
  })
  check("the composer that mounts next takes it at once", seen.join() === "late:general")
  check("and it is taken once", takePending() === null)
  off3()
  requestCompose()
  check(`a request older than ${PENDING_MS}ms is dropped`, takePending(performance.now() + PENDING_MS + 1) === null)
  resetComposeIntent()
}

console.log("\nOPEN POST: from anywhere in a community")
{
  resetOpenPost()
  check("the slug from a community address", slugFromPath("/community/bandido/space/general") === "bandido" && slugFromPath("/community/bandido") === "bandido" && slugFromPath("/explore") === null)
  check("the post's page when nobody on screen can open it", postFallbackHref("/community/bandido/learn", "p 1") === "/community/bandido/post/p%201" && postFallbackHref("/explore", "x") === null)
  const asked: string[] = []
  const offA = addOpenPostHandler((r) => {
    asked.push(`a:${r.postId}`)
    return r.postId === "p-a"
  })
  const offB = addOpenPostHandler((r) => {
    asked.push(`b:${r.postId}`)
    return r.postId === "p-b"
  })
  check("the newest handler is asked first and the one that has it opens it", openPost("p-a") === true && asked.join() === "b:p-a,a:p-a")
  offA()
  offB()
  resetOpenPost()
}

console.log("\nSOURCE: the sheet (round 16; round 15's push from the right is replaced, tests/communities-post16.test.ts)")
{
  const pf = read("components/community/member/post-fullscreen.tsx")
  const ov = read("components/community/member/post-overlay.tsx")
  check("it never lands on the card: no card box, no morph, no reveal", !/cardBox|coverMorph|revealForReturn|morphFrames/.test(pf))
  check("the tab bar stays over it (a 'post' layer)", /useLayer\("post", true, layerRef\)/.test(pf) && /data-layer-kind="post"/.test(pf))
  /* Round 17: the close is post-stage.ts's container move (st.close), still after the feed is put back. */
  check("the close puts the feed back before it moves", pf.indexOf("feedRestore(noted.current") > 0 && pf.indexOf("feedRestore(noted.current") < pf.indexOf("st.close("))
  check("hidden on the move's last frame, then taken out", /layer\.style\.visibility = "hidden"[\s\S]{0,80}done\.current\.onGone\(\)/.test(pf))
  check("a white skirt runs on under the page", /data-post-skirt/.test(pf) && /top-full h-\[100lvh\] bg-white/.test(pf))
  check("the back bar is inside the page, so it moves with it (never a second header over the community's)", pf.indexOf("data-post-fullscreen-top") > pf.indexOf('role="dialog"') && pf.indexOf("data-post-fullscreen-top") < pf.indexOf("</div>,\n    document.body"))
  const vb = read("components/community/member/visible-box.ts")
  /* Round 17: the plan (keyboard-plan.ts) in place of postBox, the page never shortened; the same moments. */
  check("the page's room is set from the keyboard plan on the first frame and on every viewport change (visible-box.ts)", /useKeyboardPlan\(\s*true,\s*\(\) => pageRef\.current/.test(pf) && /useLayoutEffect\(\(\) => \{\s*if \(!active\) return/.test(vb) && /vv\?\.addEventListener\("scroll", onViewport\)/.test(vb) && /KEYBOARD_CHANGE_EVENT, onViewport/.test(vb) && /const plan = keyboardPlan\(env, facts\)/.test(vb))
  check("on a phone the comments are drawn inside the moving page, with no fade", /setDrawComments\(true\)/.test(ov) && /fadeIn=\{!withPage\}/.test(ov))
  const cm = read("components/community/member/comments.tsx")
  check("the comment box stands on white while it is typed in", /\[\[data-typing\]_&\]:bg-white/.test(cm))
  check("the post page's dock stands on the keyboard while typed in (its white to the foot, its content lifted), with a white skirt", /useKeyboardPlan\(\s*dockPhone,/.test(cm) && /if \(plan\.foot === "tabs"\) \{\s*dock\.style\.bottom = COMMENT_COMPOSER_DOCK_BOTTOM/.test(cm) && /dock\.style\.bottom = "0px"/.test(cm) && /data-comments-dock-skirt/.test(cm))
  check("the post page's back reaches the screen's edge on a phone, 48px tall", /max-sm:-ml-3 max-sm:h-12 max-sm:min-w-\[64px\]/.test(read("components/community/member/post-page.tsx")))
  check("more comments rise in one by one with the page's anchoring held, nothing above them moving", /for \(const c of next\) landing\.current\.set\(c\.id, "live"\)\s*holdAnchor\(LAND_MS \+ 200\)/.test(cm))
  check("a comment's face keeps its room from the first frame", /data-comment-face=""/.test(cm) && /\$\{small \? "h-7 w-7" : "h-8 w-8"\}`\} data-person-link/.test(cm))
}

console.log("\nSOURCE: the composer")
{
  const c = read("components/community/member/composer.tsx")
  check("its phone screen is a counted 'composer' layer for exactly as long as it is drawn", /useLayer\("composer", sheet, sheetRef\)/.test(c))
  check("it answers Create post (requestCompose), never as Edit post, and in the space asked for", /useComposeRequests\(\(req\) => \{\s*if \(editing \|\| leaving\.current\) return false/.test(c) && /spaces\.find\(\(s\) => s\.slug === req\.spaceSlug\)/.test(c))
  check("the tap draws the screen's frame; its fields are drawn on the next frame, while it slides", /fill = requestAnimationFrame\(\(\) => setFilled\(true\)\)/.test(c) && /\{filled \? \(/.test(c))
  check("the toolbar's room is kept while the fields are on their way", /\{filled \? tools : <div className="h-10" aria-hidden \/>\}/.test(c))
  check("a nudge for a missing space or poll looks on the phone's screen too", /\(sheetRef\.current \?\? cardRef\.current\)\?\.querySelector<HTMLButtonElement>\("button\[data-composer-space\]"\)/.test(c))
  check("the spaces it is handed carry their slug (feed.tsx)", /slug: s\.slug, kind: s\.kind/.test(read("components/community/member/feed.tsx")))
}

console.log("\nSOURCE: Save, the viewer, a card answering openPost")
{
  const sb = read("components/community/member/save-button.tsx")
  check("Save and Saved share one cell, so the button never changes width", /<span className="grid" aria-hidden>[\s\S]{0,200}>Save<\/span>[\s\S]{0,200}>Saved<\/span>/.test(sb))
  check("the bookmark's two faces crossfade in one cell", (sb.match(/col-start-1 row-start-1 h-\[18px\] w-\[18px\]/g) ?? []).length === 2)
  check("only a press that saves settles the icon (not the first draw, not the server's answer)", /if \(!pressed\.current\) return/.test(sb) && /if \(!on \|\| !el/.test(sb))
  const pc = read("components/community/member/post-card.tsx")
  check("the opened post uses it", /import \{ SaveButton \} from "\.\/save-button"/.test(pc) && !/function SaveButton/.test(pc))
  /* Round 16: by its id or the short id a post's address carries (open-post.ts requestNames). */
  check("a card on screen answers openPost for its own post", /useOpenPostRequests\(\(r\) => \{\s*if \(full \|\| editing \|\| !requestNames\(r, post\.id\)\) return false/.test(pc))
  check("the picture viewer is a counted 'viewer' layer", /useLayer\("viewer", true, rootRef\)/.test(read("components/community/member/lightbox.tsx")))
}

console.log(`\n  ${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
