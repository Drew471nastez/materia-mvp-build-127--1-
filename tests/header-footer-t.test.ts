/**
 * ===========================================================================
 *  THE HEADER'S DRAWERS, ITS LOGO, AND THE FOOTER'S PARTS
 * ===========================================================================
 * "Menu on phones: Slides in from the left" drew the phone menu across the
 * middle of a desktop canvas, and the published footer was a tall row with
 * its links pushed to the far right. The rules behind the fixes are pure and
 * checked here; the geometry is measured by scripts/check-header-drawers.mjs
 * and scripts/check-footer-layout.mjs.
 *
 *   npx tsx tests/header-footer-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ALL_CLOSED, isInPageLink, menuDrawerExists, openCount, openOnly, settleDrawers } from "@/lib/website-builder/header-drawers"
import { headerBorderHere, logoFontStack, logoMode, logoParts } from "@/lib/website-builder/header-settings"
import { SOCIAL_PLATFORMS, socialLinks, socialUrl } from "@/lib/website-builder/social-links"
import { footerContactLinks, footerGrid, footerMenuColumn } from "@/lib/website-builder/footer-settings"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}

console.log("\nOne drawer at a time")
{
  check("opening one is that one and nothing else", JSON.stringify(openOnly("cart")) === JSON.stringify({ menu: false, cart: true, search: false }))
  const menuOpen = openOnly("menu")
  const cartAsked = settleDrawers(menuOpen, { ...menuOpen, cart: true })
  check("the cart opening while the menu is open closes the menu", cartAsked.cart && !cartAsked.menu && openCount(cartAsked) === 1)
  const searchAsked = settleDrawers(openOnly("cart"), { menu: false, cart: true, search: true })
  check("search opening closes the cart", searchAsked.search && !searchAsked.cart)
  const both = settleDrawers(ALL_CLOSED, { menu: true, cart: true, search: false })
  check("two asked in the same moment leave one, the cart", openCount(both) === 1 && both.cart)
  check("closing is kept as it is", JSON.stringify(settleDrawers(menuOpen, ALL_CLOSED)) === JSON.stringify(ALL_CLOSED))
  const states: Array<[keyof typeof ALL_CLOSED, keyof typeof ALL_CLOSED]> = [["menu", "cart"], ["menu", "search"], ["cart", "menu"], ["cart", "search"], ["search", "menu"], ["search", "cart"]]
  check("every handover leaves exactly one open", states.every(([a, b]) => {
    const next = settleDrawers(openOnly(a), { ...openOnly(a), [b]: true })
    return openCount(next) === 1 && next[b]
  }))
}

console.log("\nThe phone menu exists only where there is a phone layout")
{
  check("not on the desktop canvas", menuDrawerExists("desktop") === false)
  check("not on the tablet canvas", menuDrawerExists("tablet") === false)
  check("in the phone preview", menuDrawerExists("mobile") === true)
  check("published, where CSS hides it from the tablet breakpoint", menuDrawerExists(undefined) === true)
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the header asks the rule before drawing the menu", /const mobileDrawer = hasMenuDrawer \? \(/.test(header))
  check("and the published menu is hidden at md and up, backdrop and panel", (header.match(/phoneOnly && "md:hidden"/g) ?? []).length === 2)
  check("a closed drawer is not in the page", (header.match(/useDrawerPresence\(open\)/g) ?? []).length === 2)
  check("the menu is keyed by its style, so a changed setting never keeps the old edge's transform", /key=\{menuStyle\}/.test(header))
  check("changing Menu on phones previews it only in the phone preview", /if \(renderingInsideEditor && deviceMode === "mobile"\) openMenu\(\)/.test(header))
  check("both drawers trap focus on a published page", (header.match(/useFocusTrap\(open, panelRef, !scopedToPreview/g) ?? []).length === 2)
  check("the slid-away sub-menu pane is inert", /inert=\{inSubmenu\}/.test(header) && /inert=\{!inSubmenu\}/.test(header))
  const frame = read("components/website-builder/drawer-frame.ts")
  check("the scroll lock is counted, so a handover never lets go of the page", /export function holdLock\(/.test(frame) && /holdLock\(document\.documentElement, lockDocument\)/.test(frame))
  check("and the scrollbar's width is given back while it is locked", /body\.paddingRight = `\$\{barWidth\}px`/.test(frame))
}

console.log("\nThe header stays, sticky in the mode it is set to")
{
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  const frame = read("components/website-builder/drawer-frame.ts")
  const shared = read("components/website-builder/sections/_shared.tsx")
  const motion = read("lib/website-builder/section-motion.ts")
  check("the menu opens under the header, measured from the header itself", /below=\{headerRef\}/.test(header) && /const measureInset = \(\) =>/.test(frame))
  check("the header's ref callback is stable, so the drawer never measures a detached header", /const attachHeader = useCallback\(/.test(header) && (header.match(/forwardRef=\{attachHeader\}/g) ?? []).length === 2)
  check("nothing fades the header under a drawer", !/useHeaderUnderDrawer/.test(header + frame))
  check("the slide is about 300ms", /export const DRAWER_OPEN_MS = 300/.test(frame) && /export const DRAWER_CLOSE_MS = 240/.test(frame))
  check("the header says its sticky mode", /dataSticky=\{revealEnabled \? "scroll-up" : "always"\}/.test(header) && /dataSticky="none"/.test(header) && /data-sticky=\{dataSticky\}/.test(shared))
  check("and the anchor offset reads it", /header\.getAttribute\("data-sticky"\)/.test(motion))
  check("a transparent sticky header turns solid once pinned", /el\.setAttribute\("data-scrolled", ""\)/.test(header) && /\[&\[data-scrolled\]\]:!bg-\[var\(--hdr-solid\)\]/.test(header))
}

console.log("\nA link to a place on this page is handed on")
{
  check("#pricing is in the page", isInPageLink("#pricing", "/"))
  check("/#pricing on the home page is in the page", isInPageLink("/#pricing", "/"))
  check("/about#team on /about is in the page", isInPageLink("/about#team", "/about/"))
  check("/about#team on the home page is not", !isInPageLink("/about#team", "/"))
  check("a bare # is not a destination", !isInPageLink("#", "/"))
  check("an ordinary page is not", !isInPageLink("/products", "/"))
}

console.log("\nLogo shows")
{
  check("a header that never chose keeps the picture when it has one", JSON.stringify(logoParts(undefined, true)) === JSON.stringify({ image: true, text: false }))
  check("and the name when it has none", JSON.stringify(logoParts(undefined, false)) === JSON.stringify({ image: false, text: true }))
  check("Text is the name only", JSON.stringify(logoParts("text", true)) === JSON.stringify({ image: false, text: true }))
  check("Image and text is both", JSON.stringify(logoParts("image_text", true)) === JSON.stringify({ image: true, text: true }))
  check("Image without a picture falls back to the name rather than nothing", JSON.stringify(logoParts("image", false)) === JSON.stringify({ image: false, text: true }))
  check("an unknown value is no choice", logoMode("banner") === null)
  check("the font stack skips inherit, which would void the declaration", !logoFontStack("inherit").includes("inherit") && logoFontStack("inherit").startsWith("var(--theme-font-heading)"))
  check("and quotes a chosen family", logoFontStack("Playfair Display").startsWith('"Playfair Display", var(--theme-font-heading)'))
  const schema = JSON.parse(read("themes/default/sections/header.json")) as { fields: { id: string; options?: { value: string }[] }[] }
  const field = schema.fields.find((f) => f.id === "logo_mode")
  check("the schema offers Logo shows with the three values", !!field && JSON.stringify(field.options?.map((o) => o.value)) === JSON.stringify(["image", "text", "image_text"]))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("and the panel draws it", /label="Logo shows"/.test(editor) && /onUpdateSetting\("logo_mode", v\)/.test(editor))
}

console.log("\nHeader border, decided from the page in both places")
{
  check("all pages", headerBorderHere(true, "all", "page") && headerBorderHere(true, "all", "index"))
  check("home only", headerBorderHere(true, "home_only", "index") && !headerBorderHere(true, "home_only", "page"))
  check("inner pages only, in the editor too", headerBorderHere(true, "inner_only", "page") && !headerBorderHere(true, "inner_only", "index"))
  check("off is off", !headerBorderHere(false, "all", "index") && !headerBorderHere(true, "none", "index"))
}

console.log("\nSocial links")
{
  const keys = SOCIAL_PLATFORMS.map((p) => p.key)
  check("the platforms a shop expects are there", ["social_instagram", "social_tiktok", "social_youtube", "social_twitter", "social_facebook", "social_linkedin", "social_pinterest", "social_threads"].every((k) => keys.includes(k as never)))
  const social = THEME_SETTINGS_GROUPS.find((g) => g.id === "social")
  check("Theme settings offers a field for every platform", keys.every((k) => social?.fields.some((f) => f.id === k)))
  check("an https address is kept", socialUrl("https://instagram.com/fern") === "https://instagram.com/fern")
  check("a bare address is given its https", socialUrl("instagram.com/fern") === "https://instagram.com/fern")
  check("javascript: is not a profile", socialUrl("javascript:alert(1)") === "")
  check("nor is a word", socialUrl("fern") === "")
  const links = socialLinks(
    { social_instagram: "https://instagram.com/theme", social_threads: "threads.net/@fern", social_tiktok: "  " },
    { social_instagram: "https://instagram.com/footer" },
  )
  check("a link typed into the footer wins for its platform", links.find((l) => l.key === "social_instagram")?.url === "https://instagram.com/footer")
  check("empty fields are left out and the order is the platforms'", links.map((l) => l.key).join(",") === "social_instagram,social_threads")
  check("X is named X", socialLinks({ social_twitter: "https://x.com/fern" })[0]?.label === "X")
}

console.log("\nThe footer")
{
  const menus = { main: { title: "Shop", links: [{ title: "New", url: "/new", links: [{ title: "Tops", url: "/tops" }] }, { title: "Sale", url: "/sale" }] } }
  const col = footerMenuColumn("main", "", menus)
  check("a footer menu comes from Website settings, Menus, with its second level", col?.heading === "Shop" && col.links.map((l) => l.url).join(",") === "/new,/tops,/sale")
  check("a heading typed for it wins", footerMenuColumn("main", "Browse", menus)?.heading === "Browse")

  const wide = footerGrid({ linkColumns: 3, columnsSetting: "3", newsletter: true })
  check("wide: brand, links and newsletter in one row", wide.wide.split(") ").length === 3 && wide.navTracks === 3)
  check("medium: links take their own row under brand and newsletter", wide.navOwnRowAtMedium && wide.medium === "minmax(0, 1fr) minmax(0, 1fr)")
  const noSignup = footerGrid({ linkColumns: 2, columnsSetting: "3", newsletter: false })
  check("without a sign-up, brand and links share a row at medium", !noSignup.navOwnRowAtMedium && noSignup.medium.startsWith("minmax(0, 1fr) minmax(0, 1.70fr)"))
  check("Link columns caps how many sit side by side at medium widths", footerGrid({ linkColumns: 5, columnsSetting: "2", newsletter: true }).navTracksMedium === 2)
  check("and from 1000px they all share the row, up to five", footerGrid({ linkColumns: 3, columnsSetting: "2", newsletter: false }).navTracks === 3 && footerGrid({ linkColumns: 7, columnsSetting: "2", newsletter: false }).navTracks === 5)
  check("a nonsense setting is three", footerGrid({ linkColumns: 5, columnsSetting: "x", newsletter: false }).navTracksMedium === 3)

  const contact = footerContactLinks("hello@fern.shop", "+1 (555) 123-4567")
  check("contact email and phone become links", contact.map((l) => l.url).join(",") === "mailto:hello@fern.shop,tel:+15551234567")
  check("and nonsense is left out", footerContactLinks("not an email", "12").length === 0)

  const theme = {
    brand_name: "Fern",
    social_instagram: "https://instagram.com/fern",
    social_threads: "https://threads.net/@fern",
    social_show_in_footer: true,
    menus,
  } as unknown as ThemeSettingsValues
  const section = {
    id: "f",
    type: "footer",
    name: "Footer",
    settings: { menu: "main", tagline: "Plants, posted.", contact_email: "hello@fern.shop", show_payment_icons: true },
    blocks: [],
  } as unknown as SectionInstance
  const html = renderToStaticMarkup(createElement(StorefrontProvider, { value: {}, children: createElement(FooterSection, { section, theme }) }))
  check("the footer is a grid sized by footerGrid", /data-footer-top/.test(html) && /--footer-wide:minmax\(0, 1\.15fr\)/.test(html))
  check("its menu column is drawn", html.includes('href="/tops"') && html.includes(">Shop<"))
  check("the Contact column is drawn", html.includes('href="mailto:hello@fern.shop"') && html.includes(">Contact<"))
  check("the sign-up is on unless turned off", html.includes("data-footer-newsletter") && html.includes('type="email"'))
  check("social icons from Theme settings, Threads included", html.includes('aria-label="Threads"') && html.includes('aria-label="Instagram"'))
  check("payment icons sit in the bottom row", /data-footer-bottom[\s\S]*data-footer-payments/.test(html))
  check("cookie preferences in the bottom row", /data-footer-bottom[\s\S]*Cookie preferences/.test(html))
  check("no left over drawer or chevrons in the footer", !/data-site-drawer|lucide-chevron/.test(html))
  const off = renderToStaticMarkup(createElement(FooterSection, { section: { ...section, settings: { ...section.settings, show_newsletter: false } }, theme }))
  check("the sign-up can be turned off", !off.includes("data-footer-newsletter"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
