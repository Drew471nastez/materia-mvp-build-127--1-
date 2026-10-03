/**
 * ===========================================================================
 *  THE FIVE THINGS A SECTION SYSTEM HAS TO GET RIGHT TO BE LEFT ALONE
 * ===========================================================================
 * Error boundaries, colour schemes, responsive rules, resource limits, and
 * the assistant writing a section that compiles before it is kept. Each was
 * either missing or only half enforced, and each is the kind of thing nobody
 * reports as a bug: they just quietly make a builder unpleasant to trust.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { compileSection, renderSection } from "../lib/storelib-theme"
import { themeTokens } from "@/lib/storelib-theme/resolve"
import { takenNote, unfence, writeSectionSystem } from "@/lib/website-builder/agent/write-section"
import { CONTROL_TYPES } from "@/lib/storelib-theme/controls/registry"
import { FILTER_NAMES } from "@/lib/storelib-theme/storelib/template"
import { LIMITS } from "@/lib/storelib-theme/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/** The starter, built the way the code editor builds it, for type "mine". */
function starterSource(): string {
  const page = read("app/website-builder/code/[installId]/page.tsx")
  const body = page.slice(page.indexOf("const starterFor"), page.indexOf('if (path.endsWith(".storelib")) return'))
  const arr = body.slice(body.indexOf("return ["), body.lastIndexOf('].join("\\n")') + 13)
  // eslint-disable-next-line no-eval
  return eval(`(() => { const type = "mine"; const name = "Mine"; ${arr} })()`) as string
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("One broken section is one broken section")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const boundary = read("components/website-builder/sections/SectionErrorBoundary.tsx")
    const dispatcher = read("components/website-builder/sections/SectionRenderer.tsx")
    check("there is a boundary, and it is a class, because React has no hook for one", /class SectionErrorBoundary extends Component/.test(boundary) && /getDerivedStateFromError/.test(boundary))
    check("every section goes behind it, at the one place they all go through", (dispatcher.match(/guard\(<Component \{\.\.\.props\} \/>\)/g) ?? []).length === 2)
    check("a visitor gets a gap, not a stack trace", /if \(!this\.props\.isEditing\) return null/.test(boundary))
    check("the creator gets the section named and the reason", /could not be drawn/.test(boundary) && /\{error\.message \|\| String\(error\)\}/.test(boundary))
    check("and a way to try it again after fixing the setting that caused it", /Try again/.test(boundary) && /attempt: s\.attempt \+ 1/.test(boundary))
    /**
     * Without this a section that threw kept its error card for as long as
     * the boundary was mounted, so fixing the setting left the card there and
     * the only way back was a refresh.
     */
    check("a new section is not the old one's failure", /componentDidUpdate\(prev: Props\)/.test(boundary) && /this\.setState\(\{ error: null \}\)/.test(boundary))
    check("the failure is logged for the creator only", /if \(this\.props\.isEditing && typeof console/.test(boundary))
    // Measured in a real browser, where boundaries actually run.
    check("and it is measured in a browser, because server rendering does not use boundaries", /react-dom\/client/.test(read("scripts/render-boundary-probe.tsx")) && /check-error-boundary\.mjs/.test(read("scripts/check-error-boundary.mjs")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A section you write takes the site's colours and fits a phone")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const src = starterSource()
    const c = compileSection(src, { file: "sections/mine.storelib", expectType: "mine" })
    check("the starter compiles", c.ok === true, c.ok === false ? c.errors.map((e) => e.message).join("; ") : "")
    if (c.ok === true) {
      const ids = c.value.schema.settings.map((s) => s.id)
      check("it declares a colour scheme, so the section is not stranded when the palette changes", ids.includes("color_scheme"))
      check("and its padding is a setting, not a number in the code", ids.includes("padding_top") && ids.includes("padding_bottom"))
      const draw = (scheme: string) =>
        renderSection({
          compiled: c.value, id: "m1",
          instance: { type: "mine", settings: { color_scheme: scheme }, blocks: {}, block_order: [] } as never,
          theme: {}, page: { template: "index" },
        })
      const white = draw("white").html.match(/--bg:\s*([^;]+);/)?.[1]
      const dark = draw("dark").html.match(/--bg:\s*([^;]+);/)?.[1]
      check("and the colours actually change with it", !!white && !!dark && white !== dark, `${white} against ${dark}`)
      const css = draw("white").css
      check("the phone layout is the base, with tablet and desktop above it", /@container \(min-width: 640px\)/.test(css) && /@container \(min-width: 1024px\)/.test(css))
      /**
       * Container queries, not viewport ones: a section is as wide as the
       * column it is in, and in the builder's phone preview that is not the
       * width of the window.
       */
      check("they ask how wide the section is, not how wide the window is", /container-type: inline-size/.test(css) && !/@media \(min-width/.test(css))
      check("its heading has a real font stack behind the theme's font", /ui-sans-serif, system-ui, sans-serif/.test(css))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every section the theme ships answers to the colour scheme")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const dir = join(root, "themes/default/sections")
    const files = readdirSync(dir).filter((f) => f.endsWith(".storelib"))
    const noSetting = files.filter((f) => !/"color_scheme"/.test(readFileSync(join(dir, f), "utf8")))
    const noUse = files.filter((f) => !/scheme\./.test(readFileSync(join(dir, f), "utf8")))
    check(`all ${files.length} declare one`, noSetting.length === 0, noSetting.join(", "))
    check("and all of them read its colours rather than hardcoding any", noUse.length === 0, noUse.join(", "))
    // The proof it is wired, not just present: two schemes, two backgrounds.
    const faq = compileSection(readFileSync(join(dir, "faq_accordion.storelib"), "utf8"), { file: "sections/faq_accordion.storelib" })
    check("and a shipped section really changes with it", (() => {
      if (faq.ok === false) return false
      const at = (s: string) =>
        renderSection({
          compiled: faq.value, id: "f1",
          instance: { type: "faq_accordion", settings: { color_scheme: s }, blocks: {}, block_order: [] } as never,
          theme: {}, page: { template: "index" },
        }).html.match(/--s-bg:\s*([^;]+);/)?.[1]
      return !!at("white") && at("white") !== at("dark")
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The ceilings are enforced where people actually edit")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * All of these existed and were checked when a theme was IMPORTED as a
   * package, and nowhere on the path the editor and the assistant use: a page
   * could be grown past any of them one section at a time.
   */
  {
    const sections = read("app/api/website-builder/themes/[installId]/sections/route.ts")
    /* The route delegates its save to the module the agent API shares. */
    const files = read("app/api/website-builder/themes/[installId]/files/route.ts") + read("lib/website-builder/save-theme-file.ts")
    check("a page cannot be grown past its section limit", /sections\.length > LIMITS\.sectionsPerTemplate/.test(sections) && /status: 413/.test(sections))
    check("nor a section past its block limit, counted at every depth", /blockTreeProblem\(s\)/.test(sections) && /LIMITS\.blocksPerSection/.test(read("lib/website-builder/block-tree.ts")))
    check("nor a theme past its file limit", /LIMITS\.filesPerPackage/.test(files) && /status: 413/.test(files))
    check("and editing an existing file is not what the file limit is for", /if \(!current\) \{\s*const \{ count \}/.test(files))
    check("the numbers are the ones the exporter uses, not a second set", LIMITS.sectionsPerTemplate === 60 && LIMITS.blocksPerSection === 50 && LIMITS.filesPerPackage === 2000)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Ask it to write a section, and what comes back is compiled first")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const writer = read("lib/website-builder/agent/write-section.ts")
    const route = read("app/api/website-builder/themes/[installId]/sections/code/route.ts")
    const chat = read("components/website-builder/theme-chat.tsx")

    /* The same text for every website: what this one has already taken is said in the request (takenNote). */
    const system = writeSectionSystem()
    const taken = takenNote(["Northlight Plans"], ["northlight_plans"])
    /**
     * The wording of these moved into lib/storelib-ai, which every surface and
     * both providers compose from. What is asserted is that the facts still
     * REACH the model, not which file the sentence is typed in.
     */
    check("the model is told the language is not Vue or JSX", /NOT VUE, REACT OR JSX/i.test(system) && /v-if/.test(system))
    check("and every filter and setting type it may use", FILTER_NAMES.every((f) => system.includes(f)) && CONTROL_TYPES.every((c) => system.includes(c)))
    check("that repeated content is blocks, not question_1 and question_2", /question_1/.test(system) && /blocks/.test(system))
    check("that it must take the site's colours", /color_scheme/.test(system) && /Never hardcode a hex value/.test(system))
    check("that it must be responsive with container queries, not media ones", /@container \(min-width: 640px\)/.test(system) && /NOT MEDIA QUERIES/i.test(system))
    check("and that it must not break when the section is used twice", /A SECTION CAN BE ON A PAGE MORE THAN ONCE/.test(system))
    check("and that it is held to a quality contract that is actually checked", /you will be shown what failed/.test(system))
    check(
      "and what names are already taken here, in the request rather than the cached prefix",
      taken.includes("northlight_plans") && taken.includes("Northlight Plans") && !system.includes("Northlight Plans") && /takenNote\(opts\.takenNames, opts\.takenTypes\),\n\s*asked && `REQUEST/.test(writer),
    )

    check("a fence is stripped, because they add one anyway", unfence("```storelib\n<template>x</template>\n```") === "<template>x</template>")
    check("and a plain answer is left alone", unfence("  <template>x</template>  ") === "<template>x</template>")

    check(
      "what comes back is compiled AND checked before it is kept",
      /validateSection\(text, \{ path, expectType: type(, strict: true)? \}\)/.test(writer),
    )
    check(
      "it gets three attempts with the errors quoted back, not one",
      /validateSection\(text, \{ path, expectType: type(, strict: true)? \}\)/.test(writer) && /attempt < MAX_REPAIR_ATTEMPTS/.test(writer),
    )
    check("a type that is already here is refused", /is already a section here/.test(writer))
    check("and so is a name that is already here", /Another section is already called/.test(writer))
    /**
     * The whole point: a file the model wrote is not different from a file a
     * person wrote. It goes into the draft half, with a version row, and is
     * not on anybody's page until the creator puts it there.
     */
    check("it is saved as a draft, like any other save", /await saveDraft\(supabase, installId, written\.value\.path, written\.value\.source\)/.test(route))
    check("with a version beside it", /await recordVersion\(supabase, installId, written\.value\.path/.test(route))
    check("nothing puts it on a page", !/store_theme_pages/.test(route))
    check("and the creator's own client reads what is already there, so RLS decides", /const supabase = await createClient\(\)/.test(route) && !/createAdminClient/.test(route))

    /* Two words a side now, so the row is one row on a 360px phone (components/website-builder/ask-parts.tsx). */
    const parts = read("components/website-builder/ask-parts.tsx")
    const suggest = read("lib/website-builder/ask-suggestions.ts")
    check("the chat asks which of the two things is wanted", /\["change", "Change page"\]/.test(parts) && /\["code", "Code section"\]/.test(parts) && /<ModeSwitch/.test(chat))
    check(
      "with suggestions the library does not already cover, and not ones the page already has",
      /if \(ctx\.mode === "code"\) picked = toCode\(ctx\)/.test(suggest) && /A comparison table of my plans/.test(suggest) &&
        /ideas\.filter\(\(\[, taken\]\) => !types\.some\(\(t\) => taken\.test\(t\)\)\)/.test(suggest),
    )
    check("and the written section opens in the code editor to be read", /onOpenCodeEditor\(written\.path\)/.test(chat))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Pictures, within the rule that says no server-side transforms")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * Supabase meters image transformations and this account has already hit
   * the cap, so resizing on the server is not available at any price anybody
   * wants to pay — see tests/no-image-transforms.test.ts. What is left is
   * free and is what browsers are for: say which images matter, say which do
   * not, and reserve the space either way.
   */
  {
    const dir = join(root, "themes/default/sections")
    const files = readdirSync(dir).filter((f) => f.endsWith(".storelib"))
    const withImg = files.filter((f) => /<img/.test(readFileSync(join(dir, f), "utf8")))

    const unsaid = withImg.filter((f) =>
      (readFileSync(join(dir, f), "utf8").match(/<img[^>]*>/g) ?? []).some((t) => !/loading=/.test(t)),
    )
    check("every image says whether it is worth waiting for", unsaid.length === 0, unsaid.join(", "))

    /**
     * A hero's picture IS the largest paint. Lazy loading it asks the browser
     * to wait before fetching the one thing the page is measured on, which is
     * slower, not faster — and the retired hero was doing exactly that.
     */
    const heroes = files.filter((f) => /^hero/.test(f))
    const lazyHero = heroes.filter((f) => {
      const tags = readFileSync(join(dir, f), "utf8").match(/<img[^>]*>/g) ?? []
      return tags.some((t) => /loading="lazy"/.test(t))
    })
    check("no hero lazy-loads its own picture", lazyHero.length === 0, lazyHero.join(", "))
    const noPriority = heroes.filter((f) => {
      const text = readFileSync(join(dir, f), "utf8")
      return /<img/.test(text) && !/fetchpriority="high"/.test(text)
    })
    check("and every hero that has one asks for it first", noPriority.length === 0, noPriority.join(", "))

    check("nothing reaches for a metered transform", !withImg.some((f) => /render\/image\/public/.test(readFileSync(join(dir, f), "utf8"))))

    /**
     * Measured, not asserted: scripts/check-layout-shift.mjs renders every
     * section with an image twice, once with the pictures unable to load and
     * once with them loaded, and compares the heights. 16 of 16 hold at
     * 1100px and at 390px. Two did not before this: about_timeline grew
     * 720px, and proof_logos rewrapped by 56px on a phone.
     */
    check("the two that used to jump now reserve their space", (() => {
      const timeline = readFileSync(join(dir, "about_timeline.storelib"), "utf8")
      const logos = readFileSync(join(dir, "proof_logos.storelib"), "utf8")
      return /\.tl__img \{[\s\S]*?aspect-ratio: 4 \/ 3/.test(timeline) && /\.lr img \{[\s\S]*?aspect-ratio: 3 \/ 1/.test(logos)
    })())
    check("and there is a probe that would catch the next one", /check-layout-shift\.mjs/.test(read("scripts/check-layout-shift.mjs")) && /hold their height when the pictures arrive/.test(read("scripts/check-layout-shift.mjs")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
