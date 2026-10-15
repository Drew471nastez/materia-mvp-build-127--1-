/**
 * ===========================================================================
 *  COMMUNITIES ROUND 15: THE FEED, ITS SPACE PILLS, PICTURES AND REFRESH
 * ===========================================================================
 *   PILLS     the hit area covers the gaps and is 44px or more tall; a tap is
 *             taken on the release; the pull leaves a tap's roll alone
 *   PRESS     something on the first frame, then an ease, then a slower let go
 *   INK       round 16: each pill's own ink fades in or out where it is (the
 *             glide is gone); the list follows once the fade is nearly whole
 *   KEYS      the same posts keep their cards: keyed by id, patched in place,
 *             an unchanged post keeps the very same object
 *   PICTURES  each slot's sizes against the boxes measured in the real frame,
 *             the crop's extra width, the files a phone picks, the quality
 *   REFRESH   the pull's tap, pull or scroll decision; the feed's refresh is
 *             the navigator's for the feed's slot and settles once drawn
 *   SEARCH    each kind of result its own row; a drawn post glyph
 *
 *   The measurements (taps, frames, pictures on slow 4G) are
 *   scripts/check-communities-feed15.mjs.
 *
 * Run with:  pnpm run test:push
 */
import { readCode, readSource } from "./_source"
import { CLICK_AFTER_MS, GAP, HIT_X, HIT_Y, LIST_AFTER_MS, PILL_FADE_MS, PILL_H, PRESS_FROM, PRESS_IN_MS, PRESS_OUT_MS, PULL_TAP_SLOP, TAP_SLOP, TOUCH_H, chipAt, coversGap, fadeAt, hitBox, isTap, pressAt } from "@/components/community/member/chip-hit"
import { FEED_PICTURE_QUALITY, FEED_SLOTS, NEXT_IMAGE_WIDTHS, coverFactor, feedSlot, fileWidthFor, loadPolicy, scaleSizes, slotWidthAt } from "@/lib/images/slots"
import { mergeQuiet, samePost, type CachedView } from "@/components/community/member/feed-cache"
import { PULL_TAP_SLOP as HOOK_SLOP, rollOf } from "@/hooks/use-pull-to-refresh"
import type { FeedPostView } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)

function main() {
  const chips = code("components/community/member/space-chips.tsx")
  const feed = code("components/community/member/feed.tsx")
  const media = code("components/community/member/media.tsx")
  const hook = code("hooks/use-pull-to-refresh.ts")

  console.log("\nPILLS: where a tap counts, and when one is a tap")
  {
    /* Two pills a GAP apart, 40px tall, as the row lays them out. */
    const a = { left: 16, right: 60, top: 117, bottom: 157 }
    const b = { left: 60 + GAP, right: 170, top: 117, bottom: 157 }
    check("the two hit areas meet inside the gap, with nothing between them", coversGap(a, b) && hitBox(a).right > hitBox(b).left - 0.01)
    const gapPoints = Array.from({ length: GAP * 4 + 1 }, (_, i) => a.right + i / 4)
    /* Each pill owns its half of the gap; in the hair where the two overlap either one is right. */
    const owner = (x: number) => (x - a.right < GAP / 2 - 0.5 ? 0 : x - a.right > GAP / 2 + 0.5 ? 1 : chipAt([a, b], x, 137))
    check("every point in the gap belongs to one of the two, its own half", gapPoints.every((x) => chipAt([a, b], x, 137) === owner(x) && owner(x) >= 0), gapPoints.filter((x) => chipAt([a, b], x, 137) !== owner(x)))
    check("a tap just above or below a pill is that pill", chipAt([a, b], 38, a.top - HIT_Y + 1) === 0 && chipAt([a, b], 38, a.bottom + HIT_Y - 1) === 0)
    check("HIT_X is half the gap and half a pixel", HIT_X === GAP / 2 + 0.5)
    check("the place that takes a tap on a phone is 44px or more tall", TOUCH_H >= 44 && PILL_H === 40, TOUCH_H)
    check("the pill's ::after draws that hit area: HIT_X sideways, HIT_Y up and down, square so the gap's corners are covered", chips.includes(`after:-inset-x-[${HIT_X}px]`) && chips.includes(`after:-inset-y-[${HIT_Y}px]`) && !/after:rounded/.test(chips))
    check("the row has exactly that room above and below (py-1.5 inside a -my-1 track), so the hit area is never clipped", HIT_Y === 6 && /"relative isolate flex w-max items-center gap-2 py-1\.5/.test(chips) && /className="-my-1 min-w-0 flex-1 overflow-x-auto/.test(chips))
    check("a release near where the finger landed is a tap; a drag or a long rest is not", isTap({ x: 0, y: 0, t: 0 }, { x: 6, y: 5, t: 120 }) && !isTap({ x: 0, y: 0, t: 0 }, { x: TAP_SLOP + 1, y: 0, t: 120 }) && !isTap({ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 900 }) && !isTap(null, { x: 0, y: 0, t: 0 }))
    check("a finger's tap is taken on the release, whatever the browser did with the click", /onPointerUp: \(e: React\.PointerEvent<HTMLAnchorElement>\) => \{[\s\S]{0,400}isTap\(started, \{ x: e\.clientX, y: e\.clientY, t: performance\.now\(\) \}\)[\s\S]{0,120}tookAt = performance\.now\(\)\s*onPick\(pick\)/.test(chips))
    check("the click after it is the same tap, not a second switch; a keyboard's or a mouse's click still switches", /if \(performance\.now\(\) - tookAt < CLICK_AFTER_MS\) return\s*onPick\(pick\)/.test(chips) && CLICK_AFTER_MS >= 500 && /down = e\.pointerType === "mouse"/.test(chips))
    check("a pointer the browser kept for a scroll is no tap", /onPointerCancel: \(e: React\.PointerEvent<HTMLAnchorElement>\) => \{\s*releaseChip\(e\.currentTarget\)\s*down = null/.test(chips))
    check("THE BUMP: the pull leaves a tap's roll alone (nothing painted, nothing cancelled) until PULL_TAP_SLOP", HOOK_SLOP === PULL_TAP_SLOP && PULL_TAP_SLOP >= 6 && PULL_TAP_SLOP < 10 && /const roll = rollOf\(e\.touches\[0\]\.clientY - downY\)\s*if \(roll === "tap"\) return/.test(hook) && hook.indexOf('if (roll === "tap") return') < hook.indexOf("e.preventDefault()", hook.indexOf("const onTouchMove")))
    check("and the pull then starts from zero at the slop, so it never jumps", /if \(roll === "pull"\) startY = downY \+ PULL_TAP_SLOP/.test(hook))
    check("a pill's address is the canonical one, the same on the server and the phone (no feedListHref in the row)", /href=\{placeHref\(slug, \{ kind: "space", slug: s\.slug \}\)\}/.test(chips) && !/feedListHref/.test(chips))
    check("no pill changes size when chosen: the unread dot is kept, the words are two stacked copies", /h-1\.5 w-1\.5 rounded-full bg-\[#1a1a2e\] \$\{on \? "opacity-0" : ""\}/.test(chips) && /col-start-1 row-start-1/.test(chips) && /<Label text=\{s\.name\} on=\{on\}/.test(chips))
  }

  console.log("\nPRESS: eased in, never a flash")
  {
    const first = pressAt(0)
    check("something on the first frame: part of the way, not the whole grey", first === PRESS_FROM && first > 0.2 && first < 0.6, first)
    const steps = Array.from({ length: 11 }, (_, i) => pressAt((PRESS_IN_MS * i) / 10))
    check("then it eases up to full over PRESS_IN_MS, never going back", steps.every((v, i) => i === 0 || v >= steps[i - 1]) && Math.abs(steps[10] - 1) < 1e-9 && PRESS_IN_MS >= 100 && PRESS_IN_MS <= 200, steps)
    check("and no single frame does most of it (a flash)", steps.slice(1).every((v, i) => v - steps[i] < 0.35))
    check("it lets go slower than it came", PRESS_OUT_MS > PRESS_IN_MS)
    check("the press is its own layer, eased by the compositor (opacity), started on the pointer landing", /layer\.animate\(\[\{ opacity: PRESS_FROM \}, \{ opacity: 1 \}\], \{ duration: PRESS_IN_MS/.test(chips) && /pressChip\(e\.currentTarget\)/.test(chips) && /data-chip-press=""/.test(chips))
    check("no colour jump left on the pill itself (no data-[pressed] or active background)", !/data-\[pressed\]:bg-/.test(chips) && !/active:bg-/.test(chips))
  }

  /* Round 16: the owner found round 15's glide exaggerated; tests/account-pills16.test.ts holds the fade in place. */
  console.log("\nINK: each pill's own, fading in place")
  {
    check("the list is drawn once the fade is nearly whole", fadeAt(LIST_AFTER_MS) > 0.9 && LIST_AFTER_MS <= PILL_FADE_MS, fadeAt(LIST_AFTER_MS))
    check("feed.tsx hands the list over LIST_AFTER_MS after the tap, and a newer tap cancels it", /window\.setTimeout\(\(\) => \{\s*frame = requestAnimationFrame\(\(\) => flushSync\(\(\) => setList\(next\)\)\)\s*\}, LIST_AFTER_MS\)/.test(feed) && /window\.clearTimeout\(wait\)/.test(feed))
    check("no gliding ink: every pill draws its own, and it moves by opacity alone", !/ChipInk|ink-gliding/.test(chips) && /const FILL =\s*"[^"]*transition-opacity/.test(chips))
  }

  console.log("\nKEYS: the same posts keep their cards")
  {
    const post = (id: string, n = 0) => ({ id, title: `Post ${id}`, reactionCount: n, media: [{ type: "image", url: `https://x.supabase.co/${id}.jpg` }] }) as unknown as FeedPostView
    const current: CachedView = { posts: [post("a"), post("b", 2), post("c")], cursor: "c2", at: 1, pages: 2 }
    const fresh: CachedView = { posts: [post("n"), post("a"), post("b", 3)], cursor: "c1", at: 9, pages: 1 }
    const merged = mergeQuiet(current, fresh)
    check("an unchanged post keeps the very same object (its card is not drawn again)", merged.view.posts[0] === current.posts[0] && merged.view.posts[2] === current.posts[2])
    check("a post with new facts takes them where it is", merged.view.posts[1] !== current.posts[1] && (merged.view.posts[1] as unknown as { reactionCount: number }).reactionCount === 3 && merged.changed === 1)
    check("order, cursor and pages read are kept; the new post goes to the top through FeedLive", merged.view.posts.map((p) => p.id).join() === "a,b,c" && merged.view.cursor === "c2" && merged.view.pages === 2 && merged.added.map((p) => p.id).join() === "n")
    const same = mergeQuiet(current, { ...current, at: 5 })
    check("nothing new at all: the list on screen is the same array", same.view.posts === current.posts && same.changed === 0)
    check("samePost compares what the server said", samePost(post("a"), post("a")) && !samePost(post("a"), post("a", 1)))
    check("every card is keyed by its post's id", /<PostCard key=\{p\.id\}/.test(feed) && /<PostCardPlaceholder key=\{p\.id\}/.test(feed))
    check("a card is drawn again only when its own post object changed", /export const PostCard = memo\(PostCardView, \(a, b\) => a\.post === b\.post/.test(code("components/community/member/post-card.tsx")))
    check("a quiet refresh puts nothing new on screen when nothing changed", /if \(merged\.view !== now\) setShown\(\{ key, view: merged\.view \}\)/.test(feed))
    check("a switch keeps the page where the finger is (no jump to the top); only pills under the bar come back", /keepPillsInView\(rootRef\.current\)/.test(feed) && !/snapPageTop\(\)/.test(feed))
  }

  console.log("\nPICTURES: the width each slot is drawn at")
  {
    /* The boxes measured in the real frame (scripts/check-communities-feed15.mjs SLOTS): the card's picture area. */
    const area: Record<number, number> = { 360: 328, 390: 358, 430: 398, 640: 551, 768: 679, 1024: 619, 1100: 695, 1280: 531, 1300: 551, 1350: 601, 1376: 627, 1440: 627, 1920: 627 }
    const off = Object.entries(area).flatMap(([vw, box]) => {
      const v = Number(vw)
      const half = slotWidthAt(FEED_SLOTS.cardHalf.sizes, v) ?? 0
      const single = v < 640 ? (slotWidthAt(FEED_SLOTS.cardSingle.sizes, v) ?? 0) : box
      return Math.abs(half - (box - 3) / 2) > 1.5 || Math.abs(single - box) > 1 ? [[v, half, single, box]] : []
    })
    check("each slot's sizes says what its box measures, 360 to 1920px", off.length === 0, off)
    check("every offered width is one the optimizer serves", Object.values(FEED_SLOTS).every((r) => r.widths.every((w) => (NEXT_IMAGE_WIDTHS as readonly number[]).includes(w))))
    check("a cropped picture asks for the width it is drawn at: a 3:2 photograph in a square tile half again wider", coverFactor(1.5, 1) === 1.5 && coverFactor(0.75, 1) === 1 && coverFactor(4, 1) === 2)
    const tile = feedSlot("cardHalf", 1.5)
    check("a phone's square tile scales by 1.5, a computer's 4:3 tile by 1.13", /calc\(\(\(100vw - 35px\) \/ 2\) \* 1\.5\)$/.test(tile.sizes) && /\(min-width: 1376px\) 353px/.test(tile.sizes), tile.sizes)
    check("a scaled sizes string still reads as a browser reads it", Math.abs((slotWidthAt(tile.sizes, 390) ?? 0) - 177.5 * 1.5) < 0.5 && slotWidthAt(scaleSizes("320px", 2), 390) === 640)
    const phone2x = Object.keys(FEED_SLOTS).map((k) => fileWidthFor(feedSlot(k as keyof typeof FEED_SLOTS, 1.5).sizes, FEED_SLOTS[k as keyof typeof FEED_SLOTS].widths, 390, 2))
    check("a 2x phone at 390px never fetches a file wider than 828", phone2x.every((w) => w <= 828), phone2x)
    check("one picture across a phone's card: 750 on a 2x screen, 1080 on a 3x (it was 828 and 1080 for 100vw)", fileWidthFor(FEED_SLOTS.cardSingle.sizes, FEED_SLOTS.cardSingle.widths, 390, 2) === 750 && fileWidthFor(FEED_SLOTS.cardSingle.sizes, FEED_SLOTS.cardSingle.widths, 390, 3) === 1080)
    const qualities = /qualities:\s*\[([^\]]*)\]/.exec(readSource("next.config.mjs"))?.[1] ?? ""
    check("the feed's quality is 75, and next.config lists it", FEED_PICTURE_QUALITY === 75 && qualities.split(",").map((s) => Number(s.trim())).includes(FEED_PICTURE_QUALITY))
    check("card pictures use the slot rules and the feed's quality", /const fit = feedSlot\(slot, p\.w && p\.h \? p\.w \/ p\.h : null\)/.test(media) && /optimizedSrcSet\(p\.url, fit\.widths, FEED_PICTURE_QUALITY\)/.test(media) && /optimizedImageUrl\(p\.url, fit\.display, FEED_PICTURE_QUALITY\)/.test(media))
    check("the first screen is eager and high, the rest lazy and low", loadPolicy(true).loading === "eager" && loadPolicy(true).fetchPriority === "high" && loadPolicy(false).loading === "lazy" && loadPolicy(false).fetchPriority === "low" && /const policy = loadPolicy\(priority\)/.test(media))
    check("a phone only picture fetches nothing where it is hidden (an empty source from 640px)", /<source media=\{hiddenFrom\} srcSet=\{NO_PICTURE\} \/>/.test(media) && /phoneOnly=\{!several\}/.test(code("components/community/member/post-card.tsx")) && /hiddenFrom=\{phoneOnly \? "\(min-width: 640px\)" : undefined\}/.test(media))
    /* Changed on purpose (the owner: no blur, no fade). */
    check("space kept, no blurred copy and no fade, no wait for a picture already drawn, decoded off the thread the first time", /style=\{\{ aspectRatio: String\(ratio\) \}\}/.test(media) && !/data-soft-blur/.test(media) && !/blur-\[10px\]/.test(media) && /el\.decode\(\)\.then\(show, show\)/.test(media) && /* Changed on purpose (round 29): a video's first frame and an opened post's poster fade in (the owner asked for it); a picture (SoftImg) still never fades. */ !/transition-opacity ease-out/.test(media.slice(media.indexOf("export function SoftImg"), media.indexOf("export function fileSize"))) && /painted\.has\(src\) \? "cached"/.test(media) && /decoding=\{state === "cached" \? "sync" : "async"\}/.test(media))
  }

  console.log("\nREFRESH: in place, through the navigator, settled once drawn")
  {
    check("a roll under the slop is a tap; down past it a pull; up past it a scroll", rollOf(0) === "tap" && rollOf(PULL_TAP_SLOP - 1) === "tap" && rollOf(-(PULL_TAP_SLOP - 1)) === "tap" && rollOf(PULL_TAP_SLOP) === "pull" && rollOf(-PULL_TAP_SLOP) === "scroll")
    check("the pull's phases are idle, pulling, ready, refreshing", /export type PullPhase = "idle" \| "pulling" \| "ready" \| "refreshing"/.test(hook) && /setPhase\("refreshing"\)/.test(hook))
    check("the feed registers its refresh for the feed's slot (navigator.refresh calls it)", /useRegisterPlaceRefresh\(spaces \? "feed" : `feed-view:\$\{communityId\}`, refreshList\)/.test(feed))
    check("and answers the page's pull event for its own scope, outside the shell", /detail\?\.scope === COMMUNITY_FEED_REFRESH_SCOPE\) detail\.done = refreshList\(\)/.test(feed))
    check("it reads the list on screen again and merges it into itself, never swaps it", /const fresh = await loadView\(communityId, t, s\)[\s\S]{0,300}const merged = mergeQuiet\(now, fresh\)/.test(feed) && !/now\.current\.onView\(fresh\)/.test(code("components/community/member/feed-live.tsx")))
    check("a refresh for a list no longer on screen is dropped", /if \(!fresh \|\| keyRef\.current !== k\) return/.test(feed))
    check("it settles once the merged list has been drawn (one frame), so the pull lets go as the data is in", /await new Promise<void>\(\(done\) => requestAnimationFrame\(\(\) => done\(\)\)\)/.test(feed))
    check("posts new to the list slide in at the top through FeedLive, not a swap", /window\.dispatchEvent\(new CustomEvent\(FRESH_POSTS_EVENT, \{ detail: \{ key: k, posts: merged\.added \} \}\)\)/.test(feed))
    check("in the shell, a pill is navigator.go with the page kept where it is", /nav\.go\(placeOfPick\(p\), \{ scroll: "keep" \}\)/.test(feed) && /const fromNav = nav\.inCommunity \? targetFromPlace\(nav\.place, spaces\) : null/.test(feed))
  }

  console.log("\nSEARCH: rows designed for this community")
  {
    const search = code("components/community/member/search.tsx")
    check("a post leads with a drawn post glyph and its author's face, not a stock icon", /function PostGlyph/.test(search) && /<PostGlyph face=\{p\.author\?\.avatarUrl \?\? null\}/.test(search) && !/MessageSquareText/.test(search))
    check("its line says where it is: the space's own icon and name, who, when", /spaceGlyph\(p\.space\.icon \?\? null, p\.space\.kind \?\? "feed"\)/.test(search) && /data-search-post-meta=""/.test(search))
    check("a space shows its own icon on the same tile; a person their face", /<span className=\{`\$\{TILE\} text-\[17px\] leading-none`\} data-space-glyph="">/.test(search) && /<MemberAvatar src=\{m\.avatarUrl\} name=\{m\.name\} alt="" size=\{40\} \/>/.test(search))
    check("a phone's rows are 60px or more and show the press", /min-h-\[60px\]/.test(search) && /active:bg-\[#f3f4f6\]/.test(search))
  }

  console.log("\nCOPY")
  {
    const files = ["components/community/member/chip-hit.ts", "components/community/member/feed-cache.ts", "components/community/member/feed-live.tsx", "components/community/member/space-chips.tsx", "components/community/member/feed.tsx", "components/community/member/media.tsx", "components/community/member/search.tsx", "lib/images/slots.ts", "scripts/check-communities-feed15.mjs", "scripts/render-communities-feed15.tsx"]
    /* The words are spelled out in pieces here so this file does not hold them itself. */
    const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
    const bad = files.filter((f) => banned.test(readSource(f)))
    check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
