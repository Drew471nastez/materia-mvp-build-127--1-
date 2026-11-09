/**
 * The default render check: L4's (lib/ai-builder/render-check.ts renderCheck)
 * over the page as the engine holds it, a server side template render with
 * no generated code executed. On the real services server.ts swaps in
 * renderCheckForInstall, which reads the page the way a preview link draws it.
 */
import { renderCheck } from "../render-check"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { templateForPage } from "@/lib/website-builder/site-pages"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { RenderChecker } from "./ports"

export const renderCheckPage: RenderChecker = async ({ page, sections, settings, sources, routes, capabilities }) => {
  const r = await renderCheck({
    page,
    sections,
    sources,
    theme: settings as unknown as ThemeSettingsValues,
    template: templateForPage(page),
    /* This creator's products as the catalogue pickers resolve against, from list_capabilities (the live path dresses the page from the shop itself). */
    data: { menus: cleanMenus(settings.menus), catalog: (capabilities?.products ?? []).map((p) => ({ id: p.id, type: p.kind, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url } })) } as unknown as StorefrontData,
    /* The shop as the shop, collection and search templates list it, and the product a product template is drawn with (round N: render-check.ts templateSample). */
    products: (capabilities?.products ?? []).map((p) => ({ id: p.id, type: "product", price_cents: 0, settings: { title: p.title, url: p.url, price: p.price, checkout_url: p.checkout_url, available: p.available, kind: p.kind, slug: p.url.replace(/^\/products\//, ""), image: "", images: [], compare_price: "", variants: p.variants.map((v) => ({ ...v, available: true })) } })) as unknown as ProductCard[],
    ...(capabilities ? { capabilities } : {}),
    extraRoutes: [...routes],
  })
  return { ok: r.ok, issues: r.issues, htmlBytes: r.htmlBytes }
}
