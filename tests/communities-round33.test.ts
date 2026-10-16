/**
 * ===========================================================================
 *  ROUND 33: A FEED'S VIDEO STILLS, THE SPACES' DRAG, THE ADMIN'S PENCILS
 * ===========================================================================
 * What is pure is run, the server's still is run against the in-memory
 * database and real sharp, and what is a screen is read from its source
 * (scripts/check-media-round33.mjs measures the screens frame by frame):
 *
 *   STILLS    a video's still filled in later from a frame its author's or
 *             a moderator's browser drew: only on their own posts (every
 *             post for a moderator), never over a still that is there, kept
 *             where the daily sweep never takes it; the 16px copy made by the
 *             server and only for the poster it was made from
 *   CARDS     the 16px copy drawn blurred under the still, the play mark
 *             with the picture, a frame sent only for a viewer who may
 *   SPACES    the drag is dnd-kit's hold to drag, lifted on an overlay,
 *             saved once with the order put back on a refusal
 *   PENCILS   only for somebody who may open /app and change that block
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { memDb } from "./_classroom-db"
import { cardPictures, cardThumb, videoBlurOf, videosWithoutBlur, videosWithoutPoster, viewerItems, withVideoStill, PICTURE_BUCKET } from "@/lib/communities/post-media"
import { VIDEO_POSTER, blurOf, blurPostVideos, framePath, looksLikeFrame, mayFillAny, saveVideoBlurs, saveVideoFrame, stillFromFrame } from "@/lib/communities/server/video-posters"
import { COMMUNITY_PICTURE_PATH } from "@/lib/communities/server/orphans"
import { adminHref } from "@/components/community/member/edit-href"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommunityRow, MediaVideoRow, PostMedia, ViewerView } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import { untt } from "./i18n-source"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))
const statusOf = (r: unknown) => (r as { status?: number }).status
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const COMMUNITY = U(1)
const CREATOR = U(2)
const ME = U(50)
const OTHER = U(51)
const VIDEO = U(70)
const OWN = (user: string, name: string) => `https://abc.supabase.co/storage/v1/object/public/${PICTURE_BUCKET}/${user}/community/${COMMUNITY}/${name}`
const BLUR = "data:image/webp;base64,UklGRkQAAABXRUJQVlA4IDgAAADQAQCdASoQAAkAAUAmJaQAA3AA/v89WAAAAA=="

function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: ME, role: "member", active: true, status: "active", banned: false, tierId: null, ownedProductIds: [], level: 1, mutedUntil: null, member: null, perms: null, ...o } as unknown as Viewer
}
const community = { id: COMMUNITY, creator_id: CREATOR, status: "published", visibility: "private" } as unknown as CommunityRow
const video = (o: Partial<MediaVideoRow> = {}) => ({ id: VIDEO, creator_id: CREATOR, community_id: COMMUNITY, provider: "storage", status: "ready", thumbnail_url: null, ...o }) as MediaVideoRow

/** The in-memory database with the two storage calls a still needs (an upload, its public address). */
function db(posts: Record<string, unknown>[]) {
  const d = memDb({ community_feed_posts: posts, media_videos: [{ ...video() }] })
  const base = d.storage.from.bind(d.storage)
  ;(d.storage as { from: unknown }).from = (bucket: string) => ({
    ...base(bucket),
    async upload(path: string, bytes: Uint8Array) {
      d.put(bucket, path, new Uint8Array(bytes))
      return { data: { path }, error: null }
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}` } }
    },
  })
  return d
}

async function main() {
  const sharp = (await import("sharp")).default
  const frame = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer()

  console.log("\nSTILLS (pure)")
  {
    const media: PostMedia[] = [{ type: "image", url: OWN(ME, "a.jpg") }, { type: "video", videoId: VIDEO }, { type: "video", videoId: U(71), poster: OWN(ME, "p.jpg") }]
    check("a video with no still, and one whose still has no 16px copy, are told apart", videosWithoutPoster(media).join() === VIDEO && videosWithoutBlur(media).join() === U(71))
    const filled = withVideoStill(media, VIDEO.toUpperCase(), { poster: OWN(ME, "poster-x.jpg"), w: 1280, h: 720, blur: BLUR })
    const v = filled?.find((m) => m.type === "video" && m.videoId === VIDEO) as Extract<PostMedia, { type: "video" }> | undefined
    check("a missing still is filled in, with its shape and its 16px copy", v?.poster === OWN(ME, "poster-x.jpg") && v?.w === 1280 && v?.h === 720 && v?.blur === BLUR)
    check("a still that is there is never replaced", withVideoStill(media, U(71), { poster: OWN(OTHER, "other.jpg") }) === null)
    check("a 16px copy goes only on the still it was made from", withVideoStill(media, U(71), { blur: BLUR, blurFor: OWN(ME, "else.jpg") }) === null && !!withVideoStill(media, U(71), { blur: BLUR, blurFor: OWN(ME, "p.jpg") }))
    check("a 16px copy is a short data address of a picture, nothing else", videoBlurOf(BLUR) === BLUR && videoBlurOf("data:image/svg+xml;base64,PHN2Zz4=") === null && videoBlurOf("https://x.test/a.webp") === null && videoBlurOf(`data:image/webp;base64,${"A".repeat(3000)}`) === null)
    const withBlur: PostMedia[] = [{ type: "video", videoId: VIDEO, poster: OWN(ME, "p.jpg"), blur: BLUR }]
    check("the card, the thumbnail and the viewer carry the 16px copy and the video's id", cardPictures(withBlur)[0].blur === BLUR && cardPictures(withBlur)[0].videoId === VIDEO && cardThumb(withBlur)?.blur === BLUR && (viewerItems(withBlur)[0] as { blur?: string }).blur === BLUR)
    check("and nothing about it when there is none", !("blur" in cardPictures([{ type: "video", videoId: VIDEO, poster: OWN(ME, "p.jpg") }])[0]) && !("blur" in viewerItems([{ type: "video", videoId: VIDEO }])[0]))
  }

  console.log("\nSTILLS (the server)")
  {
    check("a frame is a JPEG, PNG or WebP by its first bytes", looksLikeFrame(new Uint8Array(frame)) && !looksLikeFrame(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")))
    const still = await stillFromFrame(new Uint8Array(frame))
    check("the frame is written again by sharp as a JPEG, its size kept under 1280px", !!still && still.width === 640 && still.height === 360 && still.data[0] === 0xff && still.data[1] === 0xd8)
    check("anything that is not a picture is no still", (await stillFromFrame(new TextEncoder().encode("not a picture at all, just words"))) === null)
    const blur = await blurOf(frame)
    check(`the 16px copy is a few hundred characters (${blur?.length})`, !!blur && blur.startsWith("data:image/webp;base64,") && blur.length < 400)
    const path = framePath(ME, COMMUNITY, VIDEO, 1_760_000_000_000)
    check("a still is kept in the sender's own folder, under a name the daily sweep never takes", path.startsWith(`${ME}/community/${COMMUNITY}/poster-`) && !COMMUNITY_PICTURE_PATH.test(path))
    check("a moderator may fill in anybody's, a member only their own", mayFillAny(viewer({ role: "moderator" })) && !mayFillAny(viewer()) && !mayFillAny(viewer({ role: "admin", active: false })))
    check("the frame a browser may send is bounded", VIDEO_POSTER.maxBytes <= 4 * 1024 * 1024)
  }
  {
    const posts = () => [
      { id: U(80), community_id: COMMUNITY, author_id: ME, status: "published", media: [{ type: "video", videoId: VIDEO }] },
      { id: U(81), community_id: COMMUNITY, author_id: OTHER, status: "published", media: [{ type: "video", videoId: VIDEO }] },
      { id: U(82), community_id: COMMUNITY, author_id: ME, status: "published", media: [{ type: "video", videoId: VIDEO, poster: OWN(ME, "kept.jpg") }] },
    ]
    const d = db(posts())
    const done = await saveVideoFrame(d as never, { community, viewer: viewer(), video: video(), bytes: new Uint8Array(frame), w: 1920, h: 1080 })
    const rows = d.tables.community_feed_posts as { id: string; media: PostMedia[] }[]
    const mine = rows.find((r) => r.id === U(80))!.media[0] as Extract<PostMedia, { type: "video" }>
    const theirs = rows.find((r) => r.id === U(81))!.media[0] as Extract<PostMedia, { type: "video" }>
    const kept = rows.find((r) => r.id === U(82))!.media[0] as Extract<PostMedia, { type: "video" }>
    check("the author's frame becomes the still of their own post, with the video's shape and its 16px copy", done.ok && done.posts === 1 && !!mine.poster && mine.w === 1920 && mine.h === 1080 && !!mine.blur, done)
    check("and nobody else's post", !theirs.poster)
    check("a still that was there stays", kept.poster === OWN(ME, "kept.jpg"))
    check("the stored still is in the author's folder, and the video's row keeps it", !!mine.poster && mine.poster.includes(`/${ME}/community/${COMMUNITY}/poster-`) && (d.tables.media_videos as { thumbnail_url: string }[])[0].thumbnail_url === mine.poster)
    const again = await saveVideoFrame(d as never, { community, viewer: viewer(), video: video(), bytes: new Uint8Array(frame) })
    check("sent again, nothing is replaced and nothing new is stored", again.ok && again.posts === 0 && again.poster === mine.poster, again)

    const d2 = db(posts())
    const stranger = await saveVideoFrame(d2 as never, { community, viewer: viewer({ userId: U(99) }), video: video(), bytes: new Uint8Array(frame) })
    check("a member whose post it is not is the same 404 as a video that is not there", !stranger.ok && statusOf(stranger) === 404 && ![...d2.files.keys()].length)
    const mod = await saveVideoFrame(d2 as never, { community, viewer: viewer({ userId: U(98), role: "moderator" }), video: video(), bytes: new Uint8Array(frame) })
    check("a moderator fills in every post that carries it without one", mod.ok && mod.posts === 2 && (d2.tables.community_feed_posts as { media: PostMedia[] }[]).every((r) => !!(r.media[0] as { poster?: string }).poster))
    const d3 = db(posts())
    const junk = await saveVideoFrame(d3 as never, { community, viewer: viewer(), video: video(), bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>") })
    check("bytes that are not a picture are refused and nothing is stored", !junk.ok && statusOf(junk) === 415 && ![...d3.files.keys()].length)
    const notReady = await saveVideoFrame(d3 as never, { community, viewer: viewer(), video: video({ status: "processing" }), bytes: new Uint8Array(frame) })
    check("a video still processing takes no still", !notReady.ok && statusOf(notReady) === 409)
  }
  {
    const path = `${ME}/community/${COMMUNITY}/1760000000000_abc.jpg`
    const d = db([{ id: U(90), community_id: COMMUNITY, author_id: ME, status: "published", media: [{ type: "video", videoId: VIDEO, poster: OWN(ME, "1760000000000_abc.jpg") }] }])
    d.put(PICTURE_BUCKET, path, new Uint8Array(frame))
    await blurPostVideos(d as never, COMMUNITY, U(90))
    const v = (d.tables.community_feed_posts as { media: PostMedia[] }[])[0].media[0] as Extract<PostMedia, { type: "video" }>
    check("after a post is written its still gets its 16px copy from storage", !!videoBlurOf(v.blur))
    const d2 = db([{ id: U(91), community_id: COMMUNITY, author_id: OTHER, status: "published", media: [{ type: "video", videoId: VIDEO, poster: OWN(ME, "1760000000000_abc.jpg") }] }])
    d2.put(PICTURE_BUCKET, path, new Uint8Array(frame))
    const member = await saveVideoBlurs(d2 as never, { community, viewer: viewer(), video: video() })
    const mod = await saveVideoBlurs(d2 as never, { community, viewer: viewer({ role: "moderator" }), video: video() })
    check("an older post's copy: not for a member whose post it is not, yes for a moderator", !member.ok && statusOf(member) === 404 && mod.ok && mod.posts === 1)
  }

  console.log("\nTHE ROUTE AND THE WRITES")
  {
    const route = code("app/api/community/[communityId]/videos/[videoId]/poster/route.ts")
    check("the poster route: an active member, counted, about a video of THIS community", /requireMember\(db, communityId, userId, "view"\)/.test(route) && /bucket: "community-video-poster"/.test(route) && /readCommunityVideo\(db, gate\.community\.id, videoId\)/.test(route))
    check("its body is bounded before and after it is read", /declared > VIDEO_POSTER\.maxBytes/.test(route) && /bytes\.length > VIDEO_POSTER\.maxBytes/.test(route))
    const vp = code("lib/communities/server/video-posters.ts")
    check("a sent frame is checked like a picture an edit adds, and removed when it is refused", /screenPictures\(db, \{ communityId: community\.id, userId: viewer\.userId, fresh: isNewMember\(viewer\), team: isTeam\(viewer\.role\) \}/.test(vp) && /if \(screen\.refuse \|\| screen\.hold\.length\) \{\s*await drop\(\)/.test(vp))
    check("filling in a still writes the media only (not edited_at, not last activity)", /\.update\(\{ media \}\)/.test(vp) && !/edited_at/.test(vp))
    for (const f of ["app/api/community/[communityId]/posts/route.ts", "app/api/community/[communityId]/posts/[postId]/route.ts"]) check(`${f.split("/").slice(-2).join("/")}: the 16px copies are made after the answer`, /if \(post\.media\.some\(\(m\) => m\.type === "video"\)\) after\(\(\) => blurPostVideos\(db, communityId, post\.id\)\)/.test(code(f)))
  }

  console.log("\nCARDS")
  {
    const media = code("components/community/member/media.tsx")
    const upload = code("components/community/member/media-upload.ts")
    const card = code("components/community/member/post-card.tsx")
    check("the 16px copy is drawn blurred, from the page's own data, under the still", /export function VideoBlur/.test(media) && /decoding="sync"/.test(media.slice(media.indexOf("export function VideoBlur"), media.indexOf("export function useHeldMark"))) && /\{thumb\.blur \? <VideoBlur src=\{thumb\.blur\} \/> : null\}/.test(media) && /\{p\.blur && !failed \? <VideoBlur src=\{p\.blur\} \/> : null\}/.test(media))
    check("the mark comes with the picture: held on a card until it is drawn, after 900ms at most in an opened post", /export function useHeldMark\(ready: boolean, wait: number \| null = null\)/.test(media) && /useHeldMark\(!!item\.blur, PLAY_MARK_WAIT_MS\)/.test(media) && /<PlayMark size="sm" shown=\{mark\} \/>/.test(media))
    check("a video that will never have a frame shows the player's own ground and its mark at once", /onNone=\{\(\) => \(setNone\(true\), showMark\(\)\)\}/.test(media) && /NO_FRAME = "\[background-color:#0f0f17\]"/.test(media))
    check("a frame is sent as the still only when the viewer may fill it in", /keepVideoFrame\(videoId, v, fill \? \(frame, size\) => void sendVideoFrame\(communityId, videoId, frame, size\) : undefined\)/.test(media) && /const fillStills = post\.canEdit \|\| post\.canModerate/.test(card))
    check("the first frame is asked for well ahead, at once for the first screen, never for a box that is not drawn", /VIDEO_FRAME_AHEAD = "1200px 0px"/.test(media) && /eager && el\.getClientRects\(\)\.length > 0/.test(media))
    check("a frame is sent once a session, as the JPEG it is", /onceThisSession\(key\)/.test(upload) && /headers: \{ "Content-Type": frame\.type \|\| "image\/jpeg" \}/.test(upload))
    check("the still at upload: the video is put in the page (iOS decodes nothing off it), never sent to where it already is", /document\.body\.appendChild\(v\)/.test(upload) && /if \(t > 0\.05 && Math\.abs\(v\.currentTime - t\) > 0\.05\) v\.currentTime = t\s*else takeWhenPainted\(\)/.test(upload) && /void v\.play\(\)/.test(upload))
  }

  console.log("\nSPACES")
  {
    const s = code("components/community/creator/spaces-section.tsx")
    check("the product editor's hold to drag (a mouse after 4px, a finger after a 300ms hold, the keys), scrolling near the edges", /const sensors = useHoldToDragSensors\(\)/.test(s) && /autoScroll: AUTO_SCROLL/.test(s) && /screenReaderInstructions/.test(s))
    check("the lifted copy is an overlay that settles into its slot; the rows slide on their own move", /<DragOverlay dropAnimation=\{settle\(\)\}>/.test(s) && /verticalListSortingStrategy/.test(s) && /sortableMove\(sortable\)/.test(s))
    check("no browser drag any more", !/dataTransfer/.test(s) && !/onDragOver=/.test(s))
    check("saved once on the drop, put back on a refusal", /onDragEnd = \(\{ active, over \}: DragEndEvent\)/.test(s) && /void saveOrder\(next, was\)/.test(s) && /\? was : now\)\)/.test(s))
    check("the press that ended a drag opens nothing", /if \(Date\.now\(\) < quietUntil\.current\) return/.test(s))
    check("a press in the row's own controls starts no drag", /closest\?\.\("\[data-row-control\]"\)/.test(s))
  }

  console.log("\nPENCILS")
  {
    const v = (o: Partial<ViewerView>): ViewerView => ({ userId: "u", signedIn: true, role: "admin", status: "active", active: true, tierId: null, level: 1, points: 0, isOwner: false, isCreatorAccount: true, mutedUntil: null, can: allowedActions("admin"), ...o }) as ViewerView
    check("an admin with a creator account gets the admin's place", adminHref("clay", v({}), "manage_spaces", "spaces") === "/app/community/clay/spaces")
    check("a member, an admin without a creator account, or one who may not change it, gets none", adminHref("clay", v({ role: "member", isCreatorAccount: false, can: allowedActions("member") }), "manage_spaces", "spaces") === null && adminHref("clay", v({ isCreatorAccount: false }), "manage_spaces", "spaces") === null && adminHref("clay", v({ can: {} }), "manage_spaces", "spaces") === null && adminHref("clay", v({ active: false }), "manage_spaces", "spaces") === null)
    const hint = code("components/community/member/edit-hint.tsx")
    check("on a computer it shows under the pointer only; on a phone only where the block asks for it", /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:opacity-0 group-hover\/edit:opacity-100/.test(hint) && /\[@media_not_all_and_\(hover:hover\)_and_\(pointer:fine\)\]:hidden/.test(hint))
    check("the spaces row, the card, Learn and the calendar carry one", /editHref=\{adminHref\(slug, viewer, "manage_spaces", "spaces"\)\}/.test(code("components/community/member/feed.tsx")) && /href=\{card\.settingsHref\.replace\(\/\\\/settings\$\/, "\/page"\)\}/.test(code("components/community/member/wall.tsx")) && /<EditHint href=\{manageHref\}/.test(code("components/community/learn/learn-library.tsx")) && /<EditHint href=\{editHref\} label="Edit calendar" phone \/>/.test(code("components/community/events/events-page.tsx")))
  }

  console.log("\nCOPY")
  {
    const BANNED = /\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
    for (const f of ["components/community/member/edit-hint.tsx", "lib/communities/server/video-posters.ts", "app/api/community/[communityId]/videos/[videoId]/poster/route.ts", "components/community/creator/spaces-section.tsx"]) {
      const src = readFileSync(f, "utf8")
      check(`${f.split("/").pop()}: no em dash, none of the banned words`, !src.includes("—") && !BANNED.test(code(f)))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
