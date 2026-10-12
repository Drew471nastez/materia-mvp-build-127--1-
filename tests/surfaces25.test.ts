/**
 * ===========================================================================
 *  ROUND 25 (C25B): THE COMMUNITY'S SURFACES
 * ===========================================================================
 * The owner, on phones and on a computer:
 *
 *   PROFILE      a member's profile inside a community: a taller cover, their
 *                level on their photo, a simpler activity card (one standing
 *                line, three facts, the year of squares in the accent's
 *                steps), their bio, and the cover and words they put on their
 *                Storelib page when their own profile has none. A creator's
 *                posts come before their activity.
 *   PICTURES     list pictures through the image route at the slot's size,
 *                shown once decoded with a short fade, and never faded twice
 *                in one tab (components/ui/soft-img.tsx).
 *
 * The geometry and the motion are measured in a browser by
 * scripts/check-surfaces25.mjs; this suite holds the rules.
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { pageLookOf, loadMemberProfile } from "@/lib/communities/server/member-profile"
import { ActivityBoard } from "@/components/community/member/activity-board"
import { LevelBadge } from "@/components/community/member/level-badge"
import { SoftImg, SOFT_IN_MS } from "@/components/ui/soft-img"
import { coverFileWidth } from "@/lib/images/cover-file"
import type { MemberBoard } from "@/lib/communities/member-activity"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* A database of a few tables: select, eq, ilike, in, order, limit, maybeSingle, the shapes the loaders use. */
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, reads: string[] = []) {
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    let cols = "*"
    const q = {
      select(c: string) {
        cols = c
        reads.push(`${table}:${c}`)
        return q
      },
      eq(k: string, v: unknown) {
        rows = rows.filter((r) => r[k] === v)
        return q
      },
      ilike(k: string, v: string) {
        rows = rows.filter((r) => String(r[k] ?? "").toLowerCase() === v.replace(/\\/g, "").toLowerCase())
        return q
      },
      in(k: string, v: unknown[]) {
        rows = rows.filter((r) => v.includes(r[k]))
        return q
      },
      is() {
        return q
      },
      or() {
        return q
      },
      gte() {
        return q
      },
      order() {
        return q
      },
      limit() {
        return q
      },
      range() {
        return q
      },
      /* PostgREST's `alias:column->key` picks one key out of a json column. */
      pick(r: Row) {
        const m = /^(\w+):(\w+)->(\w+)$/.exec(cols.trim())
        if (!m) return r
        const json = r[m[2]] as Record<string, unknown> | null
        return { [m[1]]: json ? json[m[3]] ?? null : null }
      },
      maybeSingle: async () => ({ data: rows[0] ? q.pick(rows[0]) : null, error: null }),
      then(ok: (v: { data: Row[]; error: null; count: number }) => unknown) {
        return Promise.resolve({ data: rows.map((r) => q.pick(r)), error: null, count: rows.length }).then(ok)
      },
    }
    return q
  }
  return { from: query, rpc: async () => ({ data: null, error: { code: "PGRST202", message: "no such function" } }) } as never
}

const ME = "11111111-1111-4111-8111-111111111111"
const SAM = "22222222-2222-4222-8222-222222222222"
const CR = "33333333-3333-4333-8333-333333333333"
const COVER = "https://abc.supabase.co/storage/v1/object/public/covers/x/page.jpg"

async function main() {
  console.log("\nThe cover and the words from their Storelib page")
  {
    const creators = [{ id: CR, user_id: SAM, onboarding_completed: true, cover_url: "https://abc.supabase.co/old-cover.jpg", bio: "From the creators row." }]
    const withHeader = [{ creator_id: CR, page_type: "shop", published_config: { headerSettings: { coverImageUrl: COVER, coverFocalPoint: { x: 30, y: 70 }, coverZoom: 1.4, bio: "Wood fired stoneware." } } }]
    const look = await pageLookOf(fakeDb({ creators, store_builder_configs: withHeader }), SAM)
    check("their page's published cover, with where they placed it", look.cover?.url === COVER && look.cover.crop.x === 30 && look.cover.crop.y === 70 && look.cover.crop.zoom === 1.4, look)
    check("  and the words in their page's header", look.bio === "Wood fired stoneware." && look.hasStorefront === true, look)
    const plain = await pageLookOf(fakeDb({ creators, store_builder_configs: [] }), SAM)
    check("no published header: the creators row's cover, centred, and its bio", plain.cover?.url === "https://abc.supabase.co/old-cover.jpg" && plain.cover.crop.x === 50 && plain.cover.crop.zoom === 1 && plain.bio === "From the creators row.", plain)
    const odd = await pageLookOf(fakeDb({ creators: [{ ...creators[0], cover_url: "http://insecure/x.jpg", bio: "  " }], store_builder_configs: [{ ...withHeader[0], published_config: { headerSettings: { coverImageUrl: "javascript:alert(1)" } } }] }), SAM)
    check("only an https picture, and no empty words", odd.cover === null && odd.bio === null, odd)
    const none = await pageLookOf(fakeDb({ creators: [] }), SAM)
    check("nobody's page: nothing, never an error", none.cover === null && none.bio === null && none.hasStorefront === false)

    const C1 = "c1c1c1c1-0000-4000-8000-000000000001"
    const tables = {
      profiles: [
        { id: ME, username: "me", display_name: "Mia", avatar_url: null, bio: "", cover_url: null },
        { id: SAM, username: "sam", display_name: "Sam", avatar_url: null, bio: "", cover_url: null },
      ],
      community_members: [{ community_id: C1, user_id: SAM, status: "active", role: "owner", tier_id: null, level: 3, points: 104, joined_at: "2026-03-04T10:00:00.000Z", muted_until: null, banned_at: null }],
      creators,
      store_builder_configs: withHeader,
      follows: [],
      community_spaces: [],
      community_feed_posts: [],
    }
    const community = { id: C1, slug: "clay", name: "Clay", gamification_enabled: false, status: "active" } as never
    const viewer = { userId: ME, active: true, member: { role: "member", status: "active" }, signedIn: true } as never
    const data = await loadMemberProfile(fakeDb(tables), community, viewer, "sam", Date.UTC(2026, 9, 10))
    check("the profile in the community draws their page's cover and words when their own profile has none", data?.person.coverUrl === COVER && data?.person.coverCrop.x === 30 && data?.person.bio === "Wood fired stoneware." && data?.person.hasStorefront === true, data?.person)
    const own = await loadMemberProfile(fakeDb({ ...tables, profiles: [tables.profiles[0], { ...tables.profiles[1], bio: "My own words.", cover_url: "https://abc.supabase.co/storage/v1/object/public/covers/x/own.jpg#crop=10,20,1.1" }] }), community, viewer, "sam", Date.UTC(2026, 9, 10))
    check("  their own cover and bio (Settings) come first", own?.person.coverUrl === "https://abc.supabase.co/storage/v1/object/public/covers/x/own.jpg" && own?.person.coverCrop.x === 10 && own?.person.bio === "My own words.", own?.person)
  }

  console.log("\nThe profile's head")
  {
    const view = code("components/community/member/member-profile.tsx")
    check("a taller band: 184 and 236 with a picture, 112 and 128 without", /h-\[184px\] bg-\[#eceef1\] sm:h-\[236px\]/.test(view) && /h-\[112px\] bg-\[#f3f4f6\] sm:h-\[128px\]/.test(view))
    check("their level on their photo, from the board's standing", /<LevelBadge level=\{badge\} size="lg"/.test(view) && /data\.board\.standing\?\.level/.test(view))
    const badge = renderToStaticMarkup(createElement(LevelBadge, { level: 4, size: "lg" }))
    check("  the large mark: 26px on a phone, 28px wider up, at the photo's bottom right", /h-\[26px\]/.test(badge) && /sm:h-\[28px\]/.test(badge) && /bottom-\[3px\] right-\[3px\]/.test(badge) && />4</.test(badge))
    check("the bio shown, up to four lines", /line-clamp-4[^"]*" data-member-profile-bio=""/.test(view))
    check("the cover's file for this screen, never the 1920px one for a phone", coverFileWidth(390, 3) === 1200 && coverFileWidth(390, 2) === 828 && coverFileWidth(1440, 2) === 1920 && coverFileWidth(1440, 1) === 750, [coverFileWidth(390, 3), coverFileWidth(390, 2), coverFileWidth(1440, 2), coverFileWidth(1440, 1)])
    check("a creator's posts before their activity, paged with Show more", /const postsFirst = !!data\.board && \(data\.person\.hasStorefront \|\| data\.person\.role === "owner"\)/.test(view) && /\{postsFirst \? board : null\}/.test(view) && /byButton=\{postsFirst\}/.test(view) && /if \(byButton \|\| !el/.test(view))
  }

  console.log("\nThe activity card")
  {
    const full: MemberBoard = {
      grid: { tz: "UTC", from: "2025-10-12", today: "2026-10-10", days: [["2026-10-09", 1, 2, 5], ["2026-06-01", 0, 0, 1]] },
      standing: { level: 3, name: "Contributor", points: 1240, floor: 60, next: { level: 4, name: "Insider", minPoints: 1500 } },
      joinedAt: "2026-03-04T10:00:00.000Z",
      posts: 38,
      comments: 214,
    }
    const html = renderToStaticMarkup(createElement(ActivityBoard, { board: full, name: "Sam" }))
    const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    check("one standing line: the level's name, its number, the points", /Contributor · Level 3/.test(text) && /1,240 points/.test(text))
    check("  no sentence to the next level and no bar", !/to level 4/.test(text) && !/role="progressbar"/.test(html))
    check("three compact facts", /data-activity-fact="posts"/.test(html) && /data-activity-fact="comments"/.test(html) && /data-activity-fact="joined"/.test(html))
    check("the grid's words: its title only, no Less and More, no sentence under it", /Last 12 months/.test(text) && !/\bLess\b/.test(text) && !/\bMore\b/.test(text) && !/1 post, 2 comments/.test(text))
    check("  the year still said to a screen reader", /aria-label="1 post, 2 comments, 6 likes in the last year"/.test(html))
    const board = code("components/community/member/activity-board.tsx")
    check("the squares in the accent's steps over a cool grey, the dark community's in its light violet", /--ab-0:#eff0f3;--ab-1:rgba\(139,92,246,\.2\);--ab-2:rgba\(139,92,246,\.42\);--ab-3:rgba\(139,92,246,\.7\);--ab-4:#7c3aed/.test(board) && /\[data-community-theme="dark"\] \[data-activity-board\]\{--ab-0:#242833;--ab-1:rgba\(167,139,250/.test(board))
    check("  steps, never a gradient", !/gradient\([^)]*(139,92,246|8b5cf6|7c3aed)/i.test(board))
    check("a pressed day is said in the title row, in place of the shades", /\{shown \? \(\s*<p[^>]*data-activity-line=""/.test(board))
  }

  console.log("\nList pictures")
  {
    const html = renderToStaticMarkup(createElement(SoftImg, { src: "https://abc.supabase.co/storage/v1/object/public/thumbs/a.jpg", width: 64, className: "h-full w-full" }))
    check("through the image route at the slot's width, with 1x 2x 3x files", /src="\/_next\/image\?url=[^"]*&amp;w=128&amp;q=88"/.test(html) && /w=64&amp;q=88 64w/.test(html) && /w=128&amp;q=88 128w/.test(html) && /w=256&amp;q=88 256w/.test(html) && /sizes="64px"/.test(html), html)
    check("lazy and decoded off the main thread", /loading="lazy"/.test(html) && /decoding="async"/.test(html))
    check("hidden until it is decoded, the first time", /opacity:0/.test(html) && /data-soft-img="wait"/.test(html))
    const eager = renderToStaticMarkup(createElement(SoftImg, { src: "https://elsewhere.example/a.jpg", width: 40, eager: true }))
    check("a host the route will not fetch: the file as it is; eager when asked", /src="https:\/\/elsewhere\.example\/a\.jpg"/.test(eager) && !/srcSet|srcset/.test(eager) && /loading="eager"/.test(eager))
    const soft = code("components/ui/soft-img.tsx")
    check("shown after decode(), with a short fade, and never faded twice in one tab", /img\.decode\(\)\.then\(show, show\)/.test(soft) && /SEEN\.has\(file\) \? "seen" : "wait"/.test(soft) && /img\.complete && img\.naturalWidth > 0/.test(soft) && SOFT_IN_MS >= 120 && SOFT_IN_MS <= 220)
  }

  console.log("\nThe tab bar's third icon")
  {
    const bar = code("components/nav/buyer-tab-bar.tsx")
    const ms = Number(/export const SWAP_MS = (\d+)/.exec(bar)?.[1])
    check("a bar that mounts draws its page's glyph on its first frame: no replay of the last bar's after the page landed", !/lastThird/.test(bar) && !/requestAnimationFrame\(\(\) => setShown/.test(bar) && /const here = key === shownKey/.test(bar))
    check("within one bar: one footprint, opacity only, about five frames, eased so the slot never empties", ms > 0 && ms <= 120 && /transition: `opacity \$\{SWAP_MS\}ms \$\{here \? SWAP_IN : SWAP_OUT\}`/.test(bar) && !/scale: here/.test(bar), { ms })
  }

  console.log("\nArrivals that do not force the page's layout")
  {
    const scroll = code("lib/navigation/tab-scroll.ts")
    const top = scroll.slice(scroll.indexOf("export function scrollPageToTop"), scroll.indexOf("export function accountPinnedScroll"))
    check("the top is held by listening for a scroll, not by writing it on every frame", /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(top) && /if \(window\.scrollY > 0\) pin\(\)/.test(top) && !/requestAnimationFrame\(tick\)/.test(top))
    const chrome = code("components/profile/profile-chrome-var.tsx")
    check("the bar's height: read two frames after the arrival, written only when it changed", /frame = requestAnimationFrame\(apply\)/.test(chrome) && /if \(v === written/.test(chrome) && !/\[120, 500, 1500\]/.test(chrome))
    const tabs = code("components/library/library-tabs.tsx")
    check("the library's pill row measures itself in its ResizeObserver, not in the commit", /new ResizeObserver\(\(\) => \{\s*measure\(\)/.test(tabs) && !/useLayoutEffect\(\(\) => \{\s*if \(!shows\) return\s*measure\(\)/.test(tabs))
    const ui = code("components/library/library-ui.ts")
    check("one date formatter for a list, not one per row", /SHORT_DATE \?\?= new Intl\.DateTimeFormat/.test(ui) && !/toLocaleDateString/.test(ui))
  }

  console.log("\nScrolling the community")
  {
    const card = code("components/community/member/post-card.tsx")
    const links = card.match(/<Link [^>]*>/g) ?? []
    check("no link in a feed card fetches its page ahead as it scrolls into view", links.length >= 5 && links.every((l) => /prefetch=\{false\}/.test(l)), links.filter((l) => !/prefetch=\{false\}/.test(l)))
    check("a finger that scrolls reads nothing ahead: a touch waits READ_AHEAD_TOUCH_MS, a scroll's pointercancel stops it", /if \(e\.pointerType !== "touch"\) return readAhead\(\)/.test(card) && /aheadTimer\.current = window\.setTimeout\(readAhead, READ_AHEAD_TOUCH_MS\)/.test(card) && /onPointerCancel=\{\(\) => \{\s*window\.clearTimeout\(aheadTimer\.current\)/.test(card) && /export const READ_AHEAD_TOUCH_MS = (\d+)/.test(card) && Number(/export const READ_AHEAD_TOUCH_MS = (\d+)/.exec(card)?.[1]) <= 120)
    const pull = code("hooks/use-pull-to-refresh.ts")
    check("a finger landing anywhere below the top asks pull to refresh nothing (no queries, no forced layout)", /if \(!enabledRef\.current\) return\s*if \(topKnown && !atTop\) return/.test(pull) && /const setBlocking = \(here: boolean\) => \{\s*topKnown = true\s*atTop = here/.test(pull))
    check("  and where there is no observer the listener behaves as it always did", /\} else \{\s*setBlockingNow\(true\)\s*\}/.test(pull))
  }

  console.log("\nThe library")
  {
    const fade = code("components/account/account-nav-fade.tsx")
    const css = read("app/globals.css")
    check("arriving at the library lands from most of the way there, never a blank first frame", /onLibrary \? "library-land" : LANDING_CLASS/.test(fade) && /@keyframes library-land \{\s*from \{ opacity: 0\.55; \}/.test(css) && /\.library-land \{\s*animation: none;/.test(css))
    for (const f of ["components/library/product-row.tsx", "components/library/library-memberships.tsx", "components/library/library-product.tsx", "components/library/library-receipts.tsx", "components/library/library-reviews.tsx", "components/wishlist/wishlist-content.tsx", "components/courses/courses-index.tsx", "components/account/account-posts.tsx", "components/profile/profile-activity.tsx", "components/community/events/events-page.tsx", "components/community/events/event-detail.tsx"]) {
      const c = code(f)
      check(`${f}: its pictures arrive through SoftImg, no bare <img>`, /<SoftImg/.test(c) && !/<img\b/.test(c))
    }
  }

  console.log("\nWords")
  {
    const files = [
      "lib/communities/server/member-profile.ts",
      "components/community/member/member-profile.tsx",
      "components/community/member/activity-board.tsx",
      "components/community/member/level-badge.tsx",
      "components/ui/soft-img.tsx",
      "lib/images/cover-file.ts",
      "lib/navigation/tab-scroll.ts",
      "components/profile/profile-chrome-var.tsx",
      "components/library/library-tabs.tsx",
      "scripts/check-surfaces25.mjs",
      "scripts/render-surfaces25.tsx",
      "tests/surfaces25.test.ts",
    ]
    const banned = new RegExp(`\\b(${["unl" + "ock", "ele" + "vate", "seam" + "less", "pow" + "erful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
    for (const f of files) {
      const text = read(f)
      check(`${f}: no em dashes, none of the banned words`, !text.includes(String.fromCharCode(0x2014)) && !banned.test(text), (banned.exec(text) ?? [])[0])
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
