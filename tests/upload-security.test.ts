/**
 * ===========================================================================
 *  UPLOADS AND STORAGE: WHO MAY WRITE WHAT, AND WHAT IT MAY BE
 * ===========================================================================
 * Pins the upload and storage audit (supabase/migrations/20260929_upload_safety.sql,
 * lib/storage/*, lib/images/metadata.ts and the routes under app/api that
 * store or hand out files):
 *
 *   - every upload route needs a signed in person, and builds the path itself
 *   - bytes are checked by their magic numbers, not by name or declared type
 *   - pictures have a size and a pixel limit, and lose their location data
 *   - SVG and HTML never land in a public bucket as a picture
 *   - quota counts uploads in progress and the real size from storage
 *   - rate limits are wired into every way in
 *   - paid files are private, signed URLs are short and only for file buckets
 *   - the cleanup job only removes what it was built to remove
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import {
  declaresPublicImage,
  isPublicImage,
  isRenderedDocumentType,
  matchesDeclared,
  safeStoredContentType,
  sniff,
} from "../lib/storage/file-signature"
import { MAX_IMAGE_PIXELS, readImageSize, stripImageMetadata } from "../lib/images/metadata"
import { PUBLIC_IMAGE_MAX_BYTES, preparePublicImage } from "../lib/storage/public-image"
import { generateStoragePath, storageExtension } from "../lib/storage/validation"
import { getPlanLimits, PLAN_LIMITS } from "../lib/storage/plans"
import { generateSignedDownloadUrl, SIGNED_DOWNLOAD_SECONDS } from "../lib/storage/download"
import { scanFile } from "../lib/storage/security"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

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

/* ------------------------------------------------------------------ */
/*  Real bytes                                                         */
/* ------------------------------------------------------------------ */

const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) out.push(c.charCodeAt(0) & 0xff)
    else out.push(...p)
  }
  return new Uint8Array(out)
}
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const statusOf = (r: object) => ("status" in r ? (r as { status: number }).status : 0)
const has = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle, "latin1"))

/** A JPEG as a phone writes it: JFIF, then EXIF with the orientation and a GPS position, then the frame. */
function phoneJpeg(orientation: number, width = 4032, height = 3024) {
  const tiff = bytes(
    "MM", [0x00, 0x2a], u32(8),
    u16(2),
    u16(0x0112), u16(3), u32(1), [0x00, orientation, 0x00, 0x00], // Orientation
    u16(0x8825), u16(4), u32(1), u32(38), // GPS IFD pointer
    u32(0),
    "GPS 51.5007N 0.1246W home", // where the pointer lands, as far as this test cares
  )
  const exif = bytes("Exif", [0, 0], tiff)
  const xmp = bytes("http://ns.adobe.com/xap/1.0/", [0], "<x:xmpmeta>owner: Ada Lovelace</x:xmpmeta>")
  const scan = bytes([0x12, 0x34, 0x56, 0xff, 0x00, 0x78])
  return bytes(
    [0xff, 0xd8],
    [0xff, 0xe0], u16(16), "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xe1], u16(exif.length + 2), exif,
    [0xff, 0xe1], u16(xmp.length + 2), xmp,
    [0xff, 0xe2], u16(16), "ICC_PROFILE", [0, 1, 1], // colour profile, must stay
    [0xff, 0xfe], u16(9), "comment",
    [0xff, 0xc0], u16(17), [8], u16(height), u16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    [0xff, 0xda], u16(12), [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0],
    scan,
    [0xff, 0xd9],
  )
}

function crc32(buf: Uint8Array) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function pngChunk(type: string, data: Uint8Array) {
  const td = bytes(type, data)
  return bytes(u32(data.length), td, u32(crc32(td)))
}
function png(width: number, height: number, extra: Uint8Array[] = []) {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", bytes(u32(width), u32(height), [8, 6, 0, 0, 0])),
    ...extra,
    pngChunk("IDAT", bytes([0x78, 0x9c, 0x63, 0, 0, 0, 0, 1])),
    pngChunk("IEND", new Uint8Array(0)),
  )
}
function webpWithExif() {
  const vp8x = bytes("VP8X", u32le(10), [0x08 | 0x10, 0, 0, 0], [99, 0, 0], [49, 0, 0]) // EXIF + alpha flags, 100x50
  const vp8l = bytes("VP8L", u32le(5), [0x2f, 0, 0, 0, 0], [0]) // padded to even
  const exif = bytes("EXIF", u32le(8), "GPS 51.5")
  const body = bytes("WEBP", vp8x, vp8l, exif)
  return bytes("RIFF", u32le(body.length), body)
}

const SVG = bytes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>')
const HTML = bytes("<!DOCTYPE html><html><body><form action=https://evil.example>password</form></body></html>")
const EXE = bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00])
const PDF = bytes("%PDF-1.7\n1 0 obj")
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
const MP4 = bytes(u32(24), "ftypisom", u32(0x200), "isomiso2")
const GIF = bytes("GIF89a", [10, 0, 20, 0, 0, 0, 0])

async function main() {
  /* ================================================================ */
  console.log("\nMagic bytes decide what a file is\n")

  check("a JPEG is a JPEG", sniff(phoneJpeg(1)).mime === "image/jpeg")
  check("a PNG is a PNG", sniff(png(10, 10)).mime === "image/png")
  check("a GIF is a GIF", sniff(GIF).mime === "image/gif")
  check("a WebP is a WebP", sniff(webpWithExif()).mime === "image/webp")
  check("an MP4 is a video", sniff(MP4).family === "video")
  check("a PDF is a PDF, a ZIP an archive", sniff(PDF).mime === "application/pdf" && sniff(ZIP).family === "archive")
  check("an SVG is markup, not a picture", sniff(SVG).mime === "image/svg+xml" && sniff(SVG).family === "markup")
  check("an HTML page is markup", sniff(HTML).mime === "text/html")
  check("a Windows and a Linux executable are executables", sniff(EXE).family === "executable" && sniff(ELF).family === "executable")

  check("public pictures: JPEG, PNG, GIF, WebP", [phoneJpeg(1), png(4, 4), GIF, webpWithExif()].every((b) => isPublicImage(b)))
  check("never an SVG, an HTML page, a PDF or a program", [SVG, HTML, PDF, EXE].every((b) => isPublicImage(b) === null))
  check("an HTML page called image/png does not match what it claims", !matchesDeclared(HTML, "image/png"))
  check("an SVG does not pass as an image type", !matchesDeclared(SVG, "image/svg+xml") || sniff(SVG).family === "markup")
  check("a real PNG matches image/png, an MP4 matches video/quicktime's family", matchesDeclared(png(2, 2), "image/png") && matchesDeclared(MP4, "video/quicktime"))
  check("a declared SVG is not a public picture type", !declaresPublicImage("image/svg+xml") && declaresPublicImage("image/jpeg") && declaresPublicImage("image/jpg"))
  check("types a browser renders are named as such", ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript"].every(isRenderedDocumentType))
  check("stored under a public URL, markup and programs become downloads", safeStoredContentType("image/svg+xml", SVG) === "application/octet-stream" && safeStoredContentType("text/html", null) === "application/octet-stream" && safeStoredContentType("application/pdf", EXE) === "application/octet-stream")
  check("and a real media type is kept", safeStoredContentType("application/octet-stream", PDF) === "application/pdf")
  check("a renamed executable is refused by the scanner", !scanFile("invoice.pdf", "application/pdf", EXE).safe)
  check("a script behind a document's name is refused", !scanFile("notes.txt", "text/plain", bytes("#!/bin/bash\nrm -rf /")).safe)

  /* ================================================================ */
  console.log("\nPictures: size, pixels and metadata\n")

  const photo = phoneJpeg(6)
  const clean = stripImageMetadata(photo)
  check("the GPS position is gone", has(photo, "51.5007N") && !has(clean, "51.5007N"))
  check("the XMP owner is gone", has(photo, "Ada Lovelace") && !has(clean, "Ada Lovelace"))
  check("the comment is gone", !has(clean, "comment"))
  check("the orientation is kept, so a portrait photo is not shown on its side", has(clean, "Exif") && clean.includes(0x12) && (() => {
    const i = Buffer.from(clean).indexOf(Buffer.from([0x01, 0x12, 0x00, 0x03]))
    return i > 0 && clean[i + 9] === 6
  })())
  check("the colour profile and JFIF stay", has(clean, "ICC_PROFILE") && has(clean, "JFIF"))
  check("the image data is untouched", Buffer.from(clean.slice(-8)).equals(Buffer.from(photo.slice(-8))))
  check("the frame size reads the same after", JSON.stringify(readImageSize(clean)) === JSON.stringify({ width: 4032, height: 3024 }))
  check("a photo with normal orientation keeps no EXIF at all", !has(stripImageMetadata(phoneJpeg(1)), "Exif"))
  check("a clean file is returned as it is", stripImageMetadata(clean) === clean || stripImageMetadata(clean).length === clean.length)

  const tagged = png(20, 10, [pngChunk("tEXt", bytes("Author", [0], "Ada")), pngChunk("eXIf", bytes("MM", [0, 0x2a], "GPS")), pngChunk("iCCP", bytes("icc", [0, 0], [1, 2]))])
  const cleanPng = stripImageMetadata(tagged)
  check("PNG text and EXIF chunks are removed", !has(cleanPng, "tEXt") && !has(cleanPng, "eXIf") && has(cleanPng, "iCCP") && has(cleanPng, "IDAT"))
  check("the PNG is still 20 by 10", readImageSize(cleanPng)?.width === 20 && readImageSize(cleanPng)?.height === 10)

  const wp = webpWithExif()
  const cleanWp = stripImageMetadata(wp)
  const riff = cleanWp[4] | (cleanWp[5] << 8) | (cleanWp[6] << 16) | (cleanWp[7] << 24)
  check("WebP EXIF is removed, its flag cleared, and the RIFF size fixed", !has(cleanWp, "EXIF") && (cleanWp[20] & 0x08) === 0 && (cleanWp[20] & 0x10) !== 0 && riff === cleanWp.length - 8)
  check("the WebP size reads from VP8X", readImageSize(cleanWp)?.width === 100 && readImageSize(cleanWp)?.height === 50)

  const ok = preparePublicImage(photo)
  check("a phone photo is accepted, as a JPEG, stripped", ok.ok && ok.mime === "image/jpeg" && ok.ext === "jpg" && ok.stripped && !has(ok.bytes, "51.5007N"))
  const bomb = preparePublicImage(png(30000, 30000))
  check("a 900 megapixel picture is refused (decompression bomb)", !bomb.ok && statusOf(bomb) === 413, JSON.stringify(bomb).slice(0, 120))
  check("the pixel limit is 50 megapixels", MAX_IMAGE_PIXELS === 50_000_000)
  const huge = preparePublicImage(new Uint8Array(PUBLIC_IMAGE_MAX_BYTES + 1))
  check("a file over 25 MB is refused before it is read", !huge.ok && statusOf(huge) === 413)
  const svg = preparePublicImage(SVG)
  check("an SVG is refused as a picture", !svg.ok && statusOf(svg) === 415)
  check("so is an HTML page", !preparePublicImage(HTML).ok)

  /* ================================================================ */
  console.log("\nPaths are the server's\n")

  const path = generateStoragePath("creator-1", "../../evil.php/../x.PNG?y", "digital-products")
  check("a generated path is the owner, a fixed folder and a random name", /^creator-1\/digital-products\/\d+-[0-9a-f]{32}\.[a-z0-9]+$/.test(path), path)
  check("nothing from the uploader's name but a cleaned extension", storageExtension("a.b/../../c") === "c" && storageExtension("photo.JPEG") === "jpeg" && storageExtension("noext") === "bin")
  check("two paths never collide", generateStoragePath("c", "a.pdf") !== generateStoragePath("c", "a.pdf"))

  for (const route of [
    "app/api/v2/upload/prepare/route.ts",
    "app/api/v2/upload/server-upload/route.ts",
    "app/api/onepage/signed-upload-url/route.ts",
    "app/api/onepage/upload-file/route.ts",
    "app/api/email/upload-image/route.ts",
    "app/api/storage/upload-video/route.ts",
  ]) {
    /* The video route reads a bucket and folder only to pass them through
       videoBucketOf and uploadFolderOf (lib/storage/upload-location.ts). */
    const src = code(route).replace(/videoBucketOf\((body\.bucket|formData\.get\("bucket"\))\)/g, "videoBucketOf(checked)")
    check(`${route}: signed in first`, /auth\.getUser\(\)/.test(src) && /status: 401/.test(src))
    check(`${route}: never a bucket or path from the request`, !/body\??\.(bucket|path)\b/.test(src) && !/formData\.get\("(bucket|path)"\) as string/.test(src))
    check(`${route}: rate limited`, /uploadRateLimit\(user\.id/.test(src) && /if \(limited\) return limited/.test(src))
  }
  const complete = code("app/api/v2/upload/complete/route.ts")
  check("complete finds the asset by id AND uploader, and takes its path from the row", /\.eq\("uploaded_by", user\.id\)/.test(complete) && /pending\.file_path/.test(complete))
  check("complete only accepts a picture path under the caller's own creator id", /ownsStoragePath\(path, \[creator\.id\]\)/.test(complete) && /body\?\.bucket !== PUBLIC_BUCKET/.test(complete))
  check("the route that wrote wherever a form said is gone", !existsSync(join(root, "app/api/v2/upload/chunk/route.ts")))
  check("so is the route that let anybody reset a bucket", !existsSync(join(root, "app/api/onepage/fix-bucket/route.ts")))
  check("and the PDF route that trusted an email from the body", !existsSync(join(root, "app/api/v2/download/stamp-pdf/route.ts")))
  check("the upload file route has no POST any more, only the owner's DELETE", !/export async function POST/.test(code("app/api/storage/upload-file/route.ts")) && /asset\.storage_bucket && \(DIGITAL_BUCKETS/.test(code("app/api/storage/upload-file/route.ts")))
  check("cancel removes only the caller's own upload", /\.eq\("uploaded_by", user\.id\)/.test(code("app/api/v2/upload/cancel/route.ts")))
  const blog = code("app/api/admin/blog/upload/route.ts")
  check("the admin blog upload checks the bytes too", /isAdminAuthenticated\(\)/.test(blog) && /preparePublicImage\(/.test(blog))

  /* No route may create policies or public buckets on the fly any more. */
  const everyRoute = [
    "app/api/v2/upload/prepare/route.ts",
    "app/api/onepage/signed-upload-url/route.ts",
    "app/api/onepage/upload-file/route.ts",
    "app/api/storage/upload-file/route.ts",
    "app/api/storage/upload-video/route.ts",
    "app/api/email/upload-image/route.ts",
  ].map(code).join("\n")
  check("no route calls ensure_storage_rls or fix_storage_bucket_limit", !/ensure_storage_rls|fix_storage_bucket_limit/.test(everyRoute))
  check("no route rewrites a bucket's settings per upload", !/updateBucket\(/.test(everyRoute) && !/listBuckets\(/.test(everyRoute))

  /* ================================================================ */
  console.log("\nQuota, limits and rates\n")

  const quota = code("lib/storage/quota.ts")
  check("quota refuses a size that is not a positive number", /!Number\.isFinite\(fileSize\) \|\| fileSize <= 0/.test(quota))
  check("the fallback sum filters on the embed's alias and counts pending uploads", /\.eq\("product\.creator_id", creatorId\)/.test(quota) && /\.in\("upload_status", \["pending", "completed"\]\)/.test(quota))
  const prepare = code("app/api/v2/upload/prepare/route.ts")
  check("prepare checks quota, open uploads and the product's file limit", /checkUploadAllowed\(admin, creator\.id, fileSize\)/.test(prepare) && /tooManyPendingUploads\(admin, user\.id\)/.test(prepare) && /productFileLimit\(admin, productId/.test(prepare))
  check("prepare refuses a private file with no product", /isDigital && !productId/.test(prepare))
  check("prepare takes only pictures for the public bucket, by the central precheck", /validateFile\(fileName, contentType, fileSize, null, isDigital \? "product_file" : "public_image"\)/.test(prepare))
  check("complete checks the size storage recorded against the quota", /storedObjectSize\(admin, bucket, pending\.file_path\)/.test(complete) && /checkUploadAllowed\(admin, creator\.id, extra\)/.test(complete))
  check("and runs the central check on what storage holds, by Range", /inspectStoredObject\(\s*admin,\s*\{ bucket, path: pending\.file_path \}/.test(complete))
  check("a picture that went up by signed URL is checked and stripped at complete", /cleanStoredPublicImage\(admin, PUBLIC_BUCKET, path\)/.test(complete))
  check("a link page's file is not mistaken for a picture and removed, but a page or program is", /path\.startsWith\(`\$\{creator\.id\}\/digital-products\/`\)/.test(complete) && /context: "link_page_file"/.test(complete))
  check("the server upload checks bytes, quota and file limit", /inspectUpload\(\{\s*fileName,/.test(code("app/api/v2/upload/server-upload/route.ts")) && /preparePublicImage\(buffer\)/.test(code("app/api/v2/upload/server-upload/route.ts")))

  const guard = code("lib/storage/upload-guard.ts")
  check("uploads are counted per user in Postgres, per minute and per plan hour", /bucket: "upload"/.test(guard) && /subjects: \[`user:\$\{userId\}`\]/.test(guard) && /getPlanLimits\(planId\)\.rateLimit\.uploadsPerHour/.test(guard))
  check("at most eight uploads open at once", /MAX_PENDING_UPLOADS = 8/.test(guard))
  const legacy = code("lib/storage/download.ts")
  check("the old per creator counter counts the user id it stores", /\.eq\("uploaded_by", creator\.user_id\)/.test(legacy))
  check("the download limit counts this creator's downloads, not the platform's", /\.eq\("digital_assets\.products\.creator_id", creatorId\)/.test(legacy))
  check("plan ids are read like the billing names them", getPlanLimits("Professional") === PLAN_LIMITS.pro && getPlanLimits(" GROWTH ") === PLAN_LIMITS.growth && getPlanLimits("nonsense") === PLAN_LIMITS.free)
  check("files per product are limited on every plan, and Free is not below what bundles need", PLAN_LIMITS.free.maxFilesPerProduct >= 6 && Object.values(PLAN_LIMITS).every((p) => p.maxFilesPerProduct > 0 && p.maxFilesPerProduct <= 100))
  for (const [route, bucket] of [
    ["app/api/v2/upload/scan/route.ts", "upload-scan"],
    ["app/api/v2/upload/bundle/route.ts", "bundle"],
    ["app/api/storage/generate-bundle/route.ts", "bundle"],
    ["app/api/website-builder/themes/import/upload/route.ts", "theme-import"],
  ] as const) {
    check(`${route} is rate limited`, new RegExp(`bucket: "${bucket}"`).test(code(route)))
  }
  check("a bundle's variant must be one of the product's own", ["app/api/v2/upload/bundle/route.ts", "app/api/storage/generate-bundle/route.ts"].every((r) => /variant\.product_id !== productId/.test(code(r))) && /\.eq\("digital_assets\.product_id", productId\)/.test(code("lib/bundles.ts")))
  check("a bundle never includes a flagged file, and has a memory ceiling", /BLOCKED_SCAN/.test(code("lib/bundles.ts")) && /totalBytes > BUNDLE_MAX_BYTES/.test(code("lib/bundles.ts")))

  /* ================================================================ */
  console.log("\nPaid files: private, and signed for five minutes\n")

  check("signed download URLs live five minutes", SIGNED_DOWNLOAD_SECONDS === 300)
  const signed: { bucket: string; path: string; expiry: number; options: unknown }[] = []
  const fakeAdmin = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (p: string, expiry: number, options: unknown) => {
          signed.push({ bucket, path: p, expiry, options })
          return bucket === "digital-products" ? { data: { signedUrl: `https://s/${bucket}/${p}?token=x` }, error: null } : { data: null, error: { message: "no" } }
        },
      }),
    },
  } as never
  const a = await generateSignedDownloadUrl(fakeAdmin, "c/digital-products/f.pdf", 86400 * 365, "messages", "Guide.pdf")
  check("a year-long expiry is cut to an hour", signed.every((s) => s.expiry <= 3600), JSON.stringify(signed.map((s) => s.expiry)))
  check("a row naming another private bucket is ignored", !signed.some((s) => s.bucket === "messages") && a?.bucket === "digital-products")
  check("the URL is made as a download with the file's name", signed.every((s) => (s.options as { download?: unknown }).download === "Guide.pdf"))
  signed.length = 0
  check("a path that climbs out is never signed", (await generateSignedDownloadUrl(fakeAdmin, "c/../other/f.pdf")) === null && signed.length === 0)

  const dl = code("app/api/download/[assetId]/route.ts")
  check("the download route scans before the first buyer gets a file", /gateDownload\(admin, asset, \{ isCreator: decision\.via === "creator" \}\)/.test(dl))
  const v2 = code("app/api/v2/download/[token]/route.ts")
  check("the v2 door is rate limited and gated the same way", /bucket: "download"/.test(v2) && /gateDownload\(/.test(v2) && /serveTokenDownload\(/.test(v2))
  for (const r of ["app/api/onepage/download/route.ts", "app/api/onepage/download/[token]/route.ts"]) {
    check(`${r} answers through the shared token door`, /serveTokenDownload\(/.test(code(r)))
  }
  const tokenDoor = code("lib/storage/token-download.ts")
  check("a token link is rate limited per address and per token", /subjects: \[addressSubject\(request\), `token:\$\{token\}`\]/.test(tokenDoor))
  check("it only sends finished, scanned files", /upload_status\.is\.null,upload_status\.eq\.completed/.test(tokenDoor) && /gateDownload\(admin, asset, \{ isCreator: false \}\)/.test(tokenDoor))
  check("it never sends a storage path in place of a link", !/signed\?\.url \|\| asset\.file_path/.test(tokenDoor) && !/\|\| asset\.file_path/.test(v2))
  check("the download count cannot be raced past its limit", /\.eq\("download_count", record\.download_count\)/.test(tokenDoor))
  const gate = code("lib/storage/scan-gate.ts")
  check("refused files never go out; older unchecked ones are checked once on the spot and served", /BLOCKED_STATUSES\.has\(status\)/.test(gate) && /resolveAsset\(admin, asset, \{ archive: false/.test(gate) && !/status: 409/.test(gate))

  /* ================================================================ */
  console.log("\nThe migration\n")

  const sql = read("supabase/migrations/20260929_upload_safety.sql")
  check("the paste-ready copy is the same file", read("supabase/sql/RUN_UPLOAD_SAFETY.sql") === sql)
  check("ensure_storage_rls does nothing and only the service role may call it", /revoke all on function public\.ensure_storage_rls\(text\) from public, anon, authenticated/.test(sql) && !/create policy[^;]*ensure_storage_rls/i.test(sql))
  check("fix_storage_bucket_limit can no longer make a public bucket", /revoke all on function public\.fix_storage_bucket_limit\(text, bigint\) from public, anon, authenticated/.test(sql) && !/insert into storage\.buckets[^;]*p_bucket_id/i.test(sql))
  check("digital-products is private", /insert into storage\.buckets \(id, name, public\) values \('digital-products', 'digital-products', false\)\s+on conflict \(id\) do update set public = false/.test(sql))
  check("every anon or signed in policy on a managed bucket is dropped, and named", /drop policy %I on storage\.objects/.test(sql) && /raise notice 'dropped storage policy/.test(sql))
  check("no policy is created for anon anywhere", !/to anon/i.test(sql.replace(/--[^\n]*/g, "")))
  check("public buckets: owners write only under their own folder", /public\.storage_owns_path\(name\)/.test(sql) && /split_part\(p_name, '\/', 1\) = auth\.uid\(\)::text/.test(sql))
  check("the private bucket: only the path reserved for a pending upload", /storage_reserved_upload\(bucket_id, name\)/.test(sql) && /da\.upload_status = 'pending'/.test(sql))
  check("picture buckets take pictures only, never SVG", /image_types text\[\] := array\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/gif', 'image\/avif'\]/.test(sql) && !/'image\/svg\+xml'/.test(sql.replace(/--[^\n]*/g, "")) && !/'text\/html'/.test(sql.replace(/--[^\n]*/g, "")))
  check("digital_assets can only be written by the server", /and cmd in \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/.test(sql) && /drop policy %I on public\.digital_assets/.test(sql))
  check("usage counts pending uploads", /coalesce\(da\.upload_status, 'completed'\) in \('pending', 'completed'\)/.test(sql))
  check("and is nobody else's business", /revoke all on function public\.get_creator_storage_usage\(uuid\) from public, anon, authenticated/.test(sql))
  check("it deletes no rows and no files", !/delete from (public|storage)\./i.test(sql))

  /* ================================================================ */
  console.log("\nThe cleanup job\n")

  const { mayRemove, CLEANUP_RULES } = await import("../lib/storage/cleanup").catch(() => ({ mayRemove: null, CLEANUP_RULES: null })) as {
    mayRemove: ((c: { bucket_id: string; name: string; reason: string }) => boolean) | null
    CLEANUP_RULES: Record<string, unknown> | null
  }
  const uuid = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
  if (mayRemove && CLEANUP_RULES) {
    check("an abandoned theme package may go", mayRemove({ bucket_id: "digital-products", name: `${uuid}/theme-imports/${uuid}.zip`, reason: "theme-import" }))
    check("an orphaned digital file may go", mayRemove({ bucket_id: "digital-products", name: `${uuid}/digital-products/1-a.pdf`, reason: "digital-orphan" }))
    check("a removed product photo may go", mayRemove({ bucket_id: "product-images", name: `${uuid}/${uuid}/1_photo.jpg`, reason: "removed-image" }))
    check("never anything in the avatar bucket", !mayRemove({ bucket_id: "avatars", name: `${uuid}/${uuid}/a.jpg`, reason: "removed-image" }))
    check("never a reason it does not know", !mayRemove({ bucket_id: "product-images", name: `${uuid}/${uuid}/a.jpg`, reason: "whatever" }))
    check("never a path outside the shape its reason promises", !mayRemove({ bucket_id: "digital-products", name: `${uuid}/bundles/x.zip`, reason: "theme-import" }) && !mayRemove({ bucket_id: "product-images", name: "blog/1.jpg", reason: "removed-image" }))
    check("never a path that climbs", !mayRemove({ bucket_id: "digital-products", name: `${uuid}/digital-products/../x`, reason: "digital-orphan" }))
  } else {
    check("lib/storage/cleanup.ts loads", false)
  }
  check("the database side keeps anything it cannot read", /exception when others then\s+found := true/.test(sql) && /return true;\s+end if;\s+-- LIKE treats/.test(sql))
  check("recent files are never candidates", /interval '1 day'/.test(sql) && /interval '3 days'/.test(sql) && /interval '14 days'/.test(sql) && /interval '30 days'/.test(sql))
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  check("the cleanup runs daily and the metadata sweep hourly", vercel.crons.some((c) => c.path === "/api/cron/storage-cleanup") && vercel.crons.some((c) => c.path === "/api/cron/strip-image-metadata" && c.schedule.startsWith("10 ")))
  for (const r of ["app/api/cron/storage-cleanup/route.ts", "app/api/cron/strip-image-metadata/route.ts"]) {
    check(`${r} needs CRON_SECRET`, /requireBearerSecret\(request, "CRON_SECRET"\)/.test(code(r)))
  }
  const sweep = code("lib/storage/metadata-sweep.ts")
  check("the sweep rewrites a picture only when it had metadata, at the same path", /if \(clean === bytes\) continue/.test(sweep) && /upload\(o\.name, clean, \{[\s\S]*upsert: true/.test(sweep))

  /* ================================================================ */
  console.log("\nThe browser side\n")

  const compress = code("lib/images/compress.ts")
  check("an original that goes up uncompressed loses its metadata first", (compress.match(/withoutMetadata\(file\)/g) ?? []).length >= 5)
  const uploader = code("lib/storage/chunked-upload.ts")
  check("the uploader never calls the removed chunk route", !/\/api\/v2\/upload\/chunk/.test(uploader))
  check("a second prepare reuses the same record", /assetId: this\.assetId/.test(uploader))
  for (const [file, pattern] of [
    ["components/shared/square-image-cropper.tsx", /`\$\{user\.id\}\/\$\{folder\}\//],
    ["components/onepage/onboarding-modal.tsx", /`\$\{user\.id\}\/onepage-avatar-/],
    ["components/app/creator-onboarding-modal.tsx", /`\$\{user\.id\}\/creator-avatar-/],
    /* Settings' photo changes in place now (components/app/settings/profile-photo), still under the owner's folder. */
    ["components/app/settings/profile-photo.tsx", /`\$\{userId\}\/avatar-\$\{Date\.now\(\)\}\.jpg`/],
    ["app/library/settings/buyer-settings.tsx", /`\$\{userId\}\/avatar\.\$\{ext\}`/],
  ] as const) {
    check(`${file} uploads under the owner's folder`, pattern.test(read(file)))
  }
  check("link page thumbnails and images go under the owner's folder", (read("components/onepage/tabs/links-tab.tsx").match(/`\$\{ownerId\}\/(thumbnail|image)_/g) ?? []).length === 3)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) {
    console.log("Failing:", failures.join(", "))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
