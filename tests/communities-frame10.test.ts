/**
 * ===========================================================================
 *  COMMUNITIES ROUND 10: THE FRAME, THE SEARCH, INVITES, THE ABOUT PAGE
 * ===========================================================================
 *   TABS AND SPACES   the row of section tabs is the browser's own scroller:
 *                     no snap, nothing moves it under a finger or during a
 *                     glide, the chosen tab followed only once the row is
 *                     still; a press marks a tab, a place or a chip on the
 *                     first frame (data-pressed, no render)
 *   SEARCH            every word, any order, without accents, ranked (a
 *                     title over a body, a word's start over its middle),
 *                     words marked; lessons and events too, only what the
 *                     member may open; an index preloaded on idle answers the
 *                     first key in the browser
 *   INVITE            one Copy link, Share or Email beside it, a few words,
 *                     staff options behind one quiet row
 *   SOCIAL IMAGE      og:image is the cover (cover.jpg, 1200 by 630); the
 *                     drawn card only without one
 *   ABOUT             a pricing card (Monthly / Yearly), counted figures, the
 *                     classroom, who runs it; the phone's bar one white
 *                     surface to the screen's foot
 *   JOIN              answered at once, then one navigation: pushState home
 *                     and one router.refresh, no push
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { readCode, readSource } from "./_source"
import { fold, markRanges, rankAll, rankItem, searchWords, wordScore } from "@/components/community/member/search-rank"
import { localResults, searchOptions } from "@/components/community/member/search"
import { tabsFollowTarget, TABS_STILL_MS } from "@/components/community/member/nav"
import { PRESS_PROPS } from "@/components/community/member/ui"
import { shareLinkLine } from "@/components/community/member/invite-sheet"
import { communityMetadata, inviteMetadata, previewImages, shareCoverUrl, type SeoFacts } from "@/components/community/public/seo"
import { bothIntervals, priceParts } from "@/components/community/public/join-controls"
import { aboutFigures, sinceLabel } from "@/components/community/public/about-facts"
import type { JoinOption } from "@/components/community/public/types"
import type { SearchIndex } from "@/components/community/member/view-types"
import { aboutExtras } from "@/lib/communities/server/about"
import { searchCommunity } from "@/lib/communities/server/search"

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
const DAY = 86_400_000
const NOW = Date.parse("2026-10-04T12:00:00Z")

async function main() {
  /* ── Ranking ─────────────────────────────────────────────────────────── */
  console.log("\nSearch ranking")
  {
    check("words: folded, deduped, a word that starts another dropped", JSON.stringify(searchWords("Café  GLAZE gla")) === JSON.stringify(["cafe", "glaze"]) && searchWords("").length === 0)
    check("at most four words, the longest kept", searchWords("a bb ccc dddd eeeee ffffff").join() === "ffffff,eeeee,dddd,ccc")
    check("accents fold away", fold("Café Ünïcode") === "cafe unicode")
    check("whole field 8, field start 6, word start 4, inside 1, absent 0", wordScore("glaze", "glaze") === 8 && wordScore("glaze lab", "glaze") === 6 && wordScore("pro glaze", "glaze") === 4 && wordScore("overglazed", "glaze") === 1 && wordScore("kiln", "glaze") === 0)
    const title = rankItem([{ text: "Glaze tip: sieve twice", weight: 3 }, { text: "Two passes", weight: 1 }], ["glaze", "tip"])
    const body = rankItem([{ text: "Shelf heights", weight: 3 }, { text: "A glaze tip that saved me", weight: 1 }], ["glaze", "tip"])
    check("a title match ranks above a body match", title > body && body > 0, { title, body })
    check("every word must be somewhere", rankItem([{ text: "Glaze lab", weight: 3 }], ["glaze", "kiln"]) === 0)
    check("words in any order find the same", rankItem([{ text: "Glaze tip", weight: 3 }], ["tip", "glaze"]) > 0)
    const fresh = rankItem([{ text: "Glaze", weight: 1 }], ["glaze"], NOW - DAY, NOW)
    const old = rankItem([{ text: "Glaze", weight: 1 }], ["glaze"], NOW - 60 * DAY, NOW)
    check("the recent breaks a tie, by at most one", fresh > old && fresh - old <= 1)
    check("rankAll: above zero only, best first, ties in order", rankAll(["glaze lab", "kiln", "overglazed", "glaze"], (t) => rankItem([{ text: t, weight: 1 }], ["glaze"]), 10).join() === "glaze,glaze lab,overglazed")
    check("marks: a word's start, accents kept in the original", JSON.stringify(markRanges("Café crawl", ["cafe"])) === JSON.stringify([[0, 4]]) && JSON.stringify(markRanges("A glaze tip", ["glaze", "tip"])) === JSON.stringify([[2, 7], [8, 11]]))
    check("marks: inside a word only when it starts none", JSON.stringify(markRanges("Overglazed", ["glaze"])) === JSON.stringify([[4, 9]]) && JSON.stringify(markRanges("glaze overglazed", ["glaze"])) === JSON.stringify([[0, 5]]))
  }

  /* ── The preloaded index ─────────────────────────────────────────────── */
  console.log("\nThe index answers the first key")
  {
    const index: SearchIndex = {
      at: NOW,
      spaces: [{ id: "s1", slug: "glaze-lab", name: "Glaze lab", kind: "feed", description: null }],
      posts: [
        { id: "p-body", title: "Shelf heights", snippet: "", text: "A glaze tip that saved me a batch.", createdAt: new Date(NOW - DAY).toISOString(), space: null, author: null },
        { id: "p-title", title: "Glaze tip: sieve twice", snippet: "", text: "Two passes.", createdAt: new Date(NOW - 20 * DAY).toISOString(), space: null, author: null },
      ],
      members: [{ id: "u1", name: "Jonas Berg", username: "jonasb", avatarUrl: null, href: "/@jonasb", role: null }],
      lessons: [{ id: "course:c1", kind: "course", title: "Trimming feet", course: null, href: "/community/x/classroom/c1" }],
      events: [{ id: "e1", title: "Café crawl", startsAt: new Date(NOW + DAY).toISOString(), href: "/community/x/events/e1" }],
    }
    const r = localResults(index, "tip glaze", NOW)
    check("posts ranked: the title first, the body second", r.posts.map((p) => p.id).join() === "p-title,p-body", r.posts.map((p) => p.id))
    check("a snippet from the post's text, no index-only field left on the hit", r.posts[1].snippet.includes("glaze tip") && !("text" in r.posts[0]))
    check("lessons and events found as the server finds them", localResults(index, "trim", NOW).lessons?.[0]?.id === "course:c1" && localResults(index, "cafe", NOW).events?.[0]?.id === "e1")
    check("the options step through lessons and events after spaces", searchOptions(localResults(index, "glaze", NOW), "x").map((o) => o.group).join() === "posts,posts,spaces" && searchOptions({ q: "", posts: [], members: [], spaces: [], lessons: index.lessons, events: index.events }, "x").map((o) => o.href).join() === "/community/x/classroom/c1,/community/x/events/e1")
    const client = code("components/community/member/search.tsx")
    check("the first key reads the index on the same render; the server's answer replaces it after the pause", /const index = searchIndexOf\(communityId\)\s*if \(index\) \{\s*setResults\(localResults\(index, term\)\)/.test(client) && /window\.setTimeout\(async \(\) => \{\s*const r = await api/.test(client))
    check("the index is read once (shared promise), again after two minutes", /if \(have\?\.going\) return have\.going/.test(client) && /SEARCH_INDEX_FRESH_MS = 120_000/.test(client) && /\/search\?index=1/.test(client))
    check("the frame preloads it when idle", /whenIdle\(\(\) => \{[\s\S]{0,400}void preloadSearchIndex\(community\.id\)/.test(code("components/community/member/shell-frame.tsx")))
    /* Round 12: the screen is opaque white on every frame; Cancel sinks and fades it over 180ms on its own keyframes. */
    check("Cancel fades the phone screen down before it goes", /SCREEN_OUT_MS = 180/.test(client) && /animate-\[community-search-out_180ms/.test(client) && /community-search-out\{from\{opacity:1;translate:0 0\}to\{opacity:0;translate:0 6px\}\}/.test(client) && /flushSync\(\(\) => setOpen\(true\)\)\s*input\.current\?\.focus\(\)/.test(client))
  }

  /* ── The server's search ─────────────────────────────────────────────── */
  console.log("\nThe server's search: lessons and events, only what the member may open")
  {
    const C = "c0000000-0000-4000-8000-0000000000a1"
    const tables = {
      community_spaces: [],
      community_feed_posts: [],
      community_courses: [
        { community_id: C, product_id: "prod-open", position: 1, access: {}, drip_days: null, added_at: "2026-01-01" },
        { community_id: C, product_id: "prod-locked", position: 2, access: { tierIds: ["t-pro"] }, drip_days: null, added_at: "2026-01-02" },
      ],
      products: [
        { id: "prod-open", title: "Glaze basics", type: "course", status: "published" },
        { id: "prod-locked", title: "Glaze masterclass", type: "course", status: "published" },
      ],
      courses: [{ id: "co-open", product_id: "prod-open" }, { id: "co-locked", product_id: "prod-locked" }],
      course_modules: [{ id: "m-open", course_id: "co-open" }, { id: "m-locked", course_id: "co-locked" }],
      course_lessons: [{ id: "l-open", module_id: "m-open", title: "Glaze chemistry" }, { id: "l-locked", module_id: "m-locked", title: "Glaze secrets" }],
      community_events: [
        { id: "e-open", community_id: C, title: "Glaze night", starts_at: new Date(Date.now() + DAY).toISOString(), access: {}, status: "scheduled" },
        { id: "e-locked", community_id: C, title: "Glaze clinic", starts_at: new Date(Date.now() + 2 * DAY).toISOString(), access: { tierIds: ["t-pro"] }, status: "scheduled" },
        { id: "e-gone", community_id: C, title: "Glaze cancelled", starts_at: new Date(Date.now() + DAY).toISOString(), access: {}, status: "cancelled" },
      ],
      profiles: [],
      community_members: [],
    }
    const db = fakeDb(tables as never)
    const viewer = { userId: "u1", role: "member", active: true, tierId: null, ownedProductIds: [], level: 1, member: null } as never
    const r = await searchCommunity(db, { id: C, slug: "club", chat_enabled: false, directory_enabled: false, classroom_enabled: true, events_enabled: true } as never, viewer, "glaze")
    const lessonIds = (r.lessons ?? []).map((l) => l.id).sort()
    check("the open course and its lesson, never the locked course or its lessons", lessonIds.join() === "course:prod-open,lesson:l-open", lessonIds)
    check("a lesson opens in its course, at the lesson", (r.lessons ?? []).find((l) => l.kind === "lesson")?.href === "/community/club/learn/prod-open?lesson=l-open")
    check("events: scheduled and open to this member only", (r.events ?? []).map((e) => e.id).join() === "e-open", r.events)
    const off = await searchCommunity(fakeDb(tables as never), { id: C, slug: "club", chat_enabled: false, directory_enabled: false, classroom_enabled: false, events_enabled: false } as never, viewer, "glaze")
    check("with the classroom and events off, neither is searched", (off.lessons ?? []).length === 0 && (off.events ?? []).length === 0)
    const server = code("lib/communities/server/search.ts")
    check("posts must hold every word, read newest first, then ranked", /words\.map\(\(w\) => `or\(title\.ilike\.\$\{likePattern\(w\)\},body_text\.ilike\.\$\{likePattern\(w\)\}\)`\)/.test(server) && /rankAll\(rows, \(r\) => rankItem\(/.test(server))
    const route = code("app/api/community/[communityId]/search/route.ts")
    check("?index=1 answers the index, behind the same gate and rate limit", route.indexOf("requireMember(") < route.indexOf('searchParams.get("index") === "1"') && route.indexOf("rateLimit(") < route.indexOf('searchParams.get("index") === "1"') && /searchIndex\(db, gate\.community, gate\.viewer\)/.test(route))
  }

  /* ── The tabs and the press ──────────────────────────────────────────── */
  console.log("\nThe row of tabs follows only when still; a press shows at once")
  {
    check("a tab in view needs nothing; one past either edge is brought in with a margin, clamped", tabsFollowTarget({ left: 100, width: 80 }, { scrollLeft: 0, clientWidth: 390, scrollWidth: 600 }) === null && tabsFollowTarget({ left: 350, width: 90 }, { scrollLeft: 0, clientWidth: 390, scrollWidth: 600 }) === 74 && tabsFollowTarget({ left: 10, width: 90 }, { scrollLeft: 120, clientWidth: 390, scrollWidth: 600 }) === 0 && tabsFollowTarget({ left: 560, width: 40 }, { scrollLeft: 0, clientWidth: 390, scrollWidth: 600 }) === 210)
    const frame = code("components/community/member/shell-frame.tsx")
    check("never during a touch or within a moment of the last scroll; smooth after the first draw", TABS_STILL_MS >= 100 && /if \(touching\.current \|\| performance\.now\(\) - lastScroll\.current < TABS_STILL_MS\)/.test(frame) && /el\.scrollTo\(\{ left: to, behavior: "smooth" \}\)/.test(frame) && /onTouchStart=\{\(\) => \(touching\.current = true\)\}/.test(frame))
    check("no snap on the row", !/snap-/.test(frame.slice(frame.indexOf("export function SectionTabs"))))
    check("the chosen word a step heavier, its heavier twin holding the width", /after:invisible after:col-start-1 after:row-start-1 after:font-semibold after:content-\[attr\(data-label\)\]" data-label=\{e\.label\}/.test(frame))
    const el = { attrs: new Map<string, string>(), setAttribute(k: string, v: string) { this.attrs.set(k, v) }, removeAttribute(k: string) { this.attrs.delete(k) } }
    PRESS_PROPS.onPointerDown({ currentTarget: el as never, button: 0 })
    const down = el.attrs.has("data-pressed")
    PRESS_PROPS.onPointerCancel({ currentTarget: el as never })
    check("a press marks the element at once and a scroll taking the touch clears it", down && !el.attrs.has("data-pressed"))
    check("tabs, places and chips carry it", /\{\.\.\.PRESS_PROPS\}/.test(frame) && /\{\.\.\.PRESS_PROPS\}/.test(code("components/community/member/wall.tsx")) && /\.\.\.PRESS_PROPS,/.test(code("components/community/member/space-chips.tsx")) && /data-\[pressed\]:opacity-55/.test(code("components/community/member/ui.ts")))
    check("the chips' scroll handler only where the row switches in place (a server page hands it no function)", /\{\.\.\.\(onPick \? \{ onScroll:/.test(code("components/community/member/space-chips.tsx")))
    /* Round 12: a place lands with a fade and a 6px rise; the join bar that a move would have held is portalled to the body. */
    check("what arrives fades in and rises, and no fixed bar rides it", /animate-\[community-place-in_260ms/.test(frame) && /translate:0 6px/.test(frame) && /animate-\[fade-in_200ms/.test(code("components/community/public/public-frame.tsx")) && /createPortal\(bar, document\.body\)/.test(code("components/community/public/join-controls.tsx")))
  }

  /* ── Invite and the social image ─────────────────────────────────────── */
  console.log("\nInvite and the social image")
  {
    check("a few words for each way in", [shareLinkLine({ access: "free" }), shareLinkLine({ access: "paid" }), shareLinkLine({ access: "free", approvalRequired: true }), shareLinkLine({ access: "invite_only" })].every((l) => l.split(/\s+/).length <= 12))
    const sheet = code("components/community/member/invite-sheet.tsx")
    check("Copy link is the one filled button; Share where there is one, Email otherwise", /className=\{cn\(PRIMARY, "min-w-0 flex-1"\)\} onClick=\{\(\) => void copy\(\)\} data-invite-copy="community"/.test(sheet) && /\{canShare \? \(/.test(sheet) && /data-invite-mail=""/.test(sheet))
    check("staff options behind one quiet row, closed at first", /const \[staffOpen, setStaffOpen\] = useState\(false\)/.test(sheet) && /aria-expanded=\{staffOpen\}/.test(sheet) && /inert=\{!staffOpen \|\| undefined\}/.test(sheet))
    const facts: SeoFacts = { slug: "clay", name: "Clay", tagline: "x", description: null, seoTitle: null, seoDescription: null, coverUrl: "https://x.supabase.co/c.webp", logoUrl: null, indexable: true, creatorName: null, shareVersion: "v1" }
    const withCover = previewImages(facts, false)
    check("with a cover: the cover, 1200 by 630 JPEG, for Open Graph and X alike", JSON.stringify(withCover?.twitter) === JSON.stringify([shareCoverUrl("clay", "v1")]) && shareCoverUrl("clay", "v1") === "https://storelib.com/community/clay/cover.jpg?v=v1" && (withCover?.og as { type?: string }[])[0].type === "image/jpeg")
    check("without one: the drawn card (with the invite's words on an invite)", (communityMetadata({ ...facts, coverUrl: null }).openGraph as { images: { url: string }[] }).images[0].url.endsWith("/share.png?v=v1") && (inviteMetadata({ ...facts, coverUrl: null }).openGraph as { images: { url: string }[] }).images[0].url.endsWith("share.png?v=v1&invite=1"))
    const route = code("app/(marketing)/community/[slug]/cover.jpg/route.ts")
    check("cover.jpg: the switch first, nothing for a draft or a suspended one, the drawn card when the cover cannot be read", existsSync("app/(marketing)/community/[slug]/cover.jpg/route.ts") && route.indexOf("communitiesEnabled()") < route.indexOf("loadCommunity(") && /if \(!community \|\| !sharePreviewable\(community\)\) return notFound\(\)/.test(route) && /if \(!base64\) return drawnCard\(request, community\.slug\)/.test(route) && /for \(const source of coverSources\(community\.cover_url\)\)/.test(route) && /sharePicture\(source, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT, "jpeg"\)/.test(route))
  }

  /* ── The About page and the join ─────────────────────────────────────── */
  console.log("\nThe About page and the join")
  {
    const paid = { kind: "paid", billing: "recurring", monthlyCents: 1900, yearlyCents: 19000, priceCents: null, currency: "usd", priceLine: "$19/month", checkout: { month: "/m", year: "/y", once: null } } as unknown as JoinOption
    check("the price apart from what it is per, following the interval", JSON.stringify(priceParts(paid, "month")) === JSON.stringify({ amount: "$19", per: "/month" }) && JSON.stringify(priceParts(paid, "year")) === JSON.stringify({ amount: "$190", per: "/year" }) && bothIntervals(paid))
    check("once and free", JSON.stringify(priceParts({ ...paid, billing: "one_time", priceCents: 24900, monthlyCents: null, yearlyCents: null } as JoinOption, "month")) === JSON.stringify({ amount: "$249", per: "once" }) && priceParts({ ...paid, kind: "free" } as JoinOption, "month")?.amount === "Free")
    /* Round 11 (ask 23): members, active this week, posts in 30 days, courses; Online now only fills a place left empty. */
    /* Round 13 (ask 22): "Active this week" is gone; Online now takes the free place. */
    check("the page's figures: members, posts, courses, online; none of the others when zero", JSON.stringify(aboutFigures({ members: 40, online: 3, admins: 1 }, { activity: { posts30: 12, active7: 9, since: null }, classroom: { total: 3, courses: [] }, creatorBio: null }).map((c) => c.key)) === JSON.stringify(["members", "posts", "courses", "online"]) && JSON.stringify(aboutFigures({ members: 4, online: 0, admins: null }, { activity: { posts30: null, active7: null, since: null }, classroom: null, creatorBio: null }).map((c) => c.key)) === JSON.stringify(["members"]))
    check("since: the month it started", sinceLabel("2025-03-02T00:00:00Z") === "Mar 2025" && sinceLabel(null) === null)
    const C = "c0000000-0000-4000-8000-0000000000b1"
    const recent = new Date(Date.now() - 2 * DAY).toISOString()
    const old = new Date(Date.now() - 90 * DAY).toISOString()
    const db = fakeDb({
      community_feed_posts: [{ id: "p1", community_id: C, status: "published", created_at: recent }, { id: "p2", community_id: C, status: "published", created_at: old }, { id: "p3", community_id: C, status: "removed", created_at: recent }],
      community_members: [{ id: "m1", community_id: C, status: "active", last_active_at: recent }, { id: "m2", community_id: C, status: "active", last_active_at: old }],
      community_courses: [{ community_id: C, product_id: "pr1", position: 1, access: {}, drip_days: null, added_at: "2026-01-01" }, { community_id: C, product_id: "pr2", position: 2, access: {}, drip_days: null, added_at: "2026-01-02" }],
      products: [{ id: "pr1", title: "Throwing", thumbnail_url: null, type: "course", status: "published" }, { id: "pr2", title: "Draft course", thumbnail_url: null, type: "course", status: "draft" }],
      courses: [{ id: "co1", product_id: "pr1" }],
      course_modules: [{ id: "mo1", course_id: "co1" }],
      course_lessons: [{ id: "l1", module_id: "mo1" }, { id: "l2", module_id: "mo1" }],
      creators: [{ id: "cr1", user_id: "u-cr" }],
      profiles: [{ id: "u-cr", bio: "  Potter   and teacher. " }],
    } as never)
    const extras = await aboutExtras(db, { id: C, creator_id: "cr1", created_at: "2025-03-02T00:00:00Z", classroom_enabled: true } as never)
    check("counted from real rows: published posts in 30 days, members active this week", extras.activity.posts30 === 1 && extras.activity.active7 === 1, extras.activity)
    check("the classroom's published courses with their lessons, never a draft", extras.classroom?.total === 1 && extras.classroom.courses[0].title === "Throwing" && extras.classroom.courses[0].lessons === 2, extras.classroom)
    check("the creator's own line, tidied", extras.creatorBio === "Potter and teacher.")
    check("the module says server-only", /^import "server-only"/m.test(readSource("lib/communities/server/about.ts")))
    const controls = code("components/community/public/join-controls.tsx")
    check("joining answers at once: Joining, then You're in, the button never greyed", /setPhase\("joining"\)/.test(controls) && /phase === "joining"/.test(controls) && /You&apos;re in/.test(controls) && /if \(busy \|\| phase !== "idle"\) return/.test(controls))
    check("then one navigation: pushState home when not there, one refresh, no push", /window\.history\.pushState\(null, "", home\)\s*router\.refresh\(\)/.test(controls) && /if \(state === "member"\) \{\s*setPhase\("joined"\)\s*return enterCommunity\(community\.slug, router\)/.test(controls))
    check("the feed arrives at the top (the scroll put back in the swap's commit)", /useLayoutEffect\(\s*\(\) => \(\) => \{\s*if \(phaseRef\.current === "joined"\) window\.scrollTo\(0, 0\)/.test(controls))
    check("the phone's bar: white to the screen's foot, under the tab bar where there is one", /paddingBottom: "calc\(12px \+ var\(--buyer-tabs-h, env\(safe-area-inset-bottom, 0px\)\)\)"/.test(controls) && /fixed inset-x-0 bottom-0 z-40 border-t border-\[#e5e7eb\] bg-white/.test(controls) && !/\[data-join-bar\] \{\s*bottom:/.test(readSource("app/globals.css")))
    check("the body keeps room for the bar above the tab bar only", /body\.style\.paddingBottom = `\$\{Math\.max\(0, el\.offsetHeight - under\)\}px`/.test(controls))
    const page = code("components/community/public/sales-page.tsx")
    check("the sheet: Membership as a pricing card, who runs it, no Learn list", /<PricingCard others=\{others\} \/>/.test(page) && !/<ClassroomPreview /.test(page) && /<CreatorBlock creator=\{c\.creator\} bio=\{extras\?\.creatorBio \?\? null\} \/>/.test(page))
    check("both pages read the extras", ["page.tsx", "about/page.tsx"].every((f) => /const \[extras, askWhy\] = await Promise\.all\(\[aboutExtras\(admin\(\), load\.community\)/.test(code(`app/(marketing)/community/[slug]/${f}`))))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nCopy")
  {
    const mine = [
      "components/community/member/search-rank.ts",
      "components/community/member/search.tsx",
      "components/community/member/shell-frame.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/invite-sheet.tsx",
      "components/community/member/ui.ts",
      "components/community/public/join-controls.tsx",
      "components/community/public/sales-page.tsx",
      "components/community/public/stats-row.tsx",
      "components/community/public/public-frame.tsx",
      "components/community/public/seo.ts",
      "lib/communities/server/about.ts",
      "lib/communities/server/search.ts",
      "app/(marketing)/community/[slug]/cover.jpg/route.ts",
      "scripts/check-community-about.mjs",
      "scripts/render-community-about.tsx",
      "scripts/check-community-frame10.mjs",
    ]
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    const offenders = mine.filter((f) => banned.test(readSource(f)))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
    const client = ["components/community/member/search.tsx", "components/community/member/search-rank.ts", "components/community/public/join-controls.tsx"]
    check("the browser's parts import no server code", client.every((f) => !/server-only|next\/headers|lib\/communities\/server/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
