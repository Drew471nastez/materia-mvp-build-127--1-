/**
 * Round 26: on a Materia site the AI's page links go in the menu its header really draws.
 *
 * A Materia site (a Start with AI template start, or a redesign of one) draws its header and footer from the
 * STORE's menus (store_menus, lib/storelib-theme/compat/menus.ts), the same data the template import writes, and
 * its pages live at /pages/<key>. The agent's add_page used to write settings.menus at /<key>, which that header
 * never reads. Here, on the real "trainer" template converted as the import converts it:
 *
 *   1. add_page puts /pages/<key> in the store's Main menu; the header, drawn by the compat engine with the
 *      store's menus, links it, and the page answers at that address;
 *   2. remove_page takes the page off and every link to it; the header no longer draws it;
 *   3. a store with no menus yet starts from what the header drew (Home and Shop stay);
 *   4. a Storelib (non-Materia) site keeps settings.menus at /<key> and never touches the store's;
 *   5. a one-component edit can neither remove a page nor write the store's menus; a failed write is said.
 *
 * No network, no model. Run: scratchpad/rtc.sh tests/ai-materia-menus.test.ts
 */
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { newCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"
import type { AgentDeps, AgentJobInput, AgentModels, StoreMenu } from "@/lib/ai-builder/agent/ports"
import { DEFAULT_JOB_BUDGET } from "@/lib/ai-builder/types"
import { scopedStore } from "@/lib/website-builder/ai-site/agent-engine"
import { templateMenus } from "@/lib/themes/template-packages"
import { compatMenus } from "@/lib/storelib-theme/compat/menus"
import { answer } from "@/lib/storelib-theme/compat/site"
import { importTemplate, siteFor } from "../scripts/theme-templates/site"
import { CAPS, CONCEPT, HERO } from "./ai-builder-agent-fixtures"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    if (process.env.VERBOSE) console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 1200)}`}`)
  }
}

const job = (over: Partial<AgentJobInput> = {}): AgentJobInput => ({ jobId: "26262626-aaaa-bbbb-cccc-444444444444", creatorId: "creator-a", installId: "install-a", prompt: "A personal training site.", mode: "theme", options: { generation: "theme", template: "trainer" }, budget: { ...DEFAULT_JOB_BUDGET }, startedAt: Date.UTC(2026, 10, 25), spentUsd: 0, lastEventSeq: 0, ...over })
type Store = ReturnType<typeof memoryStore>
const toolsFor = (store: Store, j = job()) => {
  const cp: LoopCheckpoint = { ...newCheckpoint(), concept: CONCEPT as never, sitePlan: { pages: [] } as never }
  const deps: AgentDeps = { store, models: {} as AgentModels, capabilities: async () => CAPS }
  return createToolSet({ job: j, deps, cp, emit: () => undefined, onFinish: async () => ({ ok: true }), setPhase: () => undefined })
}
const links = (menus: Record<string, StoreMenu> | null | undefined, handle = "main-menu") => (menus?.[handle]?.links ?? []).map((l) => l.url)

async function main() {
  const imported = await importTemplate("materia/trainer")
  const pagesOf = () => Object.fromEntries(imported.theme.pages.map((p) => [p.page_key, p.sections])) as never
  const shipped = templateMenus("materia/trainer") as Record<string, StoreMenu>
  const site = siteFor(imported, { name: "Mateo Ruiz", products: [] })
  /* The header as visitors get it: the compat engine, the store's menus, the install's pages. */
  const draw = async (store: Store, path = "/") => {
    const pages = Object.fromEntries((await store.listPages()).map((p) => [p.key, p.sections]))
    const out = await answer({ ...site.site, pages: pages as never, menus: compatMenus((store.project.storeMenus ?? null) as never, Object.keys(pages)) }, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
    return { status: out.status, html: String(out.body) }
  }

  console.log("\n1. add_page on a Materia site: the store's Main menu, at /pages/<key>, drawn by the header")
  const store = memoryStore({ files: { ...imported.files }, pages: pagesOf(), storeMenus: shipped })
  const tools = toolsFor(store)
  const before = await draw(store)
  check("the template's header draws the store's menu before anything changes", before.status === 200 && before.html.includes('href="/pages/about"') && !before.html.includes('href="/pages/pricing"'))
  const added = await tools.add_page({ key: "pricing", title: "Pricing" })
  check("add_page answers where the link went: the store's menu, at /pages/pricing", added.ok && added.menu === "store" && added.url === "/pages/pricing", added)
  check("  the store's Main menu has it, after the template's own links", links(store.project.storeMenus).at(-1) === "/pages/pricing" && links(shipped).every((u) => links(store.project.storeMenus).includes(u)), links(store.project.storeMenus))
  check("  settings.menus is not written (the header never reads it)", !("menus" in store.project.settings))
  await tools.set_page_sections({ page: "pricing", sections: [{ type: "header", group: "header" }] } as never).catch(() => null)
  const after = await draw(store)
  check("the header, drawn through the engine with the store's menus, links the new page", after.html.includes('href="/pages/pricing"') && />\s*Pricing\s*</.test(after.html), after.html.match(/<a[^>]*href="\/pages\/[^"]*"[^>]*>[\s\S]{0,40}/g)?.slice(0, 8))
  const opened = await draw(store, "/pages/pricing")
  check("  and the page answers at that address", opened.status === 200, opened.status)
  const again = await tools.add_page({ key: "coaching-plans", title: "Coaching plans" })
  check("a second page is a second link; none doubled", again.ok && links(store.project.storeMenus).filter((u) => u === "/pages/pricing").length === 1 && links(store.project.storeMenus).includes("/pages/coaching-plans"))

  console.log("\n2. remove_page: the page and every link to it")
  /* A link to it in the footer menu too, as a creator might have. */
  store.project.storeMenus = { ...store.project.storeMenus!, footer: { ...(store.project.storeMenus!.footer ?? { title: "Footer", links: [] }), links: [...(store.project.storeMenus!.footer?.links ?? []), { title: "Prices", url: "/pages/pricing" }] } }
  const removed = await tools.remove_page({ key: "pricing" })
  check("remove_page takes the page off and both links to it", removed.ok && removed.unlinked === 2 && !("pricing" in store.project.pages), removed)
  check("  no menu links it any more; the others stay", Object.values(store.project.storeMenus!).every((m) => !m.links.some((l) => l.url === "/pages/pricing")) && links(store.project.storeMenus).includes("/pages/coaching-plans") && links(shipped).every((u) => links(store.project.storeMenus).includes(u)))
  const gone = await draw(store)
  /* The engine draws any /pages/<handle> with the theme's generic page template, so the address itself is not the check: the page row and every link are. */
  check("  the header no longer draws it", !gone.html.includes('href="/pages/pricing"') && gone.html.includes('href="/pages/coaching-plans"'))
  check("home and templates cannot be removed; an unknown page is said", !(await tools.remove_page({ key: "home" })).ok && !(await tools.remove_page({ key: "product" })).ok && /no page/.test(String((await tools.remove_page({ key: "nope" })).error)))

  console.log("\n3. a store with no menus yet")
  const bare = memoryStore({ files: { ...imported.files }, pages: pagesOf(), storeMenus: null })
  const fresh = await toolsFor(bare).add_page({ key: "pricing", title: "Pricing" })
  check("starts from what the header drew (Home, Shop), then the new page", fresh.ok && fresh.menu === "store" && links(bare.project.storeMenus).slice(0, 2).join() === "/,/collections/all" && links(bare.project.storeMenus).includes("/pages/pricing"), links(bare.project.storeMenus))
  check("  and the header draws all of them", (await draw(bare)).html.includes('href="/pages/pricing"'))

  console.log("\n4. a Storelib site keeps the theme's menu")
  const native = memoryStore({ files: { "sections/ai_coach_hero.storelib": HERO }, pages: { home: [] }, settings: { menus: { "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }] } } }, storeMenus: { "main-menu": { title: "Main", links: [{ title: "Shop", url: "/collections/all" }] } } })
  const nt = toolsFor(native, job({ options: { generation: "theme" } }))
  const n1 = await nt.add_page({ key: "pricing", title: "Pricing" })
  const themeMenus = native.project.settings.menus as Record<string, StoreMenu>
  check("add_page writes settings.menus at /pricing, as before", n1.ok && n1.menu === "theme" && links(themeMenus).join() === "/,/pricing", { n1, themeMenus })
  check("  and never the store's menus", links(native.project.storeMenus).join() === "/collections/all")
  const n2 = await nt.remove_page({ key: "pricing" })
  check("remove_page takes its link out of settings.menus", n2.ok && n2.unlinked === 1 && links(native.project.settings.menus as never).join() === "/")

  console.log("\n5. edits and failures")
  const edit = toolsFor(store, job({ edit: { path: "sections/ai_x.storelib" } as never }))
  check("a one-component edit removes no page", !(await edit.remove_page({ key: "coaching-plans" })).ok && "coaching-plans" in store.project.pages)
  const scoped = scopedStore(store, "sections/ai_x.storelib")
  check("  and its store cannot write the store's menus or delete a page", (await scoped.writeStoreMenus!({})) === false && !(await scoped.deletePage!("coaching-plans")).ok && links(store.project.storeMenus).includes("/pages/coaching-plans"))
  const flaky = memoryStore({ files: { ...imported.files }, pages: pagesOf(), storeMenus: shipped })
  flaky.writeStoreMenus = async () => false
  const said = await toolsFor(flaky).add_page({ key: "pricing", title: "Pricing" })
  check("a menu that could not be written: the page is made and the answer says the link is missing", said.ok && said.menu === "none" && /could not be added/.test(String(said.error)) && "pricing" in flaky.project.pages)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
