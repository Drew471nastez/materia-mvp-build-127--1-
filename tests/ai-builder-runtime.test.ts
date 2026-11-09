/**
 * Round L4: the AI component runtime is first class, functional and safe.
 *
 *   1. form_picker: resolved to the creator's own published forms only,
 *      drawn as the live native form (the page's island, answers through
 *      /api/forms/<id>/submit), read by the live site and the builder.
 *   2. Bindings resolve only this creator's ids; list_capabilities carries
 *      real ids, variants and Buy now links.
 *   3. An AI blank site (site_chrome "home") wears no header or footer
 *      anywhere a page's own stale copy would have shown one; every other
 *      site keeps the old rule. A coded header is found by kind.
 *   4. custom_tokens come out as --t-* variables, unsafe values refused.
 *   5. The render check's diagnostics.
 *   6. The sandbox's island marks and the preview error bridge.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-builder-runtime.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveOne } from "@/lib/storelib-theme/resolve"
import { controlFor } from "@/lib/storelib-theme/controls/registry"
import { Linked } from "@/lib/storelib-theme/values"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { formReferences, storefrontData } from "@/lib/website-builder/storefront-data"
import { storefrontForm, storefrontForms, storefrontFormsFrom } from "@/lib/forms/storefront-forms"
import { formIslandOf, NATIVE_FORM_ATTR } from "@/lib/website-builder/form-islands"
import { attrAllowed } from "@/lib/storelib-theme/sandbox/protocol"
import { applyUniversalChrome, chromeOf, homeChromeOnly, homeOnlyChrome, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { kindLookup } from "@/lib/storelib-theme/section-groups"
import { syncChrome } from "@/lib/website-builder/ai-site/apply"
import { customTokenVars, themeVars, CUSTOM_TOKENS_KEY } from "@/lib/website-builder/theme-css"
import { CUSTOM_TOKENS_SETTING, CUSTOM_TOKEN_PREFIX } from "@/lib/ai-builder/types"
import { STORELIB_HOOKS } from "@/lib/ai-builder/runtime-contract"
import { runtimeCapabilities, bindableIds } from "@/lib/ai-builder/capabilities"
import { renderCheck, linkProblem, esbuildScriptParser } from "@/lib/ai-builder/render-check"
import { acceptPreviewError, cleanErrorMessage, isPreviewErrorEvent, previewErrorPayload, PreviewErrorQueue, PREVIEW_ERROR_LIMITS } from "@/lib/ai-builder/preview-errors"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { StorefrontForm } from "@/lib/storelib-theme/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const OWNER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const FORM_MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const FORM_BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const FORM_THEIRS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const FORM_DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

const ROWS = [
  { id: FORM_MINE, owner_id: OWNER, title: "Free consult", status: "published", published: { title: "Free consult", fields: [{ id: "q1", type: "email" }, { id: "q2", type: "textarea" }] } },
  { id: FORM_BOOKING, owner_id: OWNER, title: "Book a session", status: "published", published: { title: "Book a session", fields: [], booking: { duration: 30 } } },
  { id: FORM_THEIRS, owner_id: OTHER, title: "Someone else's", status: "published", published: { title: "x", fields: [] } },
  { id: FORM_DRAFT, owner_id: OWNER, title: "Not yet", status: "draft", published: null },
]

function card(id: string, title: string, slug: string, extra: Partial<ProductCard["settings"]> = {}): ProductCard {
  return {
    id,
    type: "product",
    settings: { title, price: "$48.00", compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: "", images: [], url: `/products/${slug}`, slug, kind: "digital", available: true, tag: "", checkout_url: `/checkout?productId=${id}&src=website`, variants: [], ...extra },
  }
}
const P1 = "p1111111-0000-4000-8000-000000000001".replace("p", "a")
const P2 = "a2222222-0000-4000-8000-000000000002"
const PRODUCTS: ProductCard[] = [
  card(P1, "Linen apron", "linen-apron", { kind: "physical", variants: [{ id: "v-small", name: "Small", price: "$44.00", compare_price: "", free: false, available: true, checkout_url: `/checkout?productId=${P1}&variantId=v-small` }] }),
  card(P2, "Strength plan", "strength-plan", { kind: "course" }),
]

/* ── the three custom sections of a sample AI blank site ── */
const AI_HEADER = `<template>
<header class="h">
  <a class="h__logo" href="/">{{ settings.brand }}</a>
  <nav>{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
  <button type="button" data-storelib-cart>Bag <span data-storelib-cart-count></span></button>
</header>
</template>
<style scoped>
.h { display: flex; justify-content: space-between; padding: 16px var(--t-gutter, 20px); background: var(--t-ink, #111); color: #fff; }
</style>
<schema>
{ "type": "ai_header", "name": "AI header", "kind": "header", "enabled_on": { "groups": ["header"] }, "settings": [
  { "type": "text", "id": "brand", "label": "Brand", "default": "North Studio" },
  { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }
] }
</schema>
`
const AI_FORM = `<template>
<section class="f">
  <h2>{{ settings.heading }}</h2>
  {% if settings.form.id %}<p class="f__t">{{ settings.form.title }}</p><div ${NATIVE_FORM_ATTR}="{{ settings.form.id }}" data-presentation="inline"></div>{% endif %}
</section>
</template>
<schema>
{ "type": "ai_form", "name": "AI form", "settings": [
  { "type": "text", "id": "heading", "label": "Heading", "default": "Talk to us" },
  { "type": "form_picker", "id": "form", "label": "Form" }
] }
</schema>
`
const AI_GRID = `<template>
<section class="g">
  <h2>{{ settings.heading }}</h2>
  <div class="g__grid">
  {% for block in settings.products %}
    <article class="g__card">
      <a href="{{ block.settings.url }}"><h3>{{ block.settings.title }}</h3></a>
      <p>{{ block.settings.price }}</p>
      <button type="button" data-storelib-add-to-cart="{{ block.id }}" data-title="{{ block.settings.title }}" data-price="{{ block.settings.price }}">Add to bag</button>
      <a href="{{ block.settings.checkout_url | url }}">Buy now</a>
    </article>
  {% endfor %}
  </div>
</section>
</template>
<style scoped>
.g__grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@container (min-width: 760px) { .g__grid { grid-template-columns: repeat(3, 1fr); } }
</style>
<schema>
{ "type": "ai_grid", "name": "AI product grid", "settings": [
  { "type": "text", "id": "heading", "label": "Heading", "default": "Shop" },
  { "type": "product_list", "id": "products", "label": "Products", "limit": 6 }
] }
</schema>
`

const SOURCES = { "sections/ai_header.storelib": AI_HEADER, "sections/ai_form.storelib": AI_FORM, "sections/ai_grid.storelib": AI_GRID }
const THEME = { [CUSTOM_TOKENS_SETTING]: { ink: "#1b1b1b", gutter: "24px" }, site_chrome: "home" } as unknown as ThemeSettingsValues

async function main() {
  console.log("\n1. form_picker")
  check("form_picker is a registry control", !!controlFor("form_picker") && controlFor("form_picker")!.value === "string")
  const forms = storefrontFormsFrom(ROWS, OWNER)
  check("only this owner's published forms are offered", Object.keys(forms).sort().join(",") === [FORM_MINE, FORM_BOOKING].sort().join(","), Object.keys(forms))
  check("a booking form says so", forms[FORM_BOOKING]?.booking === true && forms[FORM_BOOKING]?.kind === "booking" && forms[FORM_MINE]?.booking === false)
  check("a form's own page is its address", forms[FORM_MINE]?.url === `/request/forms/${FORM_MINE}`)
  check("a draft is never a storefront form", storefrontForm(ROWS[3]) === null)
  const def = { id: "form", type: "form_picker", label: "Form" } as never
  const mine = resolveOne(def, FORM_MINE, { forms })
  check("my form resolves to its facts and prints as its page", mine instanceof Linked && String(mine) === `/request/forms/${FORM_MINE}` && (mine as Linked).fields.title === "Free consult" && (mine as Linked).fields.id === FORM_MINE)
  check("upper case id still mine", resolveOne(def, FORM_MINE.toUpperCase(), { forms }) instanceof Linked)
  check("another creator's form resolves empty", resolveOne(def, FORM_THEIRS, { forms }) === "")
  check("no forms known: empty", resolveOne(def, FORM_MINE, {}) === "")
  check("a prototype key is not a form", resolveOne(def, "__proto__", { forms }) === "" && resolveOne(def, "constructor", { forms }) === "")

  const formSection: SectionInstance = { id: "f1", type: "ai_form", settings: { form: FORM_MINE } } as unknown as SectionInstance
  const drawn = renderStorelibSection(formSection, {} as ThemeSettingsValues, { template: "index" }, SOURCES, [], storefrontData({ dynamic: { shop: {}, creator: {} } as never, forms }))
  check("the section draws the live form's mark for my form", drawn.ok === true && drawn.html.includes(`${NATIVE_FORM_ATTR}="${FORM_MINE}"`) && drawn.html.includes("Free consult"), drawn.ok ? drawn.html.slice(0, 400) : drawn)
  const theirs = renderStorelibSection({ ...formSection, settings: { form: FORM_THEIRS } }, {} as ThemeSettingsValues, { template: "index" }, SOURCES, [], storefrontData({ dynamic: { shop: {}, creator: {} } as never, forms }))
  check("and nothing for another creator's", theirs.ok === true && !theirs.html.includes(NATIVE_FORM_ATTR))
  const schemaOf = (t: string) => schemasFromSources(SOURCES)[t]
  check("the live page reads the form ids its sections name", formReferences([formSection, { ...formSection, id: "f2", settings: { form: "not-a-uuid" } } as unknown as SectionInstance], schemaOf).join(",") === FORM_MINE)
  check("the editor's sidebar sees a form_picker field", schemaOf("ai_form")?.fields.some((f) => f.id === "form" && (f.type as string) === "form_picker") === true, schemaOf("ai_form")?.fields)

  /* The read is scoped in the query itself. */
  const calls: string[] = []
  const fakeDb = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const chain = new Proxy(q, {
        get(_t, prop: string) {
          if (prop === "then") {
            const rows = table === "native_forms" ? ROWS : []
            return (ok: (v: unknown) => void) => ok({ data: rows, error: null })
          }
          if (prop === "maybeSingle") return async () => ({ data: table === "creators" ? { user_id: OWNER } : null, error: null })
          return (...args: unknown[]) => {
            calls.push(`${table}.${prop}(${args.map((a) => JSON.stringify(a)).join(",")})`)
            return chain
          }
        },
      })
      return chain
    },
  }
  const read1 = await storefrontForms(fakeDb, "creator-1", [FORM_MINE, FORM_THEIRS])
  check("storefrontForms asks for this owner's published rows only", calls.includes(`native_forms.eq("owner_id","${OWNER}")`) && calls.includes(`native_forms.eq("status","published")`), calls)
  check("and drops a row of somebody else's even if the database returned it", !(FORM_THEIRS in read1) && FORM_MINE in read1)
  check("no owner found: no forms", Object.keys(await storefrontForms({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }, "c", "all")).length === 0)

  check("a form mark is read off its attributes", JSON.stringify(formIslandOf((n) => ({ [NATIVE_FORM_ATTR]: FORM_MINE.toUpperCase(), "data-presentation": "card", "data-title": "  Book  " } as Record<string, string>)[n] ?? null)) === JSON.stringify({ formId: FORM_MINE, presentation: "card", title: "Book" }))
  check("a mark with no form id draws nothing", formIslandOf((n) => (n === NATIVE_FORM_ATTR ? "javascript:alert(1)" : null)) === null)
  check("an unknown presentation is inline", formIslandOf((n) => (n === NATIVE_FORM_ATTR ? FORM_MINE : n === "data-presentation" ? "popover" : null))?.presentation === "inline")
  const island = read("components/website-builder/sections/form-islands.tsx")
  const publicForm = read("components/forms/public-form.tsx")
  check("the island is Storelib's own native form, sent from the website", /NativeFormBlock/.test(island) && /source="website"/.test(island) && /preview=\{preview\}/.test(island))
  check("answers go to the native forms route", /\/api\/forms\/\$\{[^}]+\}\/submit/.test(publicForm) || /api\/forms\/.*submit/.test(publicForm))
  check("the submit route takes ownership from the form row, never the body", /Ownership always comes from the form row/.test(read("app/api/forms/[id]/submit/route.ts")))
  check("StorelibSection draws the islands, a preview in the canvas", /<FormIslands root=\{scriptRoot\} html=\{onPage\} preview=\{!!\(isEditing \|\| insideEditor \|\| inEditor\)\}/.test(read("components/website-builder/sections/StorelibSection.tsx")))
  check("an edit in the sidebar leaves the drawn form alone", /hasAttribute\("data-storelib-native-form"\)/.test(read("lib/website-builder/morph-html.ts")))
  check("the live site reads the forms a page names", /formReferences\(sections, schemaOf\)/.test(read("lib/website-builder/published-site.ts")) && /storefrontForms\(createAdminClient\(\) as never, site\.creatorId, formIds\)/.test(read("lib/website-builder/published-site.ts")))
  check("the builder gets the forms after its ownership check", /creatorFormsForBuilder\(creator!\.id, ownerUserId \?\? null\)/.test(read("app/api/website-builder/themes/[installId]/route.ts")) && /forms: builderForms\?\.cards/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
  check("the sidebar draws a form_picker", /case "form_picker":\s*return <FormPickerControl/.test(read("components/website-builder/editor/controls/index.tsx")))
  check("the hook is in the runtime contract", STORELIB_HOOKS.nativeForm === NATIVE_FORM_ATTR)

  console.log("\n2. bindings resolve only this creator's data")
  const communities = { "c0000000-0000-4000-8000-000000000001": { id: "c0000000-0000-4000-8000-000000000001", name: "Run club", tagline: "", url: "/community/run-club", image: "", logo: "", members: 3, members_label: "3 members", posts: 0, events: 0, price: "Free", join_label: "Join" } }
  check("a community that is not mine is empty", resolveOne({ id: "c", type: "community_picker", label: "C" } as never, "c9999999-0000-4000-8000-000000000009", { communities }) === "")
  check("a community that is mine resolves", resolveOne({ id: "c", type: "community_picker", label: "C" } as never, "c0000000-0000-4000-8000-000000000001", { communities }) instanceof Linked)
  check("a product id not in the shop is never filled with somebody's product", !(resolveOne({ id: "p", type: "product_picker", label: "P" } as never, "a9999999-0000-4000-8000-000000000009", { catalog: PRODUCTS }) instanceof Linked))
  const list = resolveOne({ id: "ps", type: "product_list", label: "P" } as never, [P1, "a9999999-0000-4000-8000-000000000009", P2], { catalog: PRODUCTS }) as { id: string }[]
  check("a product list keeps only the shop's products", list.map((b) => b.id).join(",") === `${P1},${P2}`)
  check("a collection that is not mine is empty", resolveOne({ id: "k", type: "collection_picker", label: "K" } as never, "k-other", { collections: {} }) === "")

  const caps = runtimeCapabilities({
    store: { name: "North Studio", currency: "EUR", brandImage: null, tagline: null },
    products: PRODUCTS,
    collections: { col1: { id: "col1", title: "Aprons", handle: "aprons", description: "", image: "", url: "/collections/aprons", products_count: 1, products: [] } },
    communities: [{ id: "c0000000-0000-4000-8000-000000000001", name: "Run club", slug: "run-club", shows: true }, { id: "c-hidden", name: "Draft", slug: "draft", shows: false }],
    forms,
    pages: [{ key: "home", title: "Home" }, { key: "about", title: "About" }],
    menus: { "main-menu": { title: "Main menu" } },
    blogPosts: 0,
    reviews: null,
    username: "northstudio",
    mainDomain: "storelib.com",
    social: ["https://instagram.com/northstudio", "javascript:alert(1)"],
  })
  check("products carry ids, variants and their Buy now links", caps.products[0].id === P1 && caps.products[0].checkout_url.startsWith("/checkout?productId=") && caps.products[0].variants[0]?.id === "v-small" && caps.products[0].variants[0]?.checkout_url.includes("variantId=v-small"))
  check("forms with ids, a booking one marked", caps.forms.length === 2 && caps.forms.some((f) => f.booking && f.id === FORM_BOOKING))
  check("a community a visitor cannot see is not offered", caps.communities.length === 1 && caps.communities[0].url === "/community/run-club")
  check("the creator's own page and safe social links", caps.links.creatorPage === "https://storelib.com/northstudio" && caps.links.social.length === 1)
  check("features say what is real", ["shop", "courses", "bookings", "forms", "communities"].every((f) => caps.features.includes(f)) && !caps.features.includes("memberships") && !caps.features.includes("blog"), caps.features)
  check("pages carry their addresses", caps.pages.find((p) => p.key === "about")?.url === "/about" && caps.pages.find((p) => p.key === "home")?.url === "/")
  const ids = bindableIds(caps)
  check("bindable ids are exactly what was listed", ids.products.has(P1) && ids.variants.has("v-small") && ids.forms.has(FORM_MINE) && !ids.forms.has(FORM_THEIRS) && ids.collections.has("col1"))
  check("the capability reader scopes every read to the creator", (() => {
    const src = read("lib/ai-builder/capabilities.ts")
    return /\.eq\("id", installId\)\.eq\("creator_id", creatorId\)/.test(src) && /from\("communities"\)[^\n]*\.eq\("creator_id", creatorId\)/.test(src) && /storefrontForms\(db, creatorId, "all", owner\)/.test(src) && /from\("site_blog_posts"\)[^\n]*\.eq\("creator_id", creatorId\)/.test(src)
  })())

  console.log("\n3. an AI blank site wears no chrome it did not make")
  const staleHeader = { id: "old-h", type: "header", settings: {} } as unknown as SectionInstance
  const staleFooter = { id: "old-f", type: "footer", settings: {} } as unknown as SectionInstance
  const body = (id: string) => ({ id, type: "ai_grid", settings: {} }) as unknown as SectionInstance
  const pages = { home: [body("hero")], about: [staleHeader, body("about-body"), staleFooter], product: [staleHeader, body("prod")] }
  const kinds = kindLookup(SOURCES)
  const blank = applyUniversalChrome(pages, "home", kinds, { homeOnly: true })
  check("blank site: no page keeps a header or footer home lacks", Object.values(blank).every((list) => list.every((s) => s.type !== "header" && s.type !== "footer")), blank)
  const legacy = applyUniversalChrome(pages, "home", kinds)
  check("every other site keeps a page's own chrome when home has none (unchanged)", legacy.about.some((s) => s.type === "header") && legacy.about.some((s) => s.type === "footer"))
  check("the marker is the theme setting site_chrome: home", homeChromeOnly({ site_chrome: "home" }) && !homeChromeOnly({}) && !homeChromeOnly({ site_chrome: "page" }) && !homeChromeOnly(null))
  const coded = { id: "ai-h", type: "ai_header", settings: {}, group: "header" } as unknown as SectionInstance
  const withCoded = applyUniversalChrome({ home: [coded, body("hero")], about: [staleHeader, body("about-body")] }, "home", kinds, { homeOnly: true })
  check("blank site with its own coded header: that header on every page, the stale one gone", withCoded.about[0].id === "ai-h" && !withCoded.about.some((s) => s.id === "old-h"), withCoded.about.map((s) => s.id))
  check("a preview of one page (render-site) gets the same answer", withUniversalChrome(pages.about, chromeOf(pages.home, { homeOnly: true })).every((s) => s.type !== "header" && s.type !== "footer"))
  check("the editor's merge too", withUniversalChrome(pages.about, homeOnlyChrome(chromeOf(pages.home))).every((s) => s.type !== "header" && s.type !== "footer"))
  const synced = syncChrome({ settings: { site_chrome: "home" }, pages: { home: [body("hero")], about: [body("a")] } })
  check("the classic job's syncChrome adds no header or footer to a site with none", Object.values(synced.pages).every((l) => l.every((s) => s.type !== "header" && s.type !== "footer")))
  /* Drawn: nothing a visitor sees comes from a header file. */
  const blankAbout = renderAll(blank.about)
  check("the blank about page draws no <header> and no nav", !/<header\b/.test(blankAbout) && !/<nav\b/.test(blankAbout), blankAbout.slice(0, 300))
  check("the live site applies the rule (every address: /w/<name> and a custom domain, which proxy.ts rewrites to /w/<name>)", /applyUniversalChrome\(pages, "home", kindLookup\(sources, SECTION_SCHEMAS as never\), \{ homeOnly: homeChromeOnly\(themeSettings/.test(read("lib/website-builder/published-site.ts")) && /to\.pathname = `\/w\/\$\{record\.name\}/.test(read("proxy.ts")))
  check("a preview link applies it", /chromeOf\([^\n]*\{ homeOnly: homeChromeOnly\(themeSettings/.test(read("app/(site)/w/[username]/render-site.tsx")))
  check("the editor applies it from the first load", /homeChromeOnlyRef\.current = homeChromeOnly\(loadedSettings/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")) && /withUniversalChrome\(page, homeChromeOnlyRef\.current \? homeOnlyChrome\(chrome\) : chrome\)/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
  const product = read("components/website-builder/theme/render-product.tsx")
  check("the product page finds a coded header by kind, and keeps the old composition for every other site", /if \(homeOnly \|\| codedChrome\)/.test(product) && /homeHeader\) \?\? sections\.find\(\(s\) => s\.type === "header"\)/.test(product))
  check("a preview draws the files as last saved (an AI file has no live half yet)", /draft: preview/.test(read("app/(site)/w/[username]/render-site.tsx")) && /draftSectionSources/.test(read("lib/website-builder/published-site.ts")))

  console.log("\n4. custom tokens")
  check("the setting names agree with the contract", CUSTOM_TOKENS_KEY === CUSTOM_TOKENS_SETTING && CUSTOM_TOKEN_PREFIX === "--t-")
  const vars = themeVars(THEME)
  check("tokens come out as --t-* beside the theme's own", vars["--t-ink"] === "#1b1b1b" && vars["--t-gutter"] === "24px" && typeof vars["--theme-primary"] === "string")
  check("a site with no tokens gets no --t- variable", !Object.keys(themeVars({} as ThemeSettingsValues)).some((k) => k.startsWith("--t-")))
  const bad = customTokenVars({
    custom_tokens: {
      ok: "clamp(2rem, 6vw, 5rem)",
      img: "url(https://evil.example/x.png)",
      semi: "red; background: url(x)",
      brace: "red}body{color:red",
      expr: "expression(alert(1))",
      esc: "\\75 rl(x)",
      tag: "</style><script>",
      quote: '"x"',
      imp: "red !important",
      "Bad Name": "red",
      "--t-prefixed": "4px",
      long: "x".repeat(201),
      n: 12,
    },
  })
  check("unsafe values and names are refused, safe ones kept", JSON.stringify(Object.keys(bad).sort()) === JSON.stringify(["--t-n", "--t-ok", "--t-prefixed"]), bad)
  check("never more than 64", Object.keys(customTokenVars({ custom_tokens: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`t${i}`, "1px"])) })).length === 64)
  check("the page root wears them on every surface (ThemePage and the canvas use themeVars)", /\.\.\.customTokenVars\(t\)/.test(read("lib/website-builder/theme-css.ts")) && /themeVars\(theme\)/.test(read("components/website-builder/theme/ThemePage.tsx")))

  console.log("\n5. the render check")
  const parse = await esbuildScriptParser()
  check("esbuild's parser is here (parse only)", !!parse)
  const good = await renderCheck({
    page: "home",
    sections: [coded, { id: "hero", type: "ai_hero", settings: {} } as unknown as SectionInstance, { id: "grid", type: "ai_grid", settings: { products: [P1, P2] } } as unknown as SectionInstance, formSection],
    sources: { ...SOURCES, "sections/ai_hero.storelib": `<template>\n<section><h1>{{ settings.h }}</h1><img src="/x.jpg" alt="A loaf" width="10" height="10"></section>\n</template>\n<schema>\n{ "type": "ai_hero", "name": "Hero", "settings": [{ "type": "text", "id": "h", "label": "H", "default": "Bread" }] }\n</schema>\n` },
    theme: THEME,
    template: "index",
    products: PRODUCTS,
    data: storefrontData({ dynamic: { shop: {}, creator: {} } as never, catalog: PRODUCTS, forms, menus: { "main-menu": { title: "Main", links: [{ title: "About", url: "/about", links: [] }] } } as never }),
    capabilities: caps,
    parseScript: parse ?? undefined,
  })
  check("a sound page passes with no errors", good.ok && good.issues.filter((i) => i.severity === "error").length === 0, good.issues)
  check("and reports what it drew", good.htmlBytes > 500 && good.sections.length === 4)

  const BROKEN = `<template>
<section class="b" style="width: 1200px">
  <h3>{{ settings.h }}</h3>
  <img src="/a.jpg">
  <a href="/nowhere">Nowhere</a>
  <a href="#">Dead</a>
  <a href="#missing">Jump</a>
  <a href="/products/not-a-product">Ghost</a>
  <a href="/checkout?productId=zzz">Buy ghost</a>
  <button data-storelib-add-to-cart="a9999999-0000-4000-8000-000000000009">Add</button>
  <button data-storelib-add-to-cart="">Add nothing</button>
  <div data-storelib-native-form="${FORM_THEIRS}"></div>
  <p class="big">x</p>
</section>
</template>
<style scoped>
.b { width: 100vw; color: var(--t-nope); }
.big { font-size: 140px; }
.row { grid-template-columns: repeat(4, 1fr); }
</style>
<script>
const x = ;
</script>
<schema>
{ "type": "ai_broken", "name": "Broken", "settings": [{ "type": "text", "id": "h", "label": "H", "default": "Hello" }] }
</schema>
`
  const EMPTY = `<template>\n<section class="e">{% if settings.h %}<h2>{{ settings.h }}</h2>{% endif %}</section>\n</template>\n<schema>\n{ "type": "ai_empty", "name": "Empty", "settings": [{ "type": "text", "id": "h", "label": "H" }] }\n</schema>\n`
  const NOPE = `<template>\n<section>{{ settings.h </section>\n</template>\n<schema>\n{ "type": "ai_nope", "name": "Nope", "settings": [] }\n</schema>\n`
  const bad1 = await renderCheck({
    page: "about",
    sections: [{ id: "b1", type: "ai_broken", settings: {} } as unknown as SectionInstance, { id: "e1", type: "ai_empty", settings: {} } as unknown as SectionInstance, { id: "n1", type: "ai_nope", settings: {} } as unknown as SectionInstance],
    sources: { "sections/ai_broken.storelib": BROKEN, "sections/ai_empty.storelib": EMPTY, "sections/ai_nope.storelib": NOPE },
    theme: THEME,
    template: "page.about",
    products: PRODUCTS,
    data: storefrontData({ dynamic: { shop: {}, creator: {} } as never, catalog: PRODUCTS, forms }),
    capabilities: caps,
    parseScript: parse ?? undefined,
  })
  const codes = new Set(bad1.issues.map((i) => i.code))
  const want = ["render.compile", "render.empty", "render.broken_link", "render.placeholder", "render.anchor", "render.overflow", "a11y.img_alt", "a11y.headings", "binding.unbound", "script.syntax", "token.undefined"]
  check("a broken page fails", bad1.ok === false)
  check("every kind of finding is reported", want.every((c) => codes.has(c)), { missing: want.filter((c) => !codes.has(c)), got: [...codes] })
  check("findings name the file and the section", bad1.issues.filter((i) => i.sectionId === "b1").every((i) => i.path === "sections/ai_broken.storelib"))
  check("an unknown product and an empty add to cart are errors", bad1.issues.filter((i) => i.code === "binding.unbound" && i.severity === "error").length >= 3, bad1.issues.filter((i) => i.code === "binding.unbound"))
  check("another creator's form in a mark is an error", bad1.issues.some((i) => i.code === "binding.unbound" && i.message.includes(FORM_THEIRS)))
  check("the script error names its line", bad1.issues.some((i) => i.code === "script.syntax" && /line 1 of the script\): Unexpected/.test(i.message)), bad1.issues.filter((i) => i.code === "script.syntax"))
  check("an empty page is an error", (await renderCheck({ page: "x", sections: [], sources: {}, theme: THEME, template: "index" })).issues.some((i) => i.code === "render.empty_page"))
  check("links: built in routes, pages, products and checkout of a real product pass", [`/`, `/about`, `/products/linen-apron`, `/collections/aprons`, `/cart`, `/checkout?productId=${P1}`, `https://example.com`, `mailto:a@b.co`, `/fr/about`].every((h) => linkProblem(h, { pages: new Set(["home", "about"]), products: new Set([P1]), productSlugs: new Set(["linen-apron"]), collectionHandles: new Set(["aprons"]), communitySlugs: new Set(), forms: new Set(), extra: new Set() }) === null))
  check("the render check never runs a script (no eval, no Function, no vm)", !/\beval\(|new Function\(|node:vm|from "vm"/.test(read("lib/ai-builder/render-check.ts")) && !/\beval\(|new Function\(|node:vm/.test(read("lib/ai-builder/render-check-server.ts")))
  check("the server half checks the install is the creator's", /\.eq\("id", installId\)\s*\.eq\("creator_id", creatorId\)/.test(read("lib/ai-builder/render-check-server.ts")))

  console.log("\n6. the sandbox and the preview error bridge")
  check("a script cannot point an island at another form or product", !attrAllowed("data-storelib-native-form") && !attrAllowed("data-storelib-offers") && !attrAllowed("data-storelib-island") && attrAllowed("data-variant-id") && attrAllowed("data-state"))
  const sandbox = read("components/website-builder/sections/section-sandbox.tsx")
  check("the sandbox keeps its opaque origin", /sandbox="allow-scripts"/.test(sandbox) && !/allow-same-origin"/.test(sandbox.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("a script error reaches the editor only from the canvas, only for a registered section", /if \(inEditorRef\.current && live\.current\.has\(String\(msg\.id\)\)\) \{\s*window\.dispatchEvent\(new CustomEvent\(PREVIEW_ERROR_EVENT/.test(sandbox))
  check("messages are cleaned: no emails, no addresses with a query, no control characters, short", cleanErrorMessage("Fail for a@b.co at https://x.io/p?token=abc\u0000\n " + "y".repeat(400)).startsWith("Fail for [email] at [address] ") && cleanErrorMessage("y".repeat(400)).length === PREVIEW_ERROR_LIMITS.message)
  const INSTALL = "e0000000-0000-4000-8000-000000000001"
  const e1 = acceptPreviewError({ sectionId: "grid", type: "ai_grid", page: "home", message: "TypeError: x is undefined" }, { installId: INSTALL, now: new Date("2026-11-09T12:00:00Z") })
  check("a preview error is accepted with its section and file", !!e1 && e1.type === "ai_grid" && e1.at === "2026-11-09T12:00:00.000Z" && previewErrorPayload(e1).path === "sections/ai_grid.storelib" && previewErrorPayload(e1).source === "preview")
  check("bad ids, types and pages are refused", [{ sectionId: "<x>", type: "ai_grid", page: "home", message: "m" }, { sectionId: "g", type: "AI GRID", page: "home", message: "m" }, { sectionId: "g", type: "ai_grid", page: "../x y", message: "m" }, { sectionId: "g", type: "ai_grid", page: "home", message: "" }].every((r) => acceptPreviewError(r, { installId: INSTALL }) === null) && acceptPreviewError({ sectionId: "g", type: "ai_grid", page: "home", message: "m" }, { installId: "nope" }) === null)
  const q = new PreviewErrorQueue()
  for (let i = 0; i < 100; i++) q.add({ ...e1!, message: `m${i % 50}` })
  const firstPost = q.take()
  check("the queue says each error once and posts a few at a time", firstPost.length === PREVIEW_ERROR_LIMITS.perPost && !q.add({ ...e1!, message: "m0" }))
  let total = firstPost.length
  while (q.size) total += q.take().length
  check("and stops at its cap for the session", total === PREVIEW_ERROR_LIMITS.perSession)
  check("the agent can pick preview errors out of its events", isPreviewErrorEvent({ kind: "error", payload: { source: "preview" } }) && !isPreviewErrorEvent({ kind: "error", payload: { message: "x" } }))
  const route = read("app/api/website-builder/ai-jobs/[jobId]/preview-errors/route.ts")
  check("the route: signed in, the store's own job, rate limited, cleaned again, kept by the locked function", /websiteCaller\(\)/.test(route) && /\.eq\("creator_id", site\.creatorId\)/.test(route) && /rateLimit\(/.test(route) && /acceptPreviewError\(e, \{ installId: row\.install_id \}\)/.test(route) && /rpc\("ai_site_job_add_event"/.test(route))
  const sql = read("supabase/sql/run-now/405_ai_job_preview_errors.sql")
  const lines = sql.split("\n").filter(Boolean)
  check("SQL 405: one statement a line, a comment first, byte copy in migrations", lines[0].startsWith("/*") && lines.slice(1).every((l) => l.trim().endsWith(";")) && sql === read("supabase/migrations/20271405_ai_job_preview_errors.sql"))
  check("SQL 405: server only, numbered under the job's lock, capped for preview errors", /FOR UPDATE/.test(sql) && /REVOKE ALL ON FUNCTION public\.ai_site_job_add_event\(uuid, uuid, text, jsonb\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.ai_site_job_add_event\(uuid, uuid, text, jsonb\) TO service_role;/.test(sql) && /v_count >= 60/.test(sql) && /SET search_path = ''/.test(sql))
  check("SQL 405: README row, check column, health view", new RegExp(`\\| \`405_ai_job_preview_errors\\.sql\` \\|[^\\n]*\\| ${lines.length} \\| ${Buffer.byteLength(sql).toLocaleString("en-US")} \\|`).test(read("supabase/sql/run-now/README.md")) && /as p405_ai_job_preview_errors/.test(read("supabase/sql/run-now/99_check_after.sql")) && /part: "405", file: "405_ai_job_preview_errors\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

function renderAll(list: SectionInstance[]): string {
  return list
    .map((s) => {
      const out = renderStorelibSection(s, THEME, { template: "page.about" }, SOURCES, PRODUCTS, storefrontData({ dynamic: { shop: {}, creator: {} } as never, catalog: PRODUCTS }))
      return out.ok ? out.html : ""
    })
    .join("\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
