/**
 * ===========================================================================
 *  TWO THINGS A CREATOR PAGE GOT WRONG WITHOUT SAYING SO
 * ===========================================================================
 * ENTITIES IN A DESCRIPTION. A product read "...so everyone can purchase
 * calligraphy &nbsp; affordable..." on the live page, with the entity spelled
 * out mid sentence. Descriptions are written in a rich text editor and stored
 * as HTML, and the renderer chooses plain or rich by looking for TAGS — so a
 * description whose markup has been stripped keeps its entities, fails that
 * test, and has every one of them printed as six characters.
 *
 * A PUBLISHED PRODUCT ON NOBODY'S PAGE. A creator who has never opened the
 * page builder got a page that drew the header and then the footer, with
 * nothing in between, however many products they had published. Publishing a
 * product is the act of putting it on sale; there is no second step to
 * explain because there should not be one.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { decodeHtmlEntities } from "@/lib/html-entities"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\n  a description shows the character, not its name")

  const NB = " "
  check("the one from the report",
    decodeHtmlEntities("purchase calligraphy &nbsp; affordable") === `purchase calligraphy ${NB} affordable`)
  check("an ampersand in a shop name", decodeHtmlEntities("Tom &amp; Jerry") === "Tom & Jerry")
  check("the quotes a rich editor produces",
    decodeHtmlEntities("&ldquo;hand drawn&rdquo; &mdash; really") === "“hand drawn” — really")
  check("a numeric entity, decimal and hex",
    decodeHtmlEntities("&#36;20 or &#x24;20") === "$20 or $20")

  /*
    THE ONE THAT DECIDES THE SHAPE OF THE FUNCTION. Decoding `&amp;` first
    and the rest afterwards turns this — which is how somebody writes the
    literal text "&nbsp;" — into a space, and there is no way back from that.
    It is why the decode is a single scan whose output is never re-read.
  */
  check("and a written out entity survives being decoded once",
    decodeHtmlEntities("literally &amp;nbsp; here") === "literally &nbsp; here")

  check("something that is not an entity is left alone",
    decodeHtmlEntities("50 &unknownthing; and A&B") === "50 &unknownthing; and A&B")
  check("a control character is refused rather than made invisible",
    decodeHtmlEntities("&#0; and &#8;") === "&#0; and &#8;")
  check("a surrogate half is refused too", decodeHtmlEntities("&#xD800;") === "&#xD800;")
  check("text with no ampersand in it is returned as it was",
    decodeHtmlEntities("nothing to do here") === "nothing to do here")
  check("and neither is the empty string a problem", decodeHtmlEntities("") === "")

  const renderer = read("components/store-builder/description-rich-editor.tsx")
  check("the plain text branch decodes before it draws",
    /\{decodeHtmlEntities\(html\)\}/.test(renderer))
  check("and the rich branch is untouched, because that one is real HTML",
    !/dangerouslySetInnerHTML=\{\{ __html: decodeHtmlEntities/.test(renderer))

  console.log("\n  a published product is on the creator's page without a second step")

  const page = read("app/(marketing)/u/[username]/page.tsx")
  /*
    The branch for a creator who has never opened the builder. It is found by
    the two things it drew and nothing else: the default header, then the
    footer.
  */
  check("the page only ever asks for published products",
    /\.eq\("status", "published"\)/.test(page))
  check("the unconfigured page draws them",
    /\{productsData\.length > 0 && \([\s\S]{0,400}?<AllProductsGrid/.test(page))
  check("with the same grid the Products tab uses, not a second one",
    (page.match(/<AllProductsGrid/g) ?? []).length === 2)
  check("and the footer still comes after them",
    /<AllProductsGrid[\s\S]{0,400}?\)\}\s*\n\s*<SellerFooter \/>/.test(page))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
