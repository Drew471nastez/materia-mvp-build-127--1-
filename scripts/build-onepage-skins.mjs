/**
 * ===========================================================================
 *  THE SKINS' STYLESHEET, WRITTEN FROM ITS SOURCE (rounds W9, W10)
 * ===========================================================================
 * components/onepage/themes/theme-skins.css draws every skin
 * (lib/onepage/theme-skin): the material of every block and the scene behind
 * the page. Its pictures are small SVGs inlined as data addresses, which are
 * unreadable once encoded, so they are written here as SVG and encoded on
 * the way out.
 *
 *   node scripts/build-onepage-skins.mjs          writes components/onepage/themes/theme-skins.css
 *   node scripts/build-onepage-skins.mjs --check  fails when the file is not what this writes
 *   node scripts/build-onepage-skins.mjs --pairs  prints the pairs of words and paint, as JSON (the test reads them)
 *
 * Each family is its own file in scripts/onepage-skins/ (the vocabulary and
 * the helpers in shared.mjs): one function per look, drawn once for each of
 * its versions with that version's palette (round W10: Aero and Aero
 * Aquarium, Aqua and Aqua Graphite, Messenger and Messenger Olive, Y2K and
 * Y2K Kawaii, Playful and Playful Night, Grunge and Grunge Zine), and the
 * three that stand alone (Classic 98, Vaporwave, Arcade), and Renaissance.
 *
 * Every pair of words and the paint a skin puts under them is recorded
 * (`pairs`, exported, and printed by --pairs): tests/onepage-themes-w10.test.ts measures each.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { css, pairs, rule, comment, banner, HOVER, HOVERED } from "./onepage-skins/shared.mjs"
import { aero, aeroAquarium } from "./onepage-skins/aero.mjs"
import { aqua, aquaGraphite } from "./onepage-skins/aqua.mjs"
import { messenger, messengerOlive } from "./onepage-skins/messenger.mjs"
import { y2k, y2kKawaii } from "./onepage-skins/y2k.mjs"
import { playful, playfulNight } from "./onepage-skins/playful.mjs"
import { grungeZine } from "./onepage-skins/grunge.mjs"
import { classic98 } from "./onepage-skins/classic98.mjs"
import { vaporwave } from "./onepage-skins/vaporwave.mjs"
import { arcade } from "./onepage-skins/arcade.mjs"
import { renaissance } from "./onepage-skins/renaissance.mjs"
import { stoicism } from "./onepage-skins/stoicism.mjs"

const OUT = join(process.cwd(), "components/onepage/themes/theme-skins.css")

aero()
aqua()
messenger()
y2k()
playful()
/* Round 17: Grunge is retired (lib/onepage/retired-themes moves a page on it to Grunge Zine when read), so its skin is no longer written: the sheet carries what a page can wear. */
aeroAquarium()
aquaGraphite()
messengerOlive()
y2kKawaii()
playfulNight()
grungeZine()
classic98()
vaporwave()
arcade()
renaissance()
stoicism()

/* ── All: hover words, motion, theme cards ──────────────────────────── */

banner("ALL SKINS: a button's words on hover, motion, theme cards")
comment("A button the skin paints keeps the hover's own words when it fills (app/globals.css .op-btn).")
css.push(`${HOVER} {\n  [data-op-skin] ${HOVERED}:is([data-hover="fill"], [data-hover="pop"]) { color: var(--op-fill-text, inherit) !important; text-shadow: none; }\n}`)
comment("Round 24: a button reached with Tab plays the same hover (app/globals.css, THE KEYBOARD GETS THE SAME ANSWER).")
css.push(`[data-op-skin] :is(.op-btn:focus-visible, .op-host:focus-visible .op-btn):is([data-hover="fill"], [data-hover="pop"]) { color: var(--op-fill-text, inherit) !important; text-shadow: none; }`)
css.push(`@keyframes sk-spin { to { rotate: 360deg; } }
@keyframes sk-drift { from { translate: -24px 0; } to { translate: 30px 0; } }
@keyframes sk-bob { from { translate: 0 0; } to { translate: 6px -22px; } }
@keyframes sk-sway { from { translate: -12px 0; } to { translate: 12px 4px; } }
@keyframes sk-aurora { from { translate: 0 0; scale: 1; } to { translate: 40px 30px; scale: 1.12; } }
@keyframes sk-shimmer { from { opacity: .45; } to { opacity: .9; } }
@keyframes sk-twinkle { 0%, 100% { opacity: .25; scale: .45; } 50% { opacity: 1; scale: 1; } }
@keyframes sk-blob { from { translate: 0 0; rotate: 0deg; } to { translate: 18px -14px; rotate: 14deg; } }
@keyframes sk-wiggle { from { rotate: -9deg; } to { rotate: 9deg; } }
@keyframes sk-jitter { 0% { translate: 0 0; } 33% { translate: -13px 7px; } 66% { translate: 9px -11px; } 100% { translate: 0 0; } }
@keyframes sk-throb { from { filter: brightness(1) saturate(1); } to { filter: brightness(1.1) saturate(1.15); } }
@keyframes sk-online { 0%, 100% { scale: 1; } 50% { scale: 1.12; } }
@keyframes sk-rise { 0% { translate: 0 0; opacity: 0; } 10% { opacity: .9; } 85% { opacity: .7; } 100% { translate: 10px -420px; opacity: 0; } }
@keyframes sk-swim { 0% { translate: 0 0; } 50% { translate: 26px -8px; } 100% { translate: 52px 4px; } }
@keyframes sk-weed { from { rotate: -4deg; } to { rotate: 5deg; } }
@keyframes sk-grid { from { translate: 0 0; } to { translate: 0 48px; } }
@keyframes sk-blink { from { opacity: 1; } to { opacity: .15; } }
@keyframes sk-hop { from { translate: 0 0; } to { translate: 0 -6px; } }`)
comment("The desktop's \"Scan to view\" label (components/onepage/public-onepage) is white on a light tint: over a skin's light scene it gets a dark one.")
rule(`[data-op-skin] .fixed.bottom-6.right-6 > span:first-child`, `background-color: rgba(10,10,20,.78) !important;`)
comment("Still for anyone who asked for less motion, and in a theme card (components/onepage/themes/theme-preview), which is a picture.")
css.push(`@media (prefers-reduced-motion: reduce) {\n  [data-skin-scene] *, [data-skin-scene] *::before, [data-skin-scene] *::after, [data-op-skin] *, [data-op-skin] *::before, [data-op-skin] *::after { animation: none !important; }\n}`)
rule(`[data-tp-page] [data-skin-scene] *, [data-tp-page] [data-skin-scene] *::before, [data-tp-page][data-op-skin] *, [data-tp-page][data-op-skin] *::before, [data-tp-page][data-op-skin] *::after`, `animation: none !important;`)

const header = `/*
 * GENERATED by scripts/build-onepage-skins.mjs from its source (scripts/onepage-skins/): edit that, then run it.
 * The OnePage skins (rounds W9, W10, lib/onepage/theme-skin): the material of every block
 * on a page whose theme names one ([data-op-skin]) and the scene behind it ([data-skin-scene],
 * components/onepage/themes/theme-skin-scene). Outside every @layer, as the OnePage rules in
 * app/globals.css are, so a skin wins over the Tailwind utilities it adjusts. Imported by
 * components/onepage/themes/theme-skin-scene.tsx, so only a OnePage loads it.
 */
`
export const out = header + css.join("\n") + "\n"
export { pairs }

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--pairs")) {
    process.stdout.write(JSON.stringify(pairs))
  } else if (process.argv.includes("--check")) {
    const now = readFileSync(OUT, "utf8")
    if (now !== out) { console.error("components/onepage/themes/theme-skins.css is not what scripts/build-onepage-skins.mjs writes: run it."); process.exit(1) }
    console.log("components/onepage/themes/theme-skins.css is current")
  } else {
    writeFileSync(OUT, out)
    console.log(`wrote ${OUT} (${(out.length / 1024).toFixed(1)} KB)`)
  }
}
