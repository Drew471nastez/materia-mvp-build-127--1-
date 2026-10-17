/**
 * ===========================================================================
 *  ROUND 27 (P27): POSTS
 * ===========================================================================
 *   B1 SCHEDULED POSTS CARRY WHAT A POST CARRIES (run-now part 222): pictures,
 *      a GIF, a link card, a video by link, a video and a poll go into a
 *      scheduled post through part 194's own server code on the fake database,
 *      come back in the list, survive a change of the words, are refused when
 *      they would not go up (a video still processing, somebody else's file),
 *      and go up through the ordinary post path at the time with exactly that
 *      media and a poll that ends that many days after it went up. Before
 *      part 222 the words still schedule and a post that carries something
 *      says the part is needed. The orphan sweep keeps what a scheduled post
 *      carries. The part's SQL follows the run-now rules.
 *   I7 THE KEYS DOWN UNDER A FIELD THAT KEPT THE CARET: the comment box's plan
 *      and the sheets' room stop standing in a remembered keyboard once the
 *      platform says the keys went down; the composer's toolbar is carried
 *      down with them (scripts/check-posts27-member.mjs films it).
 *   I1 View in community opens a new tab. I3 the New post pill fades out.
 *   I6 a post with its comments closed keeps its size while its comments are
 *      read, and its "Comments closed" stays on one line.
 *   J4 the wizard's welcome post is the feed's writer (composer-welcome.tsx).
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { checkScheduledInput, checkScheduledPoll, pollToPost, scheduleBody, scheduledThumb } from "@/lib/communities/scheduled-posts"
import { createScheduled, listScheduled, publishDuePosts, updateScheduled } from "@/lib/communities/server/scheduled-posts"
import { keyboardPlan, type KeyboardFacts } from "@/components/community/member/keyboard-plan"

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

const C = "c0000000-0000-4000-8000-000000000027"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const ADMIN = "a0000000-0000-4000-8000-0000000000bb"
const FEED = "f0000000-0000-4000-8000-000000000001"
const VIDEO_READY = "7e000000-0000-4000-8000-000000000001"
const VIDEO_BUSY = "7e000000-0000-4000-8000-000000000002"
const NOW = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

function world() {
  return fakeDb(
    {
      communities: [{ id: C, slug: "kiln", name: "Kiln", creator_id: "e0000000-0000-4000-8000-000000000001", owner_user_id: OWNER, access: "free", visibility: "public", status: "published", chat_enabled: true, member_count: 3, deleted_at: null, suspended_at: null, archived_at: null, platform_hidden: false }],
      community_members: [
        { id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null, joined_at: iso(NOW - 86_400_000) },
        { id: "m-admin", community_id: C, user_id: ADMIN, role: "admin", source: "invite", status: "active", tier_id: null, banned_at: null, joined_at: iso(NOW - 86_400_000) },
      ],
      community_spaces: [{ id: FEED, community_id: C, slug: "general", name: "General", kind: "feed", position: 0, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: iso(NOW) }],
      profiles: [
        { id: OWNER, username: "ana", display_name: "Ana", avatar_url: null, email: "ana@example.com" },
        { id: ADMIN, username: "ben", display_name: "Ben", avatar_url: null, email: "ben@example.com" },
      ],
      media_videos: [
        { id: VIDEO_READY, status: "ready", community_id: C },
        { id: VIDEO_BUSY, status: "processing", community_id: C },
      ],
      community_scheduled_posts: [],
      community_audit_log: [],
    },
    { unique: { community_members: [["community_id", "user_id"]] } },
  )
}

/* What the composer sends now for a post with everything: two pictures, a GIF, a video by link, a link card (last, as the composer puts it). */
const PIC1 = { type: "image", url: "https://abc.supabase.co/storage/v1/object/public/product-images/u/community/c/1700000000000_ab.webp", w: 1200, h: 900 }
const PIC2 = { type: "image", url: "https://abc.supabase.co/storage/v1/object/public/product-images/u/community/c/1700000000001_cd.webp" }
const GIF = { type: "gif", url: "https://media.giphy.com/media/abc/giphy.gif", still: "https://media.giphy.com/media/abc/giphy_s.gif", title: "Kiln" }
const EMBED = { type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
const LINK = { type: "link", url: "https://example.com/glazes", title: "Glazes" }
const POLL = { question: "Which glaze next?", options: ["Celadon", "Tenmoku", "Shino"], multiple: false, closesInDays: 3 }

/* A database without part 222: every read or write naming media or poll on the table is an unknown column, as PostgREST answers it. */
function without222(db: Any): Any {
  return {
    ...db,
    from(table: string) {
      const b = db.from(table)
      if (table !== "community_scheduled_posts") return b
      let bad: { code: string; message: string } | null = null
      const proxy: Any = new Proxy(b, {
        get(t: Any, k: string | symbol) {
          if (k === "then") return (res: Any, rej: Any) => (bad ? Promise.resolve({ data: null, error: bad }).then(res, rej) : t.then(res, rej))
          const v = t[k]
          if (typeof v !== "function") return v
          return (...args: Any[]) => {
            if (k === "select" && typeof args[0] === "string" && /\b(media|poll)\b/.test(args[0])) bad = { code: "42703", message: "column community_scheduled_posts.media does not exist" }
            if ((k === "insert" || k === "update") && args[0] && typeof args[0] === "object" && ("media" in args[0] || "poll" in args[0])) bad = { code: "PGRST204", message: "Could not find the 'media' column of 'community_scheduled_posts' in the schema cache" }
            const r = v.apply(t, args)
            return r === t ? proxy : r
          }
        },
      })
      return proxy
    },
  }
}

async function main() {
  console.log("\nB1: THE POLL A SCHEDULED POST KEEPS")
  {
    const whole = checkScheduledPoll(POLL, true)
    check("a whole poll is kept as it was asked, its end as days", whole.ok && A(whole).value.closesInDays === 3 && A(whole).value.options.length === 3)
    check("a scheduled post's poll needs a question and two choices", !checkScheduledPoll({ question: "", options: ["a", "b"] }, true).ok && !checkScheduledPoll({ question: "Q", options: ["a", "A"] }, true).ok)
    check("a draft keeps a half written one", checkScheduledPoll({ question: "", options: [""] }, false).ok)
    check("only the composer's ends (1, 3, 7 days), anything else is no end", A(checkScheduledPoll({ ...POLL, closesInDays: 5 }, true)).value.closesInDays === null)
    const up = pollToPost(A(whole).value, NOW)
    check("it ends that many days after it goes up, not after it was written", up.closesAt === iso(NOW + 3 * 86_400_000))
    check("no end stays no end", pollToPost({ ...POLL, closesInDays: null }, NOW).closesAt === null)
    const sent = scheduleBody({ spaceId: FEED, title: " Kiln day ", body: "Pictures.", media: [PIC1, GIF] as Any, poll: POLL }, iso(NOW + 3_600_000))
    check("the writer sends the media and the poll with the words", sent.media.length === 2 && sent.poll?.question === POLL.question && sent.title === "Kiln day")
    check("the writer's own check passes it as the server will", checkScheduledInput(sent).ok)
    check("a draft may be only a picture", checkScheduledInput({ media: [PIC1] }).ok && !checkScheduledInput({}).ok)
    check("the list's picture: the first picture, else a GIF's still, a video's poster, a video by link's picture", scheduledThumb([LINK, GIF, PIC1] as Any) === GIF.still && scheduledThumb([PIC1] as Any) === PIC1.url && scheduledThumb([LINK] as Any) === null)
  }

  console.log("\nB1: SCHEDULED WITH EVERYTHING, THROUGH PART 194'S SERVER CODE")
  {
    const db = world()
    const community = db.tables.communities[0] as Any
    const owner = { community, viewer: { userId: OWNER, role: "owner", active: true, perms: null, member: null, isOwner: true } as Any, userId: OWNER }
    const admin = { community, viewer: { userId: ADMIN, role: "admin", active: true, perms: null, member: null } as Any, userId: ADMIN }
    const at = iso(NOW + 2 * 3_600_000)
    const media = [PIC1, PIC2, GIF, EMBED, { type: "video", videoId: VIDEO_READY, poster: PIC2.url, w: 1280, h: 720 }, LINK]
    const made = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Kiln day", body: "Pictures from the firing.", media: media as Any, poll: POLL }, at)))
    check("scheduled with two pictures, a GIF, a video by link, a video, a link card and a poll", made.ok && made.post.status === "scheduled", made)
    const row = db.tables.community_scheduled_posts[0] as Any
    check("the row keeps the media in the post route's own shapes, in order", Array.isArray(row.media) && row.media.map((m: Any) => m.type).join(",") === "image,image,gif,embed,video,link", row.media)
    check("and the poll with its end as days", row.poll?.closesInDays === 3 && row.poll.options.length === 3)
    const listed = A(await listScheduled(db, C, { userId: OWNER, role: "owner" } as Any))
    check("the list has them (part 222 there)", listed.media === true && listed.rows[0].media.length === 6 && listed.rows[0].poll.question === POLL.question)

    const words = A(await updateScheduled(db, owner, made.post.id, { title: "Kiln day, the pictures" }))
    check("changing only the words keeps the media and the poll", words.ok && words.post.media.length === 6 && words.post.poll?.closesInDays === 3)
    const fewer = A(await updateScheduled(db, owner, made.post.id, scheduleBody({ spaceId: FEED, title: "Kiln day", body: "Pictures from the firing.", media: [PIC1, LINK] as Any, poll: null }, at)))
    check("the writer's change replaces them: a picture and the link, no poll", fewer.ok && fewer.post.media.length === 2 && fewer.post.poll === null)

    const busy = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Video", body: "Soon.", media: [{ type: "video", videoId: VIDEO_BUSY }] as Any }, at)))
    check("a video still processing is refused when it is saved, with the post route's words", !busy.ok && /not ready yet/.test(busy.error), busy)
    const bad = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Pic", body: "x", media: [{ type: "image", url: "https://evil.example.com/a.png" }] as Any }, at)))
    check("a picture from anywhere but Storelib's storage is refused", !bad.ok && bad.status === 400)
    const file = { type: "file", assetId: "f1000000-0000-4000-8000-000000000001", name: "glazes.pdf", store: "community" }
    const theirs = A(await updateScheduled(db, admin, made.post.id, { media: [PIC1, file] }))
    check("an admin changing the owner's post may not add a file of their own (it goes up as the owner)", !theirs.ok && theirs.status === 403 && theirs.error === "author_media", theirs)
    const pics = A(await updateScheduled(db, admin, made.post.id, { media: [PIC2, PIC1, LINK] }))
    check("but may change its pictures and link", pics.ok && pics.post.media[0].url === PIC2.url)
    const halfPoll = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Q", body: "x", poll: { question: "", options: ["a"], multiple: false, closesInDays: null } }, at)))
    check("a scheduled post with half a poll is refused; as a draft it is kept", !halfPoll.ok && A(await createScheduled(db, owner, scheduleBody({ spaceId: null, title: "Q", body: "", poll: { question: "", options: ["a"], multiple: false, closesInDays: null } }, null))).ok)

    /* THE JOB AT THE TIME: the post path stood in, to see what it is handed. */
    const handed: Any[] = []
    const make = (async (w: Any, input: Any) => {
      handed.push({ as: w.viewer.userId, ...input, at: Date.now() })
      return { ok: true, value: { id: `post-${handed.length}` } }
    }) as Any
    const full = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Everything", body: "All of it.", media: media as Any, poll: POLL }, at)))
    for (const r of db.tables.community_scheduled_posts as Any[]) if (r.status === "scheduled") r.publish_at = iso(NOW - 60_000)
    const run = await publishDuePosts(db, NOW, 10_000, make)
    const went = handed.find((h) => h.title === "Everything")
    check("the job puts them up through the ordinary post path, as the author", run.published >= 2 && went?.as === OWNER, run)
    check("  with exactly the media the composer would have posted", JSON.stringify(went?.media.map((m: Any) => m.type)) === JSON.stringify(media.map((m) => m.type)) && went.media[0].url === PIC1.url && went.media.at(-1).url === LINK.url)
    check("  and the poll, ending three days from when it went up", went?.poll?.question === POLL.question && Math.abs(Date.parse(went.poll.closesAt) - (went.at + 3 * 86_400_000)) < 5_000, went?.poll)
    check("  marked posted with the post it became", (db.tables.community_scheduled_posts as Any[]).find((r) => r.id === full.post.id)?.status === "published")

    const broken = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Broken", body: "x" }, at)))
    const brokenRow = (db.tables.community_scheduled_posts as Any[]).find((r) => r.id === broken.post.id)
    brokenRow.poll = { question: "Q", options: ["only one"], multiple: false, closesInDays: null }
    brokenRow.publish_at = iso(NOW - 1000)
    await publishDuePosts(db, NOW, 10_000, make)
    check("a poll that cannot go up fails with the reason, never half posted", brokenRow.status === "failed" && /two choices/.test(brokenRow.error) && !handed.some((h) => h.title === "Broken"), brokenRow)

    const now = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Now", body: "Right now", media: [GIF] as Any }, null)))
    const pub = A(await updateScheduled(db, owner, now.post.id, { ...scheduleBody({ spaceId: FEED, title: "Now", body: "Right now", media: [GIF] as Any }, null), publishNow: true }, make))
    check("Post now from a draft goes up with its GIF", pub.ok && pub.post.status === "published" && handed.at(-1)?.media?.[0]?.type === "gif")
  }

  console.log("\nB1: THE WRITER AND THE LIST")
  {
    const kit = code("components/community/creator/composer-schedule.tsx")
    check("round 26's line saying these can only be posted now is gone", !/can only be posted now/.test(raw("components/community/creator/composer-schedule.tsx")) && !/bridge\.extras/.test(kit))
    check("the kit sends the composer's media and poll (scheduleBody of the bridge)", /scheduleBody\(bridge, publishAt\)/.test(kit) && /media: PostMedia\[\]/.test(kit) && /poll: ScheduledPoll \| null/.test(kit))
    check("uploads still going wait, as Post does, and one that failed is never dropped silently", /bridge\.uploading/.test(kit) && /if \(bridge\.failed\)/.test(kit) && /failed: items\.some\(\(u\) => !!u\.error\)/.test(code("components/community/member/composer.tsx")))
    check("before part 222 it names the part instead", /media_not_ready/.test(kit) && /run-now part 222/.test(raw("components/community/creator/composer-schedule.tsx")))
    check("a change of media or poll counts as a change", /JSON\.stringify\(bridge\.media\) !== JSON\.stringify\(item\.media/.test(kit) && /JSON\.stringify\(bridge\.poll\)/.test(kit))
    const composer = code("components/community/member/composer.tsx")
    check("the composer hands over what Post would send (the link card last) and its poll", /media: linkMedia \? \[\.\.\.media, linkMedia\] : media,\s*poll: staffPollOf\(poll\)/.test(composer))
    check("a scheduled post opened to change brings its media, link card and poll back into the writer", /setItems\(kept\.filter\(\(m\) => m\.type !== "link"\)/.test(composer) && /setPoll\(it\.poll \?/.test(composer))
    check("the Posts page tells the writer whether part 222 is in", /media: staffMedia/.test(code("components/community/creator/feed-section.tsx")))
    check("a row shows the post's first picture", /scheduledThumb\(r\.media\)/.test(code("components/community/creator/scheduled-posts-panel.tsx")) && /data-scheduled-thumb/.test(code("components/community/creator/scheduled-posts-panel.tsx")))
    const orphans = code("lib/communities/server/orphans.ts")
    check("the daily sweep keeps pictures and files a scheduled post or a draft carries", (orphans.match(/community_scheduled_posts/g) ?? []).length >= 2 && /missing\(waiting\.error\)/.test(orphans) && /missing\(scheduled\.error\)/.test(orphans))
    check("the job that publishes them is the community cron's", /publishDuePosts\(db, Date\.now\(\), 10_000\)/.test(code("app/api/cron/community/route.ts")))
  }

  console.log("\nB1: PART 222")
  {
    const part = "supabase/sql/run-now/222_community_scheduled_post_media.sql"
    const text = raw(part)
    const lines = text.trimEnd().split("\n")
    check("the part exists, a comment line then one statement per line", existsSync(part) && lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("its DO block is on one line and checks before it changes anything", lines.filter((l) => /^DO /.test(l)).length === 1 && /ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '\[\]'::jsonb/.test(text) && /ADD COLUMN IF NOT EXISTS poll jsonb/.test(text) && (text.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g) ?? []).length === 2)
    check("it skips itself before part 194", /to_regclass\('public\.community_scheduled_posts'\) IS NULL THEN RAISE NOTICE/.test(text))
    check("notify pgrst last", lines.at(-1) === "notify pgrst, 'reload schema';")
    check("the migration is the same text", raw("supabase/migrations/20270131_community_scheduled_post_media.sql") === text)
    check("README row and the check column", /`222_community_scheduled_post_media\.sql`/.test(raw("supabase/sql/run-now/README.md")) && /as p222_community_scheduled_post_media;/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("the combined files carry it", raw("supabase/sql/all-in-two/1_of_2_everything.sql").includes(lines[1]) && raw("supabase/sql/run-four/3_of_4_latest.sql").includes(lines[1]))
    check("the harness writes a scheduled post with media and a poll", /f222/.test(raw("scripts/sql-harness/app-writes.sql")))
  }

  console.log("\nI7: THE KEYS DOWN UNDER A FIELD THAT KEPT THE CARET")
  {
    const base: KeyboardFacts = { layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, native: 0, table: 336, published: 0 }
    const app = keyboardPlan("ios-app", base)
    check("before (the bug): the app's box stays up a keyboard's height with no keys under it", app.foot === 336 && app.source === "table")
    check("the keys said gone: the app's box is down (what the visible part says)", keyboardPlan("ios-app", { ...base, gone: true }).foot === 0)
    check("the plugin's build too, its height 0 after keyboardWillHide", keyboardPlan("ios-app-plugin", { ...base, gone: true }).foot === 0 && keyboardPlan("ios-app-plugin", { ...base, gone: true }).holdScroll === false)
    check("with the keys up the plan is as it was", keyboardPlan("ios-app", { ...base, vvH: 508 }).foot === 336 && keyboardPlan("ios-app-plugin", { ...base, native: 380 }).foot === 380)
    const vb = code("components/community/member/visible-box.ts")
    check("the sheets' room is nothing once the platform said the keys went down", /if \(keysGone\) return 0\s*const native = nativeKeyboardHeight\(\)/.test(vb))
    check("said by the visible part growing back after it had shown keys, or by the plugin's hide", /else if \(keysUp && k <= RESIZED_MIN_PX\)/.test(vb) && /watchNativeKeyboard\(\(\) => \{/.test(vb) && /keysGone = true/.test(vb))
    check("asked for again by a new focus or a finger on the field (not by the window coming back)", /if \(keysGone && e\.target === goneOn\) return/.test(vb) && /document\.addEventListener\("touchend"/.test(vb))
    check("the comment box's plan reads the same fact", /gone: typing && keyboardGone\(\)/.test(vb))
    check("the plugin's own hide is heard once it has gone too", /keyboardDidHide/.test(code("components/community/member/native-keyboard.ts")))
    const follow = code("components/community/member/toolbar-follow.ts")
    check("the composer's toolbar is carried down with the keys", /useToolbarFollowsKeys\(sheet && sheetUp, toolbarOf, sheetScope\)/.test(code("components/community/member/composer.tsx")))
    check("  downward only, on translate, on the keyboard's curve; going up is left to the room made in the focus", /from > 0 && !run/.test(follow) && /translate: `0 \$\{from\}px`/.test(follow) && /KEYS_EASE/.test(follow))
    check("  Done starts it at once, from numbers kept by the observer (nothing read off a page a blur just restyled)", /e\.relatedTarget/.test(follow) && /foot - placed/.test(follow) && !/getBoundingClientRect[\s\S]*onFocusOut = /.test(follow.slice(follow.indexOf("const onFocusOut"))))
    check("the probe for it exists", existsSync("scripts/check-posts27-member.mjs"))
  }

  console.log("\nI1, I3, I6, J4")
  {
    check("I1: View in community in the opened post opens a new tab", /<Link href=\{hands\.communityHref\(post\)\} prefetch=\{false\} target="_blank" rel="noopener"/.test(code("components/community/creator/post-viewer.tsx")))
    check("I1: and from the row's menu", /href: hrefOf\(r\), target: "_blank" \}/.test(code("components/community/creator/feed-section.tsx")))
    const live = code("components/community/member/feed-live.tsx")
    check("I3: the New post pill stays drawn while it fades and rises away, then goes", /const count = n \|\| shown/.test(live) && /opacity: 0, translate: "0 -8px"/.test(live) && /setShown\(0\)/.test(live))
    check("I3: on its way out it cannot be pressed", /pointerEvents: n \? "auto" : "none"/.test(live))
    const comments = code("components/community/member/comments.tsx")
    check("I6: the room kept for a closed post's comments is the line's, not the box's", /export function commentsRoom\(expected: number, closed = false\)/.test(comments) && /if \(closed\) return CLOSED_LINE_PX \+ 16/.test(comments))
    check("I6: the opened post asks for it when nobody can comment", /closed=\{readOnly \|\| !viewer\.can\.comment \|\| \(post\.locked && !viewer\.can\.lock\)\}/.test(code("components/community/member/post-overlay.tsx")))
    check("I6: while the comments are read the closed line's room is kept", /open \? commentsRoom\(expected\) - 44 : commentsRoom\(expected, true\) - CLOSED_LINE_PX/.test(comments))
    const card = code("components/community/member/post-card.tsx")
    check("I6: \"Comments closed\" on one line, the Comment button keeping its count only", /shrink-0 items-center gap-1 whitespace-nowrap/.test(card) && /post\.commentCount > 0 \|\| !post\.locked \?/.test(card))
    const welcome = code("components/community/member/composer-welcome.tsx")
    check("J4: the welcome post writer is the feed's: its title and words fields, MentionTextarea and Emoji control", /export function WelcomePostWriter/.test(welcome) && /className=\{TITLE_FIELD\}/.test(welcome) && /className=\{WORDS_FIELD\}/.test(welcome) && /<MentionTextarea/.test(welcome) && /<EmojiControl/.test(welcome))
    check("J4: it posts nothing itself (the wizard sends it with the community) and asks no server", !/\bapi\(|fetch\(|requestJson/.test(welcome))
    check("J4: with no community, nobody is looked up to mention", /if \(!at \|\| !communityId\)/.test(code("components/community/member/mention-input.tsx")))
  }

  console.log("\nCOPY")
  {
    const BANNED = /\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
    for (const f of [
      "components/community/member/toolbar-follow.ts",
      "components/community/member/composer-welcome.tsx",
      "components/community/creator/composer-schedule.tsx",
      "lib/communities/scheduled-posts.ts",
      "lib/communities/server/scheduled-posts.ts",
      "supabase/sql/run-now/222_community_scheduled_post_media.sql",
      "scripts/check-posts27-member.mjs",
      "scripts/check-posts27.mjs",
    ]) {
      if (!existsSync(f)) continue
      const text = raw(f)
      check(`${f}: no em dash, no banned word`, !text.includes("—") && !BANNED.test(text))
    }
  }

  /* Last: the server remembers a database without part 222 for a few minutes. */
  console.log("\nB1: BEFORE PART 222")
  {
    const db = without222(world())
    const community = db.tables.communities[0] as Any
    const owner = { community, viewer: { userId: OWNER, role: "owner", active: true, perms: null, member: null, isOwner: true } as Any, userId: OWNER }
    const at = iso(NOW + 3_600_000)
    const words = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Words", body: "Only words." }, at)))
    check("a post with only words schedules as before", words.ok && words.post.status === "scheduled" && words.post.media.length === 0, words)
    const pics = A(await createScheduled(db, owner, scheduleBody({ spaceId: FEED, title: "Pics", body: "x", media: [PIC1] as Any }, at)))
    check("one with a picture says the part is needed (nothing dropped)", !pics.ok && pics.status === 503 && pics.error === "media_not_ready", pics)
    const listed = A(await listScheduled(db, C, { userId: OWNER, role: "owner" } as Any))
    check("the list reads, saying part 222 is not in", listed.ready === true && listed.media === false && listed.rows.length === 1)
    const handed: Any[] = []
    const make = (async (_w: Any, input: Any) => {
      handed.push(input)
      return { ok: true, value: { id: "post-x" } }
    }) as Any
    for (const r of db.tables.community_scheduled_posts as Any[]) r.publish_at = iso(NOW - 1000)
    const run = await publishDuePosts(db, NOW, 10_000, make)
    check("and the job still puts it up, with no media", run.published === 1 && handed[0]?.media.length === 0 && handed[0]?.poll === null, run)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
