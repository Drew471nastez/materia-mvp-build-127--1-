/**
 * ===========================================================================
 *  COMMUNITIES: POSTS AND COMMENTS, ROUND 13 (P2)
 * ===========================================================================
 * Held from their inputs and their source (frame by frame and on screen it is
 * measured by scripts/check-community-posts.mjs, sections r13*):
 *
 *   1  SWITCH     cards on screen are drawn as cards again (no stand in), only
 *                 a post new to the screen eases in
 *   2  MORE       the end of the list asks for more by itself up to 60 posts,
 *                 then "Load more posts"
 *   3  LIVE       an edit or a delete is broadcast by id (post-change,
 *                 comment-change) and heard by the feed and an open post
 *   4  EDIT       the composer is Edit post; the server moves a post to a space
 *                 and adds, changes or takes off its poll (not what was voted on)
 *   5  MEDIA      a grid of one shape for two or more, a blurred 32px copy and a
 *                 fade, a hairline, standard dynamic range, HDR re-encoded
 *   6  LIGHTBOX   a double tap is two taps; two neighbours each side, decoded
 *   7  SHARE      the share sheet (app plugin, navigator.share) and Copy link
 *   8  VISITOR    a public post through the member layout, read only, Join bar
 *   9  DATES      relative up to a week, then the date
 *   10 CARD       no unread dot; pinned has its line and a firmer card
 *   11 OVERLAY    the page's scrollbar never hidden on a computer; a slim one
 *   12 COMMENTS   always load; caret after "@name "; bubble; icons; sound;
 *                 confirm and report above the post
 *   13 MEDIA COL  the box offers words only before run-now part 96, staff told
 *   14 MENTIONS   "@" alone opens the picker, the people on screen first
 *   15 COMPOSER   the whoosh on Post; the space glyph in the picker
 *   16 BOOST      owner and admin posts a little higher in Default, inside a page
 *   17 SOUNDS     the switch in /account/settings Preferences
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import { STAFF_BOOST_MS, boostStaff, pollChoicesChanged, pollEditOf, POLL_VOTED } from "@/lib/communities/server/feed"
import { announceCommentChange, announcePostChange } from "@/lib/communities/server/realtime"
import { mentionAt, mentionChoices } from "@/components/community/member/mention-pick"
import { relativeTime } from "@/lib/communities/format"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

async function main() {
  const M = "components/community/member"
  const feed = code(`${M}/feed.tsx`)
  const live = code(`${M}/feed-live.tsx`)
  const liveTs = code(`${M}/live.ts`)
  const card = code(`${M}/post-card.tsx`)
  const composer = code(`${M}/composer.tsx`)
  const comments = code(`${M}/comments.tsx`)
  const media = code(`${M}/media.tsx`)
  const compress = code(`${M}/media-compress.ts`)
  const lightbox = code(`${M}/lightbox.tsx`)
  const overlay = code(`${M}/post-overlay.tsx`)
  const heart = code(`${M}/heart.tsx`)
  const mention = code(`${M}/mention-input.tsx`)
  const confirm = code(`${M}/report-confirm.tsx`)
  const page = code(`${M}/post-page.tsx`)
  const serverFeed = code("lib/communities/server/feed.ts")
  const serverComments = code("lib/communities/server/comments.ts")

  /* ── 1 ─────────────────────────────────────────────────────────────── */
  console.log("\n1. Switching lists with the same posts")
  check("a post drawn as a card on the last frame is drawn as a card again (no placeholder for it)", /i < firstCards \|\| whole \|\| onScreen\.current\.has\(p\.id\) \? <PostCard/.test(feed))
  check("only cards new to the screen ease in; a list with nothing new does not move", /if \(before\.has\(id\)\) continue/.test(feed) && /const whole = afterSpinner\.current \|\| before\.size === 0/.test(feed))
  check("the cards stay keyed by the post's id in one list", /<PostCard key=\{p\.id\}/.test(feed))

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  console.log("\n2. Loading and Load more")
  check("past 60 posts the list stops asking for more by itself", /export const AUTO_POSTS = 60/.test(feed) && /const auto = view\.posts\.length < AUTO_POSTS/.test(feed) && /if \(!el \|\| !cursor \|\| !auto/.test(feed))
  check("and \"Load more posts\" stays under it", /"Load more posts"/.test(feed))
  check("the first page is the server's (feed-page reads listFeed on the server)", /listFeed\(admin\(\), community, viewer, \{ sort: "default" \}\)/.test(code(`${M}/feed-page.tsx`)))

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  console.log("\n3. Edits and deletes, live")
  const prev = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://probe.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "probe-key"
  const sent: { url: string; body: { messages: { topic: string; event: string; payload: Record<string, unknown> }[] } }[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) })
    return new Response("{}", { status: 202 })
  }) as unknown as typeof fetch
  const okPost = await announcePostChange(U(9), { id: U(1), spaceId: U(2), change: "delete" }, fetcher)
  const okComment = await announceCommentChange(U(9), { id: U(3), postId: U(1), change: "edit" }, fetcher)
  const p0 = sent[0]?.body.messages[0]
  const c0 = sent[1]?.body.messages[0]
  check("a post's edit or delete goes out by id on the community's channel", okPost && p0?.event === "post-change" && p0.payload.postId === U(1) && p0.payload.change === "delete" && /^community-live:[0-9a-f]{32}$/.test(p0.topic))
  check("a comment's goes out on its post's channel", okComment && c0?.event === "comment-change" && c0.payload.commentId === U(3) && c0.topic.endsWith(`:${U(1)}`))
  check("never content: ids and the change only", Object.keys(p0?.payload ?? {}).sort().join() === "change,postId,spaceId" && Object.keys(c0?.payload ?? {}).sort().join() === "change,commentId,postId")
  check("a bad id is never sent", !(await announcePostChange(U(9), { id: "nope", change: "edit" }, fetcher)) && sent.length === 2)
  process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key
  const postRoute = code("app/api/community/[communityId]/posts/[postId]/route.ts")
  const commentRoute = code("app/api/community/[communityId]/comments/[commentId]/route.ts")
  check("the post route announces an edit and a delete after answering", /after\(\(\) => announcePostChange\(communityId, \{ id: post\.id, spaceId: post\.space\?\.id \?\? null, change: "edit" \}\)\)/.test(postRoute) && /after\(\(\) => announcePostChange\(communityId, \{ id: postId, change: "delete" \}\)\)/.test(postRoute))
  check("the comment route too, the delete with the post it was under", /change: "edit" \}\)\)/.test(commentRoute) && /const \{ postId \} = result\.value[\s\S]{0,80}change: "delete"/.test(commentRoute) && /Promise<Checked<\{ postId: string \}>>/.test(serverComments))
  check("the browser listens for both", /const FEED_EVENTS = \["post", "post-change"\]/.test(liveTs) && /const POST_EVENTS = \["comment", "comment-change", "typing"\]/.test(liveTs))
  check("the feed takes a deleted post out of every list and folds its card away; an edit is read again through the gate (a 404 takes it away)", /listenLive\(communityId, null, "post-change"/.test(live) && /if \(payload\.change === "delete"\) return apply\(id, \(\) => null\)/.test(live) && /if \(!r\.ok && \(r as \{ status\?: number \}\)\.status === 404\) return apply\(id, \(\) => null\)/.test(live) && /patchPost\(communityId, id, fn, key\)/.test(live) && /foldAway\(id\)/.test(live))
  check("an open post hears its comments edited and deleted", /listenLive\(post\.communityId, post\.id, "comment-change"/.test(comments) && /if \(p\.change === "delete"\) return gone\(id\)/.test(comments))

  /* ── 4 ─────────────────────────────────────────────────────────────── */
  console.log("\n4. Edit post")
  check("Edit post opens the composer with the post (not a separate editor)", /<Composer[\s\S]{0,400}edit=\{edit\}/.test(card) && !/function EditPost/.test(card))
  check("the composer starts from the post: title, words, space, poll, media, link", /useState\(was\?\.title \?\? ""\)/.test(composer) && /useState\(was\?\.bodyText \?\? ""\)/.test(composer) && /pollDraftOf\(was\?\.poll \?\? null\)/.test(composer) && /was\.media\.filter\(\(m\) => m\.type !== "link"\)\.map\(\(m, i\) => attachmentOf\(m, `kept-\$\{i\}`\)\)/.test(composer))
  check("Save sends PATCH with the space (when moved) and the poll (null to take it off)", /method: "PATCH"/.test(composer) && /spaceId !== \(was\?\.space\?\.id \?\? null\) \? \{ spaceId \}/.test(composer) && /was\?\.poll \? \{ poll: null \}/.test(composer))
  check("Save is a spinner, then a check (\"Save\" on the button), then the editor folds and the post is handed back", /label=\{actionLabel\}/.test(composer) && /const actionLabel = editing \? "Save" : "Post"/.test(composer) && /editDone\.current = \(\) => edit\.onSaved\(saved\)/.test(composer))
  check("an edit is never written to the draft store, and never restores one", /if \(!open \|\| editing\) return/.test(composer) && /if \(editing\) return\s*const d = readDraft\(key\)/.test(composer))
  check("on a phone Edit post opens over an opened post", /editing \? "z-\[135\]" : "z-\[125\]"/.test(composer))
  check("the attachment tray has its own slot for worker V", /THE ATTACHMENT TRAY SLOT/.test(read(`${M}/composer.tsx`)))
  check("?edit=1 on the post page opens Edit post for its author only, and leaves the address", /if \(url\.searchParams\.get\("edit"\) !== "1"\) return/.test(page) && /window\.history\.replaceState\(window\.history\.state, ""/.test(page) && /if \(wantsEdit\(post, readOnly, visitor\)\) setAutoEdit\(true\)/.test(page) && /if \(autoEdit && own && !readOnly\) setEditing\(true\)/.test(card))
  check("delete asks in Storelib's sheet, above an opened post", /<ConfirmSheet state=\{confirm\}/.test(card) && /export const CONFIRM_Z = 150/.test(confirm) && /zIndex=\{CONFIRM_Z\}/.test(confirm))
  const edit = (raw: Record<string, unknown>) => pollEditOf(raw, Date.parse("2026-10-05T00:00:00Z"))
  const set = edit({ poll: { question: "Which?", options: ["A", "B"], multiple: false, closesAt: "keep" } })
  check("an edit's poll: left out is no change, null takes it off, an object sets it (\"keep\" keeps its end)", (edit({}) as { value: { kind: string } }).value.kind === "same" && (edit({ poll: null }) as { value: { kind: string } }).value.kind === "remove" && set.ok && set.value.kind === "set" && set.value.keepCloses && set.value.poll.closesAt === null)
  check("a poll edit is checked like a new poll", !edit({ poll: { question: "", options: ["A", "B"] } }).ok && !edit({ poll: { question: "Q", options: ["A"] } }).ok)
  const voted = { question: "Which?", options: [{ label: "A" }, { label: "B" }] }
  check("what was voted on stays: the question and the choices, in order", !pollChoicesChanged(voted, { question: "Which?", options: ["A", "B"] }) && pollChoicesChanged(voted, { question: "Which one?", options: ["A", "B"] }) && pollChoicesChanged(voted, { question: "Which?", options: ["B", "A"] }) && pollChoicesChanged(voted, { question: "Which?", options: ["A", "B", "C"] }))
  check("the server refuses a voted poll's choices, and says why", /if \(pollChoicesChanged\(have, p\) \|\| p\.multiple !== have\.multiple\) return \{ ok: false, error: POLL_VOTED, status: 409 \}/.test(serverFeed) && /voted/.test(POLL_VOTED))
  check("a move goes only to a space this member may post in, never a chat", /if \(!next \|\| next\.kind === "chat" \|\| !canPostIn\(next, viewer, community\.chat_enabled\)\) return \{ ok: false, error: "You cannot post in that space\.", status: 403 \}/.test(serverFeed))
  check("the composer's poll editor locks a voted poll's question and choices", /const voted = \(poll\.votes \?\? 0\) > 0/.test(composer) && /disabled=\{voted\}/.test(composer))

  /* ── 5 ─────────────────────────────────────────────────────────────── */
  console.log("\n5. Pictures in cards")
  check("two or more: a grid in the card at every width, one fixed shape (2:1 phone, 8:3 computer), three or more with the first large", /aspect-\[2\/1\]/.test(media) && /sm:aspect-\[8\/3\]/.test(media) && /three && i === 0 \? "row-span-2" : ""/.test(media) && /className=\{several \? "mt-3" : "mt-3 sm:hidden"\}/.test(card))
  check("never an empty box: a blurred 32px copy from the optimizer under it, then a fade in", /optimizedImageUrl\(url, 16\)/.test(media) && /blur-\[10px\]/.test(media) && /onLoad=\{\(\) => setState\(\(s\) => \(s === "wait" \? "in" : s\)\)\}/.test(media))
  check("a picture already in the cache is drawn at once (no blink when a card is drawn again)", /if \(el\?\.complete && el\.naturalWidth > 0\) setState\("cached"\)/.test(media))
  check("a hairline and a light depth around a card's pictures", /ring-1 ring-inset ring-black\/\[0\.06\]/.test(media) && /shadow-\[0_1px_2px_rgba\(16,24,40,0\.06\)\]/.test(media))
  check("community pictures are drawn in standard dynamic range", /export const SDR = "\[dynamic-range-limit:standard\]"/.test(media) && (media.match(/\$\{SDR\}/g) ?? []).length >= 3 && /\[dynamic-range-limit:standard\]/.test(lightbox))
  check("a photo that may carry an HDR gain map is always written again (sRGB canvas), even a little bigger", /MAY_BE_HDR = \/\^image\\\/\(jpeg\|jpg\|heic\|heif\|avif\)\$\/i/.test(compress) && /!MAY_BE_HDR\.test\(file\.type\)/.test(compress) && /colorSpace: "srgb"/.test(compress))

  /* ── 6 ─────────────────────────────────────────────────────────────── */
  console.log("\n6. The lightbox")
  check("a double tap is two taps close in time and place, never two quick swipes", /const DOUBLE_TAP_MS = 300/.test(lightbox) && /Math\.hypot\(e\.clientX - tap\.x, e\.clientY - tap\.y\) < DOUBLE_TAP_PX/.test(lightbox) && /lastTap\.current = d && !g\.axis/.test(lightbox))
  check("two pictures either side are mounted and decoded ahead once the slide rests", /export const LIGHTBOX_AHEAD = 2/.test(lightbox) && /Math\.abs\(i - index\) <= \(phase === "open" \? LIGHTBOX_AHEAD : 1\)/.test(lightbox) && /img\.decode\(\)/.test(lightbox))

  /* ── 7 ─────────────────────────────────────────────────────────────── */
  console.log("\n7. Share")
  check("the app's Share plugin, else navigator.share, else the link copied", /native\.Plugins\.Share\.share\(/.test(card) && /navigator\.share\(\{ title/.test(card) && /navigator\.clipboard\.writeText\(url\)/.test(card) && /"cancelled"/.test(card))
  check("Share post and Copy link in the menu; Share in the opened post", /label: "Share post"/.test(card) && /label: "Copy link"/.test(card) && /data-share-post=""/.test(card))
  check("the shared link's picture card carries the post's first picture", /sharePicture\(firstPicture\(facts\.post\.media\)/.test(code("app/(marketing)/community/[slug]/(member)/post/[postId]/share.png/route.tsx")))

  /* ── 8 ─────────────────────────────────────────────────────────────── */
  console.log("\n8. A public post for somebody who is not a member")
  const layout = code("app/(marketing)/community/[slug]/(member)/layout.tsx")
  const postPage = code("app/(marketing)/community/[slug]/(member)/post/[postId]/page.tsx")
  check("the member layout lets through only a post that publicPost says is public", /if \(await publicPostOpen\(slug\)\) return children\s*redirect\(/.test(layout) && /return !!facts && publicPost\(facts\)/.test(layout) && /POST_PATH = \/\^\\\/community\\\/\[\^\/\?#\]\+\\\/post\\\//.test(layout))
  check("and nothing else: every other page still goes to About", /redirect\(`\/community\/\$\{page\.community\.slug\}\/about`\)/.test(layout))
  check("the page asks publicPost again and reads the post and comments read only", /if \(!facts \|\| !publicPost\(facts\)\) notFound\(\)/.test(postPage) && /getPublicPostView\(db, community, reader, postId\)/.test(postPage) && /\{ publicRead: true \}/.test(postPage) && /readOnly\s*visitor=/.test(postPage))
  check("the server's public read: published, an open space, never a chat", /if \(row\.status !== "published"\) return null/.test(serverFeed) && /if \(!space \|\| space\.kind === "chat" \|\| !isOpenRule\(space\.view_access\)\) return null/.test(serverFeed))
  check("the visitor sees a calm Join bar to the community's page, and no box", /data-visitor-join=""/.test(page) && /href=\{`\/community\/\$\{slug\}\/about`\}/.test(page) && /"Join the community to comment\."/.test(comments) && /const open = !visitor &&/.test(comments))

  /* ── 9 ─────────────────────────────────────────────────────────────── */
  console.log("\n9. Dates")
  const now = Date.parse("2026-10-05T12:00:00Z")
  const at = (ms: number) => new Date(now - ms).toISOString()
  check("relative up to a week: 57m, 5h, 3d", relativeTime(at(57 * 60_000), now) === "57m" && relativeTime(at(5 * 3600_000), now) === "5h" && relativeTime(at(3 * 86_400_000), now) === "3d")
  check("then the date, with the year only when it is not this year", relativeTime("2026-09-23T12:00:00Z", now, "UTC") === "Sep 23" && relativeTime("2025-02-23T12:00:00Z", now, "UTC") === "Feb 23, 2025")

  /* ── 10 ────────────────────────────────────────────────────────────── */
  console.log("\n10. No unread dot; pinned")
  check("no unread dot on a card (and nothing reads it there)", !/data-unread-dot/.test(card) && !/isUnread/.test(card))
  check("a pinned post: its line above the post and a firmer card", /data-pin-mark=""/.test(card) && /\{pinnedLine\}\s*\{head\}/.test(card) && /const PINNED = "border-\[#dcdfe4\]/.test(card))

  /* ── 11 ────────────────────────────────────────────────────────────── */
  console.log("\n11. Opening a post on a computer")
  check("the page's overflow is only held on a phone (the scrollbar never goes on a computer, nothing shifts)", /if \(!phone\) return\s*const html = document\.documentElement/.test(overlay) && !/paddingRight/.test(overlay))
  check("a wheel over the scrim is not the page's", /root\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(overlay))
  check("the panel's scrollbar is slim and light", /\[scrollbar-width:thin\]/.test(overlay) && /\$\{SLIM_SCROLL\}/.test(overlay))

  /* ── 12 ────────────────────────────────────────────────────────────── */
  console.log("\n12. Comments")
  check("they always come: the open counts as arrived at the latest after 650ms", /export const SETTLE_LATEST_MS = 650/.test(overlay) && /setPhase\(\(p\) => \(p === "in" \? "shown" : p\)\), SETTLE_LATEST_MS\)/.test(overlay))
  check("Reply starts \"@name \" with the caret after it", /export function replyText/.test(comments) && /return author\?\.username \? `@\$\{author\.username\} ` : ""/.test(comments) && /caretAtEnd=\{!!initial\}/.test(comments) && /el\.setSelectionRange\(end, end\)/.test(mention))
  check("the bubble: lighter grey, a hairline and a 1px shadow, a 14px corner", /export const BUBBLE = "bg-\[#f6f7f8\] border border-\[#eceef1\] shadow-\[0_1px_1px_rgba\(16,24,40,0\.04\)\]"/.test(comments) && /rounded-\[14px\]/.test(comments))
  check("Storelib's own glyphs for Reply, the dots, edit, delete, report", /from "@solar-icons\/react\/linear\/reply"/.test(comments) && /<MenuDotsIcon/.test(comments) && /<PenIcon/.test(comments) && /<TrashBinMinimalisticIcon/.test(comments) && /<FlagIcon/.test(comments))
  check("sending plays a soft sound in the press, before the request", /commentSound\(\)\s*setBody\(""\)[\s\S]{0,400}await api</.test(comments))
  check("delete and remove ask in Storelib's sheet above the post", /<ConfirmSheet state=\{confirm\}/.test(comments) && !/ConfirmDialog/.test(comments))

  /* ── 13 ────────────────────────────────────────────────────────────── */
  console.log("\n13. Comments with pictures and GIFs, before part 96")
  check("the first page says whether comments can carry media", /mediaReady: commentMediaReady\(\) !== false/.test(serverComments))
  check("without it the box offers words only, and staff read what to run", /canUpload && mediaOn/.test(comments) && /\{mediaOn \? \(\s*<span className="contents" data-comment-tool="gif">/.test(comments) && /open && !mediaReady && staff/.test(comments) && /run-now part 96/.test(comments))

  /* ── 14 ────────────────────────────────────────────────────────────── */
  console.log("\n14. @mentions")
  check("\"@\" alone opens the picker (an empty query); a word after it narrows it", mentionAt("Hi @", 4)?.query === "" && mentionAt("Hi @le", 6)?.query === "le" && mentionAt("mail@x", 6) === null)
  const near = [{ id: "a", name: "Leo Martins", username: "leom", avatarUrl: null }, { id: "b", name: "Jonas Berg", username: "jonasb", avatarUrl: null }]
  check("the people on screen first, then the server's, each once, six at most", mentionChoices("", near, [{ id: "b", name: "Jonas Berg", username: "jonasb", avatarUrl: null }, { id: "c", name: "Ana", username: "ana", avatarUrl: null }]).map((p) => p.username).join() === "leom,jonasb,ana" && mentionChoices("ma", near, []).map((p) => p.username).join() === "leom")
  check("chosen on the press without taking the caret; above the box when there is no room under it", /onPointerDown=\{\(e\) => e\.preventDefault\(\)\}/.test(mention) && /bottom - r\.bottom < LIST_ROOM_PX/.test(mention))
  check("the comment box offers the commenters on screen", /nearby=\{nearby\}/.test(comments))
  check("mentions in posts and comments notify (server)", /await notifyMentions\(db, \{/.test(serverFeed) && /await notifyMentions\(db, \{/.test(serverComments))

  /* ── 15 ────────────────────────────────────────────────────────────── */
  console.log("\n15. The composer")
  check("a soft whoosh on Post: primed in the press, played once the post is up", /primeSounds\(\)/.test(composer) && /const post = r\.data\.post\s*postSound\(\)/.test(composer) && /createBufferSource\(\)/.test(heart) && /band\.type = "bandpass"/.test(heart))
  check("the same Sounds switch and rules as a like", /function soundContext\(\)[\s\S]{0,300}!soundsOn\(\)/.test(heart) && /export function postSound\(\): boolean \{\s*const ctx = soundContext\(\)/.test(heart))
  check("the space picker and the card's space line show the space's glyph", /spaceGlyph\(s\.icon, s\.kind\)/.test(composer) && /spaceGlyph\(post\.space\.icon, post\.space\.kind\)/.test(card))

  /* ── 16 ────────────────────────────────────────────────────────────── */
  console.log("\n16. Owner and admin posts, a little higher")
  const H = 3600_000
  const p = (id: string, role: string, hoursAgo: number) => ({ id, createdAt: at(hoursAgo * H), lastActivityAt: at(hoursAgo * H), author: { role } })
  const page1 = [p("m1", "member", 1), p("m2", "member", 2), p("a1", "admin", 5), p("m3", "member", 9), p("o1", "owner", 12)]
  const boosted = boostStaff(page1)
  check("an admin's post a few hours older passes members' newer ones", boosted.map((x) => x.id).join() === "a1,m1,m2,o1,m3", boosted.map((x) => x.id).join())
  check("never hides a post: the page holds the same posts", boosted.length === page1.length && new Set(boosted.map((x) => x.id)).size === page1.length)
  check("gentle: about six hours", STAFF_BOOST_MS === 6 * H && boostStaff([p("m", "member", 1), p("a", "admin", 8)]).map((x) => x.id).join() === "m,a")
  check("only in Default, inside the page already read (its cursor is the page's last row before the boost)", /const posts = order === "default" \? boostStaff\(hydrated\) : hydrated/.test(serverFeed) && /cursorAfter\(order, last\)/.test(serverFeed))

  /* ── 17 ────────────────────────────────────────────────────────────── */
  console.log("\n17. Sounds in /account/settings")
  const settings = code("components/account/account-settings.tsx")
  check("Preferences has a Sounds row with the switch (likes, comments and posts)", /<PrivacyRow id="sounds" title="Sounds" detail=\{SOUNDS_DETAIL\}/.test(settings) && /const \[sounds, setSounds\] = useSounds\(\)/.test(settings) && /export const SOUNDS_DETAIL = "Likes, comments and posts"/.test(heart))

  /* ── Hygiene ───────────────────────────────────────────────────────── */
  console.log("\nHygiene")
  const mine = [
    `${M}/feed.tsx`,
    `${M}/feed-live.tsx`,
    `${M}/live.ts`,
    `${M}/post-card.tsx`,
    `${M}/composer.tsx`,
    `${M}/comments.tsx`,
    `${M}/media.tsx`,
    `${M}/media-compress.ts`,
    `${M}/lightbox.tsx`,
    `${M}/post-overlay.tsx`,
    `${M}/post-page.tsx`,
    `${M}/heart.tsx`,
    `${M}/mention-input.tsx`,
    `${M}/mention-pick.ts`,
    `${M}/report-confirm.tsx`,
    "lib/communities/server/feed.ts",
    "lib/communities/server/comments.ts",
    "lib/communities/server/realtime.ts",
    "app/(marketing)/community/[slug]/(member)/layout.tsx",
    "app/(marketing)/community/[slug]/(member)/post/[postId]/page.tsx",
  ]
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word", offenders.length === 0, offenders.join(", "))
  const clients = mine.filter((f) => /^"use client"/.test(read(f)))
  const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(code(f)))
  check("client parts import nothing from the server", clients.length >= 10 && leaks.length === 0, leaks.join(", "))
  check("no violet fill", !mine.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(read(f))))

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
