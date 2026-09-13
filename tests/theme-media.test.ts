/**
 * ===========================================================================
 *  THE CONTENT THAT TRAVELS WITH A THEME
 * ===========================================================================
 * "When a website is exported, can it be with the videos and images as well,
 * so that when uploaded into a different user's website those appear as well."
 *
 * Images already did. Video did not — and what happened instead was worse
 * than dropping it. The collector matched image extensions only, so a hero's
 * background video was never fetched and its URL travelled untouched: a URL
 * pointing at the EXPORTING creator's bucket. The imported site then served
 * its video off a stranger's storage. They paid the bandwidth, and the day
 * they tidied up their own files somebody else's page broke with no way to
 * find out why.
 *
 * So the rule this suite exists to hold is not "carry more things". It is:
 * a media reference either arrives as the importer's own file, or it arrives
 * empty. It never arrives pointing somewhere else.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  MAX_BYTES,
  MAX_TOTAL_MEDIA_BYTES,
  MEDIA_TYPES,
  collectMediaUrls,
  describeMedia,
  extensionOf,
  isMediaUrl,
  mediaTypeFor,
  rewriteMediaUrls,
} from "@/lib/storelib-theme/media"

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
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

// ---------------------------------------------------------------------------
section("What a theme is allowed to carry")
// ---------------------------------------------------------------------------

check(
  "video is on the list, which is the whole point",
  MEDIA_TYPES.mp4?.mime === "video/mp4" &&
    MEDIA_TYPES.webm?.mime === "video/webm" &&
    MEDIA_TYPES.mov?.mime === "video/quicktime",
)
check(
  "and every video type is one the bucket already accepts",
  (() => {
    const bucket = read("supabase/migrations/20260116_store_builder_images_bucket.sql")
    return (["mp4", "webm", "mov"] as const).every((ext) => bucket.includes(MEDIA_TYPES[ext].mime))
  })(),
)
check("pictures still travel", MEDIA_TYPES.png?.kind === "image" && MEDIA_TYPES.jpg?.kind === "image")
check("so do the files a download button points at", MEDIA_TYPES.pdf?.kind === "file")

check(
  "a video may be larger than a picture, because a hero video is",
  MAX_BYTES.video > MAX_BYTES.image,
  `${MAX_BYTES.video} vs ${MAX_BYTES.image}`,
)
check(
  "and the whole bundle is capped, so a theme stays a thing people can send",
  MAX_TOTAL_MEDIA_BYTES > MAX_BYTES.video && MAX_TOTAL_MEDIA_BYTES <= 512 * 1024 * 1024,
)

check(
  "an executable is not media, whatever it is called",
  ["html", "js", "svgz", "exe", "sh", "php", "wasm", ""].every((ext) => !MEDIA_TYPES[ext]),
)

// ---------------------------------------------------------------------------
section("Finding it")
// ---------------------------------------------------------------------------

check(
  "an extension is read past a query string and a fragment",
  extensionOf("https://x.test/a/b/clip.MP4?token=1#t=3") === "mp4" &&
    extensionOf("https://x.test/photo.JPEG") === "jpeg" &&
    extensionOf("https://x.test/nodot") === "",
)
check(
  "a media URL is an http one with a known extension, and nothing else",
  isMediaUrl("https://x.test/a.mp4") &&
    isMediaUrl("http://x.test/a.png?v=2") &&
    !isMediaUrl("/local/a.png") &&
    !isMediaUrl("data:image/png;base64,AAAA") &&
    !isMediaUrl("asset://abc") &&
    !isMediaUrl("https://x.test/page.html") &&
    !isMediaUrl(42),
)

{
  /**
   * Walked as a whole tree, not by looking at known field ids: a section's
   * settings are whatever its schema declared, and a creator's own section
   * can call its video field anything at all.
   */
  const page = {
    sections: [
      {
        id: "hero-1",
        settings: {
          bg_video: "https://one.test/hero.mp4",
          hero_image: "https://one.test/photo.jpg",
          heading: "Not a URL",
          button_url: "https://one.test/somewhere",
        },
        blocks: [
          { settings: { icon: "https://one.test/a.svg", doc: "https://one.test/terms.pdf" } },
          { settings: { nested: [{ deep: "https://one.test/clip.webm" }] } },
        ],
      },
    ],
  }
  const found = collectMediaUrls(page)
  check(
    "every media URL at any depth is found, and nothing that is not one",
    found.size === 5 &&
      found.has("https://one.test/hero.mp4") &&
      found.has("https://one.test/clip.webm") &&
      found.has("https://one.test/terms.pdf") &&
      !found.has("https://one.test/somewhere"),
    [...found].join(" | "),
  )
  check(
    "a video nested inside a block is found, which is where they actually live",
    found.has("https://one.test/clip.webm"),
  )
}

// ---------------------------------------------------------------------------
section("A reference never arrives pointing at somebody else's bucket")
// ---------------------------------------------------------------------------

{
  /** The rule, as arithmetic on the tree rather than as an intention. */
  const page = {
    settings: {
      bg_video: "https://exporter.test/hero.mp4",
      photo: "https://exporter.test/a.jpg",
      heading: "kept",
    },
  }
  /* The video was too big to carry; the picture was not. */
  const map = {
    "https://exporter.test/a.jpg": "asset://aaa",
    "https://exporter.test/hero.mp4": "",
  }
  const out = rewriteMediaUrls(page, map) as typeof page

  check(
    "what travelled became a reference",
    out.settings.photo === "asset://aaa",
  )
  check(
    "what could not travel is EMPTIED, not left as the exporter's URL",
    out.settings.photo !== "https://exporter.test/a.jpg" && out.settings.bg_video === "",
    JSON.stringify(out.settings),
  )
  check(
    "and nothing that was not media is touched",
    out.settings.heading === "kept",
  )
}

check(
  "an empty replacement is a replacement, not a miss",
  rewriteMediaUrls({ a: "x" }, { x: "" }) as Record<string, string> &&
    (rewriteMediaUrls({ a: "x" }, { x: "" }) as { a: string }).a === "",
)
check(
  "a value with no entry in the map is left exactly as it was",
  (rewriteMediaUrls({ a: "untouched" }, { other: "" }) as { a: string }).a === "untouched",
)

// ---------------------------------------------------------------------------
section("The export")
// ---------------------------------------------------------------------------

{
  const exportRoute = read("app/api/website-builder/themes/[installId]/export/route.ts")

  check(
    "it collects every kind of media, not only images",
    /collectMediaUrls\(settings, collectMediaUrls\(exportPages\)\)/.test(exportRoute) &&
      !/function collectImageUrls/.test(exportRoute),
  )
  check(
    "anything it could not carry is cleared rather than kept",
    /for \(const url of skipped\) urlToRef\[url\] = ""/.test(exportRoute),
  )
  check(
    "size is checked from the header before the body is read where it can be",
    /content-length/.test(exportRoute) && /declared > MAX_BYTES\[type\.kind\]/.test(exportRoute),
  )
  check(
    "and again after, because a header is a claim",
    /buf\.byteLength > MAX_BYTES\[type\.kind\]/.test(exportRoute),
  )
  check(
    "there is a budget across the whole package, not only per file",
    /mediaBytes \+ buf\.byteLength > MAX_TOTAL_MEDIA_BYTES/.test(exportRoute),
  )
  check(
    "media is fetched one at a time, not all at once into one function's memory",
    /for \(const url of Array\.from\(urls\)\.sort\(\)\)/.test(exportRoute) &&
      !/await Promise\.all\(Array\.from\(urls\)/.test(exportRoute),
  )
  check(
    "the download says what came with it",
    /"X-Storelib-Media": describeMedia\(carried\)/.test(exportRoute),
  )
}

// ---------------------------------------------------------------------------
section("The import, which is reading a file a stranger sent")
// ---------------------------------------------------------------------------

{
  const importRoute = read("app/api/website-builder/themes/import/route.ts")

  check(
    "the served type comes from the extension table, never from the package's own manifest",
    /const type = MEDIA_TYPES\[ext\]/.test(importRoute) &&
      /contentType: type\.mime/.test(importRoute) &&
      !/contentType: asset\.mime_type/.test(importRoute),
  )
  check(
    "an extension that is not in the table is refused",
    /if \(!type\) continue/.test(importRoute),
  )
  check(
    "every asset is written under the importing user's own prefix",
    /\$\{user\.id\}\/imported\//.test(importRoute),
  )
  check(
    "a reference is cleared BEFORE the upload is attempted, so every way out is safe",
    (() => {
      const loop = importRoute.slice(importRoute.indexOf("for (const [hash, asset] of Object.entries(pkg.assets))"))
      const cleared = loop.indexOf('refToUrl[`asset://${hash}`] = ""')
      const uploaded = loop.indexOf("admin.storage.from(BUCKET).upload")
      return cleared > 0 && uploaded > 0 && cleared < uploaded
    })(),
  )
  check(
    "the legacy path clears its local paths the same way",
    /localToRemote\[`images\/\$\{entry\.name\}`\] = ""/.test(importRoute),
  )
  check(
    "assets are stored one at a time, so a package of videos does not exhaust the function",
    !/await Promise\.all\(Object\.entries\(pkg\.assets\)/.test(importRoute) &&
      !/await Promise\.all\(entries\.map/.test(importRoute),
  )
  check(
    "and the reply says what arrived",
    /media: describeMedia\(imported\)/.test(importRoute),
  )
}

// ---------------------------------------------------------------------------
section("Saying what happened")
// ---------------------------------------------------------------------------

check(
  "counts read as a sentence",
  describeMedia({ image: 12, video: 1 }) === "12 pictures and 1 video" &&
    describeMedia({ video: 2 }) === "2 videos" &&
    describeMedia({ image: 1, video: 1, file: 3 }) === "1 picture, 1 video and 3 files",
  describeMedia({ image: 1, video: 1, file: 3 }),
)
check("and an empty theme says so rather than nothing", describeMedia({}) === "nothing")

check(
  "one table is read by both halves, so they cannot drift apart",
  (() => {
    const ex = read("app/api/website-builder/themes/[installId]/export/route.ts")
    const im = read("app/api/website-builder/themes/import/route.ts")
    return (
      /from "@\/lib\/storelib-theme\/media"/.test(ex) &&
      /from "@\/lib\/storelib-theme\/media"/.test(im) &&
      !/const extToMime = /.test(ex)
    )
  })(),
)

check(
  "the media type is never taken from a value the package author wrote",
  !/mime_type:\s*asset\.mime_type/.test(read("app/api/website-builder/themes/import/route.ts")),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
