/**
 * ===========================================================================
 *  COMMUNITIES: POSTS LIKE SKOOL, MEDIA, AND MESSAGES THAT ARRIVE (ROUND 7)
 * ===========================================================================
 * Held from their inputs and their source:
 *
 *   MEDIA       what a post may carry and where each thing may come from:
 *               pictures from Storelib, GIFs from Giphy only, videos by
 *               address from YouTube and Vimeo only (privacy players),
 *               files any safe kind with size limits; counts per post
 *   POSTS       a title and words are both needed, on the server
 *   FILES       members attach files through the community's own route:
 *               checked before and after, kept in the community's folder,
 *               downloaded only through the member gate, refused ones removed
 *   GIFS        Giphy through Storelib's route with GIPHY_API_KEY, a quiet
 *               "not connected" without it
 *   CARDS       one thumbnail, the commenters' faces, "New comment", the
 *               level badge, the unread dot; the card opens the post over
 *               the feed at its own address; external props unchanged
 *   COMPOSER    closed is one field; the editor's toolbar; the leave question
 *   LIGHTBOX    swipe, arrows, pinch, Escape and Back
 *   MESSAGES    every stream joins as the member, with a net under it; staff
 *               see why the button is missing when part 83 has not run
 *   COPY        no em dash, no banned word, no server code in a client file
 *
 * Round 8 (C4):
 *   LAYOUT      one thing large at full width, two side by side, three or
 *               more a grid with the first large; YouTube and Vimeo as 16:9
 *               players, also when the address is only in the words
 *   VIEWER      a picture or a video linked anywhere in the community, or
 *               a picture file, opens the in app viewer, never the raw file
 *   INSTANT     likes, saves and comments: drawn at once, one request at a
 *               time, the last press wins, put back only on a final refusal
 *
 * Round 9 (C6):
 *   ROWS        on a phone a post is a full width row with a thin band under
 *               it, its pictures under the words; a computer keeps cards
 *   SHEET       a phone opens a post in the app's own draggable sheet
 *               (components/ui/bottom-sheet.tsx); a computer's panel moves
 *               as Web Animations; comments are read ahead into kept room
 *   EDITOR      the composer opens and closes as Web Animations; on a phone
 *               it is the visible part of the screen, white under the
 *               keyboard, the field kept in sight
 *   SLIDER      the viewer follows the finger, snaps with its speed, grows
 *               out of its thumbnail; neighbours load at once
 *   GIFS        Giphy's full reply parses; the picker keeps GIFs on screen
 *
 * Round 10 (C7):
 *   LIVE        new posts and comments travel as ids on a broadcast the
 *               server sends after the write (service role, REST), on a
 *               channel named by an HMAC only members are handed; the words
 *               are read through the gated routes; typing is the id only,
 *               throttled; the feed's one line, the pill, pull to refresh
 *   FEEL        the heart fills on the icon only; the composer's sent state,
 *               its finish and the toolbar riding the keyboard; comments land
 *
 * Round 11 (C10):
 *   MEDIA       comments carry pictures, a GIF and files: the post's checks,
 *               then the member's own uploads only; part 96, and comments
 *               still work before it has run; the comment's file route
 *   FEEL        the composer is one card (no swap, no fade from nothing),
 *               the like's burst, the comment box and a comment's landing
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  MAX_EMBEDS,
  MAX_GIFS,
  MEMBER_FILE_MAX_BYTES,
  STAFF_FILE_MAX_BYTES,
  cardPictures,
  cardThumb,
  communityFilePath,
  embedFromUrl,
  embedPlayerSrc,
  embedThumbUrl,
  fileDisplayName,
  fileExtension,
  giphyUrl,
  bodyEmbeds,
  mediaKindOf,
  mediaLayout,
  MAX_COMMENT_MEDIA,
  memberPictureFolder,
  picturePathOf,
  viewerItemForUrl,
  viewerItems,
  withBodyEmbeds,
} from "@/lib/communities/post-media"
import { intentOf, press, type Toggle } from "@/components/community/member/post-intent"
import { checkMedia, checkPostInput, commentersByPost, COMMENTER_FACES } from "@/lib/communities/server/feed"
import { buildThread, checkCommentMedia, mediaLine, noMediaColumn, resetMediaColumn, withCommentColumns } from "@/lib/communities/server/comments"
import { BURST_COUNT, BURST_MS, burstPaths } from "@/components/community/member/heart"
import { cleanGifQuery, giphyKey, parseGiphy } from "@/lib/communities/server/gifs"
import { communityFilesExist, fileLimitFor, prepareCommunityFile } from "@/lib/communities/server/post-files"
import { isUnread, type SeenStore } from "@/components/community/member/post-seen"
import { announceComment, announcePost, broadcastLive, liveTopic, postTopic } from "@/lib/communities/server/realtime"
import { TYPING_EVERY_MS, TYPING_SHOWN_MS, typingLine } from "@/components/community/member/live"
import { fitsList } from "@/components/community/member/feed-live"
import type { CommunityRow } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"

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
const OWN = "https://abc.supabase.co/storage/v1/object/public/product-images/u/x.jpg"
const GIF = "https://media2.giphy.com/media/abc/200w.gif"
const STILL = "https://media2.giphy.com/media/abc/200w_s.gif"

function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(1), member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o }
}
const community = { id: U(900), creator_id: U(800), slug: "studio", name: "Studio", chat_enabled: true } as CommunityRow

/** Just enough storage for the file module: a signed upload and a folder listing. */
function storageStub(files: Record<string, number> = {}) {
  const calls: string[] = []
  return {
    calls,
    storage: {
      from(bucket: string) {
        return {
          async createSignedUploadUrl(path: string) {
            calls.push(`sign:${bucket}:${path}`)
            return { data: { token: "t0k", signedUrl: `https://abc.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=t0k` }, error: null }
          },
          async list(folder: string, opts: { search: string }) {
            calls.push(`list:${bucket}:${folder}:${opts.search}`)
            const found = Object.entries(files)
              .filter(([p]) => p === `${folder}/${opts.search}`)
              .map(([p, size]) => ({ name: p.split("/").pop(), metadata: { size } }))
            return { data: found, error: null }
          },
        }
      },
    },
  }
}

async function main() {
  /* ── Where things may come from ─────────────────────────────────────── */
  console.log("\nWhere a post's media may come from")
  check("a GIF only from Giphy's own picture hosts, over https", giphyUrl(GIF) === GIF && !!giphyUrl("https://i.giphy.com/x.gif") && !giphyUrl("https://giphy.com.evil.io/x.gif") && !giphyUrl("http://media.giphy.com/x.gif") && !giphyUrl("https://evil.example/x.gif"))
  const yt = embedFromUrl("https://youtu.be/dQw4w9WgXcQ?t=42")
  check("a YouTube address of any shape becomes its id and picture", yt?.provider === "youtube" && yt.id === "dQw4w9WgXcQ" && yt.thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && embedFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ" && embedFromUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.id === "dQw4w9WgXcQ")
  const vm = embedFromUrl("https://vimeo.com/123456789/abcdef1234")
  check("a Vimeo address keeps an unlisted video's key", vm?.provider === "vimeo" && vm.id === "123456789" && vm.hash === "abcdef1234")
  check("anything else is not a video by address", !embedFromUrl("https://evil.example/watch?v=dQw4w9WgXcQ") && !embedFromUrl("javascript:alert(1)") && !embedFromUrl("https://youtube.com/watch?v=short"))
  check("the players are the privacy ones: YouTube without cookies, Vimeo with do not track", embedPlayerSrc({ provider: "youtube", id: "dQw4w9WgXcQ" }).startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?") && /dnt=1/.test(embedPlayerSrc({ provider: "vimeo", id: "123456789", hash: "abcdef1234" })) && /h=abcdef1234/.test(embedPlayerSrc({ provider: "vimeo", id: "123456789", hash: "abcdef1234" })))
  check("a video's picture only from YouTube's or Vimeo's picture hosts", !!embedThumbUrl("https://i.vimeocdn.com/video/1.jpg") && !!embedThumbUrl("https://i.ytimg.com/vi/x/hqdefault.jpg") && !embedThumbUrl("https://evil.example/x.jpg"))
  check("the CSP already lets those players be framed", /https:\/\/www\.youtube-nocookie\.com/.test(read("lib/security/csp.ts")) && /https:\/\/player\.vimeo\.com/.test(read("lib/security/csp.ts")))

  /* ── checkMedia, round 7 kinds ──────────────────────────────────────── */
  console.log("\nWhat the server keeps")
  const gifOk = checkMedia([{ type: "gif", url: GIF, still: STILL, w: 200, h: 150, title: "wave" }])
  check("a Giphy GIF is kept with its still and size", gifOk.ok && JSON.stringify(gifOk.value[0]) === JSON.stringify({ type: "gif", url: GIF, still: STILL, w: 200, h: 150, title: "wave" }))
  check("a GIF from anywhere else is refused", !checkMedia([{ type: "gif", url: "https://evil.example/a.gif", still: STILL }]).ok && !checkMedia([{ type: "gif", url: GIF, still: "https://evil.example/s.gif" }]).ok)
  check(`at most ${MAX_GIFS} GIFs`, !checkMedia(Array.from({ length: MAX_GIFS + 1 }, () => ({ type: "gif", url: GIF, still: STILL }))).ok)
  const emb = checkMedia([{ type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", provider: "youtube", thumb: "https://evil.example/t.jpg", title: "Talk" }])
  check("a video by address is rebuilt from its own id on the server; a stranger's picture is not kept", emb.ok && emb.value[0].type === "embed" && (emb.value[0] as { thumb?: string }).thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && (emb.value[0] as { url: string }).url === "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  check("only YouTube and Vimeo by address", !checkMedia([{ type: "embed", url: "https://evil.example/v/1" }]).ok && !checkMedia([{ type: "embed", url: "https://vimeo.com/123456789", provider: "youtube" }]).ok)
  check(`at most ${MAX_EMBEDS} videos by address`, !checkMedia(Array.from({ length: MAX_EMBEDS + 1 }, () => ({ type: "embed", url: "https://youtu.be/dQw4w9WgXcQ" }))).ok)
  check("a video's poster must be Storelib's own picture", checkMedia([{ type: "video", videoId: U(4), poster: OWN, w: 1920, h: 1080 }]).ok && !checkMedia([{ type: "video", videoId: U(4), poster: "https://evil.example/p.jpg" }]).ok)
  const file = checkMedia([{ type: "file", assetId: U(5), name: "notes/../a.pdf", size: 1200, store: "community" }])
  check("a member's file keeps its store and loses any folder in its name", file.ok && (file.value[0] as { store?: string }).store === "community" && !(file.value[0] as { name: string }).name.includes("/"))
  check("still ten things at most, whatever the kinds", !checkMedia([...Array.from({ length: 6 }, () => ({ type: "image", url: OWN })), ...Array.from({ length: 5 }, () => ({ type: "gif", url: GIF, still: STILL }))]).ok)
  check("a flood of items is refused before it is read", !checkMedia(Array.from({ length: 500 }, () => ({ type: "nothing" }))).ok)

  console.log("\nA post is a title and its words")
  check("no title: refused, with a sentence that says so", !checkPostInput({ body: "hello" }).ok && /title/i.test((checkPostInput({ body: "hello" }) as { error: string }).error))
  check("no words: refused", !checkPostInput({ title: "Hello" }).ok)
  check("a picture alone is not a post any more", !checkPostInput({ media: [{ type: "image", url: OWN }] }).ok)
  check("both: a post", checkPostInput({ title: "Hello", body: "there", media: [{ type: "gif", url: GIF, still: STILL }] }).ok)
  const feedSrc = code("lib/communities/server/feed.ts")
  check("an edit keeps both too", /if \(!title\) return \{ ok: false, error: "Give the post a title\.", status: 400 \}/.test(feedSrc) && /if \(!body\) return \{ ok: false, error: "Write something in the post\.", status: 400 \}/.test(feedSrc))
  check("an edit re-checks only what is new, so a kept file or video is not refused for being old", /ownedMedia\(db, community, viewer, checked\.value, Array\.isArray\(found\.row\.media\)/.test(feedSrc))

  /* ── Members' files ─────────────────────────────────────────────────── */
  console.log("\nFiles members attach")
  check("a member may send 50 MB, staff 500 MB", fileLimitFor(false) === MEMBER_FILE_MAX_BYTES && fileLimitFor(true) === STAFF_FILE_MAX_BYTES && MEMBER_FILE_MAX_BYTES === 50 * 1024 * 1024)
  check("the extension a file keeps is letters and digits, or bin", fileExtension("Report.Final.PDF") === "pdf" && fileExtension("noext") === "bin" && fileExtension("x.tar.gz") === "gz" && fileExtension("evil.p hp") === "bin")
  check("a name keeps the extension it was checked with", fileDisplayName("Budget 2026.xlsx", "xlsx") === "Budget 2026.xlsx" && fileDisplayName("../../etc/passwd.xlsx", "pdf") === "....etcpasswd.pdf" && fileDisplayName("", "zip") === "File.zip")
  check("the path is the creator's storage, the community's folder, the member's id", communityFilePath(U(800), U(900), U(1), U(7), "pdf") === `${U(800)}/community-files/${U(900)}/${U(1)}/${U(7)}.pdf`)
  const stub = storageStub()
  const ticket = await prepareCommunityFile(stub as never, { community, viewer: viewer(), staff: false, fileName: "Plan.pdf", fileSize: 1000, contentType: "application/pdf" })
  check("a PDF is taken: a signed upload into the private bucket at the community path", ticket.ok && ticket.value.name === "Plan.pdf" && stub.calls.some((c) => c.startsWith(`sign:digital-products:${U(800)}/community-files/${U(900)}/${U(1)}/`) && c.endsWith(".pdf")))
  check("a program is refused before a byte moves", !(await prepareCommunityFile(storageStub() as never, { community, viewer: viewer(), staff: false, fileName: "setup.exe", fileSize: 1000, contentType: "application/octet-stream" })).ok)
  check("a web page or SVG is refused (it could run in a browser)", !(await prepareCommunityFile(storageStub() as never, { community, viewer: viewer(), staff: false, fileName: "x.html", fileSize: 10, contentType: "text/html" })).ok && !(await prepareCommunityFile(storageStub() as never, { community, viewer: viewer(), staff: false, fileName: "x.svg", fileSize: 10, contentType: "image/svg+xml" })).ok)
  const big = await prepareCommunityFile(storageStub() as never, { community, viewer: viewer(), staff: false, fileName: "big.zip", fileSize: MEMBER_FILE_MAX_BYTES + 1, contentType: "application/zip" })
  check("over a member's limit: refused with the limit; staff may", !big.ok && (big as { status?: number }).status === 413 && (await prepareCommunityFile(storageStub() as never, { community, viewer: viewer(), staff: true, fileName: "big.zip", fileSize: MEMBER_FILE_MAX_BYTES + 1, contentType: "application/zip" })).ok)
  check("no creator account, no files", !(await prepareCommunityFile(storageStub() as never, { community: { ...community, creator_id: null } as CommunityRow, viewer: viewer(), staff: false, fileName: "a.pdf", fileSize: 10, contentType: "application/pdf" })).ok)
  const there = storageStub({ [`${U(800)}/community-files/${U(900)}/${U(1)}/${U(7)}.pdf`]: 1000 })
  const exists = await communityFilesExist(there as never, community, U(1), [{ fileId: U(7), name: "Plan.pdf" }])
  check("at posting, the file must be in the poster's own folder", exists.ok && exists.value.get(U(7)) === "Plan.pdf")
  check("somebody else's file id is not found under my id", !(await communityFilesExist(there as never, community, U(2), [{ fileId: U(7), name: "Plan.pdf" }])).ok)
  check("renaming it to another kind at posting finds nothing", !(await communityFilesExist(there as never, community, U(1), [{ fileId: U(7), name: "Plan.exe" }])).ok)
  const files = code("lib/communities/server/post-files.ts")
  check("arrived files are checked where they landed, logged, and removed when refused", /inspectStoredObject\(/.test(files) && /logUploadVerdict\(/.test(files) && /if \(!verdict\.ok\) \{\s*await remove\(\)/.test(files) && /if \(size > limit\) \{\s*await remove\(\)/.test(files))
  check("createPost asks for the poster's own community files", /communityFilesExist\(db, community, String\(viewer\.userId\)/.test(feedSrc))
  const fileRoute = code("app/api/community/[communityId]/files/route.ts")
  check("the file route: switch first, a member who may upload, upload limits on both steps", /^\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/m.test(fileRoute) && /requireMember\(db, communityId, userId, "upload"\)/.test(fileRoute) && /uploadRateLimit\(/.test(fileRoute) && /rateLimit\(\{ bucket: "community-file"/.test(fileRoute))
  const dl = code("app/api/community/[communityId]/posts/[postId]/files/[assetId]/route.ts")
  check("a member's file downloads only through the member gate and the post it is named on, as an attachment", /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(dl) && /visiblePostRow\(/.test(dl) && /named\.store === "community"/.test(dl) && /signCommunityFile\(db, gate\.community, found\.row\.author_id/.test(dl) && /generateSignedDownloadUrl\(/.test(files))

  /* ── GIFs ───────────────────────────────────────────────────────────── */
  console.log("\nGIFs")
  check("the key is read from GIPHY_API_KEY and nothing else", giphyKey({ GIPHY_API_KEY: " k " }) === "k" && giphyKey({}) === null)
  check("a search is plain words, 50 characters at most", cleanGifQuery("  cats\n\u0000 dancing ") === "cats dancing" && cleanGifQuery("x".repeat(80)).length === 50 && cleanGifQuery(5) === "")
  const parsed = parseGiphy({
    data: [
      { id: "a", title: "Wave", images: { fixed_width: { url: GIF, width: "200", height: "150" }, fixed_width_still: { url: STILL } } },
      { id: "b", images: { fixed_width: { url: "https://evil.example/x.gif", width: "200", height: "150" }, fixed_width_still: { url: STILL } } },
      { id: "c", images: { fixed_width: { url: GIF, width: "0", height: "150" }, fixed_width_still: { url: STILL } } },
    ],
  })
  check("Giphy's answer: only GIFs on its own host, with a size", parsed.length === 1 && parsed[0].id === "a" && parsed[0].w === 200 && parsed[0].still === STILL)
  const otherStills = parseGiphy({ data: [{ id: "d", images: { fixed_width: { url: GIF, width: "200", height: "150" }, "480w_still": { url: STILL } } }, { id: "e", images: { fixed_height: { url: GIF, width: "267", height: "200" }, original_still: { url: STILL } } }] })
  check("a GIF without the fixed width still takes any other still of it (Giphy leaves some out)", otherStills.length === 2 && otherStills.every((g) => g.still === STILL) && otherStills[1].w === 267)
  const gifSrc = code("lib/communities/server/gifs.ts")
  check("the search asks for every picture Giphy has (no bundle that drops the still), and says why when it fails", !/bundle:/.test(gifSrc) && /console\.error\(`\[communities\] giphy \$\{q \? "search" : "trending"\}: \$\{res\.status\}`\)/.test(gifSrc) && !/api_key=\$\{|\$\{url\}/.test(gifSrc.slice(gifSrc.indexOf("console.error"))))
  const gifRoute = code("app/api/community/[communityId]/gifs/route.ts")
  check("the GIF route: switch first, a member who may post, not connected without the key, rate limited", /^\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/m.test(gifRoute) && /requireMember\(db, communityId, await sessionUserId\(\), "post"\)/.test(gifRoute) && /if \(!key\) return NextResponse\.json\(\{ connected: false, gifs: \[\], next: null \}/.test(gifRoute) && /rateLimit\(\{ bucket: "community-gif"/.test(gifRoute))
  const gifBtn = code("components/community/member/media-gif.tsx")
  check("the button is quieter and says so when GIFs are not connected", /connected === false \? "opacity-50" : ""/.test(gifBtn) && /GIFs are not connected/.test(gifBtn))

  /* ── Cards ──────────────────────────────────────────────────────────── */
  console.log("\nThe card")
  check("one thumbnail: a picture first, then a video's still, a video by address, a GIF's still, a link's picture", cardThumb([{ type: "link", url: "https://a.com", image: "https://a.com/i.png" }, { type: "gif", url: GIF, still: STILL }, { type: "image", url: OWN }])?.url === OWN && cardThumb([{ type: "gif", url: GIF, still: STILL }, { type: "embed", provider: "youtube", id: "x", url: "u", thumb: "https://i.ytimg.com/t.jpg" }])?.url === "https://i.ytimg.com/t.jpg" && cardThumb([{ type: "gif", url: GIF, still: STILL }])?.url === STILL && cardThumb([{ type: "file", assetId: U(1), name: "a.pdf" }]) === null)
  check("the lightbox walks pictures, GIFs and videos in the post's order, never files or links", viewerItems([{ type: "image", url: OWN }, { type: "file", assetId: U(1), name: "a" }, { type: "video", videoId: U(2) }, { type: "link", url: "https://a.com" }, { type: "gif", url: GIF, still: STILL }]).map((i) => i.kind).join() === "image,video,gif")
  const faces = commentersByPost([
    { post_id: "p1", author_id: "a", created_at: "2026-10-03T10:00:00.000Z" },
    { post_id: "p1", author_id: "b", created_at: "2026-10-02T10:00:00.000Z" },
    { post_id: "p1", author_id: "a", created_at: "2026-10-01T10:00:00.000Z" },
    { post_id: "p1", author_id: "c", created_at: "2026-09-30T10:00:00.000Z" },
    { post_id: "p1", author_id: "d", created_at: "2026-09-29T10:00:00.000Z" },
    { post_id: "p2", author_id: null, created_at: "2026-09-29T10:00:00.000Z" },
  ])
  check(`the faces: the last ${COMMENTER_FACES} different people, newest first, and when the newest came`, faces.get("p1")?.ids.join() === "a,b,c" && faces.get("p1")?.last === "2026-10-03T10:00:00.000Z" && faces.get("p2")?.ids.length === 0)
  check("the faces cost one bounded read per page, never one per post", /from\("community_feed_comments"\)[\s\S]{0,120}\.in\("post_id", postIds\)[\s\S]{0,200}\.limit\(COMMENTERS_READ\)/.test(feedSrc))
  check("the level badge only where the community counts levels", /const showLevel = h\.community\.gamification_enabled !== false/.test(feedSrc))
  const store: SeenStore = { since: "2026-10-01T00:00:00.000Z", seen: { seenOld: "2026-10-02T00:00:00.000Z" } }
  const p = (id: string, at: string, author = "x") => ({ id, lastActivityAt: at, createdAt: at, author: { id: author } as never })
  check("unread: activity since the first visit that I have not opened", isUnread(p("fresh", "2026-10-02T00:00:00.000Z"), "me", store) && !isUnread(p("old", "2026-09-20T00:00:00.000Z"), "me", store))
  check("a new comment after I opened it lights it again; my own posts never", !isUnread(p("seenOld", "2026-10-02T00:00:00.000Z"), "me", store) && isUnread(p("seenOld", "2026-10-03T00:00:00.000Z"), "me", store) && !isUnread(p("mine", "2026-10-03T00:00:00.000Z", "me"), "me", store) && !isUnread(p("x", "2026-10-03T00:00:00.000Z"), null, store))
  const card = code("components/community/member/post-card.tsx")
  check("the card: thumbnail, faces, New comment, level badge, unread dot", /<PostThumb media=\{media\} className="max-sm:hidden" \/>/.test(card) && /const media = useMemo\(\(\) => withBodyEmbeds\(post\.media, post\.bodyText\)/.test(card) && /data-commenters=""/.test(card) && /\{newCommentLabel\(fresh\)\}/.test(card) && /data-level-badge=""/.test(card) && /data-unread-dot=""/.test(card) && /line-clamp-2/.test(card))
  check("the card's props are the ones the feed already passes", /export interface PostCardProps \{\s*post: FeedPostView\s*slug: string\s*viewer: ViewerView\s*update: PostUpdate\s*full\?: boolean\s*readOnly\?: boolean\s*onComment\?: \(\) => void\s*\}/.test(card.replace(/\/\*\*[^]*?\*\//g, "")))
  check("pressing the card opens the post over the feed; links and buttons inside do their own thing", /onClick=\{openPost\}/.test(card) && /closest\("a, button, input, textarea, select, label/.test(card) && /<PostOverlay/.test(card))
  check("a press with a modifier key is a plain link", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(card))
  const overlay = code("components/community/member/post-overlay.tsx")
  check("the opened post takes the post's own address without loading a page; Back closes it", /useHistoryLayer\(true, close, `\/community\/\$\{slug\}\/post\/\$\{given\.id\}`\)/.test(overlay))
  /* Round 9 changed this on purpose (the owner asked): the phone's sheet is the app's own draggable one. */
  check("the opened post: a panel on a computer, the app's draggable sheet on a phone", /data-post-overlay="panel"/.test(overlay) && /data-post-overlay="phone"/.test(overlay) && /<BottomSheet\s[\s\S]{0,200}isOpen=\{open\}/.test(overlay))
  check("it reads the comments itself and passes changes to the card underneath", /<CommentsSection\s+post=\{post\}\s+slug=\{slug\}\s+viewer=\{viewer\}\s+initial=\{null\}/.test(overlay) && /update\(id, fn\)/.test(overlay))
  check("its moves are opacity, translate and scale only", !/transition:[^`"]*\b(top|left|height|width|margin)\b/.test(overlay))
  const lb = code("components/community/member/lightbox.tsx")
  check("history layers: a pushed entry carrying Next's state; Back closes; closing otherwise steps back", /pushState\(\{ \.\.\.\(window\.history\.state \?\? \{\}\), storelibLayer: marker \}/.test(lb) && /window\.addEventListener\("popstate", onPop\)/.test(lb) && /window\.history\.back\(\)/.test(lb))
  check("the lightbox: Escape, arrow keys, swipe, pinch, double tap", /e\.key === "Escape"/.test(lb) && /e\.key === "ArrowRight"/.test(lb) && /kind: "pinch"/.test(lb) && /lastTap\.current < 280/.test(lb) && /snapTarget\(\{ offsets: stops\.map/.test(lb))
  check("pictures at the size the screen needs, videos only on press", /optimizedSrcSet\(item\.url, \[640, 828, 1080, 1200, 1920, 2048\]\)/.test(lb) && /<StorelibVideo communityId=\{communityId\} videoId=\{item\.videoId\} poster=\{item\.poster\} key=/.test(lb) && /play \? \(\s*<iframe/.test(lb))
  const media = code("components/community/member/media.tsx")
  /* Round 8 changed this on purpose (the owner asked): one thing is large, two sit side by side, more are a grid. */
  check("inside a post: one thing at the post's full width within the screen's height, lazy, in a box of its own shape", /single \? "max-h-\[min\(560px,72vh\)\] rounded-xl"/.test(media) && /style=\{single \? \{ aspectRatio: String\(ratioOf\(item\)\) \} : undefined\}/.test(media) && /loading="lazy"/.test(media) && !/max-w-\[min\(360px,82%\)\]/.test(media))

  /* ── Round 8: media in an opened post ───────────────────────────────── */
  console.log("\nRound 8: media in an opened post")
  check("one thing is single, two a pair, three or more a grid with up to three under the first and a count of the rest", JSON.stringify([0, 1, 2, 3, 4, 6, 10].map(mediaLayout)) === JSON.stringify([{ kind: "none" }, { kind: "single" }, { kind: "pair" }, { kind: "grid", below: 2, more: 0 }, { kind: "grid", below: 3, more: 0 }, { kind: "grid", below: 3, more: 2 }, { kind: "grid", below: 3, more: 6 }]))
  const words = "Watch https://youtu.be/aqz-KE-bpKQ and https://m.youtube.com/shorts/ScMzIvxBSi4, also https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30 and https://vimeo.com/76979871. Not https://example.com/x"
  const found = bodyEmbeds(words, [])
  check("a YouTube address in the words is a video: youtu.be, m.youtube.com shorts, youtube.com/watch, Vimeo; other links are not", found.map((e) => `${e.provider}:${e.id}`).join() === "youtube:aqz-KE-bpKQ,youtube:ScMzIvxBSi4,youtube:dQw4w9WgXcQ,vimeo:76979871", found.map((e) => e.id).join())
  check("one the post already carries is not added twice, and the post keeps four at most", bodyEmbeds(words, [{ type: "embed", provider: "youtube", id: "aqz-KE-bpKQ", url: "u" }]).length === 3 && bodyEmbeds(words + " https://youtu.be/AAAAAAAAAAA", []).length === MAX_EMBEDS)
  const plain = [{ type: "image" as const, url: OWN }]
  check("words without a video leave the post's media as it is", withBodyEmbeds(plain, "no links here") === plain && withBodyEmbeds(plain, words).length === 1 + 4)
  check("the card's thumbnail comes from a video in the words when nothing else gives one", cardThumb(withBodyEmbeds([], "see https://youtu.be/aqz-KE-bpKQ"))?.url === "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg")
  check("the grid: two side by side at half width and the same height; more with the first across the top", /<div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl" data-post-media-grid="pair">/.test(media) && /tile\(0, "top", "aspect-\[16\/9\]"\)/.test(media) && /data-media-more=""/.test(media))
  check("YouTube and Vimeo are never a grid tile but a 16:9 player of their own under it, played in place", /const items = all\.filter\(\(i\) => i\.kind !== "embed"\)/.test(media) && /<EmbedPlayer item=\{e\} \/>/.test(media) && /relative aspect-video w-full overflow-hidden bg-black/.test(lb) && /src=\{embedPlayerSrc\(item\)\}/.test(lb))
  check("an uploaded video alone plays where it is; in a pair or a grid it opens the viewer playing", /<StorelibVideo communityId=\{communityId\} videoId=\{item\.videoId\} poster=\{item\.poster\} \/>/.test(media) && /setOpen\(\{ at: i, play: isMotion\(items\[i\]\) \}\)/.test(media) && /autoplay=\{open\.play\}/.test(media))
  check("pictures at the size they are drawn: the post's width alone, half in a pair, a third under a grid's first", /single: \{ widths: \[640, 750, 828, 1080, 1200, 1920\], sizes: "\(min-width: 640px\) 720px, 100vw"/.test(media) && /half: \{ widths: \[384, 640, 750, 828\], sizes: "\(min-width: 640px\) 360px, 50vw"/.test(media) && /third: \{ widths: \[256, 384, 640\], sizes: "\(min-width: 640px\) 240px, 33vw"/.test(media))

  /* ── Round 8: the viewer, never a raw file in a tab ─────────────────── */
  console.log("\nRound 8: the viewer")
  check("what is a picture or a video, by its extension, also in a storage address with a query", mediaKindOf(OWN) === "image" && mediaKindOf("https://x.supabase.co/storage/v1/object/sign/a/b/clip.MP4?token=1") === "video" && mediaKindOf("Moodboard.PNG") === "image" && mediaKindOf("notes.pdf") === null && mediaKindOf("javascript:alert(1)//x.png") === null && mediaKindOf("https://example.com/") === null)
  check("a link as the viewer shows it: a picture, a GIF, a video file; a member only route is never sent to the optimizer", viewerItemForUrl(OWN)?.kind === "image" && viewerItemForUrl("https://a.com/b.gif")?.kind === "gif" && viewerItemForUrl("https://a.com/b.webm")?.kind === "clip" && (viewerItemForUrl("/api/community/x/posts/y/files/z.jpg", true) as { raw?: boolean } | null)?.raw === true && viewerItemForUrl("https://a.com/b.zip") === null)
  const mv = code("components/community/member/media-viewer.tsx")
  check("one listener turns a press on a picture or video link into the viewer, leaving modifier presses, downloads and handled presses alone", /document\.addEventListener\("click", onClick\)/.test(mv) && /if \(e\.defaultPrevented \|\| e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey\) return/.test(mv) && /el\.hasAttribute\("download"\) \|\| el\.closest\("\[data-no-viewer\]"\)/.test(mv) && /e\.preventDefault\(\)\s*openMediaViewer\(/.test(mv))
  check("a picture in written text (the about page, an event, a lesson) opens it too, with the text's other pictures a swipe away", /target instanceof HTMLImageElement && target\.closest\("\.storelib-prose"\)/.test(mv) && /TEXT_SCOPE = "\.storelib-prose, \[data-media-scope\], \[data-comment\], \[data-chat-message\]/.test(mv))
  const shell = code("components/community/member/shell.tsx")
  check("both community frames (a member's and a visitor's) draw it once", (shell.match(/<MediaLinks communityId=\{community\.id\} \/>/g) || []).length === 2)
  check("a post's picture or video file opens the viewer from the member route as it is, with its own download beside it", /kind: "image", url: fileUrl\(f\.assetId\), raw: true/.test(media) && /data-post-file-open=""/.test(media) && /download=\{f\.name\}/.test(media))
  check("the viewer shows a raw address as it is and plays a video file in the browser's player", /const own = item\.kind === "image" && !item\.raw/.test(lb) && /data-lightbox-clip=""/.test(lb))
  const player = code("components/courses/course-player.tsx")
  check("a lesson's picture or video file opens the viewer (loaded on press) from the same short lived address", /const \{ openMediaViewer \} = await import\("@\/components\/community\/member\/media-viewer"\)/.test(player) && /mediaKindOf\(a\.name\)/.test(player) && /data-attachment-view=\{kind\}/.test(player))
  check("no media link in the member area opens a new tab on its own", !/target="_blank"[^>]*data-post-file|href=\{fileUrl[^}]*\}[^>]*target="_blank"/.test(media))

  /* ── Round 8: likes, saves and comments answer at once ──────────────── */
  console.log("\nRound 8: likes, saves and comments answer at once")
  {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    const sent: boolean[] = []
    const answers: Array<() => void> = []
    const applied: Toggle[] = []
    const plan = (refuse = false) => ({
      send: (on: boolean) =>
        new Promise<{ ok: true; data: { on: boolean; count: number } } | { ok: false; status: number; error: string }>((done) => {
          sent.push(on)
          answers.push(() => done(refuse ? { ok: false, status: 403, error: "" } : { ok: true, data: { on, count: on ? 11 : 10 } }))
        }),
      apply: (t: Toggle) => applied.push(t),
    })
    const start = { on: false, count: 10 }
    press("t1", start, plan())
    check("a press is shown at once, before the server answers", JSON.stringify(intentOf("t1")) === JSON.stringify({ on: true, count: 11 }) && sent.join() === "true" && applied.length === 0)
    for (let i = 0; i < 4; i++) press("t1", start, plan())
    check("more presses while it is on its way only change the wish: still one request", sent.length === 1 && JSON.stringify(intentOf("t1")) === JSON.stringify({ on: true, count: 11 }))
    answers.shift()!()
    await tick()
    await tick()
    check("five presses end liked with one request, written once with the server's count", sent.length === 1 && intentOf("t1") === null && JSON.stringify(applied) === JSON.stringify([{ on: true, count: 11 }]))
    sent.length = 0
    applied.length = 0
    press("t2", start, plan())
    press("t2", start, plan())
    check("the count never shows a third value: back to 10 while the first request is out", JSON.stringify(intentOf("t2")) === JSON.stringify({ on: false, count: 10 }))
    answers.shift()!()
    await tick()
    await tick()
    check("an answer to an older wish sends the latest, never two at once", sent.join() === "true,false" && JSON.stringify(intentOf("t2")) === JSON.stringify({ on: false, count: 10 }))
    answers.shift()!()
    await tick()
    await tick()
    check("and the last press wins", intentOf("t2") === null && JSON.stringify(applied.at(-1)) === JSON.stringify({ on: false, count: 10 }))
    applied.length = 0
    press("t3", start, plan(true))
    answers.shift()!()
    await tick()
    await tick()
    check("a refusal of the last wish puts back the server's last word", intentOf("t3") === null && JSON.stringify(applied) === JSON.stringify([start]))
  }
  check("the card's like and save buttons draw from the wish and are never turned off while asking", /function LikeButton\([\s\S]{0,200}useIntent\(`like:\$\{post\.id\}`\)/.test(card) && /function SaveButton\([\s\S]{0,200}useIntent\(`save:\$\{post\.id\}`\)/.test(card) && !/pending\.current/.test(card) && /disabled=\{readOnly \|\| !viewer\.can\.react\}/.test(card))
  check("a card draws again only when its own post changes, not for every like in the feed", /export const PostCard = memo\(PostCardView, \(a, b\) => a\.post === b\.post/.test(card))
  check("the opened post keeps a pressed like or save over a copy it reads meanwhile, and sets the page's overflow once, before its first frame", /const like = intentOf\(`like:\$\{given\.id\}`\)/.test(overlay) && /useLayoutEffect\(\(\) => \{\s*const html = document\.documentElement[\s\S]{0,300}html\.style\.overflow = "hidden"[\s\S]{0,200}\}, \[\]\)/.test(overlay) && /const close = useCallback\(\(\) => setOpen\(false\), \[\]\)/.test(overlay))
  const comments = code("components/community/member/comments.tsx")
  check("a comment is drawn before the server is asked, the box empties at once, Send is only off while there is nothing to send or an upload is on its way", /sending\.start\(\{[\s\S]{0,800}\}\)\s*setBody\(""\)[\s\S]{0,160}await api</.test(comments) && /const ready = \(!!body\.trim\(\) \|\| picks\.length > 0\) && !uploading/.test(comments) && /disabled=\{!ready\}\s*data-comment-send=""/.test(comments) && /Sending\.\.\./.test(comments))
  check("a refused comment comes out with its words (and what it carried) back in an empty box and the count put back", /sending\.drop\(tempId\)\s*if \(!current\.current\.trim\(\) && !picksNow\.current\.length\) \{\s*setBody\(text\)\s*setPicks\(kept\)/.test(comments) && /onCount\?\.\(-1\)/.test(comments))
  check("no router refresh in a post, a card or the comments", ![card, overlay, comments, code("components/community/member/post-page.tsx")].some((f) => /router\.refresh\(\)/.test(f)))

  /* ── Composer ───────────────────────────────────────────────────────── */
  console.log("\nThe composer")
  const composer = code("components/community/member/composer.tsx")
  check("closed it is one field, Share something...", /data-composer=\{inPlace \? "open" : "closed"\}/.test(composer) && /"Share something\.\.\."/.test(composer) && !/data-composer-action=/.test(composer))
  check("a computer edits in place, a phone in a screen of its own", /const inPlace = open && !phone/.test(composer) && /data-composer=\{inPlace \? "open" : "closed"\}/.test(composer) && /data-composer="sheet"/.test(composer))
  check("Post waits for a title, words, a space and every upload", /const ready = !!title\.trim\(\) && !!body\.trim\(\) && !!spaceId && !uploading && !!pollReady/.test(composer) && /disabled=\{busy \|\| sent \|\| !ready\}/.test(composer))
  check("the space list is only where the member may post", /composerSpacesOf\(spaces\)/.test(code("components/community/member/feed.tsx")) && /s\.canPost && s\.kind !== "chat"/.test(code("components/community/member/feed.tsx")))
  check("the emoji picker is the app's own", /from "@\/components\/app\/rich-text\/emoji-picker"/.test(composer) && /<EmojiControl /.test(composer))
  check("files go through the community's file route, for every member", /uploadCommunityFile\(\{ communityId, file/.test(composer) && !/DirectUploader/.test(composer))
  check("the leave question, word for word, in Storelib's dialog", /"You haven't finished your post yet\. Leave without posting\?"/.test(read("components/community/member/composer.tsx")) && /Keep writing/.test(composer) && /Leave\s*<\/button>/.test(composer) && /<DialogPrimitive\.Root open=\{!!asking\}/.test(composer) && /z-\[151\]/.test(composer))
  check("asked on Cancel, on a link to another page, on Back, and the browser's own on closing the tab", /const cancel = async \(\) => \{\s*if \(dirty && !\(await ask\(\)\)\) return/.test(composer) && /document\.addEventListener\("click", onClick, true\)/.test(composer) && /window\.addEventListener\("popstate", onPop\)/.test(composer) && /beforeunload/.test(composer))
  check("the draft is still kept and comes back", /window\.localStorage\.setItem\(key, JSON\.stringify/.test(composer) && /const d = readDraft\(key\)/.test(composer))

  /* ── Messages ───────────────────────────────────────────────────────── */
  console.log("\nMessages between members")
  const dm = code("components/community/member/messages.tsx")
  check("every message stream joins as the member (the token first), not as a visitor", /await realtimeAuth\(supabase\)\s*if \(gone\) return\s*channel = supabase/.test(dm) && (dm.match(/liveStream\(/g) || []).length >= 4 && !/\.channel\(`community-dm[^`]*`\)\s*\.on\([^)]*\)[\s\S]{0,400}\.subscribe\(\)\s*\} catch/.test(dm))
  check("with a net under each: the page asks again while the stream is not joined", /if \(!joined && document\.visibilityState === "visible"\) poll\(\)/.test(dm) && /joined = status === "SUBSCRIBED"/.test(dm))
  check("chat spaces have the same net", /if \(!joined && document\.visibilityState === "visible"\) void catchUp\(\)/.test(code("components/community/member/chat.tsx")))
  const note = code("components/community/member/messages-setup-note.tsx")
  check("staff are told in /app when only part 83 keeps the Messages button away", /missing\(error\) \? true : null/.test(note) && /<MessagesSetupNote chatEnabled=\{!!ctx\.community\.chat_enabled\} \/>/.test(code("app/app/community/[id]/page.tsx")) && /^import "server-only"/m.test(read("components/community/member/messages-setup-note.tsx")))

  /* ── Round 9 ────────────────────────────────────────────────────────── */
  console.log("\nRound 9: rows, the sheet, the editor, the slider, GIFs")
  const IMG = "https://placeholder.supabase.co/storage/v1/object/public/community-media/a.jpg"
  const pics = cardPictures([{ type: "file", assetId: "x", name: "a.pdf" }, { type: "gif", url: GIF, still: STILL, w: 200, h: 150 }, { type: "image", url: IMG, w: 1200, h: 800 }, { type: "link", url: "https://a.com", image: "https://a.com/i.png" }] as never)
  check("a phone's card draws every picture in the post's order (a GIF by its still), files and links left out", pics.map((x) => `${x.kind}:${x.local}`).join() === "gif:false,image:true" && pics[0].url === STILL)
  check("and a link's picture only when there is nothing else", cardPictures([{ type: "link", url: "https://a.com", image: "https://a.com/i.png" }] as never).map((x) => x.kind).join() === "link" && cardPictures([]).length === 0)
  const card9 = code("components/community/member/post-card.tsx")
  const media9 = code("components/community/member/media.tsx")
  check("ROWS: on a phone a post is the screen's full width (worked out from the viewport), no card edge, an 8px #f1f2f4 band under it", /export const PHONE_ROW =\s*"max-sm:mx-\[calc\(50%-50vw\)\] max-sm:mb-0 max-sm:w-screen max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:border-b-8 max-sm:border-b-\[#f1f2f4\]"/.test(card9) && /\$\{CARD\} \$\{PHONE_ROW\} group\/post/.test(card9))
  check("the composer above the posts is a row the same way; a computer's hover stays a computer's", /\$\{CARD\} \$\{PHONE_ROW\} relative/.test(code("components/community/member/composer.tsx")) && /"px-4 py-3 sm:py-3\.5"/.test(code("components/community/member/composer.tsx")) && /sm:hover:border-\[#dfe2e6\]/.test(card9) && !/ hover:border-\[#dfe2e6\]/.test(card9))
  check("on a phone the pictures are under the words, the row's width; a computer keeps the thumbnail", /<CardMedia media=\{media\} className="mt-3 sm:hidden" \/>/.test(card9) && /<PostThumb media=\{media\} className="max-sm:hidden" \/>/.test(card9))
  check("one picture keeps its shape between square and 2:1 (16:9 unknown), two or more are two squares with how many more, lazy, through the optimizer", /Math\.min\(Math\.max\(p\.w \/ p\.h, 1\), 2\) : 16 \/ 9/.test(media9) && /data-card-media="pair"/.test(media9) && /aspect-square/.test(media9) && /\+\{more\}/.test(media9) && /function CardPictureImg[\s\S]{0,700}loading="lazy"/.test(media9) && /optimizedSrcSet\(p\.url, widths\)/.test(media9) && /rounded-xl/.test(media9))
  const overlay9 = code("components/community/member/post-overlay.tsx")
  check("SHEET: the phone's post is the app's BottomSheet, above the page's layers, on the keyboard, nearly the whole screen", /from "@\/components\/ui\/bottom-sheet"/.test(overlay9) && /zIndex=\{130\}/.test(overlay9) && /aboveKeyboard/.test(overlay9) && /height="calc\(var\(--vv-h, 100dvh\) - max\(env\(safe-area-inset-top\), 12px\) - 8px\)"/.test(overlay9) && /data-sheet-close=""/.test(overlay9))
  check("the computer's panel moves as Web Animations started before its first frame, on the app's curves", /panel\.animate\(\[\{ opacity: 0, translate: "0 16px" \}, \{ opacity: 1, translate: "0 0" \}\], \{ duration: IN_MS, easing: SHEET_EASE \}\)/.test(overlay9) && /SHEET_CLOSE_EASE/.test(overlay9) && !/requestAnimationFrame\(\(\) => \{\s*b = requestAnimationFrame/.test(overlay9))
  check("Back is one step of history for as long as it is on screen; stepping back waits until it has gone", /useHistoryLayer\(true, close,/.test(overlay9) && /onClosed=\{onGone\}/.test(overlay9))
  check("closing does not draw the post and its comments again", /const OverlayContent = memo\(function OverlayContent/.test(overlay9))
  const comments9 = code("components/community/member/comments.tsx")
  check("comments are asked for when the card is pressed and when the post opens, once", /onPointerDown=\{[\s\S]{0,200}readAheadComments\(post\.communityId, post\.id\)/.test(card9) && /void readAheadComments\(given\.communityId, given\.id\)/.test(overlay9) && /if \(have\?\.promise\) return have\.promise/.test(comments9))
  check("their room is kept from the post's count, still (no shimmer), and they fade into it", /export function commentsRoom\(expected: number\)/.test(comments9) && /<CommentsPlaceholder expected=\{post\.commentCount\} \/>/.test(overlay9) && /expected=\{post\.commentCount\}\s+fadeIn/.test(overlay9) && /animate-in fade-in-0 duration-200/.test(comments9) && !/animate-pulse/.test(comments9))
  const composer9 = code("components/community/member/composer.tsx")
  check("EDITOR: the phone's screen slides as a Web Animation on the app's sheet curves, from its first frame", /el\.animate\(\[\{ translate: "0 100%" \}, \{ translate: "0 0" \}\], \{ duration: SHEET_OPEN_MS, easing: SHEET_EASE \}\)/.test(composer9) && /duration: SHEET_CLOSE_MS, easing: SHEET_CLOSE_EASE/.test(composer9) && !/transition: "translate 280ms/.test(composer9))
  check("in place, the posts slide to make room and the editor's content fades inside the one card (no layout or paint per frame)", /x\.animate\(\[\{ translate: `0 \$\{-d\}px` \}, \{ translate: "0 0" \}\], timing\)/.test(composer9) && !/clipPath/.test(composer9) && !/key="closed"/.test(composer9) && !/key="open"/.test(composer9))
  check("the phone's screen is white under the keyboard and its column is the visible part", /className="fixed inset-0 z-\[125\] bg-white"/.test(composer9) && /absolute inset-x-0 top-\[var\(--vv-top,0px\)\] flex h-\[var\(--vv-h,100dvh\)\] flex-col/.test(composer9) && /useKeepFieldInSight\(sheet, \(\) => scrollRef\.current\)/.test(composer9))
  check("the caret goes in once the screen has arrived, and Cancel keeps it until the screen has gone", /const arrived = \(\) => \{\s*setSheetIn\(true\)\s*focusFirst\(\)/.test(composer9) && /onPointerDown=\{\(e\) => e\.preventDefault\(\)\} onMouseDown=\{\(e\) => e\.preventDefault\(\)\} onClick=\{\(\) => void cancel\(\)\}/.test(composer9))
  const keep = code("components/community/member/keep-in-sight.ts")
  check("the field stays in sight on visualViewport's resize and scroll and the keyboard estimate, the post sheet's comment box too", /vv\?\.addEventListener\("resize", keep\)/.test(keep) && /vv\?\.addEventListener\("scroll", keep\)/.test(keep) && /KEYBOARD_CHANGE_EVENT/.test(keep) && /useKeepFieldInSight\(phone,/.test(overlay9) && /data-keep-in-sight=""/.test(comments9))
  const lb9 = code("components/community/member/lightbox.tsx")
  check("SLIDER: the finger writes the row's position once a frame, let go with the app's sheet arithmetic", /from "@\/components\/website-builder\/sheet-gestures"/.test(lb9) && /releaseVelocity\(samples\.current/.test(lb9) && /rubberBand\(/.test(lb9) && /snapMotion\(end - from, velocity\)/.test(lb9) && /raf\.current = requestAnimationFrame\(paint\)/.test(lb9) && !/setDrag\(/.test(lb9))
  check("it grows out of the pressed thumbnail and goes back into it; the neighbours load at once", /originOf\?: \(i: number\) => HTMLElement \| null/.test(lb9) && /coverFrom\(from, laid, 12\)/.test(lb9) && /originOf=\{\(i\) => rootRef\.current\?\.querySelector/.test(media9) && /loading="eager"/.test(lb9) && /Math\.abs\(i - index\) <= 1/.test(lb9))
  check("Escape is the viewer's first (an opened post's sheet under it stays)", /window\.addEventListener\("keydown", onKey, true\)/.test(lb9) && /e\.stopPropagation\(\)/.test(lb9))
  const gif9 = code("components/community/member/media-gif.tsx")
  check("GIFS: what the button's question brought shows at once, a search typed again too; GIFs stay on screen while the next ones come", /const seen = new Map<string, GifPage>\(\)/.test(gif9) && /const stale = loading && shownFor !== term/.test(gif9) && /Trending/.test(gif9) && !/animate-pulse/.test(gif9))
  check("nothing found names the words; a failure can be tried again; the next page as the end nears", /No GIFs for "\$\{shownFor\}"\. Try other words\./.test(gif9) && /Try again/.test(gif9) && /offset=\$\{page\.next\}/.test(gif9) && /IntersectionObserver/.test(gif9))
  const feed9 = code("components/community/member/feed.tsx")
  check("MOUNT: a list draws its first screenful of cards, the rest stand in at their height for a frame, then come in a transition", /export const FIRST_CARDS = 8/.test(card9) && /* Round 11: a list swapped in after the first draws SWAP_CARDS (a phone's screenful) first. */ /const firstCards = firstKey\.current === key \? FIRST_CARDS : SWAP_CARDS/.test(feed9) && /i < firstCards \|\| whole \? <PostCard /.test(feed9) && /<PostCardPlaceholder key=\{p\.id\} post=\{p\} \/>/.test(feed9) && /requestAnimationFrame\(\(\) => startTransition\(\(\) => setWholeFor\(key\)\)\)/.test(feed9))
  check("a card off screen is not laid out or painted, and keeps the height it last had (one shared ResizeObserver)", /\[content-visibility:auto\]/.test(card9) && /containIntrinsicSize: `auto \$\{heightOf\(post\.id\)\}px`/.test(card9) && /watcher \?\?= new ResizeObserver/.test(card9) && /style=\{\{ height: heightOf\(post\.id\) \}\} data-post-placeholder/.test(card9))
  check("a card's dialogs are built only once asked for; an old date is formatted once", /const dialogs = asked\.current \?/.test(card9) && /\{dialogs\}/.test(card9) && /OLD_DATES\.set\(iso, label\)/.test(card9))
  check("the composer reads no height while a list is being drawn (only when it is pressed)", !/useLayoutEffect\(\(\) => \{\s*if \(!open && closedRef\.current\) closedH\.current = closedRef\.current\.offsetHeight/.test(composer9))
  check("a page of comments that lands late never takes away one sent meanwhile", /A PAGE THAT ARRIVES LATE NEVER TAKES A COMMENT AWAY/.test(read("components/community/member/comments.tsx")) && /sentHere\.current\.has\(c\.id\)/.test(comments9))
  const full = (id: string, w: number, h: number) => {
    const u = (f: string) => `https://media3.giphy.com/media/v1.Y2lk/${id}/${f}?cid=x&rid=${f}&ct=g`
    const r = (f: string, rw: number, rh: number) => ({ url: u(f), width: String(rw), height: String(rh), size: "1000" })
    return { type: "gif", id, title: "wave", images: { original: r("giphy.gif", w, h), downsized: r("giphy-downsized.gif", w, h), fixed_height: r("200.gif", Math.round((200 * w) / h), 200), fixed_height_still: r("200_s.gif", Math.round((200 * w) / h), 200), fixed_width: { ...r("200w.gif", 200, Math.round((200 * h) / w)), mp4: u("200w.mp4"), webp: u("200w.webp") }, fixed_width_still: r("200w_s.gif", 200, Math.round((200 * h) / w)), original_still: r("giphy_s.gif", w, h), "480w_still": r("480w_s.jpg", 480, Math.round((480 * h) / w)), looping: { mp4: u("giphy-loop.mp4") }, preview: { mp4: u("giphy-preview.mp4") } } }
  }
  const parsed9 = parseGiphy({ data: [full("abc123", 480, 270)], pagination: { total_count: 9, count: 1, offset: 0 }, meta: { status: 200 } })
  check("Giphy's full reply (every rendition, sizes as strings): the 200px moving GIF, its own still, sizes as numbers", parsed9.length === 1 && /\/abc123\/200w\.gif\?/.test(parsed9[0].url) && /\/abc123\/200w_s\.gif\?/.test(parsed9[0].still) && parsed9[0].w === 200 && parsed9[0].h === 113 && parsed9[0].title === "wave")

  /* ── Copy and boundaries ────────────────────────────────────────────── */
  console.log("\nRound 10: live posts, comments and typing")
  {
    const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co/"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-one"
    const a = liveTopic(U(900))
    const again = liveTopic(U(900).toUpperCase())
    const other = liveTopic(U(901))
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-two"
    const otherKey = liveTopic(U(900))
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-one"
    check("the live channel's name is an HMAC of the community: the same each time, different per community and per key, and not the id", !!a && /^community-live:[0-9a-f]{32}$/.test(a) && a === again && a !== other && a !== otherKey && !a.includes(U(900)))
    check("a post's channel is the community's with the post's id; a bad id or community gives none", postTopic(U(900), U(5)) === `${a}:${U(5)}` && postTopic(U(900), "nope") === null && liveTopic("not-a-uuid") === null)
    const sent: { url: string; init: RequestInit }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return new Response(null, { status: 202 })
    }) as unknown as typeof fetch
    const ok = await announcePost(U(900), { id: U(5), spaceId: U(6), authorId: U(1) }, fetcher)
    const body = JSON.parse(String(sent[0]?.init.body ?? "{}"))
    const headers = (sent[0]?.init.headers ?? {}) as Record<string, string>
    check("a new post is broadcast through Realtime's REST endpoint as the service role", ok && sent[0]?.url === "https://abc.supabase.co/realtime/v1/api/broadcast" && headers.apikey === "service-key-one" && headers.Authorization === "Bearer service-key-one" && sent[0]?.init.method === "POST")
    check("carrying ids only, on the community's channel, public (the name is the secret)", body.messages?.length === 1 && body.messages[0].topic === a && body.messages[0].event === "post" && body.messages[0].private === false && JSON.stringify(Object.keys(body.messages[0].payload).sort()) === JSON.stringify(["authorId", "postId", "spaceId"]))
    sent.length = 0
    await announceComment(U(900), { id: U(7), postId: U(5), parentId: null, authorId: U(1) }, fetcher)
    const cbody = JSON.parse(String(sent[0]?.init.body ?? "{}"))
    check("a new comment goes to the post's own channel, ids only", cbody.messages?.[0]?.topic === `${a}:${U(5)}` && cbody.messages[0].event === "comment" && JSON.stringify(Object.keys(cbody.messages[0].payload).sort()) === JSON.stringify(["authorId", "commentId", "parentId", "postId"]))
    const refused = await broadcastLive([{ topic: a!, event: "post", payload: {} }], (async () => new Response("no", { status: 500 })) as unknown as typeof fetch)
    const thrown = await broadcastLive([{ topic: a!, event: "post", payload: {} }], (async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch)
    check("a refused or failed broadcast is false, never thrown", refused === false && thrown === false)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    check("without the service key there is no channel and nothing is sent", liveTopic(U(900)) === null && (await announcePost(U(900), { id: U(5), spaceId: null, authorId: null }, fetcher)) === false)
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url
    if (env.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = env.key

    const postsRoute = code("app/api/community/[communityId]/posts/route.ts")
    const commentsRoute = code("app/api/community/[communityId]/posts/[postId]/comments/route.ts")
    const oneComment = code("app/api/community/[communityId]/comments/[commentId]/route.ts")
    const liveRoute = code("app/api/community/[communityId]/live/route.ts")
    check("the routes broadcast after the answer (after()), once the write succeeded", /after\(\(\) => announcePost\(communityId, \{ id: post\.id/.test(postsRoute) && /if \(!result\.ok\)[\s\S]{0,400}after\(\(\) => announcePost/.test(postsRoute) && /if \(isHeld\(result\)\)[^\n]*status: 202[\s\S]{0,80}after\(\(\) => announcePost/.test(postsRoute) && /after\(\(\) => announceComment\(communityId/.test(commentsRoute))
    check("the channel name is handed to active members only, after the switch", /requireCommunitiesOn\(\)[\s\S]{0,200}requireMember\(db, communityId, await sessionUserId\(\), "view"\)[\s\S]{0,200}liveTopic\(gate\.community\.id\)/.test(liveRoute))
    check("one comment is read through the member gate and the post's visibility", /export async function GET[\s\S]{0,400}requireMember\(db, communityId, await sessionUserId\(\), "view"\)[\s\S]{0,200}getCommentView\(db, gate\.community, gate\.viewer, commentId\)/.test(oneComment) && /eq\("community_id", community\.id\)[\s\S]{0,200}status !== "published"[\s\S]{0,200}visiblePostRow\(db, community, viewer, row\.post_id\)/.test(code("lib/communities/server/comments.ts")))

    const live = code("components/community/member/live.ts")
    check("the browser joins as the member (token first), one channel per name, broadcast events only", /await realtimeAuth\(client\)[\s\S]{0,200}client\.channel\(name, \{ config: \{ broadcast: \{ self: false \} \} \}\)/.test(live) && /ch\.on\("broadcast", \{ event: ev \}/.test(live) && /--j\.refs > 0/.test(live) && !/postgres_changes/.test(live))
    check("typing says the id only, at most every 2s, and stops on send", TYPING_EVERY_MS === 2000 && TYPING_SHOWN_MS === 5000 && /sayLive\(communityId, postId, "typing", \{ userId, on: true \}\)/.test(live) && /now - last\.current < TYPING_EVERY_MS/.test(live))
    check("the typing line names one, two, or several", typingLine([]) === null && typingLine(["Leo"]) === "Leo is writing..." && typingLine(["Leo", "Zoe"]) === "Leo and Zoe are writing..." && typingLine(["A", "B", "C"]) === "Several people are writing...")
    check("a live post belongs at the top of All and its own space, in Default and New only", fitsList({ kind: "all" }, "default", null) && fitsList({ kind: "space", id: "s1" }, "new", "s1") && !fitsList({ kind: "space", id: "s1" }, "default", "s2") && !fitsList({ kind: "all" }, "top", null) && !fitsList({ kind: "saved" }, "default", "s1"))
    const feedLive = code("components/community/member/feed-live.tsx")
    check("live posts are read through the gated post route; the member's own are skipped; scrolled down they wait under the pill", /api<\{ post: FeedPostView \}>\(`\$\{apiBase\(communityId\)\}\/posts\/\$\{encodeURIComponent\(id\)\}`\)/.test(feedLive) && /payload\.authorId === viewerId/.test(feedLive) && /if \(atTop\(\)\) putRef\.current\(\[post\]\)\s*else setWaiting/.test(feedLive) && /data-feed-new-pill=\{n\}/.test(feedLive))
    check("pull to refresh: the feed sets detail.done to the first page read again, for its own scope only", /PULL_EVENT = "storelib:pull-refresh"/.test(feedLive) && /PULL_SCOPE = "community-feed"/.test(feedLive) && /detail\.scope !== PULL_SCOPE\) return/.test(feedLive) && /detail\.done = loadView\(communityId, t, s\)/.test(feedLive))
    const feed = code("components/community/member/feed.tsx")
    check("the feed list container gets one line: <FeedLive /> just above its posts", (feed.match(/FeedLive/g) ?? []).length === 2 && /* Round 11: it follows the list (listTarget, listSort), and its callback is stable. */ /<FeedLive communityId=\{communityId\} viewerId=\{viewer\.userId\} feedKey=\{key\} target=\{listTarget\} sort=\{listSort\} onView=\{onLive\} \/>/.test(feed) && /const onLive = useCallback\(\(v: CachedView\) => setShown\(\{ key, view: v \}\), \[key\]\)/.test(feed))
    const arrive = code("components/community/member/arrive.ts")
    check("arrivals start in the commit that draws them (a layout effect), the posts under them slide by translate, content-visibility lifted for the measure, no scroll anchoring meanwhile", /useLayoutEffect\(\(\) => \{\s*const p = pending\.current/.test(arrive) && /translate: `0 \$\{-pushed\}px`/.test(arrive) && /el\.style\.contentVisibility = "visible"/.test(arrive) && /overflowAnchor = "none"/.test(arrive) && !/scrollIntoView/.test(arrive))

    const comments = code("components/community/member/comments.tsx")
    check("live comments: by id, through the gate, appended only when the list is read to its end, the count moved, the member's own skipped", /listenLive\(post\.communityId, post\.id, "comment"/.test(comments) && /api<\{ comment: CommentView \}>\(`\$\{apiBase\(post\.communityId\)\}\/comments\/\$\{encodeURIComponent\(id\)\}`\)/.test(comments) && /else if \(!cursorRef\.current\)/.test(comments) && /onCountRef\.current\?\.\(1\)/.test(comments) && /p\.authorId === viewer\.userId/.test(comments))
    check("a confirmed comment keeps its stand in's key (no flash), and arrivals land", /keys\.current\.set\(c\.id, keys\.current\.get\(tempId\) \?\? tempId\)/.test(comments) && /<li key=\{rows\.keyOf\(c\.id\)\}>/.test(comments) && /landComment\(rowRef\.current\)/.test(comments) && !/scrollIntoView/.test(comments))
    check("the comment box sends from a round button inside it (no row added on focus); the typing line has its own band", /data-comment-send=""/.test(comments) && !/focused \|\| body/.test(comments) && /<TypingLine names=/.test(comments) && /open \? "mt-6" : "mt-4"/.test(comments))

    const heart = code("components/community/member/heart.tsx")
    const card = code("components/community/member/post-card.tsx")
    check("the heart: 20px on a post, its fill follows the button's aria-pressed (group/like), a beat on the icon only, the button box never scales", /<LikeHeart on=\{reacted\} size=\{20\} \/>/.test(card) && /LIKE_BTN = BTN_GHOST\.replace\("active:scale-\[0\.97\]", ""\)/.test(card) && /group\/like/.test(card) && /group-aria-pressed\/like:scale-100/.test(heart) && /el\.animate\(\[\{ scale: "1" \}, \{ scale: "1\.2"/.test(heart))

    const composer = code("components/community/member/composer.tsx")
    check("Post: a spinner, then a check, at one width; the editor closes before the post goes in, with its arrival", /data-post-state=\{state\}/.test(composer) && /col-start-1 row-start-1/.test(composer) && /setSent\(true\)[\s\S]{0,600}window\.setTimeout\(shut, reducedMotion\(\) \? 0 : SENT_HOLD_MS\)/.test(composer) && /arrive\(\[post\.id\], \{ mine: true/.test(composer) && /const posted = afterClose\.current/.test(composer))
    check("Cancel and Post carry the light depth (secondary and primary buttons)", (composer.match(/className=\{(`\$\{BTN_SECONDARY\}[^`]*`|BTN_SECONDARY)\}[^\n]*data-composer-cancel=""/g) ?? []).length === 2 && /\$\{BTN_PRIMARY\} \$\{className\}/.test(composer))
    check("the toolbar rides the keyboard by translate, ahead of the report both ways, no CSS transition on the visible part", /function useToolbarDock\(/.test(composer) && /new MutationObserver\(onChange\)/.test(composer) && /expect\("down"\)/.test(composer) && /expect\("up"\)/.test(composer) && !/vv-settling/.test(composer))
    check("stepping back over the composer's history step never restores an old scroll", /window\.history\.scrollRestoration = "manual"\s*const push = /.test(composer))
  }

  /* ── Round 11 (C10) ─────────────────────────────────────────────────── */
  console.log("\nRound 11: comment media, the one card, the burst, the comment box")
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
  const PIC = (path: string, host = "abc.supabase.co") => `https://${host}/storage/v1/object/public/product-images/${path}`
  const myFolder = memberPictureFolder(U(1), U(900))
  check("a member's pictures for a community live in their own folder of the picture bucket", myFolder === `${U(1)}/community/${U(900)}/` && /memberPictureFolder\(userId, communityId\)/.test(code("components/community/member/media-upload.ts")))
  check("a picture's path is read from its public address only", picturePathOf(PIC(`${myFolder}a.jpg`)) === `${myFolder}a.jpg` && !picturePathOf(`${PIC(`${myFolder}a.jpg`)}?x=1`) && !picturePathOf(PIC(`${myFolder}x%2F..%2F..%2Fa.jpg`)) && picturePathOf(PIC(`${myFolder}../x/a.jpg`)) === `${U(1)}/community/x/a.jpg` && !picturePathOf("https://abc.supabase.co/storage/v1/object/public/other/a.jpg") && !picturePathOf("http://abc.supabase.co/storage/v1/object/public/product-images/a.jpg"))
  const picStore = storageStub({ [`${U(1)}/community/${U(900)}/a.jpg`]: 5000, [`${U(800)}/community-files/${U(900)}/${U(1)}/${U(7)}.pdf`]: 1000, [`${U(800)}/community-files/${U(900)}/${U(2)}/${U(8)}.pdf`]: 1000 })
  const cm = (raw: unknown, v: Partial<Viewer> = {}) => checkCommentMedia(picStore as never, community, viewer(v), raw)
  const gifItem = { type: "gif", url: GIF, still: STILL, w: 200, h: 150 }
  const ownPic = { type: "image", url: PIC(`${myFolder}a.jpg`), w: 1200, h: 800 }
  const ownFile = { type: "file", assetId: U(7), name: "Plan.pdf", size: 1000, store: "community" }
  const okAll = await cm([ownPic, ownFile, gifItem])
  check("COMMENT MEDIA: the member's own picture, own file and a GIF are kept, the file under its checked name", okAll.ok && okAll.value.map((m) => m.type).join() === "image,file,gif" && (okAll.value[1] as { name: string }).name === "Plan.pdf")
  check("nothing to carry is fine", (await cm(undefined)).ok && (await cm([])).ok)
  check("a picture in somebody else's folder is refused", !(await cm([{ type: "image", url: PIC(`${U(2)}/community/${U(900)}/a.jpg`) }])).ok)
  check("a picture of mine for another community is refused", !(await cm([{ type: "image", url: PIC(`${U(1)}/community/${U(901)}/a.jpg`) }])).ok)
  check("a picture in my folder that is not there is refused", !(await cm([{ type: "image", url: PIC(`${myFolder}gone.jpg`) }])).ok)
  check("a picture in a deeper folder, or on another host, is refused", !(await cm([{ type: "image", url: PIC(`${myFolder}x/a.jpg`) }])).ok && !(await cm([{ type: "image", url: PIC(`${myFolder}a.jpg`, "evil.example") }])).ok && !(await cm([{ type: "image", url: PIC(`${myFolder}a.jpg`, "other.supabase.co") }])).ok)
  check("somebody else's file is refused, and a file that is not a community one", !(await cm([{ ...ownFile, assetId: U(8) }])).ok && !(await cm([{ type: "file", assetId: U(7), name: "Plan.pdf" }])).ok)
  check("a GIF only from Giphy, one per comment", !(await cm([{ ...gifItem, url: "https://evil.example/a.gif" }])).ok && !(await cm([gifItem, gifItem])).ok)
  check(`at most ${MAX_COMMENT_MEDIA} things, and no videos, links or unknown kinds`, !(await cm([ownPic, ownPic, ownPic, ownPic, gifItem])).ok && !(await cm([{ type: "embed", url: "https://youtu.be/dQw4w9WgXcQ" }])).ok && !(await cm([{ type: "link", url: "https://example.com" }])).ok && !(await cm([{ type: "nothing" }])).ok && !(await cm("x")).ok)
  check("pictures and files need the upload right; a GIF does not", !(await cm([ownPic], { role: null })).ok && (await cm([gifItem], { role: null })).ok)
  const rowOf = (o: Record<string, unknown>) => ({ id: U(50), post_id: U(60), community_id: U(900), parent_id: null, author_id: U(1), body: "hi", status: "published", reaction_count: 0, removed_by: null, removed_reason: null, edited_at: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", deleted_at: null, ...o }) as never
  const opts = { viewerId: U(1), moderator: false, authors: new Map(), reacted: new Set<string>() }
  const [live1] = buildThread([rowOf({ media: [ownPic] })], [], opts)
  const [gone1] = buildThread([rowOf({ id: U(51), media: [ownPic], status: "deleted" })], [rowOf({ id: U(52), parent_id: U(51) })], opts)
  check("a comment's media is drawn with it, and never with a deleted one", live1.media?.length === 1 && !gone1.media && !("media" in buildThread([rowOf({})], [], opts)[0]))
  check("a notification for a comment with no words says what it carries", mediaLine([gifItem as never]) === "Sent a GIF" && mediaLine([ownPic, ownPic] as never) === "Sent 2 pictures" && mediaLine([ownFile as never]) === "Sent a file")
  resetMediaColumn()
  const asked: string[] = []
  const fake = (columns: string) => {
    asked.push(columns)
    return Promise.resolve(/media/.test(columns) ? { data: null, error: { code: "42703", message: "column community_feed_comments.media does not exist" } } : { data: [1], error: null })
  }
  const first = await withCommentColumns(fake)
  const second = await withCommentColumns(fake)
  check("PART 96 NOT RUN: comments are read without the column, asked again at once, then remembered", first.error === null && second.error === null && asked.length === 3 && /media/.test(asked[0]) && !/media/.test(asked[1]) && !/media/.test(asked[2]))
  resetMediaColumn()
  check("a missing column is told apart from any other error", noMediaColumn({ code: "PGRST204", message: "Could not find the 'media' column of 'community_feed_comments' in the schema cache" }) && !noMediaColumn({ code: "42703", message: "column x.other does not exist" }) && !noMediaColumn({ code: "23505", message: "media" }))
  const comments11 = code("lib/communities/server/comments.ts")
  check("createComment checks what a comment carries before it writes, and refuses media in words when part 96 has not run", /const media = await checkCommentMedia\(db, community, viewer, r\.media\)/.test(comments11) && /if \(carried\.length && noMediaColumn\(error\)\) return \{ ok: false/.test(comments11) && /\.\.\.\(carried\.length \? \{ media: carried \} : \{\}\)/.test(comments11))
  check("the media checks are the post's own first (checkMedia), then the member's own uploads (storage, the community's files)", /const checked = checkMedia\(raw\)/.test(comments11) && /storedObjectSize\(db as SupabaseClient, PICTURE_BUCKET, path\)/.test(comments11) && /communityFilesExist\(db, community, viewer\.userId,/.test(comments11))
  const cfile = code("app/api/community/[communityId]/comments/[commentId]/files/[assetId]/route.ts")
  check("a comment's file downloads only through the member gate: communities on, a member who may see the post, the file named on the comment as the commenter's own", /requireCommunitiesOn\(\)\s*if \(off\) return off/.test(cfile) && /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(cfile) && /\.eq\("community_id", gate\.community\.id\)/.test(cfile) && /visiblePostRow\(db, gate\.community, gate\.viewer, row\.post_id\)/.test(cfile) && /named\.store !== "community"/.test(cfile) && /signCommunityFile\(db, gate\.community, row\.author_id,/.test(cfile))
  const p96 = read("supabase/sql/run-now/96_community_comment_media.sql")
  const p96lines = p96.trimEnd().split("\n")
  check("SQL PART 96: three lines, one statement each, safe to run again, the reload last", p96lines.length === 3 && p96lines[0].startsWith("/*") && /ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '\[\]'::jsonb/.test(p96lines[1]) && /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'community_feed_comments_media_shape'/.test(p96lines[1]) && /^DO \$do\$ .* END \$do\$;$/.test(p96lines[1]) && p96lines[2] === "notify pgrst, 'reload schema';")
  check("its copy in migrations is the same, the README has its row and the check after has its column", read("supabase/migrations/20261114_community_comment_media.sql") === p96 && /`96_community_comment_media\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p96_community_comment_media/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const heart11 = code("components/community/member/heart.tsx")
  check("BURST: 6 to 10 tiny hearts, done within 500ms, on a like only", BURST_COUNT >= 6 && BURST_COUNT <= 10 && burstPaths(20).length === BURST_COUNT && BURST_MS < 500 && /if \(!on\) \{[\s\S]{0,120}return\s*\}[\s\S]{0,900}burst\(el, size\)/.test(heart11))
  check("the tiny hearts move by translate, scale, rotate and opacity only, and leave the page after", !/(left|top|width|height|margin):\s*`?\$\{[^}]*\}`?\s*,?\s*opacity/.test(heart11) && /\{ translate: at\(0\), scale:/.test(heart11) && /layer\.remove\(\)/.test(heart11) && /window\.setTimeout\(gone, BURST_MS \+ 120\)/.test(heart11) && /requestAnimationFrame\(\(\) => burst\(el, size\)\)/.test(heart11) && /position:fixed;/.test(heart11))
  const box11 = code("components/community/member/comments.tsx")
  check("THE COMMENT BOX: a 10px corner, a hairline, a 1px shadow, a soft ring with the caret; pressed by a tint, never a shrink", /rounded-\[10px\] border border-\[#e3e5e9\] bg-white shadow-\[0_1px_1px_rgba\(16,24,40,0\.05\)\]/.test(box11) && /focus-within:shadow-\[0_0_0_3px/.test(box11) && !/group-active\/send:scale/.test(box11) && /group-active\/send:opacity-80/.test(box11))
  check("pictures, files and a GIF go in through the composer's own pipeline", /uploadPicture\(file, author\.id, communityId\)/.test(box11) && /uploadCommunityFile\(\{ communityId, file/.test(box11) && /<GifButton communityId=\{communityId\}/.test(box11) && /<CommentMedia media=\{c\.media\}/.test(box11))
  const composer11 = code("components/community/member/composer.tsx")
  check("THE ONE CARD: the composer is one element whatever its state (no key swap, its own opacity never animated), cleared only once closed", /<div ref=\{cardRef\} className=\{`\$\{CARD\} \$\{PHONE_ROW\} relative/.test(composer11) && !/cardRef\.current\.animate\(\[\{ opacity/.test(composer11) && /clearAfter\.current = true\s*shut\(\)/.test(composer11) && /if \(clearAfter\.current\) \{\s*clearAfter\.current = false\s*clear\(\)/.test(composer11))
  check("the closed row and the editor crossfade without a dip (the one coming eases out, the one going eases in)", /rowRef\.current\?\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: ROW_OUT_MS, easing: FADE_GOING \}\)/.test(composer11) && /editorRef\.current\?\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: FADE_IN_MS, easing: FADE_COMING \}\)/.test(composer11))
  check("a comment lands by translate, scale and opacity, its layer only for the move", /el\.animate\(\[\{ translate: "0 14px", scale: "0\.985" \}, \{ translate: "0 0", scale: "1" \}\], \{ duration: LAND_MS, easing: LAND_EASE \}\)/.test(code("components/community/member/arrive.ts")) && /el\.style\.willChange = ""/.test(code("components/community/member/arrive.ts")))

  console.log("\nCopy and boundaries")
  const mine = [
    "lib/communities/post-media.ts",
    "lib/communities/server/post-files.ts",
    "lib/communities/server/gifs.ts",
    "app/api/community/[communityId]/files/route.ts",
    "app/api/community/[communityId]/gifs/route.ts",
    "components/community/member/composer.tsx",
    "components/community/member/post-card.tsx",
    "components/community/member/post-page.tsx",
    "components/community/member/post-overlay.tsx",
    "components/community/member/comments.tsx",
    "components/community/member/media.tsx",
    "components/community/member/media-gif.tsx",
    "components/community/member/media-upload.ts",
    "components/community/member/lightbox.tsx",
    "components/community/member/media-viewer.tsx",
    "components/community/member/post-intent.ts",
    "components/community/member/post-seen.ts",
    "components/community/member/keep-in-sight.ts",
    "components/community/member/live.ts",
    "components/community/member/feed-live.tsx",
    "components/community/member/arrive.ts",
    "components/community/member/heart.tsx",
    "lib/communities/server/realtime.ts",
    "app/api/community/[communityId]/live/route.ts",
    "app/api/community/[communityId]/comments/[commentId]/files/[assetId]/route.ts",
    "lib/communities/server/comments.ts",
    "supabase/sql/run-now/96_community_comment_media.sql",
    "components/community/member/messages.tsx",
    "components/community/member/messages-setup-note.tsx",
    "scripts/check-community-posts.mjs",
    "scripts/render-community-posts.tsx",
  ]
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word", offenders.length === 0, offenders.join(", "))
  const clients = mine.filter((f) => /^"use client"/.test(read(f)))
  const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth|\.\/(data|shell|feed-page|messages-setup-note)"/.test(code(f)))
  check("client parts import nothing from the server", clients.length >= 9 && leaks.length === 0, leaks.join(", "))
  check("lib/communities/post-media.ts is browser safe", !/server-only|node:/.test(code("lib/communities/post-media.ts")))
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
