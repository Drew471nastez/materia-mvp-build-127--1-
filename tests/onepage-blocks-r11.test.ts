/**
 * ===========================================================================
 *  ROUND 11: THE EMAIL SIGNUP'S LAYOUTS, GROUPS, THE PRODUCTS TAB, AND WHAT
 *  THE PAGE IS CONNECTED TO
 * ===========================================================================
 * The owner:
 *   "the thumbnails are too big; you can create three more as well; make
 *    sure it's smooth and clean and actually working, because it's not
 *    working when I select those" ... "even though I don't have any image"
 *   "Make sure groups work."
 *   "I don't like that that list is so long as default opened ... the
 *    scroll bars, too fat and too visible"
 *   "Add more important settings ... such as integrations connected with
 *    the backend of Storelib."
 *
 * The rules (lib/onepage/email-signup, group, products-tab), the drawing
 * (components/onepage/email-signup), and the wiring in the editor and the
 * live page. tests/e2e-onepage-blocks-r11.test.ts runs a signup in each
 * layout and a group through the real routes; scripts/check-onepage-blocks-
 * r11.mjs measures them in a browser at 390 and 1440.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EMAIL_SIGNUP_LAYOUT_IDS, boldColors, emailSignupImage, emailSignupLayout, emailSignupStacked, tintOf } from "@/lib/onepage/email-signup"
import { EmailLayoutThumb, EmailSignupView } from "@/components/onepage/email-signup"
import { GROUP_CHILD_TYPES, canGoInGroup, findBlockDeep, moveIntoGroup, moveOutOfGroup, updatePlanDeep } from "@/lib/onepage/group"
import { PRODUCTS_PREVIEW, productIdsOnPage, productsTabView } from "@/lib/onepage/products-tab"
import { ONEPAGE_HOST_API } from "@/lib/onepage/host-route"
import type { GroupBlockData, OnePageBlock } from "@/lib/onepage/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const b = (id: string, type: string, data: Record<string, unknown> = {}, extra: Partial<OnePageBlock> = {}): OnePageBlock =>
  ({ id, type, enabled: true, sort_order: 0, data, ...extra }) as unknown as OnePageBlock
const kids = (blocks: OnePageBlock[], id: string) => ((blocks.find((x) => x.id === id)?.data as GroupBlockData)?.children || []).map((c) => c.id).join()

const theme = { text_color: "#111113", secondary_text_color: "#6b7280", button_color: "#ffffff", button_text_color: "#111113", background_color: "#ffffff" }
const view = (layout: string, image: string | null, submitted = false) =>
  renderToStaticMarkup(
    React.createElement(EmailSignupView, {
      layout: emailSignupLayout(layout),
      headline: "Join my newsletter",
      description: "One email a week",
      image,
      theme,
      stackedForm: false,
      renderForm: ({ stacked, inverted }) => React.createElement("form", { "data-form": stacked ? "stacked" : "row", "data-inverted": inverted ? `${inverted.fill}/${inverted.text}` : "no" }),
      submitted,
      successMessage: "Thanks!",
      afterSignup: React.createElement("a", { "data-after": "" }, "Gift"),
    }),
  )

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The email signup's layouts: five, and each one does something")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Changed on purpose, round 43: three more after the five (Connect, Personal note, Bar). */
    check("five layouts, Classic and Featured kept under their saved names", EMAIL_SIGNUP_LAYOUT_IDS.slice(0, 5).join() === "default,pro,cover,bold,minimal")
    check("a saved layout reads as itself; nothing or junk is Classic", emailSignupLayout("pro") === "pro" && emailSignupLayout("bold") === "bold" && emailSignupLayout(undefined) === "default" && emailSignupLayout("fancy") === "default")
    check("the picture: the creator's own, then the free gift's cover, then none", emailSignupImage({ product_image: " a.png ", digital_product_thumbnail: "b.png" }) === "a.png" && emailSignupImage({ product_image: "", digital_product_thumbnail: "b.png" }) === "b.png" && emailSignupImage({}) === null)
    check("Cover and Solid stack the form; the others only for long button words", emailSignupStacked("cover", "Go") && emailSignupStacked("bold", "Go") && !emailSignupStacked("default", "Subscribe") && emailSignupStacked("minimal", "Get my free guide now"))
    check("the soft fill takes any colour the theme holds (it was hex + \"10\", nothing for #000)", tintOf("#000", 5) === "color-mix(in srgb, #000 5%, transparent)" && tintOf(null, 5).includes("#1a1a2e"))
    check("Solid: white words on dark text colour, near-black on a light one", boldColors("#111113").on === "#ffffff" && boldColors("#f4efe9").on === "#111113" && boldColors("rgb(0,0,0)").on === "#ffffff")

    for (const layout of EMAIL_SIGNUP_LAYOUT_IDS) {
      const without = view(layout, null)
      const withImg = view(layout, "https://cdn.example/cover.jpg")
      check(`${layout}: its own shape, with the form, with and without an image`, without.includes(`data-email-layout="${layout}"`) && withImg.includes(`data-email-layout="${layout}"`) && /data-form=/.test(without) && /data-form=/.test(withImg))
      check(`${layout}: no empty picture without an image`, !/<img/.test(without))
    }
    check("Featured draws its picture beside the words, or the mail mark without one", /<img[^>]*cover\.jpg/.test(view("pro", "https://cdn.example/cover.jpg")) && /data-email-mark=""/.test(view("pro", null)))
    check("Cover draws its wide picture, or a soft band without one", /<img[^>]*aspect-\[2\/1\]/.test(view("cover", "https://cdn.example/cover.jpg")) && /data-email-band=""/.test(view("cover", null)))
    check("Classic and Simple draw no mark without an image (nothing to stand in for)", !/data-email-mark/.test(view("default", null)) && !/data-email-mark/.test(view("minimal", null)))
    check("Solid asks for its button in the card's colours", /data-inverted="#ffffff\/#111113"/.test(view("bold", null)) && /data-inverted="no"/.test(view("default", null)))
    check("the thanks and the link after it come once they have joined", !/data-email-thanks/.test(view("default", null)) && /data-email-thanks=""[\s\S]*Thanks![\s\S]*data-after=""/.test(view("default", null, true)))

    for (const layout of EMAIL_SIGNUP_LAYOUT_IDS) {
      const t = renderToStaticMarkup(React.createElement(EmailLayoutThumb, { layout, image: null, theme }))
      check(`${layout}: a small picture of it, 60px tall`, t.includes(`data-email-thumb="${layout}"`) && /h-\[60px\]/.test(t))
    }

    const live = read("components/onepage/public-onepage.tsx")
    const email = live.slice(live.indexOf('case "email_capture":'), live.indexOf('case "group":'))
    check("the live page draws every layout through the one view, no image needed", /<EmailSignupView/.test(email) && /layout=\{layout\}/.test(email) && !/isPro && showThumbnail/.test(email) && /const layout = emailSignupLayout\(data\.layout_type\)/.test(email))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    /* Changed on purpose (round AN): the layouts in the shared pickers' look (a link's, an app's): two across on a phone, four on a computer, each picture in a 4:3 frame with the editor's ChoiceMark. */
    check("the editor's picker: two across on a phone and four wider, a radio for each, drawn small, and the choice is saved", /role="radiogroup"[^\n]*grid grid-cols-2 gap-2\.5 sm:grid-cols-4[^\n]*data-email-layouts/.test(tab) && /role="radio"/.test(tab) && /<EmailLayoutThumb layout=\{option\.id\}/.test(tab) && /updateData\(\{ layout_type: option\.id as EmailCaptureLayoutType[ ,}]/.test(tab)) /* round 43: Connect's words ride along */
    check("its old big 4:3 cards are gone", !/aspect-\[4\/3\][\s\S]{0,400}Classic centered form/.test(tab))
    check("a finger gets a light tap on a change, and no hover fires on touch", /hapticTap\("soft"\)\s*updateData\(\{ layout_type/.test(tab) && /* Changed on purpose (round AN): Tailwind 4's hover: is already behind (hover: hover), as the shared pickers use it. */ /data-email-layout-option=\{option\.id\}[\s\S]{0,1200}hover:border-\[#c9cbd1\]/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Groups: what goes in, one edit in and out, and what is drawn")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /* Changed on purpose (round 41): a group holds every block but the header, another group and the social icons ("show me ... the rest of the blocks from the whole picker"). */
    check("every block but the header, a group and the social icons goes in a group", /* Changed on purpose (round AL): the app block (lib/onepage/app-blocks) goes in a group too, 26. */ GROUP_CHILD_TYPES.length === 26 && canGoInGroup("app") && canGoInGroup("form_quiz") && canGoInGroup("product") && canGoInGroup("email_capture") && !canGoInGroup("group") && !canGoInGroup("header") && !canGoInGroup("social_row"))
    const page = [b("h", "header"), b("g", "group", { layout: "stack", children: [] }), b("a", "link_button", { url: "https://a.co" }), b("p", "product", { product_id: "p1" }), b("e", "email_capture")]
    const one = moveIntoGroup(page, "a", "g")!
    check("in: off the page and at the end of the group, in one list", one.map((x) => x.id).join() === "h,g,p,e" && kids(one, "g") === "a" && one.every((x, i) => x.sort_order === i))
    const two = moveIntoGroup(one, "p", "g")!
    check("a product goes in", kids(two, "g") === "a,p")
    /* Changed on purpose (round 41): an email signup goes in now; a header, a group into itself, or a block already in it does not. */
    check("a header, a group into itself, or a block already in it does not", moveIntoGroup(two, "h", "g") === null && moveIntoGroup(two, "g", "g") === null && moveIntoGroup([...two, b("a", "link_button")], "a", "g") === null)
    const out = moveOutOfGroup(two, "g", "a")!
    check("out: right under the group, gone from it, in one list", out.map((x) => x.id).join() === "h,g,a,e" && kids(out, "g") === "p")
    check("the page it was given is not changed (no edit in place)", kids(two, "g") === "a,p" && two.map((x) => x.id).join() === "h,g,e")
    check("a block is found where it is, on the page or in its group", findBlockDeep(two, "p")?.groupId === "g" && findBlockDeep(two, "e")?.groupId === null && findBlockDeep(two, "zz") === null)
    const plan = updatePlanDeep(two, "a", { data: { url: "https://b.co", image_url: "x.png" } as never })
    check("an edit to a block in a group is an edit to its group (the image library and thumbnail reach it)", plan?.id === "g" && ((plan!.updates.data as GroupBlockData).children.find((c) => c.id === "a")?.data as { url: string }).url === "https://b.co")

    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the editor drops into a group in one edit, and only what may go in", /const next = moveIntoGroup\(blocksInOrder\(\), id, groupId\)\s*if \(next\) reorderBlocks\(next\)/.test(tab) && /target\?\.type === "group" && !!moving && canGoInGroup\(moving\.type\)/.test(tab) && !/updateBlock\(groupId, \{ data: \{ \.\.\.groupData, children: \[\.\.\.children/.test(tab))
    check("and moves out in one edit, not two (one Undo left it in both places)", /const next = moveOutOfGroup\(blocksInOrder\(\), groupId, childBlock\.id\)/.test(tab) && !/newBlocks\.forEach\(\(b, i\) => \{\s*b\.sort_order = i/.test(tab))
    check("the Add sheet lets in what the drop does, and says so", /if \(!canGoInGroup\(type\)\) \{/.test(tab) && /* Changed on purpose (round 41): the note says what the sheet now offers. */ tab.includes('tt("Move a block from your page, or add a new one.")') && /inGroup \? PICKER_ENTRIES\.filter\(\(e\) => canGoInGroup\(e\.type\)\)/.test(read("components/onepage/add-block-picker.tsx")))
    /* Changed on purpose (OnePage production audit, B1): the block is read from the page as it is at the moment of the write. */
    check("pictures picked for a block in a group reach it", /findBlockDeep\(getLatestOnePage\(\)\?\.draft_blocks \?\? \[\], imageBlockId\)\?\.block/.test(tab) && /updateBlockDeep\(imageBlockId, /.test(tab) && /updateBlockDeep\(thumbnailBlockId, /.test(tab) && !/updateBlock\(imageBlockId, /.test(tab))
    /* Changed on purpose (round 41): the moves are the block foot's pair (components/onepage/block-remove), as on any block. */
    /* Changed on purpose (round AO): the moves are the child row's more menu (BlockRowMenu). */
    check("a block in a group moves up and down by tap too (a finger has no drag there)", /onMoveUp=\{\(\) => moveChild\(child\.id, -1\)\}/.test(tab) && /onMoveDown=\{\(\) => moveChild\(child\.id, 1\)\}/.test(tab) && /const moveChild = \(childId: string, dir: -1 \| 1\)/.test(tab))
    check("its show switch says what it is", /role="switch"\s*aria-checked=\{!!child\.enabled\}\s*aria-label=\{tt\("Show on page"\)\}/.test(tab))
    check("the group's row says Stack or Carousel in the creator's language", !/layout: data\.layout \}\)/.test(tab))

    const live = read("components/onepage/public-onepage.tsx")
    check("stacked and sliding read a group's blocks by the page's one rule", (live.match(/groupChildrenShown\(data\.children, /g) ?? []).length === 2 && !/data\.children\.filter\(c => c\.enabled\)/.test(live) && /const groupChildrenShown = \(children: OnePageBlock\[\] \| undefined, inPreview: boolean\): OnePageBlock\[\] =>\s*\(children \|\| \[\]\)\.filter\(\(c\) => isBlockVisible\(c\) \|\| \(inPreview && isIncompleteLink\(c\)\)\)/.test(live))
    check("a link in a group waiting for its address is its placeholder in the preview", (live.match(/isIncompleteLink\(child\) \? \(\s*<IncompleteLinkPlaceholder/g) ?? []).length === 3) /* Changed on purpose (round AK): a third, a collection's Grid layout. */
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The Products tab: the page's products first, five more, no scroll of its own")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const products = Array.from({ length: 23 }, (_, i) => ({ id: `p${i}`, title: i === 7 ? "Pants Down" : `Pack ${i}` }))
    const on = productIdsOnPage([b("x", "product", { product_id: "p3" }), b("g", "group", { children: [b("y", "product", { product_id: "p9" })] }), b("z", "product", { product_id: null })])
    check("the products on the page, inside a group too", [...on].sort().join() === "p3,p9")
    const first = productsTabView(products, on, "", false)
    check("by default: the two on the page, then five others, eighteen behind Show all", PRODUCTS_PREVIEW === 5 && first.onPage.map((p) => p.id).join() === "p3,p9" && first.others.length === 5 && first.hidden === 16 && !first.others.some((p) => on.has(p.id)))
    const all = productsTabView(products, on, "", true)
    check("Show all: every other one", all.others.length === 21 && all.hidden === 0)
    const found = productsTabView(products, on, "  pants ", false)
    check("a search looks through all of them, in one list", found.searching && found.matches.map((p) => p.id).join() === "p7")

    const tab = read("components/onepage/tabs/products-tab.tsx")
    check("no box of its own scrolls (the fat bar, and a finger caught in it)", !/max-h-\[560px\]/.test(tab) && !/overflow-y-auto overscroll-contain" data-products-list/.test(tab) && /<div data-products-list="">/.test(tab))
    /* Changed on purpose (round 40, "show only four by default, then a Show all"): one list of four, the page's first, the rest in a Reveal (tests/onepage-editor-r40.test.ts). */
    check("it draws the page's ones, the few others and Show all", /data-products-first=""/.test(tab) && /data-products-rest=""/.test(tab) && /data-products-more=/.test(tab) && /productsTabList\(products, addedProductIds, searchQuery\)/.test(tab))
    check("the empty state is the words and one button, as the app's Products page has it", /data-products-empty=""[\s\S]{0,200}<h3 className="text-\[15px\] font-semibold/.test(tab) && !/ShoppingBag/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Settings: integrations, the email tools signups go to, the page's own domain")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const settings = read("components/onepage/tabs/settings-tab.tsx")
    const mod = read("components/onepage/settings-integrations.tsx")
    check("an Integrations section, made by settings-integrations", /\{ id: "integrations", get label\(\) \{ return tt\("Integrations"\) \} \}/.test(settings) && /integrations: card\("integrations", <OnePageIntegrations \/>\)/.test(settings))
    check("it reads what Storelib keeps: the tags, the email tools, the domain", /useJson<\{ tracking\?: Tracking \}>\("\/api\/store\/integrations"\)/.test(mod) && /"\/api\/store\/integrations\/marketing"/.test(mod) && /* Changed on purpose (round 41 team): a team member is told the store's domain with the page instead */
/useJson<DomainsAnswer>\(team \? null : "\/api\/domains"\)/.test(mod))
    check("and only reads them: nothing here writes a setting", !/method: "(PUT|POST|PATCH|DELETE)"/.test(mod))
    check("each row opens that integration's own page, with its own logo", /href=\{`\/app\/integrations\?integration=\$\{i\.id\}`\}/.test(mod) && /logo=\{i\.logo\}/.test(mod))
    check("the tags it lists are the ones the live page loads", /<StoreTracking creatorId=\{resolvedCreatorId\} \/>/.test(read("app/(storelib)/(marketing)/l/[slug]/page.tsx")))
    check("Subscribe says where signups go; Basic info has the page's own domain", /\{kind === "subscribe" \? <SignupDestination \/> : null\}/.test(settings) && /<OnePageDomainRow \/>/.test(settings))
    check("none of it is a call the live page makes (storelib.me answers guests only)", !ONEPAGE_HOST_API.some((a) => a.path.test("/api/store/integrations") || a.path.test("/api/domains")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
