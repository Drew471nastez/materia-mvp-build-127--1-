/**
 * "Powered by Storelib" on every theme website (round 20,
 * lib/storelib-theme/compat/powered-by.ts):
 *
 *   every template   its footer says "Powered by Storelib", small, linked to
 *                    https://storelib.com, once, on every page kind drawn
 *   the rule         Theme settings' "Show Powered by Storelib" off takes it
 *                    away only when the owner's plan may remove branding
 *                    (lib/sites/plan.ts removeBranding); a free plan, or a
 *                    plan that could not be read, keeps it whatever the
 *                    setting says
 *   on the server    the decision is the server's: a theme whose code leaves
 *                    the line out gets it added inside its footer, and the
 *                    live site reads the plan (compat-site.ts)
 *   the builder      the canvas, which has no plan, draws what the setting says
 *
 *   npx tsx tests/theme-powered-by.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { HIDE_SETTING, POWERED_BY_URL, poweredByShown, withPoweredBy } from "../lib/storelib-theme/compat/powered-by"
import { siteLimits } from "../lib/sites/plan"
import { importTemplate } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

type O = Record<string, unknown>
/* TEMPLATES=a,b runs only those; the suite runs them all. */
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : CODE_TEMPLATES.map((t) => t.template)
const ROOT = join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE, "base")

/** The "Powered by Storelib" links in a page: where each points and whether it sits in the footer. */
function badges(html: string): { href: string; inFooter: boolean }[] {
  const out: { href: string; inFooter: boolean }[] = []
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*Powered by Storelib\s*<\/a>/gi)) {
    const at = m.index ?? 0
    const open = html.toLowerCase().lastIndexOf("<footer", at)
    const close = html.toLowerCase().lastIndexOf("</footer>", at)
    out.push({ href: m[1], inFooter: open >= 0 && open > close })
  }
  return out
}

async function page(site: SiteData, path: string): Promise<string> {
  const out = await answer(site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
  return String(out.body)
}

async function main() {
  console.log("\nThe rule\n")
  check("shown with the setting on, whatever the plan", poweredByShown({}, false) && poweredByShown({}, true) && poweredByShown({ [HIDE_SETTING]: true }, true))
  check("the setting off hides it on a plan that may remove branding", !poweredByShown({ [HIDE_SETTING]: false }, true))
  check("  and not on a free plan, nor when the plan could not be read", poweredByShown({ [HIDE_SETTING]: false }, false) && poweredByShown({ [HIDE_SETTING]: false }, null) && poweredByShown({ [HIDE_SETTING]: false }, undefined))
  check("the plans: Free keeps it, Grow and Pro may hide it", siteLimits("free").removeBranding === false && siteLimits("growth").removeBranding && siteLimits("pro").removeBranding)

  console.log("\nA theme that leaves it out gets it from the server\n")
  const bare = "<html><body><main>x</main><footer class=f><p>© Shop</p></footer></body></html>"
  const added = withPoweredBy(bare, true)
  check("added inside the theme's footer, linked to storelib.com", badges(added).length === 1 && badges(added)[0].inFooter && badges(added)[0].href === POWERED_BY_URL, added)
  check("  never twice", withPoweredBy(added, true) === added)
  check("  and not when it is not to be shown", withPoweredBy(bare, false) === bare)

  console.log("\nThe theme\n")
  const footer = readFileSync(join(ROOT, "sections", "footer.liquid"), "utf8")
  check("the base footer prints powered_by_link by its copyright line", /\{\{\s*powered_by_link\s*\}\}/.test(footer))
  const schema = JSON.parse(readFileSync(join(ROOT, "config", "settings_schema.json"), "utf8")) as { name?: string; settings?: O[] }[]
  const setting = schema.flatMap((g) => g.settings ?? []).find((s) => s.id === HIDE_SETTING)
  check("Theme settings has \"Show Powered by Storelib\", on by default, saying hiding needs a paid plan", !!setting && setting.type === "checkbox" && setting.default === true && /paid/i.test(String(setting.info ?? "")), setting)
  const live = readFileSync(join(process.cwd(), "lib", "website-builder", "compat-site.ts"), "utf8")
  check("the live site reads the owner's plan for it (creatorSitePlan, removeBranding)", /creatorSitePlan\(/.test(live) && /removeBranding:\s*await/.test(live))

  console.log("\nEvery template\n")
  for (const template of TEMPLATES) {
    const imported = await importTemplate(`${CODE_THEME_PACKAGE}/${template}`)
    const built = auditSite(imported, template, false)
    const site = built.site
    const product = String(site.products[0]?.settings.slug ?? "")
    const paths = ["/", ...(product ? [`/products/${product}`] : []), "/cart", "/no-such-page"]
    const found = await Promise.all(paths.map(async (p) => ({ p, b: badges(await page(site, p)) })))
    const wrong = found.filter((f) => f.b.length !== 1 || !f.b[0].inFooter || f.b[0].href !== POWERED_BY_URL).map((f) => ({ path: f.p, found: f.b }))
    check(`${template}: once, in the footer, linked to storelib.com, on ${paths.length} pages`, wrong.length === 0, wrong)

    const values = site.theme.settingsValues as O
    const was = values[HIDE_SETTING]
    try {
      values[HIDE_SETTING] = false
      const free = badges(await page({ ...site, removeBranding: false }, "/")).length
      const unread = badges(await page({ ...site, removeBranding: null }, "/")).length
      const paid = badges(await page({ ...site, removeBranding: true }, "/")).length
      check(`${template}:   hidden only on a paid plan (free ${free}, unread ${unread}, paid ${paid})`, free === 1 && unread === 1 && paid === 0)
      const canvasOff = badges(await page({ ...site, designMode: true }, "/")).length
      values[HIDE_SETTING] = true
      const paidOn = badges(await page({ ...site, removeBranding: true }, "/")).length
      const canvasOn = badges(await page({ ...site, designMode: true }, "/")).length
      check(`${template}:   a paid plan with the setting on keeps it; the builder draws the setting (${canvasOn}, off ${canvasOff})`, paidOn === 1 && canvasOn === 1 && canvasOff === 0)
    } finally {
      if (was === undefined) delete values[HIDE_SETTING]
      else values[HIDE_SETTING] = was
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
