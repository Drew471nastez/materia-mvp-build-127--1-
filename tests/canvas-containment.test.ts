/**
 * ===========================================================================
 *  NOTHING A SECTION DRAWS LEAVES THE CANVAS
 * ===========================================================================
 * An agent-written header opened its menu with `position: fixed; inset: 0`
 * and covered the whole editor. The layers that stop that, each held here:
 *
 *   the section compiler   vh/vw become the canvas's, width media queries
 *                          become container queries, `:popover-open` and
 *                          `:modal` also match a pop-up opened in place;
 *   the template           tags that act on the whole document (<style>,
 *                          <link>, <base>, <meta>) are refused on save and
 *                          stripped from anything saved before;
 *   the editor             the canvas card contains fixed positioning and
 *                          paint, and a guard opens pop-ups in place instead
 *                          of in the browser's top layer.
 *
 * The geometry itself is measured in a browser by
 * scripts/check-canvas-containment.mjs.
 */
import { readFileSync } from "node:fs"
import { canvasSafeUnits, canvasSafeSelector, widthQueryAsContainer, scopeCss } from "../lib/storelib-theme/storelib/css"
import { stripDocumentMarkup } from "../lib/storelib-theme/storelib/template"
import { compileSection } from "../lib/storelib-theme/storelib/compile"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const file = (template: string, css = ".x { color: red; }") =>
  `<template>\n<div class="x">${template}</div>\n</template>\n<style>\n${css}\n</style>\n<schema>\n{"type":"t","name":"T","category":"Content","settings":[],"presets":[{"name":"T"}]}\n</schema>\n`

section("The window a section sees is the canvas")
{
  check("100vh becomes the canvas's height", canvasSafeUnits("100vh") === "calc(100 * var(--sl-vh, 1vh))", canvasSafeUnits("100vh"))
  check("100vw becomes the canvas's width", canvasSafeUnits("100vw") === "calc(100 * var(--sl-vw, 1vw))")
  check("dvh keeps its own unit as the live fallback", canvasSafeUnits("100dvh") === "calc(100 * var(--sl-vh, 1dvh))")
  check("inside calc and with other values", canvasSafeUnits("calc(100vh - 64px) 50vw") === "calc(calc(100 * var(--sl-vh, 1vh)) - 64px) calc(50 * var(--sl-vw, 1vw))")
  check("vmin is the smaller of the two", canvasSafeUnits("10vmin") === "calc(10 * min(var(--sl-vw, 1vw), var(--sl-vh, 1vh)))")
  check("a class or a url that only looks like a unit is left alone", canvasSafeUnits("url(/a-100vh.png)") === "url(/a-100vh.png)" && canvasSafeUnits("var(--h100vh)") === "var(--h100vh)")
  check("a width media query becomes a container query", widthQueryAsContainer("(max-width: 767px)") === "(max-width: 767px)")
  check("with `only screen and` in front", widthQueryAsContainer("only screen and (min-width: 768px)") === "(min-width: 768px)")
  check("range syntax too", widthQueryAsContainer("(width >= 768px)") === "(width >= 768px)")
  check("a query about motion stays a media query", widthQueryAsContainer("(prefers-reduced-motion: reduce)") === null)
  check("so does one that mixes width with hover", widthQueryAsContainer("(min-width: 768px) and (hover: hover)") === null)
  check("and a list, and print", widthQueryAsContainer("(max-width: 1px), print") === null && widthQueryAsContainer("print") === null)
  const scoped = scopeCss("@media (max-width: 767px) { .a { height: 100vh } } @media (prefers-reduced-motion: reduce) { .a { transition: none } }", { type: "t" })
  check("the compiler applies both", scoped.ok === true && /@container \(max-width: 767px\)/.test(scoped.value) && /@media \(prefers-reduced-motion: reduce\)/.test(scoped.value) && scoped.value.includes("var(--sl-vh, 1vh)"), scoped.ok ? scoped.value : "")
}

section("A pop-up opened in place still gets its open styles")
{
  check(":popover-open also matches the in-place mark", canvasSafeSelector(".m:popover-open") === ".m:is(:popover-open, [data-sl-open])")
  check(":modal too", canvasSafeSelector("dialog:modal") === "dialog:is(:modal, [data-sl-open])")
  check("::backdrop and a class named modal are left alone", canvasSafeSelector(".modal::backdrop") === ".modal::backdrop")
  const scoped = scopeCss(".menu:popover-open { display: grid }", { type: "t" })
  check("the compiler applies it after scoping", scoped.ok === true && scoped.value.includes(":is(:popover-open, [data-sl-open])"), scoped.ok ? scoped.value : "")
}

section("Tags that act on the whole document")
{
  for (const [tag, markup] of [
    ["<style>", "<style>body{display:none}</style>"],
    ["<link>", `<link rel="stylesheet" href="https://example.com/a.css">`],
    ["<base>", `<base href="https://example.com/">`],
    ["<meta>", `<meta http-equiv="refresh" content="0;url=https://example.com">`],
  ] as const) {
    const r = compileSection(file(markup), { file: "sections/t.storelib" })
    const message = r.ok === false ? r.errors[0].message : "accepted"
    check(`a save refuses ${tag}`, message.includes(tag), message)
  }
  const saved = compileSection(file("<style>body{display:none}</style><p>kept</p>"), { file: "sections/t.storelib", lenient: true })
  check("a file saved before the rule still compiles when drawn", saved.ok === true)
  check("<style> is stripped with what is in it", stripDocumentMarkup("<p>a</p><style>body{}</style><p>b</p>") === "<p>a</p><p>b</p>")
  check("an unclosed <style> takes nothing after it with it into the page", stripDocumentMarkup("<p>a</p><style>body{}") === "<p>a</p>")
  check("an <svg> <style> too", stripDocumentMarkup("<svg><style>*{}</style></svg>") === "<svg></svg>")
  check("<link>, <base> and <meta> are stripped", stripDocumentMarkup(`<link rel="x"><base href="/"><meta name="a"><p>c</p>`) === "<p>c</p>")
  check("markup without them is returned as it was", stripDocumentMarkup("<p>linked metadata</p>") === "<p>linked metadata</p>")
  check("popovers stay allowed: they open in place in the canvas", compileSection(file(`<button popovertarget="m">Menu</button><div popover id="m">Links</div>`), { file: "sections/t.storelib" }).ok === true)
}

section("The editor contains the canvas")
{
  const css = readFileSync("app/globals.css", "utf8")
  const frame = css.match(/\.wb-canvas-frame \{[^}]*\}/)?.[0] ?? ""
  check("the canvas card contains fixed positioning and paint", /contain:\s*layout paint/.test(frame), frame)
  check("its size answers vh and vw", /container:\s*wb-canvas \/ size/.test(frame) && frame.includes("--sl-vh: 1cqh") && frame.includes("--sl-vw: 1cqw"))
  check("and it keeps any z-index inside it", /isolation:\s*isolate/.test(frame))
  const page = readFileSync("app/(storelib)/website-builder/editor/[installId]/page.tsx", "utf8")
  check("the editor's canvas card carries the class", /"wb-canvas-frame /.test(page))
  check("and mounts the pop-up guard", page.includes("<CanvasTopLayerGuard />"))
  const guard = readFileSync("components/website-builder/canvas-top-layer.tsx", "utf8")
  check("the guard acts only inside the canvas", guard.includes(`const FRAME = ".wb-canvas-frame"`) && guard.includes("beforetoggle"))
  const section = readFileSync("components/website-builder/sections/StorelibSection.tsx", "utf8")
  check("a section clips sideways only, so a dropdown hangs below its header", section.includes(`className="relative overflow-x-clip"`) && !section.includes(`className="relative overflow-hidden"`))
  check("a section with a menu open is lifted over the next", /:where\(\[data-section\]:has\(\[data-sl-open\]/.test(css))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
