/**
 * Round 21: the community's and the files picker's leftovers, each measured
 * before and after in a real browser:
 *
 *   1. Back closes an opened post as fast as its X.
 *      scripts/nav18-real-router/polish21.mjs flow=back
 *   2. Create post away from the feed opens the composer over that place, and
 *      the feed has the post when the member goes there.
 *      scripts/nav18-real-router/polish21.mjs flow=compose post=1
 *   3. Home from the account lays the community out once: no box read in the
 *      commit, no write on <html> that changes nothing.
 *      scripts/nav18-real-router/nav-probe.mjs trace=1, timing.mjs
 *   4. A pill in the files picker fades the grid itself, nothing copied.
 *      scripts/check-files-picker.mjs
 *
 * This suite holds the rules those numbers came from, and the pure parts.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { requestCompose, resetComposeIntent, setComposeFallback, addComposeHandler, takePending } from "@/lib/communities/client/compose-intent"
import { notePostedAway, takePostedAway, withNewPost, readView, writeView, viewKey, type CachedView } from "@/components/community/member/feed-cache"
import type { FeedPostView } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** The source between two markers (the first after `from`). */
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = a < 0 ? -1 : src.indexOf(to, a + from.length)
  return a < 0 || b < 0 ? "" : src.slice(a, b)
}

const fullscreen = read("components/community/member/post-fullscreen.tsx")
const feed = read("components/community/member/feed.tsx")
const composer = read("components/community/member/composer.tsx")
const anywhere = read("components/community/member/compose-anywhere.tsx")
const host = read("components/community/member/place-host.tsx")
const intent = read("lib/communities/client/compose-intent.ts")
const cache = read("components/community/member/feed-cache.ts")
const bell = read("components/notifications/notification-bell.tsx")
const search = read("components/community/member/search.tsx")
const topBar = read("components/community/member/top-bar.tsx")
const frame = read("components/community/member/shell-frame.tsx")
const returnScroll = read("components/community/member/return-scroll.ts")
const lens = read("components/nav/tab-lens.tsx")
const afterLayout = read("lib/ui/after-layout.ts")
const files = read("components/files/files-library.tsx")

console.log("\n1. Back closes an opened post as fast as its X")
check("a popstate listener is added as the module loads, in the capture phase, before any component's", /if \(typeof window !== "undefined"\)\s*\n\s*window\.addEventListener\(\s*"popstate",[\s\S]{0,160}\{ capture: true \}/.test(fullscreen))
check("the open post starts its close in the event and keeps the Back from the rest of the page", /onPopFirst\?\.\(\)\) e\.stopImmediatePropagation\(\)/.test(fullscreen) && /heldPop\.current = true\s*\n\s*beginClose\(trigger\)\s*\n\s*return true/.test(fullscreen))
check("a Back from a viewer over the post (still the post's address) leaves it open", /if \(closing\.current \|\| isPostAddress\(window\.location\.pathname\)\) return false/.test(fullscreen))
check("Safari's own swipe back is handed on at once, never held", /if \(trigger === "browser-swipe"\) \{\s*\n\s*beginClose\(trigger\)\s*\n\s*return false/.test(fullscreen))
check("the held Back is handed on once the move is over, before the post is taken out", /if \(heldPop\.current\) \{\s*\n\s*heldPop\.current = false\s*\n\s*replayPop\(\)\s*\n\s*\}\s*\n\s*done\.current\.onGone\(\)/.test(fullscreen))
check("and handed on if the post is taken out mid move", /Taken out mid move[\s\S]{0,120}replayPop\(\)/.test(fullscreen))
check("the handed on Back is not heard by the post a second time", /if \(!replaying && onPopFirst/.test(fullscreen) && /replaying = true[\s\S]{0,140}new PopStateEvent\("popstate", \{ state: window\.history\.state \}\)[\s\S]{0,60}replaying = false/.test(fullscreen))
check("the feed reads the address again in a transition", /const on = \(\) => startTransition\(\(\) => setTick\(\(t\) => t \+ 1\)\)/.test(feed))

console.log("\n2. Create post over the place you are on")
resetComposeIntent()
let fellBack = 0
setComposeFallback(() => {
  fellBack++
  return true
})
check("no composer on screen: the fallback takes it, and nothing waits pending", requestCompose() === true && fellBack === 1 && takePending() === null)
const stop = addComposeHandler(() => true)
check("a composer on screen answers first; the fallback is not asked", requestCompose() === true && fellBack === 1)
stop()
resetComposeIntent()
setComposeFallback(() => false)
check("a fallback that says no leaves the request pending for the feed's composer", requestCompose() === false && takePending() !== null)
const unset = setComposeFallback(() => true)
unset()
check("letting the fallback go stops it answering", requestCompose() === false)
resetComposeIntent()
check("the fallback is asked only after every handler", between(intent, "export function requestCompose", "export function setComposeFallback").indexOf("fallback?.(req)") > between(intent, "export function requestCompose", "export function setComposeFallback").indexOf("for (let i = handlers.length - 1"))
check("the shell's composer says no on a computer and for one space's request", /if \(req\.spaceSlug \|\| !window\.matchMedia\?\.\("\(max-width: 639px\)"\)\.matches\) return false/.test(anywhere))
check("it opens from the feed's data already in hand, and says no without it", /readPlace\(communityId, \{ kind: "feed" \}\)/.test(anywhere) && /if \(!open\) return false/.test(anywhere))
check("the place host draws it for a member who may post", /\{viewer && !readOnly \? <ComposeAnywhere communityId=\{communityId\} \/> : null\}/.test(host))
check("away from the feed the composer opens at once, with no field of its own in a list", /useState\(editing \|\| !!away\)/.test(composer) && /\) : away && phone \? null : \(/.test(composer))
check("its owner takes it out once the sheet is down", /if \(awayRef\.current\) \{\s*\n\s*awayRef\.current\.onClosed\(\)\s*\n\s*return\s*\n\s*\}/.test(composer))
check("posted away: a toast says so, not the feed's arrival", /if \(awayRef\.current\) toast\("Posted"\)\s*\n\s*else arrive\(/.test(composer))

/* The feed's side: the post waits, and goes in where a post written there would. */
const post = (id: string, extra: Partial<FeedPostView> = {}) => ({ id, pinned: false, space: null, ...extra }) as unknown as FeedPostView
const cid = "c-21"
const allKey = viewKey(cid, { kind: "all" }, "default")
writeView(allKey, { posts: [post("pin", { pinned: true }), post("a")], cursor: null, at: Date.now(), pages: 1 })
notePostedAway(cid, post("new"))
check("posted away: into the cached list under the pinned post", (readView(allKey)?.posts ?? []).map((p) => p.id).join(",") === "pin,new,a", readView(allKey)?.posts.map((p) => p.id))
const waiting = takePostedAway(cid)
check("and kept for the feed's own list, taken once", waiting.length === 1 && waiting[0].id === "new" && takePostedAway(cid).length === 0)
const v: CachedView = { posts: [post("pin", { pinned: true }), post("a")], cursor: null, at: 0, pages: 1 }
check("Default: below the pinned posts", withNewPost(v, post("n"), "default").posts.map((p) => p.id).join(",") === "pin,n,a")
check("New: first", withNewPost(v, post("n"), "new").posts.map((p) => p.id).join(",") === "n,pin,a")
check("Top and Unread are left as they are", withNewPost(v, post("n"), "top") === v && withNewPost(v, post("n"), "unread") === v)
check("a post already there is not added twice", withNewPost(v, post("a"), "default") === v)
check("the feed takes them as it comes back into view, and at once when it is on screen", /takeAway\.current\(\)\s*\n\s*const on = /.test(feed) && /window\.addEventListener\(POSTED_AWAY_EVENT, on\)/.test(feed))
check("only into the list they belong in", /listTarget\.kind === "all" \|\| \(listTarget\.kind === "space" && p\.space\?\.id === listTarget\.id\)/.test(feed))
check("the cache says it out loud once posted", /window\.dispatchEvent\(new CustomEvent\(POSTED_AWAY_EVENT/.test(cache))

console.log("\n3. Home from the account: no box read in the commit")
check("the bell is told it is on screen by a ResizeObserver only", !/\.getClientRects\(\)/.test(bell) && /const ro = new ResizeObserver\(\(entries\) =>/.test(between(bell, "function useOnScreen", "return on")))
check("the community's search field takes its width from the observer's report", !/getBoundingClientRect/.test(between(search, "const [narrow, setNarrow]", "const go = useCallback")) && /borderBoxSize/.test(search))
check("the top bar reads no box on the way in (only without a ResizeObserver)", (between(topBar, "function useCommunityTop", "function LogInLink").match(/getBoundingClientRect/g) ?? []).length === 1 && /if \(typeof ResizeObserver === "undefined"\) \{\s*\n\s*set\(header\.getBoundingClientRect\(\)\.height\)/.test(topBar))
check("the top bar writes in the commit only the height its kind last had", /const known = lastTop\.get\(kind\)/.test(topBar) && /header\.closest\("\[data-account-community-chrome\]"\) \? "account" : "community"/.test(topBar))
check("and writes nothing that is already there", /if \(now !== h\) el\.style\.setProperty\("--community-top", h\)/.test(topBar))
check("and does not take <html>'s value off when it goes (a return writes nothing)", !/removeProperty\("--community-top"\)/.test(topBar))
check("the observer's own report is written on the next frame, not in the report", /frameId = requestAnimationFrame\(\(\) => \{\s*\n\s*put\(frame, h\)\s*\n\s*put\(html, h\)/.test(topBar))
check("the row of places is measured by its observer and followed after layout", /const stop = afterLayout\(follow, el\)/.test(frame) && !/useLayoutEffect\(\(\) => \{\s*\n\s*measure\(\)/.test(frame))
check("the arrival's snap to the top runs after the browser's own layout", /const stopSnap = afterLayout\(snapPageTop\)/.test(returnScroll))
check("the tab bar's lens starts from the last bar's numbers and reads at once only the first time", /useState<Geometry \| null>\(lastGeometry\)/.test(lens) && /if \(!lastGeometry \|\| typeof ResizeObserver === "undefined"\) read\(\)/.test(lens))
check("afterLayout is a ResizeObserver's first report, a frame without one", /const ro = new ResizeObserver\(run\)/.test(afterLayout) && /requestAnimationFrame\(run\)/.test(afterLayout))

console.log("\n4. The files picker's pills fade the grid itself")
const swap = between(files, "const swapGrid", "const chooseSource")
check("nothing is copied: no cloneNode, no box read per tile", !/cloneNode/.test(files) && !/getBoundingClientRect/.test(swap))
check("the grid fades out on the compositor, opacity only", /el\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: SWAP_OUT_MS/.test(swap) && !/translate|scale\(/.test(swap))
check("out of sight, the tiles are shown and put away on the elements, then the grid fades in", /putAway\(li, !keep\.has/.test(swap) && swap.indexOf("putAway(li") < swap.indexOf("[{ opacity: 0 }, { opacity: 1 }]"))
check("React follows in a transition", /React\.startTransition\(\(\) => setGrid\(next\)\)/.test(swap))
check("a press while it is out only changes what it will show", /swap\.to = to\s*\n\s*if \(swap\.out\) return/.test(swap))
check("a tile put away keeps its drawing (content-visibility hidden) and is out of reach", /data-\[off\]:\[content-visibility:hidden\]/.test(files) && /inert=\{hidden\}/.test(files) && /li\.inert = off/.test(files))
check("tiles off screen skip layout and paint", /\[content-visibility:auto\]/.test(files))
check("the press changes the pill at once and the grid through the fade", /setSource\(s\)\s*\n\s*swapGrid\(\{ source: s, words \}\)/.test(files))
check("reduced motion: the grid changes at once", /prefers-reduced-motion: reduce\)"\)\.matches\) \{\s*\n\s*swappedRef\.current = true\s*\n\s*setGrid\(to\)/.test(swap))

console.log("\nCopy")
const words = [["un", "lock"], ["ele", "vate"], ["seam", "less"], ["power", "ful"], ["effort", "less"], ["effort", "lessly"], ["super", "charge"], ["trans", "form"]].map((w) => w.join(""))
const banned = new RegExp(`\u2014|\\b(${words.join("|")})\\b`, "i")
for (const [name, src] of [
  ["compose-anywhere", anywhere],
  ["after-layout", afterLayout],
  ["polish21 probe", read("scripts/nav18-real-router/polish21.mjs")],
] as const) {
  check(`${name}: no em dashes or banned words`, !banned.test(src), src.match(banned)?.[0])
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
