/**
 * ===========================================================================
 *  DOWNLOAD COVERS: EVERY TEMPLATE'S PICTURES AS PNG, ADMIN ONLY (round 30)
 * ===========================================================================
 * The owner: "an admin place where I can download ALL template cover images
 * (desktop and phone, plus SEO images) as PNGs in one ZIP", for Pinterest.
 *
 *   what      lib/themes/cover-export.ts: six pictures for each template in
 *             CODE_TEMPLATES (desktop, phone, card, hero, phone screen,
 *             share card), each from a file that is there, named for what the
 *             template is, in a folder by its address, all .png
 *   zip       zipStream writes a zip any reader opens: the real pictures as
 *             PNG through sharp, a missing one listed in NOT-INCLUDED.txt and
 *             the rest still there
 *   private   GET /api/admin/themes/covers asks for the admin cookie before
 *             anything (requireAdmin, the same gate as every admin route),
 *             answers no-store and noindex, keeps nothing; the button is on
 *             /admin/themes, which checks the cookie on the server; nothing
 *             public links to it and robots.txt keeps /api/ out
 *
 *   npx tsx tests/theme-cover-export.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import sharp from "sharp"

import { CODE_TEMPLATES } from "../lib/themes/marketplace-shared"
import { coverExportEntries, coverExportFileName, crc32, zipStream } from "../lib/themes/cover-export"
import { themeImageStem } from "../lib/themes/theme-seo"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = []
  const r = stream.getReader()
  for (;;) {
    const { done, value } = await r.read()
    if (done) break
    parts.push(value)
  }
  return Buffer.concat(parts)
}

async function main() {
  console.log("\nWhat is in the zip\n")
  const entries = coverExportEntries()
  check(`six pictures for each of the ${CODE_TEMPLATES.length} templates`, entries.length === CODE_TEMPLATES.length * 6, entries.length)
  check("desktop and phone covers, card, hero, phone screen and share card for each", CODE_TEMPLATES.every((t) => ["desktop", "phone", "card", "hero", "phone-screen", "share"].every((k) => entries.some((e) => e.name === `${t.slug}/${themeImageStem(t.slug)}-${k}.png`))))
  check("every name is a .png in a folder named by the template's address, no two the same", entries.every((e) => /^[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(e.name)) && new Set(entries.map((e) => e.name)).size === entries.length)
  const missing = entries.filter((e) => !existsSync(join("public", e.source))).map((e) => e.source)
  check("every picture is read from a file that is there", missing.length === 0, missing.slice(0, 8))
  check("the download is named for the day", coverExportFileName(new Date("2026-11-26T10:00:00Z")) === "storelib-template-covers-2026-11-26.zip")
  check("CRC-32 is the standard one", crc32(new TextEncoder().encode("123456789")) === 0xcbf43926)

  console.log("\nA zip any reader opens\n")
  const sample = entries.filter((e) => e.name.startsWith(`${CODE_TEMPLATES[0].slug}/`)).slice(0, 3)
  const withGap = [...sample, { name: "nowhere/missing.png", source: "/themes/materia/not-there.webp" }]
  const load = async (e: { source: string }) => new Uint8Array(await sharp(readFileSync(join("public", e.source))).png().toBuffer())
  const zip = await JSZip.loadAsync(await bytesOf(zipStream(withGap, load)))
  const names = Object.keys(zip.files)
  check("the pictures are in it under their names, and what could not be read is listed instead", sample.every((e) => names.includes(e.name)) && names.includes("NOT-INCLUDED.txt") && !names.includes("nowhere/missing.png"), names)
  const first = await zip.file(sample[0].name)!.async("nodebuffer")
  const meta = await sharp(first).metadata()
  check("each file is a real PNG at the picture's own size", meta.format === "png" && (meta.width ?? 0) >= 390, meta)
  check("NOT-INCLUDED.txt says which file and from where", /nowhere\/missing\.png \(from \/themes\/materia\/not-there\.webp\)/.test(await zip.file("NOT-INCLUDED.txt")!.async("string")))

  console.log("\nAdmin only, nothing public\n")
  const route = read("app/api/admin/themes/covers/route.ts")
  const gate = route.indexOf("await requireAdmin()")
  check("the route asks for the admin cookie first, before it reads anything", gate > 0 && gate < route.indexOf("coverExportEntries()") && gate < route.indexOf("createAdminClient()") && gate < route.indexOf("readFile(") && /if \(denied\) return denied/.test(route))
  check("  the only handler is GET, and it says no-store and noindex", /export async function GET\(/.test(route) && !/export async function (POST|PUT|DELETE|PATCH)/.test(route) && /"Cache-Control": "private, no-store"/.test(route) && /"X-Robots-Tag": "noindex, nofollow"/.test(route))
  check("  streamed as it is made, nothing stored or uploaded", /new NextResponse\(zipStream\(entries, load\)/.test(route) && !/storage|upload|createSignedUrl|writeFile/.test(route))
  check("  a download, named, of a zip", /"Content-Type": "application\/zip"/.test(route) && /attachment; filename=/.test(route))
  check("  recorded in the admin audit trail", /recordAdminAction\(createAdminClient\(\), \{ action: "theme_covers_downloaded"/.test(route))
  check("  sharp loaded in the handler, not for every admin route", !/^import sharp/m.test(route) && /await import\("sharp"\)/.test(route))
  const admin = read("app/(storelib)/admin/themes/themes-admin.tsx")
  check("/admin/themes has Download covers, a link to the route", /href="\/api\/admin\/themes\/covers"/.test(admin) && />\s*Download covers\s*</.test(admin))
  check("/admin/themes checks the cookie on the server before drawing", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(read("app/(storelib)/admin/themes/page.tsx")))
  const publicFiles = ["app/(storelib)/(marketing)/themes/page.tsx", "app/(storelib)/(marketing)/themes/[slug]/page.tsx", "app/(storelib)/(marketing)/themes/themes-marketplace.tsx", "components/themes/marketplace-card.tsx", "components/themes/marketplace-header.tsx", "lib/themes/theme-seo.ts"]
  check("no public page names the route", publicFiles.every((f) => !read(f).includes("/api/admin/themes/covers")))
  check("robots.txt keeps /api and /admin out of search (PRIVATE_ROUTES)", /PRIVATE_ROUTES: readonly string\[\] = \[\s*"admin",\s*"api",/.test(read("lib/seo/indexing.ts")))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
