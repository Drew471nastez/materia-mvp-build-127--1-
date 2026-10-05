/**
 * ===========================================================================
 *  EVERY FLAG IN ONE FILE (public/flags/sprite.svg)
 * ===========================================================================
 * "country flags load fast (an optimized sprite or inline SVG set, lazy below
 * the fold, no layout shift)". The country list drew each flag as its own
 * file from public/flags, so opening the list asked for a dozen or two small
 * SVGs at once and more with every scroll, each one a request and a document
 * for the browser to build, and the flags came in one by one after the
 * names. Now they are all one sprite: a <symbol> per country, id the ISO
 * code, which components/app/settings/country-picker draws with <use>. One
 * request, made when the field is on screen (so the list opens with its
 * flags), cached, and every flag after that is already there.
 *
 * The single files stay, for anything that still draws one (Analytics).
 * Run after adding or changing a flag:
 *
 *   node scripts/build-flag-sprite.mjs
 *
 * It writes the sprite and lib/account/flag-sprite.ts, whose address carries
 * a hash of the sprite, so a changed sprite is a new address.
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const dir = join(root, "public/flags")
const files = readdirSync(dir).filter((f) => /^[A-Z]{2}\.svg$/.test(f)).sort()

const symbols = files.map((f) => {
  const svg = readFileSync(join(dir, f), "utf8").trim()
  const open = svg.match(/^<svg\b([^>]*)>/)
  if (!open || !svg.endsWith("</svg>")) throw new Error(`${f} is not one <svg> element`)
  const viewBox = open[1].match(/viewBox="([^"]+)"/)?.[1]
  if (!viewBox) throw new Error(`${f} has no viewBox`)
  /* An id inside a flag would be shared by every flag in the file. */
  if (/\sid="/.test(svg)) throw new Error(`${f} has an id in it`)
  const inner = svg.slice(open[0].length, -"</svg>".length)
  return `<symbol id="${f.slice(0, 2)}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">${inner}</symbol>`
})

const sprite = `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>\n`
writeFileSync(join(dir, "sprite.svg"), sprite)
const hash = createHash("sha256").update(sprite).digest("hex").slice(0, 10)
writeFileSync(
  join(root, "lib/account/flag-sprite.ts"),
  `/** Every country's flag in one file (scripts/build-flag-sprite.mjs writes this). The query is the sprite's hash, so a new sprite is a new address. */\n` +
    `export const FLAG_SPRITE = "/flags/sprite.svg?v=${hash}"\n\n` +
    `/** The codes the sprite has a flag for. */\n` +
    `export const FLAG_CODES = new Set(${JSON.stringify(files.map((f) => f.slice(0, 2)).join(""))}.match(/../g))\n`,
)
console.log(`${files.length} flags, ${sprite.length} bytes, v=${hash}`)
