/**
 * GitHub sync, round Z4: a pushed file in the other format is taken or
 * converted instead of refused, AGENTS.md shows each folder's format with the
 * theme's own files, the two branch dead ends have one button each, and no
 * line a creator reads names another platform or its template language.
 *
 *   npx tsx tests/github-format-z4.test.ts
 */
import { readFileSync } from "node:fs"
import { exampleOf, fitToThemeFormat, folderExamples } from "../lib/github-sync/format"
import { agentsGuide, formatGuide } from "../lib/github-sync/core"
import { editorReport, plainWords } from "../lib/github-sync/editor-status"
import { isCompatSource, splitCompatFile, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
/** What a creator may never read: another platform, its template language, an em dash. */
const NAMED = /Shopify|Liquid|\u2014/

const native = `<template>
  <section class="strip" data-scheme="{{ settings.color_scheme }}">
    {% for block in blocks %}<img src="{{ block.settings.logo }}" alt="">{% endfor %}
  </section>
</template>

<style scoped>
.strip { display: flex; gap: 24px; }
</style>

<schema>
{ "name": "Logo strip", "settings": [{ "type": "color_scheme", "id": "color_scheme", "label": "Colours", "default": "scheme-1" }], "blocks": [{ "type": "logo", "name": "Logo", "settings": [{ "type": "image_picker", "id": "logo", "label": "Logo" }] }] }
</schema>
`

const theirSchema = { name: "Logo scroll strip", settings: [{ type: "text", id: "heading", label: "Heading", default: "As seen in" }] }
const original = `<div class="logo-strip">
  <h2>{{ section.settings.heading }}</h2>
  {% render 'logo-list' %}
</div>

{% schema %}
${JSON.stringify(theirSchema, null, 2)}
{% endschema %}
`

console.log("\nAn imported theme takes a Storelib section as it is (the refused file in the owner's screenshot)")
{
  const r = fitToThemeFormat("sections/logo_scroll_strip.storelib", native, { compat: true })
  check("taken, unchanged, no refusal", r.ok === true && (r as { text: string }).text === native && (r as { converted: boolean }).converted === false, r)
  const broken = fitToThemeFormat("sections/x.storelib", "<template>\n<div>{{ settings.missing }}</div>\n</template>\n", { compat: true })
  check("one with a mistake goes on to the checker that names the line, not a format refusal", broken.ok === true)
}

console.log("\nThe theme's original file is converted, losing nothing")
{
  const r = fitToThemeFormat("sections/logo_scroll_strip.storelib", original, { compat: true })
  const text = (r as { text: string }).text
  check("converted, and says so", r.ok === true && (r as { converted: boolean }).converted && /converted to this theme's format/.test(String((r as { note: string }).note)), r)
  check("  first line and </template> added", isCompatSource(text) && /\n<\/template>\n/.test(text))
  const split = splitCompatFile(text)
  check("  the markup is the original's, without the settings tag", split.markup.includes("{{ section.settings.heading }}") && split.markup.includes("{% render 'logo-list' %}") && !/schema/.test(split.markup))
  check("  the settings are the original's, under \"shopify\" in <schema>", JSON.stringify((split.schema as { shopify: unknown }).shopify) === JSON.stringify(theirSchema))
  const again = fitToThemeFormat("sections/logo_scroll_strip.storelib", text, { compat: true })
  check("  converting the result again changes nothing", again.ok === true && (again as { text: string }).text === text && !(again as { converted: boolean }).converted)
}
{
  const wrappedWithTag = `${wrapCompatTemplate(original.trimEnd())}\n`
  const r = fitToThemeFormat("sections/strip.storelib", wrappedWithTag, { compat: true })
  const split = splitCompatFile((r as { text: string }).text)
  check("first line kept, settings left as a tag inside: moved into <schema>", r.ok === true && (r as { converted: boolean }).converted && JSON.stringify((split.schema as { shopify: unknown }).shopify) === JSON.stringify(theirSchema) && !/endschema/.test(split.markup))
  const block = fitToThemeFormat("blocks/logo.storelib", original.replace("Logo scroll strip", "Logo"), { compat: true })
  check("a block the same way", block.ok === true && isCompatSource((block as { text: string }).text))
  const snippet = fitToThemeFormat("snippets/logo-list.storelib", "{% for l in section.blocks %}<img src=\"{{ l.settings.logo }}\">{% endfor %}\n", { compat: true })
  check("a snippet without the first line: wrapped", snippet.ok === true && isCompatSource((snippet as { text: string }).text) && (snippet as { converted: boolean }).converted)
  const fine = `${wrapCompatTemplate("<div>{{ section.settings.heading }}</div>")}\n\n<schema>\n${JSON.stringify({ shopify: theirSchema })}\n</schema>\n`
  const kept = fitToThemeFormat("sections/strip.storelib", fine, { compat: true })
  check("a file already in the theme's format is kept byte for byte", kept.ok === true && (kept as { text: string }).text === fine && !(kept as { converted: boolean }).converted)
}

console.log("\nRefused only when it cannot be read, in words a creator can act on")
{
  const badJson = fitToThemeFormat("sections/strip.storelib", original.replace('"name"', "name"), { compat: true })
  check("a settings tag that is not JSON: refused, saying so", badJson.ok === false && /not valid JSON/.test((badJson as { error: string }).error))
  const plain = fitToThemeFormat("sections/notes.storelib", "just some words", { compat: true })
  check("words that are no format at all: refused with the exact first line and layout", plain.ok === false && /<template compat="shopify">/.test((plain as { error: string }).error) && /<\/template>/.test((plain as { error: string }).error))
  const nativeBlock = fitToThemeFormat("blocks/logo.storelib", native, { compat: true })
  check("a Storelib-format block in an imported theme: refused, the theme draws blocks in its own format", nativeBlock.ok === false)
  const intoNative = fitToThemeFormat("sections/hero.storelib", `${wrapCompatTemplate("<div></div>")}\n`, { compat: false })
  check("the imported format pushed to a Storelib theme: refused, saying how to write it", intoNative.ok === false && /Write it as a Storelib section/.test((intoNative as { error: string }).error))
  const nativeOk = fitToThemeFormat("sections/hero.storelib", native, { compat: false })
  check("a Storelib section in a Storelib theme: as it is", nativeOk.ok === true && (nativeOk as { text: string }).text === native)
  for (const r of [plain, nativeBlock, intoNative, badJson]) {
    const said = plainWords((r as { error: string }).error, 600)
    check(`  as the builder says it: no platform, no attribute (${said.slice(0, 60)}…)`, !NAMED.test(said) && !/compat=/.test(said) && !/"shopify"/.test(said), said)
  }
}

console.log("\nThe builder's list says what to change")
{
  const report = editorReport({ repo_full_name: "a/b", branch: "main", root_path: "", last_error: "x", sync_state: { last: { at: "2026-10-18T00:00:00Z", direction: "from_github", commit: null, ok: false, saved: [], notes: [], failed: [{ path: "sections/notes.storelib", error: (fitToThemeFormat("sections/notes.storelib", "just words", { compat: true }) as { error: string }).error, kind: "wrong-kind" }] } } } as never)!
  const f = report.files[0]
  check("titled as this theme's format, with the fix in the detail", f.title === "Not in this theme's format" && !!f.detail && /first line/.test(String(f.detail)), f)
  check("  no platform or language named anywhere in it", !NAMED.test(JSON.stringify(report)))
  const protectedBranch = editorReport({ repo_full_name: "a/b", branch: "main", root_path: "", last_error: "x", sync_state: { last: { at: "2026-10-18T00:00:00Z", direction: "to_github", commit: null, ok: false, saved: [], notes: [], failed: [], problem: "branch-protected" } } } as never)!
  check("a protected branch: the first action sends the site to a storelib branch", protectedBranch.problem?.actions[0] === "branch" && /storelib/.test(protectedBranch.problem?.body ?? ""))
}

console.log("\nAGENTS.md: each folder's exact format, with this theme's own files")
{
  const compatFiles: Record<string, string> = {
    "sections/big.storelib": `${wrapCompatTemplate(Array.from({ length: 40 }, (_, i) => `<p>{{ section.settings.t${i} }}</p>`).join("\n"))}\n\n<schema>\n${JSON.stringify({ name: "Big", settings: Array.from({ length: 9 }, (_, i) => ({ type: "text", id: `t${i}`, label: `T${i}` })), shopify: { name: "Big", settings: Array.from({ length: 9 }, (_, i) => ({ type: "text", id: `t${i}`, label: `T${i}` })) } })}\n</schema>\n`,
    "sections/small.storelib": `${wrapCompatTemplate("<div class=\"s\">\n  {{ section.settings.heading }}\n</div>")}\n\n<schema>\n${JSON.stringify({ name: "Small", settings: [], shopify: theirSchema })}\n</schema>\n`,
    "sections/native.storelib": native,
    "blocks/logo.storelib": `${wrapCompatTemplate("<img src=\"{{ block.settings.logo }}\">\n<span>{{ block.settings.alt }}</span>\n<i></i>")}\n\n<schema>\n${JSON.stringify({ shopify: { name: "Logo", settings: [{ type: "image_picker", id: "logo", label: "Logo" }] } })}\n</schema>\n`,
    "snippets/icon.storelib": `${wrapCompatTemplate("<svg>\n<path d=\"M0 0\"/>\n</svg>")}\n`,
  }
  const ex = folderExamples(compatFiles, true, { path: "templates/about.json", text: '{\n  "sections": { "a": { "type": "small", "settings": {} } },\n  "order": ["a"]\n}\n' })
  check("one example per folder, the shortest file in the theme's format", ex.find((e) => e.folder === "sections")?.path === "sections/small.storelib" && ex.find((e) => e.folder === "blocks")?.path === "blocks/logo.storelib" && ex.find((e) => e.folder === "snippets")?.path === "snippets/icon.storelib" && ex.some((e) => e.folder === "templates"), ex.map((e) => e.path))
  const big = exampleOf(compatFiles["sections/big.storelib"], true)
  check("a long file is shortened: first lines, a few settings, said to be shortened", big.abridged && big.text.split("\n").length < 50 && /the rest of the markup/.test(big.text) && (JSON.parse(/<schema>\s*([\s\S]*?)\s*<\/schema>/.exec(big.text)![1]).shopify.settings as unknown[]).length === 3)
  const guide = agentsGuide({ siteName: "Maya", branch: "main", root: "", kind: "shopify", examples: ex })
  check("the imported guide has the format section with the real example", /## The format of each folder/.test(guide) && guide.includes("`sections/small.storelib`") && guide.includes('<template compat="shopify">\n<div class="s">'))
  check("  line 1 said exactly, and where the schema goes", /Line 1 is exactly `<template compat="shopify">`/.test(guide) && /write only `"shopify"`/.test(guide))
  check("  what a push is checked for", /### What a push is checked for/.test(guide) && /is converted by Storelib into this format/.test(guide))
  check("  no platform or language named, no em dash", !NAMED.test(guide), (guide.match(NAMED) ?? [])[0])
  const nativeGuide = agentsGuide({ siteName: "Astrid", branch: "main", root: "", kind: "storelib", examples: folderExamples({ "sections/native.storelib": native }, false) })
  check("a Storelib theme's guide: its own section as the example, no platform named", nativeGuide.includes("`sections/native.storelib`") && /`<template>` with the markup, `<style scoped>`/.test(nativeGuide) && !NAMED.test(nativeGuide), (nativeGuide.match(NAMED) ?? [])[0])
  check("without examples it still says each format", /### blocks\/<type>\.storelib/.test(formatGuide({ imported: true })))
  const readme = read("lib/github-sync/layout.ts")
  check("README's rows for a Storelib theme name no platform", !/in Shopify's shape|in Shopify's format/.test(readme))
}

console.log("\nWired")
{
  const sync = read("lib/github-sync/sync.ts")
  check("the push loop fits each source to the theme's format before saving", /const fitted = fitToThemeFormat\(f\.path, text, compat\)/.test(sync) && /text = fitted\.text/.test(sync))
  check("  the old blanket refusal of a Storelib section in an imported theme is gone", !/this is an imported theme, so its files start with/.test(sync))
  check("  Recent says which files were converted", /converted to this theme's format\.` : ""/.test(sync))
  check("  AGENTS.md is written with the theme's own examples", /agentsGuide\(\{[^}]*examples \}\)/.test(sync))
  const route = read("app/api/website-builder/themes/[installId]/github/route.ts")
  check("the route follows another branch and sends or takes it", /body\.action === "use-branch"/.test(route) && /validBranch\(next\)/.test(route) && /then === "pull"/.test(route))
  check("  and tells the panel about an unread branch and a protected one", /ignored: link\.sync_state\?\.ignored/.test(route) && /problem: last && last\.ok === false/.test(route))
  const notice = read("components/website-builder/github-sync-notice.tsx")
  check("the builder's notice offers Follow on an unread branch", /primary: \{ label: ACTION_LABEL\.follow, run: \(\) => void run\("follow"\) \}/.test(notice))
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("  and the editor runs both actions", /action: "use-branch", branch: "storelib", then: "push"/.test(page) && /action: "use-branch", branch: syncStatus\.github\.ignored\.branch, then: "pull"/.test(page))
  const panel = read("components/website-builder/github-sync-panel.tsx")
  check("Connections: Use a storelib branch, Follow the branch, words made plain", /Use a storelib branch/.test(panel) && /Follow \{branch\}/.test(panel) && /plainWords\(ev\.summary\)/.test(panel) && /plainWords\(f\.error, 400\)/.test(panel))
  check("Recent: five, a fade, Show all, an animated height", /export const RECENT_SHOWN = 5/.test(panel) && /maskImage:/.test(panel) && /transition-\[max-height/.test(panel) && /Show all \{n\}/.test(panel) && /Show less/.test(panel) && /aria-expanded=\{open\}/.test(panel))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
