/**
 * ===========================================================================
 *  GENERAL SETTINGS: FEWER GROUPS, AND EVERY CONTROL CONNECTED
 * ===========================================================================
 * "Remove outdated stuff like the announcement bar toggle, SEO and so on,
 * fewer categories, and make sure every setting actually connects to
 * something. Text styles should be simpler: just desktop and phone. Layout
 * controls must actually work. Social links with brand icons that show in
 * the footer."
 *
 * Each of those is held here: the groups, a reader for every setting, the
 * settings taken out of the panel still read where they were, the layout
 * controls reaching the stylesheet, two text sizes, and the footer's icons.
 * The geometry (page width, gap, icons at 390px and 1280px) was measured in
 * Chromium when this landed.
 *
 *   npx tsx tests/settings-cleanup.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeStylesheet, themeVars, parityVars } from "@/lib/website-builder/theme-css"
import { SOCIAL_PLATFORMS, socialEmailUrl, socialLinks } from "@/lib/website-builder/social-links"
import { SOCIAL_ICON_PATHS } from "@/lib/website-builder/social-icons"
import {
  DEFAULT_TYPE_STYLES,
  TYPE_STYLE_KEYS,
  responsiveSize,
  stripTypeStyleDefaults,
  themeTypography,
  typographyStylesheet,
} from "@/lib/storelib-theme/typography"
import { shopObject } from "@/lib/storelib-theme/globals"
import { themeTokens } from "@/lib/storelib-theme/resolve"
import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { untt } from "./i18n-source"

const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)
let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`) }
}

const fields = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => ({ ...f, group: g.id })))
const settings = fields.filter((f) => f.type !== "header")
const ids = settings.map((f) => f.id)
const group = (id: string) => THEME_SETTINGS_GROUPS.find((g) => g.id === id)

console.log("\nThe groups")
{
  /* What General Settings draws: not the page colours (inside Colors), not Menus (Navigation), not a retired group. */
  const drawn = THEME_SETTINGS_GROUPS.filter((g) => g.id !== "colors" && g.id !== "menus" && !g.shownWhen)
  /* Ten since Products and cart became Product cards and Cart and checkout;
     eleven since the cookie banner came back as a theme setting (changed on
     purpose, asked for by the owner). */
  check("eleven groups, down from twenty-four", drawn.length === 11, drawn.map((g) => g.label))
  check(
    "in the order a creator works through them",
    drawn.map((g) => g.label).join(" | ") === "Logo and brand | Colors | Typography | Buttons and inputs | Layout | Product cards | Cart and checkout | Social links | Cookie banner | Animations | Custom CSS",
    drawn.map((g) => g.label).join(" | "),
  )
  check("no setting is in two groups", new Set(ids).size === ids.length)
  check("every sub-heading inside a group has an id of its own", fields.filter((f) => f.type === "header").every((f) => f.id.startsWith("hdr_")))
  for (const gone of ["seo", "variant_pills", "inputs", "collection_cards", "content_containers", "media", "popups", "badges", "brand", "currency", "breadcrumbs"]) {
    check(`"${gone}" is not a group of its own any more`, !group(gone))
  }
  check("the general page colours are three", (group("colors")?.fields ?? []).map((f) => f.id).join(",") === "background_color,text_color,primary_color")
  check("the editor opens the breadcrumb bar's settings in Layout", /setExpandedSettings\("layout"\)/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
}

console.log("\nTaken out of the panel")
{
  for (const id of ["seo_title", "seo_description", "seo_og_image", "seo_twitter_card", "seo_robots"]) {
    check(`${id} is not a General setting`, !ids.includes(id))
  }
  const seo = read("components/website-builder/website-settings/seo.tsx")
  check("SEO & Social still writes the same keys", ["seo_og_image", "seo_robots"].every((k) => seo.includes(k)))
  // Changed on purpose: the Share card select was removed from SEO & Social
  // (every network draws the large card). A value saved before is still read.
  check("the Share card is no longer offered, and a saved one is still read", !seo.includes("seo_twitter_card") && /seo_twitter_card/.test(read("lib/website-builder/theme-metadata.ts")))
  check("and the live page still reads the share image and title", /seo_og_image/.test(read("lib/website-builder/theme-metadata.ts")) && /seo_title/.test(read("app/(site)/w/[username]/render-site.tsx")))

  const cookieIds = ["cookie_banner_show", "cookie_banner_text", "cookie_accept_text", "cookie_decline_text", "cookie_banner_enabled", "cookie_bg", "cookie_text_color"]
  const policies = read("components/website-builder/website-settings/policies.tsx")
  const page = read("components/website-builder/theme/ThemePage.tsx")
  // Changed on purpose: the cookie banner is a theme setting again, and Policies opens it.
  check("the cookie banner is a theme setting, and the page reads every key", cookieIds.every((id) => ids.includes(id) && page.includes(id)) && /onOpenThemeGroup\("cookies"\)/.test(policies))

  const old = group("announcement")
  check("the old announcement bar shows only to a site that has it on", old?.shownWhen === "announcement_bar_enabled")
  check("and holds only its switch", (old?.fields ?? []).map((f) => f.id).join(",") === "announcement_bar_enabled", old?.fields.map((f) => f.id))
  check("which says where the bar went", /Announcement bar section in the Header group/.test(old?.fields[0]?.info ?? ""))
  /* Changed on purpose (round 35): in the editor the bar is drawn with the live theme (chromeTheme), the theme otherwise. */
  check("the page still draws it while it is on, so no live bar vanishes", /t\.announcement_bar_enabled === true/.test(page) && /<AnnouncementBar theme=\{chromeTheme \?\? theme\} \/>/.test(page))
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("General Settings leaves out a group whose switch is off", /\.filter\(group => !group\.shownWhen \|\| settingsDraft\[group\.shownWhen as keyof ThemeSettingsValues\] === true\)/.test(editor))

  for (const id of ["primary_hover_color", "secondary_color", "accent_color", "surface_color", "link_color", "success_color", "error_color", "button_size", "button_font_weight", "brand_image_width", "container_radius", "container_shadow"]) {
    check(`${id} is out of the panel`, !ids.includes(id))
  }
  check("a saved button_font_weight still sets the Button text style", themeTypography({ button_font_weight: "800" }).styles.button.weight === "800")
  check("a saved page colour is still on the root, for custom CSS", themeVars({ accent_color: "#123456" } as ThemeSettingsValues)["--theme-accent"] === "#123456")
}

console.log("\nEvery setting is read by something")
{
  /*
    THE AUDIT, KEPT. Each setting the panel shows, and a file that reads it.
    A setting with no reader is a control over nothing, which is what this
    cleanup took out; a new one has to say what it reaches.
  */
  const READERS: Record<string, string> = {
    brand_name: "lib/storelib-theme/resolve.ts",
    logo_url: "lib/storelib-theme/resolve.ts",
    logo_width: "lib/storelib-theme/resolve.ts",
    /* Read once, for every place a favicon is shown (round V1): lib/website-builder/favicon-sync.ts faviconOf, which resolve.ts, the live pages and checkout ask. */
    favicon_url: "lib/website-builder/favicon-sync.ts",
    tagline: "lib/storelib-theme/globals.ts",
    brand_headline: "lib/website-builder/storefront-data.ts",
    brand_description: "lib/website-builder/storefront-data.ts",
    brand_image: "lib/website-builder/storefront-data.ts",
    background_color: "lib/website-builder/theme-css.ts",
    text_color: "lib/website-builder/theme-css.ts",
    primary_color: "components/website-builder/theme/ThemePage.tsx",
    font_heading: "lib/storelib-theme/typography.ts",
    font_body: "lib/storelib-theme/typography.ts",
    font_accent: "lib/storelib-theme/typography.ts",
    button_style: "lib/website-builder/theme-css.ts",
    button_shape: "lib/website-builder/theme-css.ts",
    button_border_radius: "lib/website-builder/theme-css.ts",
    button_shadow: "lib/website-builder/theme-css.ts",
    button_transition: "lib/website-builder/theme-css.ts",
    pill_radius: "lib/website-builder/theme-css.ts",
    pill_border_width: "lib/website-builder/theme-css.ts",
    input_radius: "lib/website-builder/theme-css.ts",
    input_border_width: "lib/website-builder/theme-css.ts",
    input_border_opacity: "lib/website-builder/theme-css.ts",
    page_width: "lib/website-builder/theme-css.ts",
    content_padding_x: "lib/website-builder/theme-css.ts",
    section_gap: "lib/website-builder/theme-css.ts",
    spacing_scale: "lib/website-builder/theme-css.ts",
    spacing_scale_mobile: "lib/website-builder/theme-css.ts",
    border_radius: "lib/storelib-theme/resolve.ts",
    card_shadow: "lib/website-builder/theme-css.ts",
    container_border: "lib/website-builder/theme-css.ts",
    image_border_radius: "lib/website-builder/theme-css.ts",
    media_border: "lib/website-builder/theme-css.ts",
    media_shadow: "lib/website-builder/theme-css.ts",
    popup_radius: "lib/website-builder/theme-css.ts",
    popup_border: "lib/website-builder/theme-css.ts",
    popup_shadow: "lib/website-builder/theme-css.ts",
    breadcrumbs_enabled: "lib/website-builder/theme-breadcrumbs.ts",
    breadcrumbs_separator: "lib/website-builder/theme-breadcrumbs.ts",
    breadcrumbs_style: "lib/website-builder/theme-breadcrumbs.ts",
    breadcrumbs_home_icon: "lib/website-builder/theme-breadcrumbs.ts",
    badge_position: "lib/website-builder/theme-css.ts",
    badge_radius: "lib/website-builder/theme-css.ts",
    badge_sale_show: "lib/storelib-theme/resolve.ts",
    badge_sale_text: "lib/storelib-theme/resolve.ts",
    badge_sale_bg: "lib/website-builder/theme-css.ts",
    badge_sale_color: "lib/website-builder/theme-css.ts",
    badge_soldout_bg: "lib/website-builder/theme-css.ts",
    badge_soldout_color: "lib/website-builder/theme-css.ts",
    cart_type: "lib/website-builder/theme-css.ts",
    free_shipping_threshold: "components/website-builder/theme/ThemePage.tsx",
    free_shipping_bar: "components/website-builder/theme/ThemePage.tsx",
    currency_code_enabled: "lib/storelib-theme/render.ts",
    social_show_in_footer: "components/website-builder/sections/renderers/FooterSection.tsx",
    social_show_in_header: "components/website-builder/theme/ThemeSocials.tsx",
    animations_enabled: "components/website-builder/theme/use-site-motion.ts",
    animation_style: "components/website-builder/theme/use-site-motion.ts",
    /* Round O (O5): the site's motion feel, printed as --t-motion-* by lib/storelib-ai/motion (themeVars). */
    motion_tier: "lib/storelib-ai/motion/index.ts",
    animation_duration: "components/website-builder/theme/use-site-motion.ts",
    animation_stagger: "components/website-builder/theme/use-site-motion.ts",
    intro_enabled: "components/website-builder/theme/site-intro.tsx",
    intro_video: "components/website-builder/theme/site-intro.tsx",
    intro_image: "components/website-builder/theme/site-intro.tsx",
    intro_background: "components/website-builder/theme/site-intro.tsx",
    intro_style: "components/website-builder/theme/site-intro.tsx",
    intro_duration: "components/website-builder/theme/site-intro.tsx",
    intro_size: "components/website-builder/theme/site-intro.tsx",
    intro_repeat: "components/website-builder/theme/site-intro.tsx",
    page_transition: "components/website-builder/theme/site-intro.tsx",
    page_transition_duration: "components/website-builder/theme/site-intro.tsx",
    announcement_bar_enabled: "components/website-builder/theme/ThemePage.tsx",
    menus: "lib/website-builder/sanitize-sections.ts",
    custom_css: "lib/website-builder/theme-css.ts",
  }
  for (const id of ["cookie_banner_show", "cookie_banner_text", "cookie_accept_text", "cookie_decline_text", "cookie_banner_enabled", "cookie_bg", "cookie_text_color"]) READERS[id] = "components/website-builder/theme/ThemePage.tsx"
  for (const p of SOCIAL_PLATFORMS) READERS[p.key] = "lib/website-builder/social-links.ts"
  for (const kind of ["product", "collection"]) {
    for (const part of ["style", "image_padding", "align", "radius", "border", "shadow"]) READERS[`${kind}_card_${part}`] = "lib/website-builder/theme-css.ts"
  }
  const unread = ids.filter((id) => !READERS[id])
  check("every setting in the panel names its reader", unread.length === 0, unread)
  /* Social platform keys are read through SOCIAL_PLATFORMS; product and collection card keys through CARD_KEYS. */
  const viaTable = (id: string) => SOCIAL_PLATFORMS.some((p) => p.key === id) || /^(product|collection)_card_/.test(id)
  const missing = ids.filter((id) => READERS[id] && !viaTable(id) && !new RegExp(`\\b${id}\\b`).test(read(READERS[id])))
  check("and that file reads it", missing.length === 0, missing)
  check("the card keys are read through the theme stylesheet's table", /style: "product_card_style"/.test(read("lib/website-builder/theme-css.ts")) && /style: "collection_card_style"/.test(read("lib/website-builder/theme-css.ts")))
}

console.log("\nLayout reaches the page")
{
  const t = { page_width: 1440, content_padding_x: 48, section_gap: 24, spacing_scale: 1.5, border_radius: 14 } as unknown as ThemeSettingsValues
  const vars = themeVars(t)
  check("Max page width is --theme-page-width", vars["--theme-page-width"] === "1440px")
  check("Side padding is --theme-padding-x", vars["--theme-padding-x"] === "48px")
  check("Spacing scale is --theme-spacing-scale", vars["--theme-spacing-scale"] === "1.5")
  check("Card corner radius is theme.radius.medium, which every section's --s-radius prints", (themeTokens(t as Record<string, unknown>).radius as { medium: number }).medium === 14)
  const css = themeStylesheet(t)
  check("Section gap puts a margin between body sections", /\[data-section-box\]:not\(\[data-chrome\]\) ~ \[data-section-box\]:not\(\[data-chrome\]\)\{margin-top:var\(--theme-section-gap\);\}/.test(css))
  check("and none when it is 0", !/--theme-section-gap\)/.test(themeStylesheet({ section_gap: 0 } as unknown as ThemeSettingsValues)))
  const sections = untt(readFileSync(join(root, "themes/default/sources.generated.ts"), "utf8"), "themes/default/sources.generated.ts")
  check("the shipped sections read the page width, the side padding and the spacing scale", /var\(--theme-page-width/.test(sections) && /var\(--theme-padding-x/.test(sections) && /var\(--theme-spacing-scale/.test(sections))

  check("Card shadow, untouched, draws nothing", !("--theme-container-shadow" in parityVars({})))
  const shadowed = parityVars({ card_shadow: "md" })
  check("chosen, it is the cards' shadow", typeof shadowed["--theme-container-shadow"] === "string" && shadowed["--theme-container-shadow"] !== "none")
  check("on every [data-container]", /\[data-section\] \[data-container\]\{[^}]*box-shadow:var\(--theme-container-shadow\)/.test(themeStylesheet({ card_shadow: "md" } as unknown as ThemeSettingsValues)))
  check("an older Content containers shadow still wins", parityVars({ card_shadow: "lg", container_shadow: "sm" })["--theme-container-shadow"] === parityVars({ container_shadow: "sm" })["--theme-container-shadow"])
  check("the schema, the theme object and the stylesheet agree Card shadow starts at none", settings.find((f) => f.id === "card_shadow")?.default === "none" && (themeTokens({}).layout as { card_shadow: string }).card_shadow === "none")
}

console.log("\nButtons")
{
  check("Button shadow, switched on, is a shadow", themeVars({ button_shadow: true } as unknown as ThemeSettingsValues)["--theme-button-shadow"] !== "none")
  check("and off is none", themeVars({ button_shadow: false } as unknown as ThemeSettingsValues)["--theme-button-shadow"] === "none")
}

console.log("\nText styles: desktop and phone")
{
  check("no text style has a tablet size", TYPE_STYLE_KEYS.every((k) => !("tablet" in DEFAULT_TYPE_STYLES[k].size)))
  check("each has a desktop and a phone size", TYPE_STYLE_KEYS.every((k) => typeof DEFAULT_TYPE_STYLES[k].size.desktop === "number" && typeof DEFAULT_TYPE_STYLES[k].size.mobile === "number"))
  const old = responsiveSize({ desktop: 48, tablet: 40, mobile: 30 }, DEFAULT_TYPE_STYLES.h1.size)
  check("an old saved tablet size is dropped when there is a phone size", JSON.stringify(old) === JSON.stringify({ desktop: 48, mobile: 30 }), old)
  const noPhone = responsiveSize({ desktop: 48, tablet: 40 }, DEFAULT_TYPE_STYLES.h1.size)
  check("and stands in for the phone size when there is none, as a phone drew it", noPhone.mobile === 40 && noPhone.desktop === 48, noPhone)
  check("a single number is both sizes", JSON.stringify(responsiveSize(20, DEFAULT_TYPE_STYLES.body.size)) === JSON.stringify({ desktop: 20, mobile: 20 }))
  const typo = themeTypography({ typography_styles: { h1: { size: { desktop: 60, tablet: 50, mobile: 34 } } } })
  check("a theme saved with three sizes reads as two", typo.styles.h1.size.desktop === 60 && typo.styles.h1.size.mobile === 34 && !("tablet" in typo.styles.h1.size))
  const stored = stripTypeStyleDefaults({ ...DEFAULT_TYPE_STYLES.h2, size: { desktop: 40, mobile: 28 } }, DEFAULT_TYPE_STYLES.h2)
  check("what is stored has no tablet in it", JSON.stringify(stored) === JSON.stringify({ size: { desktop: 40, mobile: 28 } }), stored)
  const css = typographyStylesheet("[r]", themeTypography({}))
  check("one phone breakpoint in the stylesheet", (css.match(/@container/g) ?? []).length === 1 && /@container \(max-width:767px\)/.test(css) && !/1023px/.test(css))
  check("a section's custom size has no tablet variable", !/size-tablet/.test(css))
  const panel = read("components/website-builder/editor/design-panels.tsx")
  check("the style editor shows Desktop and Phone, not Tablet", /label="Desktop"/.test(panel) && /label="Phone"/.test(panel) && !/label="Tablet"/.test(panel))
}

console.log("\nSocial links")
{
  const keys = SOCIAL_PLATFORMS.map((p) => p.key as string)
  const wanted = ["instagram", "tiktok", "youtube", "twitter", "facebook", "pinterest", "linkedin", "threads", "spotify", "soundcloud", "discord", "website", "email"]
  check("every platform the owner named is there", wanted.every((k) => keys.includes(`social_${k}`)), wanted.filter((k) => !keys.includes(`social_${k}`)))
  check("each is a field in Social links", keys.every((k) => group("social")?.fields.some((f) => f.id === k)))
  check("each has a mark", keys.every((k) => typeof SOCIAL_ICON_PATHS[k as keyof typeof SOCIAL_ICON_PATHS] === "string" && SOCIAL_ICON_PATHS[k as keyof typeof SOCIAL_ICON_PATHS].startsWith("M")))
  check("no two platforms share a mark", new Set(Object.values(SOCIAL_ICON_PATHS)).size === keys.length)
  check("an email address becomes a mailto link", socialEmailUrl("hello@fern.shop") === "mailto:hello@fern.shop" && socialEmailUrl("mailto:hello@fern.shop") === "mailto:hello@fern.shop")
  check("and nothing else does", socialEmailUrl("javascript:alert(1)") === "" && socialEmailUrl("not an email") === "" && socialEmailUrl("a@b.c<script>") === "")
  check("a web address in the Email field is not a link", socialLinks({ social_email: "https://example.com" }).length === 0)
  check("an email in a profile field is not a link", socialLinks({ social_instagram: "fern@example.com" }).length === 0)
  check("a template's shop.socials has the email too", shopObject({ social_email: "hello@fern.shop" }).socials.some((s) => s.key === "email" && s.url === "mailto:hello@fern.shop"))

  const theme = {
    brand_name: "Fern",
    social_instagram: "https://instagram.com/fern",
    social_spotify: "https://open.spotify.com/artist/1",
    social_soundcloud: "soundcloud.com/fern",
    social_website: "https://fern.example",
    social_email: "hello@fern.shop",
    social_tiktok: "",
  } as unknown as ThemeSettingsValues
  const section = { id: "f", type: "footer", name: "Footer", settings: { text_color: "#445566" }, blocks: [] } as unknown as SectionInstance
  const html = renderToStaticMarkup(createElement(StorefrontProvider, { value: {}, children: createElement(FooterSection, { section, theme }) }))
  const row = html.match(/<ul[^>]*data-social-icons[^>]*>[\s\S]*?<\/ul>/)?.[0] ?? ""
  const drawn = [...row.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
  check("the footer draws only the filled-in ones, in order", drawn.join(",") === "Instagram,Spotify,SoundCloud,Website,Email", drawn)
  check("as inline marks in currentColor", (row.match(/<svg[^>]*fill="currentColor"/g) ?? []).length === 5 && !/<img/.test(row))
  check("hidden from screen readers, the link carrying the name", (row.match(/aria-hidden="true"/g) ?? []).length === 5)
  check("in the footer's text colour", (row.match(/style="color:#445566"/g) ?? []).length === 5, row.slice(0, 400))
  check("a profile opens in a new tab, an email does not", /href="https:\/\/open\.spotify\.com\/artist\/1"[^>]*target="_blank"/.test(row) && /href="mailto:hello@fern\.shop"(?![^>]*target=)/.test(row))
  check("a bare soundcloud.com address got its https", row.includes('href="https://soundcloud.com/fern"'))
  const off = renderToStaticMarkup(createElement(FooterSection, { section, theme: { ...theme, social_show_in_footer: false } as ThemeSettingsValues }))
  check("Show icons in footer, off, takes them away", !off.includes("data-social-icons"))
  const none = renderToStaticMarkup(createElement(FooterSection, { section, theme: { brand_name: "Fern" } as unknown as ThemeSettingsValues }))
  check("no links, no empty row", !none.includes("data-social-icons"))
}

console.log("\nThe free shipping bar counts the real cart")
{
  const page = read("components/website-builder/theme/ThemePage.tsx")
  /* Round R3: in cents, counted against the typed amount or the one the shop's rates make free (lib/website-builder/site-commerce freeShippingLine). */
  check("it reads the site cart's subtotal", /const subtotalCents = useSiteCart\(\)\.subtotalCents/.test(page) && /* Changed on purpose (the owner: currency in the builder like the live site): the amount left is written in the market's currency (useMoney). */ /freeShippingLine\(subtotalCents, fromCents, money\)/.test(page) && /* Changed on purpose (more currencies): at the rate, as checkout converts shipping, never rounded up as a price. */ /const money = useAmountMoney\(\)/.test(page))
  check("not an event nothing sends", !/addEventListener\("storelib:cart-count"/.test(page))
}

console.log("\nThe developer docs")
{
  const styling = DEVELOPER_DOCS["styling"] ?? ""
  const themes = DEVELOPER_DOCS["themes"] ?? ""
  const builder = DEVELOPER_DOCS["website-builder"] ?? ""
  check("how a section picks its scheme", /## How a section picks its scheme|### How a section picks its scheme/.test(styling) && /default_color_scheme/.test(styling) && /color_scheme_remaps/.test(styling))
  check("every scheme.* name, with its CSS variable", /@\[scheme-vars\]/.test(styling))
  check("which colour wins: scheme, Advanced colors, the section's own", /### Which colour wins/.test(styling) && /color_overrides/.test(styling))
  check("typography is two sizes in every page that describes it", !/desktop, tablet and phone/.test(styling + themes + builder) && /desktop and one for phones/.test(themes))
  check("the settings that moved are listed with where they went", /### Settings taken out of the panel/.test(themes) && /### Settings that moved/.test(builder))
  check("the generated file is the markdown's", styling === read("content/developers/styling.md").trimEnd() + "\n" || styling.trim() === read("content/developers/styling.md").trim())
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
