/**
 * ===========================================================================
 *  THE PRODUCTS AREA: THE EDITOR'S FIRST FRAME, AND THE RULES FOR A CODE
 * ===========================================================================
 * 1. The product editor opens from rows the server read. The pure function
 *    that turns them into the form (app/app/products/new/editor-form.ts) is
 *    pinned here, and so is the absence of the old client-side load.
 * 2. A coupon is checked on the server by readCouponInput and placed in a
 *    view by couponState (lib/checkout/coupons.ts). Both are pure.
 * 3. The shape of the pages: the phone list beside the desktop table, one
 *    bar at the top of the editor and none at its foot, and SQL that pastes.
 */
import { readFileSync, existsSync } from "node:fs"
import { initialForm, snapshotOf, snapshotOfForm, DEFAULT_FAQS, DEFAULT_WHATS_INCLUDED, type LoadedProduct } from "@/app/app/products/new/editor-form"
import { couponState, readCouponInput, CODE_PATTERN } from "@/lib/checkout/coupons"
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
check("opening a product draws no outline and no loading boundary: the old page stays until the editor is here",
  !existsSync("app/app/products/[id]/loading.tsx") && !existsSync("app/app/products/new/loading.tsx")
    && /if \(path\.startsWith\("\/app\/products\/"\)\) return null/.test(read("components/app/route-skeletons.tsx"))
    && !/EditorSkeleton/.test(code("components/app/route-skeletons.tsx")))
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
check("the bar is sticky at the top and holds Cancel and Save", /data-editor-bar=""/.test(editor) && /"sticky top-0 z-30/.test(editor) && /: "Save"\}/.test(editor) && /onClick=\{handleCancel\}/.test(editor))
check("Cmd or Ctrl and S saves", /e\.metaKey \|\| e\.ctrlKey/.test(editor) && /key\.toLowerCase\(\) !== "s"/.test(editor))
const barSource = editor.slice(editor.indexOf('data-editor-bar=""'), editor.indexOf('aria-label="Sections"'))
check("the bar names no product: the name is in the title field", !/savedTitle|\{title\}|"Untitled product"/.test(barSource.replace(/title=\{savedTitle\.trim\(\) \|\| "Product"\}/, "")) && /<h1 className="sr-only">\{productId \? "Edit product" : "New product"\}<\/h1>/.test(barSource))
check("its state is one line of small text: Unsaved changes, Saved, Live or Draft", /data-editor-state=""/.test(barSource) && /text-\[13px\]/.test(barSource) && /Unsaved changes/.test(barSource) && /\bSaved\n/.test(barSource) && /isPublished \? "Live" : "Draft"/.test(barSource) && /flashSaved\(\)/.test(editor))
check("in the middle of two equal columns on a phone, so a state change moves neither Cancel nor Save", /grid h-14 max-w-\[760px\] grid-cols-\[1fr_auto_1fr\]/.test(barSource))
check("first on the screen, as a layer over the app's header, it starts below the status bar", /\[\[data-page-layer\]_&\]:pt-\[env\(safe-area-inset-top\)\]/.test(barSource) && /\[\[data-page-layer\]_&\]:pb-\[calc\(32px\+env\(safe-area-inset-bottom\)\)\]/.test(editor))
check("the editor scrolls as a page-scroll pane, so the pill's room is the shared 104px and nothing else", /className="page-scroll h-full overflow-y-auto/.test(editor) && !/pb-24 sm:pb-8/.test(editor))
check("prices bring up the decimal keypad", (editor.match(/inputMode="decimal"/g) ?? []).length >= 4)

console.log("\nThe Products list on a phone")

const list = code("app/app/products/products-client.tsx")
check("a list under 768px and the table from it", /<ul aria-label="Products" className="md:hidden">/.test(list) && /className="hidden w-full border-collapse md:table"/.test(list))
check("no table forced sideways on a phone", !/min-w-\[500px\]/.test(list) && !/sticky left-0/.test(list))
check("a hover or a finger prefetches the editor in full", /onTouchStart=\{\(\) => warm\(product\.id\)\}/.test(list) && /kind: "full"/.test(list))
const couponsList = code("app/app/coupons/coupons-client.tsx")
check("no Products and Coupons tabs: Coupons is a page of its own again", !existsSync("app/app/products/products-subnav.tsx") && !/ProductsSubnav|products-subnav/.test(list + couponsList + code("app/app/products/skeleton.tsx") + code("app/app/coupons/skeleton.tsx")))
check("with its own title", /<h1[^>]*>Coupons<\/h1>/.test(couponsList))
const sidebar = code("components/app/sidebar.tsx")
check("and its own place in the menu, under Products, where it was", /href: "\/app\/products",[\s\S]{0,160}children: \[\{ href: "\/app\/coupons", label: "Coupons" \}\]/.test(sidebar))
check("a phone gets its own search field and views, 44px each, above the list", /aria-label="Views" className="mt-3 grid h-11 grid-cols-3/.test(list) && /PHONE_FIELD = "h-11 /.test(list) && /text-\[16px\] text-\[#1a1a2e\]/.test(list))
check("rows with a 64px square picture and the name at 16px", /aspect-square w-16 shrink-0/.test(list) && /line-clamp-2 break-words text-\[16px\]/.test(list))
check("the card's own toolbar is a computer's only", /className="hidden h-12 items-center gap-2 border-b border-\[#eef0f2\] px-2 md:flex"/.test(list))

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
