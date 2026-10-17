/**
 * ===========================================================================
 *  ROUND 26: THE COMMUNITY ADMIN'S POSTS
 * ===========================================================================
 *   ZONE       the day and time the writer shows and sends are the creator's
 *              zone (Settings), not the device's: 09:30 in Warsaw is 07:30Z in
 *              October, 08:30Z in March; the same wall clock in New York is
 *              another instant; a round trip keeps the minute
 *   ROUND TRIP what the writer sends (scheduleBody, the same function the kit
 *              uses) through part 194's own server code on the fake database:
 *              schedule, the list, reschedule, make it a draft, schedule again,
 *              post now, delete; the server's checks are the writer's checks
 *   ONE WRITER the Scheduled and drafts list has no form of its own; the
 *              writer is the member composer with `staff` from the admin only
 *   THE MOVE   the composer slides what follows its host wrapper, the admin's
 *              wrapper is marked, the fold ends on its own finish; Escape
 *              cancels in place
 *   THE POPUP  a row opens the community's own post popup with the admin's
 *              actions, not the side sheet; the popup keeps the admin's address
 *
 * scripts/check-posts26.mjs measures and films the screens.
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { checkScheduledInput, fromLocalParts, localParts, scheduleBody, suggestedPublishAt } from "@/lib/communities/scheduled-posts"
import { createScheduled, deleteScheduled, listScheduled, updateScheduled } from "@/lib/communities/server/scheduled-posts"

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
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const A = (x: unknown) => x as Any

const C = "c0000000-0000-4000-8000-000000000026"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const FEED = "f0000000-0000-4000-8000-000000000001"
const ANN = "f0000000-0000-4000-8000-000000000002"
const NOW = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

function world() {
  return fakeDb(
    {
      communities: [{ id: C, slug: "writers", name: "Writers", creator_id: "e0000000-0000-4000-8000-000000000001", owner_user_id: OWNER, access: "free", visibility: "public", status: "published", chat_enabled: true, member_count: 3, deleted_at: null, suspended_at: null, archived_at: null, platform_hidden: false }],
      community_members: [{ id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null, joined_at: iso(NOW - 86_400_000) }],
      community_spaces: [
        { id: FEED, community_id: C, slug: "general", name: "General", kind: "feed", position: 0, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: iso(NOW) },
        { id: ANN, community_id: C, slug: "announcements", name: "Announcements", kind: "announcements", position: 1, view_access: {}, post_role: "admin", comments_enabled: true, archived_at: null, created_at: iso(NOW) },
      ],
      profiles: [{ id: OWNER, username: "ana", display_name: "Ana", avatar_url: null, email: "ana@example.com" }],
      community_scheduled_posts: [],
      community_audit_log: [],
    },
    { unique: { community_members: [["community_id", "user_id"]] } },
  )
}

/* The day after `ms` in a zone, as the writer's Day field holds it. */
const dayIn = (ms: number, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))

async function main() {
  console.log("\nZONE: the creator's, not the device's")
  {
    check("09:30 in Warsaw in October is 07:30Z", fromLocalParts("2026-10-22", "09:30", "Europe/Warsaw") === "2026-10-22T07:30:00.000Z")
    check("09:30 in Warsaw in March (winter time) is 08:30Z", fromLocalParts("2026-03-10", "09:30", "Europe/Warsaw") === "2026-03-10T08:30:00.000Z")
    check("09:30 in New York is another instant", fromLocalParts("2026-10-22", "09:30", "America/New_York") === "2026-10-22T13:30:00.000Z")
    const at = "2026-10-22T07:30:00.000Z"
    const [d, t] = localParts(at, undefined, "Europe/Warsaw")
    check("an instant reads back as the zone's day and time", d === "2026-10-22" && t === "09:30", [d, t])
    check("and as another zone's", localParts(at, undefined, "America/New_York").join(" ") === "2026-10-22 03:30")
    check("a round trip keeps the minute in any zone", ["Europe/Warsaw", "Asia/Kolkata", "America/Los_Angeles", "UTC"].every((z) => fromLocalParts(...(localParts(at, undefined, z) as [string, string]), z) === at))
    check("not a day or a time: nothing", fromLocalParts("x", "10:00", "Europe/Warsaw") === null && fromLocalParts("2026-13-01", "10:00", "Europe/Warsaw") === null && fromLocalParts("2026-10-01", "25:00", "Europe/Warsaw") === null)
    check("without a zone, the browser's as before", fromLocalParts("2026-10-22", "09:30") === new Date("2026-10-22T09:30:00").toISOString())
    const s = suggestedPublishAt(Date.UTC(2026, 9, 16, 9, 7), "Europe/Warsaw")
    check("Schedule starts an hour ahead on the zone's next quarter hour (11:07 Warsaw: 12:15)", s === "2026-10-16T10:15:00.000Z", s)
    check("Asia/Kolkata's half hour offset keeps the quarter on its own clock", localParts(suggestedPublishAt(Date.UTC(2026, 9, 16, 9, 7), "Asia/Kolkata"), undefined, "Asia/Kolkata")[1].endsWith(":45"))
  }

  console.log("\nROUND TRIP: what the writer sends, through part 194's server code")
  {
    const db = world()
    const community = db.tables.communities[0] as Any
    const viewer = { userId: OWNER, role: "owner", active: true, perms: null, member: null, isOwner: true } as Any
    const a = { community, viewer, userId: OWNER }
    const zone = "Europe/Warsaw"
    const day = dayIn(NOW + 2 * 86_400_000, zone)
    const fields = { spaceId: FEED, title: "  Friday call notes ", body: "Bring one page.\n" }

    const at = fromLocalParts(day, "09:30", zone)!
    const sent = scheduleBody(fields, at)
    check("the writer sends the words trimmed, the space and the instant", sent.title === "Friday call notes" && sent.body === "Bring one page." && sent.spaceId === FEED && sent.publishAt === at)
    check("the writer's own check passes it as the server will", checkScheduledInput(sent).ok)
    const made = A(await createScheduled(db, a, sent))
    check("scheduled", made.ok && made.post.status === "scheduled" && made.post.publishAt === at, made)
    const listed = await listScheduled(db, C, { userId: OWNER, role: "owner" } as Any)
    check("the list has it, at that instant, 09:30 in the zone", listed.rows.length === 1 && localParts(listed.rows[0].publishAt, undefined, zone)[1] === "09:30")

    const later = fromLocalParts(day, "10:45", zone)!
    const moved = A(await updateScheduled(db, a, made.post.id, scheduleBody(fields, later)))
    check("rescheduled: the same row, 10:45", moved.ok && moved.post.id === made.post.id && moved.post.status === "scheduled" && moved.post.publishAt === later)

    const drafted = A(await updateScheduled(db, a, made.post.id, scheduleBody(fields, null)))
    check("Make it a draft: the schedule is cancelled, the words kept", drafted.ok && drafted.post.status === "draft" && drafted.post.publishAt === null && drafted.post.title === "Friday call notes")

    const again = A(await updateScheduled(db, a, made.post.id, scheduleBody({ ...fields, spaceId: ANN }, later)))
    check("scheduled again, into Announcements", again.ok && again.post.status === "scheduled" && again.post.spaceName === "Announcements")

    const posted: string[] = []
    const make = (async (_w: Any, input: Any) => {
      posted.push(input.title)
      return { ok: true, value: { id: `post-${posted.length}` } }
    }) as Any
    const now = A(await updateScheduled(db, a, made.post.id, { ...scheduleBody(fields, null), publishNow: true }, make))
    check("Post now: up through the ordinary post path, with the post it became", now.ok && now.post.status === "published" && now.post.postId === "post-1" && posted[0] === "Friday call notes", now)

    const second = A(await createScheduled(db, a, scheduleBody({ spaceId: FEED, title: "Delete me", body: "Soon gone." }, fromLocalParts(day, "08:00", zone))))
    const gone = await deleteScheduled(db, a, second.post.id)
    check("Delete: the row is gone", gone.ok && !db.tables.community_scheduled_posts.some((r: Any) => r.id === second.post.id))

    const draftOnly = A(await createScheduled(db, a, scheduleBody({ spaceId: null, title: "", body: "Half an idea" }, null)))
    check("Save draft: half written and with no space is fine", draftOnly.ok && draftOnly.post.status === "draft")

    const past = scheduleBody(fields, fromLocalParts(dayIn(NOW - 86_400_000, zone), "09:30", zone))
    const pastChecked = checkScheduledInput(past)
    const pastServer = A(await createScheduled(db, a, past))
    check("a time in the past: the writer and the server both refuse it, on the time", !pastChecked.ok && A(pastChecked).field === "when" && !pastServer.ok && pastServer.field === "when")
    const noTitle = scheduleBody({ ...fields, title: " " }, at)
    check("no title: refused on the title, the field the writer brings the caret to", A(checkScheduledInput(noTitle)).field === "title" && A(await createScheduled(db, a, noTitle)).field === "title")
  }

  console.log("\nONE WRITER")
  {
    const panel = code("components/community/creator/scheduled-posts-panel.tsx")
    check("the list keeps no form of its own: no sheet, no fields, no second writer", !/<FormSheet/.test(panel) && !/<textarea/.test(panel) && !/type="date"/.test(panel) && !/type="time"/.test(panel) && !/<Confirm/.test(panel))
    check("its rows open the writer, its posted ones the post", /onEdit\(r\)/.test(panel) && /onOpenPost\(r\.postId!\)/.test(panel) && !/router\.push/.test(panel))
    check("its times are the creator's zone", /whenWords\(r\.publishAt\)/.test(panel) && /formatDateTime/.test(code("components/community/creator/composer-schedule.tsx")))
    const kit = code("components/community/creator/composer-schedule.tsx")
    check("the kit writes only to part 194's routes", /\/api\/app\/community\/\$\{bridge\.communityId\}\/scheduled-posts/.test(kit) && !/\/api\/community\//.test(kit))
    check("it checks with the server's own rules and sends what scheduleBody makes", /checkScheduledInput\(/.test(kit) && /scheduleBody\(bridge, publishAt\)/.test(kit))
    check("the day and time are read and written in appTimeZone", /appTimeZone\(\)/.test(kit) && /localParts\(when, undefined, zone\)/.test(kit) && /fromLocalParts\(d, t, zone\)/.test(kit))
    check("what part 194 cannot keep is said, not dropped", /bridge\.extras > 0/.test(kit))
    check("an inert kit without `staff`: a member's composer draws none of it", /const on = !!staff && staff\.ready/.test(kit))
    const composer = code("components/community/member/composer.tsx")
    check("the composer takes `staff` and routes Schedule through the kit", /staff = null/.test(composer) && /useStaffSchedule\(staff,/.test(composer) && /if \(kit\.item \|\| kit\.when\)/.test(composer))
    check("a scheduled post opened never writes over the kept draft", /if \(!open \|\| editing \|\| kit\.item\) return/.test(composer) && /restoreKept\(\)/.test(composer))
    const feed = code("components/community/creator/feed-section.tsx")
    check("only the admin's Posts passes `staff`", /staff=\{staff\}/.test(feed) && !/staff=/.test(code("components/community/member/feed.tsx")) && !/staff=/.test(code("components/community/member/compose-anywhere.tsx")))
  }

  console.log("\nTHE MOVE")
  {
    const composer = code("components/community/member/composer.tsx")
    check("what follows a host wrapper slides with the editor", /hasAttribute\("data-composer-host"\)/.test(composer))
    check("the admin's wrapper is a host", /data-composer-host=""/.test(code("components/community/creator/feed-section.tsx")))
    check("the fold ends on its own finish; the timer only for a tab in the background", /window\.setTimeout\(finish, FOLD_DELAY_MS \+ FOLD_MS \+ 400\)/.test(composer) && /held\.current\[0\]\?\.addEventListener\("finish", finish\)/.test(composer))
    check("Escape is Cancel in place, after a picker's own Escape", /e\.key !== "Escape" \|\| !inPlace \|\| e\.defaultPrevented/.test(composer))
    check("the caret goes back to the field it opened from", /refocus\.current/.test(composer) && /fieldRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(composer))
  }

  console.log("\nTHE POPUP")
  {
    const viewer = code("components/community/creator/post-viewer.tsx")
    check("a row opens the community's own post popup", /<PostOverlay /.test(viewer) && !/SideSheet/.test(viewer) && !/<FormSheet/.test(viewer))
    check("with the admin's address kept", /address=\{null\}/.test(viewer))
    check("and the list's actions over the community's card (its dots hidden)", /data-viewer-action/.test(viewer) && /\[&_\[data-post-more\]\]:hidden/.test(viewer) && /<PostCard /.test(viewer))
    const overlay = code("components/community/member/post-overlay.tsx")
    check("members keep the post's own address (the default)", /address === undefined \? postPath\(slug, given\) : address/.test(overlay))
    const feed = code("components/community/creator/feed-section.tsx")
    check("the Posts list opens it, and the side sheet viewer is gone", /<AdminPostOverlay/.test(feed) && !/<PostViewer/.test(feed))
    check("an announcement says so on its row", /data-feed-announcement=""/.test(feed))
  }

  console.log("\nCOPY")
  {
    const BANNED = /\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
    for (const f of ["components/community/creator/composer-schedule.tsx", "components/community/creator/scheduled-posts-panel.tsx", "components/community/creator/post-viewer.tsx", "components/community/creator/feed-section.tsx", "lib/communities/scheduled-posts.ts", "scripts/check-posts26.mjs", "scripts/render-posts26.tsx"]) {
      const text = raw(f)
      check(`${f}: no em dash, no banned word`, !text.includes("—") && !BANNED.test(text))
    }
    check("the probe and its harness exist", existsSync("scripts/check-posts26.mjs") && existsSync("scripts/render-posts26.tsx"))
    check("the kit imports no server code", !/from "@\/lib\/communities\/server|next\/headers|"server-only"/.test(code("components/community/creator/composer-schedule.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
