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
import { decodeHtmlEntities, plainSummary } from "@/lib/html-entities"

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

  console.log("\n  a shared product previews as a sentence, not as markup")

  /*
    The description from the report, as the rich editor really stores it. It
    was handed to the meta description untouched, so WhatsApp previewed the
    opening div and nothing else.
  */
  const slate = '<div class="w-full my-[1px]"><div data-slate-node="element" class="py-[3px]">'
    + '<span data-slate-node="text"><span class="font-[600]" data-slate-leaf="true"'
    + ' style="white-space: break-spaces; word-break: break-word;">The Problem:</span></span>'
    + '<span data-slate-node="text"><span class="" data-slate-leaf="true"'
    + ' style="white-space: break-spaces;"> You are&nbsp;running ads</span></span></div></div>'
  check("the one from the report reads as a sentence",
    plainSummary(slate) === "The Problem: You are running ads",
    JSON.stringify(plainSummary(slate)))
  check("no angle bracket survives it", !/[<>]/.test(plainSummary(slate)))

  /*
    Removing the tags without leaving a gap runs the last word of a paragraph
    into the first word of the next, and a preview is mostly first sentences.
  */
  check("a paragraph break becomes a space, not nothing",
    plainSummary("<p>one</p><p>two</p>") === "one two")
  check("a line break too", plainSummary("first<br>second") === "first second")
  check("a script's contents are not its text",
    plainSummary("<script>alert(1)</script>after") === "after")
  check("plain text is left as it is", plainSummary("plain text, no markup") === "plain text, no markup")
  check("nothing is nothing", plainSummary(null) === "" && plainSummary("") === "")

  check("a long one is cut at a word and marked",
    (() => {
      const out = plainSummary("word ".repeat(80), 60)
      return out.length <= 61 && out.endsWith("\u2026") && !/\s\u2026$/.test(out)
    })(),
    JSON.stringify(plainSummary("word ".repeat(80), 60)))

  const productPage = read("app/(marketing)/p/[slug]/page.tsx")
  check("the product page summarises before it shares",
    /const pageDescription = ownDescription \|\| plainSummary\(product\.description\)/.test(productPage))
  check("and so does the structured data a search result is drawn from",
    /description: plainSummary\(product\.description, 5000\)/.test(productPage))
  check("nothing hands the raw description to a reader of plain text any more",
    !/description: product\.description \|\| undefined/.test(productPage)
      && !/const pageDescription = product\.description \|\|/.test(productPage))

  console.log("\n  a published product is on the creator's page without a second step")

  const page = read("app/(marketing)/u/[username]/page.tsx")
  /*
    The branch for a creator who has never opened the builder. It is found by
    the two things it drew and nothing else: the default header, then the
    footer.
  */
  check("the page only ever asks for published products",
    /\.eq\("status", "published"\)/.test(page))
  /*
    The products moved INTO a tab strip on this branch, so that a creator who
    has never opened the builder gets the same Home / Products / Communities
    as everyone else. What this check is about is unchanged: they are drawn,
    by the same grid, with the footer after them.
    See tests/creator-page-default.test.ts.
  */
  check("the unconfigured page draws them",
    /* Round 9: no products returns early with the no products page (no Home over nothing); every other page's Home is the grid. */
    /if \(productsData\.length === 0\) \{\s*const bare = tabsWithoutProducts\(/.test(page) && /label: "Home",\s*\n\s*panel: \(\s*\n\s*<AllProductsGrid/.test(page))
  /*
    AND THE OTHER WAY TO THE SAME EMPTY PAGE. Only the Featured section draws
    a catalogue, so a page ARRANGED without one showed no products either —
    a different branch from the unconfigured page above, with the same
    result, which is why this was reported a second time after the first was
    fixed.
  */
  check("a configured page with no Featured section draws them too",
    /const showsProducts = regularSections\.some\(\(s\) => s\.type === "featured-products"\)/.test(page)
      && /\{!showsProducts && productsData\.length > 0 && \(/.test(page))
  check("and a page that HAS one is left alone, so nothing is shown twice",
    /!showsProducts &&/.test(page))
  check("with the same grid the Products tab uses, not a third one",
    (page.match(/<AllProductsGrid/g) ?? []).length === 4,
    "the configured Products tab, the Home fallback for a page with no Featured section, and the unconfigured branch's own Home and Products panels",
  )
  check("and the footer still comes after them",
    /return <StorefrontTabs tabs=\{tabs\} \/>[\s\S]{0,2000}?<SellerFooter \/>/.test(page))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
