/**
 * ===========================================================================
 *  ROUND 11: THE EMAIL SIGNUP'S FIVE LAYOUTS AND A GROUP, END TO END
 * ===========================================================================
 * Through the real routes over the journey harness (tests/_journey), the
 * way the owner meets them:
 *
 *   SIGNUP     a published OnePage with one email signup in each of the five
 *              layouts (lib/onepage/email-signup), none with an image. The
 *              page as served on storelib.me (lib/onepage/host-route
 *              onePageRoute, the proxy's own decision) is the OnePage, and
 *              the call its form makes is one
 *              storelib.me answers. A visitor joins from each, and each lands
 *              on the creator's one subscriber list.
 *   GROUP      a group holding a link, a product and a switched-off link,
 *              sliding sideways, saved with the editor's Save (PUT
 *              /api/onepage), read back as a reload does, published, and drawn
 *              from the published copy: the same group, the same order, the
 *              switched-off one left out on the live page.
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { onePageRoute } from "@/lib/onepage/host-route"
import { EMAIL_SIGNUP_LAYOUT_IDS } from "@/lib/onepage/email-signup"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { moveIntoGroup, moveOutOfGroup } from "@/lib/onepage/group"
import type { GroupBlockData, OnePageBlock } from "@/lib/onepage/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

const onMe = (path: string, method = "GET") =>
  onePageRoute({ host: "storelib.me", pathname: path, search: "", method, userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www", "app", "api"] })

const theme = {
  background_type: "solid", background_color: "#ffffff", text_color: "#111113", secondary_text_color: "#6b7280",
  button_style: "outline", button_color: "#ffffff", button_text_color: "#111113", button_border_radius: 12,
  button_border_width: 1, button_border_color: "#111113", font_family: "Inter",
}
const block = (id: string, type: string, data: Record<string, unknown>, extra: Partial<OnePageBlock> = {}): OnePageBlock =>
  ({ id, type, enabled: true, sort_order: 0, data, ...extra }) as unknown as OnePageBlock

async function main() {
  const j = await Journey.start()

  section("1. A creator with a published OnePage")
  const seller = await j.signUp("lena@example.com", { name: "Lena Lane" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "lena" } })
  const creator = j.rows("creators")[0]
  check("the creator exists", !!creator?.id, j.rows("creators"))
  const [page] = j.db.insert("onepages", { owner_id: seller.id, seller_id: creator.id, status: "published", slug: "lena", theme, settings: {}, social_links: {}, draft_blocks: [] }, {})

  section("2. An email signup in each of the five layouts, none with an image")
  const signups = EMAIL_SIGNUP_LAYOUT_IDS.map((layout, i) =>
    block(`signup_${layout}`, "email_capture", { headline: "Join my newsletter", description: "One email a week", button_preset: "subscribe", layout_type: layout, product_image: null }, { sort_order: i }),
  )
  const saved = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: signups } })
  check("the editor's Save takes them", saved.status === 200, saved)
  const published = await j.call("POST /api/onepage/publish", { as: seller, body: { id: page.id, draft_blocks: signups, theme } })
  check("and Publish puts them live", published.status === 200, published)
  const row = j.rows("onepages").find((r) => r.id === page.id)!
  const live = publicOnePage(row as never, { source: "published" })
  check("the live page holds all five, each with its layout", EMAIL_SIGNUP_LAYOUT_IDS.every((l) => live.blocks.some((b: any) => b.id === `signup_${l}` && b.data.layout_type === l)), live.blocks.map((b: any) => b.data?.layout_type))

  const served = onMe("/lena")
  check("storelib.me/lena is the OnePage (not a 404, not sent away)", served?.kind === "rewrite", served)
  /* What each layout draws, live and in the preview, is measured in a browser: scripts/check-onepage-blocks-r11.mjs (public-onepage.tsx does not type-check, so no suite imports it). */
  check("the form's call is one storelib.me answers", onMe("/api/onepage/leads", "POST")?.kind === "next", onMe("/api/onepage/leads", "POST"))

  section("3. A visitor joins from each layout")
  for (const layout of EMAIL_SIGNUP_LAYOUT_IDS) {
    const email = `fan-${layout}@example.com`
    const r = await j.call("POST /api/onepage/leads", { body: { onepage_id: page.id, email, company: "", elapsed: 5000, block_id: `signup_${layout}`, origin: "https://storelib.me/lena" } })
    const sub = j.rows("subscribers").find((s) => s.email === email)
    const lead = j.rows("onepage_leads").find((l) => l.email === email)
    check(`${layout}: on the creator's subscriber list, the lead kept from that block`, r.status === 200 && !!sub && sub.creator_id === creator.id && sub.status === "subscribed" && lead?.block_id === `signup_${layout}`, { r, sub, lead })
  }

  section("4. A group: made, filled, saved, reloaded, published")
  const product = j.db.insert("products", { creator_id: creator.id, title: "Brush pack", price_cents: 900, status: "published", type: "digital", slug: "brush-pack" }, {})[0]
  let blocks: OnePageBlock[] = [
    block("hdr", "header", { show_avatar: true, show_name: true, show_bio: true }, { sort_order: 0 }),
    block("grp", "group", { title: "Start here", layout: "stack", children: [] }, { sort_order: 1 }),
    block("lnk", "link_button", { label: "My studio", url: "https://example.com/studio" }, { sort_order: 2 }),
    block("prd", "product", { product_id: product.id, product_title: "Brush pack", product_price_cents: 900, product_type: "digital" }, { sort_order: 3 }),
    block("off", "link_button", { label: "Old shop", url: "https://example.com/old" }, { sort_order: 4, enabled: false }),
    block("sig", "email_capture", { headline: "Join", layout_type: "bold" }, { sort_order: 5 }),
  ]
  for (const id of ["lnk", "prd", "off"]) blocks = moveIntoGroup(blocks, id, "grp") ?? blocks
  check("a link, a product and a switched-off link go in, one edit each", blocks.length === 3 && ((blocks[1].data as GroupBlockData).children || []).map((c) => c.id).join() === "lnk,prd,off", blocks.map((b) => b.id))
  /* Changed on purpose (round 41): any block goes in a group except the header, another group and the social icons (lib/onepage/group.ts); the server reads a group's children for signups, so an email signup goes in too. The header still does not. */
  check("the header does not go in a group", moveIntoGroup(blocks, "hdr", "grp") === null)
  const out = moveOutOfGroup(blocks, "grp", "prd")!
  check("moving one out puts it right under the group, gone from the group", out.map((b) => b.id).join() === "hdr,grp,prd,sig" && !((out[1].data as GroupBlockData).children || []).some((c) => c.id === "prd"))
  blocks = moveIntoGroup(out, "prd", "grp")!
  /* Reorder inside the group: the product first. */
  const g = blocks[1].data as GroupBlockData
  blocks[1] = { ...blocks[1], data: { ...g, layout: "carousel", carousel_view: "1.2", children: [g.children[2], g.children[0], g.children[1]].map((c, i) => ({ ...c, sort_order: i })) } }

  const put = await j.call("PUT /api/onepage", { as: seller, body: { id: page.id, draft_blocks: blocks } })
  check("Save takes the page with its group", put.status === 200, put)
  const reloaded = j.rows("onepages").find((r) => r.id === page.id)?.draft_blocks as OnePageBlock[]
  const rg = reloaded?.find((b) => b.id === "grp")
  const rgd = rg?.data as GroupBlockData | undefined
  check("read back (a reload): the same group, sliding, in the order it was left", rgd?.layout === "carousel" && rgd?.carousel_view === "1.2" && rgd.children.map((c) => c.id).join() === "prd,lnk,off", rgd)
  check("the switched-off link is still in it, still off", rgd?.children.find((c) => c.id === "off")?.enabled === false)

  const pub = await j.call("POST /api/onepage/publish", { as: seller, body: { id: page.id, draft_blocks: reloaded, theme } })
  check("Publish takes it", pub.status === 200, pub)
  const livePage = publicOnePage(j.rows("onepages").find((r) => r.id === page.id)! as never, { source: "published" })
  const lg = livePage.blocks.find((b: any) => b.id === "grp")
  const shown = ((lg?.data?.children ?? []) as OnePageBlock[]).filter((c) => isBlockShown(c)).map((c) => c.id)
  check("the live page draws the product and the link in the group, not the switched-off one", shown.join() === "prd,lnk", shown)

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
