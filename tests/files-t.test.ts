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
  check("the chooser is drawn into the body, a sheet on a phone", /createPortal\(/.test(lib) && /<Modal open/.test(lib))
  const picker = read("components/website-builder/editor/image-picker.tsx")
  check("every image field offers Choose from your files", /Choose from your files/.test(picker) && /<FilesLibraryChooser/.test(picker))
  check("Files sits under Products in the sidebar", /href: "\/app\/files", label: "Files"/.test(read("components/app/sidebar.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
