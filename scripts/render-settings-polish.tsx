/**
 * Website Settings › Navigation, Pages and Policies, mounted for
 * scripts/check-settings-polish.mjs: the real ProjectSettings, open on the
 * subject named by ?section=, with the editor's part played by a few lines
 * of state. The header's links are nav_link blocks written back the way the
 * editor's writers write them; the sections route is answered from memory,
 * so a policy saved here comes back on the next read.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import type { LinkTarget } from "@/components/website-builder/link-picker"
import { POLICY_PAGES, policyPageSections } from "@/lib/website-builder/policy-pages"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Block = { id: string; type: string; settings: Record<string, unknown> }

declare global {
  interface Window {
    __blocks: Block[]
    __settings: ThemeSettingsValues
    __puts: { page_key: string; sections: SectionInstance[] }[]
    __pages: Record<string, { sections: SectionInstance[]; updated_at: string }>
    __saved: string[]
  }
}

const HEADER: SectionInstance = { id: "header", type: "header", name: "Header", settings: {}, blocks: [], hidden: false }
const FOOTER: SectionInstance = { id: "footer", type: "footer", name: "Footer", settings: { menu: "footer" }, blocks: [], hidden: false }

window.__puts = []
window.__saved = []
window.__pages = Object.fromEntries(
  POLICY_PAGES.map((p, i) => [p.key, { sections: policyPageSections(p, { brand: "Astrid", header: HEADER, footer: FOOTER }), updated_at: `2026-09-${String(20 + i).padStart(2, "0")}T10:00:00Z` }]),
)
/* The privacy policy, emptied by its owner: Use template is for this one. */
window.__pages["privacy-policy"].sections = window.__pages["privacy-policy"].sections.map((s) =>
  s.type === "rich_text" ? { ...s, settings: { ...s.settings, body: "<p></p>" } } : s,
)

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("/sections")) {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { page_key: string; sections: SectionInstance[] }
      window.__puts.push(body)
      const updated_at = new Date().toISOString()
      window.__pages[body.page_key] = { sections: body.sections, updated_at }
      return json({ page: { page_key: body.page_key, updated_at } })
    }
    const key = new URL(url, "https://x.test").searchParams.get("page") ?? ""
    const page = window.__pages[key]
    return json(page ? { page: { page_key: key, updated_at: page.updated_at }, sections: page.sections, has_draft: true } : { page: null, sections: [], has_draft: false })
  }
  return json({})
}) as typeof fetch

const TARGETS: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
]

const START: Block[] = [
  { id: "home", type: "nav_link", settings: { label: "Home", url: "/" } },
  { id: "shop", type: "nav_link", settings: { label: "Shop", url: "/products" } },
  { id: "prints", type: "nav_link", settings: { label: "Prints", url: "/products?type=print", parent_id: "shop" } },
  { id: "zines", type: "nav_link", settings: { label: "Zines", url: "/products?type=zine", parent_id: "shop" } },
  { id: "about", type: "nav_link", settings: { label: "About", url: "/about" } },
  { id: "contact", type: "nav_link", settings: { label: "Contact", url: "/contact" } },
]
window.__blocks = START

function App() {
  const section = (new URLSearchParams(location.search).get("section") as SettingsSection | null) ?? "navigation"
  const [settings, setSettings] = React.useState<ThemeSettingsValues>({
    brand_name: "Astrid",
    menus: { footer: { title: "Footer", links: [{ title: "Shop", url: "/products" }, { title: "About", url: "/about" }, { title: "Contact", url: "/contact" }] } },
  } as ThemeSettingsValues)
  const [blocks, setBlocks] = React.useState<Block[]>(START)
  const commit = (next: Block[]) => {
    window.__blocks = next
    setBlocks(next)
  }
  React.useEffect(() => {
    window.__settings = settings
  }, [settings])
  const header: SectionInstance = { ...HEADER, blocks: blocks as SectionInstance["blocks"] }
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      live
      publishedAt="2026-09-22T09:30:00Z"
      initialSection={section}
      settings={settings}
      onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
      pages={[
        { key: "home", name: "Home", path: "/" },
        { key: "about", name: "About", path: "/about" },
        { key: "contact", name: "Contact", path: "/contact" },
        { key: "lookbook-autumn-winter-collection", name: "Lookbook autumn and winter collection", path: "/lookbook-autumn-winter-collection", custom: true },
        ...POLICY_PAGES.map((p) => ({ key: p.key, name: p.title, path: `/${p.key}`, custom: true })),
      ]}
      productCount={7}
      navigation={{
        header,
        footer: FOOTER,
        linkTargets: TARGETS,
        currentPageKey: "home",
        currentSections: [header, FOOTER],
        onSectionSetting: () => {},
        onBlockSetting: (_s, id, key, value) => commit(blocks.map((b) => (b.id === id ? { ...b, settings: { ...b.settings, [key]: value } } : b))),
        onAddBlock: (_s, type, initial) => commit([...blocks, { id: `new${blocks.length}`, type, settings: { ...(initial ?? {}) } }]),
        onRemoveBlock: (_s, id) => commit(blocks.filter((b) => b.id !== id && b.settings.parent_id !== id)),
        onReorderBlocks: (_s, next) => commit(next as Block[]),
        onPageDraftSaved: (key) => window.__saved.push(key),
      }}
    />
  )
}

createRoot(document.getElementById("app")!).render(<App />)
