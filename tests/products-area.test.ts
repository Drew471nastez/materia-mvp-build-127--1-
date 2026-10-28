/**
 * ===========================================================================
 *  THE PRODUCTS AREA: THE EDITOR'S FIRST FRAME, AND THE RULES FOR A CODE
 * ===========================================================================
 * 1. The product editor opens from rows the server read. The pure function
 *    that turns them into the form (app/app/products/new/editor-form.ts) is
 *    pinned here, and so is the absence of the old client-side load.
 * 2. A coupon is checked on the server by readCouponInput and placed in a
 *    view by couponState (lib/checkout/coupons.ts). Both are pure.
 * 3. The shape of the pages: the Products list as a shelf of pictures in
 *    one white card on a phone (Download beside the violet New product in
 *    the bar; the card's toolbar as its first row: the view, a search, Sort,
 *    each of the two a sheet of its own; then 64px rows with a 50px picture
 *    and Preview beside the more button) beside a light table from 768px
 *    under the same toolbar, whose two picks are dropdowns there, 7% and
 *    then 3% bigger from 1024px, one bar at the top of the editor and none
 *    at its foot, and SQL that pastes.
 *    scripts/check-products-page.mjs measures the list and
 *    scripts/check-products-sheets.mjs the phone's two sheets.
 */
import { readFileSync, existsSync } from "node:fs"
import { initialForm, snapshotOf, snapshotOfForm, DEFAULT_FAQS, DEFAULT_WHATS_INCLUDED, type LoadedProduct } from "@/app/app/products/new/editor-form"
import { couponState, readCouponInput, CODE_PATTERN } from "@/lib/checkout/coupons"
import { archiveProduct, isArchivedProduct, restoreProduct } from "@/lib/products/archive"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

console.log("\nThe editor's first frame is the saved product")

const empty = initialForm(null)
check("a new product starts empty, with the default inclusions and questions", empty.productId === null && empty.title === "" && empty.whatsIncluded === DEFAULT_WHATS_INCLUDED && empty.faqs === DEFAULT_FAQS && empty.showSalesBadge === true)

const loaded: LoadedProduct = {
  product: {
    id: "p1",
    creator_id: "c1",
    title: "Presets",
    description: "<p>Forty</p>",
    price_cents: 2900,
    compare_at_cents: 3900,
    slug: "presets",
    type: "digital",
    status: "published",
    show_sales_badge: false,
    seo_description: "Saved by hand",
    video_url: "https://youtu.be/abcdefghijk",
    thumbnail_url: "https://x/a.jpg",
    gallery_urls: ["https://x/a.jpg", "https://x/b.jpg", "https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg"],
    whats_included: ["One", "Two"],
    faqs: [{ question: "Q", answer: "A" }],
    category: "Photography",
  },
  assets: [{ id: "f1", file_name: "a.zip", file_path: "c1/a.zip", file_size: 10, mime_type: null }],
  variants: [
    { id: "v2", name: "Pro", price_cents: 4900, position: 1, product_variant_files: [{ digital_asset_id: "f1" }] },
    { id: "v1", name: "Basic", price_cents: 2900, position: 0, product_variant_files: null },
    { id: "v1", name: "Basic", price_cents: 2900, position: 0, product_variant_files: null },
  ],
}
const form = initialForm(loaded)
check("prices are dollars in the fields", form.price === "29" && form.compareAtPrice === "39")
check("the video first, then each picture once, and no YouTube cover as a picture", form.mediaItems.map((m) => m.type + ":" + m.url).join(",") === "youtube:https://youtu.be/abcdefghijk,image:https://x/a.jpg,image:https://x/b.jpg", form.mediaItems)
check("each variant once, in position order, with its files", form.variants.map((v) => v.id).join(",") === "v1,v2" && form.variants[1].assignedFiles[0] === "f1" && form.variants[0].price === "29")
check("files, inclusions and questions come from the rows", form.digitalFiles.length === 1 && form.whatsIncluded.join() === "One,Two" && form.faqs[0].question === "Q" && form.faqs[0].isDefault === false)
check("a saved SEO description is the creator's and is not rewritten", form.seoEdited === true)
check("status and switches come from the row", form.isPublished === true && form.showSalesBadge === false)
check("a product without inclusions or questions gets the defaults", initialForm({ ...loaded, product: { ...loaded.product, whats_included: null, faqs: null } }).faqs === DEFAULT_FAQS)

const fields = { ...form, limitSalesEnabled: false, salesLimit: "" }
check("a form as it opens is not unsaved", snapshotOfForm(form) === snapshotOf(fields))
check("changing only the compare at price is a change (Save used to stay grey)", snapshotOf({ ...fields, compareAtPrice: "49" }) !== snapshotOfForm(form))
check("and undoing it is not", snapshotOf({ ...fields, compareAtPrice: "39" }) === snapshotOfForm(form))

console.log("\nThe editor no longer loads itself")

const editor = code("app/app/products/new/product-editor.tsx")
/* The one place the /app gutter and card padding are written (app/globals.css). */
const css = read("app/globals.css")
check("it reads no search parameter to find its product", !/useSearchParams/.test(editor))
check("it fetches no creator and no product on mount", !/\.from\("creators"\)/.test(editor) && !/\.from\("products"\)\s*\.select\("\*"\)/.test(editor) && !/\.from\("product_variants"\)\s*\.select\(`/.test(editor))
check("it is not held back behind a timer", !/setIsPageReady|isPageReady/.test(editor) && !/setTimeout\(forceScrollTop/.test(editor))
/* Changed on purpose: a new product starts as the kind the question before it picked (app/app/products/new/kind-chooser), so the form takes that too. */
check("its fields start from the server's rows", /useState\(\(\) => initialForm\(loaded, startAs\)\)/.test(editor))
const idPage = code("app/app/products/[id]/page.tsx")
check("/app/products/<id> draws the editor with the product, not a redirect", /loadProductEditor\(id\)/.test(idPage) && /<ProductEditor/.test(idPage) && !/new\?edit=/.test(idPage))
const loader = code("app/app/products/load-editor.ts")
/* The creator and profile rows through the request's own copies, which the /app layout shares on a full load; the product by its named columns, not `*`, with `*` only when a column is refused. */
check("the server reads the five things together", /Promise\.all\(\[/.test(loader) && /product_variants/.test(loader) && /digital_assets/.test(loader) && /creatorForRequest\(user\.id\),\s*profileForRequest\(user\.id\)/.test(loader)
  && /\.from\("products"\)\.select\(PRODUCT_COLUMNS\)/.test(loader) && /missingColumn\(productRes\.error\) \? supabase\.from\("products"\)\.select\("\*"\)/.test(loader))
check("variants that could not be read are not taken as all removed", /variantsUnread: !!variantsRead\.error/.test(loader) && /keepUnlisted: variantsUnread\.current/.test(editor))
check("and only hands over a product that is the creator's", /product\.creator_id !== creator\.id/.test(loader))
/* No loading.tsx under /app, and no outline for the editor: "the whole page should not have a loading
   skeleton when I click to edit a product". The page you were on stays until the editor is ready. */
check("opening a product draws no outline, no spinner and no loading boundary: the old page stays until the editor is here",
  !existsSync("app/app/products/[id]/loading.tsx") && !existsSync("app/app/products/new/loading.tsx")
    && !existsSync("components/app/route-skeletons.tsx")
    && read("lib/ui/app-navigation.ts").includes('if (/^\\/app\\/products\\/[^/]+(\\/|$)/.test(path)) return false'))
check("a save drops the router's kept pages", /router\.refresh\(\)/.test(editor))
/* Opening a product from the list shows the editor with its data, and nothing before it from app/app/products. */
const newPage = code("app/app/products/new/page.tsx")
check("no page or loading boundary under app/app/products draws an outline of the editor",
  !existsSync("app/app/products/loading.tsx") && !existsSync("app/app/products/new/loading.tsx") && !existsSync("app/app/products/[id]/loading.tsx") &&
  !/EditorSkeleton|editor-skeleton/.test(idPage + newPage) &&
  /if \(load\.state === "signed-out"\) return null/.test(idPage) && /if \(load\.state === "signed-out"\) return null/.test(newPage))
/* "Opening a product or New product from the list should load faster." The prefetch moved into list-return (warmEditor), still in full, and starts sooner: at a 50ms rest, a press going down or focus, and for New product and the first three rows once the list is idle. */
{
  const listSrc = code("app/app/products/products-client.tsx")
  const ret = code("app/app/products/list-return.ts")
  check("and the list still prefetches the editor, data and all, when a row is hovered, touched, pressed or focused",
    /warmEditor\(router, `\/app\/products\/\$\{id\}`\)/.test(listSrc) && /export function warmEditor\(router: Router, href: string\) \{\s*prefetchAppPage\(router, href\)/.test(ret)
      && /router\.prefetch\(href, \{ kind: "full" \} as never\)/.test(read("lib/ui/app-navigation.ts"))
      && (listSrc.match(/onPointerDown=\{\(\) => api\.current\?\.warm\(product\.id\)\}\s*onFocus=\{\(\) => api\.current\?\.warm\(product\.id\)\}/g) ?? []).length === 2
      && /resting\.current = setTimeout\(\(\) => warm\(id\), WARM_REST_MS\)/.test(listSrc) && /const WARM_REST_MS = 50/.test(listSrc))
  check("and New product and the first three rows are fetched ahead once the list is idle, one after another on a fresh session, not in one burst",
    /const WARM_AHEAD = 3/.test(listSrc) && /whenIdle\(\(\) => \{\s*stop = warmInTurn\(\[warmNew, \.\.\.firstShown\.current\.map\(\(id\) => \(\) => warm\(id\)\)\], \(\) => createClient\(\)\.auth\.getSession\(\)\)/.test(listSrc)
      /* Changed on purpose: New product asks what is being sold first, so what is fetched ahead is the two editors it can open (kind-chooser warmKinds). */
      && /newProduct\.warm\(\)/.test(listSrc) && /prefetchAppPage\(router, editorHref\("digital"\)\)\s*prefetchAppPage\(router, editorHref\("course"\)\)/.test(code("app/app/products/new/kind-chooser.tsx")) && /requestIdleCallback\(task, \{ timeout \}\)/.test(ret)
      && /fresh\(\)\.then\(start, start\)/.test(ret) && /timer = setTimeout\(\(\) => next\(i \+ 1\), WARM_GAP_MS\)/.test(ret))
  check("and a product fetched ahead is asked for again after a minute, so a list left open or refreshed still opens warm",
    /const WARM_AGAIN_MS = 60_000/.test(listSrc) && /Date\.now\(\) - at < WARM_AGAIN_MS/.test(listSrc) && !/warmed\.current\.has\(/.test(listSrc))
}

/* "Sometimes it loads for 5 seconds, then the page appears with a delay, very abruptly." */
{
  const load = code("app/app/products/load-editor.ts")
  check("the editor's product reads start beside the auth check, not after it",
    load.indexOf("const productReads = Promise.all(") > -1 && load.indexOf("const productReads = Promise.all(") < load.indexOf("await currentUserForRequest()")
      && /await Promise\.all\(\[\s*creatorForRequest\(user\.id\),\s*profileForRequest\(user\.id\),\s*productReads,\s*\]\)/.test(load))
  check("and a slow load says where its time went", /console\.warn\(`\[editor-load\] \$\{Math\.round\(took\)\}ms: auth/.test(load) && /const SLOW_LOAD_MS = 800/.test(load))
  const layer = code("components/app/page-layer.tsx")
  check("where the layer rises by hand, a slow editor still rises when it lands instead of appearing in one frame",
    /getAppNavigation\(\) !== null && Date\.now\(\) - pressedAt \+ STILL_CAP_MS <= STILL_WAIT_MAX_MS/.test(layer) && /const STILL_WAIT_MAX_MS = 8000/.test(layer))
}

console.log("\nNo section tabs; one bar at the top below lg")

/* "On desktop or on mobile, in products/new or edit, there should not be the About / Media / Content / Settings / SEO." */
check("no row of section tabs on any width, and no scroll spy behind one",
  !/role="tablist"|role="tab"|aria-label="Sections"|PILL_SECTIONS|getPillForSection|activeSection|pillScrollRef|pillRefs|completedSections/.test(editor))
check("a failed check still brings its card into view, the files check its own card", /const scrollToSection = \(sectionId: SectionId\)/.test(editor) && /showToast\("Upload a file"\)[\s\S]{0,160}scrollToSection\("files"\)/.test(editor) && /sectionRefs\.current\.files = el/.test(editor))
check("no fixed Save and Cancel strip over a phone's foot", !/fixed bottom-0 left-0 right-0/.test(editor) && !/Bottom Action Bar/.test(read("app/app/products/new/product-editor.tsx")))
check("the top bar is sticky at the top below lg and holds Cancel (or Back) and Save", /data-editor-bar=""/.test(editor) && /"sticky top-0 z-30 [^"]* lg:hidden"/.test(editor) && /<SaveButton phase=\{savePhase\}/.test(editor) && /<LeaveButton mode=\{leaveMode\} disabled=\{saveBusy\} leaving=\{leaving\} asks=\{hasUnsavedChanges\} onLeave=\{\(\) => void handleCancel\(\)\} \/>/.test(editor))
check("Cmd or Ctrl and S saves", /e\.metaKey \|\| e\.ctrlKey/.test(editor) && /key\.toLowerCase\(\) !== "s"/.test(editor))
const barSource = editor.slice(editor.indexOf('data-editor-bar=""'), editor.indexOf('data-editor-page=""'))
check("the bar names no product: the name is in the title field", barSource.length > 0 && !/savedTitle|\{title\}|"Untitled product"/.test(barSource) && /<h1 className="sr-only">\{productId \? "Edit product" : productType === "course" \? "New course" : "New product"\}<\/h1>/.test(barSource))
/* "Get rid of the Unsaved and the Live badge or New product thing in the bar." (the top bar; the desktop foot bar says it, below) */
check("nothing is written in the middle of the top bar: no Unsaved changes, Saved, Live, Draft or New product", !/data-editor-state|saveState|statusBadge/.test(barSource) && !/Unsaved changes|"Live"|"Draft"/.test(barSource) && !/grid-cols-\[1fr_auto_1fr\]/.test(barSource))
check("a screen reader still hears Saving and Saved, from a hidden polite line outside both bars, so it is there at every width",
  /<p data-editor-announce="" className="sr-only" aria-live="polite"/.test(editor) && /savePhase === "saving" \? "Saving" : savePhase === "saved" \? "Saved"/.test(editor)
    && editor.indexOf("data-editor-announce") < editor.indexOf('data-editor-bar=""'))
check("Cancel at the start, the more button and Save at the end", /flex h-14 max-w-\[760px\] items-center justify-between/.test(barSource) && barSource.indexOf("handleCancel") < barSource.indexOf("{moreMenu}") && barSource.indexOf("{moreMenu}") < barSource.indexOf("<SaveButton"))
check("whether the product is live or a draft heads the more menu", /const moreMenu = productId \? \(/.test(editor) && /section: isPublished \? liveLine : "Draft, hidden from your page"/.test(editor))
/* Changed on purpose (round AB): a physical product is live on the store's website, so it says "your store". */
check("  and a live paid product says when checkout cannot take money yet", /const liveLine = creator\.payments_ready === false && sellsForMoney \? "Live\. Checkout opens once payments are set up" : productType === "physical" \? "Live on your store" : "Live on your page"/.test(editor))
/*
  The question moved into one callback, and it is asked through a door more
  than Cancel: the nav pill is one tap from anywhere in this page and used to
  walk out of it with the edits (lib/ui/leave-guard, tests/app-mobile-nav).
  So: one question, in one place, asked by Cancel and left here for the pill.
*/
check("the unsaved tracking still drives the leave question, and every door out asks the same one",
  /* Changed on purpose: a Settings link from the editor asks Save and go, Don't save, or Stay itself, and the leave guard doesn't ask again (answeredRef). */
  /const askToDiscard = useCallback\(async \(\): Promise<boolean> => \{\s*if \(!hasUnsavedChanges \|\| answeredRef\.current\) return true/.test(editor)
    && /title: "Discard changes\?"/.test(editor) && /confirm: "Discard", cancel: "Keep editing"/.test(editor)
    && /if \(hasUnsavedChanges && !\(await askToDiscard\(\)\)\) return/.test(editor)
    && /useEffect\(\(\) => askBeforeLeaving\(askToDiscard\), \[askToDiscard\]\)/.test(editor)
    && (editor.match(/title: "Discard changes\?"/g) ?? []).length === 1)

/* "On desktop large screens ... too narrow ... the Save and Cancel ... better to be at the bottom ... match the Storelib UI more." */
console.log("\nFrom lg: a page header, two columns, and Save at the foot")
const headSource = editor.slice(editor.indexOf('data-editor-head=""'), editor.indexOf("</header>"))
check("the page container is the /app one: app-gutter (10px on a phone, 32px from lg — app/globals.css --app-gutter), 1200px from lg",
  /data-editor-page="" className="mx-auto w-full max-w-\[760px\] app-gutter [^"]*lg:max-w-\[1200px\]/.test(editor)
    && /--app-gutter: 11px/.test(css) && /--app-gutter: 32px/.test(css))
check("a page header from lg only: back to Products (which asks first), the name, the status badge, the more menu",
  /className="mb-5 hidden min-h-9 items-center gap-2 lg:flex"/.test(headSource) && /aria-label="Back to products"/.test(headSource) && /onClick=\{\(\) => void handleCancel\(\)\}/.test(headSource)
    && /text-\[24px\] font-bold leading-9 text-\[#1a1a2e\] sm:text-\[28px\]/.test(headSource) && /productId \? savedTitle\.trim\(\) \|\| "Untitled" : productType === "course" \? "New course" : "New product"/.test(headSource)
    && /\{statusBadge\}/.test(headSource) && /\{moreMenu\}/.test(headSource))
const mainAt = editor.indexOf('data-editor-main=""')
const sideAt = editor.indexOf('data-editor-side=""')
const at = (s: string) => editor.indexOf(s)
check("two columns from lg, the main one two thirds", /lg:grid lg:grid-cols-\[minmax\(0,2fr\)_minmax\(272px,1fr\)\] lg:items-start/.test(editor) && mainAt > 0 && sideAt > mainAt)
/* Changed on purpose: the owner moved the category into the main column, a field above the description, "at every width". */
check("the product itself in the main column: title, pictures, category, description, included, files, variants, pricing, questions",
  [at("sectionRefs.current.about = el"), at("sectionRefs.current.media = el"), at("sectionRefs.current.content = el"), at("sectionRefs.current.category = el"), at("<RichTextEditor"), Math.max(at("What's Included</h2>"), at("What&apos;s Included</h2>")), at('{productType === "course" ? null : filesCard}'), at("sectionRefs.current.variants = el"), at(">Pricing</h2>"), at(">FAQ</h2>")]
    .every((i, n, all) => i > mainAt && i < sideAt && (n === 0 || i > all[n - 1])))
/* "Course -> product editor in course mode with the Lessons card first": a course's lessons sit right under its title, before the pictures. */
check("a course's Lessons card comes first, right under the title; a digital product's files keep their place",
  at("sectionRefs.current.about = el") < at('{productType === "course" ? filesCard : null}') && at('{productType === "course" ? filesCard : null}') < at("sectionRefs.current.media = el")
    && at("sectionRefs.current.files = el") > 0 && at("sectionRefs.current.files = el") < mainAt && /const filesCard = \(/.test(editor))
check("how it is shown and found beside it: status (lg only), settings, search",
  [at('data-editor-status=""'), at(">Settings</h2>"), at(">Search engine listing</h2>")].every((i, n, all) => i > sideAt && (n === 0 || i > all[n - 1]))
    && /data-editor-status="" className=\{cn\(CARD, "hidden lg:block"\)\}/.test(editor))
/* Changed on purpose: one card fewer (Category is a field in Content now), so ten. */
check("every card is the /app card — sideways padding from --app-card-x (12px on a phone, 24px from sm), py-4 sm:py-6 up and down — spaced by its column rather than a margin of its own",
  /const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-\[#e5e7eb\]\/60 bg-white app-card-x py-4 shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\] sm:space-y-5 sm:py-6"/.test(editor)
    && /--app-card-x: 12px/.test(css) && /--app-card-x: 24px/.test(css)
    && (editor.match(/className=\{CARD\}/g) ?? []).length >= 10 && !/mb-3 scroll-mt-4/.test(editor))
const footSource = editor.slice(editor.indexOf('data-editor-foot=""'), editor.indexOf("{/* CTA Bottom Sheet */}"))
check("the foot bar from lg: sticky at the bottom of the pane that scrolls, white, a hairline and a soft shadow upward, over the home indicator's inset",
  /className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-\[#e5e7eb\] bg-white pb-\[env\(safe-area-inset-bottom\)\] shadow-\[0_-4px_16px_-8px_rgba\(17,24,39,0\.10\)\] lg:block"/.test(footSource)
    && /page-scroll h-full overflow-y-auto [^"]* lg:flex lg:flex-col/.test(editor) && !/fixed/.test(footSource))
check("the state in words on its left, Cancel and Save on its right, the same buttons as the top bar",
  /data-editor-state=\{saveState\}/.test(footSource) && footSource.indexOf("<LeaveButton mode={leaveMode} disabled={saveBusy}") < footSource.indexOf("<SaveButton phase={savePhase} disabled={!canSave}"))
check("the words are Saving, Unsaved changes, Not saved yet, Saved, Live and Draft",
  /const saveState = saveBusy\s*\? "Saving"\s*: hasUnsavedChanges\s*\? "Unsaved changes"\s*: !productId\s*\? "Not saved yet"\s*: savedThisVisit\s*\? "Saved"\s*: isPublished\s*\? "Live"\s*: "Draft"/.test(editor))
const layoutProbe = read("scripts/check-product-editor.mjs")
check("scripts/check-product-editor.mjs measures the columns and the foot bar at 1280, 1440 and 1920, and the top bar at 390 and 1000",
  /"desktop-1280"/.test(layoutProbe) && /"desktop-1440"/.test(layoutProbe) && /"wide-1920"/.test(layoutProbe) && /"tablet-1000"/.test(layoutProbe) && /\[data-editor-foot\]/.test(layoutProbe) && /no row of section tabs/.test(layoutProbe))

/* "Either smoothly close that page, or the Cancel button should become Back when the product is saved, and the state of the buttons should change." */
console.log("\nAfter a save the page stays: Back, and a grey Saved")
check("the first button is Back once the product is saved and nothing has changed since, Cancel otherwise", /const leaveMode = productId && !hasUnsavedChanges \? "back" : "cancel"/.test(editor))
check("a save leaves the page where it was: no scroll to the top", !/contentRef\.current\?\.scrollTo\(\{ top: 0/.test(editor))
check("while Save saves, Cancel is held", /<LeaveButton mode=\{leaveMode\} disabled=\{saveBusy\}/.test(editor))
check("a save in this visit makes the grey Save say Saved, until the next change", /setSavedThisVisit\(true\)/.test(editor) && /saved=\{savedThisVisit\}/.test(editor))
check("a new product's first save carries the check and Saved to the page at its own address", /carriedSavedAt = savedAt/.test(editor) && /useState\(\(\) => carriedSavedAt !== null\)/.test(editor))
check("and opens where the form was scrolled, with no landing played over it: the same product, not a new page", /carriedScrollTop = contentRef\.current\?\.scrollTop \?\? 0\s*holdLayerLanding\(\)/.test(editor) && /if \(top && contentRef\.current\) contentRef\.current\.scrollTop = top/.test(editor)
  && /export function holdLayerLanding\(\)/.test(code("components/app/page-layer.tsx")) && /if \(html\.dataset\.layerMotion === "stay"\) \{\s*requestAnimationFrame/.test(code("components/app/page-layer.tsx")))
check("both ways out go through the list's return: the layer's move, the list's scroll, the row tinted", /returnToProducts\(router, productId\)/.test(editor) && !/router\.push\("\/app\/products"\)/.test(editor))
check("the list is fetched ahead when the editor opens and again after a save's refresh", /useEffect\(\(\) => \{\s*warmProducts\(router\)\s*\}, \[router, loaded\]\)/.test(editor))
check("Cmd or Ctrl and S still saves from anywhere", /saveShortcut\.current\(\)/.test(editor))

console.log("\nThe bar's buttons (app/app/products/new/editor-buttons.tsx)")

/* The depth is shared from components/ui/depth-button.ts; the sizes stay in the editor. */
const buttons = code("app/app/products/new/editor-buttons.tsx") + code("components/ui/depth-button.ts")
check("Cancel and more are white with a hairline and a shade at their foot, flat when pressed",
  /border border-\[#d9dbe0\] bg-white/.test(buttons) && /shadow-\[inset_0_-1px_0_rgba\(0,0,0,0\.08\),0_1px_0_rgba\(0,0,0,0\.05\)\]/.test(buttons) && /active:shadow-\[inset_0_1px_1px_rgba\(0,0,0,0\.1\)\]/.test(buttons))
check("the more button is square and Save's height: 40px on a phone, 32px from 640px",
  /barIconButton = cn\(quietDepth, PRESS_AREA_BORDERED, "h-10 w-10 [^"]*sm:h-8 sm:w-8/.test(buttons) && /export const quietDepth = cn\(secondaryDepth, /.test(buttons) && /"h-10 min-w-\[64px\][^"]*sm:h-8/.test(buttons))
check("Save keeps its word in the layout while busy, and is always as wide as Saved, so its width never changes",
  /<span className=\{cn\("col-start-1 row-start-1 text-center", busy && "opacity-0"\)\}>\{word\}<\/span>/.test(buttons) && (/after:content-\['Saved'\]/.test(buttons) || /className="invisible col-start-1 row-start-1">Saved<\/span>/.test(buttons) /* the widest of Save and Saved in the dashboard's language */) && /absolute inset-0 flex items-center justify-center/.test(buttons))
check("the grey Save says Saved only when it is disabled after a save", (/const word = !busy && disabled && saved \? "Saved" : "Save"/.test(buttons) || /const showsSaved = !busy && disabled && Boolean\(saved\)\s*\n\s*const word = showsSaved \? "Saved" : "Save"/.test(buttons)))
check("Save's colour and depth are one exported set (primaryDepth), near black", /export const primaryDepth = cn\(/.test(buttons) && /PRESS_AREA,\s*primaryDepth,/.test(buttons) && /export const primaryDepth = cn\([^)]*bg-\[#1a1a2e\]/.test(buttons))
/* "The New product button needs to be purple there, both on mobile and desktop." One shared violet, beside the near black primary. */
check("and the violet one New product wears is exported beside it (accentDepth): #8b5cf6, darker on hover and pressed, no hover shadow",
  /export const accentDepth = cn\([\s\S]{0,300}bg-\[#8b5cf6\][\s\S]{0,300}hover:bg-\[#7c3aed\] active:bg-\[#6d28d9\]/.test(buttons) && !/hover:shadow/.test(buttons.slice(buttons.indexOf("export const accentDepth"), buttons.indexOf("export const criticalDepth"))))
check("Cancel and Back are one button holding both words, crossfading, so the bar never moves",
  /export function LeaveButton/.test(buttons) && /data-leave-button=""/.test(buttons) && /aria-label=\{back \? "Back" : "Cancel"\}/.test(buttons) && /<ChevronLeft/.test(buttons) && /transition-opacity duration-150 motion-reduce:transition-none/.test(buttons) && /cn\(barButton, "grid", going && /.test(buttons))
/* "When I click Cancel or Back nothing happens, then five seconds later it goes back": the press is answered on its own frame. */
/* Changed on purpose: the button answers by itself on the next frame (its own state, not the whole editor drawing again, which on a slow phone took several frames), dims at once, and shows its spinner only if the list is not there LAYER_PRESS_WAIT_MS later. */
check("Cancel and Back answer the press at once: the button itself dims on the next frame, a spinner past 100ms, the loading bar told, no second press",
  /data-leaving=\{going \? "" : undefined\}/.test(buttons) && /const going = leaving \|\| pressed/.test(buttons) && /if \(!asks\) setPressed\(true\)\s*onLeave\(\)/.test(buttons) && /<ActivitySpinner size=\{16\} label=\{label\}/.test(buttons)
    && /data-answers-press=""/.test(buttons) && /export const PRESS_SPINNER_IN = "\[animation:press-spinner-in_120ms_ease-out_100ms_both\]"/.test(buttons)
    && /@keyframes press-content-out \{\s*from \{ opacity: 0\.4; \}\s*to \{ opacity: 0; \}/.test(read("app/globals.css"))
    && /leavingRef\.current = true[\s\S]{0,120}startTransition\(\(\) => setLeaving\(true\)\)\s*startNavigationLoading\(PRODUCTS_HREF\)\s*returnToProducts\(router, productId\)/.test(editor)
    && /if \(leaving \|\| leavingRef\.current\) return/.test(editor) && !/requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => resolve\(\)\)\)/.test(editor))
check("busy is aria-busy and not disabled, and a press while busy does nothing", /aria-busy=\{phase === "saving" \|\| undefined\}/.test(buttons) && /disabled=\{!busy && disabled\}/.test(buttons) && /if \(!busy\) onSave\(\)/.test(buttons))
check("a check for SAVED_CHECK_MS after a save", /export const SAVED_CHECK_MS = 900/.test(buttons) && /data-save-check=""/.test(buttons) && /setTimeout\(\(\) => setSavedFlash\(false\), SAVED_CHECK_MS\)/.test(editor))
check("disabled is Polaris grey with no depth", /disabled:bg-\[#ebebef\] disabled:text-\[#a1a1aa\] disabled:shadow-none/.test(buttons))
check("one save at a time: a ref guards it, not only the state", /if \(isLoading \|\| saveInFlight\.current\) return false/.test(editor) && /saveInFlight\.current = true/.test(editor) && /finally \{[\s\S]{0,120}saveInFlight\.current = false/.test(editor))

console.log("\nEvery question the editor asks (app/app/products/new/confirm-sheet.tsx)")

const confirmSheet = code("app/app/products/new/confirm-sheet.tsx")
check("on a phone it is the shared bottom sheet", /import \{ BottomSheet \} from "@\/components\/ui\/bottom-sheet"/.test(confirmSheet) && /<BottomSheet\s/.test(confirmSheet) && /data-surface="sheet"/.test(confirmSheet))
check("from 640px a compact modal in the middle", /AlertDialogPrimitive\.Content/.test(confirmSheet) && /data-surface="modal"/.test(confirmSheet) && /max-w-\[420px\]/.test(confirmSheet))
check("two buttons: the safe one with the bar's depth, the one that does it near black, never red", /cn\(secondaryDepth, "h-12/.test(confirmSheet) && /destructiveDepth/.test(confirmSheet) && /bg-\[#1a1a2e\]/.test(confirmSheet) && !/criticalDepth|#c4290c/.test(confirmSheet))
check("the old forced dialog sheet and its swipe code are gone from the editor", !/showExitDialog|handleSaveAndExit|"unsaved"/.test(editor) && /\{confirmSheet\}/.test(editor))
check("no window.confirm left in the editor: deleting a file asks in the sheet, and a big upload asks nothing (the owner: no confirmation steps)", !/\bconfirm\(`/.test(editor) && !/title: "Upload this much\?"/.test(editor) && /title: "Delete this file\?"/.test(editor))

console.log("\nHold to drag: one set of sensors (app/app/products/new/hold-to-drag.ts)")

const hold = code("app/app/products/new/hold-to-drag.ts")
check("a mouse and a held finger, not PointerSensor, which took every touch after 12px with no hold",
  /useSensor\(MouseSensor, \{ activationConstraint: \{ distance: MOUSE_DISTANCE_PX \} \}\)/.test(hold) && /useSensor\(TouchSensor, \{ activationConstraint: \{ delay: HOLD_MS, tolerance: HOLD_TOLERANCE_PX \} \}\)/.test(hold) && !/PointerSensor/.test(hold))
check("the hold is 300ms within 8px", /export const HOLD_MS = 300/.test(hold) && /export const HOLD_TOLERANCE_PX = 8/.test(hold))
check("and the keyboard", /useSensor\(KeyboardSensor, \{ coordinateGetter: sortableKeyboardCoordinates \}\)/.test(hold))
check("a handle lets a swipe scroll the page (touch-action: manipulation), and a hold opens no callout", /HANDLE_TOUCH = "cursor-grab select-none touch-manipulation \[-webkit-touch-callout:none\]/.test(hold))
check("a tick when a finger lifts, through the app's haptic", /hapticTap\("soft"\)/.test(hold) && /event instanceof TouchEvent/.test(hold))
check("the pane scrolls near its edges, gently", /AUTO_SCROLL = \{ threshold: \{ x: 0, y: 0\.15 \}, acceleration: 6 \}/.test(hold))

console.log("\nThe questions (app/app/products/new/faq-list.tsx)")

const faq = code("app/app/products/new/faq-list.tsx")
check("they use the shared sensors, handle and autoscroll", /const sensors = useHoldToDragSensors\(\)/.test(faq) && /HANDLE_TOUCH,/.test(faq) && /autoScroll=\{AUTO_SCROLL\}/.test(faq) && !/PointerSensor|touch-none/.test(faq))
check("the keyboard moves a question too, in words", /onDragStart: \(\{ active \}\) => `Picked up question/.test(faq))
check("the held card follows the finger with no transition of its own; it lifts on an inner layer", /transition: isDragging \? undefined : transition/.test(faq) && /scale-\[1\.02\]/.test(faq) && /transition-\[scale,box-shadow,border-color\]/.test(faq))
check("only a drop commits; a cancel changes nothing", /onDragCancel=\{\(\) => setActiveId\(null\)\}/.test(faq) && /arrayMove\(prev, from, to\)/.test(faq))
check("the editor draws the list from the form's own faqs", /<FaqList faqs=\{faqs\} onChange=\{setFaqs\} \/>/.test(editor) && !/SortableFAQItem|faqSensors/.test(editor))

console.log("\nThe photos and videos (app/app/products/new/media-grid.tsx)")

const media = code("app/app/products/new/media-grid.tsx")
check("the same sensors, handle and autoscroll as the questions", /const sensors = useHoldToDragSensors\(\)/.test(media) && /HANDLE_TOUCH,/.test(media) && /autoScroll=\{AUTO_SCROLL\}/.test(media) && !/PointerSensor|touch-none/.test(media))
check("the held tile stays in the grid and follows by transform, both ways, with no transition of its own",
  /translate3d\(\$\{Math\.round\(transform\.x\)\}px, \$\{Math\.round\(transform\.y\)\}px, 0\)/.test(media) && /transition: isDragging \? undefined : transition/.test(media) && !/DragOverlay|opacity: isDragging \? 0/.test(media))
check("it lifts on an inner layer: 3% and a shadow", /scale-\[1\.03\]/.test(media) && /transition-\[scale,box-shadow,border-color\]/.test(media))
check("a named group, so the touch rule that strips transforms inside .group leaves the lift alone", /group\/tile/.test(media) && !/["\s]group["\s]/.test(media))
check("the remove button is its own button above the handle; the labels take no taps", /data-media-remove=""/.test(media) && /onRemove\(item\.id\)/.test(media) && (media.match(/pointer-events-none absolute/g) ?? []).length >= 3)
check("positions are read out, and position 1 is named the thumbnail", /`Picked up \$\{name\(active\.id\)\.toLowerCase\(\)\} of \$\{count\}\.`/.test(media) && (/n === 1 \? ", the thumbnail" : ""/.test(media) || /\{n, plural, (one|=1) \{, the thumbnail\} other \{\}\}/.test(media)))
check("only a drop commits; a cancel changes nothing", /onDragCancel=\{\(\) => setActiveId\(null\)\}/.test(media) && /arrayMove\(prev, from, to\)/.test(media))
check("the editor draws the grid from the form's own media; the old sensors, overlay and dead touch handlers are gone",
  /<MediaGrid items=\{mediaItems\} pending=\{pendingMedia\} onChange=\{setMediaItems\} onRemove=\{removeMedia\} shape=\{productType === "physical" \? "square" : "wide"\} \/>/.test(editor) && !/SortableMediaItem|mediaSensors|activeDragItem|<DragOverlay|handleTouchStart|touchDragIndex|longPressTimerRef/.test(editor))

console.log("\nThe editor's page")

check("on a phone, first on the screen as a layer over the app's header, it starts below the status bar; from md, under the header, it adds nothing",
  /max-md:\[\[data-page-layer\]_&\]:pt-\[env\(safe-area-inset-top\)\]/.test(barSource) && /max-md:\[\[data-page-layer\]_&\]:pb-\[calc\(32px\+env\(safe-area-inset-bottom\)\)\]/.test(editor)
    && !/(^|[\s"])\[\[data-page-layer\]_&\]/.test(barSource + editor))
/* Changed on purpose (round 41): both editor layers ask to rise and drop (`moves`). */
check("a layer on a phone only: both editor addresses ask for it, and from md it is a page in the shell",
  /<PageLayer pill inset="bar" phoneOnly moves>/.test(code("app/app/products/new/layout.tsx")) && /<PageLayer pill inset="bar" phoneOnly moves>/.test(code("app/app/products/[id]/layout.tsx")))
check("the editor scrolls as a page-scroll pane, so the pill's room is the shared --app-nav-room and nothing else", /className=\{cn\(FIELD_FOCUS, "page-scroll h-full overflow-y-auto/.test(editor) && !/pb-24 sm:pb-8/.test(editor))
check("prices bring up the decimal keypad", (editor.match(/inputMode="decimal"/g) ?? []).length >= 4)

console.log("\nThe Products list: a shelf of pictures on a phone, a light table from 768px")

const list = code("app/app/products/products-client.tsx")
/* Round 40 (the owner: "restyle the products page to match the orders/emails pages"): Orders' and Emails' parts, sizes and rows. */
check("a list under 768px inside the card and the table from it, at 13px", /<ul aria-label="Products" data-list="" className="md:hidden" hidden=\{pageProducts\.length === 0\}>/.test(list) && /className="hidden w-full table-fixed border-separate border-spacing-0 text-\[13px\] md:table"/.test(list))
check("no table forced sideways on a phone", !/min-w-\[500px\]/.test(list) && !/min-w-max/.test(list) && !/sticky left-0/.test(list))
check("a hover or a finger prefetches the editor in full", /onTouchStart=\{\(\) => api\.current\?\.warm\(product\.id\)\}/.test(list) && /warmEditor\(/.test(list) && /\bwarm,\n/.test(list))
const couponsList = code("app/app/coupons/coupons-client.tsx")
check("no Products and Coupons tabs: Coupons is a page of its own again", !existsSync("app/app/products/products-subnav.tsx") && !/ProductsSubnav|products-subnav/.test(list + couponsList))
check("with its own title", /<h1[^>]*>Coupons<\/h1>/.test(couponsList))
const sidebar = code("components/app/sidebar.tsx")
/* Reviews joined Coupons under Products on purpose (app/app/reviews, the seller's reviews list), and Memberships after them (app/app/memberships); Coupons is still the first child. */
check("and its own place in the menu, under Products, where it was", /href: "\/app\/products",[\s\S]{0,160}children: \[\s*\{ href: "\/app\/coupons", label: "Coupons" \},\s*\{ href: "\/app\/reviews", label: "Reviews" \},?\s*(\{ href: "\/app\/memberships", label: "Memberships" \},?\s*)?\]/.test(sidebar))
check("Orders' bar, gutter and 1200px column, on every width (no 7% and 3% from 1024px any more)",
  /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(list) && /from "\.\.\/orders\/order-parts"/.test(list) && /cn\("mx-auto pb-6", LIST_WIDTH, GUTTER\)/.test(list)
    && !/PAGE_WIDTH|PAGE_GUTTER|PAGE_BAR|BAR_BUTTON_SIZE/.test(list) && !/lg:h-\[|xl:h-\[|lg:text-\[/.test(list))
/* "On desktop larger screens, make the page just 7% bigger, a little bit." Then: "just make the products page 3% bigger". Real sizes, never zoom or a transform. */
check("Orders' and Emails' sizes: a 24px title (28px from 640px), the toolbar's 48px row, Emails' 36px heading and 56px rows, a 40px picture, Orders' 44px footer",
  /<h1 className="min-w-0 truncate text-\[24px\] font-bold text-\[#1a1a2e\] sm:text-\[28px\]">/.test(list)
    && /data-toolbar="" className="flex h-12 items-center gap-2 border-b border-\[#eef0f2\] px-2"/.test(list)
    && /<tr className="h-9 text-left text-\[12px\] font-medium text-\[#4b5563\]">/.test(list)
    && /className="group h-14 cursor-pointer"/.test(list) && /"h-10 w-10 rounded-\[9px\]"/.test(list)
    && /"flex h-11 items-center justify-between gap-3 border-t border-\[#eef0f2\] bg-\[#fafafb\] px-3"/.test(list)
    && !/zoom:|\[zoom|scale-\[1\.0|scale\(1\.0/.test(list))
/* "In the Products page the New product button at the top should be purple." Then it went near black with every primary (7ea799ec), and: "the New product button needs to be purple there, both on mobile and desktop." */
check("New product is the one violet button, the shared violet depth (accentDepth, not a copy), at Orders' 32px with a plus, and a 44px press on a phone, on every width",
  /const NEW_LOOK = cn\(accentDepth, "h-8 gap-1\.5 rounded-lg px-3 text-\[13px\]"\)/.test(list) && /data-new-product=""[\s\S]{0,280}className=\{cn\(NEW_LOOK, BAR_PRESS\)\}\s*>\s*<Plus className="h-4 w-4" aria-hidden \/>\s*<span>\{t\("products\.newProduct"\)\}<\/span>\s*<\/Link>/.test(list)
    && /import \{ accentDepth \} from "@\/components\/ui\/depth-button"/.test(list) && !/primaryDepth|buttonAccent|buttonPrimary/.test(list) && !/bg-\[#8b5cf6\]/.test(list)
    && /const BAR_PRESS = "relative before:absolute before:-inset-y-1\.5 before:inset-x-0 before:content-\[''\] sm:before:hidden"/.test(list))
/* "Make sure the three dots button in the products page has the same depth as the three dots button in the edit product page." */
/* "Reduce the products page's overall scale by about 10%": the more button came down with it, the depth stayed. Then Preview joined it at the same size. */
/* "The three dots button has too much depth, reduce it a little": the editor's and the list's together, so they still match. */
check("a row's more button is Orders' and Emails' (RowMenuButton), 44px on a phone, its pressed grey waiting on a touch screen",
  /const ROW_MENU = "relative z-\[1\] pointer-coarse:active:delay-\[130ms\] \[-webkit-tap-highlight-color:transparent\]"/.test(list)
    && /className=\{cn\(ROW_MENU, "h-11 w-11"\)\}/.test(list) && /className=\{ROW_MENU\}/.test(list) && !/quietDepth/.test(list))
/* Round 40: the eye and then the View word went with the restyle to Orders' rows; View is the menu's first link after Edit. */
check("a row has the more button alone, as Orders' and Emails' rows do: View is in its menu",
  /* Changed on purpose (round 41): on a phone the mark is laid over the more button, after it, so the price never moves. */
  /items=\{items\}\s*\/>\s*\{\/\*[^*]*\*\/\}\s*\{opening \? <OpeningMark over \/> : null\}\s*<\/li>/.test(list) && /\{opening \? <OpeningMark \/> : \(\s*<ResponsiveActionMenu/.test(list) && !/function Preview|data-preview|\bEye\b/.test(list))
/* A pressed row answers at once: its tint held, a spinner where View was; only that row is drawn again (a prop of the memoised row). */
check("a pressed row holds its tint with a spinner, and only that row is drawn again",
  /opening=\{opening === product\.id\}/.test(list) && (list.match(/data-opening=\{opening \? "" : undefined\}/g) ?? []).length === 2
    /* Changed on purpose (round 41): `over`, the phone's mark laid over the more button in its own 44px box. */
    && /function OpeningMark\(\{ over = false \}: \{ over\?: boolean \}\)/.test(list) && /over \? "pointer-events-none absolute right-1\.5 top-1\/2 h-11 w-11 -translate-y-1\/2 bg-\[#f4f5f7\]"/.test(list) && /openRow: open,/.test(list))
check("View, in the row's menu, opens the product's own page in a new tab, the live route for a thing that ships",
  /const url = viewUrl\(product, username\)/.test(list) && /\{ label: labels\.view, href: url, target: "_blank" as const \}/.test(list) && /view: t\("common\.view"\)/.test(list))
check("in the app View goes through openExternal to the phone's browser, and a press inside a row's controls never opens the editor",
  /const viewIn = isNativeApp\(\)\s*\? \(url: string\) => openExternal\(url\.startsWith\("\/"\) \? `\$\{getCanonicalSiteUrl\(\)\}\$\{url\}` : url\)/.test(list)
    && /\{ label: labels\.view, onClick: \(\) => api\.current\?\.viewIn\?\.\(url\) \}/.test(list)
    && /import \{ isNativeApp, openExternal \} from "@\/lib\/native-bridge"/.test(list) && /target\.closest\("a,button,input,label"\)\) return/.test(list))
check("a product with no public page (a draft, an archived one) has View off in the menu, with why",
  /const live = productStatus\(product\) === "live"/.test(list) && /\{ label: labels\.view, disabled: true, hint: "Publish to view" \}/.test(list))
/* "The download icon should be next to the New product button." */
check("Export is Orders' secondary button in the bar, the Download icon alone on a phone, before New product; neither it nor New product is in the bar of an empty shop",
  /aria-label="Export products" data-export="" className=\{cn\(buttonSecondary, BAR_PRESS, "max-sm:w-8 max-sm:px-0"\)\}>\s*<Download className="h-4 w-4" \/>\s*<span className="hidden sm:inline">Export<\/span>/.test(list)
    && /\{products\.length > 0 \? \(\s*<div className="flex shrink-0 items-center gap-2">\s*<Link href="\/app\/products\/collections" data-products-collections="" className=\{cn\(buttonSecondary, "max-md:hidden"\)\}>\s*Collections\s*<\/Link>\s*<ResponsiveActionMenu/.test(list)
    && list.indexOf('data-export=""') < list.indexOf('data-new-product=""') && list.indexOf('data-export=""') > list.indexOf("<PaneBar"))
check("nothing floats: no fixed New product over the list or the navigation pill", !/fixed[^"]*bottom-/.test(list.slice(list.indexOf("<PaneBar"), list.indexOf("deleteModalOpen && productToDelete"))))
/* "On desktop large screens, the search input is different from that row thing ... make it that way: like mobile." */
check("search is Orders': a Search button at the right of the tabs opens one boxed field with Cancel, in the toolbar's own row",
  /data-search-open="" aria-label="Search products"[^>]*onClick=\{openSearch\}/.test(list) && /<label data-search="" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-\[#d5d7dd\]/.test(list)
    && /placeholder="Search products"/.test(list) && /max-sm:text-\[16px\]/.test(list) && /data-search-cancel=""[^>]*onClick=\{closeSearch\}/.test(list)
    && (list.match(/type="search"/g) ?? []).length === 1 && (list.match(/<label data-search=""/g) ?? []).length === 1 && /const \[searching, setSearching\] = useState\(\(\) => !!resumed\?\.search\)/.test(list))
/* "The actual products should not have that thing with search products there. It should be integrated in the rows there." */
check("on every width the list is one card whose first row is Orders' toolbar: the views as tabs, Search, then Sort; nothing above it",
  /className=\{cn\(card, "relative mt-4 overflow-hidden"\)\}/.test(list) && /data-products-list=""/.test(list)
    && list.indexOf('data-toolbar=""') > list.indexOf('aria-label="Products"\n') && list.indexOf("<ViewTabs") < list.indexOf('data-search-open=""') && list.indexOf('data-search-open=""') < list.indexOf('aria-label="Sort"')
    && /<div role="tablist" aria-label="Views" data-views="" className="orders-strip -my-2 flex min-w-0 items-center gap-0\.5 overflow-x-auto py-2">/.test(list)
    && /active \? "bg-\[#eceef1\] text-\[#1a1a2e\]" : "text-\[#4b5563\] hover:bg-\[#f4f5f7\]"/.test(list)
    && /className=\{cn\(iconButton, "shrink-0 max-sm:h-9 max-sm:w-9 data-open:bg-\[#eceef1\]", sort !== "newest" && "bg-\[#eceef1\] text-\[#1a1a2e\]"\)\}\s*>\s*<ArrowUpDown className="h-4 w-4" \/>/.test(list)
    && !list.slice(list.indexOf('data-toolbar=""'), list.indexOf('data-list=""')).includes("Export products")
    /* The name in a span of its own since a browser translator swapped the bare text node and the view kept saying "All" (lib/ui/dom-guard, tests/dom-guard.test.ts). */
    && /<span>\{v\.label\}<\/span>/.test(list))
/* "Instead of the download icon where it currently is, put the sort by icon, which opens the mobile bottom sheet with only the sort by options. The view (All, Active, Draft, Archived) bottom sheet ... opens a bottom sheet with only the view options." */
const pickSheet = code("app/app/products/pick-sheet.tsx")
check("Sort opens a sheet (a dropdown from 768px) of the orders alone; the views are tabs; no checkbox (nothing to select)",
  /<PickSheet\s+name="sort"\s+title="Sort by"\s+options=\{SORTS\}\s+value=\{sort\}\s+onPick=\{pickSort\}/.test(list)
    && /const pickSort = \(next: string\) => sortBy\(next as Sort\)/.test(list) && /<ViewTabs views=\{views\} value=\{view\} onPick=\{showView\} \/>/.test(list)
    && !/viewAndSortItems|section: "Sort by"/.test(list) && !/type="checkbox"/.test(list))
check("both are the shared bottom sheet, drawn up to 768px, the one on marked with a check and in semibold, 48px rows",
  /import \{ BottomSheet \} from "@\/components\/ui\/bottom-sheet"/.test(pickSheet) && /<BottomSheet\s[\s\S]*hideFrom="md"/.test(pickSheet)
    && /role="option"\s+aria-selected=\{on\}/.test(pickSheet) && /\{on \? <Check className="h-4 w-4" strokeWidth=\{2\.25\} \/> : null\}/.test(pickSheet) && /on && "font-semibold"/.test(pickSheet) && /min-h-\[48px\]/.test(pickSheet))
check("the press only flips the sheet's own state, and a pick reaches the page once the sheet has gone, and only for a change",
  /const \[open, setOpen\] = React\.useState\(false\)/.test(pickSheet) && /hapticTap\("soft"\)\s*setOpen\(true\)/.test(pickSheet)
    && /picked\.current = next === current \? null : next\s*setOpen\(false\)/.test(pickSheet)
    && /onClosed=\{\(\) => \{\s*const next = picked\.current\s*picked\.current = null\s*if \(next !== null\) onPickRef\.current\(next\)/.test(pickSheet)
    && /export const PickSheet = React\.memo\(/.test(pickSheet) && /const PickRows = React\.memo\(/.test(pickSheet))
check("Escape clears the field, and so does its clear button; a second Escape closes it", /if \(searchQuery\) search\(""\)\s*else closeSearch\(\)/.test(list) && /aria-label="Clear search"[\s\S]{0,400}onClick=\{clearSearch\}/.test(list))
check("one toolbar for every width, so no container query to stack a field over the views", !/@container|@min-\[700px\]/.test(list) && (list.match(/data-toolbar=""/g) ?? []).length === 1)
check("the views are All, Active, Draft and Archived, All open first, with no counts", /useState<View>\(resumed\?\.view \?\? "all"\)/.test(list) && /value: "all"[\s\S]{0,80}value: "active"[\s\S]{0,80}value: "draft"[\s\S]{0,80}value: "archived"/.test(list) && !/tabCounts/.test(list))
check("the sort's dropdown from 768px is the app's dropdown under its button",
  /import \{ PickerRow, onRowsKey, pickerSurface \} from "@\/components\/app\/date-range-picker"/.test(pickSheet)
    && /<Popover open=\{menu\} onOpenChange=\{setMenu\}>\s*<PopoverTrigger asChild>\{opener\}<\/PopoverTrigger>/.test(pickSheet) && /className=\{cn\(pickerSurface, /.test(pickSheet)
    && /role="menu" aria-label=\{title\} data-pick-menu=\{name\} onKeyDown=\{onRowsKey\}/.test(pickSheet) && /<PickerRow key=\{o\.value\} rowKey=\{o\.value\} compact=\{false\} checked=\{o\.value === value\}/.test(pickSheet))
check("which one a press opens is read at the press (768px), a phone's stopping Radix's toggle and opening the sheet as before; the arrows on the button open the dropdown; focus starts on the one that is on",
  /const WIDE = "\(min-width: 768px\)"/.test(pickSheet) && /if \(isWide\(\)\) return\s*(\/\*[^*]*\*\/\s*)?e\.preventDefault\(\)\s*picked\.current = null/.test(pickSheet)
    && /e\.key !== "ArrowDown" && e\.key !== "ArrowUp"/.test(pickSheet) && /querySelector<HTMLElement>\("\[data-row\]\[data-checked\]"\)/.test(pickSheet)
    && /"data-open": menu \? "" : undefined/.test(pickSheet) && /data-open:bg-\[#eceef1\]/.test(list))
check("a pick from the dropdown reaches the page at once, only for a change, and the sort's lines up with Sort's right edge",
  /const choose = React\.useCallback\(\(next: string, current: string\) => \{\s*setMenu\(false\)\s*if \(next !== current\) onPickRef\.current\(next\)/.test(pickSheet) && /onPick=\{pickSort\}\s*align="end"/.test(list))
check("sort by newest, oldest, title, price and sales", ["newest", "oldest", "title_asc", "title_desc", "price_desc", "price_asc", "sales"].every((s) => list.includes(`value: "${s}"`)) && /\.sort\(compare\(sort\)\)/.test(list))
check("phone rows are Orders' and Emails' stacked rows with a 48px picture: the name at 17px with the price beside it, the status badge under it, the press tint only from the row's own link",
  /className="relative flex items-center gap-3 py-3 pl-4 pr-1\.5 transition-colors duration-75 data-\[pressed\]:bg-\[#f4f5f7\] data-\[opening\]:bg-\[#f4f5f7\]/.test(list) && /phone \? "h-12 w-12 rounded-\[10px\]"/.test(list)
    && /data-name="" className="min-w-0 truncate text-\[17px\] font-semibold leading-6 text-\[#1a1a2e\]"/.test(list) && /data-price="" className="shrink-0 text-\[16px\] font-medium tabular-nums text-\[#1a1a2e\]"/.test(list) && /\{\.\.\.pressMark\}/.test(list))
check("under the name the status and how many sold in quiet grey 14px, and a free product says Free", /data-meta="" className="mt-1 flex h-\[22px\] min-w-0 items-center gap-2"/.test(list) && /truncate text-\[14px\] tabular-nums text-\[#6b7280\]/.test(list) && /* Changed on purpose (round AH: in the store's own currency; round AM: a plan in its own dollars, lib/money/product-currency). */ /cents > 0 \? formatMoney\(cents, productPriceCurrency\(\{ type \}, store\)\) : "Free"/.test(list) && /\{product\.sales_count \? \(/.test(list))
check("a row's status is Orders' badge: green on sale, amber for a draft, grey archived, on a phone and in the table",
  /const STATUS_TONE: Record<Status, "success" \| "attention" \| "neutral"> = \{ live: "success", draft: "attention", archived: "neutral" \}/.test(list) && (list.match(/<StatusBadge tone=\{STATUS_TONE\[status\]\}/g) ?? []).length === 2 && !/function StatusMark/.test(list))
check("a product with no picture shows its first letter, not a box icon", /Array\.from\(title\.trim\(\)\)\[0\]/.test(list) && !/<Package/.test(list))
check("table rows are 56px, the whole row opens the product, and nothing from a menu's portal does", /className="group h-14 cursor-pointer"/.test(list) && /openRow: open,/.test(list) && /api\.current\?\.openRow\(product\.id\)/.test(list) && /openEditor\(router, href, id !== "new"\)\s*requestAnimationFrame\(\(\) => setOpening\(id\)\)/.test(list) && /!e\.currentTarget\.contains\(target\)/.test(list) && !/\{t\("products\.edit"\)\}/.test(list))
check("the table's heading is Emails' faint grey band", /<th scope="col" className="border-b border-\[#eef0f2\] bg-\[#fafbfb\] pl-4 pr-3 font-medium">Product<\/th>/.test(list))
check("numbers right aligned in figures of one width, Sales from 1024px", /px-3 text-right font-medium tabular-nums text-\[#1a1a2e\]/.test(list) && /hidden w-\[96px\] border-b border-\[#eef0f2\] bg-\[#fafbfb\] px-3 text-right font-medium lg:table-cell">Sales/.test(list))
check("fifty to a page, with the footer's count and arrows, the count left off a phone with one page", /const PAGE_SIZE = 50/.test(list) && /data-footer=""/.test(list) && /aria-label="Next page"/.test(list) && /pages === 1 && "max-md:hidden"/.test(list))
check("every phone press is 44px however small it is drawn", /className=\{cn\(ROW_MENU, "h-11 w-11"\)\}/.test(list) && (list.match(/BAR_PRESS/g) ?? []).length >= 4 && /max-sm:h-9 max-sm:text-\[15px\]/.test(list))
check("the product actions are all still there: view, share, archive or restore, duplicate, delete", /t\("common\.view"\)/.test(list) && /api\.current\?\.share\(product\)/.test(list) && /api\.current\?\.archive\(product\)/.test(list) && /api\.current\?\.duplicate\(product\)/.test(list) && /api\.current\?\.remove\(product\)/.test(list)
  && /share: handleShare,\s*archive: handleArchive,\s*duplicate: handleDuplicate,\s*remove: handleDeleteClick,/.test(list) && /generateProductsCSV/.test(list) && /generateProductsPDF/.test(list))
/* The phone's sheets: "fast loading, 200 fps smooth, not laggy at all". A sort or a new view moves the rows the page has; it does not draw them again. */
check("a row is drawn once: the phone's and the table's rows are memoised, and reach the page through rowApi, kept current after each render",
  /const PhoneRow = memo\(function PhoneRow/.test(list) && /const TableRow = memo\(function TableRow/.test(list) && /import \{ memo,/.test(list)
    && /const rowApi = useRef<RowApi \| null>\(null\)\s*useLayoutEffect\(\(\) => \{\s*rowApi\.current = \{/.test(list) && /const rowLabels = useMemo<RowLabels>\(/.test(list)
    && /function useRowActions\(product: Product, username: string, labels: RowLabels, api: RowApiRef\): ActionMenuItem\[\] \{\s*return useMemo\(/.test(list))
/* Round 40: content-visibility is gone from the rows. WebKit skipped painting a row near the edge of a momentum scroll and painted it a frame late; fifty rows cost nothing to keep painted. */
check("a phone row is painted with the rest (no content-visibility), and every row is the same height", !/content-visibility/.test(list) && /data-meta="" className="mt-1 flex h-\[22px\]/.test(list))
check("the phone pane leaves the pill's room to the shared page-scroll rule, not a second padding of its own", /className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll/.test(list) && !/pb-24 md:pb-8/.test(list))
console.log("\nSwitching views, and the way to a product and back")

/* "When I switch between All / Draft / Active / Archived, it should feel smoother." "The image thumbnails should not glitch or flash." */
check("a row once drawn keeps its element: every product shown since the page opened is drawn, the ones out of view hidden, keyed by id",
  /const drawn = useMemo\(\s*\(\) => \[\.\.\.products\]\.sort\(compare\(sort\)\)\.filter\(\(p\) => shownIds\.has\(p\.id\) \|\| kept\.has\(p\.id\)\)/.test(list)
    && (list.match(/\{drawn\.map\(\(product\) => /g) ?? []).length === 2 && (list.match(/<(PhoneRow|TableRow)\s+key=\{product\.id\}\s+product=\{product\}\s+hidden=\{!shownIds\.has\(product\.id\)\}/g) ?? []).length === 2
    && (list.match(/data-row=\{product\.id\}\s*hidden=\{hidden\}/g) ?? []).length === 2
    && !/pageProducts\.map\(\(product\)/.test(list))
check("an empty view hides the lists rather than unmounting them", /\{drawn\.length > 0 \? \(/.test(list) && /\{pageProducts\.length === 0 \? \(\s*<div data-empty=""/.test(list))
check("the hairlines follow the rows shown, not the rows in the page", /\[li:not\(\[hidden\]\)~&\]:border-t/.test(list) && /\[tr:not\(\[hidden\]\)~tr>&\]:border-t/.test(list) && !/\[&\+li\]|\[&\+tr>td\]|divide-y/.test(list))
check("a change of view is measured before and played after, in a layout effect", /listShot\.current = shootList\(sectionRef\.current\)/.test(list) && /useLayoutEffect\(\(\) => \{\s*const before = listShot\.current\s*listShot\.current = null\s*playList\(sectionRef\.current, before\)\s*\}, \[view\]\)/.test(list))
const motion = code("app/app/products/list-motion.ts")
check("rows that stay glide on transform, rows that come fade in from 6px, 16ms apart for the first six",
  /\{ transform: `translateY\(\$\{dy\}px\)` \}, \{ transform: "translateY\(0\)" \}/.test(motion) && /\{ opacity: 0, transform: "translateY\(6px\)" \}, \{ opacity: 1, transform: "translateY\(0\)" \}/.test(motion)
    && /export const ROW_MOVE_MS = 220/.test(motion) && /export const ROW_FADE_IN_MS = 200/.test(motion) && /const ROW_STAGGER_MS = 16/.test(motion) && /const ROW_STAGGER_MAX = 6/.test(motion))
check("rows that leave fade out as copies where they were, so the list is never empty for a frame", /export const ROW_FADE_OUT_MS = 140/.test(motion) && /layer\.dataset\.listLeaving = ""/.test(motion) && /layer\.inert = true/.test(motion) && /\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/.test(motion))
check("a shorter list holds its height until it has settled, the card's foot glides on clip-path, and a page scrolled past it glides up first",
  /section\.style\.minHeight = `\$\{before\.height\}px`/.test(motion) && /clipPath: `inset\(0 0 \$\{from\}px 0 round \$\{radius\}\)`/.test(motion) && /pane\.scrollTo\(\{ top: Math\.max\(0, reach\), behavior: "smooth" \}\)/.test(motion))
const animated = [...motion.matchAll(/\.animate\(\s*\[\s*\{ (\w+):/g)].map((m) => m[1])
check("nothing moves under reduced motion, and nothing in it animates layout: opacity, transform and the card's clip only",
  /if \(!section \|\| reducedMotion\(\) \|\| typeof section\.animate !== "function"\) return null/.test(motion) && animated.length >= 5 && animated.every((k) => ["opacity", "transform", "clipPath"].includes(k)), animated)
/* "Product thumbnail quality dropped too much with the optimisation." Each size offers its 1x, 2x and 3x files at q88 (in next.config's list), not next/image's 1x and 2x at 75. */
check("each picture is its own size, decoded off the main thread, on grey", /width=\{THUMB_BOX\[size\]\}\s*height=\{THUMB_BOX\[size\]\}\s*loading="lazy"\s*decoding="async"/.test(list) && /const THUMB_BOX: Record<ThumbSize, number> = \{ phone: 48, table: 40 \}/.test(list) && !/<Image[^>]*\bfill\b/.test(list) && /bg-\[#eceef1\]/.test(list))
{
  const config = read("next.config.mjs")
  const q = /const THUMB_QUALITY = PORTRAIT_QUALITY/.test(list) ? Number(/export const PORTRAIT_QUALITY = (\d+)/.exec(read("lib/images/optimized-url.ts"))?.[1]) : 0
  const listed = (/qualities: \[([^\]]*)\]/.exec(config)?.[1] ?? "").split(",").map((x) => Number(x.trim()))
  check("and sharp: the files a 48px and a 40px box need at 1x, 2x and 3x, with honest sizes, at a quality next.config serves",
    q > 75 && listed.includes(q) && /phone: \[48, 96, 144\], table: \[40, 80, 120\]/.test(list) && /THUMB_SIZES: Record<ThumbSize, string> = \{ phone: "48px", table: "40px" \}/.test(list)
      && /"h-10 w-10 rounded-\[9px\]"/.test(list) && /sizes=\{THUMB_SIZES\[size\]\}/.test(list)
      && /srcSet=\{srcSet \|\| undefined\}/.test(list) && /optimizedSrcSet\(src, THUMB_FILES\[size\], THUMB_QUALITY\)/.test(list) && !/from "next\/image"/.test(list), { q, listed })
}
check("the list comes back as it was left: its view, order, search and page, kept for the tab", /let leftAt: \{ view: View; sort: Sort; search: string; page: number \} \| null = null/.test(list) && /leftAt = \{ view, sort, search: searchQuery, page \}/.test(list))
/* "The remembered list state should only be restored on a return from the editor (or browser back to the list), not when the Products page is opened fresh." */
check("but only on a return: a fresh visit from the sidebar or the pill starts at All, Newest, no search, page one",
  /* Whether it is a return is read once, on the first render: the same answer resumes the list and holds the stage's landing (tests/return-navigation). */
  /const \[returning\] = useState\(isReturning\)/.test(list) && /const \[resumed\] = useState\(\(\) => \(returning \? leftAt : null\)\)/.test(list)
    && /useState<Sort>\(resumed\?\.sort \?\? "newest"\)/.test(list) && /useState\(resumed\?\.page \?\? 1\)/.test(list) && /useState\(resumed\?\.search \?\? ""\)/.test(list)
    && !/leftAt\?\./.test(list) && /listShown\(\)/.test(list))
check("the row you came back from is tinted as the list comes back, after the layer's drop", /const id = takeEdited\(\)/.test(list) && /delay: LAYER_LEAVE_MS/.test(list))
/* Changed on purpose: New product asks what is being sold first (app/app/products/new/kind-chooser), and the editor its answer opens rises with the same layer move. */
check("rows and New product open the editor with the layer's move; a press with a modifier is left to the link",
  /openEditor\(router, href, id !== "new"\)/.test(list) && /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(list) && (list.match(/onClick=\{askNew\}/g) ?? []).length === 2
    && /if \(href\.startsWith\(NEW_PRODUCT_HREF\)\) openEditor\(router, href, true\)/.test(code("app/app/products/new/kind-chooser.tsx")) && /!e\.metaKey && !e\.ctrlKey && !e\.shiftKey && !e\.altKey/.test(code("app/app/products/new/kind-chooser.tsx"))
    && (list.match(/onClick=\{\(e\) => api\.current\?\.open\(product\.id\)\(e\)\}/g) ?? []).length === 2 && /open: openFromLink,/.test(list))

const layer = code("components/app/page-layer.tsx")
/*
  Changed on purpose: "It should not slide to the left or right. It should come from the bottom, very smooth and clean.
  When I click back or cancel, the same thing reversed." The layer rises from the bottom and drops back; coming in it is
  React's own view transition at the commit (so the page you pressed on stays live while the next one is on its way),
  going back it is one of the layer's own around the navigation (React draws a popstate at once, with none).
  scripts/check-layer-motion.mjs measures it frame by frame.
*/
check("the layer rises in React's own view transition at the commit, named page-layer, with nothing for an update or a swap",
  /* Changed on purpose: the way down is 280ms, "~280ms, ease like cubic-bezier(0.32,0.72,0,1)", as the owner's brief for Cancel asks. */
  /export const LAYER_MOTION_MS = 360/.test(layer) && /export const LAYER_LEAVE_MS = 280/.test(layer) && /export const LAYER_MOTION_EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(layer)
    && /const ReactViewTransition = \(React as unknown as \{ ViewTransition\?: React\.ComponentType<ViewTransitionProps> \}\)\.ViewTransition \?\? null/.test(layer)
    && /<ReactViewTransition\s+name=\{LAYER_NAME\}\s+enter=\{moves \? "layer-rise" : "none"\}\s+exit=\{moves \? "layer-drop" : "none"\}\s+update="none"\s+share="none"\s+default="none"\s*>/.test(layer)
    && /export const LAYER_NAME = "page-layer"/.test(layer))
check("  the page under a rising layer stays: React's hiding of the root's picture is undone before the first frame",
  /function keepPageUnder\(move: ViewTransitionLike\)/.test(layer) && /effect\?\.pseudoElement !== "::view-transition-group\(root\)"/.test(layer) && /if \(next === "enter"\) keepPageUnder\(move\)/.test(layer))
/*
  Changed on purpose: "when I click Cancel to close that page, it's not closing smoothly, going down, on mobile version;
  it's abrupt, direct." The way back was a view transition of its own that waited at most LAYER_WAIT_MS (450ms) for the
  list and was let go at once when a popstate brought no page, so a list the router had to fetch again (after a save,
  whose refresh drops every kept page) replaced the editor in one frame; without view transitions a still dropped at
  once over the live editor, which then stood there again until the list took it away. Now the way back is one move in
  every engine: the editor stays live (no second press, its spinner turning) until the commit that takes it away, and
  in that commit a still of it, built hidden as the navigation started, is shown over the list and drops, 280ms on the
  iOS curve, fading a little. scripts/check-editor-close.mjs samples every frame of it, both engines, new and saved
  product, with and without a change to discard, and with the list slow to come.
*/
/*
  `skipTransition` used to appear nowhere in this file, and that stood for
  "the way back is not a view transition it takes and then lets go of". It is
  still not: the way back starts no transition at all. The one skip in the
  file now is endLayerMove's, which ends a rise REACT started when a press on
  the nav pill has to be answered at once (A PICTURE TAKES NO PRESSES). So
  the claim is the same one, said about the way back rather than the file.
*/
check("the way back drops the layer at the commit that brings the page under it, in every engine, however long that takes",
  /if \(motion === "leave"\) dropLayer\(navigate\)/.test(layer) && !/doc\.startViewTransition\(\(\) => \{/.test(layer)
    && !/skipTransition\(\)/.test(layer.slice(layer.indexOf("function dropLayer"), layer.indexOf("export function endLayerMove")))
    && (layer.match(/skipTransition\(\)/g) ?? []).length === 1
    && layer.indexOf("skipTransition()") > layer.indexOf("export function endLayerMove")
    /* Changed on purpose (round 41): the layer says whether it moves (`asked`). */
    && /if \(!dropAtCommit\(\)\) markReactMotion\("leave", asked\)/.test(layer)
    && /want\.still = layer \? layerStill\(layer\) : null\s*if \(want\.still\) want\.still\.style\.visibility = "hidden"/.test(layer)
    && /still\.style\.visibility = ""\s*let over = false/.test(layer)
    && /const move = moveByHand\(still, false, LAYER_LEAVE_MS\)/.test(layer)
    && /\}, LAYER_PRESS_KEPT_MS\)\s*afterNextPaint\(\(\) => \{/.test(layer)
    && /manual = true\s*flushSync\(\(\) => \{/.test(layer) && /const reactMoves = \(\) => layerMotionOn\(true\) && !manual/.test(layer))
/*
  Changed on purpose. This used to end "...or without view transitions: the
  page swaps and lands as any other", and that was the whole of the owner's
  complaint: WebKit had none before Safari 18, so on those iPhones the editor
  appeared and vanished in one frame. It no longer swaps there; the layer
  plays the same move itself (page-layer.tsx, BY HAND). Reduced motion and
  768px are unchanged, and both paths read them from the one layerMotionOn.
*/
check("no move under reduced motion or from 768px where the editor is a page in the shell; without view transitions the layer moves itself rather than the page swapping",
  /return window\.matchMedia\(LAYER_PHONE\)\.matches && !window\.matchMedia\(REDUCED\)\.matches/.test(layer) && /export const LAYER_PHONE = "\(max-width: 767px\)"/.test(layer)
    /* Changed on purpose: one way back for every engine (dropAtCommit), so no branch on startViewTransition here. */
    /* Changed on purpose (round 41): only a layer that asks to move (the product editor's) moves; each path reads it. */
    && /const up = document\.querySelector\("\[data-page-layer\]"\)\s*if \(dropWant \|\| dropping \|\| manual \|\| doc\.__reactViewTransition \|\| !up \|\| !layerMotionOn\(layerMoves\(up\)\)\) \{\s*navigate\(\)\s*return/.test(layer)
    && /if \(!still \|\| !still\.isConnected \|\| !layerMotionOn\(true\)\) \{/.test(layer)
    && /else if \(layerMotionOn\(LAYER_MOVES \|\| moves\) && !canViewTransition\(\)\) raiseByHand\(navigate\)/.test(layer)
    && /if \(!move \|\| !wanted \|\| !reactMoves\(\)\) return false/.test(layer))
check("the duration and curve reach the CSS from the script, one number in one place", /html\.style\.setProperty\("--layer-motion-ms", `\$\{LAYER_MOTION_MS\}ms`\)/.test(layer) && /html\.style\.setProperty\("--layer-leave-ms", `\$\{LAYER_LEAVE_MS\}ms`\)/.test(layer) && /html\.style\.setProperty\("--layer-motion-ease", LAYER_MOTION_EASE\)/.test(layer))
check("on a phone the layer rises from the bottom edge and drops back to it, on transform alone; nothing slides sideways and the page under it never fades",
  /@keyframes layer-rise \{\s*from \{ transform: translateY\(100%\); \}/.test(css) && /@keyframes layer-drop \{\s*to \{ transform: translateY\(100%\); \}/.test(css)
    && /html\[data-layer-motion="enter"\]::view-transition-new\(page-layer\) \{\s*animation: layer-rise var\(--layer-motion-ms, 360ms\) var\(--layer-motion-ease, ease-out\) both;/.test(css)
    && /html\[data-layer-motion="leave"\]::view-transition-old\(page-layer\) \{\s*animation: layer-drop var\(--layer-leave-ms, 300ms\) var\(--layer-motion-ease, ease-out\) both;/.test(css)
    && /::view-transition-old\(root\),\s*::view-transition-new\(root\),\s*::view-transition-old\(page-layer\),\s*::view-transition-new\(page-layer\) \{\s*animation: none;[\s\S]{0,160}mix-blend-mode: normal;/.test(css)
    && /html\[data-layer-motion\] \[data-page-layer\] \{\s*view-transition-name: page-layer;/.test(css)
    && !/layer-slide-in|layer-slide-out/.test(css))
check("  a press on the way in or out answers on its own frame, and a spinner takes its place past LAYER_PRESS_WAIT_MS",
  /export const LAYER_PRESS_WAIT_MS = 100/.test(layer) && /export function holdPress\(/.test(layer) && /if \(press !== false\) holdPress\(press \?\? recentPress\(\)\)/.test(layer)
    && /\[data-layer-press=""\] > :not\(\[data-layer-press-spinner\]\) \{\s*opacity: 0\.4;/.test(css) && /@keyframes press-spinner-in/.test(css))
/* "200 fps smooth": nothing of the pages' own lands in the frames of a move (scripts/check-layer-motion.mjs measures 0 dropped frames at 4x CPU). */
/*
  Changed on purpose: `steady`. One frame on time is proof enough behind a
  view transition, where both pages are pictures and nothing of them can draw
  again. A move played by hand has a live page in it whose own first render
  is still landing, and one quiet frame there is often only the gap between
  two pieces of it, so those moves wait for two in a row.
*/
check("  a move is held at its first position until frames arrive a frame apart again (two in a row for a move played by hand), at most 400ms, then played whole",
  /export function startWhenFramesFlow\(animations: Animation\[\], steady = 1\)/.test(layer) && /const FRAMES_FLOW_CAP_MS = 400/.test(layer) && /const FRAME_FLOWS_MS = 24/.test(layer)
    && /quiet = last >= 0 && t - last < FRAME_FLOWS_MS \? quiet \+ 1 : 0/.test(layer) && /if \(quiet >= steady \|\| performance\.now\(\) - began > FRAMES_FLOW_CAP_MS\)/.test(layer)
    && /startWhenFramesFlow\(\[a\], 2\)/.test(layer)
    && /for \(const a of animations\) a\.playbackRate = 0/.test(layer) && /if \(next === "enter" \|\| next === "leave"\) layerMoveWhenDrawn\(move\)/.test(layer)
    /* Changed on purpose: the way back's own view transition is gone (dropAtCommit plays it by hand, through moveByHand and so startWhenFramesFlow with two in a row). */
    && /const move = moveByHand\(still, false, LAYER_LEAVE_MS\)/.test(layer) && /startWhenFramesFlow\(anims\)/.test(code("app/app/orders/order-motion.ts")))
check("  a page's own redraw waits for the move (afterLayerMove), let go when the move ends or after 1.5s",
  /export function afterLayerMove\(fn: \(\) => void\): \(\) => void/.test(layer) && /const AFTER_MOVE_CAP_MS = 1500/.test(layer) && (layer.match(/runAfterMove\(\)/g) ?? []).length >= 2
    && /afterLayerMove\(\(\) => \{\s*setOptions\(d\.options \?\? \[\]\)/.test(code("components/email/compose/composer.tsx")))
check("  the list's off screen rows are laid out in the frame the picture is taken, not the first frame of the drop",
  /html\[data-layer-motion\] \.\\\[content-visibility\\:auto\\\] \{\s*content-visibility: visible;/.test(css))
check("  React's leftover pseudo animations are read from the document's list, which still has them once the pseudo elements are gone",
  /function clearLeftovers\(\) \{\s*for \(const a of document\.getAnimations\(\)\)/.test(layer))
check("a press's answer is not taken away while the shell still has a page on its way",
  /let cap = window\.setTimeout\(function again\(\) \{\s*if \(getAppNavigation\(\)\) \{\s*cap = window\.setTimeout\(again, LAYER_PRESS_KEPT_MS\)\s*return\s*\}\s*release\(\)\s*\}, LAYER_PRESS_KEPT_MS\)/.test(layer))
check("the pill keeps its place while a layer moves under it", /html\[data-layer-motion\] \[data-app-nav-pill\] \{\s*view-transition-name: app-nav-pill;/.test(css))
/* Changed on purpose: the stage also holds its landing while a pull to refresh is showing (pullRefreshVisualActive, ddcbaf919; page-performance pins it). */
check("the stage plays no landing of its own under a layer's move (the mark read on the commit, and again on the frame the landing would start)",
  /const layered = !!document\.documentElement\.dataset\.layerMotion\s*requestAnimationFrame\(\(\) => \{\s*const s = scrollers\(\)\s*if \(!s \|\| layered \|\| document\.documentElement\.dataset\.layerMotion( \|\| isLandingHeld\(\))?( \|\| pullRefreshVisualActive\(\))?\) return\s*playEntrance\(s\.outer/.test(code("components/app/app-stage.tsx")))
const ret = code("app/app/products/list-return.ts")
/* "Exit must not leave the editor in the browser's forward/back stack in a surprising way." */
/* And a back that does nothing is followed by the list itself, rather than by
   the layer sitting over a dimmed arrow for eight seconds
   (lib/navigation/go-back backThen, tests/back-never-stalls.test.ts). */
check("an editor the list opened goes back in history; one opened any other way is replaced by the list, and neither pushes a new entry",
  /if \(back\) backThen\(replaceWithList\)\s*else replaceWithList\(\)/.test(ret) && /const replaceWithList = \(\) => \{\s*markTraversal\(\)\s*router\.replace\(PRODUCTS_HREF\)/.test(ret) && !/router\.push\(PRODUCTS_HREF\)/.test(ret) && /prefetchAppPage\(router, PRODUCTS_HREF\)/.test(ret))
check("\"the list opened it\" is noted when the editor mounts right after the list pushed it, and forgotten once no editor is up",
  /pushedAt = Date\.now\(\)\s*router\.push\(href\)/.test(ret) && /if \(pushedAt !== null && Date\.now\(\) - pushedAt < PUSH_KEPT_MS\) fromList = true/.test(ret)
    && /if \(editors === 0\) fromList = false/.test(ret) && /useListOrigin\(\)/.test(editor))
check("a return is noted by address: the way back from the editor and every popstate, kept until the list shows",
  /window\.addEventListener\("popstate", \(\) => \{\s*returnTo = window\.location\.pathname/.test(ret) && /returnTo = PRODUCTS_HREF/.test(ret) && /return returnTo === PRODUCTS_HREF \|\| isTraversing\(\)/.test(ret))
/*
  "When it's loading a product page editor, or editing a new product, you can see the double loading there." A press
  on a row was answered twice: the list drew its spinner where View is, and the layer answered whatever was under the
  pointer as well, which on a computer is the product's name (page-layer holdPress). `[data-layer-press="wait"]` paints
  its element's text away and puts a spinner in its place, so the row showed an empty name with a spinner in the middle
  of it and a second spinner at its end. scripts/check-editor-open.mjs counts them at 390, 1280 and 1920.
*/
check("only the list answers a row's press, and it writes the row's tint in the press's own task",
  /openEditor\(router, href, id !== "new"\)/.test(list)
    && /for \(const el of sectionRef\.current\?\.querySelectorAll<HTMLElement>\(`\[data-row="\$\{CSS\.escape\(id\)\}"\]`\) \?\? \[\]\) el\.dataset\.opening = ""/.test(list)
    && /export function openEditor\(router: Router, href: string, answered = false\)/.test(ret)
    && /answered \? false : undefined,/.test(ret))
/*
  "Sometimes it ends, and then I have to wait another 10 seconds to load the page." The row's answer ended on a clock of
  its own (ten seconds) and the layer let its press go after LAYER_PRESS_KEPT_MS, both of them before an editor whose
  server read ran longer than that. Now the answer lasts while the router's own request for the editor is still out, and
  the arrival is what ends it.
*/
check("the row's answer lasts as long as the wait, and the arrival ends it",
  !/window\.setTimeout\(reset, 10_000\)/.test(list)
    && /if \(!editorAnswered\(href, openedAt\.current\) && waited < WAIT_LONGEST_MS\) return/.test(list)
    && !/startNavigationLoading\(href\)\s*return\s*\}/.test(list)
    && /if \(getAppNavigation\(\)\) return\s*reset\(\)/.test(list)
    && /export function editorAnswered\(href: string, since: number\): boolean/.test(ret)
    && /export const WAIT_LONGEST_MS = 30_000/.test(ret))

const probe = read("scripts/check-products-page.mjs")
check("the probe draws the pill's box from its variables and measures 360, 390, 430, 768 and 1280", /width: "var\(--app-nav-width\)"/.test(probe) && /bottom: "var\(--app-nav-lift\)"/.test(probe) && /const TABS = /.test(probe) && ["phone-360", "phone-390", "phone-430", "tablet-768", "desktop-1280"].every((w) => probe.includes(`"${w}"`)))
check("the probe holds the row buttons and New product against the editor's own, and a view switch to the same <img> elements and no empty frame",
  /data-probe-more/.test(probe) && /data-probe-save/.test(probe) && /every picture is the same <img> element it was/.test(probe) && /no frame with an empty list/.test(probe))
const editorProbe = read("scripts/check-product-editor.mjs")
check("the editor probe walks the way out and in a fifth at a time, at 390 and 1280", /"phone-390-route"/.test(editorProbe) && /"desktop-1280-route"/.test(editorProbe) && /no blank frame/.test(editorProbe) && /Cancel has become Back/.test(editorProbe))
check("and follows the history: replace when opened directly, back when the list opened it, forward, back and a fresh visit",
  /http:\/\/probe\.test\//.test(editorProbe) && /Back goes back in history/.test(editorProbe) && /Back puts the list in the editor's place/.test(editorProbe) && /opened fresh from the sidebar or the pill/.test(editorProbe))
/*
  NO SKELETON LEFT BEHIND. The route's skeleton.tsx outlived the route
  skeletons: nothing imported it, and this test measured its shapes as if a
  slow load still drew it. A slow load is the app stage's spinner now.
*/
check("the Products page has no route skeleton, rendered or orphaned", !existsSync("app/app/products/skeleton.tsx") && !existsSync("app/app/products/loading.tsx"))

console.log("\nArchive and Restore: the status decides, as in Shopify")

/*
  A fake of the one table, with row level security: rows of another creator
  are simply not there. It records every update so the test can say what
  was written, and answers `.select()` with the rows changed.
*/
type Row = { id: string; status: string; archived: boolean | null; mine: boolean }
function productsTable(rows: Row[], opts: { refuseArchivedStatus?: boolean } = {}) {
  const writes: Array<Record<string, unknown>> = []
  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const filters: Array<[string, unknown]> = []
        const run = () => {
          if (opts.refuseArchivedStatus && patch.status === "archived") return { data: null, error: { code: "23514", message: "violates check constraint" } }
          const hit = rows.filter((r) => r.mine && filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
          for (const r of hit) Object.assign(r, patch)
          if (hit.length > 0) writes.push(patch)
          return { data: hit.map((r) => ({ status: r.status, archived: r.archived })), error: null }
        }
        const chain = {
          eq(k: string, v: unknown) { filters.push([k, v]); return chain },
          select: async () => run(),
          then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
        }
        return chain
      },
    }),
  }
  return { client: client as never, writes }
}

{
  const t = productsTable([{ id: "p1", status: "published", archived: false, mine: true }])
  const row = await archiveProduct(t.client, "p1")
  check("archiving a live product takes it off every page: its status is archived, and the flag says so too",
    row.status === "archived" && row.archived === true && isArchivedProduct(row), row)
}
{
  /* The bug: status "archived" with the flag false showed Restore, and Restore wrote archived: true. */
  const t = productsTable([{ id: "p2", status: "archived", archived: false, mine: true }])
  const row = await restoreProduct(t.client, "p2")
  check("restoring a product saved with status archived brings it back, as a draft",
    row.status === "draft" && row.archived === false && !isArchivedProduct(row), row)
}
{
  const t = productsTable([{ id: "p3", status: "archived", archived: true, mine: true }])
  const archived = await archiveProduct(t.client, "p3")
  const restored = await restoreProduct(t.client, "p3")
  const again = await archiveProduct(t.client, "p3")
  check("archive, restore, archive: each press does what it says", archived.status === "archived" && restored.status === "draft" && !isArchivedProduct(restored) && isArchivedProduct(again))
}
{
  const t = productsTable([{ id: "p4", status: "published", archived: true, mine: true }])
  const row = await restoreProduct(t.client, "p4")
  check("a product archived by the old flag alone keeps its status when restored", row.status === "published" && row.archived === false && t.writes.length === 1, t.writes)
}
{
  const t = productsTable([{ id: "p5", status: "published", archived: false, mine: true }], { refuseArchivedStatus: true })
  const row = await archiveProduct(t.client, "p5")
  check("on a database whose status check predates archived, it is archived as a hidden draft", row.status === "draft" && row.archived === true && isArchivedProduct(row), row)
}
{
  const t = productsTable([{ id: "p6", status: "published", archived: false, mine: false }])
  let threw = false
  try {
    await archiveProduct(t.client, "p6")
  } catch {
    threw = true
  }
  check("an update that changed nothing (not yours, or gone) is an error, not a success", threw)
}
check("the list uses these and updates from the row the database answered with",
  /restoreProduct\(supabase, product\.id\)/.test(list) && /archiveProduct\(supabase, product\.id\)/.test(list) && /\{ \.\.\.p, \.\.\.row \}/.test(list) &&
    !/update\(\{ archived: newArchivedState \}\)/.test(list) && !/const isArchived = /.test(list))
/* The delete is the server's now (app/api/products/delete), which counts the rows it deleted: tests/product-delete.test.ts. */
check("a delete row level security refused is not reported as done",
  /await deleteProduct\(product\.id\)/.test(list) && /if \(!gone\.data \|\| gone\.data\.length === 0\) return \{ kind: "failed"/.test(code("lib/products/delete-product.ts")))
check("the PDF report escapes what a creator typed before it is written into a window of this origin",
  /\$\{escapeHtml\(product\.title\)\}/.test(list) && !/<td class="product-title">\$\{product\.title\}<\/td>/.test(list))
check("the delete question takes focus, closes on Escape unless a delete is running, and gives focus back",
  /ref=\{deleteCancel\}/.test(list) && /if \(e\.key === "Escape"\) closeDelete\(\)/.test(list) && /if \(!deleteModalOpen \|\| isDeleting\) return/.test(list) && /opener\.focus\(\{ preventScroll: true \}\)/.test(list))
check("one notice timer, restarted by the next notice", /if \(notificationTimer\.current\) clearTimeout\(notificationTimer\.current\)/.test(list))
check("the page past the last one after a delete shows the last page there is, and is set there",
  /const pageNow = Math\.min\(page, pages\)/.test(list) && /const pages = Math\.max\(1, /.test(list) && /if \(page > pages\) setPage\(pages\)/.test(list))
const sqlFix = code("supabase/sql/RUN_PRODUCT_ARCHIVE_STATUS.sql")
check("products archived by the old flag while live are taken off the page by a paste, and it is the migration too",
  /update public\.products\s+set status = 'archived'\s+where archived is true and status = 'published'/.test(sqlFix) && code("supabase/migrations/20260928_product_archive_status.sql") === sqlFix)

console.log("\nA coupon's rules, on the server")

const good = { code: " summer20 ", discount_type: "percentage", discount_value: 20 }
const r1 = readCouponInput(good)
check("a code is trimmed and upper cased", r1.ok && r1.values.code === "SUMMER20", r1)
check("with nothing else set: all products, no limits, no dates, on", r1.ok && r1.values.product_ids === null && r1.values.usage_limit === null && r1.values.starts_at === null && r1.values.min_purchase_cents === null && r1.values.is_active === true)
const refuse = (body: unknown, why: string, base?: Parameters<typeof readCouponInput>[1]) => {
  const r = readCouponInput(body, base)
  check(`refused: ${why}`, !r.ok, r)
}
refuse({ ...good, code: "AB" }, "a code under 3 characters")
refuse({ ...good, code: "SUMMER 20" }, "a space in a code")
refuse({ ...good, code: "X".repeat(33) }, "a code over 32 characters")
refuse({ ...good, discount_type: "bogo" }, "an unknown kind of discount")
refuse({ ...good, discount_value: 0 }, "a discount of 0")
refuse({ ...good, discount_value: 101 }, "more than 100%")
refuse({ ...good, discount_type: "fixed", discount_value: 5.555 }, "more than two decimals")
refuse({ ...good, usage_limit: 0 }, "a use limit of 0")
refuse({ ...good, usage_limit: 2.5 }, "a fractional use limit")
refuse({ ...good, min_purchase_cents: -100 }, "a negative minimum")
refuse({ ...good, product_ids: ["not-a-uuid"] }, "a product id that is not one")
refuse({ ...good, starts_at: "2026-10-10T00:00:00Z", expires_at: "2026-10-01T00:00:00Z" }, "an end before the start")
refuse({ ...good, starts_at: "someday" }, "a date that is not one")
refuse(null, "no body")
const fixed = readCouponInput({ ...good, discount_type: "fixed", discount_value: "5.50", usage_limit: "10", min_purchase_cents: 2500 })
check("a fixed amount and numbers sent as text are read", fixed.ok && fixed.values.discount_value === 5.5 && fixed.values.usage_limit === 10 && fixed.values.min_purchase_cents === 2500, fixed)
const uuid = "00000000-0000-4000-8000-000000000001"
const scoped = readCouponInput({ ...good, product_ids: [uuid, uuid] })
check("product ids are kept once each", scoped.ok && scoped.values.product_ids?.length === 1)
const edit = readCouponInput({ is_active: false }, { code: "SUMMER20", discount_type: "percentage", discount_value: 20, product_ids: null, usage_limit: 100, starts_at: null, expires_at: null, min_purchase_cents: null, is_active: true })
check("an edit of one field keeps the rest of the saved code", edit.ok && edit.values.is_active === false && edit.values.usage_limit === 100 && edit.values.code === "SUMMER20", edit)
const legacy = readCouponInput({ is_active: false }, { code: "X1", discount_type: "fixed", discount_value: 5 })
check("a code saved before the rules can still be turned off", legacy.ok, legacy)
refuse({ code: "Y1" }, "but it cannot be renamed to another short one", { code: "X1", discount_type: "fixed", discount_value: 5 })
check("the pattern the form checks is the server's", CODE_PATTERN.test("SPRING-25_X") && !CODE_PATTERN.test("spring"))

console.log("\nWhere a code stands")

const now = new Date("2026-09-24T12:00:00Z")
const c = { is_active: true, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0 }
check("active", couponState(c, now) === "active")
check("off wins over everything", couponState({ ...c, is_active: false, expires_at: "2026-01-01T00:00:00Z" }, now) === "off")
check("expired", couponState({ ...c, expires_at: "2026-09-01T00:00:00Z" }, now) === "expired")
check("used up", couponState({ ...c, usage_limit: 5, usage_count: 5 }, now) === "used_up")
check("scheduled", couponState({ ...c, starts_at: "2026-10-01T00:00:00Z" }, now) === "scheduled")

console.log("\nThe routes and the SQL")

const routes = ["app/api/coupons/route.ts", "app/api/coupons/[id]/route.ts", "app/api/coupons/write.ts"].map(code).join("\n")
check("no database error text reaches the page", !/error\.message/.test(routes))
check("every write goes through readCouponInput", /readCouponInput\(body\)/.test(routes) && /readCouponInput\(body, saved/.test(routes))
check("one code per creator whatever its case, checked before the write", /codeTaken\(/.test(routes) && /escapeLike\(code\)/.test(routes))
check("a code can only name the creator's own products", /productsAreTheirs\(/.test(routes) && /\.eq\("creator_id", creatorId\)\.in\("id", ids\)/.test(routes))
check("the form keeps working before min_purchase_cents exists", /isMissingColumn\(result\.error, "min_purchase_cents"\)/.test(routes))
check("the Apply check is still rate limited", /bucket: "coupon"/.test(read("app/api/coupons/validate/route.ts")))

const migration = read("supabase/migrations/20260926_coupon_rules.sql")
const paste = read("supabase/sql/RUN_COUPONS.sql")
const statements = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("/*"))
check("the paste file runs the same statements as the migration", statements(migration).join("\n") === statements(paste).join("\n"))
check("one statement per line, and no -- comments", [migration, paste].every((sql) => !/^\s*--/m.test(sql) && statements(sql).every((l) => l.trim().endsWith(";"))))
check("safe to run twice", statements(migration).every((l) => /IF NOT EXISTS|IF EXISTS|CREATE OR REPLACE|REVOKE|GRANT|NOT VALID/.test(l)))
check("the public list of every active code is closed", /DROP POLICY IF EXISTS "Public read active coupons"/.test(migration))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
