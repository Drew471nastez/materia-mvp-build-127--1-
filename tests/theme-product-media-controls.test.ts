/**
 * The product page's pictures, with one picture and with several (templates
 * round 21, the owner: "the left/right arrows around the product media flash
 * or glitch, even when there is only one image").
 *
 *   one picture    no arrows, no counter, no dots in the markup at all, so
 *                  nothing can show for the moment before the slider starts
 *                  (snippets/media-gallery.liquid draws swiper-navigation
 *                  only for two pictures or more; the "1/1" counter and the
 *                  thumbnail strip were already only for two or more)
 *   several        the arrows are there, once, in the main slider
 *
 * Every template's product pages, drawn by the engine with its sample shop.
 * scripts/r21 media probe (headless Chromium, CPU at a quarter, pictures
 * 400ms late) measured the same on the page while it loads.
 *
 *   npx tsx tests/theme-product-media-controls.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer } from "../lib/storelib-theme/compat/site"
import { importTemplate } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : CODE_TEMPLATES.map((t) => t.template)

/** The main slider of the product's pictures: its slides and its controls. */
function gallery(html: string) {
  const at = html.indexOf('class="media-main-swiper')
  if (at < 0) return null
  const end = html.indexOf("</slide-with-thumbs>", at)
  const part = html.slice(at, end < 0 ? undefined : end)
  return {
    slides: (part.match(/swiper-slide media-item/g) ?? []).length,
    arrows: (part.match(/main-slide__navigation/g) ?? []).length,
    counter: /class="swiper-pagination\b/.test(part),
  }
}

async function main() {
  console.log("\nThe snippet\n")
  const snippet = readFileSync(join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE, "base", "snippets", "media-gallery.liquid"), "utf8")
  check("media-gallery draws the main slider's arrows only for two pictures or more", /\{%-?\s*if images\.size > 1\s*-?%\}\s*\{%-?\s*render 'swiper-navigation', class: 'main-slide__navigation'/.test(snippet))

  console.log("\nEvery template's product pages\n")
  let one = 0
  let many = 0
  for (const template of TEMPLATES) {
    const site = auditSite(await importTemplate(`${CODE_THEME_PACKAGE}/${template}`), template, false).site
    const wrong: unknown[] = []
    for (const p of site.products) {
      const out = await answer(site, { method: "GET", path: `/products/${p.settings.slug}`, query: new URLSearchParams(), body: null, cart: [] })
      const g = gallery(String(out.body))
      if (!g) continue
      if (g.slides <= 1) {
        one++
        if (g.arrows || g.counter) wrong.push({ product: p.settings.slug, ...g })
      } else {
        many++
        if (g.arrows === 0) wrong.push({ product: p.settings.slug, ...g })
      }
    }
    check(`${template}: one picture shows no arrows or counter; several show their arrows`, wrong.length === 0, wrong)
  }
  check(`both cases were drawn (${one} with one picture, ${many} with several)`, one > 0 && many > 0)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
