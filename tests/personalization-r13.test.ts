/**
 * PERSONALIZATION FIELDS AND CUSTOM FIELDS (round 13)
 *
 * The owner: "personalization fields blocks inside product information,
 * featured product and every Storelib theme, and in the Storelib backend
 * ... uploading images, uploading text, field labels, everything should
 * work", and custom fields "re-verified, working 100% as intended".
 *
 *   MODEL      lib/products/personalization.ts: fields read and saved, the
 *              editor's problems, answers checked (required, limits, a
 *              photo's answer a cart upload, lib/cart-uploads), handed on
 *   SERVER     lib/products/personalization-server.ts: each line held to
 *              its product's fields, the item named
 *   CART       lib/website-builder/cart.ts and lib/physical/cart-link.ts:
 *              answers on the native cart line, in the link, line breaks kept
 *   COMPAT     an imported theme: the metafield, the fields in the product
 *              form, /cart/add 422 for a missing answer, kept on the line
 *   CHECKOUT   the server's check every checkout's start runs
 *   CUSTOM     custom fields from the editor to every place a theme reads
 *              them
 *   WIRING     the buy buttons, the buy box, the editor, the one
 *              Personalization block (its own asks or the product's fields),
 *              the checkout, the export, the upload routes on storelib.com
 *
 *   node scripts/run-push-tests.mjs (in SUITES)
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const OTHER = "5b1c0000-0000-4000-8000-000000000002"
const PID = "5b1c0000-0000-4000-8000-0000000000a1"
const SMALL = "5b1c0000-0000-4000-8000-0000000000b1"

async function main() {
  const P = await import("../lib/products/personalization")
  const S = await import("../lib/products/personalization-server")

  console.log("\nThe fields as the editor saves them")
  {
    const rows = [
      { ...P.blankField("text"), label: "  Name to engrave ", required: true, maxLength: 12, placeholder: "Up to 12 letters", help: "We engrave it as typed." },
      { ...P.blankField("multiline"), label: "Gift message" },
      { ...P.blankField("image"), label: "Your photo", required: true, maxLength: 99, placeholder: "ignored" },
      { ...P.blankField("text"), label: "" },
    ]
    const saved = P.storedPersonalization(rows)
    check("empty rows are left out, labels trimmed, in order", saved.map((f) => f.label).join("|") === "Name to engrave|Gift message|Your photo", saved)
    check("a photo field keeps no limit and no hint", saved[2].maxLength === null && saved[2].placeholder === "")
    check("a text field keeps its limit, hint and help", saved[0].maxLength === 12 && saved[0].placeholder === "Up to 12 letters" && saved[0].help === "We engrave it as typed." && saved[0].required)
    check("each field has a stable id", saved.every((f) => /^[a-z0-9]{4,16}$/.test(f.id)) && new Set(saved.map((f) => f.id)).size === 3)
    check("read back, the same fields", JSON.stringify(P.readPersonalization(JSON.parse(JSON.stringify(saved)))) === JSON.stringify(saved))
    check("a sixth field is not kept", P.readPersonalization(Array.from({ length: 7 }, (_, i) => ({ label: `F${i}` }))).length === P.MAX_PERSONALIZATION_FIELDS)
    check("the same label twice keeps the first", P.readPersonalization([{ label: "Name" }, { label: "name", type: "image" }]).length === 1)
    check("a leading _ is taken off (Shopify hides those from buyers)", P.readPersonalization([{ label: "__secret" }])[0]?.label === "secret")
    check("junk reads as no fields", P.readPersonalization("x").length === 0 && P.readPersonalization(null).length === 0 && P.readPersonalization({}).length === 0)
    check("a limit over 250 is held to 250", P.readPersonalization([{ label: "A", maxLength: 9000 }])[0].maxLength === 250)
    check("the editor says a field with no name", P.personalizationProblem([{ ...P.blankField(), required: true }]) === "Give every personalization field a name")
    check("  and two with the same name", P.personalizationProblem([{ ...P.blankField(), label: "A" }, { ...P.blankField(), label: "a" }]) === "Two personalization fields have the same name")
    check("  and a name with a leading _", /cannot start with _/.test(P.personalizationProblem([{ ...P.blankField(), label: "_x" }]) ?? ""))
    check("  and nothing for good rows", P.personalizationProblem(rows) === null)
  }

  console.log("\nA photo's answer: one of the store's cart uploads (lib/cart-uploads)")
  {
    const { uploadValue, readUploadValue } = await import("../lib/cart-uploads/rules")
    const url = uploadValue(`${"a".repeat(32)}.${"B".repeat(22)}`, "pet.jpg")
    check("a photo's answer is a cart upload's value, /api/cart/uploads/<id>.<sig>/<name>", P.isUploadValue(url) && readUploadValue(url)?.name === "pet.jpg" && url.includes("/uploads/"), url)
    check("an outside address or words are not an upload", !P.isUploadValue("https://evil.example/x.jpg") && !P.isUploadValue("hello"))
    check("the photo rules are the cart uploads' own: JPEG, PNG, WebP, 10 MB", P.UPLOAD_ACCEPT === "image/jpeg,image/png,image/webp" && P.MAX_UPLOAD_BYTES === 10 * 1024 * 1024)

    const fields = P.storedPersonalization([
      { ...P.blankField("text"), label: "Name", required: true, maxLength: 5 },
      { ...P.blankField("multiline"), label: "Message" },
      { ...P.blankField("image"), label: "Photo", required: true },
    ])
    const none = P.checkAnswers(fields, {})
    check("a missing required answer: Fill in <label>", none.ok === false && none.problem.code === "required" && none.problem.message === "Fill in Name", none)
    const long = P.checkAnswers(fields, { Name: "Alexandra", Photo: url })
    check("one over its limit: too long", long.ok === false && long.problem.code === "too_long" && /at most 5/.test(long.problem.message), long)
    const fake = P.checkAnswers(fields, { Name: "Ana", Photo: "https://evil.example/x.jpg" })
    check("a photo that is not an upload: refused", fake.ok === false && fake.problem.code === "not_an_upload" && fake.problem.message === "Upload the photo for Photo again", fake)
    const good = P.checkAnswers(fields, { name: "  Ana  ", Message: "Happy\r\nbirthday\u0007", Photo: url, "Gift wrap": "yes" })
    check("good answers pass, cleaned: trimmed, line breaks kept, control characters gone", good.ok === true && good.properties.Name === "Ana" && good.properties.Message === "Happy\nbirthday" && good.properties.Photo === url, good)
    check("  the label is the field's own, whatever case the theme posted", good.ok === true && "Name" in good.properties && !("name" in good.properties))
    check("  a property no field names is kept as it was (a theme's own)", good.ok === true && good.properties["Gift wrap"] === "yes")
    const optional = P.checkAnswers(fields.filter((f) => !f.required), {})
    check("optional fields may be empty", optional.ok === true && Object.keys(optional.properties).length === 0)

    const lines = S.checkLines([{ productId: PID, title: "Mug", properties: { Name: "Ana" } }], new Map([[PID, fields]]))
    check("the checkout's check names the item: Mug: Fill in Photo", lines.ok === false && lines.error === "Mug: Fill in Photo", lines)
    const okLines = S.checkLines([{ productId: PID, title: "Mug", properties: { Name: "Ana", Photo: url } }, { productId: OTHER, title: "Tee", properties: { Engraving: "x" } }], new Map([[PID, fields]]))
    check("  and passes good lines, a product without fields untouched", okLines.ok === true && okLines.properties[0]?.Photo === url && okLines.properties[1]?.Engraving === "x", okLines)
  }

  console.log("\nTwo of the same item, personalized twice")
  {
    const priced = [{ productId: PID, variantId: SMALL, quantity: 3 }]
    const sent = [{ productId: PID, variantId: SMALL, quantity: 1, properties: { Name: "Ana" } }, { productId: PID, variantId: SMALL, quantity: 2, properties: { Name: "Bob" } }]
    const back = P.itemsWithAnswers(priced, sent)
    check("a priced line handed on keeps each cart line's answers and quantity", back.length === 2 && back[0].properties?.Name === "Ana" && back[0].quantity === 1 && back[1].properties?.Name === "Bob" && back[1].quantity === 2, back)
    check("  a line without answers is handed on as it was", JSON.stringify(P.itemsWithAnswers(priced, [{ productId: PID, variantId: SMALL, quantity: 3 }])) === JSON.stringify(priced))
  }

  console.log("\nThe website's cart and the checkout link")
  {
    const { addLine, lineKey, parseCart, serializeCart, checkoutItems } = await import("../lib/website-builder/cart")
    const base = { productId: PID, variantId: SMALL, title: "Mug", variantName: null, priceCents: 2000, thumbnailUrl: null, slug: "mug", digital: false, physical: true, quantity: 1 }
    let lines = addLine([], { ...base, properties: { Name: "Ana" } })
    lines = addLine(lines, { ...base, properties: { Name: "Bob" } })
    lines = addLine(lines, { ...base, properties: { Name: "Ana" } })
    check("different answers are different lines; the same answers add up", lines.length === 2 && lines[0].quantity === 2 && lines[1].quantity === 1, lines)
    check("  a line without answers keeps its old key", lineKey(base) === `${PID}::${SMALL}`)
    const again = parseCart(serializeCart(lines))
    check("the cart read back from storage keeps the answers", again.length === 2 && again[1].properties?.Name === "Bob")
    check("checkout gets the answers with each line", checkoutItems(again)[1].properties?.Name === "Bob")
    const { decodeItems, encodeItems, lineProperties } = await import("../lib/physical/cart-link")
    const link = decodeItems(encodeItems([{ productId: PID, variantId: SMALL, quantity: 1, properties: { Message: "Line one\nLine two" } }]))
    check("a long text answer keeps its line breaks through the link", link[0]?.properties?.Message === "Line one\nLine two", link)
    check("  other control characters are spaces", lineProperties({ A: "x\u0007y" })?.A === "x y")
  }

  console.log("\nAn imported theme")
  {
    const { productObject } = await import("../lib/storelib-theme/compat/objects")
    const fields = P.storedPersonalization([{ ...P.blankField("text"), label: 'Name "to" engrave', required: true, maxLength: 12 }, { ...P.blankField("image"), label: "Your photo" }])
    const card = { id: PID, settings: { title: "Mug", slug: "mug", url: "/products/mug", price: "$20.00", available: true, kind: "physical", variants: [{ id: SMALL, name: "Default", price: "$20.00", available: true }], personalization: fields, fields: { material: "Stoneware", care_instructions: "Hand wash\nNo microwave" } } }
    const p = productObject(card as never) as Record<string, any>
    const mf = p.metafields.storelib.personalization
    check("product.metafields.storelib.personalization has one object per field", mf?.value?.length === 2, mf)
    check("  each field: label as typed, type, required, max_length, the input name", mf.value[0].label === 'Name "to" engrave' && mf.value[0].type === "text" && mf.value[0].required === true && mf.value[0].max_length === 12 && mf.value[0].name === 'properties[Name "to" engrave]', mf.value[0])
    check("  a photo: type image, accept and 10 MB", mf.value[1].type === "image" && mf.value[1].accept === "image/jpeg,image/png,image/webp" && mf.value[1].max_size === 10485760 && mf.value[1].max_length === null)
    check("custom fields: product.metafields.custom.material and .value", p.metafields.custom.material.value === "Stoneware" && p.metafields.custom.care_instructions.type === "multi_line_text_field", p.metafields.custom)

    const C = await import("../lib/storelib-theme/compat/personalization")
    check("the fields read back from the metafield as the editor saved them", JSON.stringify(C.personalizationFieldsOf(p).map((f) => [f.label, f.type, f.required, f.maxLength])) === JSON.stringify(fields.map((f) => [f.label, f.type, f.required, f.maxLength])))
    const words = { optional_field: "Optional", upload_photo: "Upload a photo", change_photo: "Change photo", remove_photo: "Remove photo", uploading: "Uploading", photo_added: "Photo added", photo_types: "JPG", photo_failed: "Failed", photo_wait: "Wait", fill_in: "Fill in {label}" }
    const html = C.personalizationHtml(fields, PID, words)
    check("the markup names each input properties[<label>], escaped", html.includes('name="properties[Name &quot;to&quot; engrave]"') && html.includes('maxlength="12"') && /required/.test(html), html.slice(0, 400))
    check("  a photo: a hidden answer input and a file input with no name", /<input type="hidden" name="properties\[Your photo\]" value="" data-storelib-upload-value>/.test(html) && /<input class="sl-pz__file" type="file"[^>]*data-storelib-upload/.test(html) && !/type="file"[^>]*name=/.test(html))
    check("  Optional beside the field that is not required", /Your photo<span class="sl-pz__o">Optional<\/span>/.test(html))
    check("  its script sends a photo to the store's cart uploads (/cart/upload) and keeps its value", html.includes("fetch('/cart/upload'") && html.includes("done.upload.value") && html.includes("window.__slPz"))
    check("  inert in the builder: no script, read only", !C.personalizationHtml(fields, PID, words, { inEditor: true }).includes("<script") && /data-inert/.test(C.personalizationHtml(fields, PID, words, { inEditor: true })))
    const dawn = `<div><form action="/cart/add" method="post" class="installment"></form><form id="f1" action="/cart/add" method="post"><input name="id" value="${SMALL}"><div class="product-form__buttons"><button type="submit" name="add">Add</button></div></form></div>`
    const placed = C.withPersonalizationFields(dawn, "<b>FIELDS</b>")
    check("placed inside the product form, before its buttons, never in the instalments form", placed !== null && placed.indexOf("<b>FIELDS</b>") > placed.indexOf('id="f1"') && placed.indexOf("<b>FIELDS</b>") < placed.indexOf("product-form__buttons"), placed)
    check("  not placed twice", C.withPersonalizationFields(`${html}${dawn}`, "<b>X</b>") === null)
    check("  no product form, no placing", C.withPersonalizationFields("<div>no form</div>", "<b>X</b>") === null)
    check("a theme that reads the metafield draws its own", C.themeReadsPersonalization(["{% for f in product.metafields.storelib.personalization.value %}"]) && !C.themeReadsPersonalization(["{{ product.title }}"]))
    check("an app block kept from a product options app is Storelib's", C.isPersonalizationAppBlock("shopify://apps/infinite-options/blocks/options/abc") && C.isPersonalizationAppBlock(C.PERSONALIZATION_APP_BLOCK) && !C.isPersonalizationAppBlock("shopify://apps/judge-me/blocks/x/y"))

    /* The cart: /cart/add.js holds the answers to the product's fields. */
    const site = await compatSite(fields)
    const { answer } = await import("../lib/storelib-theme/compat/site")
    const st = { cart: [] as never[], note: "", attributes: {} as Record<string, string> }
    const ask = async (method: string, path: string, body: Record<string, unknown> | null, ajax = true) => {
      const [pp, q] = path.split("?")
      const r = await answer(site, { method, path: pp, query: new URLSearchParams(q ?? ""), body, cart: st.cart, note: st.note, attributes: st.attributes, ajax })
      if (r.cart) st.cart = r.cart as never[]
      return r
    }
    const refused = await ask("POST", "/cart/add.js", { id: SMALL, quantity: 1 })
    const said = JSON.parse(String(refused.body)) as { status: number; description: string }
    check("/cart/add.js without a required answer: 422, the words a theme shows", refused.status === 422 && said.description === 'Posture shirt: Fill in Name "to" engrave' && st.cart.length === 0, said)
    const tooLong = await ask("POST", "/cart/add.js", { id: SMALL, quantity: 1, properties: { 'Name "to" engrave': "Thirteen chars" } })
    check("  too long: 422", tooLong.status === 422)
    const fakePhoto = await ask("POST", "/cart/add.js", { id: SMALL, quantity: 1, properties: { 'Name "to" engrave': "Ana", "Your photo": "https://evil.example/a.jpg" } })
    check("  a photo answer that is not an upload: 422", fakePhoto.status === 422)
    const form = await ask("POST", "/cart/add", { id: SMALL, quantity: "1", 'properties[Name "to" engrave]': "  Ana  " }, false)
    check("a form post with properties[<label>] is added, the answer trimmed", form.status >= 300 && form.status < 400 && st.cart.length === 1 && (st.cart[0] as { props?: Record<string, string> }).props?.['Name "to" engrave'] === "Ana", st.cart)
    await ask("POST", "/cart/add.js", { items: [{ id: SMALL, quantity: 1, properties: { 'Name "to" engrave': "Bob" } }] })
    check("the same variant with another answer is a second line", st.cart.length === 2)
    const cartJs = JSON.parse(String((await ask("GET", "/cart.js", null)).body)) as { items: { properties: Record<string, string> }[] }
    check("/cart.js lists each line's answers", cartJs.items.map((i) => i.properties['Name "to" engrave']).join(",") === "Ana,Bob", cartJs.items)
    const pageHtml = String((await ask("GET", "/products/posture-shirt", null, false)).body)
    check("the product page draws the fields inside its product form", /<form[^>]*action="\/cart\/add"[\s\S]*data-storelib-personalization[\s\S]*<\/form>/.test(pageHtml) && pageHtml.includes('name="properties[Name &quot;to&quot; engrave]"'), pageHtml.match(/data-storelib-personalization[^>]*>/)?.[0])
    check("  once, with its script once", (pageHtml.match(/data-storelib-personalization /g) ?? []).length === 1 && (pageHtml.match(/data-storelib-personalization-js/g) ?? []).length === 1)
    const js = JSON.parse(String((await ask("GET", "/products/posture-shirt.js", null)).body)) as { personalization_fields: unknown[] }
    check("/products/<handle>.js lists personalization_fields", Array.isArray(js.personalization_fields) && js.personalization_fields.length === 2, js.personalization_fields)
  }

  console.log("\nCustom fields, everywhere a theme reads them")
  {
    const CF = await import("../lib/products/custom-fields")
    const rows = [
      { key: "Material", value: "Waxed cotton canvas", type: "text" as const, show: true },
      { key: "Care instructions", value: "Machine wash cold.\r\nDry flat.", type: "multiline" as const, show: true },
      { key: "Weight", value: "1,5", type: "number" as const, show: false },
      { key: "Manual", value: "https://example.com/manual.pdf", type: "url" as const, show: true },
    ]
    check("every row passes the editor's check", rows.every((r) => CF.fieldProblem(r) === null))
    check("  a bad number and a bad link are said", CF.fieldProblem({ key: "Weight", value: "heavy", type: "number" }) === "Weight should be a number" && /should be a link/.test(CF.fieldProblem({ key: "Manual", value: "javascript:alert(1)", type: "url" }) ?? ""))
    const stored = CF.storedCustomFields(rows)
    check("saved by name: material, care_instructions, weight, manual", Object.keys(stored).join(",") === "material,care_instructions,weight,manual")
    check("  a comma decimal is saved with a dot", stored.weight.value === "1.5")
    check("  line breaks kept for long text", stored.care_instructions.value === "Machine wash cold.\nDry flat.")
    check("what templates read as fields: plain values", JSON.stringify(CF.cleanCustomFields(stored)) === JSON.stringify({ material: "Waxed cotton canvas", care_instructions: "Machine wash cold.\nDry flat.", weight: "1.5", manual: "https://example.com/manual.pdf" }))
    check("Details lists the shown ones, labelled as typed, in order", CF.shownCustomFields(stored).map((f) => f.label).join("|") === "Material|Care instructions|Manual")
    check("the editor reads its rows back", CF.fieldRows(stored).map((r) => r.key).join("|") === "Material|Care instructions|Weight|Manual")
    const { compileSection } = await import("../lib/storelib-theme/storelib/compile")
    const { renderSection } = await import("../lib/storelib-theme/render")
    const src = ["<template>", '<p class="a">{{ page.product.fields.material }}</p>', "{% for block in products %}<i>{{ block.settings.fields.care_instructions }}</i>{% endfor %}", "</template>", "", "<schema>", '{ "type": "t_fields", "name": "T", "category": "product", "fields": [] }', "</schema>", ""].join("\n")
    const compiled = compileSection(src, { file: "sections/t.storelib" })
    const cardRow = { id: PID, type: "product", settings: { title: "Mug", fields: { material: "Waxed cotton canvas", care_instructions: "Machine wash cold." } } }
    const out = compiled.ok ? renderSection({ compiled: compiled.value, id: "s1", instance: { type: "t", settings: {}, blocks: {}, block_order: [] }, theme: {}, page: { template: "product", path: "/products/mug", in_editor: false, product: cardRow.settings } as never, products: [cardRow], data: { catalog: [cardRow] } } as never).html : ""
    check("a Storelib theme prints page.product.fields.material and block.settings.fields on a card", /Waxed cotton canvas/.test(out) && /Machine wash cold\./.test(out), out.slice(0, 300))
  }

  console.log("\nThe wiring")
  {
    const section = read("components/website-builder/sections/renderers/ProductSection.tsx")
    check("the website's Add to cart and Buy now ask the product's fields first and carry its answers with the blocks' own", (section.match(/personalization\.check\(\)/g) ?? []).length >= 2 && (section.match(/withAnswers\(personalized\.properties, /g) ?? []).length === 3)
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("one Personalization block: its own asks, or set to The product's fields; the product's above the buy buttons without one", /personalization: Personalization,/.test(blocks) && !/personalization: PersonalizationBlock/.test(blocks) && /if \(s\.kind !== "product"\) return <PersonalizationBlock/.test(blocks) && /fieldsHere = !ctx\.hasProductFieldsBlock/.test(blocks))
    const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string; options?: { value: string }[] }[] }[] }
    const pz = schema.blocks.filter((b) => b.type === "personalization")
    check("the product section offers one Personalization block, with The product's fields as a choice", pz.length === 1 && !!pz[0].fields.find((f) => f.id === "kind")?.options?.some((o) => o.value === "product"))
    const { personalizationFields } = await import("../lib/website-builder/personalization")
    check("  a block set to The product's fields asks nothing itself", personalizationFields([{ id: "b1", type: "personalization", settings: { kind: "product" } }, { id: "b2", type: "personalization", settings: { kind: "text", label: "Initials" } }]).map((f) => f.label).join() === "Initials")
    const box = read("components/physical/buy-box.tsx")
    check("the storelib.com product page's buy box asks the fields too", /usePersonalization\(data\?\.personalization\)/.test(box) && (box.match(/personalization\.check\(\)/g) ?? []).length === 2)
    const editor = read("app/app/products/new/product-editor.tsx")
    check("the editor shows the card for a product that ships and saves it in its own request", /productType === "physical" \? <PersonalizationCard/.test(editor) && /update\(\{ personalization:/.test(editor) && /personalizationProblem\(personalization\)/.test(editor))
    const server = read("lib/physical/checkout-server.ts")
    check("every checkout's start checks the answers on the server, after whose photos they are", /personalizedLines\(db, priced\.lines\)/.test(server) && /field: "personalization"/.test(server) && server.indexOf("checkLineFiles(") < server.indexOf("personalizedLines(db, priced.lines)"))
    check("the pick list has the answers in its Properties column", /"Properties", "Offers"\]/.test(read("app/api/physical/orders/export/route.ts")))
    check("ShipStation gets the answers as item options, a photo by its file name", /propertyText\(String\(value\)\)/.test(read("lib/integrations/shipping/shipstation-server.ts")))
    check("the physical checkout keeps the answers from this browser's cart and shows them", /\.\.\.\(l\.properties \? \{ properties: l\.properties \} : \{\}\)/.test(read("app/checkout/physical/physical-checkout.tsx")) && /<CartLineProperties /.test(read("app/checkout/physical/physical-checkout.tsx")))
    check("  and passes this browser's cart cookie, so its photos are its own", /cartVisitor: \(\(\) => \{/.test(read("app/api/physical/checkout/route.ts")))
    check("the basket hand-off keeps them", /itemsWithAnswers\(decision\.items, body\.items\)/.test(read("app/api/checkout/cart/route.ts")))
    const upload = read("app/api/cart/uploads/route.ts")
    check("on storelib.com a photo's store is a published product's that asks for one", /isPlatformHost\(host, getMainDomain\(\)\) \? await storeOfPhotoProduct/.test(upload) && /status !== "published" \|\| data\.type !== "physical"/.test(upload) && /f\.type === "image"/.test(upload))
    check("  and it opens by the upload's own store, the signature still checked", /from\("cart_uploads"\)\.select\("creator_id"\)/.test(read("app/api/cart/uploads/[ref]/[name]/route.ts")) && /openResponse\(request/.test(read("app/api/cart/uploads/[ref]/[name]/route.ts")))
    const sql = read("supabase/sql/run-now/307_product_personalization.sql")
    check("SQL 307: the column, copied byte for byte to migrations; photos are part 308's", /ADD COLUMN IF NOT EXISTS personalization jsonb/.test(sql) && !/storage\.buckets/.test(sql) && sql === read("supabase/migrations/20270217_product_personalization.sql"))
    check("  checked after, like its neighbours", /as p307_product_personalization[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the theme contract is in the repository", /properties\[<label>\]/.test(read("docs/theme-contracts/personalization-and-custom-fields.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

/** The fixture theme from tests/buyer24, with a product that asks for personalization. */
async function compatSite(fields: unknown) {
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert")
  const { themeOfInstall } = await import("../lib/storelib-theme/compat/page")
  const { compatMenus } = await import("../lib/storelib-theme/compat/menus")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  const t = r.theme
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const variants = [{ id: SMALL, name: "Small", price: "$49.00", available: true }]
  const products = [{ id: PID, settings: { title: "Posture shirt", slug: "posture-shirt", url: "/products/posture-shirt", price: "$49.00", image: "", images: [], kind: "physical", available: true, description: "", variants, options: [{ name: "Size", values: ["Small"] }], personalization: fields } }]
  return {
    creatorId: "c",
    theme,
    pages,
    products,
    collections: [],
    menus: compatMenus({ "main-menu": { title: "Main", links: [] } } as never, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}" },
    host: "posturex.storelib.com",
  } as never
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
