/**
 * Liam's About page (round 67), drawn by the compat engine as his website draws it: the creator template
 * (Storelib Default), his home as tailor.ts wrote it before round 66 (a hero, his products under "Gym Programmes"),
 * no About page, a menu linking /pages/about. Before: the theme's plain page, "About" over nothing. After: the page
 * lib/admin/creator-site/about-fallback.ts gives it.
 *
 *   node <runner> scripts/check-about-r67.ts    (OUT=<dir> writes the page's HTML and serves nothing)
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { importTemplate, siteFor } from "./theme-templates/site"
import { answer } from "../lib/storelib-theme/compat/site"
import { aboutFallbackSections } from "../lib/admin/creator-site/about-fallback"

type S = { id: string; type: string; group?: unknown; settings?: Record<string, unknown>; blocks?: { id: string; type: string; settings?: Record<string, unknown> }[] }

async function main() {
  const imported = await importTemplate("materia/creator")
  const built = siteFor(imported, { name: "liam bailey", products: [{ title: "The Skinny To Strong Programme", price: "£0.00" }, { title: "Gym Beginner Program", price: "£8.99" }] })
  const pages = built.site.pages as unknown as Record<string, S[]>
  delete pages.about
  const chrome = (pages.home ?? []).filter((s) => s.group)
  pages.home = [...chrome.filter((s) => s.group === "header"), { id: "hero", type: built.theme.typeOf("hero-image1"), settings: {} }, { id: "products", type: built.theme.typeOf("products-listing"), settings: {}, blocks: [{ id: "heading", type: "heading", settings: { text: "Gym Programmes" } }] }, ...chrome.filter((s) => s.group !== "header")]
  const text = (html: string) => {
    const i = html.indexOf("<main")
    return html.slice(i, html.indexOf("</main>", i)).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const draw = async () => {
    const r = await answer(built.site, { method: "GET", path: "/pages/about", query: new URLSearchParams(), body: null, cart: [] })
    return String(r.body)
  }
  const before = await draw()
  const about = aboutFallbackSections({
    settings: {},
    themeValues: built.theme.settingsValues as Record<string, unknown>,
    pages,
    menuLinks: ["/", "/collections/all", "/pages/about"],
    products: built.site.products.map((p) => ({ id: p.id, title: String(p.settings.title ?? "") })),
    shopName: "liam bailey",
    avatar: "https://storelib.com/media/sample-avatar.jpg",
    typeOf: (t) => built.theme.typeOf(t),
    hasSection: (t) => built.theme.files[`sections/${t}.storelib`] !== undefined,
  })
  if (about) pages.about = about
  const after = await draw()
  console.log("before:", text(before).slice(0, 300))
  console.log("after: ", text(after).slice(0, 600))
  const ok = !!about && /liam bailey/i.test(text(after)) && /Gym Beginner Program/.test(text(after)) && /Write to liam bailey/.test(text(after)) && text(after).length > text(before).length * 2
  if (process.env.OUT) {
    writeFileSync(join(process.env.OUT, "about-before.html"), before)
    writeFileSync(join(process.env.OUT, "about-after.html"), after)
  }
  console.log(ok ? "ok: a real About page" : "FAIL")
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
