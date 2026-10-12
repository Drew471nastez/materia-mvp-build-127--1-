/**
 * ===========================================================================
 *  ROUND 18 (C18): A MEMBER'S PROFILE, MADE PROPER
 * ===========================================================================
 *   THE DAYS         the board's window (52 weeks, starting a Sunday), today
 *                    in the viewer's zone, part 125's answer checked (only
 *                    days in the window, whole counts), the weeks as drawn,
 *                    the four fixed shades, the lines a square and the year
 *                    say.
 *   LEVELS           where a member stands and how far to the next level.
 *   THE LOADER       memberBoard: one call to community_member_activity with
 *                    the window and the zone; before part 125 (no such
 *                    function) no grid, the posts counted on their own, no
 *                    comment count, never an error; no standing where points
 *                    are off. loadMemberProfile hands a board for somebody
 *                    else, none for me.
 *   PART 125         the run-now rules: one statement per line, safe to run
 *                    again, server only, notify last, the migration copy, the
 *                    README row, the check column, the built files.
 *   THE PLACE        the taller band, the bigger photo in the creator page's
 *                    viewer, the board between the head and the posts.
 *   VISIT PAGE       a push there and a pop back: armed by the press and by the
 *                    page's own back arrow only, played in the commit that
 *                    takes the page away, the arriving page moving with it,
 *                    translate and opacity only, nothing under reduced motion
 *                    or the app's own edge swipe.
 *   WORDS            no em dashes, none of the banned words, in every file of
 *                    this round.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { fakeDb } from "./_fake-db"
import {
  BOARD_WEEKS,
  addDays,
  boardFrom,
  boardSummary,
  boardTally,
  boardTotals,
  boardWeeks,
  cellLabel,
  levelProgress,
  parseActivityAnswer,
  shadeOf,
  standingOf,
  weekday,
  zoneToday,
  type MemberBoard,
} from "@/lib/communities/member-activity"
import { loadMemberProfile, memberBoard } from "@/lib/communities/server/member-profile"
import { ActivityBoard } from "@/components/community/member/activity-board"
import { armPageMotion, takeArmedMotion } from "@/lib/navigation/page-push"
import type { Viewer } from "@/lib/communities/server/context"

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

const ME = "11111111-1111-4111-8111-111111111111"
const SAM = "22222222-2222-4222-8222-222222222222"
const C1 = "c1c1c1c1-0000-4000-8000-000000000001"
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0)

async function main() {
  console.log("\nThe days")
  {
    const from = boardFrom("2026-10-10")
    check("the window starts on a Sunday", weekday(from) === 0, from)
    check("and covers 52 weeks, this one included", from === "2025-10-12" && addDays(from, 7 * (BOARD_WEEKS - 1)) <= "2026-10-10" && addDays(from, 7 * BOARD_WEEKS) > "2026-10-10", from)
    check("today in the viewer's zone: 23:30 UTC is already tomorrow in Bucharest", zoneToday(Date.UTC(2026, 9, 10, 23, 30), "Europe/Bucharest") === "2026-10-11" && zoneToday(Date.UTC(2026, 9, 10, 23, 30), "UTC") === "2026-10-10")
    check("an unknown zone is UTC", zoneToday(Date.UTC(2026, 9, 10, 23, 30), "Not/AZone") === "2026-10-10")

    const raw = {
      tz: "Europe/Lisbon",
      from: "2025-10-12",
      days: [["2026-10-10", 2, 0, 1], ["2025-10-01", 5, 5, 5], ["2026-10-11", 1, 0, 0], ["2026-02-30", 1, 0, 0], ["2026-03-01", -3, "2", 1.7], ["2026-03-02", 0, 0, 0], "junk", ["2026-01-05", 0, 1, 0]],
      posts: 12,
      comments: "40",
    }
    const parsed = parseActivityAnswer(raw, "2026-10-10", "2025-10-12")
    check("part 125's answer: only real days inside the window, oldest first", JSON.stringify(parsed?.grid.days.map((d) => d[0])) === JSON.stringify(["2026-01-05", "2026-03-01", "2026-10-10"]), parsed?.grid.days)
    check("  counts are whole and never negative", JSON.stringify(parsed?.grid.days[1]) === JSON.stringify(["2026-03-01", 0, 2, 1]), parsed?.grid.days[1])
    check("  the zone and the all time counts come with it", parsed?.grid.tz === "Europe/Lisbon" && parsed?.posts === 12 && parsed?.comments === 40)
    check("  anything else is no answer", parseActivityAnswer(null, "2026-10-10", "2025-10-12") === null && parseActivityAnswer([], "2026-10-10", "2025-10-12") === null && parseActivityAnswer({ days: "x" }, "2026-10-10", "2025-10-12") === null)

    check("four fixed shades: 1, 2 to 3, 4 to 6, 7 and more", [0, 1, 2, 3, 4, 6, 7, 40].map(shadeOf).join(",") === "0,1,2,2,3,3,4,4")
    const grid = { tz: "UTC", from: "2025-10-12", today: "2026-10-10", days: parsed!.grid.days }
    const weeks = boardWeeks(grid)
    check("52 weeks of seven squares", weeks.length === 52 && weeks.every((w) => w.cells.length === 7), weeks.length)
    const cells = weeks.flatMap((w) => w.cells)
    const thursday = boardWeeks({ ...grid, today: "2026-10-08", from: boardFrom("2026-10-08") }).flatMap((w) => w.cells)
    check("the days after today are no squares at all", cells.filter((c) => c.future).length === 0 && thursday.filter((c) => c.future).map((c) => c.day).join(",") === "2026-10-09,2026-10-10")
    check("each square carries its day's counts", cells.find((c) => c.day === "2026-10-10")?.total === 3 && cells.find((c) => c.day === "2026-10-10")?.shade === 2)
    const months = weeks.filter((w) => w.month).map((w) => w.month)
    check("a month is named on the week its 1st falls in, never two in a row", months.length >= 12 && weeks.every((w, i) => !(w.month && weeks[i + 1]?.month)), months)
    check("totals over the year", JSON.stringify(boardTotals(grid)) === JSON.stringify({ posts: 2, comments: 3, likes: 2, total: 7, activeDays: 3 }), boardTotals(grid))
    check("the line under the grid: what they did", boardTally(grid) === "2 posts, 3 comments and 2 likes", boardTally(grid))
    check("  and a new member's", boardTally({ days: [] }) === "Nothing here yet" && boardSummary({ days: [] }) === "Nothing here in the last year yet")
    check("a square says its day and what it holds", cellLabel({ day: "2026-10-07", posts: 1, comments: 0, likes: 3 }, "2026-10-10") === "Wed, Oct 7: 1 post, 3 likes", cellLabel({ day: "2026-10-07", posts: 1, comments: 0, likes: 3 }, "2026-10-10"))
    check("  with its year when it is not this one, and nothing for an empty day", cellLabel({ day: "2025-10-28", posts: 0, comments: 0, likes: 0 }, "2026-10-10") === "Tue, Oct 28, 2025: nothing")
  }

  console.log("\nLevels")
  {
    const steps = [
      { level: 2, name: "Regular", minPoints: 20 },
      { level: 1, name: "Newcomer", minPoints: 0 },
      { level: 3, name: "Contributor", minPoints: 60 },
    ]
    const s = standingOf(2, 40, steps)
    check("their level, its name, the next level", s.level === 2 && s.name === "Regular" && s.floor === 20 && s.next?.level === 3 && s.points === 40, s)
    check("halfway through the level", levelProgress(s) === 0.5)
    const top = standingOf(3, 900, steps)
    check("the top level has no next and a full bar", top.next === null && levelProgress(top) === 1)
    check("nothing stored reads as level 1 with no points", standingOf(null, null, steps).level === 1 && standingOf(null, null, steps).points === 0)
  }

  console.log("\nThe loader")
  {
    const member = { level: 2, points: 40, joined_at: "2026-03-04T10:00:00.000Z" }
    const levels = [
      { community_id: C1, level: 1, name: "Newcomer", min_points: 0 },
      { community_id: C1, level: 2, name: "Regular", min_points: 20 },
      { community_id: C1, level: 3, name: "Contributor", min_points: 60 },
    ]
    const posts = [
      { id: "p1", community_id: C1, author_id: SAM, status: "published", deleted_at: null },
      { id: "p2", community_id: C1, author_id: SAM, status: "deleted", deleted_at: "2026-10-01T00:00:00Z" },
      { id: "p3", community_id: "other", author_id: SAM, status: "published", deleted_at: null },
    ]
    const calls: unknown[] = []
    const withPart = { ...fakeDb({ community_levels: levels, community_feed_posts: posts }) }
    ;(withPart as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args])
      return { data: { tz: "Europe/Lisbon", from: args.p_from, days: [["2026-10-09", 1, 2, 3]], posts: 7, comments: 19 }, error: null }
    }
    const b = await memberBoard(withPart as never, { id: C1, gamification_enabled: true }, member, SAM, { now: NOW, tz: "Europe/Lisbon" })
    const [name, args] = (calls[0] ?? []) as [string, Record<string, unknown>]
    check("one call to community_member_activity, with the window and the zone", calls.length === 1 && name === "community_member_activity" && args.p_community === C1 && args.p_user === SAM && args.p_from === "2025-10-12" && args.p_tz === "Europe/Lisbon", calls)
    check("the grid, the all time counts, when they joined", b.grid?.days.length === 1 && b.grid.today === "2026-10-10" && b.posts === 7 && b.comments === 19 && b.joinedAt === member.joined_at, b)
    check("their standing on the community's levels", b.standing?.level === 2 && b.standing.name === "Regular" && b.standing.next?.name === "Contributor", b.standing)

    const before = { ...fakeDb({ community_levels: levels, community_feed_posts: posts }) }
    ;(before as { rpc: unknown }).rpc = async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.community_member_activity" } })
    const errors: unknown[] = []
    const keep = console.error
    console.error = (...a: unknown[]) => errors.push(a)
    const nb = await memberBoard(before as never, { id: C1, gamification_enabled: true }, member, SAM, { now: NOW, tz: "UTC" })
    console.error = keep
    check("before part 125: no grid, no error, nothing logged", nb.grid === null && errors.length === 0, errors)
    check("  their published posts here counted on their own, and no comment count", nb.posts === 1 && nb.comments === null, nb)
    check("  the standing is still there", nb.standing?.level === 2)

    const off = { ...fakeDb({ community_levels: levels }) }
    ;(off as { rpc: unknown }).rpc = async () => ({ data: { days: [], posts: 0, comments: 0 }, error: null })
    const ob = await memberBoard(off as never, { id: C1, gamification_enabled: false }, member, SAM, { now: NOW, tz: "UTC" })
    check("points switched off: no level, no points", ob.standing === null && !!ob.grid)
    const throws = { ...fakeDb({}) }
    ;(throws as { rpc: unknown }).rpc = async () => {
      throw new Error("network")
    }
    const tb = await memberBoard(throws as never, { id: C1, gamification_enabled: false }, member, SAM, { now: NOW, tz: "UTC" })
    check("a call that throws is no grid, never an error", tb.grid === null)

    /* loadMemberProfile: somebody else gets a board; my own profile is the account page and gets none. */
    const community = { id: C1, slug: "clay", name: "Clay", logo_url: null, status: "published", archived_at: null, suspended_at: null, deleted_at: null, gamification_enabled: true } as never
    const world = () => {
      const db = fakeDb({
        profiles: [
          { id: ME, username: "mia", display_name: "Mia", avatar_url: null, bio: "" },
          { id: SAM, username: "sam", display_name: "Sam", avatar_url: null, bio: "" },
        ],
        community_members: [
          { community_id: C1, user_id: ME, status: "active", role: "member", tier_id: null, level: 1, points: 0, joined_at: "2026-01-01T00:00:00Z", muted_until: null, banned_at: null },
          { community_id: C1, user_id: SAM, status: "active", role: "member", tier_id: null, level: 2, points: 40, joined_at: "2026-03-04T10:00:00Z", muted_until: null, banned_at: null },
        ],
        community_levels: levels,
        community_spaces: [],
        community_feed_posts: [],
      })
      ;(db as { rpc: unknown }).rpc = async (_n: string, a: Record<string, unknown>) => ({ data: { tz: "UTC", from: a.p_from, days: [], posts: 0, comments: 0 }, error: null })
      return db
    }
    const viewer = { userId: ME, member: { community_id: C1, user_id: ME, status: "active", role: "member", level: 1, points: 0, joined_at: "2026-01-01T00:00:00Z" }, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null } as unknown as Viewer
    const theirs = await loadMemberProfile(world() as never, community, viewer, "sam", NOW)
    check("somebody else's profile carries their board", !!theirs?.board && theirs.board.standing?.level === 2 && theirs.board.posts === 0 && !!theirs.board.grid, theirs?.board)
    const mine = await loadMemberProfile(world() as never, community, viewer, "me", NOW)
    check("my own carries none (it is the account page)", !!mine && !mine.board)
  }

  console.log("\nPart 125")
  {
    const part = read("supabase/sql/run-now/125_community_member_activity.sql")
    const lines = part.trimEnd().split("\n")
    check("a comment, then one statement per line, notify last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';", lines.length)
    check("safe to run again: CREATE INDEX IF NOT EXISTS inside a check for the table, CREATE OR REPLACE", /DO \$do\$ BEGIN IF to_regclass\('public\.community_feed_comments'\) IS NULL THEN RAISE NOTICE [^;]+; RETURN; END IF; CREATE INDEX IF NOT EXISTS community_feed_comments_author_idx ON public\.community_feed_comments \(author_id, created_at DESC\); END \$do\$;/.test(part) && /CREATE OR REPLACE FUNCTION public\.community_member_activity\(p_community uuid, p_user uuid, p_from date, p_tz text DEFAULT 'UTC'\) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public/.test(part))
    check("server only", /REVOKE ALL ON FUNCTION public\.community_member_activity\(uuid, uuid, date, text\) FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT EXECUTE ON FUNCTION public\.community_member_activity\(uuid, uuid, date, text\) TO service_role;/.test(part))
    check("reads each table on its author or user index, in this community, published and not deleted", /p\.author_id = p_user AND p\.created_at >= v_since AND p\.community_id = p_community AND p\.status = 'published' AND p\.deleted_at IS NULL/.test(part) && /c\.author_id = p_user AND c\.created_at >= v_since AND c\.community_id = p_community AND c\.status = 'published' AND c\.deleted_at IS NULL/.test(part) && /r\.user_id = p_user AND r\.created_at >= v_since AND r\.community_id = p_community/.test(part))
    check("never more than 400 days, and an unknown zone is UTC", /- 400\)/.test(part) && /EXCEPTION WHEN others THEN v_tz := 'UTC'/.test(part))
    check("the migration is the same text", read("supabase/migrations/20261218_community_member_activity.sql") === part)
    check("a README row", /\| `125_community_member_activity\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("a p125 column in the check", /to_regprocedure\('public\.community_member_activity\(uuid,uuid,date,text\)'\) is not null and to_regclass\('public\.community_feed_comments_author_idx'\) is not null\) as p125_member_activity/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the built files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes(lines[2]) && read("supabase/sql/all-in-two/1_of_2_everything.sql").includes(lines[2]))
  }

  console.log("\nThe place")
  {
    const view = code("components/community/member/member-profile.tsx")
    /* Round 25 made it taller again (tests/surfaces25.test.ts): 184 and 236 with a picture, 112 and 128 without. */
    check("the band is taller: 184 and 236 with a picture, 112 and 128 without (round 25)", /h-\[184px\] bg-\[#eceef1\] sm:h-\[236px\]/.test(view) && /h-\[112px\] bg-\[#f3f4f6\] sm:h-\[128px\]/.test(view))
    check("the photo is bigger and straddles the band (half of it plus its ring)", /h-\[96px\] w-\[96px\] sm:h-\[112px\] sm:w-\[112px\]/.test(view) && /-mt-\[51px\]/.test(view) && /sm:-mt-\[59px\]/.test(view))
    check("a press on it opens the creator page's own viewer", /import \{ AvatarLightbox \} from "@\/components\/storefront\/avatar-lightbox"/.test(view) && /<AvatarLightbox src=\{person\.avatarUrl\} name=\{person\.name\}>\s*<span[^>]*data-member-profile-avatar=""/.test(view))
    /* Round 25: a member's board between the head and the posts, a creator's under their posts (tests/surfaces25.test.ts). */
    check("the board between the head and the posts, for a member", /<ProfileHead [^>]*\/>\s*\{postsFirst \? null : board\}\s*<div data-profile-panel="posts">/.test(view))

    const full: MemberBoard = {
      grid: { tz: "UTC", from: "2025-10-12", today: "2026-10-10", days: [["2026-10-09", 1, 2, 3], ["2026-06-01", 0, 0, 1]] },
      standing: { level: 3, name: "Contributor", points: 104, floor: 60, next: { level: 4, name: "Insider", minPoints: 150 } },
      joinedAt: "2026-03-04T10:00:00.000Z",
      posts: 38,
      comments: 214,
    }
    const html = renderToStaticMarkup(createElement(ActivityBoard, { board: full, name: "Sam" }))
    check("a square for every day up to today", (html.match(/data-day="/g) ?? []).length === 364, (html.match(/data-day="/g) ?? []).length)
    check("shaded by what that day held", /data-activity-cell="3" data-day="2026-10-09"/.test(html) && /data-activity-cell="1" data-day="2026-06-01"/.test(html))
    check("the newest week first in a reversed row, so it opens at today with no script", /flex-row-reverse/.test(html) && html.indexOf('data-activity-week="2026-10-04"') < html.indexOf('data-activity-week="2025-10-12"'))
    /* Round 25, the owner: "too much text". The level's name and points stay; the sentence to the next level and its bar went. */
    check("level and points, without the way to the next (round 25)", /Level 3/.test(html) && /Contributor/.test(html) && !/points to level 4/.test(html) && !/aria-valuenow/.test(html))
    check("posts, comments, joined", /data-activity-fact="posts"/.test(html) && /data-activity-fact="comments"/.test(html) && /data-activity-fact="joined"/.test(html) && /Mar 2026/.test(html))
    /* Round 25: no sentence under the grid any more; the year is still said to a screen reader. */
    check("the year said to a screen reader", /aria-label="1 post, 2 comments, 4 likes in the last year"/.test(html))
    const before = renderToStaticMarkup(createElement(ActivityBoard, { board: { ...full, grid: null, comments: null }, name: "Sam" }))
    check("before part 125: no grid and no comment count, the rest there", !/data-activity-grid/.test(before) && !/data-activity-fact="comments"/.test(before) && /data-activity-fact="posts"/.test(before) && /data-activity-standing/.test(before))
    const noPoints = renderToStaticMarkup(createElement(ActivityBoard, { board: { ...full, standing: null }, name: "Sam" }))
    check("points off: no level", !/data-activity-standing/.test(noPoints))
    const board = code("components/community/member/activity-board.tsx")
    check("the shades and the dark community's in one place, by attribute", /\[data-community-theme="dark"\] \[data-activity-board\]\{--ab-0/.test(board) && /\[data-activity-cell="4"\]\{background:var\(--ab-4\)\}/.test(board))
    check("12px squares on a phone; from 640px the whole year fits", /\[data-activity-card\]\{--ab-cell:12px;--ab-gap:3px\}/.test(board) && /@media \(min-width:640px\)\{\[data-activity-card\]\{--ab-gap:2px;--ab-cell:clamp\(8px,calc\(\(100cqw - 40px - 26px - 102px\) \/ 52\),13px\)\}\}/.test(board))
    check("days are kept in this device's zone for the next read when there is no cookie yet", /rememberTimeZone\(viewerTimeZone\(\)\)/.test(board))
  }

  console.log("\nVisit page: a push there, a pop back")
  {
    const view = code("components/community/member/member-profile.tsx")
    check("the full page is read ahead in full: after a moment on screen, or at once on a press, hover or focus", /router\.prefetch\(href, \{ kind: FULL \}\)/.test(view) && /window\.setTimeout\(ahead, PAGE_AHEAD_MS\)/.test(view) && /onPointerDown=\{ahead\}/.test(view) && /onMouseEnter=\{ahead\}/.test(view) && /onFocus=\{ahead\}/.test(view))
    check("a plain press arms a push; a press for a new tab does not", /if \(e\.defaultPrevented \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return\s*ahead\(\)\s*armPageMotion\("push"\)/.test(view))
    check("the commit that takes the community away plays it, on the whole frame", /if \(!takeArmedMotion\("push"\)\) return\s*holdPageMotion\(\(el\?\.closest\("\[data-community-shell\]"\)/.test(view))
    const arrival = code("components/profile/profile-arrival.tsx")
    check("the full page comes in with it, else as before", /if \(arriveWithPageMotion\(root\)\) \{/.test(arrival) && /\} else if \(!reduced && arrivesFromCommunity\(prev/.test(arrival))
    /* Round J, the owner on a computer: "When I click Visit page, I don't like that slide animation taking me there. Get rid of it, fully." */
    check("round J: its own slide in from the right is a phone's only; a computer never slides", /\} else if \(!reduced && arrivesFromCommunity\(prev, window\.location\.search\) && window\.matchMedia\?\.\(PAGE_PHONE\)\.matches && typeof root\.animate === "function"\) \{/.test(arrival))
    {
      const push = code("lib/navigation/page-push.ts")
      check("round J: on a computer the old page is held, still, until the arriving page releases it; nothing moves", /if \(wide\) \{[\s\S]*?const waitCap = window\.setTimeout\(fadeOff, WIDE_HOLD_CAP_MS\)\s*hold = \{ release: \(\) => requestAnimationFrame\(\(\) => requestAnimationFrame\(fadeOff\)\) \}\s*wideHold = hold\s*return done\s*\}/.test(push) && /box\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: PAGE_WIDE_FADE_MS/.test(push))
      check("round J: the copy goes in 100ms or less, and waits at most 1.2s for a page that has not come", /export const PAGE_WIDE_FADE_MS = 100/.test(push) && /export const WIDE_HOLD_CAP_MS = 1200/.test(push))
      check("round J: the arriving page releases it and ends its own landing fade, so the two are never seen through each other", /const held = wideHold\s*if \(held && root\) \{\s*wideHold = null\s*endLandingFade\(root\)\s*held\.release\(\)\s*return true\s*\}/.test(push) && /animationName === "app-page-enter"\) a\.finish\(\)/.test(push))
      check("round J: a phone's push and pop are as they were", /move = box\.animate\(\[\{ translate: "0 0" \}, \{ translate: `\$\{-width\}px 0` \}\], timing\)/.test(push) && /move = box\.animate\(\[\{ translate: "0 0" \}, \{ translate: `\$\{width\}px 0` \}\], timing\)/.test(push) && /export const PAGE_PUSH_MS = 380/.test(push) && /export const PAGE_POP_MS = 320/.test(push))
    }
    check("its own back arrow arms a pop, and leaving plays it", /closest\?\.\("\[data-profile-back-button\]"\)\) armPageMotion\("pop"\)/.test(arrival) && /if \(takeArmedMotion\("pop"\)\) holdPageMotion\(root, "pop"\)/.test(arrival))
    const shell = code("components/community/member/shell-frame.tsx")
    check("the community comes back with the pop, not with its push in from outside", /const popped = landing && arriveWithPageMotion\(el\)\s*if \(!popped && landing && el/.test(shell))
    const push = code("lib/navigation/page-push.ts")
    check("translate and opacity only, on the compositor", !new RegExp(["trans", "form"].join("")).test(push) && /translate:/.test(push))
    check("nothing under reduced motion, under the app's edge swipe, or over another still", /if \(reduced\(\) \|\| document\.documentElement\.hasAttribute\("data-edge-swipe"\)\) return nothing/.test(push) && /if \(document\.querySelector\(`\[\$\{STILL_ATTR\}\]`\)\) return nothing/.test(push))
    check("one width in pixels, and the body clipped sideways only while it moves", /const width = html\.clientWidth \|\| window\.innerWidth/.test(push) && /body\.style\.overflowX = "clip"/.test(push) && /body\.style\.overflowX = bodyClip/.test(push))
    check("the copy keeps its sticky bars: laid in the document, scrolled where the window was", /scroller\.scrollTop = y/.test(push))
    check("only a page mounting in the same commit moves with it", /performance\.now\(\) - started\.at > SAME_COMMIT_MS/.test(push))
    armPageMotion("push", 1000)
    check("an armed push is taken once, within a few seconds", takeArmedMotion("push", 2000) && !takeArmedMotion("push", 2001))
    armPageMotion("push", 1000)
    check("  a stale one is not played", !takeArmedMotion("push", 9000))
    armPageMotion("pop", 1000)
    check("  a pop is not a push", !takeArmedMotion("push", 1100) && takeArmedMotion("pop", 1100))
  }

  console.log("\nWords")
  {
    const files = [
      "lib/communities/member-activity.ts",
      "lib/communities/server/member-profile.ts",
      "components/community/member/activity-board.tsx",
      "components/community/member/member-profile.tsx",
      "components/profile/profile-arrival.tsx",
      "lib/navigation/page-push.ts",
      "supabase/sql/run-now/125_community_member_activity.sql",
      "scripts/check-member18.mjs",
      "scripts/render-member18.tsx",
      "tests/member18.test.ts",
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
