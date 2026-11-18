/**
 * Email pictures made by /api/email/img (lib/email-campaigns/inbox-image):
 * which requests it takes, the width each drawn size gets, and the picture
 * itself, made by sharp from real WebP and PNG files: a see-through logo
 * stays see-through (Outlook drew it on black when it was a JPEG), an opaque
 * photo is a JPEG, nothing is enlarged, and nothing is a WebP.
 */
import sharp from "sharp"

import { INBOX_WIDTHS, inboxImageUrl, inboxWidthFor, readInboxRequest } from "@/lib/email-campaigns/inbox-image"
import { renderInboxImage } from "@/lib/email-campaigns/inbox-image-render"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

// Changed on purpose (round AW): Storelib's own storage project; the optimizer no longer fetches from any other *.supabase.co (next.config.mjs OWN_STORAGE_HOSTS).
const STORE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public"
const q = (u: string, w: number | string) => new URLSearchParams({ u, w: String(w) })

async function main() {
  console.log("\nWhich requests it takes")
  check("a stored upload at one of the widths", readInboxRequest(q(`${STORE}/p/a.webp`, 192)).ok)
  check("not a width outside the set", !readInboxRequest(q(`${STORE}/p/a.webp`, 193)).ok && !readInboxRequest(q(`${STORE}/p/a.webp`, "x")).ok)
  check("not http", !readInboxRequest(q("http://skgtqglupjcnfhfscink.supabase.co/a.png", 192)).ok)
  check("not a host the site's resizer does not take", !readInboxRequest(q("https://example.com/a.png", 192)).ok)
  check("not an internal address", !readInboxRequest(q("https://169.254.169.254/latest/meta-data", 192)).ok && !readInboxRequest(q("https://localhost/a.png", 192)).ok)
  check("not an SVG", !readInboxRequest(q(`${STORE}/l/logo.svg`, 192)).ok)
  check("not a missing or very long address", !readInboxRequest(new URLSearchParams({ w: "192" })).ok && !readInboxRequest(q(`${STORE}/${"a".repeat(2100)}.png`, 192)).ok)

  console.log("\nThe width each drawn size is made at")
  const table: Array<[number, number]> = [[28, 96], [32, 96], [40, 128], [56, 192], [64, 192], [96, 192], [120, 256], [200, 400], [260, 640], [520, 1080], [900, 1200]]
  check("3x up to 64px, 2x above, from the fixed set, at most 1200", table.every(([d, w]) => inboxWidthFor(d) === w), table.map(([d]) => [d, inboxWidthFor(d)]))
  check("every width it asks for is one the route makes", table.every(([d]) => (INBOX_WIDTHS as readonly number[]).includes(inboxWidthFor(d))))
  check("the address is absolute on the site", inboxImageUrl("https://storelib.com/", `${STORE}/p/a.webp`, 28) === `https://storelib.com/api/email/img?u=${encodeURIComponent(`${STORE}/p/a.webp`)}&w=96`)
  check("and there is none for a host it does not take", inboxImageUrl("https://storelib.com", "https://example.com/a.png", 28) === null)

  console.log("\nThe picture")
  /* A see-through logo, stored as WebP the way uploads are: a purple disc on nothing. */
  const disc = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="240" fill="#7c3aed"/></svg>`)
  const logoWebp = await sharp(disc).webp({ quality: 90 }).toBuffer()
  const logo = await renderInboxImage(logoWebp, 128)
  const lm = await sharp(logo.body).metadata()
  const corner = await sharp(logo.body).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
  const centre = await sharp(logo.body).ensureAlpha().extract({ left: 64, top: 64, width: 1, height: 1 }).raw().toBuffer()
  check("a see-through WebP logo comes out a PNG", logo.type === "image/png" && lm.format === "png", lm.format)
  check("its corner is still see-through, not black", corner[3] === 0, [...corner])
  check("its middle is still its purple", Math.abs(centre[0] - 0x7c) < 6 && Math.abs(centre[1] - 0x3a) < 6 && Math.abs(centre[2] - 0xed) < 6 && centre[3] === 255, [...centre])
  check("at the width asked", lm.width === 128, lm.width)

  /* An opaque photo, stored as WebP. */
  const photoWebp = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 200, g: 120, b: 60 } } }).webp({ quality: 90 }).toBuffer()
  const photo = await renderInboxImage(photoWebp, 640)
  const pm = await sharp(photo.body).metadata()
  check("an opaque WebP photo comes out a JPEG", photo.type === "image/jpeg" && pm.format === "jpeg", pm.format)
  check("resized to the width, keeping its shape", pm.width === 640 && pm.height === 400, [pm.width, pm.height])

  /* A WebP with an alpha channel but nothing see-through is still a photo. */
  const opaqueAlpha = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).webp().toBuffer()
  check("an alpha channel with nothing see-through is a JPEG", (await renderInboxImage(opaqueAlpha, 192)).type === "image/jpeg")

  /* Never enlarged: a 300px upload asked at 1200 stays 300. */
  const small = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer()
  const kept = await sharp((await renderInboxImage(small, 1200)).body).metadata()
  check("a small upload is never enlarged", kept.width === 300, kept.width)

  /* Upright from its EXIF: a 200x100 picture marked as turned 90 degrees comes out 100 wide before sizing. */
  const turned = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#336699" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const up = await sharp((await renderInboxImage(turned, 1200)).body).metadata()
  check("a phone photo's turn is applied", up.width === 100 && up.height === 200, [up.width, up.height])

  /* Light enough for an inbox at this quality. */
  const size = { photo: photo.body.length, logo: logo.body.length }
  check("small enough for an inbox (logo under 20 KB, a flat photo under 40 KB)", size.logo < 20_000 && size.photo < 40_000, size)

  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
