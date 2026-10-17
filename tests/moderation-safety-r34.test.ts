/**
 * ===========================================================================
 *  MODERATION, THE COUNT IN THE NAVIGATION, AND LINKS THE SERVER WILL ASK
 * ===========================================================================
 * Round 34, the moderation and safety work:
 *
 *   THE COUNT    the Moderation count is the number of reports that still
 *                need a decision (open and reviewing), it is counted in the
 *                database and not in the browser, every answer from the
 *                moderation route carries it, and the row of tabs and the
 *                section read the same number.
 *   ENFORCEMENT  reporting, removing, approving, dismissing and restricting
 *                run end to end against a database stub, and a restriction
 *                refuses at the server: a muted member cannot post, comment,
 *                chat or send a message, and a banned one cannot read.
 *   NOT THEIRS   a community's own staff take community actions only. The
 *                platform's actions sit behind lib/admin/gate requireAdmin,
 *                and no community route imports it.
 *   LINKS        lib/onepage/embed-source: a pasted link becomes a URL the
 *                server will ask only when the HOST is the service's own.
 *                The control cases are the exact strings that walked through
 *                the substring checks these routes used to make.
 *
 * Run with:  npm run test:push
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { EMBED_HOSTS, appleMusicEmbedUrl, embedSource } from "@/lib/onepage/embed-source"
import { actOnContent, actOnMember, openReportCount, updateReport } from "@/lib/communities/server/moderation"
import { MUTED_ACTIONS } from "@/lib/communities/server/context"
import { checkReport } from "@/lib/communities/server/reports"
import { REVIEW_LIMITS } from "@/lib/reviews/rules"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))
const status = (r: unknown) => (r as { status?: number }).status

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const community = { id: CID, slug: "makers", name: "Makers", status: "published", access: "free" } as unknown as CommunityRow
const OWNER = UID(1)
const MOD = UID(3)
const AUTHOR = UID(4)
const POST = UID(20)
const ROUTE = "app/api/app/community/[id]/moderation/route.ts"
const SHELL = "components/community/creator/community-shell.tsx"
const SECTION = "components/community/creator/moderation-section.tsx"

/* The three people who reported the same post, plus one report about something else. */
function queue() {
  return fakeDb({
    communities: [{ id: CID, name: "Makers", role_permissions: {} }],
    community_members: [
      { id: "m0", community_id: CID, user_id: OWNER, status: "active", role: "owner", source: "owner", tier_id: null },
      { id: "m2", community_id: CID, user_id: MOD, status: "active", role: "moderator", source: "free", tier_id: null },
      { id: "m3", community_id: CID, user_id: AUTHOR, status: "active", role: "member", source: "free", tier_id: null },
    ],
    community_feed_posts: [{ id: POST, community_id: CID, author_id: AUTHOR, status: "published", title: "Buy now", body_text: "buy now", pinned: false, locked: false, featured: false, space_id: UID(30) }],
    community_feed_comments: [{ id: UID(40), community_id: CID, post_id: POST, author_id: AUTHOR, status: "published", body: "and again" }],
    community_reports: [
      { id: UID(50), community_id: CID, reporter_id: UID(10), target_type: "post", target_id: POST, reason: "spam", note: null, status: "open", resolution: null, created_at: "2026-10-01T00:00:00Z" },
      { id: UID(51), community_id: CID, reporter_id: UID(11), target_type: "post", target_id: POST, reason: "spam", note: null, status: "reviewing", resolution: null, created_at: "2026-10-02T00:00:00Z" },
      { id: UID(52), community_id: CID, reporter_id: UID(12), target_type: "post", target_id: POST, reason: "abuse", note: null, status: "open", resolution: null, created_at: "2026-10-03T00:00:00Z" },
      { id: UID(53), community_id: CID, reporter_id: UID(13), target_type: "comment", target_id: UID(40), reason: "off_topic", note: null, status: "open", resolution: null, created_at: "2026-10-04T00:00:00Z" },
      /* Already decided: never an actionable item again. */
      { id: UID(54), community_id: CID, reporter_id: UID(14), target_type: "member", target_id: AUTHOR, reason: "other", note: null, status: "resolved", resolution: "Resolved", created_at: "2026-09-01T00:00:00Z" },
      { id: UID(55), community_id: CID, reporter_id: UID(15), target_type: "member", target_id: AUTHOR, reason: "other", note: null, status: "dismissed", resolution: "Dismissed", created_at: "2026-09-02T00:00:00Z" },
      /* Another community's queue, which this count must never see. */
      { id: UID(56), community_id: UID(99), reporter_id: UID(16), target_type: "post", target_id: UID(21), reason: "spam", note: null, status: "open", resolution: null, created_at: "2026-10-05T00:00:00Z" },
    ],
    community_audit_log: [],
    community_notifications: [],
    community_jobs: [],
    profiles: [],
    creators: [],
  })
}

async function main() {
  /* ── What the count means ────────────────────────────────────────────── */
  console.log("\nthe Moderation count")
  const db = queue()
  const asMod = { userId: MOD, role: "moderator" as const }
  const start = await openReportCount(db, CID)
  check("it is the reports still waiting on a decision: open and reviewing, this community only", start === 4, `counted ${start}, expected 4`)

  const dismissed = await updateReport(db, { community, actor: asMod, id: UID(53), status: "dismissed" })
  const afterDismiss = await openReportCount(db, CID)
  check("dismissing an invalid report takes it out of the count", dismissed.ok && afterDismiss === 3, `${afterDismiss}`)

  /* Removing the post closes every open report about it, so the count falls by three and not by one. */
  const removed = await actOnContent(db, { community, actor: asMod, action: "remove", targetType: "post", targetId: POST, reason: "Reported: spam" })
  const afterRemove = await openReportCount(db, CID)
  check("removing the content closes every report about it, and the count says so", removed.ok && afterRemove === 0, `${afterRemove}`)
  check("the closed reports carry what was done", db.tables.community_reports.filter((r: Record<string, unknown>) => r.target_id === POST).every((r: Record<string, unknown>) => r.status === "resolved" && typeof r.resolution === "string" && (r.resolution as string).length > 0))
  check("the other community's open report was never touched", db.tables.community_reports.find((r: Record<string, unknown>) => r.id === UID(56))?.status === "open")

  /* Approving instead: the post goes back up and the reports close with the decision. */
  const held = queue()
  ;(held.tables.community_feed_posts[0] as Record<string, unknown>).status = "removed"
  ;(held.tables.community_feed_posts[0] as Record<string, unknown>).removed_reason = "Held for review: a new member shared a link"
  const approved = await actOnContent(held, { community, actor: asMod, action: "restore", targetType: "post", targetId: POST })
  check("approving content held for review puts it back", approved.ok && (held.tables.community_feed_posts[0] as Record<string, unknown>).status === "published")
  const closedOne = await updateReport(held, { community, actor: asMod, id: UID(50), status: "resolved", resolution: "Approved" })
  check("and the report closes with the words the moderator chose", closedOne.ok && held.tables.community_reports.find((r: Record<string, unknown>) => r.id === UID(50))?.resolution === "Approved")

  /* Reviewing is not a decision: the item is still waiting, so the count must not move. */
  const reviewing = queue()
  const marked = await updateReport(reviewing, { community, actor: asMod, id: UID(50), status: "reviewing" })
  check("marking a report as reviewing leaves it in the count: it still needs a decision", marked.ok && (await openReportCount(reviewing, CID)) === 4)

  check("every decision is in the audit log", ["report.dismissed", "post.removed"].every((a) => db.tables.community_audit_log.some((x: Record<string, unknown>) => x.action === a)), db.tables.community_audit_log.map((x: Record<string, unknown>) => x.action).join(","))

  /* A database that cannot be read must not invent a number. */
  const broken = fakeDb({ community_reports: [] }, { failWith: { community_reports: { code: "42P01", message: "relation does not exist" } } })
  check("a count that cannot be read answers 0 rather than throwing", (await openReportCount(broken, CID)) === 0)

  /* ── The count travels with every answer ─────────────────────────────── */
  console.log("\nthe route and the row of tabs")
  const route = code(ROUTE)
  check("the route imports the count", /openReportCount/.test(route))
  const handlers = route.split(/export async function /).slice(1)
  check("all three handlers answer with it", handlers.length === 3 && handlers.every((h) => /openReportCount\(/.test(h) && /\bopen\b/.test(h)), handlers.map((h) => h.slice(0, 12)).join("|"))
  check("the queue read counts beside the rows rather than after them", /Promise\.all\(\[\s*\n?\s*listReports\(/.test(route))
  const shell = code(SHELL)
  check("the shell holds one count for the whole screen", /createContext<\{ open: number; setOpen: \(n: number\) => void \} \| null>/.test(shell) && /OpenReports\.Provider/.test(shell))
  check("the Moderation tab draws that number, not the one the page was rendered with", /\{ id: "moderation".*count: openReports \|\| undefined \}/.test(shell) && !/count: head\.openReports/.test(shell))
  check("a section with no shell around it keeps its own copy", /return shared \? \[shared\.open, shared\.setOpen\] : \[own, setOwn\]/.test(shell))
  const section = code(SECTION)
  check("the section writes to the shared count", /useOpenReports\(head\.openReports\)/.test(section) && /from "\.\/community-shell"/.test(section))
  check("and never moves it by hand any more", !/setOpenCount\(\(n\) =>/.test(section), "a minus one in the browser drifts from the queue")
  check("it takes the number the server just counted", /const tell = \(open: unknown\)/.test(section) && (section.match(/\btell\(/g) ?? []).length >= 4)

  /* ── What a report may be, and what it may not ───────────────────────── */
  console.log("\nreporting")
  check("a post, a comment, a member and a message can all be reported", (["post", "comment", "member", "message"] as const).every((t) => checkReport({ targetType: t, targetId: POST, reason: "spam" }).ok))
  check("a target nobody named, or an id that is not one, is refused", !checkReport({ targetType: "thread", targetId: POST, reason: "spam" }).ok && !checkReport({ targetType: "post", targetId: "../../etc", reason: "spam" }).ok)
  check("a reason has to be one of the six", !checkReport({ targetType: "post", targetId: POST, reason: "because" }).ok && checkReport({ targetType: "post", targetId: POST, reason: "illegal" }).ok)
  const long = checkReport({ targetType: "post", targetId: POST, reason: "other", note: "x".repeat(900) })
  const atTheEdge = checkReport({ targetType: "post", targetId: POST, reason: "other", note: "x".repeat(500) })
  check("a note longer than the column is refused, and 500 characters is fine", !long.ok && status(long) === 400 && atTheEdge.ok && (atTheEdge as { value: { note: string | null } }).value.note?.length === 500)
  const upper = checkReport({ targetType: "post", targetId: POST.toUpperCase(), reason: "spam" })
  check("the id is stored one way, so two presses are one report", upper.ok && (upper as { value: { targetId: string } }).value.targetId === POST)

  /* ── A restriction refuses at the server ─────────────────────────────── */
  console.log("\nrestrictions, at the server")
  const ctx = code("lib/communities/server/context.ts")
  check("a mute stops posting, commenting, reacting, chat and uploads", ["post", "comment", "react", "chat", "upload"].every((a) => MUTED_ACTIONS.includes(a as never)))
  check("and messages between members go through the same gate", /requireMember\(db, communityId, await sessionUserId\(\), "chat"\)/.test(code("app/api/community/[communityId]/dms/route.ts")) && /requireMember\(db, communityId, await sessionUserId\(\), "chat"\)/.test(code("app/api/community/[communityId]/dms/[conversationId]/route.ts")))
  check("the gate refuses a muted member before the role is even read", ctx.indexOf('viewer.mutedUntil && MUTED_ACTIONS.includes(action)') < ctx.indexOf("if (!can(viewer.role, action, viewer.perms))"))
  check("a banned or removed member is refused at the same gate", /if \(!viewer\.active\) return answer\(403, viewer\.banned \? "banned"/.test(ctx))
  const mdb = queue()
  const muted = await actOnMember(mdb, { community, actor: asMod, action: "mute", userId: AUTHOR, until: 24 })
  const row = mdb.tables.community_members.find((m: Record<string, unknown>) => m.user_id === AUTHOR) as Record<string, unknown>
  check("a mute is time boxed and written on the membership the gate reads", muted.ok && Date.parse(String(row.muted_until)) > Date.now())
  const banned = await actOnMember(mdb, { community, actor: asMod, action: "ban", userId: AUTHOR, reason: "spam" })
  check("a ban is written there too, with who and why", banned.ok && row.status === "banned" && row.ban_reason === "spam" && row.banned_by === MOD)
  const unbanned = await actOnMember(mdb, { community, actor: asMod, action: "unban", userId: AUTHOR })
  check("unban clears all of it", unbanned.ok && row.status !== "banned" && !row.banned_at)
  const atOwner = await actOnMember(mdb, { community, actor: asMod, action: "ban", userId: OWNER })
  check("a moderator cannot restrict the owner", !atOwner.ok && status(atOwner) === 403)

  /* ── A community's staff are not the platform ────────────────────────── */
  console.log("\nwhat a community's staff cannot do")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f === "route.ts") files.push(p)
    }
  }
  walk("app/api/community")
  walk("app/api/app/community")
  const platformish = files.filter((p) => /requireAdmin|isAdminAuthenticated|admin-session|ADMIN_SECRET/.test(code(p)))
  check("no community route borrows the platform's gate", platformish.length === 0, platformish.join(", "))
  const wrote = files.filter((p) => /platform_hidden|suspended_at:|actor_kind: "platform"|actorKind: "platform"/.test(code(p)))
  check("and none of them suspends or hides a community platform wide", wrote.length === 0, wrote.join(", "))
  const adminRoutes: string[] = []
  const walkAdmin = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walkAdmin(p)
      else if (f === "route.ts") adminRoutes.push(p)
    }
  }
  walkAdmin("app/api/admin/communities")
  walkAdmin("app/api/admin/security")
  check("the platform's own community routes all ask requireAdmin", adminRoutes.length > 0 && adminRoutes.every((p) => /requireAdmin\(\)/.test(code(p))), adminRoutes.join(", "))

  /* ── A pasted link, and the address the server will ask ──────────────── */
  console.log("\nlinks: the host, not a substring")
  /*
    THE CONTROL CASES. Each of these walked through `url.includes('<service>')`,
    which is what the four metadata routes used to decide a link was theirs
    before they fetched it, and what built Apple Music's player address by
    string replacement.
  */
  const walkedThrough = [
    "http://169.254.169.254/latest/meta-data/?x=music.apple.com",
    "http://127.0.0.1:8080/admin?from=music.apple.com",
    "https://music.apple.com.example.com/us/album/x/1",
    "https://example.com/#music.apple.com",
    "http://[::1]/?music.apple.com",
  ]
  check("every address that defeated the substring check is refused now", walkedThrough.every((u) => embedSource(u, EMBED_HOSTS.appleMusic) === null && appleMusicEmbedUrl(u) === null), walkedThrough.filter((u) => embedSource(u, EMBED_HOSTS.appleMusic) !== null).join(", "))
  check("the control case fails the old check, so this test is testing something", walkedThrough.every((u) => u.includes("music.apple.com")))
  check("a scheme that is not http or https cannot become an iframe src or a fetch", [
    "javascript:alert(1)//music.apple.com",
    "data:text/html,<script>1</script>?music.apple.com",
    "file:///etc/passwd#music.apple.com",
    "blob:https://music.apple.com/x",
  ].every((u) => embedSource(u, EMBED_HOSTS.appleMusic) === null && appleMusicEmbedUrl(u) === null))
  check("a host hidden behind credentials is refused", embedSource("https://music.apple.com@evil.example.com/x", EMBED_HOSTS.appleMusic) === null && embedSource("https://a:b@music.apple.com/x", EMBED_HOSTS.appleMusic) === null)
  check("a port that is not the standard one is refused", embedSource("https://music.apple.com:8443/us/album/x/1", EMBED_HOSTS.appleMusic) === null)
  check("and a trailing dot does not make a new host", embedSource("https://music.apple.com./us/album/x/1", EMBED_HOSTS.appleMusic)?.hostname === "music.apple.com")

  /* The links people actually paste still work: a rule that locks them out is worse than the hole it closes. */
  const real: [string, readonly string[]][] = [
    ["https://music.apple.com/us/album/a-song/1234567890?i=1234567891", EMBED_HOSTS.appleMusic],
    ["https://www.music.apple.com/gb/artist/someone/999", EMBED_HOSTS.appleMusic],
    ["http://music.apple.com/us/playlist/mix/pl.123", EMBED_HOSTS.appleMusic],
    ["https://soundcloud.com/someone/a-track", EMBED_HOSTS.soundcloud],
    ["https://m.soundcloud.com/someone", EMBED_HOSTS.soundcloud],
    ["https://on.soundcloud.com/abc123", EMBED_HOSTS.soundcloud],
    ["https://www.tiktok.com/@someone/video/7234567890123456789", EMBED_HOSTS.tiktok],
    ["https://vm.tiktok.com/ZMabcdef/", EMBED_HOSTS.tiktok],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", EMBED_HOSTS.youtube],
    ["https://youtu.be/dQw4w9WgXcQ", EMBED_HOSTS.youtube],
    ["https://www.youtube.com/@someone", EMBED_HOSTS.youtube],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", EMBED_HOSTS.spotify],
  ]
  const refusedReal = real.filter(([u, hosts]) => embedSource(u, hosts) === null)
  check("the links people paste all still go through", refusedReal.length === 0, refusedReal.map(([u]) => u).join(", "))
  check("https is what comes out, whatever went in", embedSource("http://music.apple.com/us/album/x/1", EMBED_HOSTS.appleMusic)?.protocol === "https:")
  check("the path and the query are kept, so a song inside an album is still that song", appleMusicEmbedUrl("https://music.apple.com/us/album/a/1?i=2") === "https://embed.music.apple.com/us/album/a/1?i=2")
  check("the player's address is Apple's own host", appleMusicEmbedUrl("https://music.apple.com/us/album/a/1")?.startsWith("https://embed.music.apple.com/") === true)
  check("junk is refused without throwing", [null, undefined, "", "   ", 7, {}, "not a url", "//music.apple.com/x"].every((u) => embedSource(u, EMBED_HOSTS.appleMusic) === null))

  /* ── The routes that ask somebody else's site ────────────────────────── */
  console.log("\nthe routes that ask somebody else's site")
  for (const name of ["apple-music", "soundcloud", "tiktok", "youtube", "spotify"]) {
    const src = code(`app/api/onepage/${name}/route.ts`)
    check(`${name}: the link is checked by host before anything else happens`, /embedSource\(url, EMBED_HOSTS\./.test(src) && src.indexOf("embedSource(") < src.indexOf("rateLimit("))
    check(`${name}: nothing it does uses the caller's own string`, !/includes\('(music\.apple|tiktok|soundcloud|spotify|youtube)/.test(src), "a substring check is not a host check")
    check(`${name}: counted per address, in Postgres`, /rateLimit\(\{/.test(src) && /addressSubject\(request\)/.test(src) && /bucket: "onepage-embed"/.test(src))
  }
  const scrapers = ["apple-music", "soundcloud", "tiktok"].map((n) => code(`app/api/onepage/${n}/route.ts`))
  check("a page the server reads for a picture cannot hold the function open", scrapers.every((s) => /AbortSignal\.timeout\(SCRAPE_TIMEOUT_MS\)/.test(s)))
  const onepage = code("components/onepage/public-onepage.tsx")
  check("the published page builds the player's address through the same check", /appleMusicEmbedUrl\(url\)/.test(onepage) && !/replace\('music\.apple\.com'/.test(onepage))

  /* ── Reviews: a write is counted ─────────────────────────────────────── */
  console.log("\nreviews")
  const reviewWrites: [string, string[]][] = [
    ["app/api/reviews/route.ts", ["POST"]],
    ["app/api/reviews/[id]/route.ts", ["PATCH", "DELETE"]],
    ["app/api/reviews/[id]/report/route.ts", ["POST"]],
    ["app/api/reviews/[id]/reply/route.ts", ["PUT", "DELETE"]],
  ]
  for (const [file, methods] of reviewWrites) {
    const src = code(file)
    check(`${file}: every write is rate limited`, methods.every((m) => {
      const body = src.split(`export async function ${m}(`)[1] ?? ""
      const next = body.search(/\nexport async function /)
      return /rateLimit\(\{/.test(next === -1 ? body : body.slice(0, next))
    }), "no limit on a write that keeps a row or sends an email")
  }
  const reviewLimits = code("lib/reviews/rules.ts")
  check("the review limits are written down once, in Postgres windows", /REVIEW_LIMITS/.test(reviewLimits) && /seconds:/.test(reviewLimits))

  /* The false positive case: an ordinary person writing an ordinary review is never refused. */
  const write = REVIEW_LIMITS.write[0]
  check("a buyer reviewing three purchases in a row is well inside the limit", write.limit >= 6 && write.seconds <= 600, `${write.limit} in ${write.seconds}s`)
  check("a seller replying to a morning's reviews is too", REVIEW_LIMITS.reply[0].limit >= 20)
  check("and the editor pasting a dozen links is inside the embed limit", 12 < 30)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failures.length) console.log(`failed: ${failures.join(", ")}`)
  if (failed > 0) process.exit(1)
}

void main()
