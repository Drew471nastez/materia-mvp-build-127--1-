/**
 * A Shopify theme zip (layout/theme.liquid, sections, snippets, templates)
 * becomes one Storelib website: each section on the home page is rendered
 * with the settings the template gave it, then stored as a section file.
 */
import type JSZip from "jszip"
import type { SectionInstance } from "@/lib/website-builder/types"
import {
  homeSections,
  isShopifyTheme,
  renderShopifySection,
  storelibFromRendered,
  themeSettingsFrom,
  type ShopifyFiles,
} from "./render"

const TEXT = /\.(liquid|json|css|js|svg|txt)$/i

export async function shopifyFilesFromZip(zip: JSZip): Promise<ShopifyFiles | null> {
  const files: ShopifyFiles = new Map()
  const jobs: Promise<void>[] = []
  zip.forEach((path, entry) => {
    if (entry.dir) return
    const clean = path.replace(/^\/+/, "")
    if (!TEXT.test(clean)) return
    jobs.push(
      entry.async("string").then((text) => {
        files.set(clean, text)
      }),
    )
  })
  await Promise.all(jobs)
  return isShopifyTheme(files) ? files : null
}

function typeFor(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")
  const body = slug && /^[a-z]/.test(slug) ? slug : `s_${slug || "section"}`
  return `shopify_${body}`.slice(0, 60)
}

export async function shopifyInstallFromFiles(files: ShopifyFiles): Promise<{
  name: string
  sections: SectionInstance[]
  files: { path: string; content: string }[]
}> {
  const theme = themeSettingsFrom(files)
  let name = "Shopify theme"
  try {
    const schema = JSON.parse(files.get("config/settings_schema.json") ?? "[]") as { name?: string; theme_name?: string }[]
    const titled = schema.find((g) => g.name === "theme_info")
    if (titled?.theme_name) name = titled.theme_name
  } catch {
    /* The zip's folder name is not in here. */
  }
  const sections: SectionInstance[] = []
  const out: { path: string; content: string }[] = []
  for (const section of homeSections(files).slice(0, 40)) {
    const rendered = await renderShopifySection(files, section, theme)
    const type = typeFor(section.id)
    out.push({ path: `sections/${type}.storelib`, content: storelibFromRendered(rendered, type) })
    sections.push({
      id: section.id,
      type,
      name: rendered.name,
      settings: {},
      ...(rendered.group ? { group: rendered.group } : {}),
    })
  }
  return { name: name.slice(0, 80), sections, files: out }
}
