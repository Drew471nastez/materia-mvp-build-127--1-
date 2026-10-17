/**
 * Round T: Files, every picture a store has uploaded in one place, and the
 * website builder's "Choose from your files".
 *
 *   npx tsx tests/files-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { deleteLibraryFile, listLibrary, ownsFile } from "@/lib/files/library"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const owner = { userId: "user-1", creatorId: "creator-1" }

console.log("\nOnly the owner's own files")
check("a builder picture in their folder is theirs", ownsFile(owner, "store-builder-images", "user-1/files/1.png"))
check("a product photo in their folder is theirs", ownsFile(owner, "product-images", "creator-1/prod-9/a.jpg"))
check("someone else's folder is not", !ownsFile(owner, "store-builder-images", "user-2/library/1.png"))
check("a folder that only starts like theirs is not", !ownsFile(owner, "store-builder-images", "user-10/library/1.png"))
check("climbing out with .. is refused", !ownsFile(owner, "store-builder-images", "user-1/../user-2/x.png"))
check("a path deeper or shallower than a file is refused", !ownsFile(owner, "store-builder-images", "user-1/x.png") && !ownsFile(owner, "store-builder-images", "user-1/a/b/x.png"))
check("another bucket is refused", !ownsFile(owner, "avatars", "user-1/files/1.png"))
check("the user's id is not a creator folder", !ownsFile(owner, "product-images", "user-1/p/a.jpg"))

function fakeAdmin(
  tree: Record<
    string,
    Record<
      string,
      Array<{
        name: string
        id: string | null
        created_at?: string
        metadata?: { size: number; mimetype: string } | null
      }>
    >
  >,
  removed: string[] = [],
) {
  return {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({
          data: tree[bucket]?.[prefix] ?? [],
          error: null,
        }),
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths.map((p) => `${bucket}:${p}`))
          return { error: null }
        },
      }),
    },
  }
}

const meta = (size: number) => ({ size, mimetype: "image/png" })
const admin = fakeAdmin({
  "store-builder-images": {
    "user-1": [
      { name: "files", id: null },
      { name: "hero", id: null },
    ],
    "user-1/files": [
      {
        name: "a.png",
        id: "1",
        created_at: "2026-10-09T10:00:00Z",
        metadata: meta(2048),
      },
    ],
    "user-1/hero": [
      {
        name: "b.png",
        id: "2",
        created_at: "2026-10-08T10:00:00Z",
        metadata: meta(4096),
      },
      {
        name: "notes.txt",
        id: "3",
        created_at: "2026-10-10T10:00:00Z",
        metadata: meta(10),
      },
    ],
  },
  "product-images": {
    "creator-1": [{ name: "prod-9", id: null }],
    "creator-1/prod-9": [
      {
        name: "c.png",
        id: "4",
        created_at: "2026-10-10T09:00:00Z",
        metadata: meta(8192),
      },
    ],
  },
})

async function main() {
  console.log("\nThe list")
  const files = await listLibrary(admin, owner)
  check(
    "pictures from the library, the website and products, newest first",
    files.map((f) => `${f.source}:${f.name}`).join(",") === "Product photos:c.png,Library:a.png,Website:b.png",
    files.map((f) => `${f.source}:${f.name}`),
  )
  check("anything that isn't a picture is left out", !files.some((f) => f.name === "notes.txt"))
  check(
    "addresses are Storelib's, never the storage host",
    files.every((f) => !f.url.includes("supabase.co")),
    files.map((f) => f.url),
  )
  check("each carries its size and type", files[0].bytes === 8192 && files[0].type === "image/png")

  const withVideo = fakeAdmin({
    "store-builder-images": {
      "user-1": [{ name: "videos", id: null }, { name: "files", id: null }],
      "user-1/videos": [{ name: "clip.mp4", id: "9", created_at: "2026-10-09T10:00:00Z", metadata: { size: 9000, mimetype: "video/mp4" } }],
      "user-1/files": [{ name: "a.png", id: "1", created_at: "2026-10-09T10:00:00Z", metadata: meta(2048) }, { name: "b.webm", id: "2", created_at: "2026-10-10T10:00:00Z", metadata: { size: 100, mimetype: "video/webm" } }],
    },
    "product-images": { "creator-1": [{ name: "prod-9", id: null }], "creator-1/prod-9": [{ name: "c.png", id: "4", created_at: "2026-10-10T09:00:00Z", metadata: meta(8192) }] },
  })
  const videos = await listLibrary(withVideo, owner, "video")
  check("asked for videos, the store's videos and nothing else, product photos left out", videos.map((f) => f.name).join(",") === "b.webm,clip.mp4", videos.map((f) => f.name))
  check("asked for pictures, no video comes back", !(await listLibrary(withVideo, owner)).some((f) => /\.(mp4|webm)$/.test(f.name)))

  console.log("\nDeleting")
  const removed: string[] = []
  const del = fakeAdmin({}, removed)
  const theirs = await deleteLibraryFile(del, owner, "store-builder-images", "user-2/library/1.png")
  check("someone else's file isn't found, and nothing is removed", !theirs.ok && "status" in theirs && theirs.status === 404 && removed.length === 0)
  /* ROUND 27: their own leaves the list and the OBJECT STAYS, so everything
     already using it keeps drawing (lib/files/assets.ts). The hard delete is
     only left for a database without SQL part 222, and only for a file the
     reference gates agree nothing points at, which this fake admin (no
     tables, no rpc) cannot establish, so it refuses rather than deleting.
     tests/files-retention.test.ts pins the whole lifecycle. */
  const mine = await deleteLibraryFile(del, owner, "store-builder-images", "user-1/files/1.png")
  check("their own is never hard deleted on the spot", !mine.ok && removed.length === 0, { mine, removed })

  console.log("\nWired in")
  const route = read("app/api/files/route.ts")
  check("the API asks who is signed in and passes only their own folders", /shopCaller\(\)/.test(route) && /userId: c\.userId, creatorId: c\.creatorId/.test(route))
  const lib = read("components/files/files-library.tsx")
  check("uploads go to the owner's library folder, without the photo's location details", /\$\{user\.id\}\/files\//.test(lib) && /withoutMetadata\(f\)/.test(lib) && /confirmUpload\("store-builder-images"/.test(lib))
  check("an uploaded picture's address is Storelib's", /mediaUrl\(supabase\.storage/.test(lib))
  /*
    Round R6's chooser, as it is after the merge with round 19's rebuild of
    the same file (tests/files-picker19.test.ts pins the rest): SheetDialog
    (a Radix dialog in the body on a computer, the shared draggable sheet on
    a phone), built on the first open and kept so it closes as it opened.
  */
  const thumb = read("lib/files/thumb.ts")
  check("the chooser is a window on a computer and the shared draggable sheet on a phone", /<SheetDialog/.test(lib) && /phone=\{phone\}/.test(lib) && /const PHONE = "\(max-width: 639px\)"/.test(lib) && /window\.matchMedia\(PHONE\)/.test(lib))
  check("  and it stays mounted through its exit, rather than returning null when closed", /const \[used, setUsed\] = React\.useState\(open\)/.test(lib) && /keepMounted: true/.test(lib) && !/if \(!mounted \|\| !open\) return null/.test(lib))
  check("the list is asked for ahead and kept, and the first screen of pictures warmed on a hover", /export function prefetchLibrary/.test(lib) && /warmFirst/.test(lib) && /const FRESH_MS = 60_000/.test(lib))
  check("  kept per kind, and a video setting's list is the API's videos", /const kept: Record<LibraryKind, LibraryFile\[\] \| null>/.test(lib) && /kind === "image" \? "\/api\/files" : `\/api\/files\?kind=\$\{kind\}`/.test(lib))
  check("tiles load a resized copy, the first screen eagerly, fade in once decoded, at a fixed square", /\/_next\/image\?url=\$\{encodeURIComponent\(url\)\}&w=\$\{w\}&q=\$\{THUMB_QUALITY\}/.test(thumb) && /fileThumb\(file\.url\)/.test(lib) && /loading=\{index < EAGER \? "eager" : "lazy"\}/.test(lib) && /data-\[loaded\]:opacity-100/.test(lib) && /aspect-square/.test(lib))
  /* Round W6: and when the original fails too, the tile asks whether the file is gone from storage (onGone), and leaves the list if so. */
  check("  and a resized copy that is refused falls back to the original", /onError=\{\(e\) => fallBack\(e\.currentTarget, file\.url, \(\) => onGone\(file\)\)\}/.test(lib) && /img\.src = original/.test(lib))
  /* Round H: the frame stored beside it at upload when there is one, else the video's own; and its length in the corner. */
  check("  a video tile is its stored first frame or its own, a clean tile with a film mark under it, and its length", /<VideoFrame file=\{file\}/.test(lib) && /src=\{`\$\{file\.url\}#t=0\.1`\}/.test(lib) && /preload="metadata"/.test(lib) && /data-file-poster=""/.test(lib) && /data-file-duration=""/.test(lib))
  check("  and a pick hands over the copy the tile decoded, for the field to show at once", /return \{ thumb: img\.currentSrc \}/.test(lib) && /onPickRef\.current\?\.\(f\.url, hintFor\(f\)\)/.test(lib))
  check("dropping files anywhere on the library uploads them, with how far each one is", /onDrop=\{\(e\) => \{/.test(lib) && /putObject\(/.test(lib) && /x\.upload\.onprogress/.test(read("lib/files/upload-video.ts")) && /data-file-pending/.test(lib))
  check("  and one file dropped while picking is the one picked", /if \(mode === "pick" && added\.length === 1 && good\.length === 1\) onPickRef\.current\?\.\(added\[0\]\.url, \{ file: good\[0\] \}\)/.test(lib))
  check("each tile has a menu: Use, Download, Copy link, Open in Files, Remove from Files (asked first)", ["\"Use this picture\"", "\"Download\"", "\"Copy link\"", "\"Open in Files\"", "\"Remove from Files\""].every((l) => lib.includes(`label: ${l}`)) && /href: `\/app\/files\?file=\$\{encodeURIComponent\(f\.id\)\}`/.test(lib) && /data-file-confirm/.test(lib))
  check("  shown on hover with a mouse and always on a phone", /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:opacity-0 group-hover\/tile:opacity-100/.test(lib))
  check("Remove goes through the API, which checks the file is the caller's", /api\("\/api\/files", \{ method: "DELETE", body \}\)/.test(lib) && /files: part\.map\(\(f\) => \(\{ bucket: f\.bucket, path: f\.path \}\)\)/.test(lib))
  check("the chooser is drawn into the body, a sheet on a phone", /<SheetDialog/.test(lib) && /phone=\{phone\}/.test(lib) && /const title = kind === "video" \? \(multiple \? "Choose videos" : "Choose a video"\) : "Choose from your files"/.test(lib) && /label=\{title\}/.test(lib))
  check("Open in Files lands on that file's details", /<FilesLibrary mode="manage" kind="media" openId=\{openId\} \/>/.test(read("app/app/files/files-client.tsx")) && /const f = files\.find\(\(x\) => x\.id === openId\)/.test(lib))
  const picker = read("components/website-builder/editor/image-picker.tsx")
  check("every image field offers Choose from your files", /Choose from your files/.test(picker) && /<FilesLibraryChooser/.test(picker))
  check("  inside the field: Upload and Your files in an empty one, a Change menu on a filled one, no text link under it", /data-wb-image-library=""/.test(picker) && /Your files/.test(picker) && /data-wb-image-change=""/.test(picker) && !/underline-offset-2[^"]*"\s*\n\s*data-wb-image-library/.test(picker))
  check("  and a picked picture is on screen at once, from the copy the grid decoded or the file just dropped", /if \(hint\?\.file\) showFile\(hint\.file\)/.test(picker) && /else if \(hint\?\.thumb\) showFile\(hint\.thumb\)/.test(picker))
  const video = read("components/website-builder/editor/controls/video-picker-control.tsx")
  check("the video field chooses from the store's videos inside the field too", /<FilesLibraryChooser kind="video"/.test(video) && /data-video-library=""/.test(video))
  check("the files API lists videos for a video field, and both for Files and a product", /asked === "video" \? "video" : asked === "media" \? "media" : "image"/.test(route))
  check("Files sits under Products in the sidebar", /href: "\/app\/files", label: "Files"/.test(read("components/app/sidebar.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
