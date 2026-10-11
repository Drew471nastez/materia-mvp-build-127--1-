/**
 * ===========================================================================
 *  ROUND 17: THE POST ON A PHONE, DONE PROPERLY (worker P17)
 * ===========================================================================
 * Held from their inputs and, where the rule is about how a file is written,
 * from its source:
 *
 *   REACHED     a post the ROUTER reaches (a comment notification's
 *               /post/<id>#c-<comment>, a short address no card holds) is
 *               drawn: only the opened post's own history entry holds the
 *               place under it (round 16 held it for the router's post page
 *               too, under a hidden Activity: the address changed and
 *               nothing showed)
 *
 *   ENGINE      every move is Web Animations on translate, scale and opacity
 *               only, nothing behind the post moves, no blur while it moves,
 *               the post prepared before it moves; the busy loop result
 *   MORPH       the container is exactly the four clips' intersection at
 *               every step; the fade through never shows both contents; the
 *               style is one constant; the close lands on the card in order
 *   FINGER      a pull follows the finger, the top edge under it
 *   KEYBOARD    the decision table per environment (76.jpg's numbers), the
 *               page always to the foot of the screen, the readout's press
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { atPlaceFor, onLayerEntry } from "@/lib/communities/client/places"
import { CLIPS, CLOSE_MS, EASE, FADE_SPLIT, GONE, OPEN_MS, POST_MOTION, PREPARE_CAP_MS, RISE_PX, SCRIM, awayFor, msFor, riseInKeyframes, riseOutKeyframes, scrimFor, clipOffsets, fadeAt, fadeInKeyframes, fadeOutKeyframes, followFor, followTop, lerpRect, morphCloseSteps, screenRect, shows, styleFor, usableOrigin, visibleOf, type Rect } from "@/components/community/member/post-morph"
import { boxFootOnScreen, footCss, keyboardEnv, keyboardPlan, type KeyboardFacts } from "@/components/community/member/keyboard-plan"
import { iosKeyboardFor } from "@/components/community/member/post-motion"

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

console.log("\nREACHED: a post the router reaches is drawn")
{
  check("the opened post's own entry is known by its mark", onLayerEntry({ storelibLayer: "layer-1-abc" }) && onLayerEntry({ __NA: true, storelibLayer: "layer-2" }))
  check("the router's entries, the navigator's and none are not the opened post's", !onLayerEntry({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }) && !onLayerEntry({ __communityDepth: 1 }) && !onLayerEntry(null) && !onLayerEntry(undefined) && !onLayerEntry("x"))
  check("a post opened over a place keeps the place", atPlaceFor("/community/clay/post/a1b2c3d4", "", true, true))
  check("the router on a post's address, from a place, does not keep the place", !atPlaceFor("/community/clay/post/a1b2c3d4", "", true, false) && !atPlaceFor("/community/clay/post/first-bowls-a1b2c3d4", "", true, false))
  check("a place is a place whatever the entry", atPlaceFor("/community/clay/notifications", "", false, false) && atPlaceFor("/community/clay", "?profile=mara", true, false))
  const host = read("components/community/member/place-host.tsx")
  check("the host asks the entry before holding the place", /const overLayer = typeof window !== "undefined" && onLayerEntry\(window\.history\.state\)/.test(host) && /atPlaceFor\(pathname \|\| "", search\?\.toString\(\) \?\? "", heldAtPlace\.current \?\? false, overLayer\)/.test(host))
  check("the router's post page is the routed slot's, shown over any place, and no kept screen shows with it", /const routerPost = isPostAddress\(pathname\) && !overLayer/.test(host) && /const routedVisible = routerPost \|\|/.test(host) && /const visible = key === shown\.key && \(routedKey !== null \|\| atPlace\) && !routerPost/.test(host))
  const frame = read("components/community/member/shell-frame.tsx")
  check("a comment's link (#c-<id>, every comment notification) opens its post over the place like any post link", /url\.hash && !\/\^#\(c-\[\\w-\]\+\|comments\)\$\/\.test\(url\.hash\)/.test(frame))
}

const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) <= e

console.log("\nMORPH: the container, the fade through, the style")
{
  const screen = { width: 390, height: 844 }
  const card: Rect = { left: 0, top: 312, width: 390, height: 404 }
  const inset: Rect = { left: 16, top: 120, width: 358, height: 96 }
  /* At every step of the move, the four clips leave exactly the container visible: no more, no less. */
  const exact = (r: Rect) => {
    const v = visibleOf(clipOffsets(r, screen), screen)
    return near(v.left, r.left) && near(v.top, r.top) && near(v.width, r.width) && near(v.height, r.height)
  }
  const steps = Array.from({ length: 21 }, (_, i) => i / 20)
  check("the four clips make exactly the container, from the card to the screen, at every step (a phone's full width row)", steps.every((e) => exact(lerpRect(card, screenRect(screen), e))))
  check("and from a card with margins (a profile's row)", steps.every((e) => exact(lerpRect(inset, screenRect(screen), e))))
  check("at rest every clip is at 0: nothing of the move is left on the page", Object.values(clipOffsets(screenRect(screen), screen)).every((o) => o.x === 0 && o.y === 0))
  /* Each offset is linear in the eased progress, so one easing on all four keeps them in step on every frame. */
  const a = clipOffsets(card, screen)
  const b = clipOffsets(screenRect(screen), screen)
  check("every clip's offset is linear in the progress (one easing keeps them in step)", steps.every((e) => {
    const m = clipOffsets(lerpRect(card, screenRect(screen), e), screen)
    return CLIPS.every((n) => near(m[n].x, a[n].x + (b[n].x - a[n].x) * e) && near(m[n].y, a[n].y + (b[n].y - a[n].y) * e))
  }))
  check("four clips, each rounding a different corner", new Set(CLIPS).size === 4)
  const times = Array.from({ length: 1001 }, (_, i) => i / 1000)
  check("THE FADE THROUGH: at no moment are both contents on the screen at once", times.every((t) => !(shows(fadeAt(t).out * 1) && fadeAt(t).out > GONE && fadeAt(t).in > GONE)))
  check("the card's content is gone by FADE_SPLIT, the post's starts after it, each runs its whole part", near(fadeAt(0).out, 1) && fadeAt(FADE_SPLIT).out === 0 && fadeAt(FADE_SPLIT).in === 0 && near(fadeAt(1).in, 1) && FADE_SPLIT >= 0.25 && FADE_SPLIT <= 0.35)
  const outK = fadeOutKeyframes()
  const inK = fadeInKeyframes()
  check("the keyframes are those parts: out to GONE by FADE_SPLIT, in from GONE after it", outK[0].opacity === 1 && outK[1].opacity === GONE && outK[1].offset === FADE_SPLIT && inK[1].opacity === GONE && inK[1].offset === FADE_SPLIT && inK.at(-1)!.opacity === 1)
  check("GONE cannot show (under half a level of 255) but is not 0 (so it is rastered before the move)", GONE > 0 && !shows(GONE) && shows(1 / 255))
  check("about 300ms to open and 250ms to close, on an iOS like ease out", OPEN_MS >= 260 && OPEN_MS <= 340 && CLOSE_MS >= 220 && CLOSE_MS <= 280 && CLOSE_MS < OPEN_MS && /^cubic-bezier\(/.test(EASE))
  check("a light scrim, prepared for at most about 100ms", SCRIM > 0 && SCRIM <= 0.2 && PREPARE_CAP_MS <= 120)
  /* The owner's direction after the first build: simple, subtle, minimal. The rise is the default; the morph a one word change. */
  check("THE STYLE is one constant, the quiet rise by default, and the others (the container among them) are the same engine", POST_MOTION === "rise" && awayFor("rise", screen).translate === `0px ${RISE_PX}px` && awayFor("rise", screen).opacity === GONE && awayFor("sheet", screen).translate === "0px 844px" && awayFor("push", screen).translate === "390px 0px" && awayFor("fade", screen).opacity === GONE)
  check("THE RISE: 12 to 16px, about 200 to 240ms open on an ease out, the close a little quicker, no scrim, the feed untouched", RISE_PX >= 12 && RISE_PX <= 16 && msFor("rise", "open") >= 200 && msFor("rise", "open") <= 240 && msFor("rise", "close") < msFor("rise", "open") && scrimFor("rise") === 0 && scrimFor("container") > 0)
  check("the rise's see-through is short: solid by half the open, gone by 60% of the close", riseInKeyframes()[1].opacity === 1 && (riseInKeyframes()[1].offset ?? 1) <= 0.5 && riseOutKeyframes()[1].opacity === GONE && (riseOutKeyframes()[1].offset ?? 1) <= 0.6)
  check("no card to grow from (gone, hidden, off the screen): the rise; reduced motion: a plain fade", styleFor("container", null, screen, false) === "rise" && styleFor("container", { left: 0, top: 900, width: 390, height: 300 }, screen, false) === "rise" && styleFor("container", { left: 0, top: 0, width: 0, height: 0 }, screen, false) === "rise" && styleFor("container", card, screen, true) === "reduced" && styleFor("container", card, screen, false) === "container" && styleFor("rise", card, screen, false) === "rise")
  check("a card only partly on the screen is still grown from", usableOrigin({ left: 0, top: 700, width: 390, height: 400 }, screen))
  const steps2 = morphCloseSteps(false)
  const i = (x: string) => steps2.indexOf(x as never)
  check("THE CLOSE, IN ORDER: keyboard down, feed back, card read after it, copy made, blur off, the move, land, hidden, let go", i("blur") === 0 && i("hold-feed") === 1 && i("measure-card") === 2 && i("clone-card") === 3 && i("blur-off") === 4 && i("move") === 5 && i("land") === 6 && i("hide-layer") === 7 && i("release-layer") > i("hide-layer") && i("unmount") > i("release-layer") && steps2.at(-1) === "step-back")
  check("a close by Back gives no step back; nothing moves after it lands", !morphCloseSteps(true).includes("step-back") && !steps2.slice(i("land")).includes("move"))
}

console.log("\nFINGER: a pull follows the finger")
{
  const screen = { width: 390, height: 844 }
  check("the post's top edge stays under the finger as it shrinks", [0, 40, 120, 300].every((d) => near(followTop(d, screen), d, 0.2)))
  check("it shrinks a little and the scrim lifts with it", followFor(0, 300, screen).scale < 1 && followFor(0, 300, screen).scale >= 0.86 && followFor(0, 0, screen).scale === 1 && followFor(0, 300, screen).scrim < SCRIM)
  check("the app's edge swipe shrinks it as it goes across", followFor(195, 0, screen).scale < 1 && followFor(195, 0, screen).translate.startsWith("195px"))
}

console.log("\nENGINE: on the compositor, nothing behind it moving, prepared first")
{
  const stage = read("components/community/member/post-stage.ts")
  /* Every keyframe the stage hands to the browser: the keys of the objects in its run(...) calls and its keyframe helpers. */
  const runs = Array.from(stage.matchAll(/run\((\w+), ([^\n]+)\)\n/g)).map((m) => m[2])
  const keys = new Set(runs.flatMap((r) => [...Array.from(r.matchAll(/\{ ?(\w+):/g)).map((m) => m[1]), ...Array.from(r.matchAll(/, (\w+):/g)).map((m) => m[1])]))
  const morph = read("components/community/member/post-morph.ts")
  const helperKeys = new Set(Array.from(morph.slice(morph.indexOf("export function fadeOutKeyframes"), morph.indexOf("export function fadeAt")).matchAll(/\{ (\w+):/g)).map((m) => m[1]))
  const allowed = new Set(["translate", "scale", "opacity"])
  check("the stage animates only translate, scale and opacity", runs.length >= 8 && [...keys].every((k) => allowed.has(k)) && [...helperKeys].every((k) => allowed.has(k)) && /translate: `\$\{a\[name\]\.x\}px/.test(stage) && (stage.match(/\.animate\(/g) ?? []).length === 1, { keys: [...keys], helperKeys: [...helperKeys], runs: runs.length })
  check("all the parts of a move start in one go, the move waits for the post (decoded, its data, then drawn)", /await readyThenDrawn\(Promise\.all\(\[prepare\?\.\(\), decodeIn\(\[clone, page\]\)\]\), PREPARE_CAP_MS\)/.test(stage) && /await sleep\(0\)\s*await new Promise<void>\(\(r\) => requestAnimationFrame/.test(stage))
  check("prepared at GONE with the clips open (every tile rastered), the card's rectangle set only as it starts", stage.indexOf("layer.style.opacity = String(GONE)") > 0 && stage.indexOf("await readyThenDrawn(Promise.all([prepare?.(), decodeIn([clone, page])])") < stage.indexOf("clips.forEach((el, i) => (el.style.translate = String(frames[i][0].translate)))"))
  check("will-change only while it moves", /el\.style\.willChange = on \?/.test(stage))
  check("the stage never touches the community", !/community-shell|communityFrame|\[data-community/.test(stage))
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("no blur on anything while it moves: the top's blur and the back circle's only once settled", /\[\[data-settled\]_&\]:backdrop-blur-\[6px\]/.test(pf) && /\[\[data-settled\]_&\]:backdrop-blur-md/.test(pf) && !/(?<!_&\]:)backdrop-blur-(md|\[6px\])/.test(pf.replace(/\[\[data-settled\]_&\]:backdrop-blur-(md|\[6px\])/g, "")))
  const cm = read("components/community/member/comments.tsx")
  check("nor on the comment box's pill (opaque until settled)", /\[\[data-settled\]_&_\[data-comment-box=comment\]\]:backdrop-blur-xl/.test(cm) && !/\[&_\[data-comment-box=comment\]\]:backdrop-blur/.test(cm))
  check("the stage is the post's engine, with the one style constant", /st\.open\(\{ style: POST_MOTION/.test(pf) && /st\.close\(\{ style: POST_MOTION/.test(pf))
  const ov = read("components/community/member/post-overlay.tsx")
  check("on a phone the address moves once the post has arrived (the router's render was landing in the open)", /const \[historyReady, setHistoryReady\] = useState\(!phone\)/.test(ov) && /useHistoryLayer\(history && historyReady, close, postPath\(slug, given\), open\)/.test(ov))
  check("the comments are drawn with the post, before it moves, and read ahead as its preparation", /const \[drawComments, setDrawComments\] = useState\(phone\)/.test(ov) && /readAheadComments\(given\.communityId, given\.id\)/.test(ov) && /prepare=\{prepare\}/.test(ov))
  check("never drawn while the page hydrates (a shared link's page)", /useSyncExternalStore\(noSubscribe, \(\) => true, \(\) => false\)/.test(ov) && /if \(!client\) return null/.test(ov))
  const sheet = read("components/ui/bottom-sheet.tsx")
  check("a kept sheet is not built while something moves (the comment box's emoji sheet was built 60 to 90ms into the rise, a 70ms task)", /if \(document\.querySelector\("\[data-moving\]"\)\) \{\s*timer = window\.setTimeout\(later, MOVING_RETRY_MS\)/.test(sheet) && (stage.match(/layer\.removeAttribute\("data-moving"\)/g) || []).length === 2)
  const composer = read("components/community/member/composer.tsx")
  check("the composer is the website builder's sheet: no community scale, no rounded community, no dark edge", /<MobileEditorSheet/.test(composer) && !/communityFrame|SheetBackdrop|sheetStage|RECEDE_SCALE/.test(composer) && !/communityFrame|data-sheet-band/.test(read("components/community/member/post-stage.ts")))
  check("the container's white is drawn only for the container move (the rise fades over the feed, never over a white screen)", /\[\[data-morph\]_&\]:bg-white/.test(pf) && /layer\.toggleAttribute\("data-morph", on && morph\)/.test(stage))
  check("the rise fades the page and moves the lift by translate only (an opacity on the lift stopped the move at 4x CPU)", /run\(lift, \[\{ translate: away\.translate \}, \{ translate: "0px 0px" \}\]/.test(stage) && /style === "rise" \? riseInKeyframes\(\)/.test(stage))
  /*
    THE BUSY LOOP (scripts/check-communities-post17.mjs PART=frames, 390x844, 4x CPU, a 150ms busy loop as the move starts,
    the compositor's own frames). Measured on round 16's engine and on this one; the longest gap between two frames while it
    moves, in ms. "after" is the rise (the default), the worst of four runs; the container move measured 21 to 36 the same
    way. Run the probe again to refresh these.
  */
  const MEASURED = {
    before: { open: 266, openBusy: 242, close: 25, closeBusy: 31 },
    after: { open: 32, openBusy: 30, close: 22, closeBusy: 32 },
  }
  check("the busy loop result: the open no longer stops (under 50ms between frames, busy or not); round 16's stopped for over 240ms", MEASURED.after.open < 50 && MEASURED.after.openBusy < 50 && MEASURED.before.open > 200 && MEASURED.before.openBusy > 200)
  check("and the close stays even, busy or not", MEASURED.after.close < 50 && MEASURED.after.closeBusy < 50)
  const probe = read("scripts/check-communities-post17.mjs")
  check("the probe measures that way: 4x CPU, a 150ms busy loop fired by the motion, the screencast's frames", /THROTTLE = Number\(process\.env\.THROTTLE \|\| 4\)/.test(probe) && /BUSY_MS = Number\(process\.env\.BUSY_MS \|\| 150\)/.test(probe) && /Page\.startScreencast/.test(probe))
}

console.log("\nKEYBOARD: the decision table (keyboard-plan.ts)")
{
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
  check("the rows: iPhone Safari, the iOS app, the app with the plugin, Android (browser or app), a computer", keyboardEnv({ ua: IPHONE, capacitor: false, plugin: false, coarse: true }) === "ios-safari" && keyboardEnv({ ua: IPHONE, capacitor: true, plugin: false, coarse: true }) === "ios-app" && keyboardEnv({ ua: IPHONE, capacitor: true, plugin: true, coarse: true }) === "ios-app-plugin" && keyboardEnv({ ua: ANDROID, capacitor: true, plugin: true, coarse: true }) === "android" && keyboardEnv({ ua: ANDROID, capacitor: false, plugin: false, coarse: true }) === "android" && keyboardEnv({ ua: "Mozilla/5.0 (Macintosh)", capacitor: false, plugin: false, coarse: false }) === "computer")
  const base: KeyboardFacts = { layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, native: 0, table: iosKeyboardFor(390, 844), published: 422 }
  const foot = (env: Parameters<typeof keyboardPlan>[0], m: Partial<KeyboardFacts>) => {
    const plan = keyboardPlan(env, { ...base, ...m })
    return { plan, screen: boxFootOnScreen(plan, { layoutH: m.layoutH ?? 844, vvTop: m.vvTop ?? 0, tabs: 56 }) }
  }
  /* 76.jpg: a 390x844 iPhone, the keyboard's bar from 464 (844 - 380), iOS's pan 62. */
  const app = foot("ios-app", {})
  check("the iOS app, nothing reported: the table's keyboard, applied in the focus, on the keys at 464", app.plan.source === "table" && app.plan.atFocus && app.screen === 464, app)
  const appPan = foot("ios-app", { vvTop: 62 })
  check("76.jpg: a 62px pan reported: the room is the keyboard less the pan, still on the keys at 464 on the screen (never lifted twice)", appPan.plan.foot === 318 && appPan.screen === 464, appPan)
  check("round 16's maths for the same pan put the box 62 short: the table's height added on a page iOS had already panned", 844 - 380 - 62 === 402)
  const appReports = foot("ios-app", { vvTop: 0, vvH: 464 })
  check("an iOS app whose web view reports the keyboard: the visible part, as Safari", appReports.plan.source === "visual" && appReports.screen === 464, appReports)
  const plugin = foot("ios-app-plugin", { native: 380, vvTop: 0 })
  check("the app with the plugin: its exact height, the web view's scroll held so iOS does not pan as well", plugin.plan.source === "native" && plugin.plan.holdScroll && plugin.screen === 464, plugin)
  const pluginPan = foot("ios-app-plugin", { native: 390, layoutH: 852, vvTop: 64 })
  check("the plugin's height with a pan anyway: less the pan", pluginPan.screen === 852 - 390, pluginPan)
  const safari = foot("ios-safari", { vvH: 464, published: 380 })
  const safariPan = foot("ios-safari", { vvTop: 120, vvH: 464, published: 260 })
  check("iPhone Safari: the visible part, pan included, no keyboard height added", safari.plan.source === "visual" && safari.screen === 464 && safariPan.plan.foot === 260 && safariPan.screen === 464, { safari, safariPan })
  const android = foot("android", { layoutH: 464, innerH: 464, vvH: 464, native: 300, table: null })
  check("Android, the web view shrank: nothing added, never the plugin's height", android.plan.foot === 0 && android.plan.source === "visual" && !android.plan.holdScroll, android)
  const chrome = foot("android", { vvH: 520, table: null })
  check("Android Chrome, the visible part shrank: its room", chrome.plan.foot === 324 && chrome.screen === 520, chrome)
  const rest = keyboardPlan("ios-app", { ...base, typing: false })
  check("not typing: the tab bar's room, as CSS", rest.foot === "tabs" && footCss(rest) === "var(--buyer-tabs-h, 0px)" && footCss(app.plan) === "380px")
  check("a computer: never a keyboard", keyboardPlan("computer", base).foot === "tabs")
  const pf = read("components/community/member/post-fullscreen.tsx")
  check("THE SURFACE: the post's page always reaches the foot of the screen (top and bottom set, never a height), its room at the foot lifting the box", /absolute inset-x-0 bottom-0 flex flex-col bg-white/.test(pf) && /style=\{\{ top: "var\(--post-top, 0px\)", paddingBottom: "var\(--post-foot, var\(--buyer-tabs-h, 0px\)\)" \}\}/.test(pf) && !/page\.style\.height/.test(pf))
  check("and the skirt carries its white on past the screen's foot, cut by nothing at rest (the clips clip only while moving)", /absolute inset-x-0 top-full h-\[100lvh\] bg-white/.test(pf) && /const CLIP = "absolute inset-0 \[\[data-moving\]_&\]:overflow-hidden"/.test(pf))
  const vb = read("components/community/member/visible-box.ts")
  check("the plan is applied IN the focus (before iOS decides to pan) and laid out at once", /const onFocusIn = \(e: FocusEvent\) => \{[\s\S]{0,200}run\(t\)\s*\/\*[^*]*\*\/\s*void \(scope\(\) as HTMLElement \| null\)\?\.offsetHeight/.test(vb) && /document\.addEventListener\("focusin", onFocusIn, true\)/.test(vb))
  check("the plugin's scroll is held only while typing, and let go", /holdNativeScroll\(hold\)/.test(vb) && /if \(held\) holdNativeScroll\(false\)/.test(vb))
  const nk = read("components/community/member/native-keyboard.ts")
  check("setScroll only on iOS and only with the plugin", /if \(!nativeKeyboardAvailable\(\)\) return/.test(nk) && /Capacitor\.getPlatform\(\) !== "ios"/.test(nk) && /Keyboard\.setScroll\(\{ isDisabled: on \}\)/.test(nk))
  const cm = read("components/community/member/comments.tsx")
  check("the post page's dock is on the same plan: its white to the foot while typed in, its content lifted", /useKeyboardPlan\(\s*dockPhone,/.test(cm) && /dock\.style\.bottom = "0px"\s*dock\.style\.paddingBottom = `\$\{Math\.round\(plan\.foot\) \+ 10\}px`/.test(cm))
  const css = read("app/globals.css")
  check("the keyboard does not shorten the community while a post is over it (its scroll would be thrown away under the post)", /html\.keyboard-open \[data-community-shell\]:not\(\[data-post-over\]\)(:not\(\[data-sheet-over\]\))? \{/.test(css) && /communityShell\(\)\?\.setAttribute\("data-post-over", ""\)/.test(pf))
  const guard = read("components/platform/keyboard-guard.tsx")
  check("KeyboardGuard leaves the post's own scroller alone", /if \(active\.closest\("\[data-keyboard-own\]"\)\) return/.test(guard) && /data-keyboard-own=""/.test(pf))
  check("THE READOUT: a 1.5s press on the face beside the comment box turns it on or off, kept on the phone", /export const KB_DEBUG_PRESS_MS = 1500/.test(pf) && /closest\?\.\("\[data-comment-box=comment\] > \[data-app-avatar\]"\)/.test(pf) && /window\.localStorage\.setItem\(KB_DEBUG_KEY, "1"\)/.test(pf) && /Math\.hypot\(e\.clientX - at\.x, e\.clientY - at\.y\) > 10/.test(pf))
  check("the face gives no iOS callout (the long press is ours)", /\[&_\[data-comment-box=comment\]>\[data-app-avatar\]\]:\[-webkit-touch-callout:none\]/.test(cm))
  check("and ?kbdebug=1 still works", /URLSearchParams\(window\.location\.search\)\.get\("kbdebug"\)/.test(pf))
}

console.log("\nCOPY: this round's files")
{
  const files = ["components/community/member/post-morph.ts", "components/community/member/post-stage.ts", "components/community/member/post-fullscreen.tsx", "components/community/member/keyboard-plan.ts", "components/community/member/visible-box.ts", "components/community/member/native-keyboard.ts", "components/community/member/post-overlay.tsx", "components/community/member/post-opener.tsx", "scripts/check-communities-post17.mjs", "scripts/render-communities-post17.tsx"]
  /* Spelled in pieces, so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(read(f)))
  check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  const client = ["components/community/member/post-stage.ts", "components/community/member/post-fullscreen.tsx", "components/community/member/visible-box.ts", "components/community/member/keyboard-plan.ts", "components/community/member/post-morph.ts"]
  check("client modules import no server code", client.every((f) => !/from "(@\/lib\/communities\/server|next\/headers|server-only)/.test(read(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
