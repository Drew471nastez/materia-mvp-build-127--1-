/**
 * ===========================================================================
 *  THE ONEPAGE PRODUCTION AUDIT (ONEPAGE_PRODUCTION_AUDIT.md)
 * ===========================================================================
 * Each section is one finding from the audit, pinned where it can be run:
 * pure functions are called, routes are driven through the journey harness
 * (tests/_journey), and what only a component shows is read from its source.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES: it drives the
 * real routes through tests/_journey, which only type-checks strict).
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Journey } from "./_journey/harness"
import { stripComments } from "./_source"
import { onePageRoute, ONEPAGE_HOST_API } from "@/lib/onepage/host-route"
import { isUnsafeUrl, openableUrl, withSafeLinkValues, withSafeUrls } from "@/lib/onepage/safe-urls"
import { onePageEditVersion } from "@/lib/onepage/edit-version"
import { saveRequestBody } from "@/lib/onepage/editor-state"
import { withDraft, type LocalDraft } from "@/lib/onepage/local-draft"
import { editLinearGradient, readLinearGradient } from "@/lib/onepage/theme-layout"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { nextScheduleChange } from "@/lib/onepage/schedule-clock"
import { telegramTarget } from "@/lib/forms/actions"
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { withoutLocked } from "@/lib/onepage/paid-access"
import { openLocked, openLockedData, sealLocked } from "@/lib/onepage/locked-seal"
import { publishedShape } from "@/lib/onepage/published-page"
import { onePageShowsSomething } from "@/lib/onepage/page-presence"
import { wallpaperMediaLook } from "@/lib/onepage/wallpaper"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))

const onMe = (path: string, method = "GET") =>
  onePageRoute({ host: "storelib.me", pathname: path, search: "", method, userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www", "app", "api"] })

async function main() {
  section("HOST-1: the calls a visitor's blocks make answer on storelib.me")
  {
    const calls: [string, string][] = [
      ["/api/onepage/poll", "GET"],
      ["/api/onepage/poll", "POST"],
      ["/api/onepage/rsvp", "POST"],
      ["/api/onepage/access", "POST"],
      ["/api/onepage/tip", "POST"],
      ["/api/onepage/email-capture", "POST"],
      ["/api/onepage/lead-magnet", "POST"],
    ]
    for (const [path, method] of calls) check(`${method} ${path} is passed on, not a 404`, onMe(path, method)?.kind === "next", onMe(path, method))
    check("a method the route does not take is still a 404 (GET /api/onepage/tip)", onMe("/api/onepage/tip", "GET")?.kind === "not-found")
    check("the editor's own routes stay off the host (PUT /api/onepage, publish, stats, leads export)", ["/api/onepage", "/api/onepage/publish", "/api/onepage/stats", "/api/leads/export"].every((p) => onMe(p, "POST")?.kind === "not-found" && onMe(p, "PUT")?.kind === "not-found" && onMe(p, "GET")?.kind === "not-found"))
    /* Every relative /api call the live blocks make is on the list (the editor-only ones are named as such). */
    const EDITOR_ONLY = new Set(["/api/onepage/blocks-live", "/api/coupons", "/api/onepage/followers", "/api/store/integrations/marketing"])
    const files = ["components/onepage/data-blocks.tsx", "components/onepage/storelib-blocks.tsx", "components/onepage/tip-block.tsx", "components/onepage/public-onepage.tsx", "components/onepage/creator-blocks.tsx", "components/onepage/app-block.tsx", "components/onepage/subscribe-sheet.tsx", "components/onepage/email-signup.tsx"]
    const used = new Set<string>()
    for (const f of files) for (const m of code(f).matchAll(/fetch\(\s*[`"']((?:\/api\/)[^`"'?$]*)/g)) used.add(m[1].replace(/\/$/, ""))
    const missing = [...used].filter((p) => !EDITOR_ONLY.has(p) && !ONEPAGE_HOST_API.some((a) => a.path.test(p)))
    check("no live block calls a route storelib.me does not answer", missing.length === 0, missing)
  }

  section("XSS-1: no saved address runs script")
  {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "\u0001javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "data:image/svg+xml,<svg onload=alert(1)>"]) {
      check(`unsafe: ${JSON.stringify(bad)}`, isUnsafeUrl(bad))
    }
    for (const good of ["https://calendly.com/me/30min", "http://example.com", "mailto:me@example.com", "tel:+15551234567", "/checkout/x", "#top", "example.com", "data:image/png;base64,iVBORw0KGgo=", ""]) {
      check(`safe: ${JSON.stringify(good)}`, !isUnsafeUrl(good))
    }
    const blocks = [
      { id: "a", type: "link_button", data: { label: "javascript: the good parts", url: "javascript:alert(document.cookie)", thumbnail_url: "https://x.example/t.png" } },
      { id: "b", type: "calendly", data: { calendly_url: "JAVASCRIPT:fetch('/api/x')" } },
      { id: "g", type: "group", data: { children: [{ id: "c", type: "image_gallery", data: { images: [{ url: "https://x.example/i.png", link_url: "vbscript:x" }] } }] } },
      { id: "d", type: "app", data: { action: { type: "url", url: "data:text/html,<script>alert(1)</script>" } } },
      { id: "e", type: "link_button", data: { url: "https://example.com" } },
    ]
    const clean = withSafeUrls(blocks) as typeof blocks
    const flat = JSON.stringify(clean)
    check("every unsafe address is emptied, at any depth", !/javascript:alert|JAVASCRIPT:|vbscript:|data:text\/html/.test(flat), flat)
    check("text that is not an address is kept (a label)", (clean[0].data as { label: string }).label === "javascript: the good parts")
    check("a safe block comes back as the same object", clean[4] === blocks[4])
    check("the input is not changed", blocks[0].data.url === "javascript:alert(document.cookie)")
    const links = withSafeLinkValues({ instagram: "https://instagram.com/me", website: "javascript:alert(1)" })
    check("social links: an unsafe one is emptied, the rest kept", links.instagram === "https://instagram.com/me" && links.website === "")
    check("openableUrl: https and a path pass", openableUrl("https://calendly.com/me") === "https://calendly.com/me" && openableUrl("/p/x") === "/p/x")
    check("openableUrl: javascript:, a protocol-relative and nothing do not", openableUrl("javascript:alert(1)") === null && openableUrl("//evil.example") === null && openableUrl("") === null && openableUrl(undefined) === null)

    const live = code("components/onepage/public-onepage.tsx")
    check("the booking button no longer falls back to the raw text it was given", !live.includes("?? data.calendly_url"))
    check("every window.open on the live page takes a checked address", !/window\.open\((pdfUrl|data\.)/.test(live) && /openableUrl\(pdfUrl\)/.test(live))

    const j = await Journey.start()
    /* The live table has archived_blocks (every editor Save writes it) though no SQL part in the repository makes it: see ONEPAGE_PRODUCTION_AUDIT.md, DB-1. */
    j.db.extraColumns.add("onepages.archived_blocks")
    const seller = await j.signUp("ivy@example.com", { name: "Ivy" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "ivy" } })
    const creator = j.rows("creators")[0]
    const theme = { background_type: "solid", background_color: "#ffffff", text_color: "#111111", button_color: "#111111", button_text_color: "#ffffff", font_family: "Inter" }
    const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "published", slug: "ivy", theme, settings: {}, social_links: {}, draft_blocks: [] }, {})
    const evil = [{ id: "x1", type: "calendly", enabled: true, sort_order: 0, data: { calendly_url: "javascript:alert(document.cookie)", interaction: "direct" } }]
    const put = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: evil, archived_blocks: evil, social_links: { website: "javascript:alert(2)" } } })
    const row = j.rows("onepages").find((r) => r.id === page.id) as Record<string, any>
    check("PUT answers 200", put.status === 200, put)
    check("PUT keeps the block but empties its script address (draft and archive)", row.draft_blocks?.[0]?.id === "x1" && row.draft_blocks[0].data.calendly_url === "" && row.archived_blocks?.[0]?.data?.calendly_url === "", row.draft_blocks)
    check("PUT empties a script address in the social links", row.social_links?.website === "", row.social_links)
    const pub = await j.call("POST /api/onepage/publish", { as: seller, body: { id: page.id, draft_blocks: evil, theme, social_links: { website: "javascript:alert(3)" } } })
    const after = j.rows("onepages").find((r) => r.id === page.id) as Record<string, any>
    check("publish answers 200", pub.status === 200, pub)
    check("publish never puts a script address live", after.published_blocks?.[0]?.data?.calendly_url === "" && after.published_social_links?.website === "", { blocks: after.published_blocks, links: after.published_social_links })
    const shelf = [{ id: "s1", type: "storelib_shelf", enabled: true, sort_order: 0, data: { source: "latest", items: [{ id: "p", title: "Frozen", price_cents: 1 }] } }]
    await j.call("POST /api/onepage/publish", { as: seller, body: { id: page.id, draft_blocks: shelf, theme } })
    const shelfRow = j.rows("onepages").find((r) => r.id === page.id) as Record<string, any>
    check("publish does not freeze a shelf's items into the live copy (as PUT does not)", shelfRow.published_blocks?.[0]?.data && !("items" in shelfRow.published_blocks[0].data), shelfRow.published_blocks)
    const junk = await j.call("POST /api/onepage/publish", { as: seller, raw: "not json" })
    check("publish answers a body that is not JSON with 400, not 500", junk.status === 400, junk)
    check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  }

  section("ONB-1: the welcome wizard's save is not refused by its own write")
  {
    const wizard = code("components/onepage/onboarding-modal.tsx")
    const done = wizard.indexOf("onboarding_completed: true")
    const write = wizard.slice(wizard.lastIndexOf(".update({", done), done + 30)
    check("the wizard's direct write no longer carries the bio (part of the save's version check)", !/\bbio\s*:/.test(write), write.slice(0, 400))
    check("nor the name or the photo", !/\btitle\s*:/.test(write) && !/\bavatar_url\s*:/.test(write))
    check("and it still records that the wizard is done", /onboarding_completed:\s*true/.test(write))
    /* Why: a different bio is a different copy to the save's check. */
    const opened = { draft_blocks: [], archived_blocks: [], theme: {}, bio: "" }
    check("a bio written beside the save changes the copy the save is checked against", onePageEditVersion(opened) !== onePageEditVersion({ ...opened, bio: "Hi, I draw cats" }))

    const j = await Journey.start()
    /* The live table's archived_blocks (DB-1): without it the version check's own read fails, and a failed read is not a conflict. */
    j.db.extraColumns.add("onepages.archived_blocks")
    const seller = await j.signUp("noa@example.com", { name: "Noa" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "noa" } })
    const creator = j.rows("creators")[0]
    const theme = { background_type: "solid", background_color: "#ffffff" }
    const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "published", slug: "noa", title: "Noa", bio: "", theme, settings: {}, social_links: {}, draft_blocks: [] }, {})
    const base = onePageEditVersion(page as never)
    const live = j.rows("onepages").find((r) => r.id === page.id)!
    const wizardSave = { id: page.id, title: "Noa Studio", bio: "Hi, I draw cats", theme, draft_blocks: [{ id: "l1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop", url: "https://example.com" } }], base_version: base }
    /* The control: what the wizard used to write (the bio straight to the row), then its save(true). */
    Object.assign(live, { bio: "Hi, I draw cats" })
    const before = await j.call("PUT /api/onepage", { as: seller, body: wizardSave })
    check("control: with the bio written first, the real route refuses the wizard's save (409)", before.status === 409, before)
    Object.assign(live, { bio: "" })
    /* What the wizard writes now, then its save(true). */
    Object.assign(live, { social_links: { instagram: "https://instagram.com/noa" }, onboarding_completed: true })
    const saved = await j.call("PUT /api/onepage", { as: seller, body: wizardSave })
    check("the wizard's save goes through now", saved.status === 200, saved)
    const row = j.rows("onepages").find((r) => r.id === page.id) as Record<string, any>
    check("and the bio and blocks it picked are saved", row.bio === "Hi, I draw cats" && row.draft_blocks?.[0]?.id === "l1", row)
  }

  section("ED-1: a plan that could not be read never blocks Save")
  {
    const editor = code("components/onepage/onepage-editor.tsx")
    check("the editor tells a read plan from a guessed one", /setPlanConfirmed\(true\)/.test(editor))
    const gates = [...editor.matchAll(/const userHasPro = ([^\n]+)/g)].map((m) => m[1])
    check("every Pro gate lets an unread plan through", gates.length >= 3 && gates.every((g) => g.startsWith("!planConfirmed ||")), gates)
  }

  section("S1/S2: one request saves and publishes, and only what this editor changed is sent")
  {
    const lastSaved = JSON.stringify(["Ivy", "Hi", null, "ivy", { a: 1 }, { seo_title: "Old", show_branding: true }, { instagram: "https://instagram.com/old", tiktok: "https://tiktok.com/@ivy" }, [], [], null])
    const page = { id: "p1", title: "Ivy", bio: "Hi there", avatar_video_url: null, slug: "ivy", theme: { a: 2 }, settings: { seo_title: "Old", show_branding: true, share_enabled: false }, social_links: { instagram: "https://instagram.com/old", tiktok: "", youtube: "https://youtube.com/@ivy" }, draft_blocks: [{ id: "b" }], share_image_mode: null }
    const body = saveRequestBody(page, [], lastSaved, "0123456789abcdef")
    check("the checked fields go whole, with the base and publish", JSON.stringify(body.draft_blocks) === '[{"id":"b"}]' && body.bio === "Hi there" && JSON.stringify(body.theme) === '{"a":2}' && body.base_version === "0123456789abcdef" && body.publish === true, body)
    check("an unchanged name, address, video and share picture are not sent", !("title" in body) && !("slug" in body) && !("avatar_video_url" in body) && !("share_image_mode" in body), Object.keys(body))
    check("settings: only the key that changed", JSON.stringify(body.settings) === '{"share_enabled":false}', body.settings)
    check("social links: only the platforms that changed, a cleared one as empty", JSON.stringify(body.social_links_patch) === '{"tiktok":"","youtube":"https://youtube.com/@ivy"}' && !("social_links" in body), body.social_links_patch)
    const first = saveRequestBody(page, [], null, null)
    check("with nothing known about the last save, everything is sent, as before, and no base", first.title === "Ivy" && first.slug === "ivy" && !!first.settings && !!first.social_links && !("base_version" in first), Object.keys(first))

    const draft: LocalDraft = { v: 1, pageId: "p1", base: "x", at: Date.now(), fields: { title: "Ivy", social_links: { instagram: "https://instagram.com/old", tiktok: "https://tiktok.com/@new" }, settings: { seo_title: "Old" }, draft_blocks: [{ id: "mine" }] }, saved: JSON.stringify(["Ivy", "", null, "ivy", {}, { seo_title: "Old" }, { instagram: "https://instagram.com/old", tiktok: "https://tiktok.com/@ivy" }, [], [], null]) }
    const server = { id: "p1", title: "Ivy Renamed", bio: "", slug: "ivy", theme: {}, settings: { seo_title: "Newer" }, social_links: { instagram: "https://instagram.com/newer", tiktok: "https://tiktok.com/@ivy" }, draft_blocks: [] } as never
    const restored = withDraft(server, draft) as unknown as Record<string, any>
    check("a device draft brings back the blocks", JSON.stringify(restored.draft_blocks) === '[{"id":"mine"}]')
    check("and only the link it changed, keeping the server's newer Instagram", restored.social_links.tiktok === "https://tiktok.com/@new" && restored.social_links.instagram === "https://instagram.com/newer", restored.social_links)
    check("and not an older name or setting it never changed", restored.title === "Ivy Renamed" && restored.settings.seo_title === "Newer", { title: restored.title, settings: restored.settings })

    const j = await Journey.start()
    j.db.extraColumns.add("onepages.archived_blocks")
    const seller = await j.signUp("lou@example.com", { name: "Lou" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lou" } })
    const creator = j.rows("creators")[0]
    const theme = { background_type: "solid", background_color: "#ffffff" }
    const [page2] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "published", slug: "lou", title: "Lou", bio: "", theme, settings: { seo_title: "Kept" }, social_links: { instagram: "https://instagram.com/lou" }, draft_blocks: [] }, {})
    /* The creator page changed Instagram since the editor opened (lib/social/onepage-sync writes both copies). */
    Object.assign(j.rows("onepages").find((r) => r.id === page2.id)!, { social_links: { instagram: "https://instagram.com/lou-new" }, published_social_links: { instagram: "https://instagram.com/lou-new" } })
    const one = await j.call("PUT /api/onepage", { as: seller, body: { id: page2.id, draft_blocks: [{ id: "l1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop", url: "https://example.com" } }], archived_blocks: [], theme, bio: "Hello", social_links_patch: { tiktok: "https://tiktok.com/@lou" }, publish: true } })
    const row = j.rows("onepages").find((r) => r.id === page2.id) as Record<string, any>
    check("one PUT with publish: true answers 200, published", one.status === 200 && one.json?.published === true, one)
    check("the draft and the live copy are written by that one request", row.draft_blocks?.[0]?.id === "l1" && row.published_blocks?.[0]?.id === "l1" && row.published_profile?.bio === "Hello" && row.status === "published", row.published_profile)
    check("the live name is the row's own when the save did not change it", row.published_profile?.title === "Lou")
    check("the links patch is merged over the newer Instagram, never putting the old one back", row.social_links?.instagram === "https://instagram.com/lou-new" && row.social_links?.tiktok === "https://tiktok.com/@lou" && row.published_social_links?.instagram === "https://instagram.com/lou-new", row.social_links)
    check("settings not sent are kept", row.settings?.seo_title === "Kept", row.settings)
    check("the answer names its edit version in a header too", typeof one.headers.get("x-onepage-edit-version") === "string" && one.headers.get("x-onepage-edit-version") === one.json?.edit_version)
    check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  }

  section("SEC1: a page acts for its owner's store, never the one its row names")
  {
    const j = await Journey.start()
    const victim = await j.signUp("victim@example.com", { name: "Victim" })
    await j.call("POST /api/onboarding/finalize", { as: victim, body: { role: "creator", creatorSlug: "victim" } })
    const owner = await j.signUp("owner@example.com", { name: "Owner" })
    await j.call("POST /api/onboarding/finalize", { as: owner, body: { role: "creator", creatorSlug: "owner" } })
    const victimCreator = j.rows("creators").find((c) => c.user_id === victim.id)!
    const ownerCreator = j.rows("creators").find((c) => c.user_id === owner.id)!
    const signup = { id: "sg", type: "email_capture", enabled: true, sort_order: 0, data: { headline: "Join" } }
    /* The owner wrote another creator's id into their own row (the table lets them write those two columns). */
    const [spoofed] = j.db.insert("onepages", { owner_id: owner.id, seller_id: victimCreator.id, creator_id: victimCreator.id, status: "published", slug: "owner", theme: {}, settings: {}, social_links: {}, draft_blocks: [signup], published_blocks: [signup] }, {})
    const r = await j.call("POST /api/onepage/leads", { headers: { "x-forwarded-for": "203.0.113.77" }, body: { onepage_id: spoofed.id, block_id: "sg", email: "fan@example.com", company: "", elapsed: 5000 } })
    const sub = j.rows("subscribers").find((x) => x.email === "fan@example.com")
    check("a signup on it joins the owner's list, not the named store's", r.status === 200 && sub?.creator_id === ownerCreator.id, { r: r.status, sub })
    check("the named store gets nothing", !j.rows("subscribers").some((x) => x.creator_id === victimCreator.id))
    const again = await j.call("POST /api/onepage/leads", { headers: { "x-forwarded-for": "203.0.113.78" }, body: { onepage_id: spoofed.id, block_id: "sg", email: "fan@example.com", company: "", elapsed: 5000 } })
    check("F3: the same address again is one lead, answered as already in", again.status === 200 && j.rows("onepage_leads").filter((l) => l.email === "fan@example.com").length === 1 && again.json?.message === "Already subscribed", again)
    const repaired = await j.call("PUT /api/onepage", { as: owner, body: { id: spoofed.id, draft_blocks: [signup] } })
    const fixedRow = j.rows("onepages").find((x) => x.id === spoofed.id) as Record<string, any>
    check("SEC7: the owner's next save puts the row's store right", repaired.status === 200 && fixedRow.seller_id === ownerCreator.id && fixedRow.creator_id === ownerCreator.id, { status: repaired.status, seller: fixedRow.seller_id })
    check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  }

  section("C1: the download form gives only its own published, free product")
  {
    const j = await Journey.start()
    const seller = await j.signUp("mia@example.com", { name: "Mia" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mia" } })
    const other = await j.signUp("zed@example.com", { name: "Zed" })
    await j.call("POST /api/onboarding/finalize", { as: other, body: { role: "creator", creatorSlug: "zed" } })
    const mia = j.rows("creators").find((c) => c.user_id === seller.id)!
    const zed = j.rows("creators").find((c) => c.user_id === other.id)!
    const free = j.db.insert("products", { creator_id: mia.id, title: "Free guide", price_cents: 0, status: "published", type: "digital", slug: "free-guide" }, {})[0]
    const pwyw = j.db.insert("products", { creator_id: mia.id, title: "Name your price", price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 500, status: "published", type: "digital", slug: "pwyw" }, {})[0]
    const theirs = j.db.insert("products", { creator_id: zed.id, title: "Zed's free", price_cents: 0, status: "published", type: "digital", slug: "zed-free" }, {})[0]
    const magnet = (id: string, product: string) => ({ id, type: "lead_magnet", enabled: true, sort_order: 0, data: { kind: "download", product_id: product } })
    const blocks = [magnet("m-free", free.id), magnet("m-pwyw", pwyw.id), magnet("m-theirs", theirs.id)]
    const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: mia.id, creator_id: mia.id, status: "published", slug: "mia", theme: {}, settings: {}, social_links: {}, draft_blocks: blocks, published_blocks: blocks }, {})
    const ask = (block: string, email: string, extra: Record<string, unknown> = {}, ip = "198.51.100.1") => j.call("POST /api/onepage/email-capture", { headers: { "x-forwarded-for": ip }, body: { onepage_id: page.id, block_id: block, email, company: "", elapsed: 5000, ...extra } })
    const ok = await ask("m-free", "a@example.com")
    check("the block's own free product: a download link", ok.status === 200 && typeof ok.json?.downloadLink === "string" && /\/api\/onepage\/download\//.test(ok.json.downloadLink), ok)
    const p = await ask("m-pwyw", "b@example.com", {}, "198.51.100.2")
    check("a pay what you want product with a price is refused", p.status === 400, p)
    const t = await ask("m-theirs", "c@example.com", {}, "198.51.100.3")
    check("another creator's product is never handed over", t.status === 200 && !t.json?.downloadLink, t)
    const forged = await ask("m-free", "d@example.com", { digital_product_id: pwyw.id }, "198.51.100.4")
    check("a product id in the request is ignored: the block's product is the one given", forged.status === 200 && j.rows("subscriber_digital_products").filter((r) => r.subscriber_email === "d@example.com").every((r) => r.product_id === free.id), j.rows("subscriber_digital_products"))
    const twice = await ask("m-free", "a@example.com", {}, "198.51.100.6")
    check("the same address again: its link, one lead, said as already in", twice.status === 200 && twice.json?.already === true && typeof twice.json?.downloadLink === "string" && j.rows("onepage_leads").filter((l) => l.email === "a@example.com").length === 1, { status: twice.status, json: twice.json, leads: j.rows("onepage_leads").filter((l) => l.email === "a@example.com").length })
    const gone = await ask("nope", "e@example.com", {}, "198.51.100.5")
    check("a block that is not on the published page answers 404", gone.status === 404, gone)
    check("the lead is kept before anything is sent", j.rows("onepage_leads").some((l) => l.email === "a@example.com"))
    check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  }

  section("SEC2: a paid block's locked part is sealed where it is stored")
  {
    const paid = { id: "pd", type: "app", enabled: true, sort_order: 0, data: { provider: "paid", paid_product_id: "x", title: "Bonus", locked_text: "The recipe", locked_url: "https://drive.example.com/x", locked_label: "Open" } }
    const group = { id: "g", type: "group", enabled: true, sort_order: 1, data: { children: [paid] } }
    const sealed = sealLocked([paid, group]) as any[]
    const flat = JSON.stringify(sealed)
    check("no locked text or link is left in the stored blocks, groups included", !/The recipe|drive\.example/.test(flat) && typeof sealed[0].data.locked_sealed === "string" && typeof sealed[1].data.children[0].data.locked_sealed === "string", flat.slice(0, 300))
    check("the page keeps only whether there is text and a link", sealed[0].data.locked_has_text === true && sealed[0].data.locked_has_link === true)
    const opened = openLocked(sealed) as any[]
    check("the owner's editor gets them back exactly", opened[0].data.locked_text === "The recipe" && opened[0].data.locked_url === "https://drive.example.com/x" && opened[0].data.locked_label === "Open" && !("locked_sealed" in opened[0].data) && opened[1].data.children[0].data.locked_text === "The recipe")
    check("and the access route opens one block's data", (openLockedData(sealed[0].data) as any).locked_text === "The recipe")
    const live = withoutLocked(sealed) as any[]
    check("the live page sends neither the text nor the sealed copy", !("locked_sealed" in live[0].data) && !("locked_text" in live[0].data) && live[0].data.locked_has_text === true)
    check("a block without a locked part is not touched", sealLocked([{ id: "l", type: "link_button", data: { url: "https://a.example" } }])[0].data.url === "https://a.example")
    const signup = withoutLocked([{ id: "s", type: "email_capture", data: { headline: "Join", enable_digital_product: true, digital_product_file_url: "https://cdn.example/guide.pdf" } }]) as any[]
    check("F5: an email signup's gated file address is not sent with the page, only that there is one", !("digital_product_file_url" in signup[0].data) && signup[0].data.digital_product_has_file === true && signup[0].data.headline === "Join")
  }

  section("P-F3: what is not on the live page is not sent with it")
  {
    const now = Date.parse("2026-11-13T12:00:00Z")
    const later = "2026-11-20T12:00:00.000Z"
    const row = {
      id: "p", slug: "p", status: "published", theme: {}, settings: {}, social_links: {},
      published_blocks: [
        { id: "on", type: "link_button", enabled: true, sort_order: 0, data: { label: "On", url: "https://on.example" } },
        { id: "off", type: "link_button", enabled: false, sort_order: 1, data: { label: "Secret", url: "https://discord.gg/secret" } },
        { id: "grp", type: "group", enabled: true, sort_order: 2, data: { children: [
          { id: "kid-on", type: "link_button", enabled: true, sort_order: 0, data: { url: "https://kid.example" } },
          { id: "kid-later", type: "link_button", enabled: true, sort_order: 1, schedule: { start_at: later }, data: { url: "https://launch.example" } },
          { id: "kid-off", type: "link_button", enabled: false, sort_order: 2, data: { url: "https://hidden.example" } },
        ] } },
      ],
    }
    const live = publicOnePage(row as never, { source: "published", now })
    const flat = JSON.stringify(live.blocks)
    check("a switched off block and a group's hidden or not yet started ones are left out", !/discord\.gg|launch\.example|hidden\.example/.test(flat) && /on\.example/.test(flat) && /kid\.example/.test(flat), flat)
    const draft = publicOnePage({ ...row, draft_blocks: row.published_blocks } as never, { source: "draft", now })
    check("the editor's preview is the same shape (it never drew them either)", JSON.stringify(draft.blocks) === JSON.stringify(live.blocks))
    check("the page asks again when a group's block starts", nextScheduleChange(row.published_blocks, now) === Date.parse(later))
  }

  section("B5/B6, D1, P-F11: smaller fixes")
  {
    check("B5: an image block shows while any of its pictures has one", isBlockShown({ type: "image", enabled: true, data: { images: [{ image_url: "" }, { image_url: "https://x.example/2.png" }] } }))
    const live = publicOnePage({ id: "p", published_blocks: [{ id: "i", type: "image", enabled: true, data: { clickable: true, images: [{ id: "1", image_url: "https://x.example/1.png", link_url: "instagram.com/mara" }] } }] } as never, { source: "published" })
    check("B6: a picture's link typed without its scheme opens as https", (live.blocks[0] as any).data.images[0].link_url === "https://instagram.com/mara", live.blocks[0])
    const peach = "linear-gradient(135deg, #fed7aa 0%, #fdba74 40%, #fb7185 100%)"
    check("D1: End is the last stop", readLinearGradient(peach)?.stops.at(-1)?.color === "#fb7185")
    check("D1: turning the direction keeps every stop", editLinearGradient(peach, { direction: 180 }, { direction: 180, first: "#fed7aa", last: "#fb7185" }) === "linear-gradient(180deg, #fed7aa 0%, #fdba74 40%, #fb7185 100%)")
    check("D1: a new End colour changes only the last stop", editLinearGradient(peach, { last: "#000000" }, { direction: 135, first: "#fed7aa", last: "#000000" }) === "linear-gradient(135deg, #fed7aa 0%, #fdba74 40%, #000000 100%)")
    let threw = false
    try {
      check("P-F11: a stray % in a Telegram address is no link, not a crash", telegramTarget("t.me/joinchat/abc%") === null)
    } catch {
      threw = true
    }
    check("P-F11: and it never throws while the page is drawn", !threw)
  }

  section("B1/B2/B3/B4/B9, S3, S5, S6, D2, D5: wired in the editor")
  {
    const links = code("components/onepage/tabs/links-tab.tsx")
    check("B1: deep block writes read the page as it is now", /const blocks = getLatestOnePage\(\)\?\.draft_blocks \?\? \[\]\s*\n\s*const source = findBlockDeep\(blocks, id\)\?\.block/.test(links) && /const plan = updatePlanDeep\(blocks, id, updates\)/.test(links))
    check("B1: and no upload writes back the block it began with", !/\.\.\.block\??\.data,\s*\n\s*(digital_product_file_url|product_image|pdf_file_url|thumbnail_url|custom_thumbnail):/.test(links))
    check("B2/B4: a group's child editor is keyed by the child and passes the field through", /<BlockEditor\s*\n\s*block=\{selectedChild\}\s*\n\s*key=\{selectedChild\.id\}/.test(links) && /onOpenImageLibrary=\{onOpenImageLibrary\}/.test(links))
    check("B9: nothing is moved above the profile header", /if \(from > headerIndex\) return Math\.max\(to, headerIndex \+ 1\)/.test(links) && /if \(blocks\[index - 1\]\.type === "header" \|\| blocks\[index\]\.type === "header"\) return/.test(code("lib/onepage/context.tsx")))
    check("B3: an upload is not stopped when its field goes", !/alive\.current = false\s*\n\s*ctrl\.current\?\.abort\(\)/.test(code("components/onepage/upload-progress.tsx")))
    const ctx = code("lib/onepage/context.tsx")
    check("S3: a quiet retry that will not be retried is said", /if \(!quiet \|\| !retryableSave\(status\)\) setSaveError/.test(ctx))
    check("S5: Discard drops the device's copy", /const discardUnsaved = useCallback/.test(ctx) && /clearDraft\(deviceStore\(\), page\.id\)/.test(ctx) && /discardUnsaved\(\)/.test(code("components/onepage/onepage-editor.tsx")))
    check("S6: Upgrade goes to pricing past the paid setting's refusal", /if \(!result\.ok && result\.status !== 400\) return/.test(code("components/onepage/onepage-editor.tsx")))
    const live = code("components/onepage/public-onepage.tsx")
    const logoBranches = live.split('data-logo-title=""').slice(1).map((part) => part.slice(0, 2500))
    check("D2: the verified badge is drawn beside a logo title, both layouts", logoBranches.length === 2 && logoBranches.every((part) => /<VerifiedBadge /.test(part.split("</span>")[0])), logoBranches.length)
    check("D2: and beside the logo in the scrolled bar", (code("components/onepage/hero-scroll.tsx").match(/data-op-topbar-badge=""/g) ?? []).length === 2)
    check("D5: an icon colour picked over brand discs is shown", /social_icon_tone: "mono"/.test(code("components/onepage/tabs/design-tab.tsx")))
  }

  section("SEC6, P-F7, P-F2, D6, D7, B15")
  {
    const row = { id: "p", slug: "p", settings: { verified_badge_enabled: true, verified_badge_type: "verified_business", show_branding: false }, published_blocks: [] }
    const owner = (paidPlan: boolean | null) => ({ handle: "p", creatorId: "c", banned: false, spamState: null, avatarUrl: null, displayName: "P", publishedProducts: 0, canonical: null, paidPlan }) as never
    const free = publishedShape(row as never, owner(false)).settings
    check("SEC6: a plan known not to pay is drawn without the badge and with the Storelib badge", free.verified_badge_enabled === false && free.show_branding === true, free)
    const paid = publishedShape(row as never, owner(true)).settings
    check("SEC6: a paying plan keeps both", paid.verified_badge_enabled === true && paid.show_branding === false)
    const unknown = publishedShape(row as never, owner(null)).settings
    check("SEC6: a plan that could not be read takes nothing away", unknown.verified_badge_enabled === true && unknown.show_branding === false)
    const signup = { id: "e", type: "email_capture", enabled: true, data: { headline: "Join my newsletter" } }
    check("P-F7: a new page of a name and a signup form is not listed", !onePageShowsSomething({ blocks: [{ id: "h", type: "header", enabled: true }, signup], bio: "", socialLinks: {} }))
    check("P-F7: the same form with a bio or a real link is", onePageShowsSomething({ blocks: [signup], bio: "Painter in Lisbon", socialLinks: {} }) && onePageShowsSomething({ blocks: [signup, { id: "l", type: "link_button", enabled: true, data: { url: "https://shop.example", label: "Shop" } }], bio: "", socialLinks: {} }))
    check("P-F2: a username is refused when it is another creator's page address", /db\.from\("onepages"\)\.select\("owner_id"\)\.ilike\("slug", handle\)/.test(code("lib/profile/ensure-username.ts")) && /if \(!pages\.error && others\(pages, "owner_id"\)\) return false/.test(code("lib/profile/ensure-username.ts")))
    check("D6: the corners slider reaches a theme's own rounder corners", /max=\{Math\.max\(24, radius\)\}/.test(code("components/onepage/tabs/design-tab.tsx")))
    const duo = (strength: number | undefined) => wallpaperMediaLook({ wallpaper_effect: "duotone", ...(strength === undefined ? {} : { wallpaper_tint_strength: strength }) } as never, "image")
    const opacityOf = (layers: unknown) => (JSON.stringify(layers).match(/"opacity":([\d.]+)/) ?? [])[1]
    check("D7: duotone at 0% draws nothing of it, unset draws it whole", opacityOf(duo(0)) === "0" && opacityOf(duo(undefined)) === "1", { zero: opacityOf(duo(0)), unset: opacityOf(duo(undefined)) })
    check("B15: an older header's switches show what the page draws", /checked=\{data\.show_avatar !== false\}/.test(code("components/onepage/tabs/links-tab.tsx")) && /checked=\{data\.show_bio !== false\}/.test(code("components/onepage/tabs/links-tab.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
