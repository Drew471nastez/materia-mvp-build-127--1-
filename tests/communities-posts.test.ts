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
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  MAX_EMBEDS,
  MAX_GIFS,
  MEMBER_FILE_MAX_BYTES,
  STAFF_FILE_MAX_BYTES,
  cardThumb,
  communityFilePath,
  embedFromUrl,
  embedPlayerSrc,
  embedThumbUrl,
  fileDisplayName,
  fileExtension,
  giphyUrl,
  viewerItems,
} from "@/lib/communities/post-media"
import { checkMedia, checkPostInput, commentersByPost, COMMENTER_FACES } from "@/lib/communities/server/feed"
import { cleanGifQuery, giphyKey, parseGiphy } from "@/lib/communities/server/gifs"
import { communityFilesExist, fileLimitFor, prepareCommunityFile } from "@/lib/communities/server/post-files"
import { isUnread, type SeenStore } from "@/components/community/member/post-seen"
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
  check("the card: thumbnail, faces, New comment, level badge, unread dot", /<PostThumb media=\{post\.media\} \/>/.test(card) && /data-commenters=""/.test(card) && /\{newCommentLabel\(fresh\)\}/.test(card) && /data-level-badge=""/.test(card) && /data-unread-dot=""/.test(card) && /line-clamp-2/.test(card))
  check("the card's props are the ones the feed already passes", /export interface PostCardProps \{\s*post: FeedPostView\s*slug: string\s*viewer: ViewerView\s*update: PostUpdate\s*full\?: boolean\s*readOnly\?: boolean\s*onComment\?: \(\) => void\s*\}/.test(card.replace(/\/\*\*[^]*?\*\//g, "")))
  check("pressing the card opens the post over the feed; links and buttons inside do their own thing", /onClick=\{openPost\}/.test(card) && /closest\("a, button, input, textarea, select, label/.test(card) && /<PostOverlay/.test(card))
  check("a press with a modifier key is a plain link", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(card))
  const overlay = code("components/community/member/post-overlay.tsx")
  check("the opened post takes the post's own address without loading a page; Back closes it", /useHistoryLayer\(true, close, `\/community\/\$\{slug\}\/post\/\$\{given\.id\}`\)/.test(overlay))
  check("the opened post: a panel on a computer, a sheet that a swipe down closes on a phone", /data-post-overlay="panel"/.test(overlay) && /data-post-overlay="phone"/.test(overlay) && /if \(dy > 110 \|\| \(fast && dy > 30\)\) close\(\)/.test(overlay))
  check("it reads the comments itself and passes changes to the card underneath", /<CommentsSection post=\{post\} slug=\{slug\} viewer=\{viewer\} initial=\{null\}/.test(overlay) && /update\(id, fn\)/.test(overlay))
  check("its moves are opacity, translate and scale only", !/transition:[^`"]*\b(top|left|height|width|margin)\b/.test(overlay))
  const lb = code("components/community/member/lightbox.tsx")
  check("history layers: a pushed entry carrying Next's state; Back closes; closing otherwise steps back", /pushState\(\{ \.\.\.\(window\.history\.state \?\? \{\}\), storelibLayer: marker \}/.test(lb) && /window\.addEventListener\("popstate", onPop\)/.test(lb) && /window\.history\.back\(\)/.test(lb))
  check("the lightbox: Escape, arrow keys, swipe, pinch, double tap", /e\.key === "Escape"/.test(lb) && /e\.key === "ArrowRight"/.test(lb) && /kind: "pinch"/.test(lb) && /lastTap\.current < 280/.test(lb) && /drag\.x < -SWIPE/.test(lb))
  check("pictures at the size the screen needs, videos only on press", /optimizedSrcSet\(item\.url, \[640, 828, 1080, 1200, 1920, 2048\]\)/.test(lb) && /<StorelibVideo communityId=\{communityId\} videoId=\{item\.videoId\} poster=\{item\.poster\} \/>/.test(lb) && /play \? \(\s*<iframe/.test(lb))
  const media = code("components/community/member/media.tsx")
  check("inside a post media is a grid of thumbnails, never the post's full width, lazy, in fixed boxes", /max-w-\[min\(360px,82%\)\]/.test(media) && /sm:h-\[148px\] sm:w-\[148px\]/.test(media) && /loading="lazy"/.test(media) && !/w-full rounded-xl[^"]*aspect-video/.test(media))

  /* ── Composer ───────────────────────────────────────────────────────── */
  console.log("\nThe composer")
  const composer = code("components/community/member/composer.tsx")
  check("closed it is one field, Share something...", /data-composer="closed"/.test(composer) && /"Share something\.\.\."/.test(composer) && !/data-composer-action=/.test(composer))
  check("a computer edits in place, a phone in a screen of its own", /data-composer="open"/.test(composer) && /data-composer="sheet"/.test(composer))
  check("Post waits for a title, words, a space and every upload", /const ready = !!title\.trim\(\) && !!body\.trim\(\) && !!spaceId && !uploading && !!pollReady/.test(composer) && /disabled=\{busy \|\| !ready\}/.test(composer))
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

  /* ── Copy and boundaries ────────────────────────────────────────────── */
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
    "components/community/member/post-seen.ts",
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
