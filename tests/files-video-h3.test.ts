/**
 * Round H3: "Choose from your files", its tiles, its pills, and videos.
 *
 *   1. The tile: a small violet check and ring when selected, an empty ring
 *      while selecting several, three small dots only on hover (always on a
 *      touch screen), a keyboard focus ring. No giant discs on the picture.
 *   2. A pill switch does not fade the grid (the flash), measured in a browser
 *      by scratch probe; pinned here in the source.
 *   3. Videos: listed with their stored first frame and length, uploaded from
 *      Files, drop zones and the product editor, checked on the server as
 *      videos (not deleted as "not a picture"), played in the product page's
 *      gallery, the native product section and an imported theme's
 *      product.media, and kept out of everything that only draws pictures.
 *
 *   npx tsx tests/files-video-h3.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { durationText, imagesOnly, isPosterName, isVideoUrl, mediaOf, posterPathFor, videoDuration, videoMime, videoPosterUrl } from "@/lib/media/video"
import { deleteLibraryFile, deleteLibraryFiles, listLibrary } from "@/lib/files/library"
import { directRulesFor } from "@/lib/security/uploads/direct"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { productObject } from "@/lib/storelib-theme/compat/objects"
import { Ctx, renderString } from "@/lib/storelib-theme/compat/runtime"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { parseCompat } from "@/lib/storelib-theme/compat/parser"
import { toCard } from "@/lib/website-builder/shop-products"
import { productImages } from "@/lib/products/product-page-model"
import { mediaOf as editorMediaOf } from "@/app/app/products/new/editor-form"
import { checkoutCoverUrl } from "@/lib/checkout/share-meta"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

type Entry = { name: string; id: string | null; created_at?: string; metadata?: { size: number; mimetype: string } | null }
function fakeAdmin(tree: Record<string, Record<string, Entry[]>>, removed: string[][] = []) {
  return {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: tree[bucket]?.[prefix] ?? [], error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: encodeURI(`https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}`) } }),
        remove: async (paths: string[]) => {
          removed.push(paths.map((p) => `${bucket}:${p}`))
          return { error: null }
        },
      }),
    },
  }
}

async function main() {
  console.log("\n1. The tile")
  const lib = read("components/files/files-library.tsx")
  const tile = lib.slice(lib.indexOf("const Tile = React.memo"), lib.indexOf("/** A file on its way up: its own preview"))
  check("selected: a 22px violet check with a white edge and a soft shadow", /h-\[22px\] w-\[22px\]/.test(tile) && /bg-\[#8b5cf6\] text-white opacity-100 shadow-\[0_0_0_1\.5px_#fff,0_1px_3px_rgba\(17,24,39,0\.3\)\]/.test(tile))
  check("  a 2px violet ring on a pale ground, the picture drawn in a little", /shadow-\[inset_0_0_0_2px_#8b5cf6\]/.test(tile) && /scale-\[0\.92\] rounded-lg/.test(tile))
  check("  the check only on a selected tile, or as an empty ring while selecting several", /selecting \|\| chosen \?/.test(tile) && /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:group-hover\/tile:opacity-100 \[@media\(hover:none\)\]:scale-100 \[@media\(hover:none\)\]:opacity-100/.test(tile))
  check("the dots: 24px, translucent, a 40px target, only on hover with a mouse", /grid h-6 w-6 place-items-center rounded-full bg-black\/40 text-white/.test(tile) && /before:-inset-2/.test(tile) && /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:opacity-0 group-hover\/tile:opacity-100/.test(tile))
  check("  no 32px discs and no near black check left on the picture", !/h-8 w-8 place-items-center rounded-full bg-white/.test(tile) && !/bg-\[#1a1a2e\] text-white/.test(tile))
  check("a keyboard focus ring, inside the tile so content-visibility cannot cut it off", /group\/btn relative/.test(tile) && /shadow-\[inset_0_0_0_2px_#8b5cf6,inset_0_0_0_4px_#fff\] group-focus-visible\/btn:opacity-100/.test(tile))
  check("the Files page uses the same tile for Select", /mode === "manage" \? <span className="block truncate/.test(tile) && /selecting = mode === "pick" \? multiple : selectingFiles/.test(lib))

  console.log("\n2. No flash between pills")
  const swap = lib.slice(lib.indexOf("const swapGrid"), lib.indexOf("const chooseSource"))
  check("the grid is never animated on a switch", !/\.animate\(/.test(swap))
  check("tiles are kept by id across pills, shown and put away in the press", /key=\{f\.id\}/.test(lib) && /putAway\(li, !keep\.has/.test(swap))

  console.log("\n3. Video names, frames and lengths")
  const v = "https://storelib.com/media/store-builder-images/u1/files/1712-abc-37s.mp4"
  check("a video address is told from a picture", isVideoUrl(v) && isVideoUrl("x.MOV?x=1") && !isVideoUrl("a.jpg") && !isVideoUrl(null))
  check("its first frame sits beside it", videoPosterUrl(v) === "https://storelib.com/media/store-builder-images/u1/files/1712-abc-37s.poster.jpg" && posterPathFor("a/b-3s.webm") === "a/b-3s.poster.jpg")
  check("  only a name with the length stamp promises a frame", videoPosterUrl("https://x/y/1712-abc.mp4") === null)
  check("its length from the name, written as a clock", videoDuration(v) === 37 && durationText(37) === "0:37" && durationText(84) === "1:24" && durationText(3723) === "1:02:03" && durationText(null) === "")
  check("types for a <source>", videoMime("a.webm") === "video/webm" && videoMime("a.mov") === "video/quicktime" && videoMime("a.mp4") === "video/mp4")
  check("a poster is not a picture of its own", isPosterName("a-3s.poster.jpg") && !isPosterName("poster.jpg"))
  check("a mixed list keeps its order", JSON.stringify(mediaOf(["a.jpg", v]).map((m) => m.type)) === '["image","video"]' && imagesOnly(["a.jpg", v, null]).length === 2)

  console.log("\n4. The library lists videos with their frames")
  const at = "2026-10-09T10:00:00Z"
  const tree = {
    "store-builder-images": {
      "user-1": [{ name: "files", id: null }, { name: "products", id: null }, { name: "site", id: null }],
      "user-1/files": [
        { name: "1-a-37s.mp4", id: "1", created_at: at, metadata: { size: 9000, mimetype: "video/mp4" } },
        { name: "1-a-37s.poster.jpg", id: "2", created_at: at, metadata: { size: 900, mimetype: "image/jpeg" } },
        { name: "2-b.webm", id: "3", created_at: at, metadata: { size: 9000, mimetype: "video/webm" } },
        { name: "p.png", id: "4", created_at: at, metadata: { size: 900, mimetype: "image/png" } },
      ],
      "user-1/products": [{ name: "3-c-5s.mov", id: "5", created_at: at, metadata: { size: 9000, mimetype: "video/quicktime" } }],
      "user-1/site": [],
    },
    "product-images": { "creator-1": [] },
  }
  const owner = { userId: "user-1", creatorId: "creator-1" }
  const media = await listLibrary(fakeAdmin(tree), owner, "media")
  const names = media.map((f) => f.name).sort()
  check("media: pictures and videos together, frames left out", JSON.stringify(names) === JSON.stringify(["1-a-37s.mp4", "2-b.webm", "3-c-5s.mov", "p.png"]), names)
  const a = media.find((f) => f.name === "1-a-37s.mp4")
  check("  a video carries its frame and its length", !!a?.poster?.endsWith("/1-a-37s.poster.jpg") && a?.duration === 37, a)
  check("  one without a frame says so", media.find((f) => f.name === "2-b.webm")?.poster === null)
  check("  a product's videos are with the product photos", media.find((f) => f.name === "3-c-5s.mov")?.source === "Product photos")
  check("image: no videos, no frames", JSON.stringify((await listLibrary(fakeAdmin(tree), owner, "image")).map((f) => f.name)) === '["p.png"]')
  check("video: videos only", (await listLibrary(fakeAdmin(tree), owner, "video")).every((f) => isVideoUrl(f.name)))
  const removed: string[][] = []
  await deleteLibraryFile(fakeAdmin(tree, removed), owner, "store-builder-images", "user-1/files/1-a-37s.mp4")
  check("deleting a video takes its frame with it", JSON.stringify(removed[0]) === JSON.stringify(["store-builder-images:user-1/files/1-a-37s.mp4", "store-builder-images:user-1/files/1-a-37s.poster.jpg"]), removed)
  const many: string[][] = []
  const out = await deleteLibraryFiles(fakeAdmin(tree, many), owner, [{ bucket: "store-builder-images", path: "user-1/files/1-a-37s.mp4" }, { bucket: "store-builder-images", path: "user-1/files/p.png" }])
  check("  and several at once, counting files, not frames", out.ok && (out as { removed: number }).removed === 2 && many[0].length === 3, { out, many })

  console.log("\n5. Checked on the server as what the name says")
  check("a video name in store-builder-images is checked as a video, up to 500 MB", directRulesFor("store-builder-images", "u/files/a.mp4")?.context === "video" && directRulesFor("store-builder-images", "u/files/a.MOV")?.maxBytes === 500 * 1024 * 1024)
  check("  a picture there is still a picture; product-images stays pictures only", directRulesFor("store-builder-images", "u/files/a.poster.jpg")?.context === "public_image" && directRulesFor("product-images", "c/p/a.mp4")?.context === "public_image")
  const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0])
  const asVideo = (name: string, head: Uint8Array, mime: string) => inspectHead({ fileName: name, size: 5_000_000, head, declaredMime: mime, context: "video" })
  check("  a real MP4 passes", asVideo("a.mp4", mp4, "video/mp4").ok, asVideo("a.mp4", mp4, "video/mp4"))
  check("  a picture or a program called .mp4 is refused", !asVideo("a.mp4", jpg, "video/mp4").ok && !asVideo("a.mp4", exe, "video/mp4").ok)
  check("  a program by name is refused whatever it says it is", !inspectHead({ fileName: "a.exe", size: 100, head: mp4, declaredMime: "video/mp4", context: "video" }).ok)

  console.log("\n6. Product pages play them")
  const card = toCard({ id: "p1", title: "Lamp", slug: "lamp", price_cents: 1000, thumbnail_url: "https://storelib.com/media/store-builder-images/u1/products/1-a-37s.poster.jpg", gallery_urls: ["https://storelib.com/media/store-builder-images/u1/products/1-a-37s.mp4", "https://storelib.com/media/product-images/c/p/1.jpg"], status: "published" } as never)
  const s = card.settings as Record<string, unknown>
  check("a card's pictures leave the video out", (s.images as string[]).every((u) => !isVideoUrl(u)), s.images)
  check("  and its media keeps it, in order, without its frame twice", JSON.stringify((s.media as string[]).map((u) => u.split("/").pop())) === '["1-a-37s.mp4","1.jpg"]', s.media)
  const p = productObject({ id: "p1", settings: s })
  const pm = p.media as Record<string, unknown>[]
  check("an imported theme's product.media has the video as Shopify's video media", pm[0].media_type === "video" && (pm[0].sources as { mime_type: string }[])[0].mime_type === "video/mp4" && pm[0].duration === 37000, pm[0])
  check("  with its frame as preview_image", String((pm[0].preview_image as Record<string, unknown>).src).endsWith("1-a-37s.poster.jpg"))
  check("  product.images and featured_image stay pictures", (p.images as Record<string, unknown>[]).length === 1 && String((p.featured_image as Record<string, unknown>).src).endsWith("/1.jpg"))
  const env = { snippet: (n: string) => (n ? parseCompat("") : null), filter: compatFilter }
  const html = renderString("{% for m in product.media %}{% case m.media_type %}{% when 'video' %}{{ m | video_tag: controls: true }}{% when 'image' %}[img]{% endcase %}{% endfor %}|{{ product.media[0] | media_tag }}", new Ctx({ product: p }, env))
  check("  video_tag and media_tag draw a <video> with its source and frame", /<video controls poster="[^"]*1-a-37s\.poster\.jpg[^"]*" preload="metadata"><source src="[^"]*1-a-37s\.mp4" type="video\/mp4"><\/video>\[img\]\|<video/.test(html), html)
  check("the native product section's list drops the frame and keeps the video", JSON.stringify(productImages({ thumbnail_url: "https://x/u/products/1-a-37s.poster.jpg", gallery_urls: ["https://x/u/products/1-a-37s.mp4", "https://x/1.jpg"] } as never).map((u) => u.split("/").pop())) === '["1-a-37s.mp4","1.jpg"]')
  const pm2 = read("components/website-builder/sections/renderers/product/product-media.tsx")
  check("  and plays it with controls and its frame", /isVideoUrl\(src\) \?/.test(pm2) && /poster=\{videoPosterUrl\(src\) \?\? undefined\}/.test(pm2) && /controls\s+playsInline\s+preload="metadata"/.test(pm2))
  const gallery = read("components/product/product-gallery.tsx")
  check("the Storelib product page's gallery plays a video in its place among the photos", /\.map\(url => \(isVideoUrl\(url\) \? \{ url, type: "video" as const/.test(gallery) && /poster=\{media\.thumbnailUrl\}/.test(gallery))
  check("a checkout's share picture is never a video", checkoutCoverUrl({ thumbnailUrl: null, galleryUrls: ["https://x/a.mp4", "https://x/b.jpg"] }) === "https://x/b.jpg")

  console.log("\n7. The product editor takes video files")
  const editor = read("app/app/products/new/product-editor.tsx")
  check("its picker and drop zone take videos", /accept=\{`image\/\*,\$\{VIDEO_ACCEPT\}`\}/.test(editor) && /if \(isVideoFile\(file\)\)/.test(editor))
  check("  uploaded with their frame into the products folder", /uploadVideo\(file, "products"/.test(editor))
  check("  Choose from your files shows photos and videos", /kind="media"/.test(editor) && /prefetchLibrary\("media"/.test(editor))
  check("  saved in their place in the gallery, a video first leaves its frame as the thumbnail", /m\.type === "image" \|\| m\.type === "video"/.test(editor) && /videoPosterUrl\(firstMedia\.url\)/.test(editor))
  const loaded = editorMediaOf({ thumbnail_url: "https://x/u/products/1-a-37s.poster.jpg", gallery_urls: ["https://x/u/products/1-a-37s.mp4", "https://x/1.jpg"] } as never)
  check("  read back as a video tile, not a stray frame", JSON.stringify(loaded.map((m) => m.type)) === '["video","image"]', loaded)
  const grid = read("app/app/products/new/media-grid.tsx")
  check("  its tile shows the frame and the length", /videoPosterUrl\(item\.url\)/.test(grid) && /data-media-video=""/.test(grid))
  const upload = read("lib/files/upload-video.ts")
  check("the frame is drawn in the browser from the first second, at most 1280 wide", /Math\.min\(0\.5, d \/ 2\)/.test(upload) && /1280 \/ w/.test(upload) && /toBlob\(/.test(upload))
  check("  type and size refused before sending, and confirmed on the server after", /videoRefusal/.test(upload) && /confirmUpload\(VIDEO_BUCKET, finalPath\)/.test(upload))
  const builder = read("components/website-builder/editor/image-picker.tsx")
  check("image only fields stay image only", !/kind="media"|kind="video"/.test(builder))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main()
