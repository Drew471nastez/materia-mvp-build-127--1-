/**
 * ===========================================================================
 *  ONEPAGE PICTURES AND VIDEOS: WHAT IS TAKEN, HOW IT GOES UP, HOW IT IS CROPPED
 * ===========================================================================
 * Round 11: "It failed to upload a video in the OnePage editor, in all
 * places, or images. Make sure it supports all kinds of videos up to 2 GB."
 * And: "the crop video and crop images ... works on mobile devices with
 * dragging in corners, and desktop."
 *
 * Against the real modules:
 *
 *   rules     lib/onepage/media-rules.ts: which files are taken (a .mov or a
 *             HEIC whose browser gave no type, too), the 2 GB limit, the
 *             choice between one request and resumable parts, the path in
 *             the owner's own folder, and what storage's refusals mean
 *   upload    lib/onepage/media-upload.ts driven against a fake network: a
 *             5 MB JPEG in one request with the type storage needs, a 50 MB
 *             and a 300 MB video in 6 MB TUS parts with real progress, a 2 GB
 *             video's whole path (342 parts, never one request), a dropped
 *             part continued from the offset storage reports, Stop, a 413
 *             from the project's upload limit, and a refused type before any
 *             byte is sent. Nothing goes through a Next.js route.
 *   crop      lib/onepage/media-crop.ts: every corner and edge, with and
 *             without an aspect, dragged along its diagonal lands exactly
 *             under the finger, stays inside the frame, pinch, and the CSS
 *             the live page draws a crop with
 *   wiring    every upload in the OnePage editor goes through the one helper
 *             (no `.upload(` left in the tabs), the inputs accept MOV and
 *             HEIC, the server's after-upload check holds onepage-assets to
 *             its own 2 GB rather than a link page file's 1 GB, and the SQL
 *             part says the same number
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import {
  MAX_ONEPAGE_VIDEO_BYTES,
  SINGLE_REQUEST_MAX_BYTES,
  TUS_PART_BYTES,
  checkMedia,
  classifyMedia,
  imageNeedsReencode,
  mediaPath,
  publicMediaUrl,
  readStorageFailure,
  uploadRoute,
} from "../lib/onepage/media-rules"
import { UploadError, uploadOnePageMedia, type Wire, type WireRequest, type WireResponse } from "../lib/onepage/media-upload"
import { croppedMediaStyle, initialCrop, moveCrop, normalizeCrop, pinchCrop, resizeCrop, type CropHandle, type CropLimits } from "../lib/onepage/media-crop"
import { directRulesFor } from "../lib/security/uploads/direct"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const MB = 1024 * 1024
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

/* ── rules ─────────────────────────────────────────────────────────── */
console.log("rules")
{
  check("a JPEG is a picture", classifyMedia({ name: "a.jpg", type: "image/jpeg" })?.kind === "image")
  check("image/jpg is a JPEG", classifyMedia({ name: "a.jpg", type: "image/jpg" })?.mime === "image/jpeg")
  const heic = classifyMedia({ name: "IMG_0001.HEIC", type: "image/heic" })
  check("an iPhone HEIC is a picture that becomes a JPEG", heic?.kind === "image" && heic.convert && heic.mime === "image/jpeg" && heic.ext === "jpg", heic)
  check("a HEIC with no type (Windows, Chrome) is known by its name", classifyMedia({ name: "IMG_0001.heic", type: "" })?.convert === true)
  check("a MOV is video/quicktime", classifyMedia({ name: "clip.mov", type: "video/quicktime" })?.mime === "video/quicktime")
  check("a MOV with no type is known by its name (it went up as octet-stream and the bucket refused it)", classifyMedia({ name: "clip.MOV", type: "" })?.mime === "video/quicktime")
  check("a MOV declared as octet-stream is still a MOV", classifyMedia({ name: "clip.mov", type: "application/octet-stream" })?.mime === "video/quicktime")
  check("M4V and WebM are videos", classifyMedia({ name: "a.m4v", type: "video/x-m4v" })?.ext === "m4v" && classifyMedia({ name: "a.webm", type: "video/webm" })?.ext === "webm")
  check("a .mp4 named file declared video/mp4 is mp4", classifyMedia({ name: "x.mp4", type: "video/mp4" })?.ext === "mp4")
  check("MKV, which no browser plays on a page, is refused", classifyMedia({ name: "a.mkv", type: "video/x-matroska" }) === null)
  check("an SVG is never a picture here", classifyMedia({ name: "a.svg", type: "image/svg+xml" }) === null)
  check("a PDF named .jpg declared PDF is not a picture", classifyMedia({ name: "a.jpg", type: "application/pdf" }) === null)

  const v = (size: number, name = "clip.mp4", type = "video/mp4") => checkMedia({ name, type, size }, "video")
  check("5 MB JPEG taken", checkMedia({ name: "p.jpg", type: "image/jpeg", size: 5 * MB }, "image").ok)
  check("50 MB MP4 taken", v(50 * MB).ok)
  check("300 MB MOV taken", v(300 * MB, "IMG_1234.MOV", "video/quicktime").ok)
  check("2 GB (2 GiB) exactly taken", v(MAX_ONEPAGE_VIDEO_BYTES).ok && MAX_ONEPAGE_VIDEO_BYTES === 2147483648)
  const over = v(MAX_ONEPAGE_VIDEO_BYTES + 1)
  check("one byte over 2 GiB refused as too large", !over.ok && over.code === "too_large", over)
  const empty = v(0)
  check("an empty file refused", !empty.ok && empty.code === "empty")
  const picForVideo = checkMedia({ name: "p.jpg", type: "image/jpeg", size: 100 }, "video")
  check("a picture where a video is asked is refused as the wrong type", !picForVideo.ok && picForVideo.code === "type" && picForVideo.kind === "video")
  check("an 81 MB picture refused", !checkMedia({ name: "p.png", type: "image/png", size: 81 * MB }, "image").ok)

  check("5 MB goes in one request", uploadRoute(5 * MB) === "single")
  check("6 MB (Supabase's line) goes in one request", uploadRoute(SINGLE_REQUEST_MAX_BYTES) === "single")
  check("6 MB and one byte goes in resumable parts", uploadRoute(SINGLE_REQUEST_MAX_BYTES + 1) === "resumable")
  check("50 MB, 300 MB and 2 GB go in resumable parts", ["resumable", "resumable", "resumable"].every((r, i) => uploadRoute([50 * MB, 300 * MB, MAX_ONEPAGE_VIDEO_BYTES][i]) === r))

  check("a HEIC is redrawn", imageNeedsReencode(classifyMedia({ name: "a.heic", type: "image/heic" })!, 3 * MB))
  check("a 5 MB JPEG goes as chosen", !imageNeedsReencode(classifyMedia({ name: "a.jpg", type: "image/jpeg" })!, 5 * MB))
  check("a 30 MB PNG is made smaller", imageNeedsReencode(classifyMedia({ name: "a.png", type: "image/png" })!, 30 * MB))
  check("a 30 MB GIF keeps its motion", !imageNeedsReencode(classifyMedia({ name: "a.gif", type: "image/gif" })!, 30 * MB))

  const path = mediaPath("u-1", "wallpaper video!", "MOV", 123, "abc")
  check("the path is in the owner's folder, named by the editor, with a clean extension", path === "u-1/wallpaper-video-123-abc.mov", path)
  check("the public address is the bucket's own", publicMediaUrl("https://x.supabase.co/", "onepage-assets", "u 1/a.mp4") === "https://x.supabase.co/storage/v1/object/public/onepage-assets/u%201/a.mp4")

  check("413 is too large", readStorageFailure(413, "") === "too_large")
  check("storage's own words for the project limit are too large", readStorageFailure(400, '{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}') === "too_large")
  check("a refused type is the type", readStorageFailure(400, '{"error":"invalid_mime_type","message":"mime type application/octet-stream is not supported"}') === "type")
  check("a policy refusal is sign in again", readStorageFailure(403, '{"message":"new row violates row-level security policy"}') === "auth")
  check("no answer is the network", readStorageFailure(0, "") === "network")
}

/* ── upload, against a fake network ────────────────────────────────── */
console.log("upload")

/** A Blob stand-in that never allocates: a 2 GB video costs nothing here. */
function fakeFile(size: number, name: string, type: string): Blob {
  const make = (start: number, end: number): Blob => ({ size: end - start, type, name, slice: (a = 0, b = end - start) => make(start + a, start + Math.min(b, end - start)), __start: start }) as unknown as Blob
  return make(0, size)
}
interface Seen { method: string; url: string; headers: Record<string, string>; bytes: number; start?: number }
function storage(opts: { failPart?: number; createStatus?: number; createText?: string; holdPart?: number; onHold?: () => void } = {}) {
  const seen: Seen[] = []
  let have = 0
  let part = 0
  let length = 0
  const wire: Wire = async (req: WireRequest): Promise<WireResponse> => {
    const body = req.body as (Blob & { __start?: number }) | null | undefined
    seen.push({ method: req.method, url: req.url, headers: req.headers, bytes: body?.size ?? 0, start: body?.__start })
    const ok = (status: number, headers: Record<string, string> = {}, text = ""): WireResponse => ({ status, header: (n) => headers[n] ?? headers[n.toLowerCase()] ?? null, text })
    if (req.signal?.aborted) throw new UploadError("cancelled", "Upload stopped.")
    if (req.method === "POST" && req.url.endsWith("/storage/v1/upload/resumable")) {
      if (opts.createStatus) return ok(opts.createStatus, {}, opts.createText ?? "")
      length = Number(req.headers["Upload-Length"])
      have = 0
      return ok(201, { Location: "https://x.supabase.co/storage/v1/upload/resumable/abc123" })
    }
    if (req.method === "PATCH") {
      part++
      const offset = Number(req.headers["Upload-Offset"])
      if (offset !== have) return ok(409)
      if (opts.holdPart === part) {
        opts.onHold?.()
        await new Promise((r) => setTimeout(r, 5))
        if (req.signal?.aborted) throw new UploadError("cancelled", "Upload stopped.")
      }
      if (opts.failPart === part) {
        /* Half the part arrived, then the line dropped: storage kept what it got. */
        have += Math.floor((body?.size ?? 0) / 2)
        req.onProgress?.(Math.floor((body?.size ?? 0) / 2))
        return ok(0)
      }
      req.onProgress?.((body?.size ?? 0) / 2)
      req.onProgress?.(body?.size ?? 0)
      have += body?.size ?? 0
      return ok(204, { "Upload-Offset": String(have) })
    }
    if (req.method === "HEAD") return ok(200, { "Upload-Offset": String(have), "Upload-Length": String(length) })
    if (req.method === "DELETE") return ok(204)
    if (req.method === "POST" && req.url.includes("/storage/v1/object/")) {
      req.onProgress?.(body?.size ?? 0)
      return ok(200, {}, '{"Key":"x"}')
    }
    return ok(404)
  }
  return { wire, seen }
}
const common = { baseUrl: "https://x.supabase.co", anonKey: "anon", session: async () => ({ token: "jwt", userId: "user-1" }), retryDelayMs: 1 }

async function run() {
  {
    const s = storage()
    const progress: number[] = []
    const res = await uploadOnePageMedia(fakeFile(5 * MB, "photo.jpg", "image/jpeg"), { ...common, prefix: "wallpaper", want: "image", wire: s.wire, onProgress: (p) => progress.push(p.percent) })
    const post = s.seen[0]
    check("5 MB JPEG: one request, straight to storage (not a Next.js route)", s.seen.length === 1 && post.url.startsWith("https://x.supabase.co/storage/v1/object/onepage-assets/user-1/wallpaper-"), s.seen.map((x) => x.url))
    check("5 MB JPEG: sent with its type, the person's token and upsert", post.headers["content-type"] === "image/jpeg" && post.headers.Authorization === "Bearer jwt" && post.headers["x-upsert"] === "true" && post.headers.apikey === "anon")
    check("5 MB JPEG: the public address, progress to 100", res.url.startsWith("https://x.supabase.co/storage/v1/object/public/onepage-assets/user-1/wallpaper-") && res.url.endsWith(".jpg") && progress.at(-1) === 100)
  }
  {
    const s = storage()
    const progress: number[] = []
    const res = await uploadOnePageMedia(fakeFile(50 * MB, "clip.mp4", "video/mp4"), { ...common, prefix: "avatar-video", want: "video", wire: s.wire, onProgress: (p) => progress.push(p.percent) })
    const patches = s.seen.filter((x) => x.method === "PATCH")
    const create = s.seen[0]
    const meta = Object.fromEntries(create.headers["Upload-Metadata"].split(",").map((kv) => { const [k, v] = kv.split(" "); return [k, Buffer.from(v, "base64").toString()] }))
    check("50 MB MP4: TUS create with the bucket, the path, the type and the length", create.method === "POST" && create.headers["Upload-Length"] === String(50 * MB) && meta.bucketName === "onepage-assets" && meta.objectName.startsWith("user-1/avatar-video-") && meta.contentType === "video/mp4" && create.headers["Tus-Resumable"] === "1.0.0", meta)
    check("50 MB MP4: 9 parts of exactly 6 MB (the last smaller)", patches.length === 9 && patches.slice(0, -1).every((p) => p.bytes === TUS_PART_BYTES) && patches.reduce((a, p) => a + p.bytes, 0) === 50 * MB, patches.map((p) => p.bytes))
    check("50 MB MP4: progress rises through the parts and ends at 100", progress.length >= 9 && progress.every((p, i) => i === 0 || p >= progress[i - 1]) && progress.at(-1) === 100 && progress.some((p) => p > 10 && p < 90))
    check("50 MB MP4: stored as .mp4", res.path.endsWith(".mp4") && res.kind === "video")
  }
  {
    const s = storage({ failPart: 3 })
    const res = await uploadOnePageMedia(fakeFile(300 * MB, "IMG_1234.MOV", ""), { ...common, prefix: "wallpaper-video", want: "video", wire: s.wire })
    const heads = s.seen.filter((x) => x.method === "HEAD")
    const patches = s.seen.filter((x) => x.method === "PATCH")
    const after = patches[3]
    check("300 MB MOV with no declared type: taken as video/quicktime", res.mime === "video/quicktime" && res.path.endsWith(".mov"))
    check("300 MB MOV: a part dropped half way is asked about (HEAD) and continued from what storage has, not from zero", heads.length === 1 && after.headers["Upload-Offset"] === String(2 * TUS_PART_BYTES + TUS_PART_BYTES / 2), after.headers)
    check("300 MB MOV: every byte sent once more at most", patches.reduce((a, p) => a + p.bytes, 0) <= 300 * MB + TUS_PART_BYTES)
  }
  {
    const s = storage()
    const t0 = Date.now()
    await uploadOnePageMedia(fakeFile(MAX_ONEPAGE_VIDEO_BYTES, "long.mp4", "video/mp4"), { ...common, prefix: "wallpaper-video", want: "video", wire: s.wire })
    const patches = s.seen.filter((x) => x.method === "PATCH")
    check("2 GB video: 342 resumable parts, never one big request", patches.length === Math.ceil(MAX_ONEPAGE_VIDEO_BYTES / TUS_PART_BYTES) && patches.length === 342 && !s.seen.some((x) => x.bytes > TUS_PART_BYTES), { parts: patches.length, ms: Date.now() - t0 })
  }
  {
    const s = storage({ createStatus: 413, createText: '{"message":"The object exceeded the maximum allowed size"}' })
    let err: unknown = null
    try {
      await uploadOnePageMedia(fakeFile(300 * MB, "a.mp4", "video/mp4"), { ...common, prefix: "x", want: "video", wire: s.wire })
    } catch (e) {
      err = e
    }
    check("the project's upload limit (413) is a plain sentence, not retried", err instanceof UploadError && err.code === "too_large" && /bigger than uploads allow/.test(err.message) && s.seen.length === 1, err instanceof Error ? err.message : err)
  }
  {
    const s = storage()
    let err: unknown = null
    try {
      await uploadOnePageMedia(fakeFile(10 * MB, "a.mkv", "video/x-matroska"), { ...common, prefix: "x", want: "video", wire: s.wire })
    } catch (e) {
      err = e
    }
    check("an MKV is refused with the formats that work, before a byte is sent", err instanceof UploadError && err.code === "type" && /MP4, MOV, WebM or M4V/.test(err.message) && s.seen.length === 0)
  }
  {
    const ctrl = new AbortController()
    const s = storage({ holdPart: 2, onHold: () => ctrl.abort() })
    let err: unknown = null
    try {
      await uploadOnePageMedia(fakeFile(30 * MB, "a.mp4", "video/mp4"), { ...common, prefix: "x", want: "video", wire: s.wire, signal: ctrl.signal })
    } catch (e) {
      err = e
    }
    await new Promise((r) => setTimeout(r, 10))
    check("Stop: the upload ends as stopped, no more parts, and storage is told to drop what it has", err instanceof UploadError && err.code === "cancelled" && s.seen.filter((x) => x.method === "PATCH").length === 2 && s.seen.some((x) => x.method === "DELETE"), s.seen.map((x) => x.method))
  }
  {
    let err: unknown = null
    try {
      await uploadOnePageMedia(fakeFile(5 * MB, "a.jpg", "image/jpeg"), { ...common, session: async () => null, prefix: "x", wire: storage().wire })
    } catch (e) {
      err = e
    }
    check("signed out: asks to sign in again", err instanceof UploadError && err.code === "auth")
  }

  /* ── crop ─────────────────────────────────────────────────────────── */
  console.log("crop")
  {
    const wide: CropLimits = { frameAspect: 16 / 9, aspect: 1, minPct: 10 }
    const first = initialCrop(wide)
    check("a circle in a 16:9 video opens as a centred square", near((first.width * 16) / 9, first.height) && near(first.x + first.width / 2, 50) && near(first.y + first.height / 2, 50), first)
    const tall: CropLimits = { frameAspect: 9 / 16, aspect: 9 / 16 }
    check("a phone crop of a phone video opens nearly whole", near(initialCrop(tall, 1).width, 100) && near(initialCrop(tall, 1).height, 100))
    const land: CropLimits = { frameAspect: 16 / 9, aspect: 9 / 16 }
    const l0 = initialCrop(land, 1)
    check("a phone crop of a landscape video is full height, 9:16 in real pixels", near(l0.height, 100) && near((l0.width * 16) / 9 / l0.height, 9 / 16, 0.001), l0)

    const start = { x: 30, y: 30, width: 40, height: 40, v: 2 as const }
    const sq: CropLimits = { frameAspect: 1, aspect: 1, minPct: 10 }
    const diag: Record<CropHandle, [number, number]> = { se: [10, 10], nw: [-10, -10], ne: [10, -10], sw: [-10, 10], n: [0, -10], s: [0, 10], e: [10, 0], w: [-10, 0] }
    for (const [h, [dx, dy]] of Object.entries(diag) as [CropHandle, [number, number]][]) {
      const c = resizeCrop(start, h, dx, dy, sq)
      const cornerX = h.includes("e") ? c.x + c.width : h.includes("w") ? c.x : null
      const cornerY = h.includes("s") ? c.y + c.height : h.includes("n") ? c.y : null
      const fx = h.includes("e") ? 70 + dx : h.includes("w") ? 30 + dx : null
      const fy = h.includes("s") ? 70 + dy : h.includes("n") ? 30 + dy : null
      check(`square crop, ${h} handle dragged ${dx},${dy}: the handle is under the finger and the box stays square`, (cornerX === null || near(cornerX, fx!)) && (cornerY === null || near(cornerY, fy!)) && near(c.width, c.height), c)
    }
    const free: CropLimits = { frameAspect: 1, aspect: null, minPct: 10 }
    const f1 = resizeCrop(start, "se", 15, -5, free)
    check("free crop: the corner follows both directions", near(f1.x + f1.width, 85) && near(f1.y + f1.height, 65))
    const f2 = resizeCrop(start, "e", 100, 0, free)
    check("free crop: an edge stops at the frame", near(f2.x + f2.width, 100) && near(f2.height, 40))
    const tooSmall = resizeCrop(start, "se", -60, -60, sq)
    check("never smaller than the minimum", near(tooSmall.width, 10) && near(tooSmall.x, 30))
    const out = resizeCrop(start, "se", 80, 80, sq)
    check("a locked corner stops at the frame and keeps its shape", near(out.x + out.width, 100) && near(out.width, out.height))
    const phone: CropLimits = { frameAspect: 16 / 9, aspect: 9 / 16, minPct: 8 }
    const p0 = initialCrop(phone, 0.8)
    const p1 = resizeCrop(p0, "se", 5, 5, phone)
    check("a 9:16 crop keeps 9:16 in real pixels whatever the corner", near(((p1.width / 100) * 16) / ((p1.height / 100) * 9), 9 / 16, 0.001), p1)
    const m = moveCrop(start, 50, -50)
    check("moving stops at the frame's edges", near(m.x, 60) && near(m.y, 0))
    const pin = pinchCrop(start, 1.5, 0, 0, sq)
    check("pinch grows around the centre and keeps the shape", near(pin.width, 60) && near(pin.x, 20) && near(pin.width, pin.height))
    const pinMax = pinchCrop(start, 5, 0, 0, sq)
    check("pinch stops at the frame", near(pinMax.width, 100) && near(pinMax.x, 0))
    check("a saved crop with nonsense in it is made safe", normalizeCrop({ x: -5, y: 120, width: 300, height: "a" }) === null && JSON.stringify(normalizeCrop({ x: -5, y: 90, width: 50, height: 50, v: 2 })) === JSON.stringify({ x: 0, y: 50, width: 50, height: 50, v: 2 }))

    const style = croppedMediaStyle({ x: 25, y: 10, width: 50, height: 80, v: 2 })!
    check("the live page draws a v2 crop exactly: the media is as much larger as the crop is smaller, shifted to its corner", style.width === "200%" && style.height === "125%" && style.left === "-50%" && style.top === "-12.5%" && style.position === "absolute", style)
    const legacy = croppedMediaStyle({ x: 10, y: 10, width: 80, height: 80 })!
    check("a crop saved before round 11 is drawn the way it always was", legacy.transform === "scale(1.25) translate(-10%, -10%)" && legacy.transformOrigin === "0 0")
    check("a whole-frame crop draws the plain cover", croppedMediaStyle({ x: 0, y: 0, width: 100, height: 100, v: 2 }) === undefined)
  }

  /* ── wiring ───────────────────────────────────────────────────────── */
  console.log("wiring")
  {
    const design = readFileSync("components/onepage/tabs/design-tab.tsx", "utf8")
    const links = readFileSync("components/onepage/tabs/links-tab.tsx", "utf8")
    check("the Design tab uploads nothing itself: every picture and video goes through the one helper", !/storage\s*\.from\(/.test(design) && /CropUpload/.test(design) && /useMediaUpload/.test(design))
    check("the Design tab's old 100 MB video limit is gone", !/100 \* 1024 \* 1024/.test(design) && !/up to 100MB/.test(design))
    const linksUploads = (links.match(/storage\s*\.from\([^)]*\)\s*\.upload\(/g) ?? []).length
    check("the Links tab's thumbnails, image blocks and profile media no longer call storage's one-shot upload (only the digital file sheet's fallback is left)", linksUploads === 1 && /uploadOnePageMedia\(file, \{ prefix: `thumbnail_/.test(links) && /uploadOnePageMedia\(file, \{ prefix: `image_/.test(links), linksUploads)
    check("video inputs accept MOV and M4V by name too", /accept=\{ONEPAGE_VIDEO_ACCEPT\}/.test(design) && /accept=\{ONEPAGE_VIDEO_ACCEPT\}/.test(links))
    check("no crop in the tabs listens on window for mouse or touch any more", !/addEventListener\('touchmove'/.test(design) && !/onTouchMove=/.test(links.slice(links.indexOf("Image Crop Modal"), links.indexOf("interface BlockItemProps"))))
    const cropper = readFileSync("components/onepage/media-cropper.tsx", "utf8")
    check("the cropper is pointer events with capture, touch-action none on the frame and every handle, moved in a frame", /onPointerDown=/.test(cropper) && /setPointerCapture/.test(cropper) && (cropper.match(/touchAction: "none"/g) ?? []).length >= 4 && /requestAnimationFrame/.test(cropper) && /data-sheet-no-drag/.test(cropper))
    const rules = directRulesFor("onepage-assets", "user-1/wallpaper-video-1-a.mov")
    check("after upload, onepage-assets is held to its own 2 GiB (it was 1 GB as a link page file, so a big video was deleted after uploading)", rules?.maxBytes === MAX_ONEPAGE_VIDEO_BYTES)
    const stored = readFileSync("lib/security/uploads/stored.ts", "utf8")
    const direct = readFileSync("lib/security/uploads/direct.ts", "utf8")
    check("the stored-file check passes the bucket's ceiling through", /maxBytes: file\.maxBytes/.test(stored) && /maxBytes: limit \}/.test(direct))
    const sql = readFileSync("supabase/sql/run-now/282_onepage_media_uploads.sql", "utf8")
    check("SQL part 282 sets the same 2 GiB and the types the editor sends", sql.includes("2147483648") && ["video/quicktime", "video/x-m4v", "video/webm", "video/mp4", "image/avif"].every((t) => sql.includes(`'${t}'`)))
    const after = readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8")
    check("99_check_after reads part 282", /* Changed on purpose (round BC): part 283 is checked after it now, so its column ends with a comma. */ /as p282_onepage_media_uploads[,;]/.test(after))
    const live = readFileSync("components/onepage/public-onepage.tsx", "utf8")
    check("the live page (and so the preview) draws the avatar and wallpaper videos through the saved crop", /videoStyle=\{croppedMediaStyle\(profile\.avatar_video_crop\)/.test(live) && (live.match(/style=\{wallpaperVideoStyle\(safeTheme, /g) ?? []).length === 3)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}
run().catch((e) => {
  console.error(e)
  process.exit(1)
})
