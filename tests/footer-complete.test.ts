/**
 * ===========================================================================
 *  EVERY FOOTER IS A STANDARD FOOTER
 * ===========================================================================
 * "The footer doesn't contain what a standard footer should: social icons,
 * the menu links, not even the policies."
 *
 * One footer is drawn on every page of a site (universal-chrome.ts), so this
 * checks the parts once per theme folder: the schema offers each part, the
 * saved ids still exist, and the footer drawn from its own preset shows the
 * brand, link columns, the policies, the store's social icons, the sign-up,
 * the payment icons and a copyright that says the year and the name.
 *
 * Run with:  npm run test:push
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import {
  DEFAULT_FOOTER_COLUMNS,
  fillFooterTokens,
  footerMenuColumn,
  footerPolicyLinks,
  wantsDefaultColumns,
} from "@/lib/website-builder/footer-settings"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

interface Field { id: string; type: string; default?: unknown; label?: string; info?: string; placeholder?: string }
interface Schema { fields: Field[]; presets?: { settings?: Record<string, unknown>; blocks?: SectionInstance["blocks"] }[] }

/** Ids saved sites already hold. Renaming any of them loses somebody's footer. */
const SAVED_IDS = [
  "logo_text", "logo_url", "tagline", "copyright",
  "show_newsletter", "newsletter_heading", "newsletter_subtext", "newsletter_button_text",
  "show_social", "social_instagram", "social_twitter", "social_facebook", "social_tiktok", "social_youtube",
  "color_scheme", "bg_color", "text_color", "heading_color", "accent_color", "divider_color",
  "columns", "max_width", "padding_top", "padding_bottom",
]
const NEW_IDS: Record<string, string> = {
  menu: "link_list",
  menu_heading: "text",
  menu_2: "link_list",
  menu_2_heading: "text",
  show_default_links: "toggle",
  show_policies: "toggle",
  show_contact_link: "toggle",
  show_payment_icons: "toggle",
  layout: "select",
}

const themes = readdirSync(join(root, "themes"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, "themes", d.name, "sections", "footer.json")))
  .map((d) => d.name)

check("at least one theme has a footer", themes.length > 0)

const theme = {
  brand_name: "Juniper Goods",
  social_instagram: "https://instagram.com/juniper",
  social_pinterest: "https://pinterest.com/juniper",
  social_show_in_footer: true,
  menus: {
    footer: { title: "Info", links: [{ title: "About", url: "/about" }, { title: "Journal", url: "/journal" }] },
  },
} as unknown as ThemeSettingsValues

const draw = (section: SectionInstance, pages?: string[]) =>
  renderToStaticMarkup(
    createElement(StorefrontProvider, {
      value: { pages },
      children: createElement(FooterSection, { section, theme }),
    }),
  )

for (const name of themes) {
  console.log(`\nThe ${name} theme's footer`)
  const schema = JSON.parse(readFileSync(join(root, "themes", name, "sections", "footer.json"), "utf8")) as Schema
  const ids = new Map(schema.fields.map((f) => [f.id, f]))

  const missingSaved = SAVED_IDS.filter((id) => !ids.has(id))
  check("every setting a saved footer holds is still there", missingSaved.length === 0, missingSaved.join(", "))
  const wrong = Object.entries(NEW_IDS).filter(([id, type]) => ids.get(id)?.type !== type)
  check("it offers menus, default links, policies, contact, payment icons and a layout", wrong.length === 0, wrong.map(([id]) => id).join(", "))
  check("policies and the store's social icons are on unless turned off", ids.get("show_policies")?.default === true && ids.get("show_social")?.default === true)
  check("the copyright explains the year and name placeholders", /\{\{ date\.year \}\}/.test(ids.get("copyright")?.info ?? ""))
  const words = JSON.stringify(schema)
  check("no em dashes in anything the panel shows", !/\u2014/.test(words))

  const preset = schema.presets?.[0]
  const section: SectionInstance = {
    id: "footer",
    type: "footer",
    name: "Footer",
    settings: { ...(preset?.settings ?? {}), show_newsletter: true, show_payment_icons: true, menu: "footer" },
    blocks: preset?.blocks ?? [],
  }
  const html = draw(section, ["home", "refund-policy", "privacy-policy", "terms-of-service", "shipping-policy"])
  const year = String(new Date().getFullYear())

  check("the brand is drawn", html.includes("data-footer-brand") && />(My Store|Juniper Goods)</.test(html))
  check("a menu from Theme settings is a column", html.includes('href="/journal"') && html.includes(">Info<"))
  check("the preset's own columns are drawn too", html.includes('href="/about"'))
  check("the policies are listed", ["/refund-policy", "/privacy-policy", "/terms-of-service", "/shipping-policy", "/contact"].every((u) => html.includes(`href="${u}"`)))
  check("the store's social links show, only the ones set", html.includes("https://instagram.com/juniper") && html.includes("https://pinterest.com/juniper") && !html.includes('aria-label="YouTube"'))
  check("the sign-up box is there, as an email field", html.includes("data-footer-newsletter") && html.includes('type="email"'))
  check("the payment icons are there", html.includes("data-footer-payments") && html.includes('aria-label="Visa"'))
  check("the copyright has this year and the name, no raw placeholders", html.includes(year) && !html.includes("{{"))
  check("cookie preferences stay on the bottom line", /data-footer-bottom[\s\S]*Cookie preferences/.test(html))

  const off = draw({ ...section, settings: { ...section.settings, show_policies: false, show_social: false, show_payment_icons: false } })
  check("each part can be turned off", !off.includes("/privacy-policy") && !off.includes("instagram.com") && !off.includes("data-footer-payments"))

  const bare = draw({ id: "f", type: "footer", name: "Footer", settings: {}, blocks: [] })
  check("a footer with nothing set still has Shop and Help links and the policies", bare.includes('href="/products"') && bare.includes('href="/contact"') && bare.includes('href="/privacy-policy"'))
  check("and a copyright line with the year", bare.includes(`© ${year} Juniper Goods`))
  const centered = draw({ ...section, settings: { ...section.settings, layout: "centered" } })
  check("the centered layout is drawn", centered.includes('data-footer-layout="centered"'))
}

console.log("\nThe rules behind it")
{
  const menus = { shop: { title: "Shop", links: [{ title: "New", url: "/new-in", links: [{ title: "Tops", url: "/tops" }] }] } }
  const col = footerMenuColumn("shop", "", menus)
  check("a menu column takes the menu's name and lists its second level", col?.heading === "Shop" && col.links.map((l) => l.url).join(",") === "/new-in,/tops")
  check("an unknown menu is no column", footerMenuColumn("nope", "", menus) === null && footerMenuColumn("", "", menus) === null)
  const legal = { id: "l", heading: "Legal", links: [{ id: "a", label: "Refund", url: "/refund-policy" }] }
  check("Shop and Help show beside the Legal column every site is given", wantsDefaultColumns(true, [], [legal], []))
  check("and not beside a creator's own columns, a menu, or with the toggle off",
    !wantsDefaultColumns(true, [], [{ id: "c", heading: "Us", links: [{ id: "x", label: "About", url: "/about" }] }], []) &&
    !wantsDefaultColumns(true, [legal], [], []) &&
    !wantsDefaultColumns(false, [], [], []))
  check("the default links go to addresses every site answers", DEFAULT_FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.url)).every((u) => ["/products", "/search", "/contact", "/account"].includes(u)))
  const withoutKnown = footerPolicyLinks({})
  check("without a page list, the three policies and contact, not shipping", withoutKnown.map((l) => l.url).join(",") === "/refund-policy,/privacy-policy,/terms-of-service,/contact")
  check("a policy the footer already links to is not repeated", !footerPolicyLinks({ alreadyLinked: ["/privacy-policy/"] }).some((l) => l.url === "/privacy-policy"))
  check("a policy page the site does not have is left out", !footerPolicyLinks({ pageKeys: ["home", "refund-policy"] }).some((l) => l.url === "/terms-of-service"))
  check("placeholders are filled", fillFooterTokens("© {{ date.year }} {{shop.name}}", { year: 2030, shopName: "Fern" }) === "© 2030 Fern")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
