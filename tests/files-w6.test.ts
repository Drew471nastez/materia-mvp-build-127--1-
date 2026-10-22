/**
 * Round W6: "Choose from your files", from the owner's two screenshots.
 *
 *   1. Never a broken picture: empty and HEIC entries left out, a tile that
 *      will not draw shows its type, a file gone from storage leaves the
 *      list; a small icon drawn at its own size, not stretched.
 *   2. The three dots' menu at its dots, inside the window.
 *   3. Storelib's segmented pills, every tile of a pill's first screen
 *      fetched ahead.
 *   4. The window a little smaller, with Storelib's depth.
 *   5. Several at once: galleries, product photos, Files' Select.
 *   6. The phone sheet a tenth lower.
 *
 * In a browser, measured: node scripts/check-files-picker.mjs
 *
 *   npx tsx tests/files-w6.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileThumb, rawSize, thumbable, thumbSlot, tooSmallFor } from "@/lib/files/thumb"
import { deleteLibraryFiles, listLibrary } from "@/lib/files/library"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const lib = read("components/files/files-library.tsx")
const owner = { userId: "user-1", creatorId: "creator-1" }

type Entry = { name: string; id: string | null; created_at?: string; metadata?: { size: number; mimetype: string } | null }
function fakeAdmin(tree: Record<string, Record<string, Entry[]>>, removed: string[][] = []) {
  return {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: tree[bucket]?.[prefix] ?? [], error: null }),
        /* As the storage client does: encodeURI, which leaves # and ? alone. */
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
  console.log("\n1. Never a broken picture")
  const at = "2026-10-09T10:00:00Z"
  const admin = fakeAdmin({
    "store-builder-images": {
      "user-1": [{ name: "files", id: null }],
      "user-1/files": [
        { name: "ok.png", id: "1", created_at: at, metadata: { size: 2048, mimetype: "image/png" } },
        { name: "cut-off.jpg", id: "2", created_at: at, metadata: { size: 0, mimetype: "image/jpeg" } },
        { name: ".emptyFolderPlaceholder", id: "3", created_at: at, metadata: { size: 0, mimetype: "application/octet-stream" } },
        { name: "phone.jpg", id: "4", created_at: at, metadata: { size: 900000, mimetype: "image/heic" } },
        { name: "no-type.webp", id: "5", created_at: at, metadata: null },
        { name: "a#b.png", id: "6", created_at: at, metadata: { size: 10, mimetype: "image/png" } },
      ],
    },
    "product-images": { "creator-1": [] },
  })
  const files = await listLibrary(admin, owner)
  const names = files.map((f) => f.name)
  check("an empty object (an upload cut off) is left out", !names.includes("cut-off.jpg"), names)
  check("storage's dot placeholder is left out", !names.includes(".emptyFolderPlaceholder"))
  check("a HEIC photo, whatever its name, is left out", !names.includes("phone.jpg"))
  check("a picture whose type was never recorded stays", names.includes("no-type.webp") && names.includes("ok.png"))
  const hash = files.find((f) => f.name === "a#b.png")
  check("a # in a name is part of the address, not where it is cut short", !!hash && hash.url.endsWith("/a%23b.png") && !hash.url.includes("supabase"), hash?.url)

  const icon = "https://storelib.com/media/store-builder-images/u1/files/x.svg"
  check("an SVG is drawn as it is, the optimizer refuses it", !thumbable(icon) && fileThumb(icon).src === icon && !fileThumb(icon).srcSet)
  check("a HEIC is not sent to the optimizer either", !thumbable("https://storelib.com/media/product-images/c1/p/a.heic"))
  check("a photo still is", thumbable("https://storelib.com/media/store-builder-images/u1/files/a.jpg"))
  check("the slot follows THUMB_SIZES: a third of a phone, 180px on a computer", Math.round(thumbSlot(390)) === 133 && thumbSlot(1440) === 180)
  /* A 24px icon, the 384 copy picked on a 3x phone: the optimizer hands back 24px, which the browser reports at 384/132.6 density. */
  const phoneIcon = rawSize({ naturalWidth: 24 / (384 / thumbSlot(390)), naturalHeight: 24 / (384 / thumbSlot(390)), currentSrc: "/_next/image?url=x&w=384&q=88", sizes: "(max-width: 639px) 34vw, 180px" }, 390)
  check("the real pixels behind a srcset copy are its natural size times the density chosen", phoneIcon.w === 24 && phoneIcon.h === 24, phoneIcon)
  check("a plain src is its natural size", rawSize({ naturalWidth: 50, naturalHeight: 40, currentSrc: "https://x/a.png" }, 1440).w === 50)
  check("a 24px icon in a 160px tile is too small to stretch; a 384px photo is not", tooSmallFor({ w: 24, h: 24 }, 160) && !tooSmallFor({ w: 384, h: 256 }, 160) && !tooSmallFor({ w: 0, h: 0 }, 160))
  check("the tile draws a small one at its own size, centred, before it is shown", /img\.dataset\.small = ""/.test(lib) && /img\.style\.margin = "auto"/.test(lib) && /const show = \(\) => \{\s*fitSmall\(img\)/.test(lib))
  check("a hidden pill's pictures are measured when they show", /img\[data-fit-later\]/.test(lib))
  check("a picture that failed is hidden, not drawn at full opacity as a broken picture", /data-\[failed\]:invisible/.test(lib) && !/data-\[failed\]:opacity-0/.test(lib))
  check("its tile shows the file's type instead", /<Placeholder file=\{file\} className="hidden peer-data-\[failed\]:flex" \/>/.test(lib) && /function typeLabel/.test(lib))
  check("a file whose address answers not found leaves the list", /async function objectGone/.test(lib) && /r\.status === 400 \|\| r\.status === 404/.test(lib) && /setFiles\(\(list\) => list\?\.filter\(\(x\) => x\.id !== f\.id\)/.test(lib))
  check("  asked only of Storelib's own addresses", /if \(!isOwnMedia\(url\)\) return false/.test(lib))
  check("tiles are resized at quality 88, sharp for screenshots and logos", /THUMB_QUALITY = 88/.test(read("lib/files/thumb.ts")) && /qualities: \[75, 88, 90\]/.test(read("next.config.mjs")))

  console.log("\n2. The three dots' menu at its dots")
  check("the stand in it is held against is drawn into the body, out of the transformed window", /createPortal\(\s*<DropdownMenuPrimitive\.Trigger asChild>/.test(lib) && /document\.body,\s*\)/.test(lib))
  check("at the dots' end, 4px off, kept inside the window", /align="end"/.test(lib) && /sideOffset=\{4\}/.test(lib) && /collisionBoundary=\{desktopMenu\.bound\}/.test(lib) && /anchor\.closest\('\[data-slot="dialog-content"\]'\)/.test(lib))
  const menu = read("components/ui/responsive-action-menu.tsx")
  check("the shared dropdown takes a boundary and an offset, its defaults unchanged", /sideOffset = 6/.test(menu) && /collisionPadding = 12/.test(menu) && /collisionBoundary=\{collisionBoundary \?\? undefined\}/.test(menu))

  console.log("\n3. Pills")
  check("Storelib's segmented control: a grey track, a white mark", /rounded-xl bg-\[#eef0f2\] p-1/.test(lib) && /data-files-pill-mark=""/.test(lib))
  check("a pill's first screen is fetched ahead, behind the tiles on screen", /index=\{at \?\? rankInSource\.get\(f\.id\) \?\? EAGER\}/.test(lib) && /fetchPriority=\{hidden \? "low" : "auto"\}/.test(lib))

  console.log("\n4 and 6. Sizes")
  check("the window is a little smaller: 720 by at most 700", /h-\[min\(700px,calc\(100dvh-64px\)\)\] w-\[min\(720px,calc\(100vw-48px\)\)\]/.test(lib))
  check("  with Storelib's deeper shadow and scrim", /shadow-\[0_32px_80px_-24px_rgba\(17,24,39,0\.45\)/.test(lib) && /overlayClassName: "bg-\[rgba\(17,24,39,0\.42\)\]"/.test(lib))
  check("the phone sheet is a tenth lower (0.88 to 0.79)", /const SHEET_HEIGHT = "calc\(var\(--vv-h, 100dvh\) \* 0\.79\)"/.test(lib))

  console.log("\n5. Several at once")
  check("the chooser takes multiple, max and onPickMany", /multiple = false,\s*max,/.test(lib) && /onPickMany=\{pickMany\} multiple=\{multiple\} max=\{max\} resetKey=\{round\}/.test(lib))
  check("a press ticks, in order, up to the limit", /if \(limit !== undefined && now\.length >= limit\)/.test(lib) && /setTicked\(\[\.\.\.now, f\.id\]\)/.test(lib))
  check("one bar adds them all", /data-files-add=""/.test(lib) && /Add \{count\} \{count === 1 \? nouns\[0\] : nouns\[1\]\}/.test(lib))
  check("each opening starts with nothing ticked", /if \(open\) setRound\(\(r\) => r \+ 1\)/.test(lib) && /if \(resetKey !== undefined\) setTicked\(\[\]\)/.test(lib))
  check("Files has Select, with Download (a zip) and Delete on several", /data-files-select=""/.test(lib) && /import\("jszip"\)/.test(lib) && /body: \{ files: part\.map/.test(lib))
  const picker = read("components/website-builder/editor/image-picker.tsx")
  check("a list's add field opens the chooser for several", /multiple=\{!!onAddMany && !url\}/.test(picker) && /onPickMany=\{picks => onAddMany\?\.\(picks\.map\(p => p\.url\)\)\}/.test(picker))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("an image gallery setting takes several, up to its max", /onAddMany=\{urls => onChange\(\[\.\.\.list, \.\.\.urls\]\.slice\(0, cap\)\)\}/.test(editor) && /max=\{Math\.max\(0, cap - list\.length\)\}/.test(editor))
  const product = read("app/app/products/new/product-editor.tsx")
  /* Round H3: photos and videos, each up to its own limit (addFromFiles holds each kind to its room). */
  check("a product's photos and videos can come from your files, several at once, up to the limits", /<FilesLibraryChooser[\s\S]{0,120}multiple[\s\S]{0,40}kind="media"[\s\S]{0,40}max=\{Math\.max\(0, MAX_PHOTOS - existingImages - pendingMedia\.length\) \+ Math\.max\(0, MAX_VIDEO_FILES/.test(product) && /onPickMany=\{addFromFiles\}/.test(product))

  console.log("\nDeleting several")
  const removed: string[][] = []
  const del = fakeAdmin({}, removed)
  const theirs = await deleteLibraryFiles(del, owner, [{ bucket: "store-builder-images", path: "user-1/files/a.png" }, { bucket: "store-builder-images", path: "user-2/files/b.png" }])
  check("one that is not theirs refuses the whole request, nothing removed", !theirs.ok && removed.length === 0)
  const mine = await deleteLibraryFiles(del, owner, [
    { bucket: "store-builder-images", path: "user-1/files/a.png" },
    { bucket: "product-images", path: "creator-1/p/b.png" },
    { bucket: "store-builder-images", path: "user-1/hero/c.png" },
  ])
  check("their own are removed, one storage call per bucket", mine.ok && mine.removed === 3 && removed.length === 2 && removed[0].length === 2, removed)
  check("an empty or huge list is refused", !(await deleteLibraryFiles(del, owner, [])).ok && !(await deleteLibraryFiles(del, owner, Array.from({ length: 101 }, () => ({ bucket: "store-builder-images", path: "user-1/files/a.png" })))).ok)
  const route = read("app/api/files/route.ts")
  /* Changed on purpose (round 39): one or several go through removeFromFiles (lib/files/keep.ts), which keeps a file still in use. */
  check("the API takes { files } as well as one", /const many = !!body && Array\.isArray\(body\.files\)/.test(route) && /removeFromFiles\(c\.db, \{ userId: c\.userId, creatorId: c\.creatorId \}, list\)/.test(route))

  console.log("\nCopy")
  const words = [["un", "lock"], ["ele", "vate"], ["seam", "less"], ["power", "ful"], ["effort", "less"], ["super", "charge"], ["trans", "form"]].map((w) => w.join(""))
  const banned = new RegExp(`—|\\b(${words.join("|")})\\b`, "i")
  for (const [name, src] of [["files-library", lib], ["probe", read("scripts/check-files-picker.mjs")]] as const) check(`${name}: no em dashes or banned words`, !banned.test(src), src.match(banned)?.[0])

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
