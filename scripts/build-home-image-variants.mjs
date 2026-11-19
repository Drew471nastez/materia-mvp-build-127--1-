/**
 * ===========================================================================
 *  SMALLER COPIES OF THE HOME PAGE'S MOCK PICTURES (landing round 19)
 * ===========================================================================
 * The showcase and Everything mocks draw photographs a few times smaller than
 * the files are: on a 390px phone at 3x, stz-hero.webp (1800 x 800) is shown
 * 268px wide, the store's product shots (480 x 640) 65px, the LUT still
 * (720 x 405) 109px. A browser decodes the whole file whatever it draws, so a
 * phone held about 10 MP of pixels it never showed (scripts/check-marketing-
 * mobile-perf.mjs, IMAGES).
 *
 * This writes each picture again at the widths below, the same crop and the
 * same picture, as `<name>-<width>.webp` next to the original. The pages
 * offer them with srcset and sizes (showcase-mocks/frame.tsx PIC_SETS,
 * everything-in-one-place.tsx, ebook-cover.tsx), so a browser takes the
 * smallest one that is still sharp at its own width and density, and a large
 * screen still gets the original.
 *
 *   node scripts/build-home-image-variants.mjs          writes the missing ones
 *   FORCE=1 node scripts/build-home-image-variants.mjs  writes them all again
 *
 * Widths are chosen from the sizes measured at 390, 768, 1024, 1440 and
 * 1920px wide: one copy near what a 3x phone needs, one for a 2x one where it
 * is far from the original.
 */
import sharp from "sharp"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

const PUBLIC = join(process.cwd(), "public")
export const VARIANTS = [
  ["home/showcase/stz-hero.webp", [480, 960]],
  ["home/showcase/stz-summer.webp", [480, 960]],
  ["home/showcase/stz-p-hoodie.webp", [240]],
  ["home/showcase/stz-p-raw.webp", [240]],
  ["home/showcase/stz-p-grey.webp", [240]],
  ["home/showcase/stz-p-faith.webp", [240]],
  ["home/showcase/st-banner.webp", [240, 480]],
  ["home/showcase/st-pull.webp", [360]],
  ["home/showcase/st-squat.webp", [360]],
  ["home/showcase/lp-f2.webp", [240]],
  ["home/everything/lut-still.webp", [480]],
  ["home/everything/ai-builders.webp", [360]],
]

const force = process.env.FORCE === "1"
let wrote = 0
for (const [file, widths] of VARIANTS) {
  const src = join(PUBLIC, file)
  const meta = await sharp(src).metadata()
  for (const w of widths) {
    if (w >= meta.width) throw new Error(`${file}: ${w} is not smaller than its ${meta.width}px`)
    const out = src.replace(/\.webp$/, `-${w}.webp`)
    if (existsSync(out) && !force) continue
    await sharp(src).resize({ width: w, kernel: "lanczos3" }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out)
    const { height } = await sharp(out).metadata()
    console.log(`${file} -> ${w}x${height}  ${Math.round(statSync(out).size / 1024)} KB (was ${Math.round(statSync(src).size / 1024)} KB)`)
    wrote++
  }
}
console.log(`${wrote} written`)
