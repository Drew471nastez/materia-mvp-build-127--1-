/**
 * Menus belong to the store, the way Shopify's Navigation does: every theme
 * reads the same ones, an edit goes live on all of them, and until the store
 * keeps any each theme keeps its own (lib/website-builder/store-menus-server.ts).
 * In the editor, a menu's Edit opens Navigation, its own panel, never Theme
 * settings at General.
 *
 *   npx tsx tests/store-menus.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { readStoreMenus, storeMenusFor, storeMenusOrNull, withStoreMenus, writeStoreMenus } from "@/lib/website-builder/store-menus-server"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* A database with just enough of Supabase's shape: a table of rows, filtered by eq, one row back. */
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>, opts: { missing?: string[] } = {}) {
  const writes: { table: string; row: Row }[] = []
  const query = (table: string) => {
    const filters: [string, unknown][] = []
    const q: Record<string, unknown> = {}
    const missing = { data: null, error: { code: "42P01", message: `relation "public.${table}" does not exist` } }
    const result = () => {
      if (opts.missing?.includes(table)) return missing
      const rows = (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
      return { data: rows[0] ?? null, error: null }
    }
    Object.assign(q, {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => result(),
      upsert: async (row: Row) => {
        if (opts.missing?.includes(table)) return { error: missing.error }
        writes.push({ table, row })
        tables[table] = [...(tables[table] ?? []).filter((r) => r.creator_id !== row.creator_id), row]
        return { error: null }
      },
    })
    return q
  }
  return { db: { from: query }, writes, tables }
}

const main = { "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/shop" }] } }

async function run() {
  {
    const { db } = fakeDb({ store_menus: [{ creator_id: "c1", menus: main }] })
    const r = await readStoreMenus(db, "c1")
    check("a stored row is the store's menus", r.kind === "stored" && r.menus["main-menu"].links.length === 2, r)
    check("another creator's row is not read", (await readStoreMenus(db, "c2")).kind === "none")
  }
  {
    const { db } = fakeDb({}, { missing: ["store_menus"] })
    check("no table yet: unavailable, nothing thrown", (await readStoreMenus(db, "c1")).kind === "unavailable")
    check("  and pages keep the theme's own menus", (await storeMenusOrNull(db, "c1")) === null)
    const w = await writeStoreMenus(db, "c1", main)
    check("  and a save says so instead of failing loudly", w.ok === false && w.unavailable === true, w)
  }
  {
    const theme: Record<string, unknown> = { colors: "x", menus: { footer: { title: "Old", links: [] } } }
    const laid = withStoreMenus(theme, main)
    check("the store's menus replace a theme's own", laid.menus === main && laid.colors === "x")
    check("no store menus: the theme's settings are returned as they are", withStoreMenus(theme, null) === theme)
  }
  {
    const { db, tables } = fakeDb({})
    const w = await writeStoreMenus(db, "c1", { "main-menu": { title: "Main", links: [{ title: "Bad", url: "javascript:alert(1)" }, { title: "", url: "/x" }] }, "Not A Handle!": { title: "x", links: [] } })
    const saved = tables.store_menus?.[0]?.menus as Record<string, { links: { url: string }[] }>
    check("a save is cleaned first: unsafe addresses, empty links and bad handles never land", w.ok && !JSON.stringify(saved).includes("javascript") && saved["main-menu"].links.length === 1 && !("Not A Handle!" in saved), saved)
  }
  {
    const live = { id: "i-live", creator_id: "c1", status: "published", store_theme_settings: { settings: { menus: main }, draft_settings: { menus: {} } } }
    const { db } = fakeDb({ store_menus: [], store_theme_installs: [live] })
    const r = await storeMenusFor(db, "c1", "i-other")
    check("nothing stored yet: the editor is offered the LIVE theme's menus", r.available && !r.stored && r.menus["main-menu"]?.links.length === 2, r)
  }
  {
    const draftOnly = { id: "i-new", creator_id: "c1", status: "draft", store_theme_settings: { settings: {}, draft_settings: { menus: main } } }
    const { db } = fakeDb({ store_menus: [], store_theme_installs: [draftOnly] })
    const r = await storeMenusFor(db, "c1", "i-new")
    check("nothing live either: the theme being edited offers its own", r.available && !r.stored && !!r.menus["main-menu"], r)
  }

  /* Where they are read and written. */
  const sql = read("supabase/sql/run-now/93_store_menus.sql")
  check("the table is server only: RLS on, nothing for visitors or signed in users", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.store_menus FROM PUBLIC, anon, authenticated/.test(sql) && /TO service_role/.test(sql))
  check("  one row per creator, an object, safe to run again", /creator_id uuid PRIMARY KEY REFERENCES public\.creators\(id\) ON DELETE CASCADE/.test(sql) && /jsonb_typeof\(menus\) = 'object'/.test(sql) && /IF NOT EXISTS/.test(sql))
  check("  listed in the run-now README", read("supabase/sql/run-now/README.md").includes("93_store_menus.sql"))
  check("  and a migration", read("supabase/migrations/20261110_store_menus.sql") === sql)

  const published = read("lib/website-builder/published-site.ts")
  check("the live site draws with the store's menus", /sanitizeThemeSettings\(\s*withStoreMenus\(/.test(published) && /storeMenusOrNull\(admin, creatorId\)/.test(published))
  const renderSite = read("app/(site)/w/[username]/render-site.tsx")
  check("  and so do a preview and a cover", (renderSite.match(/withStoreMenus\(/g) ?? []).length === 2)
  const project = read("lib/agent-access/project.ts")
  check("an agent reads the store's menus and saves a menu change to the store", /storeMenusOrNull\(db, creatorId\)/.test(project) && /if \(menusChanged\) await writeStoreMenus\(db, who\.creatorId/.test(project))
  const route = read("app/api/website-builder/menus/route.ts")
  check("the save route checks the creator, is rate limited, capped, and drops the site cache", /* Changed on purpose (round 12, WBPERF): editorUser, a blip a 503 not a 401. */ /websiteCaller\(\)/.test(route) /* Changed on purpose (round 42 team): editorUser is asked in lib/team/website */ && /rateLimit\(/.test(route) && /readEditorBody\(req, MENUS_BODY\)/.test(route) && /revalidatePublishedSite\(who\.creatorId\)/.test(route))
  check("  the database's own words never reach the browser", !/error\.message/.test(route))
  check("the editor gets the store's menus with the theme", /builderStoreMenus\(creator!\.id, installId\)/.test(read("app/api/website-builder/themes/[installId]/route.ts")))

  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("Edit opens Navigation, its own panel, and Back returns to what asked", /setSelectedPanel\(\(prev\) => \(\{ type: "navigation", handle, back:/.test(page) && /data-wb-navigation-panel/.test(page) && !/setExpandedSettings\("menus"\)/.test(page))
  check("Menus are no longer a Theme settings group", /* Changed on purpose (round N5): the free site's own lists filter Menus out too. */ (page.match(/group\.id !== "menus"/g) ?? []).length === 4)
  check("a menu change is saved to the store, once the typing stops", /* Changed on purpose (round 12, WBPERF): through putJsonWithRetry, a 401 asked about and a 5xx tried again. */ /putJsonWithRetry\("\/api\/website-builder\/menus"/.test(page) && /menusJson === st\.synced/.test(page))
  check("Navigation sits beside Pages", /data-open-navigation/.test(page))
  const picker = read("components/website-builder/editor/controls/menu-picker-control.tsx")
  check("the menu setting is one card: the name, its links, and Edit menu", /data-menu-preview/.test(picker) && /Edit menu/.test(picker) && /data-menu-select/.test(picker))
  check("no purple in the menus", !/7c3aed|c4b5fd/.test(read("components/website-builder/editor/controls/menus-editor.tsx")) && !/7c3aed|c4b5fd/.test(read("components/website-builder/editor/controls/link-list-editor.tsx")))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void run()
