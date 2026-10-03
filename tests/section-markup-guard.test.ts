/**
 * ===========================================================================
 *  A SECTION'S TEMPLATE CANNOT PUT ANYTHING ON A PAGE THAT RUNS
 * ===========================================================================
 * The checks a template meets when it is saved read its source, and a name
 * the source only spells once it is drawn got past them: a handler split
 * around an output, a tag, a javascript: address, a value dropped where an
 * attribute name goes, a srcdoc page. Each of those saved without a word and
 * drew live markup, on the site's own address and on storelib.com/w/<name>,
 * where a visitor's session is.
 *
 * lib/storelib-theme/storelib/raw-html.ts guardSectionMarkup now reads every
 * drawn section the way a browser's tokenizer reads it (render.ts, the one
 * place every section is drawn), and this holds it to three things:
 *
 *   ATTACKS    each of those sections still saves, and draws nothing that runs
 *   GUARD      the markup a browser would run is changed, and only that
 *   NOTHING    every section in the repository draws byte for byte as before
 *   ELSE
 *
 * scripts/check-section-guard.mjs puts the same cases in front of Chromium.
 */
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection, renderSection } from "../lib/storelib-theme"
import { resolveInstance, themeTokens } from "../lib/storelib-theme/resolve"
import { renderTemplate, stripDocumentMarkup, type CompiledTemplate } from "../lib/storelib-theme/storelib/template"
import { guardSectionMarkup } from "../lib/storelib-theme/storelib/raw-html"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/** What a browser could run in some markup: a handler, a script, a srcdoc page, a javascript: address. */
function runs(html: string): string | null {
  const handler = html.match(/<[a-z][^>]*[\s/"']on[a-z]+\s*=/i)
  if (handler) return handler[0]
  const script = html.match(/<script\b/i)
  if (script) return script[0]
  const srcdoc = html.match(/<[a-z][^>]*[\s/"']srcdoc\s*=/i)
  if (srcdoc) return srcdoc[0]
  const address = html.match(/(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i)
  return address ? address[0] : null
}

const sectionSource = (type: string, template: string, settings: object[], capabilities: string[] = []) =>
  `<template>\n${template}\n</template>\n\n<schema>\n${JSON.stringify({ type, name: type, settings, ...(capabilities.length ? { capabilities } : {}), presets: [{ name: type }] })}\n</schema>\n`
const text = (id: string) => ({ type: "text", id, label: id, default: "" })

function main() {
  console.log("\nSections that saved and drew live markup now draw nothing that runs")
  const attacks: [string, string, object[], Record<string, string>, string[]?][] = [
    ["a handler split around an output", `<img src="https://x.test/a.png" on{{ settings.e }}error="alert(1)">`, [text("e")], {}],
    ["a script tag split around an output", `<scr{{ settings.e }}ipt>alert(1)</scr{{ settings.e }}ipt>`, [text("e")], {}],
    ["a javascript: address split around an output", `<a href="java{{ settings.e }}script:alert(1)">x</a>`, [text("e")], {}],
    ["a value dropped into an unquoted attribute", `<div class={{ settings.c }}>hi</div>`, [text("c")], { c: "x onmouseover=alert(1)" }],
    ["a value dropped where an attribute name goes", `<div {{ settings.a }}="alert(1)">hi</div>`, [text("a")], { a: "onclick" }],
    ["a srcdoc page split around an output", `<iframe src="{{ settings.v | embed }}" src{{ settings.e }}doc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>`,
      [text("e"), { type: "url", id: "v", label: "v", default: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }], {}, ["embed"]],
    ["a javascript: address typed into a link setting", `<a href="{{ settings.link }}">x</a>`, [text("link")], { link: "javascript:alert(document.cookie)" }],
  ]
  for (const [name, template, settings, values, capabilities] of attacks) {
    const type = name.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)
    const compiled = compileSection(sectionSource(type, template, settings, capabilities ?? []), { file: `sections/${type}.storelib` })
    if (compiled.ok !== true) {
      check(`${name}: saves`, false, compiled.errors.map((e) => e.message))
      continue
    }
    const resolved = { ...Object.fromEntries(settings.map((s) => [(s as { id: string }).id, (s as { default: string }).default])), ...values }
    const unguarded = stripDocumentMarkup(renderTemplate(compiled.value.template as CompiledTemplate, {
      settings: resolved, blocks: [], theme: {}, scheme: {}, page: { template: "index" }, products: [], section: { id: "s1", type }, assets: {},
    } as never))
    const drawn = renderSection({ compiled: compiled.value, id: "s1", instance: { settings: values, blocks: [], block_order: [] } as never, theme: {}, page: { template: "index" } as never }).html
    check(`${name}: saves, would have drawn live markup, and draws none now`, runs(unguarded) !== null && runs(drawn) === null, { unguarded: runs(unguarded), drawn: runs(drawn) })
  }

  console.log("\nThe guard changes what a browser would run, and only that")
  const cases: [string, string, string][] = [
    ["a handler is taken out", `<img src=x onerror=alert(1)>`, `<img src=x >`],
    ["after a slash too", `<img/onerror=alert(1) src=x>`, `<img/ src=x>`],
    ["but a slash inside an unquoted value is the value's, as a browser reads it", `<img/src=x/onerror=alert(1)>`, `<img/src=x/onerror=alert(1)>`],
    ["and straight after a quote", `<img src="x"onerror="alert(1)">`, `<img src="x">`],
    ["a script shows as words", `<script>alert(1)</script>`, `&lt;script>alert(1)</script>`],
    ["and what was in its quotes is read as page text", `<script title="<img src=x onerror=a>">`, `&lt;script title="<img src=x >">`],
    ["srcdoc is taken out", `<iframe src="https://x.test" srcdoc="&lt;b&gt;"></iframe>`, `<iframe src="https://x.test" ></iframe>`],
    ["a javascript: link becomes #", `<a href="javascript:alert(1)">x</a>`, `<a href="#">x</a>`],
    ["however it is spelled", `<a href="jav&#x61;script:alert(1)">x</a>`, `<a href="#">x</a>`],
    ["an unquoted one too", `<a href=javascript:alert(1)>x</a>`, `<a href="#">x</a>`],
    ["a javascript: frame is emptied", `<iframe src="javascript:alert(1)"></iframe>`, `<iframe src=""></iframe>`],
    ["an svg animation that sets one is taken out", `<svg><a><animate attributeName=href values="javascript:alert(1)"/></a></svg>`, `<svg><a><animate attributeName=href /></a></svg>`],
    ["markup a browser reads as text stays text in every browser", `<noscript><p title="</noscript><img src=x onerror=a>"></noscript>`, `<noscript>&lt;p title="</noscript><img src=x >"></noscript>`],
    ["a tag left open is shown as words", `<p>hi</p><img src="x`, `<p>hi</p>&lt;img src="x`],
    ["a comment left open is shown as words", `<p>hi</p><!-- note`, `<p>hi</p>&lt;!-- note`],
    ["CDATA is shown as words", `<svg><![CDATA[x]]></svg>`, `<svg>&lt;![CDATA[x]]></svg>`],
    ["a base address shows as words", `<base href="https://evil.test/">`, `&lt;base href="https://evil.test/">`],
  ]
  for (const [name, input, want] of cases) {
    const got = guardSectionMarkup(input)
    check(name, got === want, { got, want })
  }
  const ordinary = [
    `<section class="hero"><h1>Hello &amp; welcome</h1><p>a &lt; b and 3 < 4, <3</p><a href="https://x.test/?a=1&amp;b=2">Go</a> <a href="mailto:a@b.co">Mail</a> <a href="tel:+40">Call</a> <a href="#faq">FAQ</a> <a href="/products">Shop</a></section>`,
    `<svg viewBox="0 0 24 24" aria-hidden="true"><title>Close</title><path d="M6 6l12 12" stroke="currentColor"/></svg>`,
    `<img src="https://cdn.test/a.png" alt="A > B" loading="lazy"><img src="data:image/png;base64,iVBORw0KGgo=" alt="">`,
    `<iframe src="https://www.youtube-nocookie.com/embed/x" allow="autoplay" allowfullscreen></iframe>`,
    `<form data-storelib-form="subscribe"><input type="email" name="email" required><textarea name="m">Hi there</textarea><button type="submit">Send</button></form>`,
    `<!-- a note --><ul><li>One</li><li data-x='{"a":1}'>Two</li></ul><br/><hr><!---->`,
    `plain words, no markup at all`,
  ]
  check("ordinary markup comes back as the very same string", ordinary.every((m) => guardSectionMarkup(m) === m), ordinary.find((m) => guardSectionMarkup(m) !== m))

  console.log("\nEvery section in the repository draws exactly as it did")
  const files = execSync(`find . -path ./node_modules -prune -o -name "*.storelib" -print`, { cwd: root }).toString().trim().split("\n").filter(Boolean)
  let drawn = 0
  const changed: string[] = []
  for (const f of files) {
    const compiled = compileSection(read(f), { file: `sections/${f.split("/").pop()}`, lenient: true } as never)
    if (compiled.ok !== true) continue
    const preset = (compiled.value.schema as { presets?: { settings?: object; blocks?: unknown[] }[] }).presets?.[0]
    const resolved = resolveInstance(compiled.value.schema, { settings: preset?.settings ?? {}, blocks: preset?.blocks ?? [], block_order: [] } as never, { assets: {} })
    const products = [0, 1, 2].map((i) => ({ id: `p${i}`, type: "product", settings: { title: `Product ${i} <b>&</b>`, url: `/products/p${i}`, price: "$5", image: "https://cdn.test/p.png" } }))
    const inner = stripDocumentMarkup(renderTemplate(compiled.value.template as CompiledTemplate, {
      settings: resolved.settings, blocks: resolved.blocks, theme: themeTokens({}), scheme: {}, page: { template: "index" }, products, section: { id: "s1", type: compiled.value.type }, assets: {},
    } as never))
    drawn++
    if (guardSectionMarkup(inner) !== inner) changed.push(f)
  }
  check(`all ${drawn} sections that compile (the built-in themes, the Developer Hub examples, the test themes) are left untouched`, drawn >= 40 && changed.length === 0, changed)

  console.log("\nWhere it runs")
  const render = read("lib/storelib-theme/render.ts")
  check("at the one place every section is drawn, after the document tags are taken out",
    /* The builder's setting marks (storelib/marks.ts) are turned into attributes first, so the guard sees the markup as it will be. */
    /const drawn = renderTemplate\(compiled\.template as CompiledTemplate, ctx, \{ marks: inEditor \}\)/.test(render) &&
      /const inner = guardSectionMarkup\(stripDocumentMarkup\(inEditor \? applySettingMarks\(drawn\) : drawn\)\)/.test(render))
  check("in the engine, so the builder's canvas draws the same thing the site does", /^export function guardSectionMarkup\(html: string\): string \{/m.test(read("lib/storelib-theme/storelib/raw-html.ts")))
  check("and a real browser is asked too", /guardSectionMarkup/.test(read("scripts/check-section-guard.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
