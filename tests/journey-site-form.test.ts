/**
 * ===========================================================================
 *  A STORELIB BOOKING FORM ON A MATERIA WEBSITE, END TO END
 * ===========================================================================
 * The creator picks one of their forms in the Storelib form section (or the
 * Storelib form app block); the website draws it from its own host
 * (lib/storelib-theme/compat/storelib-form.ts, /checkout/forms/<id>); the
 * visitor books a time, pays through Storelib's checkout and the booking is
 * confirmed. Through the real engine, the real proxy route rule and the real
 * routes over the journey harness (tests/_journey):
 *
 *   the theme      Materia's base section imports with the template, its
 *                  setting is the forms picker, and it draws the frame from
 *                  the site's host, a still card in the builder, nothing
 *                  with no form; the app block the same in a section that
 *                  takes app blocks, and Add block lists it
 *   the address    /checkout/forms/<id> on the website's host is the form's
 *                  page, framed by that origin only
 *   the page       this website's creator's form only: another's is not found
 *   the booking    slots, a submit from the website (its page kept as where
 *                  the lead came from), a pending unpaid hold, Pay to confirm
 *                  through Storelib's checkout with the booking token, the
 *                  webhook, the booking confirmed
 */
import "./_journey/env"
import JSZip from "jszip"
import { Journey } from "./_journey/harness"
import { composeTemplateZip, templateMenus } from "../lib/themes/template-packages"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { FORM_APP_BLOCK, siteFormEmbedHtml, siteFormPath } from "../lib/storelib-theme/compat/storelib-form"
import { siteCheckoutRouteFor } from "../lib/checkout/site-checkout"
import { formTemplate } from "../lib/forms/templates"
import { validateDefinition } from "../lib/forms/definition"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
const FORM = "5f0c0000-0000-4000-8000-0000000000f1"

async function main() {
  section("1. The theme: Materia's Storelib form section, and the app block")
  const zip = await JSZip.loadAsync(await composeTemplateZip("materia/default"))
  const r = await convertShopifyTheme(zip, { fallbackName: "materia/default" })
  check("Materia imports with the converter Add uses", r.ok === true, r.ok === false ? r : null)
  if (r.ok) {
    const key = Object.keys(r.theme.files).find((f) => /sections\/journey-storelib-form\./.test(f)) ?? ""
    check("  the Storelib form section comes with every template", !!key, Object.keys(r.theme.files).filter((f) => /journey/.test(f)))
    const schema = /<schema>\s*([\s\S]*?)\s*<\/schema>/.exec(r.theme.files[key] ?? "")?.[1] ?? /\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/.exec(r.theme.files[key] ?? "")?.[1] ?? "{}"
    const parsed = JSON.parse(schema) as { settings?: { id: string; type: string }[]; presets?: unknown[] }
    check("  its form setting is the forms picker, and it is in Add section", parsed.settings?.find((s) => s.id === "form")?.type === "form_picker" && (parsed.presets?.length ?? 0) > 0, parsed.settings?.slice(0, 3))
    const theme = themeOfInstall(r.theme.files, r.theme.settings, { assetUrl: (n) => `/asset/${n}`, assetText: (n) => r.theme.files[`shopify/assets/${n}`] ?? null, imageUrl: (v) => v })
    const site = (sections: unknown[], designMode = false): SiteData => ({
      creatorId: "c",
      theme,
      pages: { home: sections } as never,
      products: [],
      collections: [],
      menus: compatMenus(templateMenus("materia/default") as never, ["home"]),
      shop: { name: "Cora Coaching", currency: "USD", moneyFormat: "${{amount}}" },
      host: "cora.storelib.com",
      designMode,
    })
    const home = async (s: SiteData) => String((await answer(s, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body)
    const live = await home(site([{ id: "book", type: "journey-storelib-form", settings: { form: FORM, heading: "Book a call", text: "<p>Thirty minutes, on video.</p>" } }]))
    check("on the website: the heading, the text and the form framed from the site's own host", /Book a call/.test(live) && /Thirty minutes, on video\./.test(live) && live.includes(`<iframe src="${siteFormPath(FORM)}" title="Book a call"`), words(live).slice(0, 300))
    check("  with the script that dresses it in the section's colours and fonts and follows its height", /--sheet-ink/.test(live) && /ResizeObserver/.test(live) && /data-storelib-site-form=""/.test(live))
    const editor = await home(site([{ id: "book", type: "journey-storelib-form", settings: { form: FORM, heading: "Book a call" } }], true))
    check("in the builder's canvas: a still card naming it, no frame", !/<iframe src="\/checkout\/forms/.test(editor) && /The form takes answers and bookings on your live site/.test(editor))
    const none = await home(site([{ id: "book", type: "journey-storelib-form", settings: { form: "", heading: "Book a call" } }]))
    const noneEditor = await home(site([{ id: "book", type: "journey-storelib-form", settings: { form: "" } }], true))
    check("no form chosen: nothing framed on the website, the way to choose one in the builder", !/data-storelib-site-form/.test(none) && /Choose one of your forms or booking pages/.test(noneEditor))
    /* Materia's product information tabs take app blocks: Add block lists the Storelib form there, its first field the forms picker. */
    const { themeBlockCatalog, addableBlocks, schemaFor } = await import("../lib/website-builder/storelib-schemas")
    const addable = addableBlocks(schemaFor("product-information-tab", r.theme.files, {}), themeBlockCatalog(r.theme.files, { builtIn: false }))
    const block = addable.find((b) => b.type === FORM_APP_BLOCK)
    check("Add block in a Materia section that takes app blocks lists Storelib form, with the forms picker", block?.name === "Storelib form" && block.fields[0]?.type === "form_picker", addable.map((b) => b.name))
    const forged = await home(site([{ id: "book", type: "journey-storelib-form", settings: { form: "../../api/x", heading: "x" } }]))
    check("  a value that is not a form id draws nothing", !/<iframe/.test(forged.slice(forged.indexOf("data-journey-storelib-form"))))
  }
  {
    const files = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>`),
      "sections/apps.storelib": `${wrapCompatTemplate(`<div class="apps">{% for block in section.blocks %}{% render block %}{% endfor %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "apps", name: "Apps", settings: [], blocks: [{ type: "@app" }] })}\n</schema>\n`,
    }
    const t = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const s: SiteData = { creatorId: "c", theme: t, pages: { home: [{ id: "apps", type: "apps", settings: {}, blocks: [{ id: "f1", type: FORM_APP_BLOCK, settings: { form: FORM, title: "Coaching call" } }] }] as never }, products: [], collections: [], menus: {}, shop: { name: "Cora", currency: "USD", moneyFormat: "${{amount}}" }, host: "cora.storelib.com" }
    const html = String((await answer(s, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body)
    check("the Storelib form app block in a section that takes app blocks: the same framed form", html.includes(`<iframe src="${siteFormPath(FORM)}" title="Coaching call"`) && /class="shopify-app-block"/.test(html), html.slice(html.indexOf('class="apps"'), html.indexOf('class="apps"') + 300))
  }
  check("the embed escapes its title", siteFormEmbedHtml({ formId: FORM, title: `"><script>x</script>`, inEditor: false }).includes('title="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"'))

  section("2. The address on the website's host")
  {
    const route = siteCheckoutRouteFor(`/checkout/forms/${FORM}`, "", "GET", "cora.storelib.com")
    check("/checkout/forms/<id> is the form's page, framed by this origin only", route?.kind === "rewrite" && route.path === `/checkout/site/forms/${FORM}` && route.framed === true, route)
    check("  not a post, not an id that is not one", siteCheckoutRouteFor(`/checkout/forms/${FORM}`, "", "POST", "x") === null && siteCheckoutRouteFor("/checkout/forms/../x", "", "GET", "x") === null)
  }

  section("3. A creator's booking form, paid, on their website")
  const j = await Journey.start()
  const seller = await j.signUp("cora@example.com", { name: "Cora Coach" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "cora" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Cora Coaching", supportEmail: "hello@cora.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const host = "cora.storelib.com"
  j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Materia" }, {})
  const [call] = j.db.insert("products", { creator_id: creator.id, type: "digital", title: "Coaching call", slug: "coaching-call", description: "<p>30 minutes</p>", status: "published", archived: false, price_cents: 6000, thumbnail_url: null, pay_what_you_want: false }, {})
  const def = formTemplate("appointment")
  def.title = "Book a coaching call"
  def.booking = { ...def.booking!, approval: false, notice_hours: 0, days_ahead: 30, timezone: "UTC", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "17:00" })), payment_product_id: call.id as string }
  const published = validateDefinition(def)
  j.db.insert("native_forms", { id: FORM, owner_id: seller.id, title: def.title, status: "published", published, draft: published, revision: 1 }, {})
  const stranger = await j.signUp("other@example.com", { name: "Other" })
  const OTHER = "5f0c0000-0000-4000-8000-0000000000f2"
  j.db.insert("native_forms", { id: OTHER, owner_id: stranger.id, title: "Someone else's form", status: "published", published, draft: published, revision: 1 }, {})

  const mine = await renderFormPage(FORM, host)
  check("the website's /checkout/forms/<id> draws the form with Storelib's own renderer", /data-site-form-root=""/.test(mine) && /Book a coaching call/.test(mine), mine.slice(0, 500))
  const theirs = await renderFormPage(OTHER, host)
  check("  another creator's form is not found on this website", !/data-site-form-root/.test(theirs), theirs.slice(0, 200))
  const elsewhere = await renderFormPage(FORM, "unknown-host.example")
  check("  nor on a host that is no published website", !/data-site-form-root/.test(elsewhere), elsewhere.slice(0, 200))

  const headers = { "x-forwarded-for": "192.0.2.91", origin: `https://${host}` }
  const pub = await j.call(`GET /api/forms/${FORM}/public`, { host, headers })
  check("the frame reads the published form from the site's host", pub.status === 200 && pub.json?.form?.definition?.title === "Book a coaching call", { status: pub.status, body: JSON.stringify(pub.json).slice(0, 300) })
  const from = new Date(Date.now() + 24 * 3600_000).toISOString()
  const slots = await j.call(`GET /api/forms/${FORM}/slots?from=${encodeURIComponent(from)}&days=3`, { host, headers })
  const slot = slots.json?.slots?.[0]?.start as string | undefined
  check("  and its free times", slots.status === 200 && !!slot, { status: slots.status, body: JSON.stringify(slots.json).slice(0, 300) })
  const page = `https://${host}/pages/coaching`
  const answers = { name: "Vera Visitor", email: "vera@example.com" } as Record<string, unknown>
  for (const f of published.fields) if (f.required && answers[f.id] === undefined) answers[f.id] = f.type === "email" ? "vera@example.com" : "Yes"
  const sent = await j.call(`POST /api/forms/${FORM}/submit`, {
    host,
    headers,
    body: { revision: 1, submission_id: "6a1b0000-0000-4000-8000-0000000000a1", answers, consent: true, marketing: false, website: "", started_at: Date.now() - 20_000, source: "website", source_url: page, source_block: "Book a call", slot, timezone: "UTC", duration: published.booking!.duration },
  })
  check("a booking sent from the website is kept (201)", sent.status === 201 && sent.json?.ok === true && !!sent.json?.booking, { status: sent.status, body: sent.json })
  const lead = j.rows("form_submissions").find((s) => s.form_id === FORM)
  check("  the lead says it came from the website's page, not the frame", lead?.source_kind === "website" && lead?.source_url === page && lead?.source_block === "Book a call", lead)
  const booking = j.rows("form_bookings").find((b) => b.form_id === FORM)
  check("  the time is held, pending its payment", booking?.status === "pending" && booking?.payment_status === "unpaid" && booking?.starts_at === slot, booking)
  const pay = String(sent.json?.payment_href ?? "")
  const payUrl = new URL(pay || "https://x.invalid/")
  check("  Pay to confirm goes to Storelib's checkout for the call, with the signed booking", payUrl.pathname === "/checkout" && payUrl.searchParams.get("productId") === call.id && !!payUrl.searchParams.get("booking"), pay)
  const { withWebsiteReturn } = await import("../app/(storelib)/checkout/site/forms/[id]/site-form-frame")
  const g = globalThis as { window?: unknown }
  const hadWindow = g.window
  g.window = { location: { href: `https://${host}${siteFormPath(FORM)}` } }
  const back = new URL(withWebsiteReturn(pay, page, host))
  g.window = hadWindow
  check("  the frame sends it from the website and back to the page the form is on", back.searchParams.get("src") === "website" && back.searchParams.get("site") === host && back.searchParams.get("return") === page && back.searchParams.get("cancel") === page && back.searchParams.get("booking") === payUrl.searchParams.get("booking"), back.toString())

  const session = await j.call("POST /api/checkout/stripe-session", { body: { productId: call.id, booking: payUrl.searchParams.get("booking"), email: "vera@example.com", firstName: "Vera", lastName: "Visitor", agreedToTerms: true, paymentMethods: ["card"], origin: { src: "website", host } } })
  const piId = (session.json?.paymentIntentId ?? session.json?.payment_intent_id ?? [...j.world.intents.keys()].pop()) as string | undefined
  const pi = piId ? j.world.intents.get(piId) : null
  check("Storelib's checkout charges the call's 60.00 for this booking", session.status === 200 && pi?.amount === 6000, { status: session.status, body: session.json, amount: pi?.amount })
  if (piId && pi) {
    const paid = j.world.payIntent(piId)
    await j.webhook("payment_intent.succeeded", paid.intent)
    await j.cron()
    const after = j.rows("form_bookings").find((b) => b.form_id === FORM)
    check("paid: the booking is confirmed", after?.status === "confirmed" && after?.payment_status === "paid", after)
  }

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

/** The form's page as the website's host serves it (app/(storelib)/checkout/site/forms/[id]/page.tsx). */
async function renderFormPage(id: string, host: string): Promise<string> {
  const g = globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }
  const before = g.__PUSH_TEST_NEXT_HEADERS__
  try {
    g.__PUSH_TEST_NEXT_HEADERS__ = { headers: () => new Headers({ host }), cookies: () => ({ getAll: () => [], get: () => undefined, set() {} }) }
    const { default: Page } = await import("../app/(storelib)/checkout/site/forms/[id]/page")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const tree = await Page({ params: Promise.resolve({ id }) })
    return tree ? renderToStaticMarkup(tree) : "(not found)"
  } catch (e) {
    return `render failed: ${e instanceof Error ? e.stack : String(e)}`
  } finally {
    g.__PUSH_TEST_NEXT_HEADERS__ = before
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
