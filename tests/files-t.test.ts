/**
 * Round T: Files, every picture a store has uploaded in one place, and the
 * website builder's "Choose from your files".
 *
 *   npx tsx tests/files-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { deleteLibraryFile, listLibrary, ownsFile } from "@/lib/files/library"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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
  const mine = await deleteLibraryFile(del, owner, "store-builder-images", "user-1/files/1.png")
  check("their own is removed", mine.ok && removed[0] === "store-builder-images:user-1/files/1.png", removed)

  console.log("\nWired in")
  const route = read("app/api/files/route.ts")
  check("the API asks who is signed in and passes only their own folders", /shopCaller\(\)/.test(route) && /userId: c\.userId, creatorId: c\.creatorId/.test(route))
  const lib = read("components/files/files-library.tsx")
  check("uploads go to the owner's library folder, without the photo's location details", /\$\{user\.id\}\/files\//.test(lib) && /withoutMetadata\(f\)/.test(lib) && /confirmUpload\("store-builder-images"/.test(lib))
  check("an uploaded picture's address is Storelib's", /mediaUrl\(supabase\.storage/.test(lib))
  /* Round R6: the chooser is SheetDialog (a Radix dialog in the body on a computer, the shared draggable sheet on a phone), kept mounted so it closes as it opened. */
  check("the chooser is a window on a computer and the shared draggable sheet on a phone", /<SheetDialog/.test(lib) && /phone=\{phone\}/.test(lib) && /matchMedia\("\(max-width: 639px\)"\)/.test(lib))
  check("  and it stays mounted through its exit, rather than returning null when closed", /const \[ever, setEver\] = React\.useState\(open\)/.test(lib) && !/if \(!mounted \|\| !open\) return null/.test(lib))
  check("the list is asked for ahead and kept, and the first screen of pictures warmed on a hover", /export function prefetchLibrary/.test(lib) && /warmFirst/.test(lib) && /const FRESH_MS = 60_000/.test(lib))
  check("tiles load a resized copy, the first screen eagerly, fade in once decoded, at a fixed square", /\/_next\/image\?url=\$\{encodeURIComponent\(url\)\}&w=\$\{width\}&q=75/.test(lib) && /loading=\{eager \? "eager" : "lazy"\}/.test(lib) && /loaded \? "opacity-100" : "opacity-0"/.test(lib) && /aspect-square/.test(lib))
  check("  and a resized copy that is refused falls back to the original", /onError=\{\(\) => \(original \? shown\(\) : setOriginal\(true\)\)\}/.test(lib))
  check("dropping files anywhere on the library uploads them, with how far each one is", /onDrop=\{\(e\) => \{/.test(lib) && /x\.upload\.onprogress/.test(lib) && /data-file-pending/.test(lib))
  check("  and one file dropped while picking is the one picked", /if \(mode === "pick" && added\.length === 1 && from\.length === 1\) pickRef\.current\?\.\(added\[0\]\.url, \{ file: from\[0\] \}\)/.test(lib))
  check("each tile has a menu: Use, Download, Copy link, Open in Files, Delete (asked first)", ["\"Use\"", "\"Download\"", "\"Copy link\"", "\"Open in Files\"", "\"Delete\""].every((l) => lib.includes(`label: ${l}`)) && /data-file-confirm/.test(lib))
  check("  shown on hover with a mouse and always on a phone", /\[@media\(hover:hover\)\]:opacity-0 group-hover\/tile:opacity-100/.test(lib))
  check("Delete goes through the API, which checks the file is the caller's", /api\("\/api\/files", \{ method: "DELETE", body: \{ bucket: f\.bucket, path: f\.path \} \}\)/.test(lib))
  check("the chooser is drawn into the body, a sheet on a phone", /<SheetDialog/.test(lib) && /phone=\{phone\}/.test(lib) && /label="Choose from your files"/.test(lib))
  const picker = read("components/website-builder/editor/image-picker.tsx")
  check("every image field offers Choose from your files", /Choose from your files/.test(picker) && /<FilesLibraryChooser/.test(picker))
  check("  inside the field: Upload and Your files in an empty one, a Change menu on a filled one, no text link under it", /data-wb-image-library=""/.test(picker) && /Your files/.test(picker) && /data-wb-image-change=""/.test(picker) && !/underline-offset-2[^"]*"\s*\n\s*data-wb-image-library/.test(picker))
  check("  and a picked picture is on screen at once, from the copy the grid decoded or the file just dropped", /if \(hint\?\.file\) showFile\(hint\.file\)/.test(picker) && /else if \(hint\?\.thumb\) showFile\(hint\.thumb\)/.test(picker))
  const video = read("components/website-builder/editor/controls/video-picker-control.tsx")
  check("the video field chooses from the store's videos inside the field too", /<FilesLibraryChooser kind="video"/.test(video) && /data-video-library=""/.test(video))
  check("the files API lists videos for a video field", /searchParams\.get\("kind"\) === "video"/.test(route))
  check("Files sits under Products in the sidebar", /href: "\/app\/files", label: "Files"/.test(read("components/app/sidebar.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
