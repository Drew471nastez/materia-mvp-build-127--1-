/**
 * ===========================================================================
 *  ROUND BC: DOMAINS IN WEBSITE SETTINGS, ADD DOMAIN IN PUBLISH, MENU LINKS
 *  IN A NEW TAB, AND THE STORE'S MENUS KEPT ACROSS THEMES
 * ===========================================================================
 * Website settings › Domains: "when I click the selector it bugs the page and
 * it doesn't open". The registrar list was z-50, portalled to the body, under
 * the z-150 settings page: it opened unseen while Radix blocked every press
 * on the page. Lists now sit above every layer (scripts/check-website-domains.mjs
 * measures it in a browser).
 *
 * Publish › Website URL has "+ Add domain" and, on a plan without domains, a
 * Pro pill that goes to the upgrade page; with domains it opens a window that
 * connects one through app/api/domains (scripts/check-publish-domain.mjs).
 *
 * A menu link set to "Open in a new tab" opens in one: on native headers,
 * drawers and footers, in coded sections, and in imported themes (header,
 * drawer, mega menu, footer), live and in the canvas.
 *
 * Adding or publishing a website keeps the store's menus instead of the new
 * theme's own (lib/website-builder/store-menus-server.ts ensureStoreMenus).
 *
 * Run with:  npx tsx tests/round-bc-domains.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NEW_TAB_MARK, newTabLink, withNewTabAnchors } from "../lib/website-builder/new-tab"
import { headerMenuBlocks } from "../lib/website-builder/header-settings"
import { linklistObject } from "../lib/storelib-theme/compat/objects"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage, drawSection, pageContextFor, type StoredSection } from "../lib/storelib-theme/compat/page"
import { menuFromHeader } from "../lib/website-builder/storefront-data"
import { pointAtStoreMenus } from "../lib/website-builder/main-menu"
import { ensureStoreMenus } from "../lib/website-builder/store-menus-server"
import type { SectionInstance } from "../lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("\nA select's list opens over Website settings\n")
  {
    const select = code("components/ui/select.tsx")
    const settings = code("components/website-builder/project-settings.tsx")
    const z = Number(select.match(/relative z-\[(\d+)\] max-h-\(--radix-select-content-available-height\)/)?.[1] ?? 0)
    const page = Number(settings.match(/wb-settings-in fixed inset-0 z-\[(\d+)\]/)?.[1] ?? Infinity)
    check("the list's layer is above Website settings' page", z > page, { z, page })
    check("and not under the popovers either", z >= 2147483640, z)
    check("Escape in an open list closes the list, not Website settings", /* Changed on purpose (templates round 21): the way out is onExit when the Website page sent the creator here. */ /e\.key === "Escape" && !e\.defaultPrevented\) \(onExit \?\? onClose\)\(\)/.test(settings))
  }

  console.log("\nPublish › Website URL › + Add domain\n")
  {
    const route = code("app/api/domains/route.ts")
    check("GET /api/domains says whether this plan may connect one, by POST's own gate", /const gate = siteGate\(await creatorSitePlan\(owner\.creatorId\), "customDomain"\)/.test(route) && /canConnect: gate === null/.test(route))
    const panel = code("components/website-builder/publish-panel.tsx")
    check("the Website URL line carries Add domain on its right", /<p className="text-\[15px\] font-medium">\{tt\("Website URL"\)\}<\/p>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<AddDomainActions/.test(panel))
    check("a connected domain is a row of the URL card", /<DomainCardRow domain=/.test(panel))
    /* Round 22: in the editor, Add domain opens Website settings' Domains (onDomains) instead of the window; elsewhere the window as before. */
    check("the window takes the panel's place and gives it back", /onOpenChange\(false\)\s*if \(onDomains\) onDomains\(\)\s*else setDomainOpen\(true\)/.test(panel) && /setDomainOpen\(false\)\s*onOpenChange\(true\)/.test(panel))
    check("the panel's own click away is left as it was", /if \(panelRef\.current\?\.contains\(t\) \|\| anchorRef\.current\?\.contains\(t\)\) return/.test(panel))
    const domain = code("components/website-builder/publish-domain.tsx")
    /* Changed on purpose (round 25, the owner: Add domain "should take me to the domains in the website settings"): every plan opens Website settings › Domains, where the plan is explained; the Pro pill still says it here. */
    check("a plan without domains: the Pro pill with a lightning mark, and the same way to Website settings", /data-publish-pro=""/.test(domain) && /<path d=\{BOLT_PATH\} \/>/.test(domain) && /fill="#ffffff"/.test(domain) && /bg-\[#2c2c2c\]/.test(domain) && !/href=\{UPGRADE_HREF\}/.test(domain) && /<button type="button" onClick=\{onAdd\}/.test(domain))
    check("connecting uses the same routes as Website settings", /fetch\("\/api\/domains", \{\s*method: "POST"/.test(domain) && /fetch\("\/api\/domains\/verify"/.test(domain) && /purpose: "website", replace: Boolean\(current\)/.test(domain))
    check("the records are the same three steps", /<DnsSetup[\s\S]{0,600}tone="dark"/.test(domain))
    check("a phone gets a bottom sheet, a computer a window", /<MobileEditorSheet/.test(domain) && /createPortal\(/.test(domain) && /role="dialog"/.test(domain))
    check("no banned words in it", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge)\b/i.test(domain) && !/—/.test(domain.replace(/\/\*[\s\S]*?\*\//g, "")))
  }

  console.log("\nA link set to open in a new tab\n")
  {
    check("the mark comes off and target and rel go on", newTabLink(`/about${NEW_TAB_MARK}`).href === "/about" && newTabLink(`/about${NEW_TAB_MARK}`).target === "_blank" && newTabLink(`/about${NEW_TAB_MARK}`).rel === "noopener noreferrer")
    check("an unmarked link is left alone", JSON.stringify(newTabLink("/about")) === JSON.stringify({ href: "/about" }))
    const html = withNewTabAnchors(`<a href="/about#_blank" class="x">A</a><a class="y" href='https://x.test/#_blank' target="_self" rel="nofollow">B</a><a href="/c">C</a><a href="#_blank">D</a><a data-href="/e#_blank" href="/e">E</a>`)
    check("in markup: a marked link is a real new tab link", html.includes(`<a href="/about" class="x" target="_blank" rel="noopener noreferrer">A</a>`), html)
    check("  the theme's own target gives way and its rel is kept", html.includes(`<a class="y" href='https://x.test/' target="_blank" rel="nofollow noopener noreferrer">B</a>`), html)
    check("  and nothing else changes", html.includes(`<a href="/c">C</a>`) && html.includes(`<a href="#_blank">D</a>`) && html.includes(`<a data-href="/e#_blank" href="/e">E</a>`), html)

    const blocks = headerMenuBlocks("main-menu", { "main-menu": { title: "Main", links: [{ title: "Blog", url: `https://blog.test${NEW_TAB_MARK}`, links: [{ title: "Docs", url: `/docs${NEW_TAB_MARK}` }] }, { title: "Shop", url: "/products" }] } })
    check("a native header reads the menu's new tab as its link's own setting", blocks?.[0].settings.url === "https://blog.test" && blocks?.[0].settings.open_in_new_tab === true && blocks?.[1].settings.url === "/docs" && blocks?.[1].settings.open_in_new_tab === true && blocks?.[2].settings.open_in_new_tab === false, blocks)
    const header = code("components/website-builder/sections/renderers/HeaderSection.tsx")
    check("  its links, dropdowns and drawer draw it as target=_blank", /const openInNew = opensInNew\(block\)/.test(header) && /const childOpenInNew = opensInNew\(child\)/.test(header) && /openInNew: opensInNew\(b\)/.test(header) && /openInNew: opensInNew\(c\)/.test(header))
    check("  and the phone drawer lets the new tab open instead of following it here", /handleLinkClick\(item\.href, item\.openInNew\)/.test(header) && /handleLinkClick\(child\.href, child\.openInNew\)/.test(header) && /if \(!onEditorNavigate && \(openInNew \|\|/.test(header))
    check("  a header link's own address never carries the mark", /return withoutNewTab\(url\) \|\| "#"/.test(header))
    const footer = code("components/website-builder/sections/renderers/FooterSection.tsx")
    check("a native footer's menu columns and links draw it too", (footer.match(/\{\.\.\.newTabLink\(link\.url\)\}/g) ?? []).length === 2)
    /* Changed on purpose (round Q): the icons pass (withStorelibIcons) now wraps it; the new tab pass still sees every anchor. */
    check("a coded section's markup is passed through it", /html: (?:withStorelibIcons\()?withNewTabAnchors\(optimizeSectionMedia\(r\.html\)\)/.test(code("lib/website-builder/storelib-runtime.ts")))
    const made = menuFromHeader({ id: "h", type: "header", settings: {}, blocks: [{ id: "a", type: "nav_link", settings: { label: "Blog", url: "https://blog.test", open_in_new_tab: true } }, { id: "b", type: "nav_link", settings: { label: "Shop", url: "/products" } }] } as unknown as SectionInstance)
    check("a Main menu made from the header's links keeps their new tab", made?.links[0].url === `https://blog.test${NEW_TAB_MARK}` && made?.links[1].url === "/products", made)

    const list = linklistObject("main-menu", "Main", [{ title: "About", url: `/about${NEW_TAB_MARK}` }], "/about") as { links: { url: string; active: boolean; type: string }[] }
    check("an imported theme's link keeps the mark in link.url and is still read as what it is", list.links[0].url === `/about${NEW_TAB_MARK}` && list.links[0].active === true && list.links[0].type === "http_link", list.links[0])

    const section = (type: string, markup: string, settings: unknown[] = []) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings })}\n</schema>\n`
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head></head><body>{% sections 'header-group' %}{{ content_for_layout }}{% sections 'footer-group' %}</body></html>`),
      "sections/header.storelib": section("header", `<nav>{%- for link in section.settings.menu.links -%}<a href="{{ link.url }}" class="nav">{{ link.title }}</a><details><summary>{{ link.title }}</summary>{%- for c in link.links -%}<a href="{{ c.url }}" class="mega">{{ c.title }}</a>{%- endfor -%}</details>{%- endfor -%}</nav>`, [{ type: "link_list", id: "menu", default: "main-menu" }]),
      "sections/footer.storelib": section("footer", `<footer>{%- for link in linklists.footer.links -%}<a href="{{ link.url }}" class="foot">{{ link.title }}</a>{%- endfor -%}</footer>`),
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const menus = {
      "main-menu": { title: "Main", links: [{ title: "Blog", url: `https://blog.test/${NEW_TAB_MARK}`, links: [{ title: "Lookbook", url: `/pages/lookbook${NEW_TAB_MARK}` }] }, { title: "Shop", url: "/collections/all" }] },
      footer: { title: "Footer", links: [{ title: "Instagram", url: `https://instagram.com/x${NEW_TAB_MARK}` }, { title: "Search", url: "/search" }] },
    }
    const sections: StoredSection[] = [
      { id: "h", type: "header", settings: { menu: "main-menu" }, blocks: [], group: "header" } as unknown as StoredSection,
      { id: "f", type: "footer", settings: {}, blocks: [], group: "footer" } as unknown as StoredSection,
    ]
    const page = { template: "index", path: "/", designMode: false, products: [], collections: [], menus, shop: { name: "S" } } as never
    let drawn = ""
    try {
      drawn = drawPage(theme, page, sections, { scripts: false }).html
    } catch (e) {
      drawn = String(e)
    }
    check("an imported theme's header link opens in a new tab", /<a href="https:\/\/blog\.test\/" class="nav" target="_blank" rel="noopener noreferrer">Blog<\/a>/.test(drawn), drawn.slice(0, 600))
    check("  so does its mega menu's", /<a href="\/pages\/lookbook" class="mega" target="_blank" rel="noopener noreferrer">Lookbook<\/a>/.test(drawn), drawn.slice(0, 600))
    check("  and its footer's", /<a href="https:\/\/instagram\.com\/x" class="foot" target="_blank" rel="noopener noreferrer">Instagram<\/a>/.test(drawn), drawn.slice(-400))
    check("  and a link not set to is left as it was", /<a href="\/collections\/all" class="nav">Shop<\/a>/.test(drawn) && /<a href="\/search" class="foot">Search<\/a>/.test(drawn))
    check("  with no mark left anywhere on the page", !drawn.includes(NEW_TAB_MARK))
    let one = ""
    try {
      one = drawSection(theme, pageContextFor(theme, page, sections), sections[0], 0, "header-group").html
    } catch (e) {
      one = String(e)
    }
    check("a section drawn again in the canvas (a live edit) carries it too", /class="nav" target="_blank" rel="noopener noreferrer"/.test(one) && !one.includes(NEW_TAB_MARK), one.slice(0, 300))
  }

  console.log("\nThe store's menus, kept when a theme is added or published\n")
  {
    const header = { id: "h", type: "header", settings: {}, blocks: [] } as unknown as SectionInstance
    const footer = { id: "f", type: "footer", settings: { show_newsletter: true }, blocks: [] } as unknown as SectionInstance
    const menus = { "main-menu": { title: "Main", links: [{ title: "Home", url: "/" }] }, footer: { title: "Footer", links: [{ title: "FAQ", url: "/faq" }] }, legal: { title: "Legal", links: [{ title: "Terms", url: "/policies/terms" }] }, empty: { title: "Empty", links: [] } }
    const plain = pointAtStoreMenus([header, footer], menus)
    check("a new footer names the store's footer menu", plain[1].settings.menu === "footer" && plain[1].settings.show_newsletter === true, plain[1].settings)
    check("  a new header is left to read the Main menu by itself", plain[0] === header)
    const carried = pointAtStoreMenus([header, footer], menus, { header: { menu: "legal" }, footer: { menu: "legal", menu_heading: "Small print", menu_2: "empty" } })
    check("  or the menus the live website names, with their headings", carried[0].settings.menu === "legal" && carried[1].settings.menu === "legal" && carried[1].settings.menu_heading === "Small print" && carried[1].settings.menu_2 === undefined, carried.map((s) => s.settings))
    const own = { ...footer, settings: { menu: "mine" } } as unknown as SectionInstance
    check("  a footer that names a menu already keeps it", pointAtStoreMenus([own], menus)[0] === own)
    check("  and nothing is named when the store has no such menu", pointAtStoreMenus([footer], {})[0] === footer)

    /* A store with no row yet: the live website's menus are written as the store's, its header's own links as the Main menu. */
    const writes: unknown[] = []
    const fake = (rows: Record<string, unknown>) => ({
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: table === "store_theme_installs" ? rows.installs : [], error: null }),
          maybeSingle: () => Promise.resolve({ data: table === "store_menus" ? rows.stored ?? null : null, error: null }),
          upsert: (v: unknown) => {
            writes.push(v)
            return Promise.resolve({ error: null })
          },
        }
        return chain
      },
    })
    const live = {
      id: "live",
      status: "published",
      store_theme_settings: [{ settings: { menus: { footer: { title: "Footer", links: [{ title: "FAQ", url: "/faq" }] } } }, draft_settings: null }],
      store_theme_pages: [{ page_key: "home", sections: [{ id: "h", type: "header", settings: {}, blocks: [{ id: "a", type: "nav_link", settings: { label: "Courses", url: "/courses" } }] }, { id: "f", type: "footer", settings: { menu: "footer" }, blocks: [] }] }],
    }
    const draft = { id: "new", status: "draft", store_theme_settings: [{ settings: { menus: {} } }], store_theme_pages: [] }
    const got = await ensureStoreMenus(fake({ installs: [draft, live] }), "c1", { excludeInstallId: "new" })
    const written = (writes[0] as { menus?: Record<string, { links: { title: string }[] }> } | undefined)?.menus
    check("with no store row, the live website's menus are written as the store's", written?.["main-menu"]?.links[0]?.title === "Courses" && written?.footer?.links[0]?.title === "FAQ", writes)
    check("  and handed back with the footer that named them", got?.stored === true && got.footer?.menu === "footer", got)
    writes.length = 0
    const kept = await ensureStoreMenus(fake({ installs: [live], stored: { menus: { "main-menu": { title: "Main", links: [{ title: "Mine", url: "/" }] } } } }), "c1")
    check("a store that has its row keeps it, untouched", writes.length === 0 && kept?.menus["main-menu"].links[0].title === "Mine")
    writes.length = 0
    const first = await ensureStoreMenus(fake({ installs: [{ ...draft, id: "other", store_theme_settings: [{ settings: { menus: { footer: { title: "Other", links: [{ title: "X", url: "/x" }] } } } }] }, { ...draft, id: "going", store_theme_settings: [{ settings: { menus: { footer: { title: "Mine", links: [{ title: "Y", url: "/y" }] } } } }] }] }), "c1", { names: false, preferInstallId: "going" })
    check("a first publish keeps the menus of the website going live", (writes[0] as { menus: Record<string, { title: string }> } | undefined)?.menus.footer.title === "Mine", first)

    const add = code("app/api/website-builder/themes/add/route.ts")
    check("adding a theme writes the store's menus down first and names them", /const carried = await ensureStoreMenus\(admin, creator\.id, \{ excludeInstallId: newInstall\.id as string \}\)/.test(add) && /pointAtStoreMenus\(preset\.pages\.home, carried\.menus, carried\)/.test(add) && /sections: homeSections/.test(add))
    check("  without the table, the new website gets its own copy", /carried && !carried\.stored \? \{ \.\.\.preset\.settings, menus: carried\.menus \}/.test(add))
    check("importing a theme does the same before its menus are read", /await ensureStoreMenus\(admin, creatorId, \{ excludeInstallId: data\.id as string \}\)/.test(code("app/api/website-builder/themes/import/route.ts")))
    const publish = code("app/api/website-builder/themes/[installId]/publish/route.ts")
    check("publishing writes them down while the old website is still live", publish.indexOf("await ensureStoreMenus(admin, creator.id, { names: false, preferInstallId: installId })") > 0 && publish.indexOf("ensureStoreMenus(admin") < publish.indexOf('admin.rpc("publish_theme_install"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
