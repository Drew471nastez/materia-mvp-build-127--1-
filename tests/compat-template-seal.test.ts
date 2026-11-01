/**
 * 1 Nov 2026 (andrewrullz, Materia): the editor's canvas stopped after the
 * FAQ section, the footer and everything after it listed but never drawn,
 * nothing could be selected, and adding a section did nothing.
 *
 * The theme's snippets/faq-live-accordion.storelib, written on GitHub, keeps
 * its icons in an HTML `<template data-faq-icons>` whose `</template>` stands
 * alone on its line. The engine ended the file's own `<template
 * compat="shopify">` at the first such line, so the snippet was cut inside
 * its icons' <template>: the FAQ lost its questions and the page was left
 * with a <template> open. A browser read the rest of the page into it: the
 * footer, the phone's tab bar, the popups, and the canvas bridge printed at
 * the end of the body (the live site lost its footer the same way).
 *
 *   - a compatible file's own block ends at the `</template>` line that only
 *     blank lines and its `<schema>` follow (theme.ts compatTemplateEnd), in
 *     the engine, the GitHub format check and the schema check alike
 *   - whatever a section still leaves open (a <template>, a <textarea>, a
 *     <script>, a comment) is closed where the section ends (seal.ts), the
 *     section says so in its errors, and the canvas and the Add a section
 *     cards report it to /api/client-errors
 *
 * The browser half, on the real theme: scripts/check-compat-stalls.mjs and
 * scripts/check-canvas-stalls.mjs measure the cards and the canvas.
 */
import { CompatTheme, compatMarkupOf, compatTemplateEnd, splitCompatFile } from "../lib/storelib-theme/compat/theme"
import { drawPage, type StoredSection } from "../lib/storelib-theme/compat/page"
import { SEALED_NOTE, sealMarkup } from "../lib/storelib-theme/compat/seal"
import { fitToThemeFormat } from "../lib/github-sync/format"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}

/* The theme's snippet as it is on GitHub: an icons <template> whose closing tag is a line of its own, unguarded. */
const SNIPPET = `<template compat="shopify">
<div class="faq__list">
      <template data-faq-icons>
        <svg data-icon="chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </template>
{%- for block in section.blocks -%}
  <details class="faq__item"><summary>{{ block.settings.question }}</summary></details>
{%- endfor -%}
</div>
</template>
`
const FAQ = `<template compat="shopify">
<div class="faq">{%- render 'faq-live-accordion', section: section -%}</div>
</template>

<schema>
{ "type": "faq-pro", "name": "FAQ", "settings": [], "blocks": [{ "type": "question", "name": "Question", "settings": [{ "type": "text", "id": "question", "label": "Question" }] }] }
</schema>
`
const FOOTER = `<template compat="shopify">
<footer class="ft">Footer here</footer>
</template>

<schema>
{ "type": "footer", "name": "Footer", "settings": [] }
</schema>
`

console.log("\nA compatible file's own block ends where its schema starts, not at its markup's own </template>\n")
{
  check("the snippet's markup goes on past its icons' </template>", compatMarkupOf(SNIPPET).includes("faq__item") && compatMarkupOf(SNIPPET).includes("data-faq-icons"), compatMarkupOf(SNIPPET))
  const split = splitCompatFile(FAQ)
  check("a section's schema is still read", (split.schema as { type?: string } | null)?.type === "faq-pro", split.schema)
  const lines = SNIPPET.split("\n")
  check("the end is the file's last </template> line", compatTemplateEnd(lines, 0) === lines.length - 2, compatTemplateEnd(lines, 0))
  /* A file with text after its block that is not a schema: as before, the first such line. */
  const odd = ["<template compat=\"shopify\">", "<p>a</p>", "</template>", "notes"]
  check("with something other than a schema after it, the first </template> line, as before", compatTemplateEnd(odd, 0) === 2)
  check("no </template> line at all: -1", compatTemplateEnd(["<template compat=\"shopify\">", "<p>a</p>"], 0) === -1)
  const pushed = fitToThemeFormat("sections/faq-pro.storelib", FAQ.replace('{%- render', '<template data-x>\n</template>\n{%- render'), { compat: true })
  check("a push of such a section keeps it whole (GitHub format check)", pushed.ok && pushed.text.includes("faq-live-accordion"), pushed)
}

console.log("\nThe page goes on after the FAQ: its footer and what the builder prints after it\n")
{
  const files: Record<string, string> = {
    "layout/theme.storelib": `<template compat="shopify">\n<html><head></head><body><main>{{ content_for_layout }}</main></body></html>\n</template>\n`,
    "snippets/faq-live-accordion.storelib": SNIPPET,
    "sections/faq-pro.storelib": FAQ,
    "sections/footer.storelib": FOOTER,
  }
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const sections: StoredSection[] = [
    { id: "faq_pro_A33MNp", type: "faq-pro", settings: {}, blocks: [{ id: "q1", type: "question", settings: { question: "What makes Prime1 different?" } }] },
    { id: "footer", type: "footer", settings: {} },
  ]
  const page = { template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "S" } }
  const drawn = drawPage(theme, page as never, sections, { scripts: true, extraBodyEnd: "<script>/*BRIDGE*/</script>" })
  const bridgeAt = drawn.html.indexOf("/*BRIDGE*/")
  check("the FAQ's questions are drawn", drawn.html.includes("What makes Prime1 different?"), drawn.html.slice(0, 600))
  check("the footer is drawn", drawn.html.includes("Footer here"))
  check("nothing is left open before the footer", sealMarkup(drawn.html.slice(0, drawn.html.lastIndexOf("<", drawn.html.indexOf('id="shopify-section-footer"')))).closed.length === 0)
  check("nothing is left open before the builder's bridge", bridgeAt > 0 && sealMarkup(drawn.html.slice(0, bridgeAt - "<script>".length)).closed.length === 0)
  check("and no section says it left anything open", Object.values(drawn.errors).flat().every((e) => !e.startsWith(SEALED_NOTE)), drawn.errors)
}

console.log("\nA section that does leave something open is closed where it ends, and says so\n")
{
  const open = (markup: string) => `<template compat="shopify">\n${markup}\n</template>\n\n<schema>\n{ "type": "x", "name": "X", "settings": [] }\n</schema>\n`
  for (const [what, markup] of [
    ["a <template>", `<div><template data-icons><svg></svg></div>`],
    ["a <textarea>", `<form><textarea name="note">`],
    ["a <script>", `<script>var a = 1`],
    ["a <style>", `<style>.a{color:red}`],
    ["a comment", `<div><!-- not closed`],
  ] as const) {
    const files: Record<string, string> = {
      "layout/theme.storelib": `<template compat="shopify">\n<html><head></head><body>{{ content_for_layout }}</body></html>\n</template>\n`,
      "sections/x.storelib": open(markup),
      "sections/footer.storelib": FOOTER,
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const drawn = drawPage(theme, { template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "S" } } as never, [{ id: "bad", type: "x", settings: {} }, { id: "footer", type: "footer", settings: {} }], { scripts: true, extraBodyEnd: "<script>/*BRIDGE*/</script>" })
    const footerAt = drawn.html.indexOf('id="shopify-section-footer"')
    check(`${what} left open: the footer after it is in the page`, footerAt > 0 && sealMarkup(drawn.html.slice(0, footerAt - 5)).closed.length === 0, drawn.html.slice(0, footerAt + 40))
    check(`  and the section says so in its errors`, (drawn.errors.bad ?? []).some((e) => e.startsWith(SEALED_NOTE)), drawn.errors)
  }
}

console.log("\nMarkup that was whole is never changed\n")
{
  const whole = [
    `<div class="a"><template data-x><span>1</span></template><p>2</p></div>`,
    /* Materia's products grid: notes written as comments inside a tag's attributes, which a browser reads as attribute names. */
    `<div class="item"\n  <!--\n  Added\n  transition\n  classes\n  --\n>\n<p>x</p></div>`,
    `<script>if (a < b && "</div>") { document.write("<template>") }</script><p>after</p>`,
    `<style>.a::before{content:"<!--"}</style><p>after</p>`,
    `<a title="1 > 0 <template>">x</a>`,
    `<!-- a note --><textarea>text with <template> in it</textarea>`,
  ]
  for (const html of whole) {
    const r = sealMarkup(html)
    check(`unchanged: ${html.replace(/\s+/g, " ").slice(0, 60)}`, r.html === html && r.closed.length === 0, r)
  }
  const r = sealMarkup(`<div><template a><template b></div>`)
  check("two <template>s left open: both closed", r.html.endsWith("</template></template>") && r.closed.length === 1, r)
  const s = sealMarkup(`<template x><script>var a`)
  check("a <script> inside an open <template>: the script closed first, then the template", s.html.endsWith("</script></template>"), s)
}

console.log("\nThe builder says it to the error log\n")
{
  const guard = readCode("lib/website-builder/load-guard.ts")
  check("reportSealed reports each section that left something open", /export function reportSealed/.test(guard) && /SEALED_NOTE/.test(guard) && /reportLoadProblem\(where, `section \$\{id\}/.test(guard))
  const canvas = readCode("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas reports what its page's sections left open", /reportSealed\("compat-canvas", \(drawn as [^)]*\)\.errors\)/.test(canvas))
  const preview = readCode("components/website-builder/compat/compat-section-preview.tsx")
  check("the Add a section cards report it too", /reportSealed\("section-preview"/.test(preview))
  const theme = readCode("lib/storelib-theme/compat/theme.ts")
  check("every section of an imported theme is sealed where it ends", /const sealed = sealMarkup\(html\)/.test(theme))
  const sync = readCode("lib/storelib-theme/compat/schema-sync.ts")
  const format = readCode("lib/github-sync/format.ts")
  check("the schema check and the GitHub format check read the block's end the same way", /compatTemplateEnd\(lines, start\)/.test(sync) && /compatTemplateEnd\(lines, start\)/.test(format))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
