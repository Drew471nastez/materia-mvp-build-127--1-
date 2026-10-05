/**
 * ===========================================================================
 *  COMMUNITIES: VIDEO AND ATTACHMENTS, ROUND 13 (V)
 * ===========================================================================
 * Held from their inputs and their source (the player, the preview and the
 * tray's drag, frame by frame, are measured by scripts/check-community-video.mjs):
 *
 *   THE CAUSE   "This video is not available" for every member who was not
 *               staff: the post lookup handed supabase-js an ARRAY for a
 *               jsonb containment, which it writes as a Postgres array
 *               literal (cs.{[object Object]}); Postgres refuses that as
 *               JSON, the read came back empty and the play route said 404.
 *               Proven here on the real supabase-js query builder, and the
 *               fake database now answers what Postgres answers.
 *   WAITING     a video on a service is waited on until it plays (a status
 *               route that also asks the service, at most every few
 *               seconds); a failure says the service's reason
 *   TRAY        drag order, slots while moving, nearest slot
 *   PLAYER      the box's shape, the lighter file on slow networks, no
 *               preview with Save Data, 2G or reduced motion
 *   COVER       an uploaded video can be the About cover; its still is the
 *               cover picture
 *
 * Run with:  npm run test:push
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

import { stripComments } from "./_source"
import { memDb } from "./_classroom-db"
import { postVideoFilter, refreshVideoStatus, videoAccess, readCommunityVideo, videoPlayback, VIDEO_STATUS_ASK_MS } from "@/lib/communities/server/videos"
import { PROCESSING_FAILED, PROCESSING_TOO_LONG, WAIT_GIVE_UP_MS, processingFailure, waitStep, waitUntilPlayable } from "@/lib/video/upload-client"
import { playbackQuality } from "@/lib/video/provider"
import { bunnyAdapter } from "@/lib/video/bunny"
import { moveKey, nearestSlot, slotWhileMoving, LIFT_HOLD_MS, MOUSE_LIFT_PX } from "@/components/community/member/attachment-tray"
import { boxRatio, previewAllowed, wantsLight } from "@/components/video/storelib-video"
import { checkGallery, coverItem, coverUpload, coverVideo } from "@/components/community/creator/logic"
import { coverAfterGallery } from "@/lib/communities/server/gallery"
import { parseGallery } from "@/components/community/public/gallery"
import type { CommunityRow, MediaVideoRow } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import type { VideoStatusView } from "@/lib/video/types"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const COMMUNITY = U(1)
const CREATOR = U(2)
const SPACE = U(3)

function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: U(50), role: "member", active: true, status: "active", banned: false, tierId: null, ownedProductIds: [], level: 1, mutedUntil: null, ...o } as unknown as Viewer
}
function community(o: Partial<CommunityRow> = {}): CommunityRow {
  return { id: COMMUNITY, creator_id: CREATOR, status: "published", visibility: "private", cover_video_id: null, suspended_at: null, deleted_at: null, ...o } as unknown as CommunityRow
}
function videoRow(n: number, o: Partial<MediaVideoRow> = {}): MediaVideoRow {
  return {
    id: U(n),
    creator_id: CREATOR,
    community_id: COMMUNITY,
    provider: "storage",
    status: "ready",
    storage_path: `${CREATOR}/community-media/${U(n)}/1-a.mp4`,
    provider_asset_id: null,
    playback_id: null,
    thumbnail_url: null,
    duration_seconds: 12,
    width: 1080,
    height: 1920,
    size_bytes: 1000,
    mime: "video/mp4",
    captions_path: null,
    error: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...o,
  }
}

async function main() {
  /* ── The cause, on the real query builder ─────────────────────────────── */
  console.log("\nTHE CAUSE: what supabase-js sends for a jsonb containment")
  {
    const sent: string[] = []
    const client = createClient("https://example.supabase.co", "anon", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (async (input: RequestInfo | URL) => {
          sent.push(decodeURIComponent(String(input).replace(/\+/g, " ")))
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
        }) as typeof fetch,
      },
    })
    const id = U(120)
    await client.from("community_feed_posts").select("id").contains("media", [{ videoId: id }])
    await client.from("community_feed_posts").select("id").contains("media", postVideoFilter(id))
    const before = sent[0]?.match(/media=([^&]*)/)?.[1] ?? ""
    const after = sent[1]?.match(/media=([^&]*)/)?.[1] ?? ""
    check("an array was sent as a Postgres array literal, which jsonb refuses (the bug)", before === "cs.{[object Object]}", before)
    let parsed: unknown = null
    try {
      parsed = JSON.parse(after.slice(3))
    } catch {
      parsed = null
    }
    check("the filter now goes as JSON text: media @> [{\"videoId\": id}]", after.startsWith("cs.[") && JSON.stringify(parsed) === JSON.stringify([{ videoId: id }]), after)
    check("the id is lower cased, as the post keeps it", postVideoFilter(id.toUpperCase()) === JSON.stringify([{ videoId: id }]))
    check("the play route's access check uses it, and says when the read fails", /\.contains\("media", postVideoFilter\(video\.id\)\)/.test(code("lib/communities/server/videos.ts")) && /posts read: \$\{reasonOf\(postsError\)\}/.test(code("lib/communities/server/videos.ts")) && !/\.contains\("media", \[/.test(code("lib/communities/server/videos.ts")))
    const anywhere = ["lib", "app", "components"].flatMap((dir) => {
      const out: string[] = []
      const walk = (d: string) => {
        for (const name of readdirSync(d, { withFileTypes: true })) {
          const p = `${d}/${name.name}`
          if (name.isDirectory()) walk(p)
          else if (/\.(ts|tsx)$/.test(name.name) && /\.contains\("[a-z_]+", \[\{/.test(read(p))) out.push(p)
        }
      }
      walk(dir)
      return out
    })
    check("nothing else hands contains() an array of objects", anywhere.length === 0, anywhere.join(", "))
  }

  console.log("\nWHO MAY WATCH: a member, with the fake answering what Postgres answers")
  {
    const db = memDb({
      media_videos: [videoRow(120)],
      community_spaces: [{ id: SPACE, community_id: COMMUNITY, view_access: {}, archived_at: null }],
      community_feed_posts: [{ id: U(130), community_id: COMMUNITY, space_id: SPACE, status: "published", media: [{ type: "video", videoId: U(120), poster: "https://x.supabase.co/p.jpg", w: 1080, h: 1920 }] }],
      community_events: [],
    })
    const refused = await db.from("community_feed_posts").select("id").contains("media", [{ videoId: U(120) }])
    check("the fake refuses the array form as Postgres does (22P02)", !!refused.error && refused.error.code === "22P02", refused.error)
    const video = (await readCommunityVideo(db as never, COMMUNITY, U(120)))!
    const member = await videoAccess(db as never, community(), viewer(), video)
    check("a member who can see the post's space may watch its video", member.ok && member.use === "post", member)
    check("a visitor may not", !(await videoAccess(db as never, community(), viewer({ active: false, role: null as never }), video)).ok)
    const playback = await videoPlayback(db as never, video)
    check("a ready video on storage plays from a signed address", !!playback && /storage\.test\/sign\/digital-products\//.test(playback.url), playback)
  }

  /* ── Waiting until it plays ───────────────────────────────────────────── */
  console.log("\nWAITING: the status route asks the service, at most every few seconds")
  {
    const NOW = Date.parse("2026-10-05T12:00:00.000Z")
    const env = { MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret", MUX_WEBHOOK_SECRET: "w", MUX_SIGNING_KEY_ID: "k", MUX_SIGNING_KEY: "x" }
    const asked: string[] = []
    let asset: Record<string, unknown> = { id: "asset1", status: "preparing", passthrough: U(140), playback_ids: [{ id: "pb1", policy: "signed" }] }
    const before = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return new Response(JSON.stringify({ data: asset }), { status: 200, headers: { "content-type": "application/json" } })
    }) as typeof fetch
    try {
      const db = memDb({ media_videos: [videoRow(140, { provider: "mux", status: "processing", provider_asset_id: "asset1", storage_path: null, updated_at: new Date(NOW - 60_000).toISOString() })] })
      const c = community()
      const first = await refreshVideoStatus(db as never, c, U(140), env, NOW)
      check("still processing at the service: processing, and the service was asked", first?.status === "processing" && asked.length === 1 && asked[0] === "https://api.mux.com/video/v1/assets/asset1", { first, asked })
      db.tables.media_videos[0].updated_at = new Date(NOW - 1000).toISOString()
      await refreshVideoStatus(db as never, c, U(140), env, NOW)
      check(`asked again within ${VIDEO_STATUS_ASK_MS / 1000}s: answered from the row, the service is not called`, asked.length === 1, asked)
      asset = { ...asset, status: "ready", duration: 31.6, static_renditions: { status: "ready" }, tracks: [{ type: "video", max_width: 1920, max_height: 1080 }] }
      const ready = await refreshVideoStatus(db as never, c, U(140), env, NOW + VIDEO_STATUS_ASK_MS + 1000)
      check("the service says ready (its MP4 too): ready, with its length and size", ready?.status === "ready" && ready.durationSeconds === 32 && ready.width === 1920 && db.tables.media_videos[0].playback_id === "pb1", ready)
      const after = asked.length
      await refreshVideoStatus(db as never, c, U(140), env, NOW + 60_000)
      check("a ready video is never asked about again", asked.length === after)
      check("another community's video is not found", (await refreshVideoStatus(db as never, community({ id: U(9) }), U(140), env, NOW)) === null)
      const storage = memDb({ media_videos: [videoRow(141, { status: "uploading" })] })
      const s = await refreshVideoStatus(storage as never, c, U(141), env, NOW)
      check("a video on Storelib's storage is never sent to a service", s?.status === "uploading" && asked.length === after)
    } finally {
      globalThis.fetch = before
    }
    const route = "app/api/community/[communityId]/videos/[videoId]/route.ts"
    check("the status route exists: communities on, a member who may upload, rate limited", existsSync(route) && /requireCommunitiesOn\(\)/.test(code(route)) && /requireMember\(db, communityId, userId, "upload"\)/.test(code(route)) && /bucket: "community-video-status"/.test(code(route)) && /refreshVideoStatus\(db, gate\.community, videoId\)/.test(code(route)))
    check("and it never answers an address to play", !/videoPlayback|signVideoFile/.test(code(route)))
  }

  console.log("\nWAITING: the composer's side")
  {
    const view = (status: VideoStatusView["status"], error: string | null = null): VideoStatusView => ({ id: U(150), provider: "mux", status, durationSeconds: null, width: null, height: null, sizeBytes: null, thumbnailUrl: null, hasCaptions: false, error, createdAt: "" })
    const before = globalThis.fetch
    const answers = [view("processing"), view("processing"), view("ready")]
    const asked: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked.push(String(input))
      const next = answers.shift() ?? view("ready")
      return new Response(JSON.stringify({ video: next }), { status: 200 })
    }) as typeof fetch
    const slept: number[] = []
    const sleep = async (ms: number) => void slept.push(ms)
    try {
      const done = await waitUntilPlayable({ endpoint: "/api/community/c/videos", video: view("processing"), sleep })
      check("processing, processing, ready: resolves ready", done.status === "ready" && asked.length === 3 && asked.every((u) => u === `/api/community/c/videos/${U(150)}`), asked)
      check("asked quickly at first, then every few seconds", JSON.stringify(slept) === JSON.stringify([1500, 2000, 3000]) && waitStep(10) === 5000, slept)
      answers.splice(0, answers.length, view("failed", "Mux could not decode the file."))
      const failedWith = await waitUntilPlayable({ endpoint: "/e", video: view("processing"), sleep }).then(() => "", (e: Error) => e.message)
      check("a failure says the service's reason", failedWith === "This video could not be processed: Mux could not decode the file.", failedWith)
      check("and without one, a sentence to act on", processingFailure(null) === PROCESSING_FAILED && PROCESSING_FAILED === "This video could not be processed. Try another file.")
      globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch
      const gone = await waitUntilPlayable({ endpoint: "/e", video: view("processing"), sleep }).then(() => "", (e: Error) => e.message)
      check("a video removed meanwhile says so", gone === "The video was removed. Add it again.", gone)
      let t = 0
      globalThis.fetch = (async () => {
        throw new TypeError("offline")
      }) as typeof fetch
      const slow = await waitUntilPlayable({ endpoint: "/e", video: view("processing"), now: () => t, sleep: async (ms) => void (t += ms * 400) }).then(() => "", (e: Error) => e.message)
      check("offline is asked again, not reported, until the wait gives up", slow === PROCESSING_TOO_LONG && WAIT_GIVE_UP_MS === 30 * 60_000, slow)
    } finally {
      globalThis.fetch = before
    }
    check("a file over storage's one upload limit says so, not 'try again'", /reject\(new VideoUploadError\(putFailure\(xhr\.status, xhr\.responseText \|\| ""\)\)\)/.test(code("lib/video/upload-client.ts")))
    const composer = code("components/community/member/composer.tsx")
    const upload = code("components/community/member/media-upload.ts")
    check("the composer sends a video with uploadPostVideo, its key, progress and the processing step", /uploadPostVideo\(\{ communityId, file, key: k, onProgress: \(p\) => patch\(k, \{ progress: p \}\), onProcessing: \(\) => patch\(k, \{ progress: 100 \}\) \}\)/.test(composer))
    check("a failure stays on its tile (Post waits), a stop takes it off", /patch\(k, \{ error: message \}\)/.test(composer) && /if \(message === "Upload stopped"\) return drop\(k\)/.test(composer) && /const uploading = items\.some\(\(u\) => !u\.media\)/.test(composer))
    check("the old 'add it again in a few minutes' is gone", !/Add it again in a few minutes/.test(composer))
    check("uploadPostVideo waits until it plays and can be stopped", /if \(sent\.status === "ready"\) return sent\s*input\.onProcessing\?\.\(\)\s*return await waitUntilPlayable\(\{ endpoint, video: sent, signal: ctrl\.signal \}\)/.test(upload) && /export function stopUpload\(key: string\)/.test(upload))
  }

  /* ── The tray ─────────────────────────────────────────────────────────── */
  console.log("\nTRAY: order, slots, the nearest slot")
  {
    const list = ["a", "b", "c", "d"].map((key) => ({ key }))
    check("moving b to the end", moveKey(list, "b", 3).map((x) => x.key).join("") === "acdb")
    check("moving d to the front", moveKey(list, "d", 0).map((x) => x.key).join("") === "dabc")
    check("past the ends is clamped; nothing moving is the same list", moveKey(list, "a", 99).map((x) => x.key).join("") === "bcda" && moveKey(list, "c", 2) === list && moveKey(list, "zz", 0) === list)
    check("while a moves to 2, b and c step back one", [0, 1, 2, 3].map((i) => slotWhileMoving(i, 0, 2)).join() === "2,0,1,3")
    check("while d moves to 1, b and c step on one", [0, 1, 2, 3].map((i) => slotWhileMoving(i, 3, 1)).join() === "0,2,3,1")
    const centres = [0, 92, 184, 276].map((x) => ({ x: x + 42, y: 42 }))
    check("the nearest slot to the pointer, across a wrapped row too", nearestSlot(centres, 130, 50) === 1 && nearestSlot(centres, 400, 40) === 3 && nearestSlot([...centres, { x: 42, y: 134 }], 50, 120) === 4)
    check("a finger holds before lifting, a mouse moves a few pixels", LIFT_HOLD_MS >= 150 && LIFT_HOLD_MS <= 300 && MOUSE_LIFT_PX >= 3 && MOUSE_LIFT_PX <= 6)
    const tray = code("components/community/member/attachment-tray.tsx")
    check("only translate, scale and box-shadow move, inline while dragging and cleared after", /el\.style\.translate = /.test(tray) && /el\.style\.scale = /.test(tray) && !/style\.(left|top|width|height|transform) =/.test(tray) && /clearStyles\(d\.els\)/.test(tray))
    check("the order and the places change in one frame (flushSync), then the styles go", /flushSync\(\(\) => \{\s*setHeld\(null\)\s*if \(to !== d\.from\) onMove\(d\.key, to\)\s*\}\)\s*clearStyles\(d\.els\)/.test(tray))
    check("a lifted tile stops the page scrolling under the finger; reduced motion moves nothing", /window\.addEventListener\("touchmove", still, \{ passive: false \}\)/.test(tray) && /reducedMotion\(\)/.test(tray))
    check("remove stops the upload; the cross is a 40px target; arrow keys and Delete work", /stopUpload\(item\.key\)/.test(tray) && /h-10 w-10/.test(tray) && /ArrowLeft/.test(tray) && /e\.key === "Delete"/.test(tray))
    check("a failure says what happened and what to do", /\{failed\.error\} Remove it to post\./.test(read("components/community/member/attachment-tray.tsx")))
    const composer = code("components/community/member/composer.tsx")
    check("the composer draws its attachments with the tray (new post and Edit post alike)", /<AttachmentTray className="mt-3" items=\{items\} onMove=\{\(k, to\) => setItems\(\(list\) => moveKey\(list, k, to\)\)\} onRemove=\{removeItem\}/.test(composer) && !/function AttachmentTile/.test(composer))
  }

  /* ── The player ───────────────────────────────────────────────────────── */
  console.log("\nPLAYER: shape, the right file, the preview")
  {
    check("a portrait phone video keeps a 4:5 box, a wide one up to 2.4:1, unknown is 16:9", boxRatio(1080, 1920) === 0.8 && boxRatio(3000, 1000) === 2.4 && Math.abs(boxRatio(1920, 1080) - 16 / 9) < 1e-9 && boxRatio(null, null) === 16 / 9)
    check("the lighter file on Save Data, 2G and 3G; not on 4G", wantsLight({ saveData: true }) && wantsLight({ effectiveType: "3g" }) && wantsLight({ effectiveType: "2g" }) && !wantsLight({ effectiveType: "4g" }) && !wantsLight({}))
    check("no preview with reduced motion, Save Data or 2G", !previewAllowed({}, true) && !previewAllowed({ saveData: true }, false) && !previewAllowed({ effectiveType: "2g" }, false) && previewAllowed({ effectiveType: "4g" }, false))
    check("the play route reads q=low, anything else is the usual file", playbackQuality("low") === "low" && playbackQuality("hi") === "auto" && playbackQuality(null) === "auto")
    const env = { BUNNY_STREAM_CDN_HOST: "vz-1.b-cdn.net", BUNNY_STREAM_TOKEN_KEY: "k" }
    const bunnyVideo = videoRow(160, { provider: "bunny", provider_asset_id: "guid" })
    const usual = await bunnyAdapter.playback(null, bunnyVideo, 60, env)
    const lowUnset = await bunnyAdapter.playback(null, bunnyVideo, 60, env, "low")
    const low = await bunnyAdapter.playback(null, bunnyVideo, 60, { ...env, BUNNY_STREAM_MP4_LOW: "play_360p.mp4" }, "low")
    check("Bunny: 720p usually, 360p for low only when the library keeps it", !!usual && /\/guid\/play_720p\.mp4\?token=/.test(usual.url) && lowUnset === null && !!low && /\/guid\/play_360p\.mp4\?token=/.test(low.url))
    const play = code("app/api/community/[communityId]/videos/[videoId]/play/route.ts")
    check("the play route passes the quality on", /const quality = playbackQuality\(new URL\(request\.url\)\.searchParams\.get\("q"\)\)/.test(play) && (play.match(/videoPlayback\(db, video, undefined, quality\)/g) ?? []).length === 2)
    check("a lighter file the service does not keep falls back to the usual one", /if \(!address && quality === "low"\) address = await adapterFor\(video\.provider\)\.playback\(db, video, PLAYBACK_SECONDS, env\)/.test(code("lib/communities/server/videos.ts")))
    const player = code("components/media/video-player.tsx")
    for (const [what, re] of [
      ["play and pause", /aria-label=\{playing \? "Pause" : "Play"\}/],
      ["a scrub line with what is loaded, dragged by finger or mouse", /role="slider"[\s\S]*onPointerDown=\{onBarDown\}[\s\S]*touch-none/],
      ["the time", /data-video-time=""/],
      ["mute, and a volume slider on a computer", /aria-label=\{quiet \? "Unmute" : "Mute"\}/],
      ["picture in picture where the browser has it", /requestPictureInPicture/],
      ["fullscreen, the iPhone's system player as the fallback", /webkitEnterFullscreen/],
      ["keys", /k === " " \|\| k === "k" \|\| k === "K"/],
      ["a double tap skips", /now - prev\.t < 320/],
      ["the address renewed before it expires", /refreshDelay\(current\.current\.expiresAt, Date\.now\(\)\)/],
      ["plays inline on iPhone", /playsInline/],
      ["standard dynamic range, so a phone video never outshines the page", /\[dynamic-range-limit:standard\]/],
    ] as const) check(`the player: ${what}`, re.test(player))
    const sv = code("components/video/storelib-video.tsx")
    check("the preview starts on a resting pointer or most of the way on screen, one at a time, fades in once frames play", /PREVIEW_HOVER_MS/.test(sv) && /new IntersectionObserver/.test(sv) && /window\.dispatchEvent\(new CustomEvent\(PREVIEW, \{ detail: me \}\)\)/.test(sv) && /onPlaying=\{\(\) => want && setShown\(true\)\}/.test(sv) && /muted/.test(sv))
    check("the preview asks for the lighter file and nothing until it starts", /fetchPlayback\(communityId, videoId, \{ light: true \}\)/.test(sv))
    check("an answer is kept for the page, so a preview then a press ask once", /const KEPT = new Map<string, VideoPlayback>\(\)/.test(sv))
    check("a post's video passes its size to keep its shape", /<StorelibVideo communityId=\{communityId\} videoId=\{item\.videoId\} poster=\{item\.poster\} width=\{item\.w\} height=\{item\.h\} \/>/.test(code("components/community/member/media.tsx")))
  }

  /* ── The cover ────────────────────────────────────────────────────────── */
  console.log("\nCOVER: an uploaded video as the About page's hero")
  {
    const own = (u: unknown) => (typeof u === "string" && u.startsWith("https://x.supabase.co/") ? u : null)
    const g = checkGallery([{ type: "video", videoId: U(170).toUpperCase(), cover: true }, { type: "image", url: "https://x.supabase.co/a.png" }, { type: "video", videoId: U(171), cover: true }], own)
    check("the cover mark is kept on an uploaded first video only", g.ok && (g.value[0] as { cover?: true }).cover === true && (g.value[0] as { videoId: string }).videoId === U(170) && !(g.value[2] as { cover?: true }).cover, g)
    const items = g.ok ? g.value : []
    check("coverUpload finds it, coverVideo (links) does not, coverItem finds either", coverUpload(items)?.videoId === U(170) && coverVideo(items) === null && coverItem(items)?.type === "video")
    check("its still is the picture the save carries: the cover is left as the save says", coverAfterGallery("https://x.supabase.co/still.jpg", true, items) === undefined && coverAfterGallery("https://i.ytimg.com/vi/x/hqdefault.jpg", false, items) === undefined)
    const parsed = parseGallery([{ type: "video", videoId: U(170), cover: true }, { type: "video", videoId: U(171), cover: true }])
    check("the page reads the mark on the first item only", (parsed[0] as { cover?: true }).cover === true && !(parsed[1] as { cover?: true }).cover)
    const editor = code("components/community/creator/gallery-editor.tsx")
    check("the cover field uploads a video, waits until it plays, keeps a still from the file as the cover picture", /data-cover-upload-video=""/.test(editor) && /waitUntilPlayable\(\{ endpoint, video: v \}\)/.test(editor) && /videoStill\(file\)/.test(editor) && /\{ type: "video", videoId: ready\.id, cover: true \}/.test(editor))
    check("Save waits while the cover video is on its way", /onBusy=\{setCoverUploading\}/.test(code("components/community/creator/settings-section.tsx")) && /const uploading = galleryUploading \|\| coverUploading/.test(code("components/community/creator/settings-section.tsx")))
    const view = code("components/community/public/gallery-view.tsx")
    check("the About page loops the cover video while on screen, and plays uploads in the community player", /<PreviewLoop communityId=\{communityId\} videoId=\{g\.videoId\} mode=\{g\.cover \? "visible" : "auto"\}/.test(view) && /<VideoPlayer/.test(view) && !/<video\s/.test(view))
    check("the server passes the mark through", /\.\.\.\("cover" in g && g\.cover \? \{ cover: true as const \} : \{\}\)/.test(code("lib/communities/server/public.ts")))
  }

  /* ── Words and imports ────────────────────────────────────────────────── */
  console.log("\nWORDS AND IMPORTS")
  {
    const mine = [
      "components/media/video-player.tsx",
      "components/video/storelib-video.tsx",
      "components/community/member/attachment-tray.tsx",
      "components/community/member/media-upload.ts",
      "lib/video/upload-client.ts",
      "app/api/community/[communityId]/videos/[videoId]/route.ts",
    ]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
    const hits = mine.filter((f) => banned.test(read(f)))
    check("no banned words and no em dashes", hits.length === 0, hits.join(", "))
    const clients = mine.slice(0, 5)
    const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(code(f)))
    check("the browser's parts import nothing from the server", leaks.length === 0, leaks.join(", "))
    check("no violet fill", !mine.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(read(f))))
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
