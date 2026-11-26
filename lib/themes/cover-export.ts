/**
 * ===========================================================================
 *  EVERY TEMPLATE'S PICTURES AS PNG, IN ONE ZIP, FOR PINTEREST (round 30)
 * ===========================================================================
 * The owner: "an admin place where I can download ALL template cover
 * images (desktop and phone, plus SEO images) as PNGs in one ZIP". The
 * button is on /admin/themes; the file is GET /api/admin/themes/covers,
 * which asks for the admin cookie before anything else.
 *
 * WHAT IS IN IT. For each template in CODE_TEMPLATES, in a folder named by
 * its address on storelib.com:
 *
 *   <name>-desktop.png        the whole home page on a computer, 1200 wide
 *   <name>-phone.png          the whole home page on a phone, 390 wide
 *   <name>-card.png           the top of the page at 4:5 (the marketplace card)
 *   <name>-hero.png           the top of the page at 1200 by 750
 *   <name>-phone-screen.png   the phone's first screen, 390 by 844
 *   <name>-share.png          the 1200 by 630 share card
 *
 * <name> is the file stem the SEO pictures use (themeImageStem): what the
 * template is, then its name, so a pin's file says what it shows.
 *
 * MADE ON DEMAND, SENT AS IT IS MADE. Nothing is stored: each picture is
 * read (from the deployment's own public files, or over HTTP from the same
 * site when the function does not carry them), turned into PNG one at a
 * time and written into the zip as the download goes, so the function never
 * holds the whole archive and the 4.5 MB limit on a function's answer, which
 * holds for an answer sent at once, does not apply. The zip is the plainest
 * kind (stored, no compression: PNG is compressed already), written by hand
 * like lib/sites/zip.ts.
 */
import { CODE_TEMPLATES, templateCoverPath, templatePhonePath } from "./marketplace-shared"
import { CARD_WIDTHS, themeImagePath, themeImageStem } from "./theme-seo"

export interface CoverExportEntry {
  /** Where it goes in the zip. */
  name: string
  /** The public path it is read from. */
  source: string
}

/** Every picture of every template, in the order of the marketplace. */
export function coverExportEntries(templates = CODE_TEMPLATES): CoverExportEntry[] {
  return templates.flatMap((t) => {
    const stem = themeImageStem(t.slug)
    const dir = `${t.slug}/${stem}`
    return [
      { name: `${dir}-desktop.png`, source: templateCoverPath(t.template) },
      { name: `${dir}-phone.png`, source: templatePhonePath(t.template) },
      { name: `${dir}-card.png`, source: themeImagePath(t.slug, `card-${CARD_WIDTHS[CARD_WIDTHS.length - 1]}`) },
      { name: `${dir}-hero.png`, source: themeImagePath(t.slug, "hero") },
      { name: `${dir}-phone-screen.png`, source: themeImagePath(t.slug, "phone") },
      { name: `${dir}-share.png`, source: themeImagePath(t.slug, "og") },
    ]
  })
}

/** The download's own file name: the day it was made. */
export function coverExportFileName(now = new Date()): string {
  return `storelib-template-covers-${now.toISOString().slice(0, 10)}.zip`
}

/* ── The zip, written as it goes ──────────────────────────────────────── */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/* 2026-01-01 as DOS date, 00:00: fixed, so the same pictures make the same bytes. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const DOS_TIME = 0

function header(sig: number, size: number): DataView {
  const v = new DataView(new ArrayBuffer(size))
  v.setUint32(0, sig, true)
  return v
}

/**
 * A stored zip of `entries`, each read by `load` when its turn comes. A
 * picture that cannot be read is left out and named in a NOT-INCLUDED.txt
 * at the end, so one missing file never loses the other two hundred.
 */
export function zipStream(entries: CoverExportEntry[], load: (e: CoverExportEntry) => Promise<Uint8Array>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const central: Uint8Array[] = []
  const missing: string[] = []
  let offset = 0
  let i = 0
  let done = false

  const file = (name: string, data: Uint8Array): Uint8Array[] => {
    const n = enc.encode(name)
    const crc = crc32(data)
    const local = header(0x04034b50, 30)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) /* the name is UTF-8 */
    local.setUint16(8, 0, true)
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, n.length, true)
    local.setUint16(28, 0, true)
    const dir = header(0x02014b50, 46)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint16(12, DOS_TIME, true)
    dir.setUint16(14, DOS_DATE, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, n.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), n)
    offset += 30 + n.length + data.length
    return [new Uint8Array(local.buffer), n, data]
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) return
      while (i < entries.length) {
        const e = entries[i++]
        const data = await load(e).catch(() => null)
        if (!data) {
          missing.push(`${e.name} (from ${e.source})`)
          continue
        }
        for (const part of file(e.name, data)) controller.enqueue(part)
        return
      }
      if (missing.length) for (const part of file("NOT-INCLUDED.txt", enc.encode(`These could not be read when the zip was made:\n${missing.join("\n")}\n`))) controller.enqueue(part)
      const count = central.length / 2
      const size = central.reduce((s, b) => s + b.length, 0)
      for (const part of central) controller.enqueue(part)
      const end = header(0x06054b50, 22)
      end.setUint16(8, count, true)
      end.setUint16(10, count, true)
      end.setUint32(12, size, true)
      end.setUint32(16, offset, true)
      controller.enqueue(new Uint8Array(end.buffer))
      done = true
      controller.close()
    },
  })
}
