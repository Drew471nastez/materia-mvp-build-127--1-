/**
 * ===========================================================================
 *  FOUR PUBLISHED WEBSITES FOR THE SPEED PROBES (rounds 52, 53)
 * ===========================================================================
 * The Supabase stub's tables for scripts/check-site-speed-r52.mjs and
 * scripts/check-site-speed-r53.mjs: nova's Storelib theme on its subdomain,
 * lena's on www.lenashop.test, and mara and iris on the owner's Materia,
 * imported through the real converter (tests/fixtures/materia-live), on a
 * subdomain and on www.irisshop.test. Moved here from the round 52 probe.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import { fixtureTables, products } from "./load/local-fixture.mjs"

export async function siteSpeedFixture({ personal = false } = {}) {
  const at = "2026-10-01T10:00:00.000Z"
  const root = process.cwd()

  /* ── The fixture: lena and nova as in check-public-delivery-r51.mjs, and mara's imported theme ── */
  const T = fixtureTables()
  const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
  function storelibSite({ name, user, creator, install, slugs }) {
    const settings = { id: `s-${name}`, install_id: install, settings: {}, draft_settings: null, created_at: at, updated_at: at }
    const pages = ["home", "about"].map((key, i) => ({ id: `p-${name}-${i}`, install_id: install, page_key: key, sections, draft_sections: null, created_at: at, updated_at: at }))
    T.profiles.push({ id: user, username: name, display_name: name, email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
    T.creators.push({ id: creator, user_id: user, slug: name, username: name, name, display_name: name, onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
    T.products.push(...slugs.map((slug, n) => ({ ...products[0], id: `33333333-3333-4333-8333-00000000${creator.slice(-2)}${n}${n}`, creator_id: creator, seller_id: creator, title: `${name} pack ${n + 1}`, slug, creators: { user_id: user } })))
    T.store_theme_installs.push({ id: install, creator_id: creator, theme_id: "default", name: `${name}'s site`, status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, published_at: at, store_theme_settings: settings, settings, pages })
    T.store_theme_settings.push(settings)
    T.store_theme_pages.push(...pages)
  }
  T.store_theme_settings = []
  T.store_theme_pages = []
  T.store_theme_custom_files = []
  storelibSite({ name: "lena", user: "11111111-1111-4111-8111-1111111111cc", creator: "22222222-2222-4222-8222-2222222222cc", install: "44444444-4444-4444-8444-4444444444cc", slugs: ["lena-pack-1", "lena-pack-2", "lena-pack-3"] })
  storelibSite({ name: "nova", user: "11111111-1111-4111-8111-1111111111dd", creator: "22222222-2222-4222-8222-2222222222dd", install: "44444444-4444-4444-8444-4444444444dd", slugs: ["nova-pack-1", "nova-pack-2"] })

  /* mara: the owner's Materia, imported (its home page only: tests/fixtures/materia-live). The stub answers every select with whole rows, so the compat kind the proxy and the routes read by alias is on the row. */
  async function materia() {
    const out = join(root, "node_modules/.cache/r52/materia-entry.mjs")
    mkdirSync(join(root, "node_modules/.cache/r52"), { recursive: true })
    const entry = join(root, "node_modules/.cache/r52/materia-src.mjs")
    writeFileSync(entry, `import { materiaLiveTheme } from ${JSON.stringify(join(root, "scripts/materia-live-fixture.mjs"))}\nexport const theme = await materiaLiveTheme()\n`)
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", packages: "external", tsconfig: join(root, "tsconfig.json"), outfile: out, logLevel: "warning" })
    return (await import(out)).theme
  }
  const materiaTheme = await materia()
  /*
    pia (round 53, `personal`): the same Materia with its header reading the
    cart and the customer, as a real theme's does (the live fixture's
    sections are its served markup, which read neither), and its layout
    reading the cart outside any section. What the shared page fills in.
  */
  async function personalMateria() {
    const out = join(root, "node_modules/.cache/r52/materia-personal-entry.mjs")
    const entry = join(root, "node_modules/.cache/r52/materia-personal-src.mjs")
    writeFileSync(entry, `import { materiaLiveTheme } from ${JSON.stringify(join(root, "scripts/materia-live-fixture.mjs"))}
export const theme = await materiaLiveTheme({ edit: async (zip) => {
  const group = JSON.parse(await zip.file("sections/header-group.json").async("string"))
  const first = group.sections[group.order[0]].type
  const file = "sections/" + first + ".liquid"
  const src = await zip.file(file).async("string")
  zip.file(file, '<div id="probe-personal"><span id="probe-cart-count" data-count="{{ cart.item_count }}">{{ cart.item_count }}</span>{% if customer %}<a id="probe-account" href="/account">Hi {{ customer.first_name }}</a>{% else %}<a id="probe-account" href="/account/login">Log in</a>{% endif %}</div>' + src)
  const layout = await zip.file("layout/theme.liquid").async("string")
  zip.file("layout/theme.liquid", layout.replace('<i hidden data-probe-text="{{ settings.probe_text }}"></i>', '<i hidden data-probe-text="{{ settings.probe_text }}"></i><div id="probe-layout-cart" hidden>{{ cart.item_count }}</div>'))
} })
`)
    await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", packages: "external", tsconfig: join(root, "tsconfig.json"), outfile: out, logLevel: "warning" })
    return (await import(out)).theme
  }
  const personalTheme = personal ? await personalMateria() : null
  /* mara on her subdomain, iris on her own domain: one theme, two sites, as nova and lena. */
  function compatSite({ name, user, creator, install, n, theme = materiaTheme }) {
    const t = theme
    const settings = { id: `s-${name}`, install_id: install, settings: t.settings, draft_settings: null, created_at: at, updated_at: at, kind: "shopify", live: "shopify", draft: null }
    const pages = Object.entries(t.pages).map(([key, s], i) => ({ id: `p-${name}-${i}`, install_id: install, page_key: key, sections: s, draft_sections: null, created_at: at, updated_at: at }))
    T.profiles.push({ id: user, username: name, display_name: name, email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
    T.creators.push({ id: creator, user_id: user, slug: name, username: name, name, display_name: name, onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
    /* The products the theme's own markup links to, so a tap on one opens a real product page. */
    T.products.push(...["pants-down", "black-sleeves", "salajanywood-club-inncer"].map((slug, k) => ({ ...products[0], id: `33333333-3333-4333-8333-0000000000${n}${k + 1}`, creator_id: creator, seller_id: creator, title: `${name} ${slug}`, slug, creators: { user_id: user } })))
    T.store_theme_installs.push({ id: install, creator_id: creator, theme_id: "custom", name: "Materia", status: "published", is_custom: true, sort_order: 0, created_at: at, updated_at: at, published_at: at, store_theme_settings: settings, settings, pages })
    T.store_theme_settings.push(settings)
    T.store_theme_pages.push(...pages)
    T.store_theme_custom_files.push(...Object.entries(t.all).map(([path, content]) => ({ install_id: install, path, content, draft_content: null })))
  }
  compatSite({ name: "mara", user: "11111111-1111-4111-8111-1111111111ee", creator: "22222222-2222-4222-8222-2222222222ee", install: "44444444-4444-4444-8444-4444444444ee", n: "e" })
  compatSite({ name: "iris", user: "11111111-1111-4111-8111-1111111111ff", creator: "22222222-2222-4222-8222-2222222222ff", install: "44444444-4444-4444-8444-4444444444ff", n: "f" })
  if (personalTheme) {
    compatSite({ name: "pia", user: "11111111-1111-4111-8111-1111111111aa", creator: "22222222-2222-4222-8222-2222222222aa", install: "44444444-4444-4444-8444-4444444444aa", n: "a", theme: personalTheme })
    T.site_customers = [{ id: "66666666-6666-4666-8666-6666666666aa", creator_id: "22222222-2222-4222-8222-2222222222aa", email: "ana@mail.test", name: "Ana Pop", phone: null, addresses: [], created_at: at }]
  }
  T.custom_domains = [
    { id: "d1", domain: "lenashop.test", creator_id: "22222222-2222-4222-8222-2222222222cc", status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: "11111111-1111-4111-8111-1111111111cc" } },
    { id: "d2", domain: "irisshop.test", creator_id: "22222222-2222-4222-8222-2222222222ff", status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: "11111111-1111-4111-8111-1111111111ff" } },
  ]
  for (const t of ["store_menus", "site_releases", "store_localization", "site_access", "site_deployments", "wishlist_items", "subscribers", "team_members", "membership_plans", "product_sales_status", "community_members", "community_plans", "offers", "product_bundles", "upsells", "store_settings", "commerce_settings"]) T[t] = T[t] ?? []
  /* nova's offers: a bundle and a checkout upsell that are on, one switched off and one that has ended (DATA=1 reads them through the website's own host). */
  const NOVA = "22222222-2222-4222-8222-2222222222dd"
  const novaId = (n) => `33333333-3333-4333-8333-00000000dd${n}${n}`
  const offer = (id, kind, title, product_ids, trigger_product_ids, extra = {}) => ({ id, creator_id: NOVA, kind, title, product_ids, trigger_product_ids, discount_type: "percent", discount_value: 10, active: true, position: 0, trigger_collection_ids: [], placements: null, starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, tiers: null, created_at: at, ...extra })
  T.store_offers = [
    offer("55555555-5555-4555-8555-0000000000a1", "bundle", "Both packs", [novaId(0), novaId(1)], []),
    offer("55555555-5555-4555-8555-0000000000a2", "checkout", "Add pack 2", [novaId(1)], [novaId(0)], { discount_value: 20 }),
    offer("55555555-5555-4555-8555-0000000000a3", "bundle", "Switched off", [novaId(0), novaId(1)], [], { active: false }),
    offer("55555555-5555-4555-8555-0000000000a4", "bundle", "Ended", [novaId(0), novaId(1)], [], { ends_at: "2026-01-01T00:00:00.000Z" }),
  ]
  T.profiles_public = T.profiles.map(({ email: _e, ...row }) => row)
  T.creators_public = T.creators.map(({ stripe_account_id: _s, ...row }) => row)
  return { T, NOVA, novaId, materiaTheme }
}
