/**
 * ===========================================================================
 *  THE PRODUCTS AREA: THE EDITOR'S FIRST FRAME, AND THE RULES FOR A CODE
 * ===========================================================================
 * 1. The product editor opens from rows the server read. The pure function
 *    that turns them into the form (app/app/products/new/editor-form.ts) is
 *    pinned here, and so is the absence of the old client-side load.
 * 2. A coupon is checked on the server by readCouponInput and placed in a
 *    view by couponState (lib/checkout/coupons.ts). Both are pure.
 * 3. The shape of the pages: the Products list as a shelf of pictures on a
 *    phone (72px rows, a 56px picture, a search field and one segmented
 *    control, no card) beside a light table from 768px, one bar at the top
 *    of the editor and none at its foot, and SQL that pastes.
 *    scripts/check-products-page.mjs measures the list.
 */
import { readFileSync, existsSync } from "node:fs"
import { initialForm, snapshotOf, snapshotOfForm, DEFAULT_FAQS, DEFAULT_WHATS_INCLUDED, type LoadedProduct } from "@/app/app/products/new/editor-form"
import { couponState, readCouponInput, CODE_PATTERN } from "@/lib/checkout/coupons"
import { archiveProduct, isArchivedProduct, restoreProduct } from "@/lib/products/archive"
import { stripComments } from "./_source"

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
const read = (p: string) => readFileSync(p, "utf8")
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
check("it reads no search parameter to find its product", !/useSearchParams/.test(editor))
check("it fetches no creator and no product on mount", !/\.from\("creators"\)/.test(editor) && !/\.from\("products"\)\s*\.select\("\*"\)/.test(editor) && !/\.from\("product_variants"\)\s*\.select\(`/.test(editor))
check("it is not held back behind a timer", !/setIsPageReady|isPageReady/.test(editor) && !/setTimeout\(forceScrollTop/.test(editor))
check("its fields start from the server's rows", /useState\(\(\) => initialForm\(loaded\)\)/.test(editor))
const idPage = code("app/app/products/[id]/page.tsx")
check("/app/products/<id> draws the editor with the product, not a redirect", /loadProductEditor\(id\)/.test(idPage) && /<ProductEditor/.test(idPage) && !/new\?edit=/.test(idPage))
const loader = code("app/app/products/load-editor.ts")
check("the server reads the five things together", /Promise\.all\(\[/.test(loader) && /product_variants/.test(loader) && /digital_assets/.test(loader) && /profiles/.test(loader))
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
check("and the list still prefetches the editor, data and all, when a row is hovered or touched", /router\.prefetch\(`\/app\/products\/\$\{id\}`, FULL_PREFETCH\)/.test(code("app/app/products/products-client.tsx")))

console.log("\nOne bar, at the top")

check("no Save and Cancel strip at the foot of the screen", !/fixed bottom-0 left-0 right-0/.test(editor) && !/Bottom Action Bar/.test(read("app/app/products/new/product-editor.tsx")))
check("the bar is sticky at the top and holds Cancel (or Back) and Save", /data-editor-bar=""/.test(editor) && /"sticky top-0 z-30/.test(editor) && /<SaveButton phase=\{savePhase\}/.test(editor) && /<LeaveButton mode=\{leaveMode\} disabled=\{saveBusy\} onLeave=\{\(\) => void handleCancel\(\)\} \/>/.test(editor))
check("Cmd or Ctrl and S saves", /e\.metaKey \|\| e\.ctrlKey/.test(editor) && /key\.toLowerCase\(\) !== "s"/.test(editor))
const barSource = editor.slice(editor.indexOf('data-editor-bar=""'), editor.indexOf('aria-label="Sections"'))
check("the bar names no product: the name is in the title field", !/savedTitle|\{title\}|"Untitled product"/.test(barSource.replace(/title=\{savedTitle\.trim\(\) \|\| "Product"\}/, "")) && /<h1 className="sr-only">\{productId \? "Edit product" : "New product"\}<\/h1>/.test(barSource))
/* "Get rid of the Unsaved and the Live badge or New product thing in the bar." */
check("nothing is written in the middle of the bar: no Unsaved changes, Saved, Live, Draft or New product", !/data-editor-state/.test(editor) && !/Unsaved changes|"Live"|"Draft"/.test(barSource) && !/grid-cols-\[1fr_auto_1fr\]/.test(barSource))
check("a screen reader still hears Saving and Saved, from a hidden polite line", /<p data-editor-announce="" className="sr-only" aria-live="polite"/.test(barSource) && /savePhase === "saving" \? "Saving" : savePhase === "saved" \? "Saved"/.test(barSource))
check("Cancel at the start, the more button and Save at the end", /flex h-14 max-w-\[760px\] items-center justify-between/.test(barSource) && barSource.indexOf("handleCancel") < barSource.indexOf("More actions") && barSource.indexOf("More actions") < barSource.indexOf("<SaveButton"))
check("whether the product is live or a draft heads the more menu", /section: isPublished \? "Live on your page" : "Draft, hidden from your page"/.test(barSource))
check("the unsaved tracking still drives the leave question", /if \(hasUnsavedChanges\) \{\s*const leave = await ask\(/.test(editor) && /title: "Discard changes\?"/.test(editor) && /confirm: "Discard", cancel: "Keep editing"/.test(editor))

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
  /barIconButton = cn\(secondaryDepth, PRESS_AREA_BORDERED, "h-10 w-10 [^"]*sm:h-8 sm:w-8/.test(buttons) && /"h-10 min-w-\[64px\][^"]*sm:h-8/.test(buttons))
check("Save keeps its word in the layout while busy, and is always as wide as Saved, so its width never changes",
  /<span className=\{cn\("col-start-1 row-start-1 text-center", busy && "opacity-0"\)\}>\{word\}<\/span>/.test(buttons) && /after:content-\['Saved'\]/.test(buttons) && /absolute inset-0 flex items-center justify-center/.test(buttons))
check("the grey Save says Saved only when it is disabled after a save", /const word = !busy && disabled && saved \? "Saved" : "Save"/.test(buttons))
check("Save's violet and depth are one exported set (primaryDepth), which New product wears too", /export const primaryDepth = cn\(/.test(buttons) && /PRESS_AREA,\s*primaryDepth,/.test(buttons))
check("Cancel and Back are one button holding both words, crossfading, so the bar never moves",
  /export function LeaveButton/.test(buttons) && /data-leave-button=""/.test(buttons) && /aria-label=\{back \? "Back" : "Cancel"\}/.test(buttons) && /<ChevronLeft/.test(buttons) && /transition-opacity duration-150 motion-reduce:transition-none/.test(buttons) && /cn\(barButton, "grid"\)/.test(buttons))
check("busy is aria-busy and not disabled, and a press while busy does nothing", /aria-busy=\{phase === "saving" \|\| undefined\}/.test(buttons) && /disabled=\{!busy && disabled\}/.test(buttons) && /if \(!busy\) onSave\(\)/.test(buttons))
check("a check for SAVED_CHECK_MS after a save", /export const SAVED_CHECK_MS = 900/.test(buttons) && /data-save-check=""/.test(buttons) && /setTimeout\(\(\) => setSavedFlash\(false\), SAVED_CHECK_MS\)/.test(editor))
check("disabled is Polaris grey with no depth", /disabled:bg-\[#ebebef\] disabled:text-\[#a1a1aa\] disabled:shadow-none/.test(buttons))
check("one save at a time: a ref guards it, not only the state", /if \(isLoading \|\| saveInFlight\.current\) return false/.test(editor) && /saveInFlight\.current = true/.test(editor) && /finally \{[\s\S]{0,120}saveInFlight\.current = false/.test(editor))

console.log("\nEvery question the editor asks (app/app/products/new/confirm-sheet.tsx)")

const confirmSheet = code("app/app/products/new/confirm-sheet.tsx")
check("on a phone it is the shared bottom sheet", /import \{ BottomSheet \} from "@\/components\/ui\/bottom-sheet"/.test(confirmSheet) && /<BottomSheet\s/.test(confirmSheet) && /data-surface="sheet"/.test(confirmSheet))
check("from 640px a compact modal in the middle", /AlertDialogPrimitive\.Content/.test(confirmSheet) && /data-surface="modal"/.test(confirmSheet) && /max-w-\[420px\]/.test(confirmSheet))
check("two buttons: the safe one with the bar's depth, the one that does it in red", /cn\(secondaryDepth, "h-12/.test(confirmSheet) && /criticalDepth/.test(confirmSheet) && /bg-\[#c4290c\]/.test(buttons))
check("the old forced dialog sheet and its swipe code are gone from the editor", !/showExitDialog|handleSaveAndExit|"unsaved"/.test(editor) && /\{confirmSheet\}/.test(editor))
check("no window.confirm left in the editor: a big upload and deleting a file ask in the sheet", !/\bconfirm\(`/.test(editor) && /title: "Upload this much\?"/.test(editor) && /title: "Delete this file\?"/.test(editor))

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
check("positions are read out, and position 1 is named the thumbnail", /`Picked up \$\{name\(active\.id\)\.toLowerCase\(\)\} of \$\{count\}\.`/.test(media) && /n === 1 \? ", the thumbnail" : ""/.test(media))
check("only a drop commits; a cancel changes nothing", /onDragCancel=\{\(\) => setActiveId\(null\)\}/.test(media) && /arrayMove\(prev, from, to\)/.test(media))
check("the editor draws the grid from the form's own media; the old sensors, overlay and dead touch handlers are gone",
  /<MediaGrid items=\{mediaItems\} onChange=\{setMediaItems\} onRemove=\{removeMedia\} \/>/.test(editor) && !/SortableMediaItem|mediaSensors|activeDragItem|<DragOverlay|handleTouchStart|touchDragIndex|longPressTimerRef/.test(editor))

console.log("\nThe editor's page")

check("on a phone, first on the screen as a layer over the app's header, it starts below the status bar; from md, under the header, it adds nothing",
  /max-md:\[\[data-page-layer\]_&\]:pt-\[env\(safe-area-inset-top\)\]/.test(barSource) && /max-md:\[\[data-page-layer\]_&\]:pb-\[calc\(32px\+env\(safe-area-inset-bottom\)\)\]/.test(editor)
    && !/(^|[\s"])\[\[data-page-layer\]_&\]/.test(barSource + editor))
check("a layer on a phone only: both editor addresses ask for it, and from md it is a page in the shell",
  /<PageLayer pill inset="bar" phoneOnly>/.test(code("app/app/products/new/layout.tsx")) && /<PageLayer pill inset="bar" phoneOnly>/.test(code("app/app/products/[id]/layout.tsx")))
check("the editor scrolls as a page-scroll pane, so the pill's room is the shared 104px and nothing else", /className="page-scroll h-full overflow-y-auto/.test(editor) && !/pb-24 sm:pb-8/.test(editor))
check("prices bring up the decimal keypad", (editor.match(/inputMode="decimal"/g) ?? []).length >= 4)

console.log("\nThe Products list: a shelf of pictures on a phone, a light table from 768px")

const list = code("app/app/products/products-client.tsx")
check("a list under 768px and the table from it", /<ul aria-label="Products" data-list="" className="-mx-4 sm:-mx-6 md:hidden" hidden=\{pageProducts\.length === 0\}>/.test(list) && /className="hidden w-full table-fixed border-separate border-spacing-0 text-\[13px\] md:table"/.test(list))
check("no table forced sideways on a phone", !/min-w-\[500px\]/.test(list) && !/min-w-max/.test(list) && !/sticky left-0/.test(list))
check("a hover or a finger prefetches the editor in full", /onTouchStart=\{\(\) => warm\(product\.id\)\}/.test(list) && /kind: "full"/.test(list))
const couponsList = code("app/app/coupons/coupons-client.tsx")
check("no Products and Coupons tabs: Coupons is a page of its own again", !existsSync("app/app/products/products-subnav.tsx") && !/ProductsSubnav|products-subnav/.test(list + couponsList))
check("with its own title", /<h1[^>]*>Coupons<\/h1>/.test(couponsList))
const sidebar = code("components/app/sidebar.tsx")
check("and its own place in the menu, under Products, where it was", /href: "\/app\/products",[\s\S]{0,160}children: \[\{ href: "\/app\/coupons", label: "Coupons" \}\]/.test(sidebar))
check("the Orders bar, gutter and width, not a parallel set", /<PaneBar width=\{LIST_WIDTH\} className=\{LIST_BAR\}>/.test(list) && /from "\.\.\/orders\/order-parts"/.test(list))
/* "In the Products page the New product button at the top should be purple." */
check("New product is the one violet button, the editor's Save's colour and depth (primaryDepth, not a copy), with no icon, and a 44px press on a phone",
  /const NEW_LOOK = cn\(primaryDepth, PRESS, "h-8 gap-1\.5 rounded-lg px-3 text-\[13px\]"\)/.test(list) && /data-new-product=""[\s\S]{0,200}className=\{NEW_LOOK\}\s*>\s*\{t\("products\.newProduct"\)\}\s*<\/Link>/.test(list)
    && /import \{ primaryDepth, secondaryDepth \} from "\.\/new\/editor-buttons"/.test(list) && !/buttonAccent|buttonPrimary/.test(list) && !/bg-\[#8b5cf6\]/.test(list) && /max-md:after:-inset-1\.5/.test(list))
/* "Make sure the three dots button in the products page has the same depth as the three dots button in the edit product page." */
check("a row's more button wears the editor's secondaryDepth, 40px on a phone with a 44px press, 32px in the table",
  /const ROW_MENU_PHONE = cn\(\s*secondaryDepth,\s*"relative z-\[1\] h-10 w-10 rounded-\[10px\] text-\[#4b5563\] after:absolute after:-inset-\[3px\]/.test(list) && /const ROW_MENU_TABLE = cn\(secondaryDepth, "h-8 w-8 rounded-lg text-\[#4b5563\]"\)/.test(list)
    && /className=\{ROW_MENU_PHONE\}/.test(list) && /className=\{ROW_MENU_TABLE\}/.test(list) && !/shadow-\[inset_0_-1px_0/.test(list))
check("Export is a plain icon on a phone and the word on a computer, and neither it nor New product is in the bar of an empty shop",
  /aria-label="Export products" look=\{EXPORT_LOOK\}/.test(list) && /max-md:border-transparent max-md:bg-transparent/.test(list) && /\{products\.length > 0 \? \(\s*<div className="flex shrink-0 items-center gap-1 md:gap-2">\s*<ResponsiveActionMenu/.test(list))
check("nothing floats: no fixed New product over the list or the navigation pill", !/fixed[^"]*bottom-/.test(list.slice(list.indexOf("<PaneBar"), list.indexOf("deleteModalOpen && productToDelete"))))
check("search is a real field that is always there once there are products, not a button that opens one",
  /<label data-search="" className="flex h-11 min-w-0 flex-1 cursor-text items-center md:h-8/.test(list) && /placeholder="Search products"/.test(list) && !/isSearchOpen|setIsSearchOpen/.test(list) && /text-\[16px\][^"]*md:text-\[13px\]/.test(list))
check("Escape clears the field, and so does its clear button", /e\.key === "Escape" && searchQuery/.test(list) && /aria-label="Clear search"[\s\S]{0,400}onClick=\{clearSearch\}/.test(list))
check("the field and Sort stack over the views until the column is 700px wide, by container query, not the window",
  /"@container mx-auto pb-2 md:pb-8"/.test(list) && /@min-\[700px\]:flex-row-reverse/.test(list))
check("the views are All, Active, Draft and Archived, All open first, with no counts", /useState<View>\(resumed\?\.view \?\? "all"\)/.test(list) && /value: "all"[\s\S]{0,80}value: "active"[\s\S]{0,80}value: "draft"[\s\S]{0,80}value: "archived"/.test(list) && !/tabCounts/.test(list))
check("as one segmented control whose white segment slides on transform alone, drawn only when there is more than one view",
  /\{views\.length > 1 \? \(\s*<div\s+role="tablist"/.test(list) && /data-segment=""/.test(list) && /transition-transform duration-200/.test(list) && /motion-reduce:transition-none/.test(list) && /transform: `translateX\(\$\{viewIndex \* 100\}%\)`/.test(list))
check("sort by newest, oldest, title, price and sales", ["newest", "oldest", "title_asc", "title_desc", "price_desc", "price_asc", "sales"].every((s) => list.includes(`value: "${s}"`)) && /\.sort\(compare\(sort\)\)/.test(list))
check("phone rows are 72px with a 56px picture, straight on the page with no card, the name on one 15px line",
  /className="relative flex h-\[72px\] items-center gap-3 pl-4/.test(list) && /size === 56 \? "h-14 w-14 rounded-\[12px\]"/.test(list) && /block truncate text-\[15px\] font-medium leading-5/.test(list) && /aria-label="Products"\s+className="relative mt-1 md:mt-3 md:overflow-hidden md:rounded-2xl/.test(list))
check("price and sales are quiet grey text under the name, and a free product says Free", /data-meta="" className="[^"]*text-\[13px\][^"]*text-\[#6b7280\]"/.test(list) && /cents > 0 \? formatMoney\(cents\) : "Free"/.test(list) && /\{product\.sales_count \? \(/.test(list))
check("a phone row names its status only when it is not on sale, as a dot and a word, not a badge",
  /view === "all" && status !== "live"/.test(list) && /function StatusMark/.test(list) && !/StatusBadge/.test(list) && /bg-\[#e0a100\]/.test(list))
check("a product with no picture shows its first letter, not a box icon", /Array\.from\(title\.trim\(\)\)\[0\]/.test(list) && !/<Package/.test(list))
check("table rows are 64px, the whole row opens the product, and nothing from a menu's portal does", /className="group h-16 cursor-pointer/.test(list) && /openEditor\(router, `\/app\/products\/\$\{product\.id\}`\)/.test(list) && /!e\.currentTarget\.contains\(target\)/.test(list) && !/\{t\("products\.edit"\)\}/.test(list))
check("no grey heading band in the table", !/bg-\[#f7f7f8\] pl-4/.test(list) && /<th scope="col" className="border-b border-\[#eef0f2\] pl-4 pr-3 font-medium">Product<\/th>/.test(list))
check("numbers right aligned in figures of one width, Sales from 1024px", /text-right font-medium tabular-nums text-\[#1a1a2e\]/.test(list) && /hidden w-\[96px\] border-b border-\[#eef0f2\] px-3 text-right font-medium lg:table-cell">Sales/.test(list))
check("fifty to a page, with the footer's count and arrows, the count left off a phone with one page", /const PAGE_SIZE = 50/.test(list) && /data-footer=""/.test(list) && /aria-label="Next page"/.test(list) && /pages === 1 && "max-md:hidden"/.test(list))
check("every phone press is 44px however small it is drawn", /max-md:min-h-11 max-md:min-w-11/.test(list) && /max-md:after:-inset-1\.5/.test(list) && /trigger=\{<RowMenuButton label=\{`Actions for \$\{product\.title\}`\} className=\{ROW_MENU_PHONE\} \/>\}/.test(list) && /after:-inset-\[3px\]/.test(list))
check("the product actions are all still there: view, share, archive or restore, duplicate, delete", /t\("common\.view"\)/.test(list) && /handleShare\(product\)/.test(list) && /handleArchive\(product\)/.test(list) && /handleDuplicate\(product\)/.test(list) && /handleDeleteClick\(product\)/.test(list) && /generateProductsCSV/.test(list) && /generateProductsPDF/.test(list))
check("the phone pane leaves the pill's room to the shared page-scroll rule, not a second padding of its own", /className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll/.test(list) && !/pb-24 md:pb-8/.test(list))
console.log("\nSwitching views, and the way to a product and back")

/* "When I switch between All / Draft / Active / Archived, it should feel smoother." "The image thumbnails should not glitch or flash." */
check("a row once drawn keeps its element: every product shown since the page opened is drawn, the ones out of view hidden, keyed by id",
  /const drawn = useMemo\(\s*\(\) => \[\.\.\.products\]\.sort\(compare\(sort\)\)\.filter\(\(p\) => shownIds\.has\(p\.id\) \|\| kept\.has\(p\.id\)\)/.test(list)
    && (list.match(/\{drawn\.map\(\(product\) => \{/g) ?? []).length === 2 && (list.match(/key=\{product\.id\}\s*data-row=\{product\.id\}\s*hidden=\{!shownIds\.has\(product\.id\)\}/g) ?? []).length === 2
    && !/pageProducts\.map\(\(product\)/.test(list))
check("an empty view hides the lists rather than unmounting them", /\{drawn\.length > 0 \? \(/.test(list) && /\{pageProducts\.length === 0 \? \(\s*<div data-empty=""/.test(list))
check("the hairlines follow the rows shown, not the rows in the page", /\[li:not\(\[hidden\]\)~&\]:before:h-px/.test(list) && /\[tr:not\(\[hidden\]\)~&>td\]:border-t/.test(list) && !/\[&\+li\]|\[&\+tr>td\]/.test(list))
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
check("each picture is its own size, decoded off the main thread, on grey", /<Image src=\{src\} alt="" width=\{size\} height=\{size\} decoding="async"/.test(list) && !/<Image[^>]*\bfill\b/.test(list) && /bg-\[#eceef1\]/.test(list))
check("the list comes back as it was left: its view, order, search and page, kept for the tab", /let leftAt: \{ view: View; sort: Sort; search: string; page: number \} \| null = null/.test(list) && /leftAt = \{ view, sort, search: searchQuery, page \}/.test(list))
/* "The remembered list state should only be restored on a return from the editor (or browser back to the list), not when the Products page is opened fresh." */
check("but only on a return: a fresh visit from the sidebar or the pill starts at All, Newest, no search, page one",
  /const \[resumed\] = useState\(\(\) => \(isReturning\(\) \? leftAt : null\)\)/.test(list)
    && /useState<Sort>\(resumed\?\.sort \?\? "newest"\)/.test(list) && /useState\(resumed\?\.page \?\? 1\)/.test(list) && /useState\(resumed\?\.search \?\? ""\)/.test(list)
    && !/leftAt\?\./.test(list) && /listShown\(\)/.test(list))
check("the row you came back from is tinted as the list comes back, after the layer's move", /const id = takeEdited\(\)/.test(list) && /delay: LAYER_MOTION_MS/.test(list))
check("rows and New product open the editor with the layer's move; a press with a modifier is left to the link",
  /openEditor\(router, href\)/.test(list) && /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(list) && (list.match(/onClick=\{openFromLink\(/g) ?? []).length >= 3)

const layer = code("components/app/page-layer.tsx")
check("the editor comes and goes as one view transition, waiting only for the router's commit, capped at LAYER_WAIT_MS",
  /export const LAYER_MOTION_MS = 300/.test(layer) && /export const LAYER_MOTION_EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(layer) && /export const LAYER_WAIT_MS = 450/.test(layer)
    && /doc\.startViewTransition\(\(\) => \{\s*navigate\(\)/.test(layer) && /move\.skipTransition\(\)/.test(layer) && /if \(waiting\?\.motion === "enter"\) waiting\.landed\(\)/.test(layer) && /if \(waiting\?\.motion === "leave"\) waiting\.landed\(\)/.test(layer))
check("no move under reduced motion or without view transitions: the page swaps as before", /if \(waiting \|\| reduced \|\| typeof doc\.startViewTransition !== "function"\) \{\s*navigate\(\)\s*return/.test(layer))
check("the duration and curve reach the CSS from the script, one number in one place", /html\.style\.setProperty\("--layer-motion-ms", `\$\{LAYER_MOTION_MS\}ms`\)/.test(layer) && /html\.style\.setProperty\("--layer-motion-ease", LAYER_MOTION_EASE\)/.test(layer))
const css = read("app/globals.css")
check("on a phone the layer slides in from the right edge and back out to it; from 768px a fade with a 12px rise",
  /@keyframes layer-slide-out \{\s*to \{ transform: translateX\(100%\); \}/.test(css) && /@keyframes layer-sink-out \{\s*to \{ opacity: 0; transform: translateY\(12px\); \}/.test(css)
    && /html\[data-layer-motion="leave"\]::view-transition-new\(root\) \{\s*animation: none;/.test(css) && /html\[data-layer-motion="leave"\]::view-transition-old\(root\) \{\s*z-index: 1;/.test(css)
    && /animation: layer-sink-out var\(--layer-motion-ms, 300ms\) var\(--layer-motion-ease, ease-out\) both/.test(css) && /mix-blend-mode: normal/.test(css))
check("the pill keeps its place while a layer moves under it", /html\[data-layer-motion\] \[data-app-nav-pill\] \{\s*view-transition-name: app-nav-pill;/.test(css))
check("the stage plays no landing of its own under a layer's move", /if \(document\.documentElement\.dataset\.layerMotion\) return\s*playEntrance\(s\.outer/.test(code("components/app/app-stage.tsx")))
const ret = code("app/app/products/list-return.ts")
/* "Exit must not leave the editor in the browser's forward/back stack in a surprising way." */
check("an editor the list opened goes back in history; one opened any other way is replaced by the list, and neither pushes a new entry",
  /if \(back\) \{[\s\S]{0,120}router\.back\(\)\s*\} else \{\s*markTraversal\(\)\s*router\.replace\(PRODUCTS_HREF\)/.test(ret) && !/router\.push\(PRODUCTS_HREF\)/.test(ret) && /prefetchAppPage\(router, PRODUCTS_HREF\)/.test(ret))
check("\"the list opened it\" is noted when the editor mounts right after the list pushed it, and forgotten once no editor is up",
  /pushedAt = Date\.now\(\)\s*router\.push\(href\)/.test(ret) && /if \(pushedAt !== null && Date\.now\(\) - pushedAt < PUSH_KEPT_MS\) fromList = true/.test(ret)
    && /if \(editors === 0\) fromList = false/.test(ret) && /useListOrigin\(\)/.test(editor))
check("a return is noted by address: the way back from the editor and every popstate, kept until the list shows",
  /window\.addEventListener\("popstate", \(\) => \{\s*returnTo = window\.location\.pathname/.test(ret) && /returnTo = PRODUCTS_HREF/.test(ret) && /return returnTo === PRODUCTS_HREF \|\| isTraversing\(\)/.test(ret))

const probe = read("scripts/check-products-page.mjs")
check("the probe reads the pill's box from its source and measures 360, 390, 430, 768 and 1280", /num\("BAR_H"\)/.test(probe) && /num\("SLOT"\)/.test(probe) && ["phone-360", "phone-390", "phone-430", "tablet-768", "desktop-1280"].every((w) => probe.includes(`"${w}"`)))
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
check("a delete row level security refused is not reported as done", /\.delete\(\)\s*\.eq\("id", productToDelete\.id\)\s*\.select\("id"\)/.test(list) && /if \(!gone\?\.length\)/.test(list))
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
