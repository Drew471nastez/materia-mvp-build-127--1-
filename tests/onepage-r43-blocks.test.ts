/**
 * ===========================================================================
 *  ROUND 43: THE PRODUCT SHEET, THE EMAIL SIGNUP'S NEW LAYOUTS, LAYOUT PREVIEWS
 * ===========================================================================
 * The rules behind what scripts/check-onepage-r43.mjs measures in a browser:
 *
 *   SHEET      options as the product page chooses them (lib/onepage/product-sheet on lib/products/product-page-model),
 *              swatches (a colour, the seller's own, a variant's photo), sizes as pills, a variant's own picture,
 *              "Save 24%", the price on the button when asked ("Buy now · €49"), personalization on the cart line
 *   SIGNUP     Connect, Letter and Bar are layouts the page draws and the editor offers; Connect gets "Connect
 *              with" only over the standard words
 *   GROUPS     product tiles inside a group sit two to a row
 *   PREVIEWS   the product and link layout pickers draw each layout in the page's own colours
 *
 *   npx tsx tests/onepage-r43-blocks.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { optionLook, savedPercent, sheetImageFor, sheetImages, sheetModel, sheetStartChoice, sheetValued, valueSwatch, isSizeOption } from "@/lib/onepage/product-sheet"
import { choose, pickerOptions, valueAvailable, variantFor } from "@/lib/products/product-page-model"
import { sheetButtonLabel, sheetButtonPrice } from "@/lib/onepage/product-block"
import { EMAIL_SIGNUP_LAYOUT_IDS, connectButtonPatch, emailSignupLayout, emailSignupStacked, emailSignupShowsAvatar } from "@/lib/onepage/email-signup"
import { EmailLayoutThumb } from "@/components/onepage/email-signup"
import { physicalCheckoutHref, decodeItems } from "@/lib/physical/cart-link"
import type { ProductFacts } from "@/components/checkout/instant-checkout"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
  }
}
function section(t: string) {
  console.log(`\n${t}\n`)
}
const code = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

type P = ProductFacts["product"]
const v = (color: string, size: string, extra: Partial<P["variants"][number]> = {}): P["variants"][number] => ({
  id: `${color}-${size}`,
  name: `${color} / ${size}`,
  description: null,
  priceCents: size === "XL" ? 4900 : 4500,
  pwyw: false,
  options: [color, size, null],
  imageUrl: `https://cdn.test/${color.toLowerCase()}.jpg`,
  compareAtCents: 5900,
  available: true,
  ...extra,
})
const tee: Pick<P, "variants" | "options"> = {
  options: [
    { name: "Color", values: ["Black", "Ocean"], swatches: { Ocean: "photo" } },
    { name: "Size", values: ["S", "M", "XL"] },
  ],
  variants: [v("Black", "S"), v("Black", "M", { available: false }), v("Black", "XL"), v("Ocean", "S"), v("Ocean", "M"), v("Ocean", "XL")],
}
const licences: Pick<P, "variants" | "options"> = {
  variants: [
    { id: "a", name: "Personal", description: null, priceCents: 2900, pwyw: false },
    { id: "b", name: "Commercial", description: null, priceCents: 7900, pwyw: false },
  ],
}

section("The sheet chooses as the product page does")
{
  const m = sheetModel(tee)
  check("a product with option values is valued; licences are not", sheetValued(m) && !sheetValued(sheetModel(licences)))
  check("it opens on the first variant that can be bought", sheetStartChoice(m).join() === "Black,S")
  check("  licences open on none chosen, so the buyer picks", sheetStartChoice(sheetModel(licences)).join() === "")
  check("  one licence is chosen for the buyer", sheetStartChoice(sheetModel({ variants: [licences.variants[0]] })).join() === "Personal")
  check("one row per option, in order", pickerOptions(m).map((o) => o.name).join() === "Color,Size")
  check("a sold out value is said so", valueAvailable(m, ["Black", "S"], 1, "M") === false && valueAvailable(m, ["Ocean", "S"], 1, "M") === true)
  check("a choice names its variant", variantFor(m, choose(m, ["Black", "S"], 1, "XL"))?.id === "Black-XL")
  check("a colour option is swatches, a size is pills", optionLook(m.options![0]) === "swatch" && optionLook(m.options![1]) === "pill")
  check("  a named colour is its colour", (valueSwatch(m.options![0], 0, "Black", m) as { color?: string }).color === "#111111")
  check("  the seller's photo swatch is the variant's photo", JSON.stringify(valueSwatch(m.options![0], 0, "Ocean", m)) === JSON.stringify({ kind: "photo", src: "https://cdn.test/ocean.jpg" }))
  check("  an option the seller gave swatches is swatches whatever its name", optionLook({ name: "Finish", values: ["Matte"], swatches: { Matte: "#222222" } }) === "swatch" && optionLook({ name: "Edition", values: ["A"], swatches: { A: "#222222" } }) === "swatch")
  check("the size option is found in the shop's languages", isSizeOption("Size") && isSizeOption("Größe") && isSizeOption("Taille") && !isSizeOption("Color"))
  const images = sheetImages(["https://cdn.test/main.jpg", "https://cdn.test/black.jpg?w=800"], m)
  check("pictures: the product's, then each variant's own once", images.join() === "https://cdn.test/main.jpg,https://cdn.test/black.jpg?w=800,https://cdn.test/ocean.jpg", images)
  check("  a variant's picture is found among them", sheetImageFor(images, m.variants!.find((x) => x.id === "Ocean-M")) === 2 && sheetImageFor(images, m.variants!.find((x) => x.id === "Black-S")) === 1)
  check("  none at all: the block's own picture", sheetImages([], sheetModel(licences), "https://cdn.test/block.jpg").join() === "https://cdn.test/block.jpg")
  check("a compare at price is only kept above the price", sheetModel({ variants: [{ ...v("A", "S"), compareAtCents: 100 }] }).variants![0].compare_at_cents === null)
}

section("The price, the sale badge and the button")
{
  check("Save 24% for 45 against 59", savedPercent(4500, 5900) === 24)
  check("  nothing saved, nothing said", savedPercent(4500, 4500) === null && savedPercent(4500, null) === null && savedPercent(6000, 5900) === null)
  check("the price on the button when asked", sheetButtonLabel("Buy now", "€49.00", true) === "Buy now · €49.00" && sheetButtonLabel("Buy now", "€49.00", false) === "Buy now")
  check("  never on a free one or before the price is known", sheetButtonLabel("Get it free", "Free", true) === "Get it free" && sheetButtonLabel("Buy now", null, true) === "Buy now")
  check("  off unless the creator turned it on", !sheetButtonPrice({}) && sheetButtonPrice({ sheet_button_price: true }))
  const sheet = code("components/onepage/product-sheet.tsx")
  check("the sheet labels its button through it, and names the option missing", /sheetButtonLabel\(words, price, priceOnButton\)/.test(sheet) && /`Choose \$\{/.test(sheet))
  check("the block hands the sheet the creator's choice and the page's faces", /priceOnButton=\{sheetButtonPrice\(data\)\}/.test(code("components/onepage/product-block.tsx")) && /font=\{\{ body: fontStack\(theme\.font_family\)/.test(code("components/onepage/product-block.tsx")))
  check("the editor offers it under the sheet's checkout button", /tt\("Price on the button"\)/.test(code("components/onepage/tabs/product-block-editor.tsx")) && /sheet_button_price: on/.test(code("components/onepage/tabs/product-block-editor.tsx")))
}

section("Personalization goes on the cart line")
{
  const href = physicalCheckoutHref("shop1", [{ productId: "11111111-1111-4111-8111-111111111111", variantId: "22222222-2222-4222-8222-222222222222", quantity: 2, properties: { "Name on the sleeve": "Ana" } }], null)
  const items = decodeItems(new URL(href, "https://storelib.com").searchParams.get("items"))
  check("the cart link keeps what the buyer wrote", items[0]?.properties?.["Name on the sleeve"] === "Ana" && items[0]?.quantity === 2, items)
  const sheet = code("components/onepage/product-sheet.tsx")
  check("the sheet checks the answers before it leaves", /const answers = personal\.check\(\)/.test(sheet) && /if \(answers === null\) return/.test(sheet))
  const route = code("app/api/onepage/product/route.ts")
  check("the product's read carries its options, personalization and each variant's values", /options: section\?\.options \?\? \[\]/.test(route) && /personalization: section\?\.personalization \?\? \[\]/.test(route) && /options: s\.options, imageUrl: s\.image_url/.test(route))
}

section("The email signup's eight layouts")
{
  check("eight layouts, the five kept in place", EMAIL_SIGNUP_LAYOUT_IDS.join() === "default,pro,cover,bold,minimal,connect,letter,bar")
  check("the new ones read back", ["connect", "letter", "bar"].every((l) => emailSignupLayout(l) === l) && emailSignupLayout("nope") === "default")
  check("Connect and Letter keep one row whatever the words", !emailSignupStacked("connect", "A very long button text") && !emailSignupStacked("letter", "A very long button text"))
  check("Connect, Letter and Bar show the creator's picture", ["connect", "letter", "bar"].every((l) => emailSignupShowsAvatar(l as never)) && !emailSignupShowsAvatar("default"))
  check("Connect gives the standard button 'Connect with'", JSON.stringify(connectButtonPatch({}, "Connect with")) === JSON.stringify({ button_preset: "custom", custom_button_text: "Connect with" }) && connectButtonPatch({ button_preset: "subscribe" }, "x") !== null)
  check("  and keeps words the creator chose", connectButtonPatch({ button_preset: "join" }, "x") === null && connectButtonPatch({ button_preset: "custom", custom_button_text: "Say hi" }, "x") === null)
  for (const layout of ["connect", "letter", "bar"] as const) {
    const html = renderToStaticMarkup(createElement(EmailLayoutThumb, { layout, image: null, theme: { text_color: "#111113", button_color: "#1a1a2e" }, avatar: "https://cdn.test/me.jpg" }))
    check(`the ${layout} thumbnail is drawn, with the creator's picture`, html.includes(`data-email-thumb="${layout}"`) && html.includes("https://cdn.test/me.jpg"))
  }
  const page = code("components/onepage/public-onepage.tsx")
  check("the page draws the pill and the line forms", /shape === "pill"/.test(page) && /data-email-form="pill"/.test(page) && /shape === "line"/.test(page))
  check("  and hands the view the creator's picture", /avatar=\{\{ src: onePageImageSrc\(profile\.avatar_url, 128\) \|\| null, name: profile\.title \|\| "" \}\}/.test(page))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("the editor offers the three", ['tt("Connect")', 'tt("Personal note")', 'tt("Bar")'].every((w) => tab.includes(w)) && /connectButtonPatch\(data, tt\("Connect with"\)\)/.test(tab))
}

section("Product tiles in a group, and the layout previews")
{
  const page = code("components/onepage/public-onepage.tsx")
  check("a stacked group pairs its product tiles", /pairProductTiles\(enabledChildren, theme\)\.map/.test(page))
  const editor = code("components/onepage/tabs/product-block-editor.tsx")
  check("the product layout picker draws each layout in the page's colours, with the product's picture", /<ProductLayoutThumb id=\{id\} theme=\{theme\} image=\{image\} \/>/.test(editor) && !/function LayoutSketch/.test(editor))
  check("the link's layouts too, drawn in the page's colours with its picture (components/onepage/block-settings)", /* Changed on purpose (round AL): with the link's own title too. */ /* Changed on purpose (round AQ): its icon and description too. */ /<LinkVariantThumb id=\{id\} theme=\{theme\} image=\{image\} title=\{data\.label\} icon=\{icon\} subtitle=\{p\.subtitle\} \/>/.test(code("components/onepage/block-settings.tsx")) && /<LinkLayoutPicker block=\{block\}/.test(code("components/onepage/tabs/links-tab.tsx")))
  const de = code("lib/i18n/catalog/de.ts")
  check("the editor's new words are translated", ["Price on the button", "Connect", "Personal note", "Bar", "Connect with"].every((w) => de.includes(`"${w}":`)))
  const visitor = [code("components/onepage/product-sheet.tsx"), code("components/onepage/email-signup.tsx")].join("\n")
  check("no em dashes in what a visitor reads", !visitor.includes("—"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
