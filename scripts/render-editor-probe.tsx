/**
 * THE REAL EDITOR, IN A REAL BROWSER, WITH THE NETWORK REPLACED.
 *
 * Every earlier attempt at the scroll freeze reasoned about the editor from
 * its source and shipped a guard. Six reports later this mounts the actual
 * `StoreEditorPage` with `fetch` answered locally, so the sequence that is
 * reported — scroll, tap a section, scroll again, in and out of the code
 * editor and project settings — can be driven and MEASURED.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import StoreEditorPage from "@/app/website-builder/editor/[installId]/page"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"

const PLACEHOLDER = "https://example.invalid/picture.jpg"
const IMAGEY = new Set(["image_picker", "image_gallery"])
function instance(type: string, i: number): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const settings: Record<string, unknown> = { ...(preset?.settings ?? {}) }
  for (const f of schema.fields ?? []) {
    if (IMAGEY.has(f.type) && settings[f.id] === undefined) settings[f.id] = PLACEHOLDER
    if (!settings[f.id] && (f.id === "heading" || f.id === "title")) settings[f.id] = `Section ${i}: ${schema.name}`
    if (!settings[f.id] && (f.id === "subheading" || f.id === "body") && (f.type === "text" || f.type === "textarea" || f.type === "richtext")) settings[f.id] = "Body text so the page is tall enough to scroll."
  }
  const blocks = (preset?.blocks ?? []).map((b, j) => {
    const def = (schema.blocks ?? []).find((d) => d.type === b.type)
    const bs: Record<string, unknown> = { ...(b.settings ?? {}) }
    for (const f of def?.fields ?? []) if (IMAGEY.has(f.type) && bs[f.id] === undefined) bs[f.id] = PLACEHOLDER
    return { id: `${type}-${i}-b${j}`, type: b.type, settings: bs }
  })
  return { id: `${type}-${i}`, type, name: schema.name, settings, blocks }
}
/**
 * "Two sections on a page and selecting one takes me back to the top." A page
 * with ten sections is four screens tall and hides that; a short one is the
 * case being reported, so the probe can ask for it.
 */
const PAGE = (globalThis as unknown as { PROBE_SHORT?: boolean }).PROBE_SHORT
  ? ["header", "hero_centered", "features_grid", "footer"]
  : ["header", "hero_centered", "features_grid", "text_rich", "proof_testimonials", "faq_accordion", "cta_simple", "text_image", "promo_newsletter", "footer"]
/**
 * PROBE_HEADER sets the header's settings and gives it `links` menu links,
 * the second of them with three children (scripts/check-storefront-mobile-
 * drawer.mjs). Unset, the header is the schema's preset.
 */
const probeHeader = (globalThis as unknown as { PROBE_HEADER?: { settings?: Record<string, unknown>; links?: number } }).PROBE_HEADER
function withProbeHeader(s: SectionInstance): SectionInstance {
  if (s.type !== "header" || !probeHeader) return s
  const n = probeHeader.links ?? 0
  const links = Array.from({ length: n }, (_, k) => ({ id: `nav-${k}`, type: "nav_link", settings: { label: k === 1 ? "Services" : `Page ${k + 1}`, url: `#page-${k + 1}`, link_type: "custom" } as Record<string, unknown> }))
  if (n > 1) for (let j = 0; j < 3; j++) links.push({ id: `nav-1-${j}`, type: "nav_link", settings: { label: `Service ${j + 1}`, url: `#service-${j + 1}`, link_type: "custom", parent_id: "nav-1" } })
  return { ...s, settings: { ...s.settings, ...probeHeader.settings }, blocks: n ? links : s.blocks }
}
const sections = PAGE.map((t, i) => withProbeHeader(instance(t, i)))

const now = new Date().toISOString()
/**
 * PROBE_LIVE makes the website live, so Publish opens its panel rather than
 * saving; PROBE_CONNECTIONS is what the agent-activity route says is
 * connected (a ConnectionsBrief), read at the moment it is asked;
 * PROBE_SECURITY is what the security check answers, or "fail" for a check
 * that could not run (a 500). Unset, the site is clean.
 */
const probeGlobals = globalThis as unknown as {
  PROBE_LIVE?: boolean
  PROBE_CONNECTIONS?: unknown
  PROBE_SECURITY?: unknown
  /* The install's saved .storelib files, path to source (see the files route below). */
  PROBE_FILES?: Record<string, string>
  /**
   * A page's own sections by page key, answered after PROBE_PAGE_DELAY_MS
   * (scripts/check-page-switch.mjs). Unset, every page is the one above.
   * Every key but home is also a page the install has saved, so it is listed
   * wherever the editor lists pages (scripts/check-page-switcher.mjs).
   */
  PROBE_PAGES?: Record<string, string[]>
  PROBE_PAGE_DELAY_MS?: number
  /* The store's products, for the page switcher probe. */
  PROBE_PRODUCTS?: { id: string; title: string; slug?: string }[]
  /* The store's menus, as the theme route answers them (lib/website-builder/store-menus-server.ts); unset, the store keeps none. */
  PROBE_STORE_MENUS?: { available: boolean; stored: boolean; menus: Record<string, unknown> }
  /**
   * An imported Shopify theme (scripts/check-compat-editor.ts): its settings,
   * its pages' sections by key, its .storelib files and its own files under
   * shopify/, as the routes answer them for such an install.
   */
  PROBE_COMPAT?: { settings: Record<string, unknown>; pages: Record<string, unknown[]>; sources: Record<string, string>; files: Record<string, string> }
}
const compat = probeGlobals.PROBE_COMPAT
const install = {
  id: "probe-install", creator_id: "probe-creator", theme_id: "default", name: "Probe store", status: probeGlobals.PROBE_LIVE ? "published" : "draft",
  is_custom: false, parent_install_id: null, sort_order: 0, created_at: now, updated_at: now, published_at: probeGlobals.PROBE_LIVE ? now : null,
  settings: { id: "s1", install_id: "probe-install", settings: compat?.settings ?? {}, draft_settings: null, created_at: now, updated_at: now },
  pages: compat ? Object.keys(compat.pages).map((key, i) => ({ id: `p${i + 1}`, install_id: "probe-install", page_key: key, sections: [], created_at: now, updated_at: now })) : [
    { id: "p1", install_id: "probe-install", page_key: "home", sections: [], created_at: now, updated_at: now },
    ...Object.keys(probeGlobals.PROBE_PAGES ?? {})
      .filter((key) => key !== "home")
      .map((key, i) => ({ id: `p${i + 2}`, install_id: "probe-install", page_key: key, sections: [], created_at: now, updated_at: now })),
  ],
}

const calls: string[] = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  calls.push(`${init?.method ?? "GET"} ${url}`)
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  if (!url.startsWith("/api/")) return realFetch(input, init)
  /* PROBE_API_DELAY_MS: every route answers after this long, a signed-in round trip (scripts/check-editor-inspector.ts times the opening with it). */
  const apiDelay = (window as unknown as { PROBE_API_DELAY_MS?: number }).PROBE_API_DELAY_MS
  if (apiDelay) await new Promise((r) => setTimeout(r, apiDelay))
  if (/\/themes\/probe-install\/agent-activity/.test(url) && probeGlobals.PROBE_CONNECTIONS) {
    return json({ ready: true, cursor: 0, connections: probeGlobals.PROBE_CONNECTIONS, events: [] })
  }
  if (/\/themes\/probe-install\/security/.test(url)) {
    if (probeGlobals.PROBE_SECURITY === "fail") return new Response(JSON.stringify({ error: "Could not check the site just now. Try again." }), { status: 500, headers: { "content-type": "application/json" } })
    return json(probeGlobals.PROBE_SECURITY ?? { issues: [], truncated: false, checked_at: now })
  }
  /* Every save, kept as sent, so a probe can hold it against the routes' own schemas (scripts/check-compat-editor.ts). */
  if (init?.method === "PUT" && /\/themes\/probe-install\/(sections|settings)/.test(url)) {
    ;(window as unknown as { probeSaves: { url: string; body: unknown }[] }).probeSaves = [...((window as unknown as { probeSaves?: { url: string; body: unknown }[] }).probeSaves ?? []), { url, body: JSON.parse(String(init.body)) }]
  }
  /* PROBE_SAVE_FAIL, set by a probe at any moment: the next saves answer as the route would when it refuses. */
  const failWith = (window as unknown as { PROBE_SAVE_FAIL?: number }).PROBE_SAVE_FAIL
  if (failWith && init?.method === "PUT" && /\/themes\/probe-install\/sections$/.test(url)) {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: failWith, headers: { "content-type": "application/json" } })
  }
  if (/\/themes\/probe-install\/sections/.test(url) && compat) {
    if (init?.method && init.method !== "GET") return json({ ok: true })
    const key = new URL(url, location.href).searchParams.get("page") ?? "home"
    return json({ sections: compat.pages[key] ?? [], has_draft: false })
  }
  if (/\/themes\/probe-install\/files/.test(url) && compat) {
    return json({ files: new URL(url, location.href).searchParams.get("compat") === "1" ? compat.files : compat.sources })
  }
  if (/\/themes\/probe-install\/sections/.test(url)) {
    const key = new URL(url, location.href).searchParams.get("page") ?? "home"
    const own = probeGlobals.PROBE_PAGES?.[key]
    if (own) {
      await new Promise((r) => setTimeout(r, probeGlobals.PROBE_PAGE_DELAY_MS ?? 0))
      return json({ sections: own.map((t, i) => instance(t, i)), has_draft: false })
    }
    return json({ sections, has_draft: false })
  }
  if (/\/themes\/probe-install\/settings/.test(url)) return json({ settings: install.settings })
  /* PROBE_FILES: the install's saved .storelib files, path to source, so a probe can give the creator a section of their own. */
  if (/\/themes\/probe-install\/files/.test(url)) return json({ files: probeGlobals.PROBE_FILES ?? [] })
  if (/\/themes\/probe-install\/backups/.test(url)) return json({ backups: [] })
  /* The GitHub line on Connections (f8595a46) reads this route on open; the real one always answers with its lists. */
  if (/\/themes\/probe-install\/github/.test(url)) return json({ configured: true, ready: true, link: null, repos: [], accounts: [], events: [] })
  if (/\/themes\/probe-install\/agent-connections/.test(url)) return json({ connections: [], ready: true })
  if (/\/themes\/probe-install$/.test(url)) return json({ install, username: "probe", storeMenus: probeGlobals.PROBE_STORE_MENUS })
  /* A save of the store's menus: kept, so a probe can read what was sent. */
  if (/\/website-builder\/menus$/.test(url) && init?.method === "PUT") {
    ;(window as unknown as { probeMenusSaved: unknown[] }).probeMenusSaved = [...((window as unknown as { probeMenusSaved?: unknown[] }).probeMenusSaved ?? []), JSON.parse(String(init.body)).menus]
    return json({ menus: JSON.parse(String(init.body)).menus })
  }
  /* One product, as the product route answers it, after PROBE_PRODUCT_DELAY_MS[id] (scripts/check-product-switch.mjs: the first asked answering last). */
  const one = new URL(url, location.href).searchParams.get("id")
  if (/\/website-builder\/products/.test(url) && one) {
    const delays = (window as unknown as { PROBE_PRODUCT_DELAY_MS?: Record<string, number> }).PROBE_PRODUCT_DELAY_MS ?? {}
    await new Promise((r) => setTimeout(r, delays[one] ?? 0))
    return json({ product: (probeGlobals.PROBE_PRODUCTS ?? []).find((x) => x.id === one) ?? null })
  }
  /* PROBE_LIBRARY: the store's files, as /api/files answers (components/files/files-library.tsx); a delete is kept for the probe to read. */
  if (/^\/api\/files/.test(url)) {
    const lib = (window as unknown as { PROBE_LIBRARY?: unknown[]; probeDeleted?: unknown[] })
    if (init?.method === "DELETE") { lib.probeDeleted = [...(lib.probeDeleted ?? []), JSON.parse(String(init.body))]; return json({ ok: true }) }
    return json({ files: /kind=video/.test(url) ? [] : lib.PROBE_LIBRARY ?? [] })
  }
  if (/\/products/.test(url)) return json({ products: probeGlobals.PROBE_PRODUCTS ?? [] })
  if (/\/setup/.test(url)) return json({ setup: {} })
  return json({})
}

declare global { interface Window { probeCalls: string[] } }
window.probeCalls = calls

/** The page reads `params` with `use()`, which needs a Suspense boundary above it. */
createRoot(document.getElementById("app")!).render(
  React.createElement(React.Suspense, { fallback: React.createElement("div", { id: "probe-fallback" }, "loading") },
    React.createElement(StoreEditorPage, { params: Promise.resolve({ installId: "probe-install" }) })),
)
