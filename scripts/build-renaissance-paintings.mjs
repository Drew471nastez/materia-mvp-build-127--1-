/**
 * The paintings behind the Renaissance theme (scripts/onepage-skins/renaissance.mjs), cut and compressed from one
 * public domain picture.
 *
 *   Titian, "Bacchus and Ariadne", 1520 to 1523, oil on canvas, The National Gallery, London (NG35).
 *   Public domain (the painter died in 1576). The photograph is Wikimedia Commons'
 *   "File:Titian Bacchus and Ariadne.jpg", a faithful reproduction of a two dimensional public domain work, marked
 *   {{PD-Art|PD-old-100}} there: https://commons.wikimedia.org/wiki/File:Titian_Bacchus_and_Ariadne.jpg
 *   Taken at 4096px wide (Commons' 4096px thumbnail of that file).
 *
 * Two cuts, each as AVIF and WebP:
 *   portrait   Ariadne on the shore under the starred sky: the phone page and the page as a card
 *   wide       the sky, Ariadne and Bacchus leaping from his chariot with the crimson cloak: around the card on a
 *              computer
 * The canvas's own dark edge (the first few pixels on the left) is cut away; nothing else is changed.
 *
 *   node scripts/build-renaissance-paintings.mjs <path to the 4096px JPEG>
 */
import { mkdirSync } from "node:fs"
import sharp from "sharp"

const source = process.argv[2]
if (!source) {
  console.error("usage: node scripts/build-renaissance-paintings.mjs <Titian_Bacchus_and_Ariadne 4096px JPEG>")
  process.exit(1)
}
const OUT = "public/images/onepage-themes/renaissance"
mkdirSync(OUT, { recursive: true })

const meta = await sharp(source).metadata()
/* The cuts as fractions of the painting, so any size of the same photograph gives the same pictures. */
const cut = (x, y, w, h) => ({ left: Math.round(x * meta.width), top: Math.round(y * meta.height), width: Math.round(w * meta.width), height: Math.round(h * meta.height) })
const CUTS = {
  portrait: { area: cut(0.0043, 0, 0.317, 0.876), width: 780 },
  wide: { area: cut(0.0043, 0, 0.61, 0.615), width: 1680 },
}
for (const [name, { area, width }] of Object.entries(CUTS)) {
  const base = sharp(source).extract(area).resize({ width, kernel: "lanczos3" })
  const avif = await base.clone().avif({ quality: 50, effort: 6, chromaSubsampling: "4:2:0" }).toFile(`${OUT}/${name}.avif`)
  const webp = await base.clone().webp({ quality: 70, effort: 6 }).toFile(`${OUT}/${name}.webp`)
  console.log(`${name}: ${avif.width}x${avif.height}  avif ${Math.round(avif.size / 1024)}KB  webp ${Math.round(webp.size / 1024)}KB`)
}
