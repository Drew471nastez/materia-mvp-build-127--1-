/**
 * ===========================================================================
 *  CREATE A WEBSITE: START WITH AI, START FROM BLANK, BROWSE THEMES
 * ===========================================================================
 * The owner opened /app/website-builder expecting "Start with AI" and "Start
 * from blank" and found neither. They are three doors at the top of the page
 * now, and every one of them makes an ordinary website in the current
 * builder: a Storelib Default install the visual editor opens, never a code
 * project from /app/sites.
 *
 *   1. THE CREATE ROUTE (app/api/website-builder/themes/create, through
 *      lib/website-builder/create-website.ts): both modes, no one-copy check
 *      (every account already has Storelib Default), the library limit with
 *      Add's own refusal, a half-built website rolled back, and a home page
 *      with only its header and footer, so it is blank and the website agent
 *      reads it as empty (NEW_SITE_GENERATION). Add theme is unchanged.
 *   2. THE HANDOFF (lib/website-builder/start-handoff.ts): the description
 *      waits in this tab's sessionStorage under the new website's id, is
 *      taken once, expires after ten minutes, and `start=ai` comes off the
 *      editor's address before anything is sent, so a reload never sends it
 *      twice. The editor sends it through the Ask panel's own submit.
 *   3. THE PAGE: the three doors, the full library on them, a team member
 *      without Start with AI, and no way to /app/sites.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { buildThemePreset, getThemeDefinition, STORELIB_DEFAULT_ID, THEME_INSTALL_LIMIT } from "@/lib/website-builder/theme-registry"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE } from "@/lib/website-builder/library-limit"
import { START_NAME_MAX, createStartWebsite, defaultStartName, isChromeSection, isStartMode, pickStartName, startRows } from "@/lib/website-builder/create-website"
import {
  START_LEAD,
  START_PROMPT_MAX,
  START_TTL_MS,
  clearStartPrompt,
  peekStartPrompt,
  readStartParam,
  saveStartPrompt,
  startKey,
  startMessage,
  takeStartPrompt,
  withStartParam,
} from "@/lib/website-builder/start-handoff"
import { classifyIntent } from "@/lib/website-builder/agent/intent"
import { installCodeTemplate } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { composeTemplateZip } from "@/lib/themes/template-packages"
import { chooseMateriaTemplate } from "@/lib/storelib-ai/materia/reference"
import { START_GENERATION } from "@/lib/website-builder/ai-site/start-options"
import { StartWebsite } from "@/app/(storelib)/app/website-builder/start-website"
import { libraryFullSentence } from "@/app/(storelib)/app/website-builder/library-full-dialog"

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
function section(title: string) {
  console.log(`\n${title}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Without comments, so a check reads the code and not a note about it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// ── A small PostgREST in memory ────────────────────────────────────────────
type Row = Record<string, unknown>
type Fail = Partial<Record<"themes.upsert" | "installs.insert" | "settings.insert" | "pages.insert" | "installs.count" | "files.insert", { message: string; code?: string }>>
const TABLE: Record<string, string> = { store_theme_installs: "installs", store_theme_settings: "settings", store_theme_pages: "pages", themes: "themes", store_theme_custom_files: "files" }

function fakeDb(seed: { installs?: Row[]; themes?: Row[] } = {}, opts: { fail?: Fail; countAfterInsert?: number } = {}) {
  const tables: Record<string, Row[]> = { installs: [...(seed.installs ?? [])], settings: [], pages: [], themes: [...(seed.themes ?? [])], files: [] }
  const log: string[] = []
  let ids = 0
  let inserted = false
  const client = {
    from(name: string) {
      const t = TABLE[name] ?? name
      const filters: [string, unknown][] = []
      let op: "select" | "insert" | "upsert" | "delete" = "select"
      let counting = false
      let payload: Row | Row[] | null = null
      let single: "one" | "maybe" | null = null
      let order: { col: string; asc: boolean } | null = null
      let limit: number | null = null
      const rows = () => tables[t].filter((r) => filters.every(([k, v]) => r[k] === v))
      const run = async (): Promise<{ data?: unknown; error: { message: string; code?: string } | null; count?: number | null }> => {
        const failKey = `${t}.${op === "select" && counting ? "count" : op}` as keyof Fail
        if (op === "select" && counting) {
          if (opts.fail?.["installs.count"] && t === "installs") return { error: opts.fail["installs.count"], count: null }
          const n = inserted && opts.countAfterInsert !== undefined && t === "installs" ? opts.countAfterInsert : rows().length
          return { error: null, count: n }
        }
        if (op === "select") {
          let out = rows()
          if (order) {
            const { col, asc } = order
            out = [...out].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1))
          }
          if (limit !== null) out = out.slice(0, limit)
          if (single) return { data: out[0] ?? null, error: null }
          return { data: out, error: null }
        }
        if (op === "delete") {
          const gone = rows()
          tables[t] = tables[t].filter((r) => !gone.includes(r))
          log.push(`delete ${t} ${JSON.stringify(filters)}`)
          return { error: null }
        }
        if (opts.fail?.[failKey]) {
          log.push(`refused ${failKey}`)
          return { data: null, error: opts.fail[failKey]! }
        }
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
        const made = list.map((r) => (t === "installs" ? { id: `install-${++ids}`, created_at: new Date().toISOString(), ...r } : { ...r }))
        tables[t].push(...made)
        if (t === "installs") inserted = true
        log.push(`${op} ${t}`)
        return { data: single ? made[0] : made, error: null }
      }
      const q = {
        select(_cols?: string, o?: { count?: string; head?: boolean }) {
          if (op === "select") counting = !!o?.head
          return q
        },
        eq(k: string, v: unknown) {
          filters.push([k, v])
          return q
        },
        order(col: string, o: { ascending: boolean }) {
          order = { col, asc: o.ascending }
          return q
        },
        limit(n: number) {
          limit = n
          return q
        },
        maybeSingle() {
          single = "maybe"
          return run()
        },
        single() {
          single = "one"
          return run()
        },
        insert(p: Row | Row[]) {
          op = "insert"
          payload = p
          return q
        },
        upsert(p: Row) {
          op = "upsert"
          payload = p
          return q
        },
        delete() {
          op = "delete"
          return q
        },
        then<A, B>(ok: (v: Awaited<ReturnType<typeof run>>) => A, bad?: (e: unknown) => B) {
          return run().then(ok, bad)
        },
      }
      return q
    },
  }
  return { client: client as never, tables, log }
}
const noMenus = async () => null
/* Read loosely: the suite runs without strict, where `ok` does not narrow the answer. */
type Loose = { ok: boolean; status?: number; error?: string; code?: string; install: Record<string, unknown> & { id: string } }
const create = (...args: Parameters<typeof createStartWebsite>) => createStartWebsite(...args) as Promise<Loose>
const install = (over: Row = {}): Row => ({ id: `old-${Math.random().toString(36).slice(2, 8)}`, creator_id: "c1", theme_id: STORELIB_DEFAULT_ID, name: "Storelib Default", status: "published", sort_order: 0, ...over })
const catalogue = [{ id: STORELIB_DEFAULT_ID }]

const def = getThemeDefinition(STORELIB_DEFAULT_ID)!
const preset = buildThemePreset(def)

// ── 1. The rows and the name ───────────────────────────────────────────────
section("What a new website is made of")
{
  const rows = startRows()!
  const home = rows.pages.find((p) => p.page_key === "home")!.sections
  const product = rows.pages.find((p) => p.page_key === "product")!.sections
  check("the home page is only the header and the footer: no body sections", home.length === 2 && home.every(isChromeSection) && home[0].type === "header" && home[1].type === "footer", home.map((s) => s.type))
  check("  the preset's own header and footer, as Add writes them", JSON.stringify(home[0]) === JSON.stringify(preset.pages.home[0]) && JSON.stringify(home[1]) === JSON.stringify(preset.pages.home[preset.pages.home.length - 1]))
  check("  so the website agent reads it as empty and builds a new site from the brief",
    home.filter((s) => s.type !== "header" && s.type !== "footer" && !(s as { group?: string }).group).length === 0 &&
      classifyIntent("Build me a website for my candle shop", { bodySections: 0 }).kind === "NEW_SITE_GENERATION")
  check("the product page and the settings are the preset's", JSON.stringify(product) === JSON.stringify(preset.pages.product) && JSON.stringify(rows.settings) === JSON.stringify(preset.settings))
  check("the preset itself is untouched: its home still has body sections", preset.pages.home.filter((s) => !isChromeSection(s)).length > 0)
  check("no retired section on the blank home page", !home.some((s) => ["feature_grid", "product_list", "cta"].includes(s.type)))

  check("the two modes and nothing else", isStartMode("ai") && isStartMode("blank") && !isStartMode("theme") && !isStartMode(undefined))
  check("a name given is kept, trimmed and folded", pickStartName("  My   bakery  ", "blank", ["My bakery"]) === "My bakery")
  check(`  at most ${START_NAME_MAX} characters`, pickStartName("x".repeat(200), "ai", []).length === START_NAME_MAX)
  check("with none: New website, AI website", pickStartName(undefined, "blank", []) === "New website" && pickStartName("   ", "ai", []) === "AI website" && defaultStartName("ai") === "AI website")
  check("  and a number when the name is taken, compared without case", pickStartName(null, "blank", ["new website", "New website 2"]) === "New website 3" && pickStartName(42, "ai", ["AI website"]) === "AI website 2")
}

// ── 2. The create helper, against a database in memory ────────────────────
section("Creating it")
{
  /*
    Changed on purpose (r63): Start from blank is the Materia Storelib Default now (below), so the native rows are
    Start with AI's on the classic engine only, and these checks of the native path press AI instead of blank.
  */
  const db = fakeDb({ installs: [install({ sort_order: 3 })], themes: catalogue })
  const made = await create({ supabase: db.client, admin: db.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  const row = made.ok ? db.tables.installs.find((r) => r.id === made.install.id) : null
  check("a second Storelib Default is made beside the first (no \"already in your library\")", made.ok && db.tables.installs.length === 2, made)
  check("  a draft of Storelib Default, named AI website, after the others", row?.theme_id === STORELIB_DEFAULT_ID && row?.status === "draft" && row?.name === "AI website" && row?.sort_order === 4 && row?.is_custom === false && row?.creator_id === "c1", row)
  const pages = db.tables.pages.filter((p) => made.ok && p.install_id === made.install.id)
  const home = pages.find((p) => p.page_key === "home")?.sections as { type: string }[] | undefined
  check("  with a home page of header and footer only, and the product page", pages.length === 2 && home?.map((s) => s.type).join() === "header,footer" && !!pages.find((p) => p.page_key === "product"))
  check("  and the preset's settings", JSON.stringify(db.tables.settings[0]?.settings) === JSON.stringify(preset.settings))

  /* r63: Start from blank imports the current Storelib Default with an empty home page, never the native theme. */
  const blankCalls: { template: string; name: string; blankHome?: boolean; userId: string }[] = []
  const blankStub = (async (_admin: unknown, who: { userId: string }, template: string, opts: { name: string; blankHome?: boolean }) => {
    blankCalls.push({ template, name: opts.name, blankHome: opts.blankHome, userId: who.userId })
    return { ok: true, installId: "made-blank", name: opts.name, template }
  }) as never
  const blankDb = fakeDb({ installs: [install()], themes: catalogue })
  const blankMade = await create({ supabase: blankDb.client, admin: blankDb.client }, { creatorId: "c1", mode: "blank", userId: "u1" }, { menus: noMenus, installTemplate: blankStub })
  check("Start from blank: the default template, its home page left blank, named New website",
    blankMade.ok && blankMade.install.id === "made-blank" && JSON.stringify(blankCalls) === JSON.stringify([{ template: "default", name: "New website", blankHome: true, userId: "u1" }]), blankCalls)
  check("  and no native install written beside it", blankDb.tables.installs.length === 1 && !blankDb.log.some((l) => l.startsWith("insert")))
  const noUser = fakeDb({ installs: [install()], themes: catalogue })
  const noUserRes = await create({ supabase: noUser.client, admin: noUser.client }, { creatorId: "c1", mode: "blank" }, { menus: noMenus, installTemplate: blankStub })
  check("  without the owner's id it is refused, never made from the old default", !noUserRes.ok && noUserRes.status === 500 && noUser.tables.installs.length === 1 && blankCalls.length === 1)

  const ai = fakeDb({ installs: [install({ name: "AI website" })], themes: catalogue })
  const aiMade = await create({ supabase: ai.client, admin: ai.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("AI: the same website, named AI website 2 beside an AI website", aiMade.ok && ai.tables.installs.find((r) => r.id === aiMade.install.id)?.name === "AI website 2")
  const named = fakeDb({ installs: [install()], themes: catalogue })
  const namedMade = await create({ supabase: named.client, admin: named.client }, { creatorId: "c1", mode: "ai", name: " Candle shop " }, { menus: noMenus })
  check("  or the name it was given", namedMade.ok && named.tables.installs.find((r) => r.id === namedMade.install.id)?.name === "Candle shop")

  const noCatalogue = fakeDb({ installs: [install()] })
  const seeded = await create({ supabase: noCatalogue.client, admin: noCatalogue.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("the catalogue row is made when the database has not heard of the theme", seeded.ok && noCatalogue.tables.themes.some((t) => t.id === STORELIB_DEFAULT_ID) && noCatalogue.log.includes("upsert themes"))

  /* The store's menus: named by the header and footer, and copied into settings where there is no table. */
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Shop", url: "/products" }] }, footer: { title: "Footer", links: [{ title: "About", url: "/about" }] } }
  const carried = fakeDb({ installs: [install()], themes: catalogue })
  const asked: unknown[] = []
  const withMenus = await create({ supabase: carried.client, admin: carried.client }, { creatorId: "c1", mode: "ai" }, {
    menus: (async (_db: unknown, creatorId: string, o: unknown) => {
      asked.push([creatorId, o])
      return { menus, header: null, footer: null, stored: false }
    }) as never,
  })
  const carriedHome = carried.tables.pages.find((p) => p.page_key === "home")?.sections as { type: string; settings: Record<string, unknown> }[]
  check("the store's menus are carried, as Add carries them", withMenus.ok && JSON.stringify(asked) === JSON.stringify([["c1", { excludeInstallId: withMenus.ok ? withMenus.install.id : "" }]]) &&
    JSON.stringify((carried.tables.settings[0]?.settings as { menus?: unknown }).menus) === JSON.stringify(menus) && carriedHome.find((s) => s.type === "footer")?.settings.menu === "footer")

  /* The limit, with Add's own words and code. */
  const fullDb = fakeDb({ installs: Array.from({ length: THEME_INSTALL_LIMIT }, (_, i) => install({ sort_order: i, status: i ? "draft" : "published" })), themes: catalogue })
  const refused = await create({ supabase: fullDb.client, admin: fullDb.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check(`a library of ${THEME_INSTALL_LIMIT} is refused before anything is written, with Add's refusal`,
    !refused.ok && refused.status === 400 && refused.code === LIBRARY_FULL_CODE && refused.error === LIBRARY_FULL_MESSAGE && fullDb.tables.installs.length === THEME_INSTALL_LIMIT && !fullDb.log.some((l) => l.startsWith("insert")), refused)
  const unreadable = fakeDb({ installs: [install()], themes: catalogue }, { fail: { "installs.count": { message: "timeout" } } })
  const unreadRes = await create({ supabase: unreadable.client, admin: unreadable.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("  a count that cannot be read is full, not room", !unreadRes.ok && unreadRes.code === LIBRARY_FULL_CODE && unreadable.tables.installs.length === 1)
  const raced = fakeDb({ installs: [install()], themes: catalogue }, { fail: { "installs.insert": { message: "library_full" } } })
  const racedRes = await create({ supabase: raced.client, admin: raced.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("  the database's own refusal reads as a full library", !racedRes.ok && racedRes.code === LIBRARY_FULL_CODE)
  const over = fakeDb({ installs: [install()], themes: catalogue }, { countAfterInsert: THEME_INSTALL_LIMIT + 1 })
  const overRes = await create({ supabase: over.client, admin: over.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("  two at once: the recount backs the new one out", !overRes.ok && overRes.code === LIBRARY_FULL_CODE && over.tables.installs.length === 1 && over.tables.pages.length === 0)

  /* Settings and pages, or nothing. */
  for (const what of ["pages.insert", "settings.insert"] as const) {
    const broken = fakeDb({ installs: [install()], themes: catalogue }, { fail: { [what]: { message: "boom", code: "XX000" } } })
    const res = await create({ supabase: broken.client, admin: broken.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
    check(`a failed ${what.split(".")[0]} write removes the new website again (500, no database words)`,
      !res.ok && res.status === 500 && !/boom|XX000/.test(res.error ?? "") && broken.tables.installs.length === 1 && broken.log.some((l) => l.startsWith("delete installs")), res)
  }
  const noInstall = fakeDb({ installs: [install()], themes: catalogue }, { fail: { "installs.insert": { message: "permission denied", code: "42501" } } })
  const noInstallRes = await create({ supabase: noInstall.client, admin: noInstall.client }, { creatorId: "c1", mode: "ai" }, { menus: noMenus })
  check("an install that cannot be written is a plain 500", !noInstallRes.ok && noInstallRes.status === 500 && !/permission/.test(noInstallRes.error ?? ""))
}

section("The route, and Add left as it was")
{
  const route = code("app/api/website-builder/themes/create/route.ts")
  check("the same people as Add: websiteCaller, refused as it refuses", /const site = await websiteCaller\(\)/.test(route) && /if \(site\.error !== null\) return NextResponse\.json\(\{ error: site\.error \}, \{ status: site\.status \}\)/.test(route))
  check("rate limited per person, as a site action", /rateLimit\(\{\s*bucket: "site-create",\s*subjects: \[`user:\$\{site\.userId\}`\],\s*windows: LIMITS\.siteAction/.test(route) && /if \(limited\) return limited/.test(route))
  check("a mode or a 400", /if \(!isStartMode\(mode\)\) return NextResponse\.json\(\{ error: "mode must be ai or blank" \}, \{ status: 400 \}\)/.test(route))
  check("the helper writes, with the caller's client for the count and the service role for the rows",
    /const admin = createAdminClient\(\)/.test(route) && /* Changed on purpose (round 26): the call also names the template an AI start is made from, and injects the import. Changed on purpose (r63): and the owner's id, for Start from blank's template. */ /createStartWebsite\(\s*\{ supabase, admin \},\s*\{ creatorId, mode, name: body\?\.name, chrome: generating && options\.generation === "blank" \? "none" : "theme", \.\.\.\(fromTemplate \? \{ template: \{ id: fromTemplate, userId: site\.ownerUserId \} \} : \{\}\), userId: site\.ownerUserId \},\s*\{ installTemplate: installCodeTemplate \},\s*\)/.test(route) && /const creatorId = creator\.id as string/.test(route))
  check("  its refusal keeps the code the page opens the full library sheet for", /made\.code \? \{ error: made\.error, code: made\.code \}/.test(route))
  check("the cover is taken as Add takes it, and the answer carries the install",
    /coverForNewWebsite\(\{ installId: made\.install\.id, userId: site\.ownerUserId, creatorId \}, renderOrigin\(req\.url\), "create", null\)/.test(route) &&
      /if \(!generating\) return NextResponse\.json\(\{ install: made\.install, \.\.\.first \}\)/.test(route) && /export const maxDuration = 60/.test(route))
  check("  and the browser is traced into its function", /'\/api\/website-builder\/themes\/create': \[\s*'\.\/node_modules\/\.pnpm\/@sparticuz\+chromium@\*\/node_modules\/@sparticuz\/chromium\/bin\/\*\*',\s*\]/.test(read("next.config.mjs")))
  const helper = code("lib/website-builder/create-website.ts")
  check("no one-copy check in the new path", !/already in your library/.test(helper + route) && !/\.eq\("theme_id"/.test(helper))
  check("Storelib Default, and buildThemePreset as it is", /getThemeDefinition\(STORELIB_DEFAULT_ID\)/.test(helper) && /buildThemePreset\(def\)/.test(helper))
  const add = code("app/api/website-builder/themes/add/route.ts")
  check("Add theme is unchanged: its own one-copy check, its own preset home, not the new helper",
    /"This theme is already in your library"/.test(add) && /pointAtStoreMenus\(preset\.pages\.home, carried\.menus, carried\)/.test(add) && !/create-website/.test(add) && /theme_id: themeId/.test(add))
  check("nothing in the new path reaches the code-sites product", !/lib\/sites|\/app\/sites|new-site-flow/.test(helper + route + code("lib/website-builder/start-handoff.ts")))
}

// ── 3. The handoff ────────────────────────────────────────────────────────
section("From the page to the editor's Ask panel")
{
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  const t0 = 1_800_000_000_000
  check("kept under the new website's own key", saveStartPrompt(storage, "abc", "  A bakery  ", t0) && startKey("abc") === "storelib:start-ai:abc" && store.has("storelib:start-ai:abc"))
  check("  another website's editor does not take it", takeStartPrompt(storage, "other", t0) === null && store.has("storelib:start-ai:abc"))
  /* Round L: the words exactly as written (spaces too), and read without being removed until the build starts. */
  check("  read back as written, and still there for a reload", peekStartPrompt(storage, "abc", t0 + 1_000)?.prompt === "  A bakery  " && store.has("storelib:start-ai:abc"))
  check("taken once: the words, then nothing", takeStartPrompt(storage, "abc", t0 + 5_000) === "  A bakery  " && takeStartPrompt(storage, "abc", t0 + 6_000) === null && !store.has("storelib:start-ai:abc"))
  saveStartPrompt(storage, "abc", "A bakery", t0, { generation: "blank", category: "candle_shop" })
  check("  kept with the options chosen, until cleared", JSON.stringify(peekStartPrompt(storage, "abc", t0)?.options) === JSON.stringify({ generation: "blank", category: "candle_shop" }) && (clearStartPrompt(storage, "abc"), !store.has(startKey("abc"))))
  saveStartPrompt(storage, "abc", "Late", t0)
  check(`older than ${START_TTL_MS / 60_000} minutes: nothing is sent, and the entry is gone`, takeStartPrompt(storage, "abc", t0 + START_TTL_MS + 1) === null && !store.has(startKey("abc")))
  saveStartPrompt(storage, "abc", "Just in time", t0)
  check("  just inside it, it is", takeStartPrompt(storage, "abc", t0 + START_TTL_MS - 1) === "Just in time")
  saveStartPrompt(storage, "abc", "From the future", t0 + 60_000)
  check("  one from a clock that moved back is not trusted", takeStartPrompt(storage, "abc", t0) === null)
  store.set(startKey("abc"), "{not json")
  check("  a broken entry is nothing, and removed", takeStartPrompt(storage, "abc", t0) === null && !store.has(startKey("abc")))
  /* Round L: never cut silently; one too long is not kept (the page cannot send one, the route refuses one). */
  check(`at most ${START_PROMPT_MAX.toLocaleString("en")} characters, never cut`, !saveStartPrompt(storage, "long", "x".repeat(5000), t0) && saveStartPrompt(storage, "long", "x".repeat(START_PROMPT_MAX), t0) && takeStartPrompt(storage, "long", t0)?.length === START_PROMPT_MAX)
  const throwing = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") }, removeItem: () => undefined }
  check("storage that refuses is no description, never an error", !saveStartPrompt(throwing, "abc", "x") && takeStartPrompt(throwing, "abc") === null && takeStartPrompt(null, "abc") === null && !saveStartPrompt(storage, "abc", "   "))

  const href = withStartParam("/store/mara/themes/abc/editor?previewPath=%2F")
  check("the editor's own address, with start=ai added", href === "/store/mara/themes/abc/editor?previewPath=%2F&start=ai" && withStartParam("/website-builder/editor/abc") === "/website-builder/editor/abc?start=ai")
  const back = readStartParam(`https://storelib.com${href}#x`)
  check("  read once and taken off, the rest of the address kept", back.wanted && back.cleaned === "/store/mara/themes/abc/editor?previewPath=%2F#x")
  check("  an address without it is left alone; another value is taken off but sends nothing",
    readStartParam("https://storelib.com/website-builder/editor/abc?previewPath=%2F").cleaned === null && readStartParam("https://storelib.com/e?start=xyz").wanted === false && readStartParam("https://storelib.com/e?start=xyz").cleaned === "/e")

  const asked = "Make me a website for my sourdough bakery in Lisbon"
  check("words that already ask for a website go as they are", startMessage(asked) === asked)
  const described = "A sourdough bakery in Lisbon, warm and simple, with pickup orders"
  check("a description alone gets one short lead, and the words verbatim after it", startMessage(described) === `${START_LEAD}${described}`)
  const examples = [
    "An online shop for my hand-poured soy candles, with a warm and calm look, best sellers on the home page and the story of how they are made.",
    "A website for my personal training business with my programs, client results, prices and a way to book a free first call.",
    "A portfolio for my wedding and portrait photography with galleries, packages and prices, and a contact form.",
    "A website that sells my watercolor course for beginners, with what is inside, reviews, an FAQ and a clear buy button.",
    described,
    asked,
    "photography portfolio",
  ]
  const kinds = examples.map((e) => classifyIntent(startMessage(e), { bodySections: 0 }).kind)
  check("every example, and a bare phrase, reaches the agent as a new website on the blank home page", kinds.every((k) => k === "NEW_SITE_GENERATION"), kinds)
  const chips = read("lib/website-builder/ai-site/start-options.ts")
  check("  those are the page's own examples", examples.slice(0, 4).every((e) => chips.includes(JSON.stringify(e))))

  const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const arrive = editor.slice(editor.indexOf("const [startAsk, setStartAsk]"), editor.indexOf("const startTaken"))
  /* Start with AI is a server job now (tests/ai-site-generator.test.ts): job= and start= both come off the address first; a description without a job builds inline. */
  check("the editor takes start (and job) off the address first, then the description, once, on arrival",
    /const job = readJobParam\(window\.location\.href\)\s*if \(job\.cleaned !== null\) window\.history\.replaceState\(window\.history\.state, "", job\.cleaned\)\s*const read = readStartParam\(window\.location\.href\)\s*if \(read\.cleaned !== null\) window\.history\.replaceState\(window\.history\.state, "", read\.cleaned\)/.test(arrive) &&
      arrive.indexOf("replaceState") < arrive.indexOf("peekStartPrompt(stored, installId)") && /\}, \[\]\)/.test(arrive))
  check("  opens the Ask panel once the website is up (with or without a description)",
    /if \(!startOpen \|\| loading \|\| teamMember\) return\s*setStartOpen\(false\)\s*setAiOpen\(true\)/.test(arrive) && /setStartOpen\(true\)/.test(arrive))
  check("  and hands it to whichever panel is showing, sent after the website has loaded",
    /* Round L: a second ask (Edit with AI again, Ask AI to fix) is a new id, so the chat sends it too. */ /startAsk && !loading && !loadFailed && !teamMember \? \{ id: startAskSeq, text: startAsk \} : null/.test(arrive) && (editor.match(/sendRequest=\{startSend\}\s*onSendRequestTaken=\{startTaken\}/g) ?? []).length === 2 &&
      /const startTaken = useCallback\(\(\) => setStartAsk\(null\), \[\]\)/.test(editor))
  /* Changed on purpose (round AQ): the description is also kept as the inline build's record (saveInlineBuild) before the build starts, so a reload carries it on. */
  check("  a description with no job is built in the editor's own request (the fallback before SQL part 380)", /if \(waiting\) \{\s*saveInlineBuild\(stored, installId, \{ prompt: waiting\.prompt, checkpoint: null \}\)\s*setGenSource\(\{ kind: "inline", prompt: waiting\.prompt \}\)/.test(arrive))
  const chat = code("components/website-builder/theme-chat.tsx")
  check("the Ask panel sends it through its own submit, as if typed, after the history is read",
    /const submitRef = React\.useRef\(submit\)/.test(chat) && /if \(text === null \|\| !wanted \|\| loadingHistory\) return\s*pendingSend\.current = null\s*submitRef\.current\(text\)/.test(chat) &&
      /if \(!sendRequest \|\| sendRequest\.id === seenSend\.current\) return/.test(chat) && /if \(dock\) openDock\(\)\s*onSendRequestTaken\?\.\(sendRequest\.id\)/.test(chat))
}

// ── 4. The page ───────────────────────────────────────────────────────────
section("The Website page's three doors")
{
  const noop = () => undefined
  const draw = (props: Partial<Parameters<typeof StartWebsite>[0]> = {}) =>
    renderToStaticMarkup(createElement(StartWebsite, { full: false, starting: null, onStart: noop, onFull: noop, onBrowse: noop, ...props }))
  const open = draw()
  check("Create a website, with Start with AI, Start from blank and Browse themes",
    />Create a website</.test(open) && /data-start-door="ai"/.test(open) && />Start with AI</.test(open) && /data-start-door="blank"/.test(open) && />Start from blank</.test(open) &&
      /data-start-door="themes"/.test(open) && />Browse themes</.test(open))
  check("  Start with AI is a labelled box of at most 2,000 characters, and Create waits for words",
    /<label for="start-ai-prompt"[^>]*>Describe your website<\/label>/.test(open) && /maxLength="2000"/.test(open) && /<button type="submit" data-start-create=""[^>]*disabled=""/.test(open))
  check("  with four examples that fill it", (open.match(/data-start-example="[a-z_]+"/g) ?? []).length === 4)
  /* Changed on purpose (templates round 16): Browse themes opens the theme marketplace as a popup over the page, so the door is a button and no address is behind it. */
  check("  Browse themes is a button that opens the marketplace popup, not a link to a page", /<button type="button" data-start-door="themes"[^>]*aria-haspopup="dialog"/.test(open) && !/href="\/app\/website-builder\/themes"/.test(open))
  check("  no way to the code-sites product", !/\/app\/sites/.test(open))

  const full = draw({ full: true })
  check("a full library keeps the doors, says so, and points at removing one",
    /data-start-website="full"/.test(full) && /data-start-full=""/.test(full) && />Your library is full</.test(full) && /Remove a website from your library to start another\./.test(full) &&
      (full.match(/aria-describedby="start-full-note"/g) ?? []).length === 4 && !/aria-disabled/.test(full) && (full.match(/aria-haspopup="dialog"/g) ?? []).length === 2)
  check("  and the full library sheet names this way in", /start another website/.test(libraryFullSentence("create")))
  const member = draw({ teamMember: true })
  check("a team member gets Start from blank and Browse themes, not Start with AI", !/data-start-door="ai"/.test(member) && /data-start-door="blank"/.test(member) && /data-start-door="themes"/.test(member))
  const busy = draw({ starting: "blank" })
  check("while a website is being made, the doors wait", /aria-busy="true"/.test(busy) && /animate-spin/.test(busy))

  const client = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
  /* Changed on purpose (templates round 16): only where the page is asked for with `create`, which is /app/website-builder/ai; /app/website-builder starts with the websites. */
  check("  and only on the page asked for with create (/app/website-builder/ai, not indexed, the same loader and check)",
    /\{create && \(\s*<StartWebsite/.test(client) && /create = false,/.test(client) && /return WebsitePage\(\{ create: true \}\)/.test(code("app/(storelib)/app/website-builder/ai/page.tsx")) &&
      /robots: \{ index: false, follow: false \}/.test(code("app/(storelib)/app/website-builder/ai/page.tsx")) && /return WebsitePage\(\{\}\)/.test(code("app/(storelib)/app/website-builder/page.tsx")) &&
      /create=\{create\}/.test(code("app/(storelib)/app/website-builder/website-page.tsx")))
  check("  without it Start from blank is a quiet button beside the Library heading, through the same create",
    /\{create \? null : \(\s*<Button\s*variant="ghost"\s*data-start-blank="library"\s*onClick=\{\(\) => void startWebsite\("blank"\)\}/.test(client))
  check("the page draws it above the live website", client.indexOf("<StartWebsite") > 0 && client.indexOf("<StartWebsite") < client.indexOf('aria-labelledby="live-heading"') &&
    /full=\{slotsLeft === 0\}/.test(client) && /teamMember=\{teamMember\}/.test(client) && /onFull=\{\(\) => setFull\("create"\)\}/.test(client))
  check("  one way to the themes: Add theme is Browse themes now", (client.match(/\/app\/website-builder\/themes/g) ?? []).length === 0 && /* Changed on purpose (templates round 16): no address at all, the door opens the popup. */ (read("app/(storelib)/app/website-builder/start-website.tsx").match(/\/app\/website-builder\/themes"/g) ?? []).length === 0 && /onBrowse=\{openThemes\}/.test(client))
  const start = client.slice(client.indexOf("const startWebsite = async"), client.indexOf("const exportTheme = async"))
  check("  pressing creates through the new route, and a full answer opens the sheet",
    /fetch\("\/api\/website-builder\/themes\/create", json\("POST", withAi \? \{ mode, prompt, key, options: chosen \} : \{ mode \}\)\)/.test(start) && /if \(data\.code === LIBRARY_FULL_CODE\) \{\s*setFull\("create"\)/.test(start) && /if \(slotsLeft === 0\) \{\s*setFull\("create"\)/.test(start))
  check("  with AI the description is kept for that website and the editor opened with start=ai; blank opens it plainly",
    /if \(withAi && !jobId\) saveStartPrompt\(storage, id, prompt!, Date\.now\(\), chosen\)/.test(start) && /go\(withAi \? \(jobId \? withJobParam\(editorHref\(username, id\), jobId\) : withStartParam\(editorHref\(username, id\)\)\) : editorHref\(username, id\)\)/.test(start) &&
      start.indexOf("saveStartPrompt") < start.indexOf("go(withAi"))
  /* It goes in the request body now (the server builds the site), still never in the address. */
  check("  the description never goes in the address", !/encodeURIComponent\(prompt\)/.test(start) && !/[?&]prompt=/.test(start))
  check("the page has no link to /app/sites", !/\/app\/sites|new-site-flow/.test(client + read("app/(storelib)/app/website-builder/start-website.tsx")))
}

// ── 5. Start with AI from one of Storelib's templates (round 26) ──────────
section("Start with AI makes the website from the closest Materia template")
{
  const who = { userId: "u1", creatorId: "c1" }
  /* The helper with the import stood in: the limit first, the name picked, the import's answer passed on. */
  const calls: { template: string; name: string }[] = []
  const stub = (async (_admin: unknown, _who: unknown, template: string, opts: { name: string }) => {
    calls.push({ template, name: opts.name })
    return { ok: true, installId: "tpl-1", name: opts.name, template }
  }) as never
  const db = fakeDb({ installs: [install({ name: "AI website" })], themes: catalogue })
  const made = await create({ supabase: db.client, admin: db.client }, { creatorId: "c1", mode: "ai", template: { id: "trainer", userId: "u1" } }, { menus: noMenus, installTemplate: stub })
  check("an AI start with a template is that template, imported, one website", made.ok && made.install.id === "tpl-1" && made.install.template === "trainer" && calls.length === 1 && calls[0].template === "trainer", made)
  check("  named as every AI start is (a number when taken), and no Storelib Default rows written", calls[0]?.name === "AI website 2" && db.tables.installs.length === 1 && db.tables.pages.length === 0 && db.tables.settings.length === 0)
  const full = fakeDb({ installs: Array.from({ length: THEME_INSTALL_LIMIT }, (_, i) => install({ sort_order: i, status: i ? "draft" : "published" })), themes: catalogue })
  calls.length = 0
  const refused = await create({ supabase: full.client, admin: full.client }, { creatorId: "c1", mode: "ai", template: { id: "trainer", userId: "u1" } }, { menus: noMenus, installTemplate: stub })
  check("  a full library refuses before anything is imported, with the code the page opens its sheet for", !refused.ok && refused.code === LIBRARY_FULL_CODE && refused.error === LIBRARY_FULL_MESSAGE && calls.length === 0, refused)
  const failing = (async () => ({ ok: false, status: 500, error: "Could not make the website from its template. Try again." })) as never
  const failed = await create({ supabase: db.client, admin: db.client }, { creatorId: "c1", mode: "ai", template: { id: "trainer", userId: "u1" } }, { menus: noMenus, installTemplate: failing })
  check("  an import that fails is the answer, with nothing of Storelib Default made in its place", !failed.ok && failed.status === 500 && db.tables.installs.length === 1, failed)
  const noImport = await create({ supabase: db.client, admin: db.client }, { creatorId: "c1", mode: "ai", template: { id: "trainer", userId: "u1" } }, { menus: noMenus })
  check("  without the import injected (a browser never has it) it refuses rather than make something else", !noImport.ok && noImport.status === 500)

  /* The real template, composed, converted and stored by the import's own writes into the database in memory. */
  const zip = await composeTemplateZip("materia/trainer")
  const real = await installCodeTemplate(db.client, who, "trainer", { name: "Mateo's coaching", deps: { compose: async () => zip, menus: async () => undefined, store: (a, w, t, r, o) => storeImportedTheme(a, w, t, r, { ...o, menus: noMenus as never }) } })
  const row = real.ok ? db.tables.installs.find((r) => r.id === real.installId) : null
  const files = db.tables.files.filter((f) => real.ok && f.install_id === real.installId)
  const pages = db.tables.pages.filter((p) => real.ok && p.install_id === real.installId)
  check("the real import: a draft install, first in the library, named for the creator", real.ok && row?.status === "draft" && row?.name === "Mateo's coaching" && row?.is_custom === true, { real, row })
  check("  Materia's own section files (compat), its pages with the template's sections, its settings", files.length > 200 && files.some((f) => /<template compat="shopify">/.test(String(f.content))) && pages.some((p) => p.page_key === "home" && (p.sections as { type: string }[]).length >= 5 && (p.sections as { type: string }[]).every((x) => files.some((f) => f.path === `sections/${x.type}.storelib`))) && db.tables.settings.some((x) => real.ok && x.install_id === real.installId), { files: files.length, pages: pages.map((p) => p.page_key) })

  for (const what of ["pages.insert", "settings.insert", "files.insert"] as const) {
    const broken = fakeDb({ installs: [install()], themes: catalogue }, { fail: { [what]: { message: "boom" } } })
    const r = await installCodeTemplate(broken.client, who, "trainer", { name: "AI website", deps: { compose: async () => zip, menus: async () => undefined, store: (a, w, t, rep, o) => storeImportedTheme(a, w, t, rep, { ...o, menus: noMenus as never }) } })
    check(`  a failed ${what.replace(".insert", "")} write takes the new website back (one install left: the old one)`, !r.ok && (r as { status?: number }).status === 500 && broken.tables.installs.length === 1 && broken.log.some((l) => l.startsWith("delete installs")), { r, log: broken.log })
  }
  const raced = fakeDb({ installs: [install()], themes: catalogue }, { fail: { "installs.insert": { message: "library_full" } } })
  const racedR = await installCodeTemplate(raced.client, who, "trainer", { name: "AI website", deps: { compose: async () => zip, menus: async () => undefined, store: (a, w, t, rep, o) => storeImportedTheme(a, w, t, rep, { ...o, menus: noMenus as never }) } })
  check("  two at once past the limit: refused as a full library", !racedR.ok && (racedR as { code?: string }).code === LIBRARY_FULL_CODE)
  const unknownTemplate = await installCodeTemplate(db.client, who, "../etc", { name: "x" })
  check("  only a template the code lists", !unknownTemplate.ok && (unknownTemplate as { status?: number }).status === 400)
  const badZip = await installCodeTemplate(db.client, who, "trainer", { name: "x", deps: { compose: async () => { throw new Error("no files") } } })
  const noConvert = await installCodeTemplate(db.client, who, "trainer", { name: "x", deps: { compose: async () => zip, convert: (async () => ({ ok: false, error: "nope" })) as never } })
  check("  a template that cannot be composed or converted is a plain failure, nothing stored", !badZip.ok && (badZip as { status?: number }).status === 500 && !noConvert.ok && (noConvert as { status?: number }).status === 500 && !/no files|nope/.test(String((badZip as { error?: string }).error)))

  /* The route: chosen and imported before the job, the job told which template, From scratch and the older paths kept. */
  const route = code("app/api/website-builder/themes/create/route.ts")
  check("the route chooses the closest template from the words and the example, before the website is made",
    /const fromTemplate = generating && engine === "agent" && options\.generation === "theme" && !noJobsTable \? chooseMateriaTemplate\(\{ prompt, category: options\.category \?\? null \}\)\.template\.template : null/.test(route) && route.indexOf("const fromTemplate") < route.indexOf("createStartWebsite(") && route.indexOf("createStartWebsite(") < route.indexOf("startJobRow("))
  check("  the job is told which template it was made from", /options: fromTemplate \? \{ \.\.\.options, template: fromTemplate \} : options/.test(route))
  check("  From scratch stays a blank page, and the classic engine and the in-request path keep Storelib Default", /options\.generation === "theme"/.test(route) && /engine === "agent"/.test(route) && /!noJobsTable/.test(route) && /chrome: generating && options\.generation === "blank" \? "none" : "theme"/.test(route))
  check("  a job that cannot be written still takes its website back", /if \(job\.kind !== "made"\) \{\s*await admin\.from\("store_theme_installs"\)\.delete\(\)\.eq\("id", made\.install\.id\)\.eq\("creator_id", creatorId\)/.test(route))
  check("a fitness coach's description picks a coaching template", ["trainer", "fitness", "coach"].includes(chooseMateriaTemplate({ prompt: "A website for my personal training business", category: "fitness_coach" }).template.template))
  check("the Website page starts on From a Storelib template, From scratch still a choice", START_GENERATION === "theme" && /tt\("From a Storelib template"\)/.test(read("app/(storelib)/app/website-builder/start-website.tsx")) && /tt\("From scratch"\)/.test(read("app/(storelib)/app/website-builder/start-website.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
