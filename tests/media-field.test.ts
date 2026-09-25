/**
 * ===========================================================================
 *  THE UPLOAD FIELD'S RULES
 * ===========================================================================
 * What components/website-builder/editor/image-picker.tsx will take, and what
 * it says when it will not, as rules. The field itself is driven in a browser
 * against a fake storage endpoint by scripts/check-media-field.mjs.
 *
 * The types are the store-builder-images bucket's own (supabase/migrations/
 * 20260929_upload_safety.sql): a file the bucket would refuse after the upload
 * is refused here before it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { MAX_IMAGE_BYTES, MAX_STORED_IMAGE_BYTES, MAX_VIDEO_BYTES, checkMediaFile, pastedLink } from "@/components/website-builder/editor/image-picker"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const said = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + said)
    console.log(`  FAIL  ${label}${said}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MB = 1024 * 1024
const said = (r: ReturnType<typeof checkMediaFile>) => ("error" in r ? r.error : `ok ${r.ext}`)

function main() {
  console.log("\nPictures")
  check("a JPG, PNG, WebP, GIF or AVIF is taken",
    ["photo.jpg:image/jpeg", "shot.PNG:image/png", "a.webp:image/webp", "b.gif:image/gif", "c.avif:image/avif"].every((f) => {
      const [name, type] = f.split(":")
      return checkMediaFile({ name, type, size: 200_000 }, "image").ok
    }))
  check("a .jpeg goes up as .jpg", said(checkMediaFile({ name: "IMG_1.JPEG", type: "image/jpeg", size: 1 }, "image")) === "ok jpg")
  check("an SVG is refused before it is sent, because the bucket would refuse it after",
    said(checkMediaFile({ name: "logo.svg", type: "image/svg+xml", size: 900 }, "image")) === "Use a JPG, PNG, WebP, GIF or AVIF picture.")
  check("so is a file whose name and type disagree", !checkMediaFile({ name: "notes.txt", type: "image/png", size: 10 }, "image").ok && !checkMediaFile({ name: "x.png", type: "text/plain", size: 10 }, "image").ok)
  check("a photo up to 25 MB may be chosen, because it is resized before it goes",
    checkMediaFile({ name: "big.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES }, "image").ok && MAX_IMAGE_BYTES === 25 * MB && MAX_STORED_IMAGE_BYTES === 10 * MB)
  check("and a bigger one says how big it is, in words",
    said(checkMediaFile({ name: "huge.jpg", type: "image/jpeg", size: 31.4 * MB }, "image")) === "That picture is 31.4 MB. Pictures can be up to 25 MB.")

  console.log("\nVideos")
  check("an MP4, MOV or WebM is taken", ["a.mp4:video/mp4", "b.mov:video/quicktime", "c.webm:video/webm"].every((f) => {
    const [name, type] = f.split(":")
    return checkMediaFile({ name, type, size: 5 * MB }, "video").ok
  }))
  check("a picture is not a video", said(checkMediaFile({ name: "a.jpg", type: "image/jpeg", size: 10 }, "video")) === "Use an MP4, MOV or WebM video.")
  check("up to 50 MB, and past it says so",
    checkMediaFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES }, "video").ok &&
      said(checkMediaFile({ name: "a.mp4", type: "video/mp4", size: 51 * MB }, "video")) === "That video is 51 MB. Videos can be up to 50 MB.")

  console.log("\nA link pasted or dropped")
  check("a web address is taken as it is", pastedLink(" https://example.com/a.jpg ") === "https://example.com/a.jpg" && pastedLink("http://x.test/p.png") === "http://x.test/p.png")
  check("anything else is not a link", pastedLink("javascript:alert(1)") === null && pastedLink("data:image/png;base64,AAAA") === null && pastedLink("two words") === null && pastedLink("") === null)
  check("and a link as long as a page is not either", pastedLink(`https://example.com/${"a".repeat(2100)}`) === null)

  console.log("\nWhat the field does with them")
  const picker = read("components/website-builder/editor/image-picker.tsx")
  check("a photo is resized in the browser before it is sent", /compressImage\(file, COMPRESS_PROFILES\["store-builder-images"\]\)/.test(picker))
  check("into the user's own folder, under a key never used before", /const filePath = `\$\{user\.id\}\/\$\{folder\}\/\$\{Date\.now\(\)\}-\$\{tail\(\)\}\.\$\{ext\}`/.test(picker) && /upsert: false/.test(picker))
  check("a refusal or a failed upload is said under the field, not in a toast that goes", /role="alert"/.test(picker) && !/from "sonner"/.test(picker) && !/\btoast[.(]/.test(picker))
  check("and a failed upload can be tried again with the same file", /retry: file/.test(picker) && />\s*Try again\s*</.test(picker))
  check("it is reached from the keyboard, and Enter on a filled one replaces it", /tabIndex=\{0\}/.test(picker) && /if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); pick\(\) \}/.test(picker))
  check("a file or a link can be pasted into it", /const onPaste = \(e: React\.ClipboardEvent\) =>/.test(picker) && (picker.match(/onPaste=\{onPaste\}/g) ?? []).length === 2)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
