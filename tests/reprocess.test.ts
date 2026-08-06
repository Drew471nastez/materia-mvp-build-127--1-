/**
 * ===========================================================================
 *  THE BACKFILL ACTUALLY REMOVES THE BARS
 * ===========================================================================
 * tests/letterbox.test.ts proves the geometry against synthetic pixel arrays.
 * This proves the thing that ships: a real encoded JPEG, through sharp, through
 * `reprocessImage`, decoded again, with the output inspected for the padding it
 * was supposed to remove.
 *
 * The fixture is the reported listing, rebuilt to its measurements — 1280×720
 * with 120 rows of uniform light grey above the artwork and 120 below — because
 * that file is the reason any of this exists and a test that does not include
 * it is testing something else.
 *
 * Run with:  npm run test:push
 */

import sharp from "sharp"

import { reprocessImage } from "@/lib/images/reprocess"
import { CARD_W, CARD_H } from "@/lib/images/variants"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

/** Noise, so the "artwork" is never mistaken for a flat area. */
function artwork(w: number, h: number): Buffer {
  const px = Buffer.alloc(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = (i * 7) % 200
    px[i * 3 + 1] = (i * 13) % 200
    px[i * 3 + 2] = (i * 29) % 200
  }
  return px
}

/** A photograph pasted onto a taller canvas of one colour — the bug, as a file. */
async function letterboxed(w: number, h: number, bar: number, colour: { r: number; g: number; b: number }) {
  const art = await sharp(artwork(w, h - bar * 2), {
    raw: { width: w, height: h - bar * 2, channels: 3 },
  })
    .png()
    .toBuffer()
  return sharp({ create: { width: w, height: h, channels: 3, background: colour } })
    .composite([{ input: art, top: bar, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer()
}

/** Row means, so a bar shows up as a run of near-identical values. */
async function rowMeans(buf: Buffer) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const means: number[] = []
  for (let y = 0; y < info.height; y++) {
    let sum = 0
    for (let x = 0; x < info.width; x++) sum += data[(y * info.width + x) * info.channels]
    means.push(sum / info.width)
  }
  return means
}

async function main() {
  console.log("\nReprocessing a stored photograph: the bars come off\n")

  // ── The reported listing, rebuilt ─────────────────────────────────────────
  const source = await letterboxed(1280, 720, 120, { r: 241, g: 241, b: 241 })
  const meta = await sharp(source).metadata()
  check("fixture is 1280×720", meta.width === 1280 && meta.height === 720)

  const out = await reprocessImage(source)
  check(
    "the padding is detected",
    out.trimmed,
    "        Undetected, the backfill would faithfully re-encode the bars and\n" +
      "        every card would look exactly as it does now.",
  )

  // The large variant keeps the photograph's own shape — which, after the trim,
  // is 1280×480, not 1280×720.
  const largeMeta = await sharp(out.large.body).metadata()
  const ratio = (largeMeta.width ?? 0) / (largeMeta.height ?? 1)
  check(
    `the large variant has the artwork's aspect, not the canvas's (${largeMeta.width}×${largeMeta.height})`,
    Math.abs(ratio - 1280 / 480) < 0.06,
    `        got ${ratio.toFixed(3)}, want ${(1280 / 480).toFixed(3)} (1280×480 artwork)\n` +
      `        720-tall would mean the bars are still in it.`,
  )

  // And no flat rows survive at either end.
  const means = await rowMeans(out.large.body)
  const barish = (v: number) => v > 225
  check(
    "no pale bar left at the top of the large variant",
    !barish(means[0]) && !barish(means[1]),
    `        first rows: ${means.slice(0, 3).map((m) => m.toFixed(1)).join(", ")}`,
  )
  check(
    "no pale bar left at the bottom of the large variant",
    !barish(means[means.length - 1]) && !barish(means[means.length - 2]),
    `        last rows: ${means.slice(-3).map((m) => m.toFixed(1)).join(", ")}`,
  )

  // ── The thumb is the card's frame, exactly ────────────────────────────────
  const thumbMeta = await sharp(out.thumb.body).metadata()
  check(
    `the thumb is the card's 3:4 (${thumbMeta.width}×${thumbMeta.height})`,
    Math.abs((thumbMeta.width ?? 0) / (thumbMeta.height ?? 1) - CARD_W / CARD_H) < 0.005,
  )
  const tMeans = await rowMeans(out.thumb.body)
  check(
    "and it has no bar either",
    !barish(tMeans[0]) && !barish(tMeans[tMeans.length - 1]),
    `        first=${tMeans[0].toFixed(1)} last=${tMeans[tMeans.length - 1].toFixed(1)}\n` +
      `        A thumb cropped from the untrimmed frame centres on the padding.`,
  )
  check("both variants are WebP", out.contentType === "image/webp")

  // ── An ordinary photograph is not touched ─────────────────────────────────
  const plain = await sharp(artwork(1200, 1600), { raw: { width: 1200, height: 1600, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer()
  const plainOut = await reprocessImage(plain)
  check(
    "a photograph with no padding is not trimmed",
    !plainOut.trimmed,
    "        This is the expensive mistake — cutting into a real photograph on\n" +
      "        the most ordinary kind of listing there is.",
  )
  const plainLarge = await sharp(plainOut.large.body).metadata()
  check(
    `and it keeps its own shape (${plainLarge.width}×${plainLarge.height})`,
    Math.abs((plainLarge.width ?? 0) / (plainLarge.height ?? 1) - 1200 / 1600) < 0.02,
  )

  // ── Pillarboxing, the same thing sideways ─────────────────────────────────
  const side = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .composite([
      {
        input: await sharp(artwork(600, 1000), { raw: { width: 600, height: 1000, channels: 3 } }).png().toBuffer(),
        top: 0,
        left: 200,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer()
  const sideOut = await reprocessImage(side)
  check("vertical bars are removed too", sideOut.trimmed)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) {
    console.log("Failed:")
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
}

void main()
