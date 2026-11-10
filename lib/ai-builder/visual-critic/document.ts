/**
 * ===========================================================================
 *  A DRAFT PAGE AS ONE STATIC HTML DOCUMENT, FOR THE CRITIC'S BROWSER
 * ===========================================================================
 * The critic photographs the DRAFT, which no URL serves to the public (and
 * should not: a draft is the creator's until they publish). So the page is
 * drawn here, from the job's own project (the agent's ProjectStore: this
 * install's files, pages and draft Theme settings, nothing else), with the
 * same pieces the live site draws with:
 *
 *   renderStorelibSection   the pure template interpreter (data in, escaped
 *                           markup out), with the creator's products and
 *                           menus as the render check uses them
 *   themeVars/Stylesheet    the theme's variables and stylesheet
 *   fontStylesheetHref      the fonts it names
 *   withUniversalChrome     a page wears home's header and footer
 *
 * NO SCRIPT. A section's script is never part of its html (the runtime hands
 * it to the sandbox frame separately), and this document is held to that
 * twice more: every <script>, inline handler (on*=) and javascript: address
 * is stripped from the markup, and a Content-Security-Policy meta forbids
 * scripts outright. The browser that opens it also has JavaScript switched
 * off (./shoot.ts). What is photographed is the server-rendered markup and
 * its CSS: what a visitor sees before any script, and the state a section
 * must look right in without one (spec 9.1: "content must be visible in
 * no-JS or failure scenarios").
 *
 * Drawn as a VISITOR sees it (in_editor false): a picture slot the creator
 * has not filled is drawn the way the live page draws it, so an empty grey
 * box or "add your photo" copy is seen and reported, not hidden behind the
 * editor's placeholder.
 *
 * Pure: no browser, no network, no database.
 */
import { renderStorelibSection, isStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { fontStylesheetHref, sectionFamilies } from "@/lib/website-builder/font-link"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { chromeOf, withUniversalChrome, CHROMELESS_PAGES, withoutChrome, homeChromeOnly } from "@/lib/website-builder/universal-chrome"
import { templateSample } from "../render-check"
import type { RuntimeCapabilities } from "../runtime-contract"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontData } from "@/lib/storelib-theme/types"

export interface DraftDocumentInput {
  page: string
  /** Every page of the draft, by key (home's chrome is borrowed by the others). */
  pages: { key: string; sections: SectionInstance[] }[]
  settings: Record<string, unknown>
  /** Section files by path. */
  sources: Record<string, string>
  capabilities?: RuntimeCapabilities | null
}

export interface DraftDocument {
  html: string
  /** Sections drawn, in order, with their type. */
  drawn: { id: string; type: string }[]
  failed: { id: string; type: string; error: string }[]
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * The page's markup, with nothing that could run. Belt and braces: the
 * runtime already keeps scripts out of `html`, and the browser has JS off.
 */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<(iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action|formaction)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}

/** No script may run, whatever the markup says; pictures, fonts and styles from anywhere https may load. */
export const CRITIC_CSP = "default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; style-src 'unsafe-inline' https:; font-src https: data:; img-src https: http: data: blob:; media-src https: data:"

function storefront(settings: Record<string, unknown>, capabilities: RuntimeCapabilities | null | undefined): { data: StorefrontData; products: ProductCard[] } {
  const caps = capabilities?.products ?? []
  return {
    data: { menus: cleanMenus(settings.menus), catalog: caps.map((p) => ({ id: p.id, type: p.kind, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url } })) } as unknown as StorefrontData,
    products: caps.map((p) => ({ id: p.id, type: "product", price_cents: 0, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url, available: p.available, kind: p.kind, slug: p.url.replace(/^\/products\//, ""), image: "", images: [], compare_price: "", variants: p.variants.map((v) => ({ ...v, available: true })) } })) as unknown as ProductCard[],
  }
}

export function composeDraftDocument(input: DraftDocumentInput): DraftDocument {
  const theme = input.settings as unknown as ThemeSettingsValues
  const own = input.pages.find((p) => p.key === input.page)?.sections ?? []
  const home = input.pages.find((p) => p.key === "home")?.sections ?? []
  const sections = CHROMELESS_PAGES.has(input.page) ? withoutChrome(own) : withUniversalChrome(own, chromeOf(home, { homeOnly: homeChromeOnly(input.settings) }))
  const template = templateForPage(input.page)
  const base = storefront(input.settings, input.capabilities)
  const sample = templateSample({ template, products: base.products, data: base.data })
  const page = { ...sample.page, in_editor: false }

  const drawn: DraftDocument["drawn"] = []
  const failed: DraftDocument["failed"] = []
  const parts: string[] = []
  for (const section of sections) {
    if (section.hidden) continue
    if (!isStorelibSection(section.type, input.sources)) {
      /* A built-in React section (the platform's own header or footer on a theme site): a stand-in of its usual height, not judged. */
      const height = section.type === "header" ? 72 : section.type === "footer" ? 220 : 120
      parts.push(`<div data-critic-standin="${escapeAttr(section.type)}" style="height:${height}px;background:var(--theme-bg)"></div>`)
      continue
    }
    try {
      const out = renderStorelibSection(section, theme, page, input.sources, base.products, sample.data)
      if (out.ok === false) {
        failed.push({ id: section.id, type: section.type, error: out.errors.map((e) => e.message).join("; ").slice(0, 300) })
        continue
      }
      drawn.push({ id: section.id, type: section.type })
      /* The optimizer's addresses are the site's own (/_next/image): outside the site they resolve nowhere, so the original is drawn. */
      const html = stripScripts(out.html).replace(/\s(srcset|sizes)="[^"]*"/g, "")
      const css = out.css ? out.css.replace(/<\/style/gi, "<\\/style") : ""
      parts.push(`<div data-critic-section="${escapeAttr(section.id)}" data-critic-type="${escapeAttr(section.type)}" id="section-${escapeAttr(section.id)}">${css ? `<style>${css}</style>` : ""}${html}</div>`)
    } catch (thrown) {
      failed.push({ id: section.id, type: section.type, error: thrown instanceof Error ? thrown.message.slice(0, 300) : "it threw while drawing" })
    }
  }
  const vars = Object.entries(themeVars(theme))
    .map(([k, v]) => `${k}:${String(v).replace(/[;"<>]/g, "")}`)
    .join(";")
  const font = fontStylesheetHref(input.settings, sectionFamilies(sections))
  /*
    Motion settled to its end state (and reduced motion is asked for by the
    browser too): an entrance animation photographed mid-way reads as an
    empty section, and without JavaScript a reveal never starts.
  */
  const settle = "html,body{margin:0;padding:0}*,*::before,*::after{animation-delay:0s!important;animation-duration:0.001s!important;animation-iteration-count:1!important;transition:none!important}"
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttr(CRITIC_CSP)}"><meta name="viewport" content="width=device-width,initial-scale=1">${font ? `<link rel="stylesheet" href="${escapeAttr(font)}">` : ""}<style>${settle}</style></head><body><div ${THEME_ROOT_ATTRIBUTE}="" style="${escapeAttr(vars)};container-type:inline-size"><style>${themeStylesheet(theme)}</style>${parts.join("")}</div></body></html>`
  return { html, drawn, failed }
}
