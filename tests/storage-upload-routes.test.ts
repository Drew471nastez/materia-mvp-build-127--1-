/**
 * ===========================================================================
 *  UPLOADS GO WHERE THE SERVER SAYS, NOWHERE ELSE
 * ===========================================================================
 * Routes that hand out signed upload places or write with the service role
 * must choose the bucket and the path themselves. A caller who can name the
 * bucket can write into, or create, any bucket in the project.
 *
 *   • /api/storage/signed-upload-url took `bucket` and `path` from the body
 *     and nothing called it. It is gone.
 *   • /api/storage/upload-video took `bucket` and `folder` from the body,
 *     and creates a missing bucket as public. Now product-videos only, and a
 *     folder of plain segments under the user's own id.
 *   • A theme import goes through storage at a path the server built, and
 *     falls back to the form route for a package a function can take, so an
 *     import that worked before still works if storage refuses the upload.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { safeExtension, uploadFolderOf as folderOf, videoBucketOf as targetBucketOf } from "../lib/storage/upload-location"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

check("the open signed upload route is gone", !existsSync(join(root, "app/api/storage/signed-upload-url/route.ts")))

const video = read("app/api/storage/upload-video/route.ts")
check("the video route never reads a bucket straight from the caller", !/bucket = BUCKET_NAME \}/.test(video) && !/formData\.get\("bucket"\) as string \|\| BUCKET_NAME/.test(video))
check("both of its ways in pass the bucket and folder through the checks", (video.match(/videoBucketOf\(/g) ?? []).length === 2 && (video.match(/uploadFolderOf\(/g) ?? []).length === 2)
check("and refuse a location that fails them", (video.match(/Invalid upload location/g) ?? []).length === 2)

check("no bucket means product-videos", targetBucketOf(undefined) === "product-videos" && targetBucketOf("") === "product-videos")
check("product-videos is allowed", targetBucketOf("product-videos") === "product-videos")
check("any other bucket is refused", targetBucketOf("avatars") === null && targetBucketOf("digital-products") === null && targetBucketOf(1) === null)
check("a plain folder is kept", folderOf("lessons/week-1") === "lessons/week-1" && folderOf("") === "")
check("a folder cannot climb out of the user's prefix", folderOf("../other") === null && folderOf("a/../../b") === null && folderOf("a/./b") === null)
check("odd characters and non strings are refused", folderOf("a b") === null && folderOf("a%2F..") === null && folderOf(["x"]) === null && folderOf("x".repeat(121)) === null)
check("leading and doubled slashes collapse to plain segments", folderOf("/a//b/") === "a/b")
check("an extension is only letters and digits", safeExtension("clip.MP4", "mp4") === "mp4" && safeExtension("x.m/../p4", "mp4") === "p4" && safeExtension("noext", "mp4") === "noext" && safeExtension("a.%%%", "mp4") === "mp4")

const incoming = read("app/(storelib)/app/website-builder/incoming.tsx")
check("an import tries storage first", /themes\/import\/upload/.test(incoming) && /sendWithProgress\("PUT", url, file/.test(incoming))
check("a full library is an answer, not a reason to try the other way", /place\.data\.code === LIBRARY_FULL_CODE\) return place/.test(incoming))
check("a package a function can take falls back to the form route", /form\.append\("file", file\)/.test(incoming) && /sendWithProgress\("POST", "\/api\/website-builder\/themes\/import", form/.test(incoming))
check("the fallback stays under the function's body limit", /FORM_IMPORT_MAX_BYTES = 4 \* 1024 \* 1024/.test(incoming))
check("a larger package that storage refused says so instead", /file\.size > FORM_IMPORT_MAX_BYTES\) return said/.test(incoming))

const editor = read("app/(storelib)/app/products/new/product-editor.tsx")
check("publishing an archived product clears the old flag, in its own request", /if \(publish && updatedProduct\.archived === true\)/.test(editor) && /update\(\{ archived: false \}\)/.test(editor))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
